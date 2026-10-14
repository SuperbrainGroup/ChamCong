using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/[controller]")]
[Route("api/[controller]")]
public class AttendanceController : ControllerBase
{
    private readonly IAttendancePunchService _punchService;
    private readonly IGeofenceService _geofenceService;
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public AttendanceController(
        IAttendancePunchService punchService,
        IGeofenceService geofenceService,
        AppDbContext db,
        AuditService audit)
    {
        _punchService = punchService;
        _geofenceService = geofenceService;
        _db = db;
        _audit = audit;
    }

    /// <summary>Lấy trạng thái chấm công hôm nay của nhân viên: nút bấm (Check-in/Check-out), lượt đã quẹt, chính sách.</summary>
    [HttpGet("state")]
    public async Task<IActionResult> GetAttendanceState(CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { code = "NO_EMPLOYEE", message = "Tài khoản chưa liên kết nhân viên." });
        }

        var nowLocal = AttendancePunchService.ToVietnamTime(DateTime.UtcNow);
        var today = nowLocal.Date;

        var punches = await _db.WebAttendanceLogs
            .AsNoTracking()
            .Where(l => l.EmployeeCode == user.EmployeeCode && l.WorkDate == today)
            .OrderBy(l => l.CheckTimeUtc)
            .ToListAsync(ct);

        var usablePunches = punches.Where(l => l.VerificationStatus == "VALID" || l.ReviewState == "ACCEPTED").ToList();
        var hasValidCheckin = usablePunches.Any();

        var firstPunch = usablePunches.FirstOrDefault();
        var lastPunch = usablePunches.Count > 1 ? usablePunches.Last() : null;

        var minutesSinceFirstPunch = firstPunch != null
            ? (DateTime.UtcNow - firstPunch.CheckTimeUtc).TotalMinutes
            : 0.0;

        const double minWorkSpanMin = 30.0;
        bool canCheckout = hasValidCheckin && minutesSinceFirstPunch >= minWorkSpanMin;
        int remainingMinutesToCheckout = (int)Math.Max(0, Math.Ceiling(minWorkSpanMin - minutesSinceFirstPunch));

        string currentMode;
        if (!hasValidCheckin)
        {
            currentMode = "CHECK_IN";
        }
        else if (lastPunch != null)
        {
            currentMode = "COMPLETED";
        }
        else if (!canCheckout)
        {
            currentMode = "CHECKED_IN";
        }
        else
        {
            currentMode = "CHECK_OUT";
        }

        var pcDevice = await _db.EmployeeDevices.AsNoTracking()
            .FirstOrDefaultAsync(d => d.EmployeeCode == user.EmployeeCode && d.DeviceType == "PC" && d.IsActiveSlot, ct);

        var clientIp = _geofenceService.ResolveClientIp(HttpContext);

        return Ok(new
        {
            workDate = today.ToString("yyyy-MM-dd"),
            currentMode,
            hasValidCheckin,
            canCheckout,
            remainingMinutesToCheckout,
            firstPunchTime = firstPunch != null ? AttendancePunchService.ToVietnamTime(firstPunch.CheckTimeUtc).ToString("HH:mm:ss") : null,
            lastPunchTime = lastPunch != null ? AttendancePunchService.ToVietnamTime(lastPunch.CheckTimeUtc).ToString("HH:mm:ss") : null,
            todayPunchCount = punches.Count,
            clientPublicIp = clientIp,
            pcMacAddress = pcDevice?.FingerprintHash,
            pcApprovalStatus = pcDevice?.ApprovalStatus,
            punches = punches.Select(p => new
            {
                p.WebLogId,
                checkTimeLocal = AttendancePunchService.ToVietnamTime(p.CheckTimeUtc).ToString("HH:mm:ss"),
                p.VerificationStatus,
                p.ReasonCode,
                p.ReviewState,
                p.Channel,
                p.IpOk,
                p.GpsState
            })
        });
    }

    /// <summary>Thực hiện một lượt bấm chấm công.</summary>
    [HttpPost("punch")]
    public async Task<IActionResult> Punch([FromBody] PunchRequestDto dto, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { code = "NO_EMPLOYEE", message = "Tài khoản chưa liên kết nhân viên." });
        }

        var rawDeviceSecret = Request.Headers["X-Device-Secret"].FirstOrDefault();
        var clientMac = Request.Headers["X-Device-Mac"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(dto.MacAddress) && !string.IsNullOrWhiteSpace(clientMac))
        {
            dto.MacAddress = clientMac;
        }

        // Đối với Mobile: Bắt buộc mã bí mật thiết bị
        if (dto.Channel != "PC_WEB" && string.IsNullOrWhiteSpace(rawDeviceSecret))
        {
            return StatusCode(403, new { code = "NO_DEVICE_SECRET", message = "Thiếu mã định danh thiết bị hợp lệ (Mobile)." });
        }

        // Đối với PC: Bắt buộc địa chỉ MAC
        if (dto.Channel == "PC_WEB" && string.IsNullOrWhiteSpace(dto.MacAddress) && string.IsNullOrWhiteSpace(rawDeviceSecret))
        {
            return StatusCode(400, new { code = "NO_MAC_ADDRESS", message = "Thiếu địa chỉ MAC của máy tính để kiểm tra chấm công." });
        }

        var clientIp = _geofenceService.ResolveClientIp(HttpContext);
        dto.UserAgent = Request.Headers.UserAgent.ToString();

        var today = AttendancePunchService.ToVietnamTime(DateTime.UtcNow).Date;
        var usableCount = await _db.WebAttendanceLogs.CountAsync(l =>
            l.EmployeeCode == user.EmployeeCode &&
            l.WorkDate == today &&
            (l.VerificationStatus == "VALID" || l.ReviewState == "ACCEPTED"), ct);

        if (usableCount >= 2)
        {
            return BadRequest(new { code = "ALREADY_COMPLETED", message = "Hôm nay bạn đã thực hiện đủ 1 lượt Check-in và 1 lượt Check-out. Hệ thống không cho phép chấm công thêm để tránh dữ liệu trùng lặp." });
        }

        var result = await _punchService.PunchAsync(user.EmployeeCode, rawDeviceSecret, clientIp, dto, ct);
        return Ok(result);
    }

    /// <summary>Lịch sử chấm công của nhân viên theo ngày (không hiện số phút trễ/phạt trước khi công bố).</summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] string? from, [FromQuery] string? to, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode)) return Ok(new List<object>());

        var fromDate = DateTime.TryParse(from, out var f) ? f.Date : DateTime.Today.AddDays(-30);
        var toDate = DateTime.TryParse(to, out var t) ? t.Date : DateTime.Today;

        var punches = await _db.WebAttendanceLogs
            .AsNoTracking()
            .Where(l => l.EmployeeCode == user.EmployeeCode && l.WorkDate >= fromDate && l.WorkDate <= toDate)
            .OrderByDescending(l => l.CheckTimeUtc)
            .ToListAsync(ct);

        var summaries = await _db.DailyPunchSummaries
            .AsNoTracking()
            .Where(s => s.EmployeeCode == user.EmployeeCode && s.WorkDate >= fromDate && s.WorkDate <= toDate)
            .ToDictionaryAsync(s => s.WorkDate, ct);

        var grouped = punches.GroupBy(p => p.WorkDate).Select(g =>
        {
            summaries.TryGetValue(g.Key, out var sum);
            return new
            {
                workDate = g.Key.ToString("yyyy-MM-dd"),
                inTime = sum?.InTime?.ToString(@"hh\:mm\:ss"),
                outTime = sum?.OutTime?.ToString(@"hh\:mm\:ss"),
                source = sum?.Source ?? "APP",
                hasPendingReview = sum?.HasPendingReview ?? false,
                punches = g.Select(p => new
                {
                    p.WebLogId,
                    time = AttendancePunchService.ToVietnamTime(p.CheckTimeUtc).ToString("HH:mm:ss"),
                    p.VerificationStatus,
                    p.ReasonCode,
                    p.ReviewState,
                    p.Channel
                })
            };
        }).OrderByDescending(x => x.workDate);

        return Ok(grouped);
    }

    /// <summary>Danh sách ngày cần giải trình trong kỳ (thiếu giờ vào/ra, vắng chưa đơn, bị từ chối lượt bấm).</summary>
    [HttpGet("issues")]
    public async Task<IActionResult> GetIssues([FromQuery] int? periodId, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode)) return Ok(new List<object>());

        var emp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.EmployeeCode == user.EmployeeCode, ct);
        if (emp == null) return Ok(new List<object>());

        Period? period = null;
        if (periodId.HasValue)
        {
            period = await _db.Periods.AsNoTracking().FirstOrDefaultAsync(p => p.Id == periodId.Value, ct);
        }
        else
        {
            period = await _db.Periods.AsNoTracking()
                .Where(p => p.CompanyId == emp.CompanyId)
                .OrderByDescending(p => p.FromDate)
                .FirstOrDefaultAsync(ct);
        }

        if (period == null) return Ok(new List<object>());

        // Tìm các ngày trong kỳ có bất thường từ DailyPunchSummary
        var summaries = await _db.DailyPunchSummaries
            .AsNoTracking()
            .Where(s => s.EmployeeCode == user.EmployeeCode && s.WorkDate >= period.FromDate && s.WorkDate <= period.ToDate)
            .ToListAsync(ct);

        var issues = new List<object>();
        foreach (var s in summaries)
        {
            bool isMissing = s.InTime == null || s.OutTime == null;
            if (isMissing || s.HasPendingReview)
            {
                issues.Add(new
                {
                    workDate = s.WorkDate.ToString("yyyy-MM-dd"),
                    inTime = s.InTime?.ToString(@"hh\:mm\:ss"),
                    outTime = s.OutTime?.ToString(@"hh\:mm\:ss"),
                    issueType = isMissing ? "MISSING_PUNCH" : "PENDING_REVIEW",
                    description = isMissing ? "Thiếu lượt Vào hoặc lượt Ra" : "Có lượt bấm đang chờ HCNS duyệt"
                });
            }
        }

        return Ok(issues);
    }
}

