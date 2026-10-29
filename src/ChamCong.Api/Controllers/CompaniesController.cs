using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Route("api/[controller]")]
[Authorize]
public class CompaniesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public CompaniesController(AppDbContext db, AccessService access, AuditService audit)
    {
        _db = db;
        _access = access;
        _audit = audit;
    }

    public record CompanyDto(int Id, string Code, string Name, bool IsActive, bool HasLogo);
    public record CreateCompanyDto(string Code, string Name);
    public record UpdateCompanyDto(string Name, bool IsActive);

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var allowed = await _access.AllowedCompanyIdsAsync(ct);
        var q = _db.Companies.AsNoTracking();
        if (allowed != null)
        {
            q = q.Where(c => allowed.Contains(c.Id));
        }

        var list = await q.OrderBy(c => c.Name)
            .Select(c => new CompanyDto(c.Id, c.Code, c.Name, c.IsActive, c.Logo != null))
            .ToListAsync(ct);

        return Ok(list);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(id, ct);
        var c = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c == null) return NotFound();

        return Ok(new CompanyDto(c.Id, c.Code, c.Name, c.IsActive, c.Logo != null));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Create([FromBody] CreateCompanyDto dto, CancellationToken ct)
    {
        var code = Text.Required(dto.Code, "Mã hội sở", 30).ToUpperInvariant();
        var name = Text.Required(dto.Name, "Tên hội sở", 200);

        if (await _db.Companies.AnyAsync(c => c.Code == code, ct))
        {
            return BadRequest(new { message = $"Mã hội sở '{code}' đã tồn tại trong hệ thống." });
        }

        var comp = new Company
        {
            Code = code,
            Name = name,
            IsActive = true,
            CreatedAt = DateTime.Now
        };
        _db.Companies.Add(comp);
        await _db.SaveChangesAsync(ct);

        // Khởi tạo các danh mục mặc định cho hội sở: 3 khối, bảng mã chuẩn, tham số
        await DbSeeder.InitializeCompanyDefaultsAsync(_db, comp.Id, _access.Username);

        _audit.Log("Company", comp.Id, "Create", new { code, name }, companyId: comp.Id);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetById), new { id = comp.Id }, new CompanyDto(comp.Id, comp.Code, comp.Name, comp.IsActive, false));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateCompanyDto dto, CancellationToken ct)
    {
        var comp = await _db.Companies.FindAsync(new object[] { id }, ct);
        if (comp == null) return NotFound();

        var name = Text.Required(dto.Name, "Tên hội sở", 200);

        // Ràng buộc: Hội sở đã có kỳ công thì không được ngưng nếu đang active trừ khi xác nhận
        comp.Name = name;
        comp.IsActive = dto.IsActive;

        _audit.Log("Company", comp.Id, "Update", new { name, isActive = dto.IsActive }, companyId: comp.Id);
        await _db.SaveChangesAsync(ct);

        return Ok(new CompanyDto(comp.Id, comp.Code, comp.Name, comp.IsActive, comp.Logo != null));
    }

    [HttpGet("{id}/logo")]
    [AllowAnonymous]
    public async Task<IActionResult> GetLogo(int id, CancellationToken ct)
    {
        var comp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (comp == null || comp.Logo == null) return NotFound();

        return File(comp.Logo, comp.LogoContentType ?? "image/png");
    }

    [HttpPost("{id}/logo")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> UploadLogo(int id, IFormFile file, CancellationToken ct)
    {
        var comp = await _db.Companies.FindAsync(new object[] { id }, ct);
        if (comp == null) return NotFound();

        if (file.Length > 1024 * 1024)
        {
            return BadRequest(new { message = "Kích thước file logo không được vượt quá 1MB." });
        }

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);

        comp.Logo = ms.ToArray();
        comp.LogoContentType = file.ContentType;

        _audit.Log("Company", comp.Id, "UploadLogo", $"Cập nhật logo ({file.Length} bytes)", companyId: comp.Id);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Tải lên logo thành công." });
    }

    [HttpDelete("{id}/logo")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteLogo(int id, CancellationToken ct)
    {
        var comp = await _db.Companies.FindAsync(new object[] { id }, ct);
        if (comp == null) return NotFound();

        comp.Logo = null;
        comp.LogoContentType = null;

        _audit.Log("Company", comp.Id, "DeleteLogo", "Xóa logo", companyId: comp.Id);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã xóa logo." });
    }

    /// <summary>Xóa hội sở thông thường. Nếu hội sở đã có nhân sự hoặc kỳ công thì chặn xóa và yêu cầu xác nhận xóa cưỡng bức.</summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var comp = await _db.Companies.FindAsync(new object[] { id }, ct);
        if (comp == null) return NotFound(new { message = "Không tìm thấy hội sở." });

        if (comp.Code == "SUPERBRAIN" || comp.Id == 1)
        {
            return BadRequest(new { message = "Hội sở gốc 'SUPERBRAIN' là đơn vị mặc định của hệ thống, không thể xóa." });
        }

        var totalCount = await _db.Companies.CountAsync(ct);
        if (totalCount <= 1)
        {
            return BadRequest(new { message = "Hệ thống phải duy trì ít nhất 1 hội sở hoạt động, không thể xóa." });
        }

        var employeeCount = await _db.Employees.CountAsync(e => e.CompanyId == id, ct);
        var periodCount = await _db.Periods.CountAsync(p => p.CompanyId == id, ct);
        var hasAttendance = await _db.DailyPunchSummaries.AnyAsync(d => d.CompanyId == id, ct)
            || await _db.WebAttendanceLogs.AnyAsync(w => w.CompanyId == id, ct);

        if (employeeCount > 0 || periodCount > 0 || hasAttendance)
        {
            return BadRequest(new
            {
                hasDependencies = true,
                employeeCount,
                periodCount,
                message = $"Hội sở '{comp.Name}' đang có {employeeCount} nhân sự và {periodCount} kỳ công trong hệ thống. Bạn chỉ có thể chuyển sang trạng thái 'Ngưng sử dụng' hoặc Quản trị viên (Admin) có thể thực hiện 'Xóa vĩnh viễn' (xóa sạch toàn bộ dữ liệu liên quan)."
            });
        }

        try
        {
            var strategy = _db.Database.CreateExecutionStrategy();
            await strategy.ExecuteAsync(async () =>
            {
                using var trans = await _db.Database.BeginTransactionAsync(ct);

                // Dọn dẹp cấu hình mặc định (phòng ban, khối, bảng mã, tham số...)
                await CleanupCompanyConfigAsync(comp, ct);

                var auditLogs = await _db.AuditLogs.Where(a => a.CompanyId == id).ToListAsync(ct);
                foreach (var al in auditLogs) al.CompanyId = null;

                _db.Companies.Remove(comp);
                _audit.Log("Company", comp.Id, "Delete", $"Xóa hội sở {comp.Code} - {comp.Name}", companyId: comp.Id);
                await _db.SaveChangesAsync(ct);
                await trans.CommitAsync(ct);
            });

            return Ok(new { message = $"Đã xóa hội sở {comp.Name} thành công." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Lỗi khi xóa hội sở: " + ex.Message });
        }
    }

    /// <summary>Xóa cưỡng bức hội sở: Xóa sạch toàn bộ nhân viên, kỳ công, chấm công, bảng mã và cấu hình liên quan.</summary>
    [HttpDelete("{id}/force")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> ForceDelete(int id, CancellationToken ct)
    {
        var comp = await _db.Companies.FindAsync(new object[] { id }, ct);
        if (comp == null) return NotFound(new { message = "Không tìm thấy hội sở." });

        if (comp.Code == "SUPERBRAIN" || comp.Id == 1)
        {
            return BadRequest(new { message = "Hội sở gốc 'SUPERBRAIN' là đơn vị mặc định của hệ thống, không thể xóa." });
        }

        var totalCount = await _db.Companies.CountAsync(ct);
        if (totalCount <= 1)
        {
            return BadRequest(new { message = "Hệ thống phải duy trì ít nhất 1 hội sở hoạt động, không thể xóa." });
        }

        try
        {
            var strategy = _db.Database.CreateExecutionStrategy();
            await strategy.ExecuteAsync(async () =>
            {
                using var trans = await _db.Database.BeginTransactionAsync(ct);

                var empList = await _db.Employees.Where(e => e.CompanyId == id).ToListAsync(ct);
                var empIds = empList.Select(e => e.Id).ToList();
                var empCodes = empList.Select(e => e.EmployeeCode).Where(c => !string.IsNullOrEmpty(c)).ToList();

                var periodList = await _db.Periods.Where(p => p.CompanyId == id).ToListAsync(ct);
                var periodIds = periodList.Select(p => p.Id).ToList();

                // 1. Giải phóng bảng con của Publications: Disputes và PublishedLines trước
                var pubIds = new List<int>();
                if (periodIds.Count > 0)
                {
                    var pubList = await _db.TimesheetPublications.Where(tp => periodIds.Contains(tp.PeriodId)).ToListAsync(ct);
                    pubIds = pubList.Select(p => p.PublicationId).ToList();
                }

                if (pubIds.Count > 0 || empCodes.Count > 0)
                {
                    var disputes = await _db.TimesheetDisputes.Where(d => (pubIds.Count > 0 && pubIds.Contains(d.PublicationId)) || empCodes.Contains(d.EmployeeCode)).ToListAsync(ct);
                    if (disputes.Count > 0)
                    {
                        _db.TimesheetDisputes.RemoveRange(disputes);
                        await _db.SaveChangesAsync(ct);
                    }

                    var pubLines = await _db.TimesheetPublishedLines.Where(l => (pubIds.Count > 0 && pubIds.Contains(l.PublicationId)) || empCodes.Contains(l.EmployeeCode)).ToListAsync(ct);
                    if (pubLines.Count > 0)
                    {
                        _db.TimesheetPublishedLines.RemoveRange(pubLines);
                        await _db.SaveChangesAsync(ct);
                    }
                }

                if (pubIds.Count > 0)
                {
                    var pubList = await _db.TimesheetPublications.Where(tp => pubIds.Contains(tp.PublicationId)).ToListAsync(ct);
                    if (pubList.Count > 0)
                    {
                        _db.TimesheetPublications.RemoveRange(pubList);
                        await _db.SaveChangesAsync(ct);
                    }
                }

                // 2. RawPunches và ImportBatches: Xóa RawPunches trước vì có FK_RawPunches_Batches trỏ tới ImportBatches
                var rawPunches = await _db.RawPunches.Where(p => (periodIds.Count > 0 && periodIds.Contains(p.PeriodId)) || (p.EmployeeId != null && empIds.Contains(p.EmployeeId.Value))).ToListAsync(ct);
                if (rawPunches.Count > 0)
                {
                    _db.RawPunches.RemoveRange(rawPunches);
                    await _db.SaveChangesAsync(ct);
                }

                if (periodIds.Count > 0)
                {
                    var importBatches = await _db.ImportBatches.Where(ib => periodIds.Contains(ib.PeriodId)).ToListAsync(ct);
                    var batchIds = importBatches.Select(b => b.Id).ToList();
                    if (batchIds.Count > 0)
                    {
                        var punchesWithBatch = await _db.RawPunches.Where(p => p.BatchId != null && batchIds.Contains(p.BatchId.Value)).ToListAsync(ct);
                        if (punchesWithBatch.Count > 0)
                        {
                            foreach (var p in punchesWithBatch) p.BatchId = null;
                            await _db.SaveChangesAsync(ct);
                        }
                    }

                    if (importBatches.Count > 0)
                    {
                        _db.ImportBatches.RemoveRange(importBatches);
                        await _db.SaveChangesAsync(ct);
                    }

                    var exportHist = await _db.ExportHistory.Where(eh => periodIds.Contains(eh.PeriodId)).ToListAsync(ct);
                    if (exportHist.Count > 0)
                    {
                        _db.ExportHistory.RemoveRange(exportHist);
                        await _db.SaveChangesAsync(ct);
                    }

                    var periodNotes = await _db.PeriodNotes.Where(pn => periodIds.Contains(pn.PeriodId)).ToListAsync(ct);
                    if (periodNotes.Count > 0)
                    {
                        _db.PeriodNotes.RemoveRange(periodNotes);
                        await _db.SaveChangesAsync(ct);
                    }
                }

                // 3. Kết quả công & Quỹ phép & Sao lưu
                if (empIds.Count > 0)
                {
                    var backups = await _db.DayResultManualBackups.Where(b => empIds.Contains(b.EmployeeId)).ToListAsync(ct);
                    if (backups.Count > 0)
                    {
                        _db.DayResultManualBackups.RemoveRange(backups);
                        await _db.SaveChangesAsync(ct);
                    }

                    var funds = await _db.LeaveFunds.Where(f => empIds.Contains(f.EmployeeId)).ToListAsync(ct);
                    if (funds.Count > 0)
                    {
                        _db.LeaveFunds.RemoveRange(funds);
                        await _db.SaveChangesAsync(ct);
                    }

                    var ledger = await _db.LeaveLedger.Where(l => empIds.Contains(l.EmployeeId)).ToListAsync(ct);
                    if (ledger.Count > 0)
                    {
                        _db.LeaveLedger.RemoveRange(ledger);
                        await _db.SaveChangesAsync(ct);
                    }

                    var pNotes = await _db.PeriodNotes.Where(pn => empIds.Contains(pn.EmployeeId)).ToListAsync(ct);
                    if (pNotes.Count > 0)
                    {
                        _db.PeriodNotes.RemoveRange(pNotes);
                        await _db.SaveChangesAsync(ct);
                    }
                }

                var dayResults = await _db.DayResults.Where(r => (periodIds.Count > 0 && periodIds.Contains(r.PeriodId)) || (empIds.Count > 0 && empIds.Contains(r.EmployeeId))).ToListAsync(ct);
                if (dayResults.Count > 0)
                {
                    _db.DayResults.RemoveRange(dayResults);
                    await _db.SaveChangesAsync(ct);
                }

                // 4. Lấy danh sách thiết bị & Thiết bị liên kết
                var empDevices = await _db.EmployeeDevices
                    .Where(d => d.CompanyId == id || (d.EmployeeCode != null && empCodes.Contains(d.EmployeeCode)))
                    .ToListAsync(ct);
                var bindingIds = empDevices.Select(d => (int?)d.DeviceBindingId).ToList();
                var bindingIntIds = empDevices.Select(d => d.DeviceBindingId).ToList();

                // 4.1. Xóa Điều chỉnh giờ & Tóm tắt chấm công ngày (DailyPunchSummaries & TimeAdjustments)
                var adjustments = await _db.TimeAdjustments
                    .Where(a => a.CompanyId == id || empCodes.Contains(a.EmployeeCode))
                    .ToListAsync(ct);
                if (adjustments.Count > 0)
                {
                    _db.TimeAdjustments.RemoveRange(adjustments);
                    await _db.SaveChangesAsync(ct);
                }

                var dailySummaries = await _db.DailyPunchSummaries
                    .Where(d => d.CompanyId == id || empCodes.Contains(d.EmployeeCode))
                    .ToListAsync(ct);
                if (dailySummaries.Count > 0)
                {
                    _db.DailyPunchSummaries.RemoveRange(dailySummaries);
                    await _db.SaveChangesAsync(ct);
                }

                // 4.2. XÓA WebAttendanceLogs TRƯỚC EmployeeDevices để không bao giờ vi phạm ràng buộc FK_Log_Dev
                var webLogs = await _db.WebAttendanceLogs
                    .Where(w => w.CompanyId == id 
                             || (w.DetectedBranchCode != null && w.DetectedBranchCode == comp.Code) 
                             || empCodes.Contains(w.EmployeeCode)
                             || (bindingIntIds.Count > 0 && bindingIntIds.Contains(w.DeviceBindingId)))
                    .ToListAsync(ct);
                if (webLogs.Count > 0)
                {
                    _db.WebAttendanceLogs.RemoveRange(webLogs);
                    await _db.SaveChangesAsync(ct);
                }

                // 4.3. Xóa RefreshTokens của thiết bị & Xóa EmployeeDevices
                if (empDevices.Count > 0)
                {
                    var devTokens = await _db.RefreshTokens
                        .Where(rt => bindingIds.Contains(rt.DeviceBindingId))
                        .ToListAsync(ct);
                    if (devTokens.Count > 0)
                    {
                        _db.RefreshTokens.RemoveRange(devTokens);
                        await _db.SaveChangesAsync(ct);
                    }
                    _db.EmployeeDevices.RemoveRange(empDevices);
                    await _db.SaveChangesAsync(ct);
                }

                // 4.4. Xóa Đơn từ & Tệp đính kèm (EmployeeRequests & RequestAttachments)
                var empRequests = await _db.EmployeeRequests
                    .Include(r => r.Attachments)
                    .Where(r => r.CompanyId == id || (r.EmployeeCode != null && empCodes.Contains(r.EmployeeCode)))
                    .ToListAsync(ct);
                if (empRequests.Count > 0)
                {
                    foreach (var req in empRequests)
                    {
                        if (req.Attachments != null && req.Attachments.Count > 0)
                            _db.RequestAttachments.RemoveRange(req.Attachments);
                    }
                    await _db.SaveChangesAsync(ct);
                    _db.EmployeeRequests.RemoveRange(empRequests);
                    await _db.SaveChangesAsync(ct);
                }

                // 4.5. Xóa Nghỉ phép (LeaveRequests)
                var leaveRequests = await _db.LeaveRequests
                    .Where(r => r.CompanyId == id || empIds.Contains(r.EmployeeId))
                    .ToListAsync(ct);
                if (leaveRequests.Count > 0)
                {
                    _db.LeaveRequests.RemoveRange(leaveRequests);
                    await _db.SaveChangesAsync(ct);
                }

                // 4.6. Xóa Phân công chi nhánh (BranchAssignments)
                var branchAssignments = await _db.EmployeeBranchAssignments
                    .Where(b => b.CompanyId == id || b.BranchCode == comp.Code || empCodes.Contains(b.EmployeeCode))
                    .ToListAsync(ct);
                if (branchAssignments.Count > 0)
                {
                    _db.EmployeeBranchAssignments.RemoveRange(branchAssignments);
                    await _db.SaveChangesAsync(ct);
                }

                // 4.7. Xóa Cảnh báo HR (HrAlerts)
                var hrAlerts = await _db.HrAlerts
                    .Where(a => a.BranchCode == comp.Code || (a.EmployeeCode != null && empCodes.Contains(a.EmployeeCode)))
                    .ToListAsync(ct);
                if (hrAlerts.Count > 0)
                {
                    _db.HrAlerts.RemoveRange(hrAlerts);
                    await _db.SaveChangesAsync(ct);
                }

                // 4.8. Xóa Lịch làm việc đăng ký (WorkSchedules)
                var workSchedules = await _db.WorkSchedules
                    .Where(s => s.CompanyId == id || (s.EmployeeCode != null && empCodes.Contains(s.EmployeeCode)))
                    .ToListAsync(ct);
                if (workSchedules.Count > 0)
                {
                    _db.WorkSchedules.RemoveRange(workSchedules);
                    await _db.SaveChangesAsync(ct);
                }

                // 5. Xóa Periods
                if (periodList.Count > 0)
                {
                    _db.Periods.RemoveRange(periodList);
                    await _db.SaveChangesAsync(ct);
                }

                // 6. Gỡ liên kết tài khoản User.EmployeeCode
                if (empCodes.Count > 0)
                {
                    var linkedUsers = await _db.Users.Where(u => u.EmployeeCode != null && empCodes.Contains(u.EmployeeCode)).ToListAsync(ct);
                    foreach (var u in linkedUsers) u.EmployeeCode = null;
                    await _db.SaveChangesAsync(ct);
                }

                // 7. Xóa Nhân viên
                if (empList.Count > 0)
                {
                    _db.Employees.RemoveRange(empList);
                    await _db.SaveChangesAsync(ct);
                }

                // 8. Xóa ParameterValues trước khi xóa EmployeeGroups (vì có FK_ParameterValues_Groups)
                var pVals = await _db.ParameterValues.Where(p => p.CompanyId == id).ToListAsync(ct);
                if (pVals.Count > 0)
                {
                    _db.ParameterValues.RemoveRange(pVals);
                    await _db.SaveChangesAsync(ct);
                }

                // 9. Xóa Phòng ban, Khối
                var depts = await _db.Departments.Where(d => d.CompanyId == id).ToListAsync(ct);
                if (depts.Count > 0) _db.Departments.RemoveRange(depts);

                var groups = await _db.EmployeeGroups.Where(g => g.CompanyId == id).ToListAsync(ct);
                if (groups.Count > 0) _db.EmployeeGroups.RemoveRange(groups);
                await _db.SaveChangesAsync(ct);

                // 10. Cấu hình chi nhánh (Locations, Networks, Scopes)
                var locs = await _db.BranchLocations.Where(l => l.BranchCode == comp.Code).ToListAsync(ct);
                if (locs.Count > 0) _db.BranchLocations.RemoveRange(locs);

                var nets = await _db.BranchNetworks.Where(n => n.BranchCode == comp.Code).ToListAsync(ct);
                if (nets.Count > 0) _db.BranchNetworks.RemoveRange(nets);

                var scopes = await _db.HrBranchScopes.Where(s => s.BranchCode == comp.Code).ToListAsync(ct);
                if (scopes.Count > 0) _db.HrBranchScopes.RemoveRange(scopes);

                // 11. Cấu hình & Lịch & Phân quyền user
                var codes = await _db.AttendanceCodes.Where(c => c.CompanyId == id).ToListAsync(ct);
                if (codes.Count > 0) _db.AttendanceCodes.RemoveRange(codes);

                var cDays = await _db.CalendarDays.Where(c => c.CompanyId == id).ToListAsync(ct);
                if (cDays.Count > 0) _db.CalendarDays.RemoveRange(cDays);

                var userComps = await _db.UserCompanies.Where(uc => uc.CompanyId == id).ToListAsync(ct);
                if (userComps.Count > 0) _db.UserCompanies.RemoveRange(userComps);

                var auditLogs = await _db.AuditLogs.Where(a => a.CompanyId == id).ToListAsync(ct);
                foreach (var al in auditLogs) al.CompanyId = null;
                await _db.SaveChangesAsync(ct);

                // 12. Ghi AuditLog hệ thống trước khi xóa Company (để companyId là null để tránh vi phạm FK)
                _audit.Log("Company", comp.Id, "ForceDelete",
                    $"Xóa vĩnh viễn hội sở {comp.Code} - {comp.Name} ({empList.Count} nhân sự, {periodList.Count} kỳ công, {dayResults.Count} ngày công)",
                    companyId: null);

                // 13. Xóa Company
                _db.Companies.Remove(comp);

                await _db.SaveChangesAsync(ct);
                await trans.CommitAsync(ct);
            });

            return Ok(new { message = $"Đã xóa vĩnh viễn hội sở {comp.Name} và toàn bộ dữ liệu liên quan thành công." });
        }
        catch (Exception ex)
        {
            var msg = ex.InnerException != null ? $"{ex.Message} --> {ex.InnerException.Message}" : ex.Message;
            return StatusCode(500, new { message = "Lỗi khi xóa cưỡng bức hội sở: " + msg });
        }
    }

    private async Task CleanupCompanyConfigAsync(Company comp, CancellationToken ct)
    {
        var id = comp.Id;

        // 1. Phải xóa ParameterValues trước vì có FK_ParameterValues_Groups trỏ vào EmployeeGroups
        var pVals = await _db.ParameterValues.Where(p => p.CompanyId == id).ToListAsync(ct);
        if (pVals.Count > 0)
        {
            _db.ParameterValues.RemoveRange(pVals);
            await _db.SaveChangesAsync(ct);
        }

        // 2. Xóa các danh mục cấu hình khác
        var codes = await _db.AttendanceCodes.Where(c => c.CompanyId == id).ToListAsync(ct);
        if (codes.Count > 0) _db.AttendanceCodes.RemoveRange(codes);

        var cDays = await _db.CalendarDays.Where(c => c.CompanyId == id).ToListAsync(ct);
        if (cDays.Count > 0) _db.CalendarDays.RemoveRange(cDays);

        var userComps = await _db.UserCompanies.Where(uc => uc.CompanyId == id).ToListAsync(ct);
        if (userComps.Count > 0) _db.UserCompanies.RemoveRange(userComps);

        var locs = await _db.BranchLocations.Where(l => l.BranchCode == comp.Code).ToListAsync(ct);
        if (locs.Count > 0) _db.BranchLocations.RemoveRange(locs);

        var nets = await _db.BranchNetworks.Where(n => n.BranchCode == comp.Code).ToListAsync(ct);
        if (nets.Count > 0) _db.BranchNetworks.RemoveRange(nets);

        var scopes = await _db.HrBranchScopes.Where(s => s.BranchCode == comp.Code).ToListAsync(ct);
        if (scopes.Count > 0) _db.HrBranchScopes.RemoveRange(scopes);

        var depts = await _db.Departments.Where(d => d.CompanyId == id).ToListAsync(ct);
        if (depts.Count > 0) _db.Departments.RemoveRange(depts);

        var groups = await _db.EmployeeGroups.Where(g => g.CompanyId == id).ToListAsync(ct);
        if (groups.Count > 0) _db.EmployeeGroups.RemoveRange(groups);

        await _db.SaveChangesAsync(ct);
    }
}
