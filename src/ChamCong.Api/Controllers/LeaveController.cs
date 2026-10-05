using ClosedXML.Excel;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/companies/{companyId}/leave")]
[Authorize]
public class LeaveController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public LeaveController(AppDbContext db, AccessService access, AuditService audit)
    {
        _db = db;
        _access = access;
        _audit = audit;
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
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _access.GetEmployeeAsync(dto.EmployeeId, ct);
        var date = dto.Date.Date;
        var code = Text.Required(dto.Code, "Mã nghỉ phép", 10).ToUpperInvariant();

        if (!await _db.AttendanceCodes.AnyAsync(c => c.CompanyId == companyId && c.Code == code, ct))
        {
            return BadRequest(new { message = $"Mã nghỉ phép '{code}' không có trong Bảng quy chuẩn của hội sở." });
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
        await _access.EnsureCompanyAsync(companyId, ct);
        var req = await _db.LeaveRequests.FirstOrDefaultAsync(l => l.Id == id && l.CompanyId == companyId, ct);
        if (req == null) return NotFound();

        _db.LeaveRequests.Remove(req);
        _audit.Log("LeaveRequest", req.Id, "DeleteRequest", $"Xóa đơn nghỉ ngày {req.Date:dd/MM/yyyy}", companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã xóa đơn nghỉ phép." });
    }

    [HttpPost("requests/import-excel")]
    public async Task<IActionResult> ImportRequestsExcel(int companyId, IFormFile file, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);

        using var stream = file.OpenReadStream();
        using var workbook = new XLWorkbook(stream);
        var ws = workbook.Worksheets.First();

        var emps = await _db.Employees.AsNoTracking().Where(e => e.CompanyId == companyId).ToDictionaryAsync(e => e.EmployeeCode, StringComparer.OrdinalIgnoreCase, ct);
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
        decimal AnnualUsed,
        decimal CarryUsed,
        decimal CompUsed,
        decimal TotalRemaining);

    public record SaveLeaveFundDto(
        int EmployeeId,
        short Year,
        decimal AnnualOpening,
        decimal CarryOpening,
        decimal CompOpening);

    [HttpGet("funds")]
    public async Task<IActionResult> GetFunds(int companyId, [FromQuery] short year, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);

        var employees = await _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == companyId)
            .OrderBy(e => e.SortOrder)
            .ThenBy(e => e.EmployeeCode)
            .ToListAsync(ct);

        var empIds = employees.Select(e => e.Id).ToList();

        var funds = await _db.LeaveFunds
            .AsNoTracking()
            .Where(f => f.Year == year && empIds.Contains(f.EmployeeId))
            .ToDictionaryAsync(f => f.EmployeeId, ct);

        // Lấy tổng khấu trừ trong năm từ sổ cái
        var ledgerSums = await _db.LeaveLedger
            .AsNoTracking()
            .Where(l => l.Year == year && empIds.Contains(l.EmployeeId))
            .GroupBy(l => new { l.EmployeeId, l.Fund })
            .Select(g => new { g.Key.EmployeeId, g.Key.Fund, Used = -g.Sum(x => x.Amount) })
            .ToListAsync(ct);

        var usedMap = ledgerSums.GroupBy(x => x.EmployeeId)
            .ToDictionary(g => g.Key, g => g.ToDictionary(x => x.Fund, x => x.Used));

        var dtos = employees.Select(e =>
        {
            funds.TryGetValue(e.Id, out var fund);
            usedMap.TryGetValue(e.Id, out var used);

            decimal annOpen = fund?.AnnualOpening ?? 0;
            decimal carOpen = fund?.CarryOpening ?? 0;
            decimal compOpen = fund?.CompOpening ?? 0;

            decimal annUsed = used != null && used.TryGetValue("ANNUAL", out var au) ? au : 0;
            decimal carUsed = used != null && used.TryGetValue("CARRY", out var cu) ? cu : 0;
            decimal compUsed = used != null && used.TryGetValue("COMP", out var cpu) ? cpu : 0;

            decimal rem = (annOpen - annUsed) + (carOpen - carUsed) + (compOpen - compUsed);

            return new LeaveFundDto(
                e.Id,
                e.EmployeeCode,
                e.FullName,
                year,
                annOpen,
                carOpen,
                compOpen,
                annUsed,
                carUsed,
                compUsed,
                rem
            );
        }).ToList();

        return Ok(dtos);
    }

    [HttpPost("funds")]
    public async Task<IActionResult> SaveFund(int companyId, [FromBody] SaveLeaveFundDto dto, CancellationToken ct)
    {
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

        var list = await _db.LeaveLedger
            .AsNoTracking()
            .Where(l => l.EmployeeId == employeeId && l.Year == year)
            .OrderBy(l => l.Date)
            .ThenBy(l => l.Id)
            .ToListAsync(ct);

        return Ok(list);
    }
}