[ApiController]
[Authorize]
[Route("api/v1/hr/punches")]
[Route("api/hr/punches")]
public class HrAttendanceController : ControllerBase
{
    private readonly IAttendancePunchService _punchService;
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public HrAttendanceController(
        IAttendancePunchService punchService,
        AppDbContext db,
        AccessService access,
        AuditService audit)
    {
        _punchService = punchService;
        _db = db;
        _access = access;
        _audit = audit;
    }

    public record ReviewPunchesDto(List<long> Ids, string Action, string? Note); // Action = ACCEPT | REJECT
    public record DeletePunchesDto(List<long> Ids);

    /// <summary>HCNS xem danh sách lượt bấm có vị trí, IP, thiết bị, lọc theo trạng thái duyệt cờ.</summary>
    [HttpGet]
    public async Task<IActionResult> GetPunches(
        [FromQuery] string? date,
        [FromQuery] string? fromDate,
        [FromQuery] string? toDate,
        [FromQuery] string? branch,
        [FromQuery] string? status,
        [FromQuery] string? reviewState,
        [FromQuery] string? employeeCode,
        [FromQuery] bool? onlyValid,
        [FromQuery] int? limit,
        CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var q = _db.WebAttendanceLogs.AsNoTracking();

        if (DateTime.TryParse(date, out var d))
        {
            q = q.Where(l => l.WorkDate == d.Date);
        }
        else
        {
            if (DateTime.TryParse(fromDate, out var f))
            {
                q = q.Where(l => l.WorkDate >= f.Date);
            }
            if (DateTime.TryParse(toDate, out var t))
            {
                q = q.Where(l => l.WorkDate <= t.Date);
            }
        }

        if (!string.IsNullOrWhiteSpace(employeeCode))
        {
            q = q.Where(l => l.EmployeeCode == employeeCode.Trim());
        }

        if (onlyValid == true)
        {
            q = q.Where(l => (l.VerificationStatus == "VALID" && l.ReviewState != "REJECTED") || l.ReviewState == "ACCEPTED");
        }

        if (!string.IsNullOrWhiteSpace(branch))
        {
            await _access.EnsureBranchAsync(branch, ct);
            q = q.Where(l => l.DetectedBranchCode == branch);
        }
        else
        {
            var allowedCodes = await _access.AllowedBranchCodesAsync(ct);
            if (allowedCodes != null)
            {
                q = q.Where(l => l.DetectedBranchCode != null && allowedCodes.Contains(l.DetectedBranchCode));
            }
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            q = q.Where(l => l.VerificationStatus == status);
        }

        if (!string.IsNullOrWhiteSpace(reviewState))
        {
            q = q.Where(l => l.ReviewState == reviewState);
        }

        int takeCount = limit.HasValue && limit.Value > 0 ? Math.Min(limit.Value, 2000) : 500;
        var logs = await q.OrderByDescending(l => l.CheckTimeUtc).Take(takeCount).ToListAsync(ct);

        var empCodes = logs.Select(l => l.EmployeeCode).Distinct().ToList();
        var empList = await _db.Employees.AsNoTracking()
            .Where(e => empCodes.Contains(e.EmployeeCode))
            .ToListAsync(ct);
        var empMap = empList.ToDictionary(e => e.EmployeeCode, e => e.FullName);

        var deptIds = empList.Where(e => e.DepartmentId.HasValue).Select(e => e.DepartmentId!.Value).Distinct().ToList();
        var deptMap = await _db.Departments.AsNoTracking()
            .Where(d => deptIds.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, d => d.Name, ct);

        var empDeptMap = empList.ToDictionary(
            e => e.EmployeeCode,
            e => e.DepartmentId.HasValue && deptMap.TryGetValue(e.DepartmentId.Value, out var dn) ? dn : ""
        );

        // Lấy thông tin tóm tắt ngày vào / ra
        var workDates = logs.Select(l => l.WorkDate).Distinct().ToList();
        var summaries = await _db.DailyPunchSummaries.AsNoTracking()
            .Where(s => empCodes.Contains(s.EmployeeCode) && workDates.Contains(s.WorkDate))
            .ToListAsync(ct);
        var summaryMap = summaries.ToDictionary(s => $"{s.EmployeeCode}_{s.WorkDate:yyyy-MM-dd}", s => s);

        var branchCodes = logs.Select(l => l.DetectedBranchCode).Where(c => !string.IsNullOrEmpty(c)).Distinct().ToList();
        var locList = await _db.BranchLocations.AsNoTracking()
            .Where(b => branchCodes.Contains(b.BranchCode) && b.IsActive)
            .ToListAsync(ct);
        var locMap = locList.GroupBy(l => l.BranchCode).ToDictionary(g => g.Key, g => g.First());

        var devIds = logs.Select(l => l.DeviceBindingId).Distinct().ToList();
        var devMap = await _db.EmployeeDevices.AsNoTracking()
            .Where(d => devIds.Contains(d.DeviceBindingId))
            .ToDictionaryAsync(d => d.DeviceBindingId, d => $"{d.DeviceName} ({d.OperatingSystem ?? "OS"} / {d.BrowserInfo ?? "Browser"})", ct);

        var result = logs.Select(l =>
        {
            empMap.TryGetValue(l.EmployeeCode, out var empName);
            empDeptMap.TryGetValue(l.EmployeeCode, out var deptName);
            BranchLocation? loc = null;
            if (l.DetectedBranchCode != null) locMap.TryGetValue(l.DetectedBranchCode, out loc);
            devMap.TryGetValue(l.DeviceBindingId, out var devInfo);

            summaryMap.TryGetValue($"{l.EmployeeCode}_{l.WorkDate:yyyy-MM-dd}", out var daySummary);

            return new
            {
                l.WebLogId,
                l.EmployeeCode,
                employeeName = empName ?? l.EmployeeCode,
                departmentName = deptName ?? "",
                timeLocal = AttendancePunchService.ToVietnamTime(l.CheckTimeUtc).ToString("HH:mm:ss"),
                workDate = l.WorkDate.ToString("yyyy-MM-dd"),
                dailyInTime = daySummary?.InTime?.ToString(@"hh\:mm\:ss"),
                dailyOutTime = daySummary?.OutTime?.ToString(@"hh\:mm\:ss"),
                dailySource = daySummary?.Source ?? "APP",
                dailyPunchCount = daySummary?.UsedPunchCount ?? 1,
                l.Channel,
                l.VerificationStatus,
                l.ReasonCode,
                l.ReviewState,
                l.Latitude,
                l.Longitude,
                l.GpsAccuracyMeters,
                l.DistanceMeters,
                l.ClientPublicIP,
                l.IpOk,
                l.GpsState,
                l.DetectedBranchCode,
                branchName = loc?.LocationName ?? l.DetectedBranchCode,
                branchLatitude = loc?.Latitude,
                branchLongitude = loc?.Longitude,
                branchRadiusMeters = loc?.RadiusMeters,
                deviceInfo = devInfo,
                l.ReviewNote
            };
        });

        return Ok(result);
    }

