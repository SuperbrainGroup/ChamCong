using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using ChamCong.Engine;
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
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public AttendanceController(
        IAttendancePunchService punchService,
        IGeofenceService geofenceService,
        AppDbContext db,
        AccessService access,
        AuditService audit)
    {
        _punchService = punchService;
        _geofenceService = geofenceService;
        _db = db;
        _access = access;
        _audit = audit;
    }

    /// <summary>Lấy trạng thái chấm công hôm nay của nhân viên: nút bấm (Check-in/Check-out), lượt đã quẹt, chính sách.</summary>
    [HttpGet("state")]
    public async Task<IActionResult> GetAttendanceState(CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null) return Unauthorized();

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == user.EmployeeCode);
        if (primaryCompanyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        }
        var emp = await empQuery.FirstOrDefaultAsync(ct);

        if (string.IsNullOrWhiteSpace(user.EmployeeCode) || emp == null)
        {
            emp = await _access.EnsureEmployeeProfileAsync(user, primaryCompanyId, ct);
        }

        int? companyId = emp?.CompanyId ?? primaryCompanyId;
        int? groupId = emp?.GroupId;

        var nowLocal = AttendancePunchService.ToVietnamTime(DateTime.UtcNow);
        var today = nowLocal.Date;

        var punchQuery = _db.WebAttendanceLogs
            .AsNoTracking()
            .Where(l => l.EmployeeCode == user.EmployeeCode && l.WorkDate == today);
        if (companyId.HasValue)
        {
            punchQuery = punchQuery.Where(l => l.CompanyId == companyId.Value || l.CompanyId == null);
        }

        var punches = await punchQuery
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

        var paramList = await _db.ParameterValues.AsNoTracking()
            .Where(p => (p.CompanyId == null || p.CompanyId == companyId) && (p.GroupId == null || p.GroupId == groupId))
            .ToListAsync(ct);

        string ResolveParam(string code, string fallback)
        {
            var grp = paramList.FirstOrDefault(p => p.GroupId == groupId && p.Code == code);
            if (grp != null && !string.IsNullOrWhiteSpace(grp.Value)) return grp.Value.Trim();
            var cmp = paramList.FirstOrDefault(p => p.CompanyId == companyId && p.GroupId == null && p.Code == code);
            if (cmp != null && !string.IsNullOrWhiteSpace(cmp.Value)) return cmp.Value.Trim();
            var sys = paramList.FirstOrDefault(p => p.CompanyId == null && p.GroupId == null && p.Code == code);
            if (sys != null && !string.IsNullOrWhiteSpace(sys.Value)) return sys.Value.Trim();
            return fallback;
        }

        var shiftHoursStr = ResolveParam(ParamCatalog.ShiftStandardHours, "08:00-17:00");
        var lunchStartStr = ResolveParam(ParamCatalog.LunchBreakStart, "12:00");
        var lunchMinutesStr = ResolveParam(ParamCatalog.LunchBreakMinutes, "60");
        int.TryParse(lunchMinutesStr, out int lunchMinutes);
        if (lunchMinutes <= 0) lunchMinutes = 60;

        TimeUtil.TryParseRange(shiftHoursStr, out var shiftStartMin, out var shiftEndMin);
        if (shiftStartMin <= 0 && shiftEndMin <= 0)
        {
            shiftStartMin = 480;  // 08:00
            shiftEndMin = 1020;   // 17:00
        }

        var currentMinutes = (int)nowLocal.TimeOfDay.TotalMinutes;
        const int checkoutPrepareMinutes = 30; // 30 phút trước giờ tan ca là bắt đầu khung giờ chuẩn bị ra về
        var checkoutStartMin = Math.Max(shiftStartMin, shiftEndMin - checkoutPrepareMinutes);

        var shiftStartFormatted = TimeUtil.FormatHm(shiftStartMin);
        var shiftEndFormatted = TimeUtil.FormatHm(shiftEndMin);
        var checkoutStartFormatted = TimeUtil.FormatHm(checkoutStartMin);

        bool isCheckinWindow = currentMinutes <= (shiftStartMin + 60);
        bool isCheckoutWindow = currentMinutes >= checkoutStartMin;
        bool isWorkingWindow = currentMinutes > (shiftStartMin + 60) && currentMinutes < checkoutStartMin;
        bool isPastShiftEnd = currentMinutes >= shiftEndMin;

        // 2. Tự động nhận diện trạng thái ca làm việc và thao tác chấm công tương ứng
        string currentMode;
        string shiftStatusLabel;
        string statusDescription;
        bool needExplanation = false;

        if (lastPunch != null)
        {
            currentMode = "COMPLETED";
            shiftStatusLabel = "Đã hoàn thành ca làm việc";
            statusDescription = $"Hôm nay bạn đã hoàn thành đủ 1 lượt Vào ({AttendancePunchService.ToVietnamTime(firstPunch!.CheckTimeUtc):HH:mm}) và 1 lượt Ra ({AttendancePunchService.ToVietnamTime(lastPunch.CheckTimeUtc):HH:mm}).";
        }
        else if (hasValidCheckin)
        {
            if (!canCheckout)
            {
                currentMode = "CHECKED_IN";
                shiftStatusLabel = "Đang trong ca làm việc";
                statusDescription = $"Vừa Check-in lúc {AttendancePunchService.ToVietnamTime(firstPunch!.CheckTimeUtc):HH:mm}. Khóa Check-out tối thiểu 30 phút để chống bấm nhầm (còn {remainingMinutesToCheckout} phút).";
            }
            else
            {
                currentMode = "CHECK_OUT";
                if (isCheckoutWindow || isPastShiftEnd)
                {
                    shiftStatusLabel = "Chuẩn bị tan ca & Sẵn sàng Check-out";
                    statusDescription = $"Đã đến khung giờ chuẩn bị ra về ({checkoutStartFormatted} – {shiftEndFormatted}). Hãy bấm Check-out khi kết thúc công việc.";
                }
                else
                {
                    shiftStatusLabel = "Đang trong ca làm việc";
                    statusDescription = $"Đang làm việc (Check-in lúc {AttendancePunchService.ToVietnamTime(firstPunch!.CheckTimeUtc):HH:mm}). Bạn có thể bấm Check-out khi kết thúc công việc (Giờ tan ca: {shiftEndFormatted}).";
                }
            }
        }
        else
        {
            // CHƯA CHECK-IN
            if (isCheckoutWindow)
            {
                // ĐÃ ĐẾN GIỜ CHUẨN BỊ RA VỀ NHƯNG CHƯA CHECK-IN VÀO CA!
                currentMode = "NEED_EXPLANATION";
                shiftStatusLabel = "Chưa Check-in — Cần giải trình";
                statusDescription = $"Hiện tại ({nowLocal:HH:mm}) đang là giờ chuẩn bị tan ca ({checkoutStartFormatted} – {shiftEndFormatted}) nhưng bạn chưa điểm danh vào ca. Vui lòng gửi Đơn giải trình bổ sung công để được ghi nhận.";
                needExplanation = true;
            }
            else if (isWorkingWindow)
            {
                currentMode = "WORKING_NOT_CHECKED_IN";
                shiftStatusLabel = "Đang trong ca (Chưa Check-in)";
                statusDescription = $"Hiện đang trong ca làm việc ({shiftStartFormatted} – {shiftEndFormatted}) nhưng bạn chưa điểm danh vào ca. Hãy Check-in ngay hoặc làm giải trình nếu quên.";
            }
            else
            {
                currentMode = "CHECK_IN";
                shiftStatusLabel = "Khung giờ vào ca";
                statusDescription = $"Chào bạn! Hãy điểm danh Check-in vào ca làm việc ({shiftStartFormatted} – {shiftEndFormatted}).";
            }
        }

        var devQuery = _db.EmployeeDevices.AsNoTracking()
            .Where(d => d.EmployeeCode == user.EmployeeCode && d.DeviceType == "PC" && d.IsActiveSlot);
        if (companyId.HasValue)
        {
            devQuery = devQuery.Where(d => d.CompanyId == companyId.Value || d.CompanyId == null);
        }
        var pcDevice = await devQuery.FirstOrDefaultAsync(ct);

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
            todayPunchCount = usablePunches.Count,
            totalPunchLogs = punches.Count,
            validPunchCount = usablePunches.Count,
            clientPublicIp = clientIp,
            pcMacAddress = pcDevice?.FingerprintHash,
            pcApprovalStatus = pcDevice?.ApprovalStatus,
            allowCheckoutWithExplanation = needExplanation,
            shift = new
            {
                shiftStart = shiftStartFormatted,
                shiftEnd = shiftEndFormatted,
                checkoutStartTime = checkoutStartFormatted,
                checkoutPrepareMinutes,
                lunchStart = lunchStartStr,
                lunchMinutes,
                standardRange = shiftHoursStr,
                isCheckinWindow,
                isWorkingWindow,
                isCheckoutWindow,
                isPastShiftEnd,
                statusLabel = shiftStatusLabel,
                statusDescription
            },
            explanationPrompt = needExplanation ? new
            {
                required = true,
                suggestedDate = today.ToString("yyyy-MM-dd"),
                suggestedInTime = shiftStartFormatted,
                suggestedOutTime = nowLocal.ToString("HH:mm"),
                reason = "Quên điểm danh vào ca khi đến giờ chuẩn bị ra về"
            } : null,
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
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null) return Unauthorized();

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == user.EmployeeCode);
        if (primaryCompanyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        }
        var emp = await empQuery.FirstOrDefaultAsync(ct);

        if (string.IsNullOrWhiteSpace(user.EmployeeCode) || emp == null)
        {
            emp = await _access.EnsureEmployeeProfileAsync(user, primaryCompanyId, ct);
        }

        int? companyId = emp?.CompanyId ?? primaryCompanyId;

        if (emp != null)
        {
            var checkDate = AttendancePunchService.ToVietnamTime(DateTime.UtcNow).Date;
            if (checkDate < emp.StartDate.Date)
            {
                return BadRequest(new { code = "NOT_STARTED", message = $"Bạn chưa đến ngày bắt đầu làm việc chính thức ({emp.StartDate:dd/MM/yyyy}). Chưa thể chấm công." });
            }
            if (emp.EndDate.HasValue && checkDate > emp.EndDate.Value.Date)
            {
                return BadRequest(new { code = "TERMINATED", message = $"Tài khoản đã ghi nhận nghỉ việc từ ngày {emp.EndDate.Value:dd/MM/yyyy}. Không thể chấm công." });
            }
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
        var countQuery = _db.WebAttendanceLogs.Where(l =>
            l.EmployeeCode == user.EmployeeCode &&
            l.WorkDate == today &&
            (l.VerificationStatus == "VALID" || l.ReviewState == "ACCEPTED"));

        if (companyId.HasValue)
        {
            countQuery = countQuery.Where(l => l.CompanyId == companyId.Value || l.CompanyId == null);
        }

        var usableCount = await countQuery.CountAsync(ct);

        if (usableCount >= 2)
        {
            return BadRequest(new { code = "ALREADY_COMPLETED", message = "Hôm nay bạn đã thực hiện đủ 1 lượt Check-in và 1 lượt Check-out. Hệ thống không cho phép chấm công thêm để tránh dữ liệu trùng lặp." });
        }

        var result = await _punchService.PunchAsync(user.EmployeeCode, rawDeviceSecret, clientIp, dto, companyId, ct);
        return Ok(result);
    }

    /// <summary>Lịch sử chấm công của nhân viên theo ngày (không hiện số phút trễ/phạt trước khi công bố).</summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] string? from, [FromQuery] string? to, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode)) return Ok(new List<object>());

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == user.EmployeeCode);
        if (primaryCompanyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        }
        var emp = await empQuery.FirstOrDefaultAsync(ct);
        int? companyId = emp?.CompanyId ?? primaryCompanyId;

        var fromDate = DateTime.TryParse(from, out var f) ? f.Date : DateTime.Today.AddDays(-30);
        var toDate = DateTime.TryParse(to, out var t) ? t.Date : DateTime.Today;

        var punchLogsQuery = _db.WebAttendanceLogs
            .AsNoTracking()
            .Where(l => l.EmployeeCode == user.EmployeeCode && l.WorkDate >= fromDate && l.WorkDate <= toDate);

        if (companyId.HasValue)
        {
            punchLogsQuery = punchLogsQuery.Where(l => l.CompanyId == companyId.Value || l.CompanyId == null);
        }

        var punches = await punchLogsQuery
            .OrderByDescending(l => l.CheckTimeUtc)
            .ToListAsync(ct);

        var summariesQuery = _db.DailyPunchSummaries
            .AsNoTracking()
            .Where(s => s.EmployeeCode == user.EmployeeCode && s.WorkDate >= fromDate && s.WorkDate <= toDate);

        if (companyId.HasValue)
        {
            summariesQuery = summariesQuery.Where(s => s.CompanyId == companyId.Value);
        }

        var summaries = await summariesQuery.ToDictionaryAsync(s => s.WorkDate, ct);

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
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode)) return Ok(new List<object>());

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == user.EmployeeCode);
        if (primaryCompanyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        }
        var emp = await empQuery.FirstOrDefaultAsync(ct);
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
            .Where(s => s.CompanyId == emp.CompanyId && s.EmployeeCode == user.EmployeeCode && s.WorkDate >= period.FromDate && s.WorkDate <= period.ToDate)
            .ToListAsync(ct);

        var issues = new List<object>();
        foreach (var s in summaries)
        {
            // Trước ngày nhân viên làm việc hoặc sau ngày nghỉ việc -> Không cần giải trình
            if (s.WorkDate.Date < emp.StartDate.Date || (emp.EndDate.HasValue && s.WorkDate.Date > emp.EndDate.Value.Date))
            {
                continue;
            }

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
[Authorize(Policy = "RequireHR")]
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
        [FromQuery] bool? onlyInvalid,
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
        else if (onlyInvalid == true || string.IsNullOrWhiteSpace(status) || status == "ALL")
        {
            // Đối với danh sách cần duyệt / cờ: CHỈ lấy các lượt KHÔNG hợp lệ hoặc đang chờ duyệt
            q = q.Where(l => l.VerificationStatus != "VALID" || l.ReviewState == "PENDING");
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

        if (!string.IsNullOrWhiteSpace(status) && status != "ALL")
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
        var compIds = logs.Select(l => l.CompanyId).Where(c => c.HasValue).Select(c => c!.Value).Distinct().ToList();
        var empQuery = _db.Employees.AsNoTracking().Where(e => empCodes.Contains(e.EmployeeCode));
        if (compIds.Any())
        {
            empQuery = empQuery.Where(e => compIds.Contains(e.CompanyId));
        }
        var empList = await empQuery.ToListAsync(ct);
        var empMap = empList
            .GroupBy(e => $"{e.CompanyId}_{e.EmployeeCode}", StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().FullName, StringComparer.OrdinalIgnoreCase);

        var deptIds = empList.Where(e => e.DepartmentId.HasValue).Select(e => e.DepartmentId!.Value).Distinct().ToList();
        var deptList = await _db.Departments.AsNoTracking()
            .Where(d => deptIds.Contains(d.Id))
            .Select(d => new { d.Id, d.Name })
            .ToListAsync(ct);
        var deptMap = deptList
            .GroupBy(d => d.Id)
            .ToDictionary(g => g.Key, g => g.First().Name);

        var empDeptMap = empList
            .GroupBy(e => $"{e.CompanyId}_{e.EmployeeCode}", StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var emp = g.First();
                    return emp.DepartmentId.HasValue && deptMap.TryGetValue(emp.DepartmentId.Value, out var dn) ? dn : "";
                },
                StringComparer.OrdinalIgnoreCase
            );

        // Lấy thông tin tóm tắt ngày vào / ra
        var workDates = logs.Select(l => l.WorkDate).Distinct().ToList();
        var summaries = await _db.DailyPunchSummaries.AsNoTracking()
            .Where(s => empCodes.Contains(s.EmployeeCode) && workDates.Contains(s.WorkDate) && (!compIds.Any() || compIds.Contains(s.CompanyId)))
            .ToListAsync(ct);
        var summaryMap = summaries
            .GroupBy(s => $"{s.CompanyId}_{s.EmployeeCode}_{s.WorkDate:yyyy-MM-dd}", StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var branchCodes = logs.Select(l => l.DetectedBranchCode).Where(c => !string.IsNullOrEmpty(c)).Distinct().ToList();
        var locList = await _db.BranchLocations.AsNoTracking()
            .Where(b => branchCodes.Contains(b.BranchCode) && b.IsActive)
            .ToListAsync(ct);
        var locMap = locList.GroupBy(l => l.BranchCode).ToDictionary(g => g.Key, g => g.First());

        var devIds = logs.Select(l => l.DeviceBindingId).Distinct().ToList();
        var devMap = await _db.EmployeeDevices.AsNoTracking()
            .Where(d => devIds.Contains(d.DeviceBindingId))
            .ToDictionaryAsync(d => d.DeviceBindingId, ct);

        var result = logs.Select(l =>
        {
            string empKey = l.CompanyId.HasValue ? $"{l.CompanyId}_{l.EmployeeCode}" : l.EmployeeCode;
            if (!empMap.TryGetValue(empKey, out var empName))
            {
                empName = empList.FirstOrDefault(e => string.Equals(e.EmployeeCode, l.EmployeeCode, StringComparison.OrdinalIgnoreCase))?.FullName;
            }
            if (!empDeptMap.TryGetValue(empKey, out var deptName))
            {
                var fallbackEmp = empList.FirstOrDefault(e => string.Equals(e.EmployeeCode, l.EmployeeCode, StringComparison.OrdinalIgnoreCase));
                deptName = fallbackEmp?.DepartmentId.HasValue == true && deptMap.TryGetValue(fallbackEmp.DepartmentId.Value, out var dn) ? dn : "";
            }
            BranchLocation? loc = null;
            if (l.DetectedBranchCode != null) locMap.TryGetValue(l.DetectedBranchCode, out loc);
            devMap.TryGetValue(l.DeviceBindingId, out var dev);

            string devInfoFormatted = dev != null
                ? $"{dev.DeviceName} ({(dev.DeviceType == "PC" ? (!string.IsNullOrEmpty(dev.FingerprintHash) ? $"MAC: {dev.FingerprintHash}" : "Chưa gán MAC") : $"{dev.OperatingSystem} / {dev.BrowserInfo}")})"
                : (l.Channel == "PC_WEB" ? "Máy tính (PC)" : "Điện thoại (Mobile)");

            string sumKey = l.CompanyId.HasValue ? $"{l.CompanyId}_{l.EmployeeCode}_{l.WorkDate:yyyy-MM-dd}" : $"1_{l.EmployeeCode}_{l.WorkDate:yyyy-MM-dd}";
            if (!summaryMap.TryGetValue(sumKey, out var daySummary))
            {
                daySummary = summaries.FirstOrDefault(s => string.Equals(s.EmployeeCode, l.EmployeeCode, StringComparison.OrdinalIgnoreCase) && s.WorkDate == l.WorkDate);
            }

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
                deviceInfo = devInfoFormatted,
                deviceName = dev?.DeviceName,
                deviceType = dev?.DeviceType ?? (l.Channel == "PC_WEB" ? "PC" : "MOBILE"),
                deviceMac = dev?.FingerprintHash,
                operatingSystem = dev?.OperatingSystem,
                browserInfo = dev?.BrowserInfo,
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

    /// <summary>HCNS/Admin xóa toàn bộ dữ liệu quẹt chấm công của một tháng/khoảng ngày cho hội sở.</summary>
    [HttpDelete("by-range")]
    public async Task<IActionResult> DeletePunchesByRange(
        [FromQuery] string fromDate,
        [FromQuery] string toDate,
        [FromQuery] string? branch,
        [FromQuery] int? companyId,
        CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS hoặc Quản trị viên." });

        if (!DateTime.TryParse(fromDate, out var fromD) || !DateTime.TryParse(toDate, out var toD))
        {
            return BadRequest(new { message = "Khoảng ngày không hợp lệ." });
        }

        if (!string.IsNullOrWhiteSpace(branch))
        {
            await _access.EnsureBranchAsync(branch, ct);
        }
        else if (companyId.HasValue)
        {
            await _access.EnsureCompanyAsync(companyId.Value, ct);
        }

        var logQuery = _db.WebAttendanceLogs.Where(l => l.WorkDate >= fromD.Date && l.WorkDate <= toD.Date);
        if (!string.IsNullOrWhiteSpace(branch))
        {
            logQuery = logQuery.Where(l => l.DetectedBranchCode == branch);
        }
        if (companyId.HasValue)
        {
            logQuery = logQuery.Where(l => l.CompanyId == companyId.Value || l.CompanyId == null);
        }

        var logs = await logQuery.ToListAsync(ct);
        int logCount = logs.Count;
        if (logCount > 0)
        {
            _db.WebAttendanceLogs.RemoveRange(logs);
        }

        // Xóa DailyPunchSummaries tương ứng
        var sumQuery = _db.DailyPunchSummaries.Where(s => s.WorkDate >= fromD.Date && s.WorkDate <= toD.Date);
        if (companyId.HasValue)
        {
            sumQuery = sumQuery.Where(s => s.CompanyId == companyId.Value);
        }
        var summaries = await sumQuery.ToListAsync(ct);
        int sumCount = summaries.Count;
        if (sumCount > 0)
        {
            _db.DailyPunchSummaries.RemoveRange(summaries);
        }

        await _db.SaveChangesAsync(ct);
        _audit.Log("Attendance", 0, "DeletePunchesByRange",
            $"Xóa {logCount} lượt quẹt và {sumCount} tổng hợp ngày từ {fromD:dd/MM/yyyy} đến {toD:dd/MM/yyyy}",
            companyId: companyId);

        return Ok(new
        {
            message = $"Đã xóa thành công {logCount} lượt quẹt chấm công và {sumCount} bản ghi tổng hợp ngày từ {fromD:dd/MM/yyyy} đến {toD:dd/MM/yyyy}.",
            deletedLogs = logCount,
            deletedSummaries = sumCount
        });
    }
}

