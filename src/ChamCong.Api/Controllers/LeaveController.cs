using ClosedXML.Excel;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/companies/{companyId}/leave")]
[Authorize(Policy = "RequireHR")]
public class LeaveController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;
    private readonly ILeaveService _leaveService;

    public LeaveController(AppDbContext db, AccessService access, AuditService audit, ILeaveService leaveService)
    {
        _db = db;
        _access = access;
        _audit = audit;
        _leaveService = leaveService;
    }

    // ===============================================
    // 1. LEAVE REQUESTS (Ngoại lệ nghỉ phép đã duyệt)
    // ===============================================
    public record LeaveRequestDto(
        int Id,
        int CompanyId,
        int EmployeeId,
        string EmployeeCode,
        string FullName,
        DateTime Date,
        string Code,
        string? Reason,
        string Source,
        string CreatedBy,
        DateTime CreatedAt);

    public record SaveLeaveRequestDto(
        int EmployeeId,
        DateTime Date,
        string Code,
        string? Reason);

    [HttpGet("requests")]
    public async Task<IActionResult> GetRequests(int companyId, [FromQuery] DateTime from, [FromQuery] DateTime to, CancellationToken ct)
    {
        _access.EnsureStaffOrAbove();
        await _access.EnsureCompanyAsync(companyId, ct);

        var list = await _db.LeaveRequests
            .AsNoTracking()
            .Where(l => l.CompanyId == companyId && l.Date >= from.Date && l.Date <= to.Date)
            .OrderBy(l => l.Date)
            .ToListAsync(ct);

        var empIds = list.Select(l => l.EmployeeId).Distinct().ToList();
        var empMap = await _db.Employees.AsNoTracking().Where(e => empIds.Contains(e.Id)).ToDictionaryAsync(e => e.Id, ct);

        var dtos = list.Select(l =>
        {
            empMap.TryGetValue(l.EmployeeId, out var emp);
            return new LeaveRequestDto(
                l.Id,
                l.CompanyId,
                l.EmployeeId,
                emp?.EmployeeCode ?? "",
                emp?.FullName ?? "",
                l.Date,
                l.Code,
                l.Reason,
                l.Source,
                l.CreatedBy,
                l.CreatedAt
            );
        }).ToList();

        return Ok(dtos);
    }

    [HttpPost("requests")]
    public async Task<IActionResult> CreateRequest(int companyId, [FromBody] SaveLeaveRequestDto dto, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _access.GetEmployeeAsync(dto.EmployeeId, ct);
        var date = dto.Date.Date;
        var code = Text.Required(dto.Code, "Mã nghỉ phép", 10).ToUpperInvariant();
        if (code == "1/2P") code = "P/2";

        if (!await _db.AttendanceCodes.AnyAsync(c => c.CompanyId == companyId && c.Code == code, ct))
        {
            return BadRequest(new { message = $"Mã nghỉ phép '{code}' không có trong Bảng quy chuẩn của hội sở." });
        }

        if (code.StartsWith("P", StringComparison.OrdinalIgnoreCase))
        {
            decimal days = code == "P/2" ? 0.5m : 1.0m;
            await _leaveService.ValidateLeaveRequestAllowedAsync(emp.Id, code, days, date, companyId, ct);
        }

        var existing = await _db.LeaveRequests.FirstOrDefaultAsync(l => l.EmployeeId == dto.EmployeeId && l.Date == date, ct);
        if (existing != null)
        {
            existing.Code = code;
            existing.Reason = Text.Clean(dto.Reason, 500);
            existing.Source = "MANUAL";
        }
        else
        {
            _db.LeaveRequests.Add(new LeaveRequest
            {
                CompanyId = companyId,
                EmployeeId = dto.EmployeeId,
                Date = date,
                Code = code,
                Reason = Text.Clean(dto.Reason, 500),
                Source = "MANUAL",
                CreatedBy = _access.Username,
                CreatedAt = DateTime.Now
            });
        }

        _audit.Log("LeaveRequest", dto.EmployeeId, "SaveRequest", new { emp = emp.EmployeeCode, date, code }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Lưu đơn nghỉ phép thành công." });
    }

    [HttpDelete("requests/{id}")]
    public async Task<IActionResult> DeleteRequest(int companyId, int id, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);
        var req = await _db.LeaveRequests.FirstOrDefaultAsync(l => l.Id == id && l.CompanyId == companyId, ct);
        if (req == null) return NotFound();

        if (req.Code.StartsWith("P", StringComparison.OrdinalIgnoreCase))
        {
            var ledger = await _db.LeaveLedger
                .Where(l => l.EmployeeId == req.EmployeeId && l.Date == req.Date && l.Year == (short)req.Date.Year && l.Amount < 0 && l.Fund == "ANNUAL")
                .FirstOrDefaultAsync(ct);
            if (ledger != null)
            {
                _db.LeaveLedger.Remove(ledger);
            }
        }

        _db.LeaveRequests.Remove(req);
        _audit.Log("LeaveRequest", req.Id, "DeleteRequest", $"Xóa đơn nghỉ ngày {req.Date:dd/MM/yyyy}", companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã xóa đơn nghỉ phép." });
    }

    [HttpPost("requests/import-excel")]
    public async Task<IActionResult> ImportRequestsExcel(int companyId, IFormFile file, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);

        using var stream = file.OpenReadStream();
        using var workbook = new XLWorkbook(stream);
        var ws = workbook.Worksheets.First();

        var empList = await _db.Employees.AsNoTracking().Where(e => e.CompanyId == companyId).ToListAsync(ct);
        var emps = empList
            .GroupBy(e => e.EmployeeCode, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var codes = (await _db.AttendanceCodes.AsNoTracking().Where(c => c.CompanyId == companyId).Select(c => c.Code).ToListAsync(ct)).ToHashSet();

        int importedCount = 0;
        var errors = new List<string>();

        int lastRow = ws.LastRowUsed()?.RowNumber() ?? 1;
        for (int r = 2; r <= lastRow; r++)
        {
            var empCode = ws.Cell(r, 1).GetString().Trim();
            var dateVal = ws.Cell(r, 2).Value;
            var code = ws.Cell(r, 3).GetString().Trim().ToUpperInvariant();
            var reason = ws.Cell(r, 4).GetString().Trim();

            if (string.IsNullOrEmpty(empCode) || string.IsNullOrEmpty(code)) continue;

            if (!emps.TryGetValue(empCode, out var emp))
            {
                errors.Add($"Dòng {r}: Không tìm thấy nhân viên mã '{empCode}'.");
                continue;
            }

            if (!codes.Contains(code))
            {
                errors.Add($"Dòng {r}: Mã '{code}' không có trong Bảng quy chuẩn.");
                continue;
            }

            DateTime dt;
            if (dateVal.IsDateTime) dt = dateVal.GetDateTime().Date;
            else if (DateTime.TryParse(ws.Cell(r, 2).GetString().Trim(), out var parsed)) dt = parsed.Date;
            else
            {
                errors.Add($"Dòng {r}: Ngày nghỉ không hợp lệ.");
                continue;
            }

            // Kiểm tra số dư phép nếu là nghỉ phép năm
            if (code.StartsWith("P", StringComparison.OrdinalIgnoreCase))
            {
                decimal days = code == "P/2" ? 0.5m : 1.0m;
                try
                {
                    await _leaveService.ValidateLeaveRequestAllowedAsync(emp.Id, code, days, dt, companyId, ct);
                }
                catch (Exception ex)
                {
                    errors.Add($"Dòng {r}: {ex.Message}");
                    continue;
                }
            }

            var existing = await _db.LeaveRequests.FirstOrDefaultAsync(l => l.EmployeeId == emp.Id && l.Date == dt, ct);
            if (existing != null)
            {
                existing.Code = code;
                existing.Reason = reason;
                existing.Source = "EXCEL";
            }
            else
            {
                _db.LeaveRequests.Add(new LeaveRequest
                {
                    CompanyId = companyId,
                    EmployeeId = emp.Id,
                    Date = dt,
                    Code = code,
                    Reason = reason,
                    Source = "EXCEL",
                    CreatedBy = _access.Username,
                    CreatedAt = DateTime.Now
                });
            }
            importedCount++;
        }

        _audit.Log("LeaveRequest", null, "ImportExcel", $"Import thành công {importedCount} đơn nghỉ, {errors.Count} lỗi", companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { importedCount, errors });
    }

    // ===============================================
    // 2. LEAVE FUNDS & LEDGER (Quỹ phép & Sổ cái phép)
    // ===============================================
    public record LeaveFundDto(
        int EmployeeId,
        string EmployeeCode,
        string FullName,
        short Year,
        decimal AnnualOpening,
        decimal CarryOpening,
        decimal CompOpening,
        decimal Accrued,           // Tích lũy trong năm / đến thời điểm tháng đó (+1 ngày mỗi kỳ làm việc >= 50% ngày công chuẩn)
        decimal TotalEarned,       // Tổng phép năm được hưởng đến thời điểm đó (Đầu kỳ + Phép chuyển + Tích lũy)
        decimal TotalAnnualEarned, // Alias đồng bộ frontend
        decimal AnnualUsed,        // Đã sử dụng phép năm lũy kế đến thời điểm đó
        decimal CarryUsed,
        decimal CompUsed,
        decimal TotalUsed,         // Tổng số ngày đã sử dụng lũy kế đến thời điểm đó
        decimal TotalRemaining,    // Số phép năm tồn còn lại tại thời điểm đó
        decimal AvailableBalance,  // Alias đồng bộ frontend
        bool IsExhausted,
        int? Month = null,         // Tháng đang lọc (null nếu cả năm)
        decimal MonthUsed = 0m,    // Số ngày phép đã sử dụng trong riêng tháng đó
        decimal MonthAnnualUsed = 0m // Số ngày phép năm đã sử dụng trong riêng tháng đó
    );

    public record SaveLeaveFundDto(
        int EmployeeId,
        short Year,
        decimal AnnualOpening,
        decimal CarryOpening,
        decimal CompOpening);

    [HttpGet("funds")]
    public async Task<IActionResult> GetFunds(int companyId, [FromQuery] short year, [FromQuery] int? month = null, CancellationToken ct = default)
    {
        _access.EnsureStaffOrAbove();
        await _access.EnsureCompanyAsync(companyId, ct);

        // Quy tắc: Chỉ có thể xem số dư phép tối đa đến tháng hiện tại
        var now = DateTime.Today;
        if (year > now.Year)
        {
            return BadRequest(new { message = $"Chỉ có thể xem số dư phép tối đa đến năm hiện tại ({now.Year})." });
        }
        if (year == now.Year && month.HasValue && month.Value > now.Month)
        {
            month = now.Month;
        }

        var list = await _leaveService.GetCompanyLeaveFundsAsync(companyId, year, month, ct);
        var dtos = list.Select(f => new LeaveFundDto(
            f.EmployeeId,
            f.EmployeeCode,
            f.FullName,
            (short)f.Year,
            f.AnnualOpening,
            f.CarryOpening,
            f.CompOpening,
            f.Accrued,
            f.TotalAnnualEarned,
            f.TotalAnnualEarned,
            f.AnnualUsed,
            f.CarryUsed,
            f.CompUsed,
            f.TotalUsed,
            f.AvailableBalance,
            f.AvailableBalance,
            f.IsExhausted,
            f.Month,
            f.MonthUsed,
            f.MonthAnnualUsed
        )).ToList();

        return Ok(dtos);
    }

    [HttpPost("funds")]
    public async Task<IActionResult> SaveFund(int companyId, [FromBody] SaveLeaveFundDto dto, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _access.GetEmployeeAsync(dto.EmployeeId, ct);

        if (dto.AnnualOpening < 0 || dto.CarryOpening < 0 || dto.CompOpening < 0)
        {
            return BadRequest(new { message = "Số dư đầu kỳ của quỹ phép không được âm." });
        }

        var fund = await _db.LeaveFunds.FirstOrDefaultAsync(f => f.EmployeeId == dto.EmployeeId && f.Year == dto.Year, ct);
        if (fund != null)
        {
            fund.AnnualOpening = dto.AnnualOpening;
            fund.CarryOpening = dto.CarryOpening;
            fund.CompOpening = dto.CompOpening;
        }
        else
        {
            _db.LeaveFunds.Add(new LeaveFund
            {
                EmployeeId = dto.EmployeeId,
                Year = dto.Year,
                AnnualOpening = dto.AnnualOpening,
                CarryOpening = dto.CarryOpening,
                CompOpening = dto.CompOpening
            });
        }

        _audit.Log("LeaveFund", dto.EmployeeId, "SaveFund", new { emp = emp.EmployeeCode, year = dto.Year, dto.AnnualOpening, dto.CarryOpening, dto.CompOpening }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Lưu quỹ phép đầu kỳ thành công." });
    }

    [HttpGet("ledger/{employeeId}")]
    public async Task<IActionResult> GetLedger(int companyId, int employeeId, [FromQuery] short year, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _access.GetEmployeeAsync(employeeId, ct);

        if (User.IsEmployee())
        {
            var myEmpCode = User.GetEmployeeCode();
            if (string.IsNullOrEmpty(myEmpCode) || !myEmpCode.Equals(emp.EmployeeCode, StringComparison.OrdinalIgnoreCase))
            {
                return StatusCode(403, new { message = "Bạn không có quyền xem sổ cái phép của nhân viên khác." });
            }
        }
        else
        {
            _access.EnsureStaffOrAbove();
        }

        var list = await _leaveService.GetEmployeeLedgerAsync(employeeId, year, ct);
        return Ok(list);
    }
}