    /// <summary>HCNS duyệt cờ hàng loạt (Chấp nhận / Từ chối).</summary>
    [HttpPost("review")]
    public async Task<IActionResult> ReviewPunches([FromBody] ReviewPunchesDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var allowedCodes = await _access.AllowedBranchCodesAsync(ct);
        if (allowedCodes != null)
        {
            var targetLogs = await _db.WebAttendanceLogs.AsNoTracking()
                .Where(l => dto.Ids.Contains(l.WebLogId))
                .ToListAsync(ct);
            if (targetLogs.Any(l => string.IsNullOrWhiteSpace(l.DetectedBranchCode) || !allowedCodes.Contains(l.DetectedBranchCode)))
            {
                return StatusCode(403, new { message = "Bạn không có quyền duyệt cờ chấm công của cơ sở khác." });
            }
        }

        bool accept = dto.Action?.Equals("ACCEPT", StringComparison.OrdinalIgnoreCase) == true;
        await _punchService.BatchReviewPunchesAsync(dto.Ids, accept, dto.Note, User.UserId(), ct);

        _audit.Log("Attendance", dto.Ids.FirstOrDefault(), accept ? "AcceptPunchFlag" : "RejectPunchFlag", dto.Note);
        return Ok(new { message = $"Đã { (accept ? "chấp nhận" : "từ chối") } {dto.Ids.Count} lượt bấm thành công." });
    }

