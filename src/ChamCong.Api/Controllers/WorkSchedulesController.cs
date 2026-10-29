using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/schedules")]
[Authorize]
public class WorkSchedulesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public WorkSchedulesController(AppDbContext db, AccessService access, AuditService audit)
    {
        _db = db;
        _access = access;
        _audit = audit;
    }

    public record WorkScheduleDto(
        int ScheduleId,
        int CompanyId,
        int? EmployeeId,
        string EmployeeCode,
        string EmployeeName,
        string EmployeeType,
        DateTime WorkDate,
        string ShiftCode,
        string? Note,
        string Status,
        DateTime RegisteredAtUtc,
        string? RegisteredBy);

    public class RegisterScheduleRequest
    {
        public List<DateTime> Dates { get; set; } = new();
        public string ShiftCode { get; set; } = "FULL"; // FULL | MORNING | AFTERNOON
        public string? Note { get; set; }
    }

    public class HrBatchScheduleRequest
    {
        public string EmployeeCode { get; set; } = "";
        public List<DateTime> Dates { get; set; } = new();
        public string ShiftCode { get; set; } = "FULL";
        public string? Note { get; set; }
    }

    /// <summary>Lấy danh sách lịch làm việc đã đăng ký của cá nhân nhân viên đang đăng nhập.</summary>
    [HttpGet("my")]
    public async Task<IActionResult> GetMySchedules([FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
    {
        var username = _access.Username;
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Username == username, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { message = "Tài khoản của bạn chưa được liên kết với mã nhân viên." });
        }

        var emp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.EmployeeCode == user.EmployeeCode, ct);
        if (emp == null)
        {
            return NotFound(new { message = "Không tìm thấy hồ sơ nhân viên tương ứng." });
        }

        var fromDate = (from ?? DateTime.Today.AddDays(-15)).Date;
        var toDate = (to ?? DateTime.Today.AddDays(45)).Date;

        var schedules = await _db.WorkSchedules
            .AsNoTracking()
            .Where(s => s.EmployeeCode == emp.EmployeeCode && s.WorkDate >= fromDate && s.WorkDate <= toDate)
            .OrderBy(s => s.WorkDate)
            .ToListAsync(ct);

        var list = schedules.Select(s => new WorkScheduleDto(
            s.ScheduleId,
            s.CompanyId,
            s.EmployeeId ?? emp.Id,
            s.EmployeeCode,
            emp.FullName,
            emp.EmployeeType,
            s.WorkDate,
            s.ShiftCode,
            s.Note,
            s.Status,
            s.RegisteredAtUtc,
            s.RegisteredBy
        )).ToList();

        var calendarDays = await _db.CalendarDays
            .AsNoTracking()
            .Where(c => c.CompanyId == emp.CompanyId && c.Date >= fromDate && c.Date <= toDate)
            .OrderBy(c => c.Date)
            .Select(c => new
            {
                c.Id,
                c.Date,
                c.DayType,
                c.HalfSession,
                c.CompanyOffCode,
                c.Note
            })
            .ToListAsync(ct);

        return Ok(new
        {
            employee = new
            {
                emp.Id,
                emp.CompanyId,
                emp.EmployeeCode,
                emp.FullName,
                emp.EmployeeType
            },
            schedules = list,
            companyCalendar = calendarDays
        });
    }

    /// <summary>Nhân sự đăng ký lịch làm việc (bắt buộc đăng ký trước ngày làm việc, không được đăng ký lùi ngày).</summary>
    [HttpPost("register")]
    public async Task<IActionResult> RegisterSchedules([FromBody] RegisterScheduleRequest request, CancellationToken ct)
    {
        if (request.Dates == null || request.Dates.Count == 0)
        {
            return BadRequest(new { message = "Vui lòng chọn ít nhất một ngày làm việc để đăng ký." });
        }

        var username = _access.Username;
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Username == username, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { message = "Tài khoản của bạn chưa được liên kết với mã nhân viên." });
        }

        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.EmployeeCode == user.EmployeeCode, ct);
        if (emp == null)
        {
            return NotFound(new { message = "Không tìm thấy hồ sơ nhân viên tương ứng." });
        }

        // Quy tắc: Chỉ mở cho nhân sự Part-time hoặc Remote
        var empType = (emp.EmployeeType ?? "STANDARD").Trim().ToUpperInvariant();
        if (empType != "PARTTIME" && empType != "REMOTE")
        {
            return BadRequest(new
            {
                message = "Chức năng đăng ký lịch làm việc chỉ áp dụng cho nhân sự Part-time hoặc Remote. Nhân viên Chuẩn (Full-time) làm việc theo ca quy định của công ty."
            });
        }

        // Quy tắc bắt buộc: Phải đăng ký trước, không được nghỉ trước rồi đăng ký lùi ngày
        var today = DateTime.Today;
        foreach (var d in request.Dates)
        {
            if (d.Date < today)
            {
                return BadRequest(new
                {
                    message = $"Ngày {d:dd/MM/yyyy} đã qua. Quy tắc: Nhân sự phải đăng ký lịch làm việc trước ngày làm việc, không được nghỉ trước rồi đăng ký lùi ngày."
                });
            }
        }

        int registeredCount = 0;
        foreach (var rawDate in request.Dates)
        {
            var date = rawDate.Date;
            var existing = await _db.WorkSchedules
                .FirstOrDefaultAsync(s => s.CompanyId == emp.CompanyId && s.EmployeeCode == emp.EmployeeCode && s.WorkDate == date, ct);

            if (existing != null)
            {
                existing.ShiftCode = string.IsNullOrWhiteSpace(request.ShiftCode) ? "FULL" : request.ShiftCode.Trim().ToUpperInvariant();
                existing.Note = Text.Clean(request.Note, 250);
                existing.Status = "REGISTERED";
                existing.RegisteredAtUtc = DateTime.UtcNow;
                existing.RegisteredBy = username;
            }
            else
            {
                _db.WorkSchedules.Add(new WorkSchedule
                {
                    CompanyId = emp.CompanyId,
                    EmployeeId = emp.Id,
                    EmployeeCode = emp.EmployeeCode,
                    WorkDate = date,
                    ShiftCode = string.IsNullOrWhiteSpace(request.ShiftCode) ? "FULL" : request.ShiftCode.Trim().ToUpperInvariant(),
                    Note = Text.Clean(request.Note, 250),
                    Status = "REGISTERED",
                    RegisteredAtUtc = DateTime.UtcNow,
                    RegisteredBy = username
                });
            }
            registeredCount++;
        }

        await _db.SaveChangesAsync(ct);
        _audit.Log("WorkSchedule", emp.Id, "Register",
            $"Nhân viên {emp.EmployeeCode} đăng ký {registeredCount} ngày làm việc",
            companyId: emp.CompanyId);

        return Ok(new { message = $"Đã đăng ký thành công {registeredCount} ngày làm việc." });
    }

    /// <summary>Hủy đăng ký lịch làm việc.</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> CancelSchedule(int id, CancellationToken ct)
    {
        var schedule = await _db.WorkSchedules.FirstOrDefaultAsync(s => s.ScheduleId == id, ct);
        if (schedule == null) return NotFound(new { message = "Không tìm thấy lịch làm việc." });

        var username = _access.Username;
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Username == username, ct);
        bool isHrOrAdmin = _access.IsAdmin || _access.User.IsHR();

        // Nếu là nhân viên thường: chỉ được hủy lịch của chính mình và ngày làm việc phải từ hôm nay trở đi
        if (!isHrOrAdmin)
        {
            if (user == null || !string.Equals(user.EmployeeCode, schedule.EmployeeCode, StringComparison.OrdinalIgnoreCase))
            {
                return Forbid();
            }
            if (schedule.WorkDate.Date < DateTime.Today)
            {
                return BadRequest(new { message = "Không thể hủy lịch làm việc của ngày đã qua." });
            }
        }

        _db.WorkSchedules.Remove(schedule);
        await _db.SaveChangesAsync(ct);

        _audit.Log("WorkSchedule", schedule.ScheduleId, "Delete",
            $"Hủy lịch làm việc ngày {schedule.WorkDate:dd/MM/yyyy} của {schedule.EmployeeCode}",
            companyId: schedule.CompanyId);

        return Ok(new { message = $"Đã hủy lịch làm việc ngày {schedule.WorkDate:dd/MM/yyyy}." });
    }

    /// <summary>HR/Admin xem danh sách lịch làm việc của tất cả nhân viên theo hội sở.</summary>
    [HttpGet("company/{companyId}")]
    [Authorize(Roles = $"{Roles.Admin},{Roles.HR},Operator,ADMIN,HR,OPERATOR")]
    public async Task<IActionResult> GetCompanySchedules(
        int companyId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? employeeCode,
        CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);

        var fromDate = (from ?? DateTime.Today.AddDays(-15)).Date;
        var toDate = (to ?? DateTime.Today.AddDays(45)).Date;

        var q = _db.WorkSchedules
            .AsNoTracking()
            .Where(s => s.CompanyId == companyId && s.WorkDate >= fromDate && s.WorkDate <= toDate);

        if (!string.IsNullOrWhiteSpace(employeeCode))
        {
            var code = employeeCode.Trim();
            q = q.Where(s => s.EmployeeCode == code);
        }

        var schedules = await q.OrderBy(s => s.WorkDate).ThenBy(s => s.EmployeeCode).ToListAsync(ct);

        var empCodes = schedules.Select(s => s.EmployeeCode).Distinct().ToList();
        var empMap = await _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == companyId && empCodes.Contains(e.EmployeeCode))
            .ToDictionaryAsync(e => e.EmployeeCode, e => e, StringComparer.OrdinalIgnoreCase, ct);

        var list = schedules.Select(s =>
        {
            empMap.TryGetValue(s.EmployeeCode, out var emp);
            return new WorkScheduleDto(
                s.ScheduleId,
                s.CompanyId,
                s.EmployeeId ?? emp?.Id,
                s.EmployeeCode,
                emp?.FullName ?? s.EmployeeCode,
                emp?.EmployeeType ?? "STANDARD",
                s.WorkDate,
                s.ShiftCode,
                s.Note,
                s.Status,
                s.RegisteredAtUtc,
                s.RegisteredBy
            );
        }).ToList();

        return Ok(list);
    }

    /// <summary>HR đăng ký/điều chỉnh lịch làm việc theo lô cho nhân viên.</summary>
    [HttpPost("company/{companyId}/batch")]
    [Authorize(Roles = $"{Roles.Admin},{Roles.HR},Operator,ADMIN,HR,OPERATOR")]
    public async Task<IActionResult> HrBatchRegister(
        int companyId,
        [FromBody] HrBatchScheduleRequest request,
        CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        if (string.IsNullOrWhiteSpace(request.EmployeeCode))
        {
            return BadRequest(new { message = "Vui lòng chọn nhân viên." });
        }
        if (request.Dates == null || request.Dates.Count == 0)
        {
            return BadRequest(new { message = "Vui lòng chọn ít nhất một ngày làm việc." });
        }

        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.CompanyId == companyId && e.EmployeeCode == request.EmployeeCode.Trim(), ct);
        if (emp == null)
        {
            return NotFound(new { message = "Không tìm thấy nhân viên." });
        }

        int registeredCount = 0;
        foreach (var rawDate in request.Dates)
        {
            var date = rawDate.Date;
            var existing = await _db.WorkSchedules
                .FirstOrDefaultAsync(s => s.CompanyId == companyId && s.EmployeeCode == emp.EmployeeCode && s.WorkDate == date, ct);

            if (existing != null)
            {
                existing.ShiftCode = string.IsNullOrWhiteSpace(request.ShiftCode) ? "FULL" : request.ShiftCode.Trim().ToUpperInvariant();
                existing.Note = Text.Clean(request.Note, 250);
                existing.Status = "REGISTERED";
                existing.RegisteredAtUtc = DateTime.UtcNow;
                existing.RegisteredBy = $"HR ({_access.Username})";
            }
            else
            {
                _db.WorkSchedules.Add(new WorkSchedule
                {
                    CompanyId = companyId,
                    EmployeeId = emp.Id,
                    EmployeeCode = emp.EmployeeCode,
                    WorkDate = date,
                    ShiftCode = string.IsNullOrWhiteSpace(request.ShiftCode) ? "FULL" : request.ShiftCode.Trim().ToUpperInvariant(),
                    Note = Text.Clean(request.Note, 250),
                    Status = "REGISTERED",
                    RegisteredAtUtc = DateTime.UtcNow,
                    RegisteredBy = $"HR ({_access.Username})"
                });
            }
            registeredCount++;
        }

        await _db.SaveChangesAsync(ct);
        _audit.Log("WorkSchedule", emp.Id, "HrBatchRegister",
            $"HR đăng ký {registeredCount} ngày làm việc cho nhân viên {emp.EmployeeCode}",
            companyId: companyId);

        return Ok(new { message = $"Đã cập nhật {registeredCount} ngày làm việc cho nhân viên {emp.FullName} ({emp.EmployeeCode})." });
    }
}
