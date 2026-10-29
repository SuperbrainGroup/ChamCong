using ClosedXML.Excel;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Engine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/v1/companies/{companyId}/employees")]
[Route("api/companies/{companyId}/employees")]
[Authorize]
public class EmployeesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;
    private readonly IPasswordService _passwordService;

    public EmployeesController(AppDbContext db, AccessService access, AuditService audit, IPasswordService passwordService)
    {
        _db = db;
        _access = access;
        _audit = audit;
        _passwordService = passwordService;
    }

    public record EmployeeDto(
        int Id,
        int CompanyId,
        string EmployeeCode,
        string FullName,
        int? DepartmentId,
        string? DepartmentName,
        int GroupId,
        string GroupName,
        DateTime StartDate,
        DateTime? EndDate,
        bool ExemptPunch,
        string EmployeeType,
        string? DefaultNote,
        int SortOrder,
        DateTime CreatedAt,
        bool HasAccount,
        string? Username);

    public class SaveEmployeeDto
    {
        public string EmployeeCode { get; set; } = "";
        public string FullName { get; set; } = "";
        public int? DepartmentId { get; set; }
        public int GroupId { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public bool ExemptPunch { get; set; }
        public string EmployeeType { get; set; } = "STANDARD"; // STANDARD | REMOTE | PARTTIME
        public string? DefaultNote { get; set; }
        public int SortOrder { get; set; }
        public bool CreateUserAccount { get; set; } = true;
        public string? Username { get; set; }
        public string? Password { get; set; }
    }

    public record CreateAccountDto(string? Username, string? Password);

    [HttpGet]
    public async Task<IActionResult> GetAll(int companyId, [FromQuery] string? keyword, CancellationToken ct)
    {
        _access.EnsureStaffOrAbove();
        await _access.EnsureCompanyAsync(companyId, ct);

        var q = _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == companyId);

        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var kw = keyword.Trim().ToLower();
            q = q.Where(e => e.FullName.ToLower().Contains(kw) || e.EmployeeCode.ToLower().Contains(kw));
        }

        var emps = await q.OrderBy(e => e.SortOrder).ThenBy(e => e.EmployeeCode).ToListAsync(ct);
        var depts = await _db.Departments.AsNoTracking().Where(d => d.CompanyId == companyId).ToDictionaryAsync(d => d.Id, d => d.Name, ct);
        var grps = await _db.EmployeeGroups.AsNoTracking().Where(g => g.CompanyId == companyId).ToDictionaryAsync(g => g.Id, g => g.Name, ct);

        var codes = emps.Select(e => e.EmployeeCode).ToList();
        var userList = await _db.Users.AsNoTracking()
            .Where(u => u.EmployeeCode != null && codes.Contains(u.EmployeeCode) && u.Companies.Any(c => c.CompanyId == companyId))
            .ToListAsync(ct);
        var userMap = userList
            .GroupBy(u => u.EmployeeCode!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Username, StringComparer.OrdinalIgnoreCase);

        var list = emps.Select(e => new EmployeeDto(
            e.Id,
            e.CompanyId,
            e.EmployeeCode,
            e.FullName,
            e.DepartmentId,
            e.DepartmentId.HasValue && depts.TryGetValue(e.DepartmentId.Value, out var dn) ? dn : null,
            e.GroupId,
            grps.TryGetValue(e.GroupId, out var gn) ? gn : "",
            e.StartDate,
            e.EndDate,
            e.ExemptPunch,
            e.EmployeeType ?? "STANDARD",
            e.DefaultNote,
            e.SortOrder,
            e.CreatedAt,
            userMap.ContainsKey(e.EmployeeCode),
            userMap.GetValueOrDefault(e.EmployeeCode)
        )).ToList();

        return Ok(list);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int companyId, int id, CancellationToken ct)
    {
        _access.EnsureStaffOrAbove();
        await _access.EnsureCompanyAsync(companyId, ct);
        var e = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.CompanyId == companyId, ct);
        if (e == null) return NotFound();

        var depts = await _db.Departments.AsNoTracking().Where(d => d.CompanyId == companyId).ToDictionaryAsync(d => d.Id, d => d.Name, ct);
        var grps = await _db.EmployeeGroups.AsNoTracking().Where(g => g.CompanyId == companyId).ToDictionaryAsync(g => g.Id, g => g.Name, ct);

        var u = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.EmployeeCode == e.EmployeeCode && x.Companies.Any(c => c.CompanyId == companyId), ct);

        return Ok(new EmployeeDto(
            e.Id, e.CompanyId, e.EmployeeCode, e.FullName,
            e.DepartmentId, e.DepartmentId.HasValue && depts.TryGetValue(e.DepartmentId.Value, out var dn) ? dn : null,
            e.GroupId, grps.TryGetValue(e.GroupId, out var gn) ? gn : "",
            e.StartDate, e.EndDate, e.ExemptPunch,
            e.EmployeeType ?? "STANDARD",
            e.DefaultNote, e.SortOrder, e.CreatedAt,
            u != null,
            u?.Username
        ));
    }

    [HttpPost]
    public async Task<IActionResult> Create(int companyId, [FromBody] SaveEmployeeDto dto, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);
        var code = Text.Required(dto.EmployeeCode, "Mã nhân viên", 30).Trim();
        var name = Text.Required(dto.FullName, "Họ và tên", 150);

        if (await _db.Employees.AnyAsync(e => e.CompanyId == companyId && e.EmployeeCode == code, ct))
        {
            return BadRequest(new { message = $"Mã nhân viên '{code}' đã tồn tại trong hội sở." });
        }

        var emp = new Employee
        {
            CompanyId = companyId,
            EmployeeCode = code,
            FullName = name,
            DepartmentId = dto.DepartmentId,
            GroupId = dto.GroupId,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            ExemptPunch = dto.ExemptPunch,
            EmployeeType = string.IsNullOrWhiteSpace(dto.EmployeeType) ? "STANDARD" : dto.EmployeeType.Trim().ToUpperInvariant(),
            DefaultNote = Text.Clean(dto.DefaultNote, 500),
            SortOrder = dto.SortOrder,
            AttendanceSource = "APP",
            CreatedAt = DateTime.Now
        };

        _db.Employees.Add(emp);
        await _db.SaveChangesAsync(ct);

        // Khởi tạo quỹ phép năm hiện tại nếu chưa có
        short currentYear = (short)DateTime.Now.Year;
        if (!await _db.LeaveFunds.AnyAsync(l => l.EmployeeId == emp.Id && l.Year == currentYear, ct))
        {
            _db.LeaveFunds.Add(new LeaveFund
            {
                EmployeeId = emp.Id,
                Year = currentYear,
                AnnualOpening = 0, // Phép năm khởi tạo 0 ngày, tích lũy +1 ngày khi đủ >= 14 ngày công mỗi kỳ
                CarryOpening = 0,
                CompOpening = 0
            });
            await _db.SaveChangesAsync(ct);
        }

        // Tự động cấp tài khoản đăng nhập nếu được chọn
        string? createdUsername = null;
        if (dto.CreateUserAccount)
        {
            var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId, ct);
            var compPrefix = (company?.Code ?? $"c{companyId}").Trim().ToLowerInvariant();

            // Username quy chuẩn: [Mã hội sở]_[Mã nhân viên] (ví dụ: q2_nv01)
            var expectedUsername = $"{compPrefix}_{code.ToLowerInvariant()}";
            var rawUsername = string.IsNullOrWhiteSpace(dto.Username)
                ? expectedUsername
                : dto.Username.Trim().ToLowerInvariant();

            if (!rawUsername.StartsWith($"{compPrefix}_") && !rawUsername.StartsWith(compPrefix))
            {
                rawUsername = $"{compPrefix}_{rawUsername}";
            }

            var rawPass = string.IsNullOrWhiteSpace(dto.Password) ? "123456" : dto.Password.Trim();

            // Đảm bảo username là duy nhất trong toàn hệ thống
            var finalUsername = rawUsername;
            int counter = 1;
            while (await _db.Users.AnyAsync(u => u.Username == finalUsername, ct))
            {
                finalUsername = $"{rawUsername}_{counter++}";
            }

            var newUser = new User
            {
                Username = finalUsername,
                FullName = name,
                EmployeeCode = code,
                Role = Roles.Employee,
                PasswordHash = _passwordService.HashPassword(rawPass),
                IsActive = true,
                MustChangePassword = false,
                CreatedAt = DateTime.Now
            };
            _db.Users.Add(newUser);
            await _db.SaveChangesAsync(ct);

            _db.UserCompanies.Add(new UserCompany { UserId = newUser.Id, CompanyId = companyId });
            await _db.SaveChangesAsync(ct);
            createdUsername = finalUsername;
        }

        _audit.Log("Employee", emp.Id, "Create", new { code, name, createdUsername }, companyId: companyId);

        return CreatedAtAction(nameof(GetById), new { companyId, id = emp.Id }, emp);
    }

    /// <summary>Cấp mới hoặc đặt lại mật khẩu tài khoản đăng nhập cho nhân viên.</summary>
    [HttpPost("{id}/create-account")]
    public async Task<IActionResult> CreateOrResetAccount(int companyId, int id, [FromBody] CreateAccountDto? dto, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == id && e.CompanyId == companyId, ct);
        if (emp == null) return NotFound();

        var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId, ct);
        var compPrefix = (company?.Code ?? $"c{companyId}").Trim().ToLowerInvariant();
        var defaultUsername = $"{compPrefix}_{emp.EmployeeCode.ToLowerInvariant()}";

        // Tìm user theo hội sở và mã nhân viên để tránh nhầm với hội sở khác
        var existingUser = await (from u in _db.Users
                                  join uc in _db.UserCompanies on u.Id equals uc.UserId
                                  where uc.CompanyId == companyId && u.EmployeeCode == emp.EmployeeCode
                                  select u).FirstOrDefaultAsync(ct);

        if (existingUser == null)
        {
            existingUser = await _db.Users.FirstOrDefaultAsync(u => u.Username == defaultUsername, ct);
        }

        var rawPassword = string.IsNullOrWhiteSpace(dto?.Password) ? "123456" : dto.Password.Trim();
        var username = string.IsNullOrWhiteSpace(dto?.Username) 
            ? (existingUser?.Username ?? defaultUsername) 
            : dto.Username.Trim().ToLowerInvariant();

        if (!username.StartsWith($"{compPrefix}_") && !username.StartsWith(compPrefix))
        {
            username = $"{compPrefix}_{username}";
        }

        if (existingUser != null)
        {
            existingUser.PasswordHash = _passwordService.HashPassword(rawPassword);
            existingUser.IsLocked = false;
            existingUser.FailedLoginCount = 0;
            existingUser.IsActive = true;
            await _db.SaveChangesAsync(ct);
            _audit.Log("Employee", emp.Id, "ResetAccount", $"Đặt lại mật khẩu cho @{existingUser.Username}", companyId: companyId);
            return Ok(new { message = $"Đã cập nhật mật khẩu cho @{existingUser.Username}: {rawPassword}", username = existingUser.Username, password = rawPassword });
        }
        else
        {
            var finalUsername = username;
            int counter = 1;
            while (await _db.Users.AnyAsync(u => u.Username == finalUsername, ct))
            {
                finalUsername = $"{username}_{counter++}";
            }

            var u = new User
            {
                Username = finalUsername,
                FullName = emp.FullName,
                EmployeeCode = emp.EmployeeCode,
                PasswordHash = _passwordService.HashPassword(rawPassword),
                Role = Roles.Employee,
                IsActive = true,
                MustChangePassword = false,
                CreatedAt = DateTime.Now
            };
            _db.Users.Add(u);
            await _db.SaveChangesAsync(ct);

            _db.UserCompanies.Add(new UserCompany { UserId = u.Id, CompanyId = companyId });
            await _db.SaveChangesAsync(ct);

            _audit.Log("Employee", emp.Id, "CreateAccount", $"Cấp tài khoản mới @{finalUsername}", companyId: companyId);
            return Ok(new { message = $"Đã cấp tài khoản @{finalUsername} với mật khẩu: {rawPassword}", username = finalUsername, password = rawPassword });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int companyId, int id, [FromBody] SaveEmployeeDto dto, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == id && e.CompanyId == companyId, ct);
        if (emp == null) return NotFound();

        var code = Text.Required(dto.EmployeeCode, "Mã nhân viên", 30).Trim();
        var name = Text.Required(dto.FullName, "Họ và tên", 150);

        if (await _db.Employees.AnyAsync(e => e.CompanyId == companyId && e.EmployeeCode == code && e.Id != id, ct))
        {
            return BadRequest(new { message = $"Mã nhân viên '{code}' đã tồn tại trong hội sở." });
        }

        emp.EmployeeCode = code;
        emp.FullName = name;
        emp.DepartmentId = dto.DepartmentId;
        emp.GroupId = dto.GroupId;
        emp.StartDate = dto.StartDate;
        emp.EndDate = dto.EndDate;
        emp.ExemptPunch = dto.ExemptPunch;
        if (!string.IsNullOrWhiteSpace(dto.EmployeeType)) emp.EmployeeType = dto.EmployeeType.Trim().ToUpperInvariant();
        emp.DefaultNote = Text.Clean(dto.DefaultNote, 500);
        emp.SortOrder = dto.SortOrder;

        _audit.Log("Employee", emp.Id, "Update", new { code, name, emp.EmployeeType }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Cập nhật nhân viên thành công." });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int companyId, int id, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == id && e.CompanyId == companyId, ct);
        if (emp == null) return NotFound();

        // Ràng buộc: Nhân viên đã có dữ liệu trong kỳ công thì không được xóa thường
        var hasAttendanceData = await _db.DayResults.AnyAsync(r => r.EmployeeId == id, ct)
            || await _db.RawPunches.AnyAsync(p => p.EmployeeId == id, ct)
            || await _db.WebAttendanceLogs.AnyAsync(w => w.EmployeeCode == emp.EmployeeCode, ct)
            || await _db.DailyPunchSummaries.AnyAsync(d => d.EmployeeCode == emp.EmployeeCode, ct);

        if (hasAttendanceData)
        {
            return BadRequest(new
            {
                hasAttendanceData = true,
                message = "Nhân viên đã có dữ liệu chấm công trong hệ thống. Bạn chỉ có thể thiết lập 'Ngày nghỉ việc' hoặc Quản trị viên (Admin) có thể thực hiện xóa vĩnh viễn (xóa toàn bộ dữ liệu chấm công)."
            });
        }

        var funds = await _db.LeaveFunds.Where(f => f.EmployeeId == id).ToListAsync(ct);
        if (funds.Count > 0) _db.LeaveFunds.RemoveRange(funds);

        var ledger = await _db.LeaveLedger.Where(l => l.EmployeeId == id).ToListAsync(ct);
        if (ledger.Count > 0) _db.LeaveLedger.RemoveRange(ledger);

        var requests = await _db.LeaveRequests.Where(r => r.EmployeeId == id).ToListAsync(ct);
        if (requests.Count > 0) _db.LeaveRequests.RemoveRange(requests);

        var notes = await _db.PeriodNotes.Where(n => n.EmployeeId == id).ToListAsync(ct);
        if (notes.Count > 0) _db.PeriodNotes.RemoveRange(notes);

        var backups = await _db.DayResultManualBackups.Where(b => b.EmployeeId == id).ToListAsync(ct);
        if (backups.Count > 0) _db.DayResultManualBackups.RemoveRange(backups);

        // Xóa trước các dữ liệu con để không bị xung đột khóa ngoại FK_LeaveFunds_Employees
        await _db.SaveChangesAsync(ct);

        // Gỡ liên kết tài khoản user nếu có
        var linkedUsers = await _db.Users.Where(u => u.EmployeeCode == emp.EmployeeCode).ToListAsync(ct);
        foreach (var u in linkedUsers)
        {
            u.EmployeeCode = null;
        }

        _db.Employees.Remove(emp);
        _audit.Log("Employee", emp.Id, "Delete", $"Xóa nhân viên {emp.EmployeeCode} - {emp.FullName}", companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã xóa nhân viên." });
    }

    public record TerminateEmployeeDto(DateTime EndDate, string? Reason);

    /// <summary>Cho nhân viên nghỉ việc: thiết lập Ngày nghỉ việc mà không xóa dữ liệu chấm công.</summary>
    [HttpPost("{id}/terminate")]
    public async Task<IActionResult> Terminate(int companyId, int id, [FromBody] TerminateEmployeeDto dto, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == id && e.CompanyId == companyId, ct);
        if (emp == null) return NotFound();

        emp.EndDate = dto.EndDate.Date;
        _audit.Log("Employee", emp.Id, "Terminate", new { endDate = dto.EndDate.Date, reason = dto.Reason }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = $"Đã thiết lập ngày nghỉ việc cho {emp.FullName} là {dto.EndDate:dd/MM/yyyy}." });
    }

    /// <summary>Xóa cưỡng bức nhân viên kể cả khi có dữ liệu chấm công (chỉ Admin). Xóa toàn bộ dữ liệu liên quan.</summary>
    [HttpDelete("{id}/force")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> ForceDelete(int companyId, int id, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == id && e.CompanyId == companyId, ct);
        if (emp == null) return NotFound();

        // 1. Dữ liệu liên quan theo EmployeeId:
        var dayResults = await _db.DayResults.Where(r => r.EmployeeId == id).ToListAsync(ct);
        if (dayResults.Count > 0) _db.DayResults.RemoveRange(dayResults);

        var rawPunches = await _db.RawPunches.Where(p => p.EmployeeId == id).ToListAsync(ct);
        if (rawPunches.Count > 0) _db.RawPunches.RemoveRange(rawPunches);

        var funds = await _db.LeaveFunds.Where(f => f.EmployeeId == id).ToListAsync(ct);
        if (funds.Count > 0) _db.LeaveFunds.RemoveRange(funds);

        var ledger = await _db.LeaveLedger.Where(l => l.EmployeeId == id).ToListAsync(ct);
        if (ledger.Count > 0) _db.LeaveLedger.RemoveRange(ledger);

        var requests = await _db.LeaveRequests.Where(r => r.EmployeeId == id).ToListAsync(ct);
        if (requests.Count > 0) _db.LeaveRequests.RemoveRange(requests);

        var notes = await _db.PeriodNotes.Where(n => n.EmployeeId == id).ToListAsync(ct);
        if (notes.Count > 0) _db.PeriodNotes.RemoveRange(notes);

        var backups = await _db.DayResultManualBackups.Where(b => b.EmployeeId == id).ToListAsync(ct);
        if (backups.Count > 0) _db.DayResultManualBackups.RemoveRange(backups);

        // 2. Dữ liệu liên quan theo EmployeeCode & Thiết bị (EmployeeDevices):
        var devices = await _db.EmployeeDevices.Where(d => d.EmployeeCode == emp.EmployeeCode).ToListAsync(ct);
        var deviceBindingIntIds = devices.Select(d => d.DeviceBindingId).ToList();
        var deviceBindingIds = devices.Select(d => (int?)d.DeviceBindingId).ToList();

        var webLogs = await _db.WebAttendanceLogs
            .Where(w => w.EmployeeCode == emp.EmployeeCode || (deviceBindingIntIds.Count > 0 && deviceBindingIntIds.Contains(w.DeviceBindingId)))
            .ToListAsync(ct);
        if (webLogs.Count > 0) _db.WebAttendanceLogs.RemoveRange(webLogs);

        var punchSummaries = await _db.DailyPunchSummaries.Where(d => d.EmployeeCode == emp.EmployeeCode).ToListAsync(ct);
        if (punchSummaries.Count > 0) _db.DailyPunchSummaries.RemoveRange(punchSummaries);

        var adjustments = await _db.TimeAdjustments.Where(a => a.EmployeeCode == emp.EmployeeCode).ToListAsync(ct);
        if (adjustments.Count > 0) _db.TimeAdjustments.RemoveRange(adjustments);

        var publishedLines = await _db.TimesheetPublishedLines.Where(l => l.EmployeeCode == emp.EmployeeCode).ToListAsync(ct);
        if (publishedLines.Count > 0) _db.TimesheetPublishedLines.RemoveRange(publishedLines);

        var disputes = await _db.TimesheetDisputes.Where(d => d.EmployeeCode == emp.EmployeeCode).ToListAsync(ct);
        if (disputes.Count > 0) _db.TimesheetDisputes.RemoveRange(disputes);

        var branchAssignments = await _db.EmployeeBranchAssignments.Where(b => b.EmployeeCode == emp.EmployeeCode).ToListAsync(ct);
        if (branchAssignments.Count > 0) _db.EmployeeBranchAssignments.RemoveRange(branchAssignments);

        // Đơn từ giải trình & đính kèm
        var empRequests = await _db.EmployeeRequests.Include(r => r.Attachments).Where(r => r.EmployeeCode == emp.EmployeeCode).ToListAsync(ct);
        if (empRequests.Count > 0)
        {
            foreach (var req in empRequests)
            {
                if (req.Attachments != null && req.Attachments.Count > 0)
                    _db.RequestAttachments.RemoveRange(req.Attachments);
            }
            _db.EmployeeRequests.RemoveRange(empRequests);
        }

        // Thiết bị di động / máy tính & refresh token của thiết bị
        if (devices.Count > 0)
        {
            var devTokens = await _db.RefreshTokens.Where(rt => deviceBindingIds.Contains(rt.DeviceBindingId)).ToListAsync(ct);
            if (devTokens.Count > 0) _db.RefreshTokens.RemoveRange(devTokens);
            _db.EmployeeDevices.RemoveRange(devices);
        }

        // Gỡ EmployeeCode trên các tài khoản User liên kết
        var linkedUsers = await _db.Users.Where(u => u.EmployeeCode == emp.EmployeeCode).ToListAsync(ct);
        foreach (var u in linkedUsers)
        {
            u.EmployeeCode = null;
        }

        // Xóa trước toàn bộ các bảng con để thỏa mãn mọi ràng buộc khóa ngoại FK trên SQL Server
        await _db.SaveChangesAsync(ct);

        _db.Employees.Remove(emp);
        _audit.Log("Employee", emp.Id, "ForceDelete",
            $"Xóa cưỡng bức nhân viên {emp.EmployeeCode} - {emp.FullName} ({dayResults.Count} ngày công, {rawPunches.Count} raw punches, {webLogs.Count} web logs)",
            companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = $"Đã xóa hoàn toàn nhân viên '{emp.FullName}' ({emp.EmployeeCode}) và toàn bộ dữ liệu chấm công liên quan." });
    }

    [HttpGet("template-excel")]
    public IActionResult DownloadTemplateExcel()
    {
        _access.EnsureHR();
        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("DanhSachNhanVien");

        var headers = new[]
        {
            "Mã nhân viên (*)",
            "Họ và tên (*)",
            "Phòng ban / Vị trí",
            "Khối nhân viên",
            "Ngày vào làm (DD/MM/YYYY)",
            "Miễn quẹt thẻ (CÓ/KHÔNG)",
            "Ghi chú mặc định"
        };

        for (int i = 0; i < headers.Length; i++)
        {
            var cell = ws.Cell(1, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#1e40af");
            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        }
        ws.Row(1).Height = 28;

        // Dữ liệu mẫu minh họa
        var samples = new[]
        {
            new { Code = "SB001", Name = "Nguyễn Thị Mai", Dept = "Đào tạo", Group = "STANDARD", Date = "01/01/2024", Exempt = "KHÔNG", Note = "Giáo viên Toán trí tuệ" },
            new { Code = "SB002", Name = "Trần Văn Hùng", Dept = "Kinh doanh", Group = "STANDARD", Date = "15/03/2024", Exempt = "KHÔNG", Note = "Chuyên viên tư vấn" },
            new { Code = "SB003", Name = "Lê Hoàng Yến", Dept = "Ban Giám Đốc", Group = "REMOTE", Date = "01/06/2023", Exempt = "CÓ", Note = "Giám đốc chuyên môn (Miễn quẹt)" },
        };

        for (int i = 0; i < samples.Length; i++)
        {
            int r = i + 2;
            var s = samples[i];
            ws.Cell(r, 1).SetValue(s.Code);
            ws.Cell(r, 2).SetValue(s.Name);
            ws.Cell(r, 3).SetValue(s.Dept);
            ws.Cell(r, 4).SetValue(s.Group);
            ws.Cell(r, 5).SetValue(s.Date);
            ws.Cell(r, 6).SetValue(s.Exempt);
            ws.Cell(r, 7).SetValue(s.Note);
        }

        ws.Columns(1, headers.Length).AdjustToContents(12, 45);

        using var memory = new MemoryStream();
        workbook.SaveAs(memory);
        var bytes = memory.ToArray();

        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Mau_Danh_Sach_Nhan_Vien_Superbrain.xlsx");
    }

    [HttpPost("import-excel")]
    public async Task<IActionResult> ImportExcel(int companyId, IFormFile file, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);

        using var stream = file.OpenReadStream();
        using var workbook = new XLWorkbook(stream);
        var ws = workbook.Worksheets.First();

        var existingCodes = (await _db.Employees.Where(e => e.CompanyId == companyId).Select(e => e.EmployeeCode).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var groups = await _db.EmployeeGroups.Where(g => g.CompanyId == companyId).ToListAsync(ct);
        var defaultGroup = groups.FirstOrDefault(g => g.IsDefault) ?? groups.First();

        var depts = await _db.Departments.Where(d => d.CompanyId == companyId).ToListAsync(ct);
        var deptMap = depts.ToDictionary(d => d.Name.Trim().ToLowerInvariant(), d => d);

        int importedCount = 0;
        var errors = new List<string>();

        int lastRow = ws.LastRowUsed()?.RowNumber() ?? 1;
        for (int r = 2; r <= lastRow; r++)
        {
            var empCode = ws.Cell(r, 1).GetString().Trim();
            var fullName = ws.Cell(r, 2).GetString().Trim();
            var deptName = ws.Cell(r, 3).GetString().Trim();
            var groupCodeOrName = ws.Cell(r, 4).GetString().Trim();
            var dateVal = ws.Cell(r, 5).Value;
            var exemptStr = ws.Cell(r, 6).GetString().Trim().ToUpperInvariant();
            var note = ws.Cell(r, 7).GetString().Trim();

            if (string.IsNullOrEmpty(empCode) || string.IsNullOrEmpty(fullName)) continue;

            if (existingCodes.Contains(empCode))
            {
                errors.Add($"Dòng {r}: Mã nhân viên '{empCode}' đã tồn tại trong hội sở.");
                continue;
            }

            // Xử lý bộ phận (Department)
            int? deptId = null;
            if (!string.IsNullOrEmpty(deptName))
            {
                var lowerDept = deptName.ToLowerInvariant();
                if (deptMap.TryGetValue(lowerDept, out var existingDept))
                {
                    deptId = existingDept.Id;
                }
                else
                {
                    var newDept = new Department { CompanyId = companyId, Name = deptName, SortOrder = depts.Count + 1 };
                    _db.Departments.Add(newDept);
                    await _db.SaveChangesAsync(ct);
                    depts.Add(newDept);
                    deptMap[lowerDept] = newDept;
                    deptId = newDept.Id;
                }
            }

            // Xử lý khối nhân viên (Group)
            int targetGroupId = defaultGroup.Id;
            if (!string.IsNullOrEmpty(groupCodeOrName))
            {
                var matched = groups.FirstOrDefault(g =>
                    string.Equals(g.Code, groupCodeOrName, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(g.Name, groupCodeOrName, StringComparison.OrdinalIgnoreCase) ||
                    (groupCodeOrName.Contains("part", StringComparison.OrdinalIgnoreCase) && g.Code.Contains("PART")) ||
                    (groupCodeOrName.Contains("remote", StringComparison.OrdinalIgnoreCase) && g.Code.Contains("REMOTE"))
                );
                if (matched != null)
                {
                    targetGroupId = matched.Id;
                }
            }

            // Xử lý ngày vào làm (hỗ trợ định dạng Excel dd/MM/yyyy, d/M/yyyy, yyyy-MM-dd)
            DateTime startDate = DateTime.Now.Date;
            if (dateVal.IsDateTime)
            {
                startDate = dateVal.GetDateTime().Date;
            }
            else
            {
                var dateStr = ws.Cell(r, 5).GetString().Trim();
                var formats = new[] { "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "d/M/yy", "dd/MM/yy" };
                if (DateTime.TryParseExact(dateStr, formats, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var exactDate))
                {
                    startDate = exactDate.Date;
                }
                else if (DateTime.TryParse(dateStr, new System.Globalization.CultureInfo("vi-VN"), System.Globalization.DateTimeStyles.None, out var parsedDate))
                {
                    startDate = parsedDate.Date;
                }
            }

            // Miễn quẹt thẻ BoD
            bool exempt = exemptStr is "CÓ" or "CO" or "YES" or "1" or "TRUE" or "X";

            var emp = new Employee
            {
                CompanyId = companyId,
                EmployeeCode = empCode,
                FullName = fullName,
                DepartmentId = deptId,
                GroupId = targetGroupId,
                StartDate = startDate,
                ExemptPunch = exempt,
                DefaultNote = string.IsNullOrEmpty(note) ? null : note,
                SortOrder = importedCount + 1,
                CreatedAt = DateTime.Now
            };

            _db.Employees.Add(emp);
            existingCodes.Add(empCode);
            importedCount++;
        }

        await _db.SaveChangesAsync(ct);
        _audit.Log("Employee", null, "ImportExcel", $"Import thành công {importedCount} nhân viên, {errors.Count} lỗi", companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { importedCount, errors });
    }
}