    /// <summary>HCNS/Admin xóa dữ liệu lượt chấm công (làm sạch dữ liệu).</summary>
    [HttpDelete]
    [HttpDelete("batch")]
    public async Task<IActionResult> DeletePunches([FromBody] DeletePunchesDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS hoặc Quản trị viên." });
        if (dto.Ids == null || !dto.Ids.Any()) return BadRequest(new { message = "Danh sách lượt bấm cần xóa không được rỗng." });

        var allowedCodes = await _access.AllowedBranchCodesAsync(ct);
        if (allowedCodes != null)
        {
            var targetLogs = await _db.WebAttendanceLogs.AsNoTracking()
                .Where(l => dto.Ids.Contains(l.WebLogId))
                .ToListAsync(ct);
            if (targetLogs.Any(l => string.IsNullOrWhiteSpace(l.DetectedBranchCode) || !allowedCodes.Contains(l.DetectedBranchCode)))
            {
                return StatusCode(403, new { message = "Bạn không có quyền xóa chấm công của cơ sở khác." });
            }
        }

        var deletedCount = await _punchService.BatchDeletePunchesAsync(dto.Ids, User.UserId(), ct);
        _audit.Log("Attendance", dto.Ids.FirstOrDefault(), "DeletePunchLogs", new { DeletedCount = deletedCount, Ids = dto.Ids });

        return Ok(new { message = $"Đã xóa thành công {deletedCount} lượt chấm công.", deletedCount });
    }

    /// <summary>HCNS/Admin xóa 1 lượt chấm công theo ID.</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePunch(long id, CancellationToken ct)
    {
        return await DeletePunches(new DeletePunchesDto(new List<long> { id }), ct);
    }
}
