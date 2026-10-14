using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Services;

public class PunchRequestDto
{
    public Guid ClientRequestId { get; set; }
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public decimal? Accuracy { get; set; }
    public string? GpsError { get; set; }
    public string Channel { get; set; } = "MOBILE_PWA"; // MOBILE_PWA | PC_WEB
    public string? UserAgent { get; set; }
    public string? MacAddress { get; set; }
}

public class PunchResultDto
{
    public long WebLogId { get; set; }
    public DateTime CheckTimeUtc { get; set; }
    public DateTime CheckTimeLocal { get; set; }
    public string WorkDate { get; set; } = "";
    public string VerificationStatus { get; set; } = "VALID";
    public string? ReasonCode { get; set; }
    public string ReviewState { get; set; } = "NONE";
    public string Message { get; set; } = "";
    public string? DetectedBranchCode { get; set; }
    public bool? IpOk { get; set; }
    public string GpsState { get; set; } = "NA";
    public double? DistanceMeters { get; set; }
}

public interface IAttendancePunchService
{
    Task<PunchResultDto> PunchAsync(
        string employeeCode,
        string? rawDeviceSecret,
        string clientIp,
        PunchRequestDto request,
        CancellationToken ct = default);

    Task AggregateDailySummaryAsync(string employeeCode, DateTime workDate, CancellationToken ct = default);

    Task BatchReviewPunchesAsync(
        List<long> logIds,
        bool accept,
        string? note,
        int reviewerUserId,
        CancellationToken ct = default);

    Task<int> BatchDeletePunchesAsync(
        List<long> logIds,
        int deleterUserId,
        CancellationToken ct = default);

    Task CheckAndRaiseIpDriftAlertAsync(string branchCode, string clientIp, CancellationToken ct = default);
}

public class AttendancePunchService : IAttendancePunchService
{
    private readonly AppDbContext _db;
    private readonly IDeviceService _deviceService;
    private readonly IGeofenceService _geofenceService;
    private readonly ILogger<AttendancePunchService> _logger;

    public AttendancePunchService(
        AppDbContext db,
        IDeviceService deviceService,
        IGeofenceService geofenceService,
        ILogger<AttendancePunchService> logger)
    {
        _db = db;
        _deviceService = deviceService;
        _geofenceService = geofenceService;
        _logger = logger;
    }

    private static readonly TimeZoneInfo VnTimeZone = TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time");

    public static DateTime ToVietnamTime(DateTime utc)
    {
        try { return TimeZoneInfo.ConvertTimeFromUtc(utc, VnTimeZone); }
        catch { return utc.AddHours(7); }
    }

    public async Task<PunchResultDto> PunchAsync(
        string employeeCode,
        string? rawDeviceSecret,
        string clientIp,
        PunchRequestDto request,
        CancellationToken ct = default)
    {
        // 1. Kiểm tra thiết bị đã duyệt
        EmployeeDevice? device = null;

        if (request.Channel == "PC_WEB")
        {
            // Đối với thiết bị checkin là PC: kiểm tra địa chỉ MAC Address
            var mac = request.MacAddress?.Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(mac))
            {
                throw AppException.Bad("Thiếu địa chỉ MAC của thiết bị PC để kiểm tra chấm công.");
            }

            // Tìm thiết bị PC đã đăng ký của nhân viên
            var pcDevice = await _db.EmployeeDevices.FirstOrDefaultAsync(d =>
                d.EmployeeCode == employeeCode &&
                d.DeviceType == "PC" &&
                d.IsActiveSlot, ct);

            // 1. Nếu chưa đăng ký MAC Address
            if (pcDevice == null || string.IsNullOrWhiteSpace(pcDevice.FingerprintHash))
            {
                throw AppException.Bad("Tài khoản của bạn chưa đăng ký MAC Address cho máy tính. Vui lòng truy cập tab 'Thiết Bị & Địa Chỉ MAC' và bấm 'Đăng ký MAC Address' trước khi chấm công.");
            }

            // 2. Nếu địa chỉ MAC không khớp với máy đã đăng ký (sai máy)
            var registeredMac = pcDevice.FingerprintHash.Trim();
            if (!registeredMac.Equals(mac, StringComparison.OrdinalIgnoreCase))
            {
                _db.SecurityAuditLogs.Add(new SecurityAuditLog
                {
                    EventType = "MAC_MISMATCH_PUNCH_BLOCKED",
                    Detail = $"Nhân viên {employeeCode} chấm công từ máy có MAC {mac} không khớp với máy đã đăng ký {registeredMac}.",
                    PublicIP = clientIp,
                    UserAgent = request.UserAgent
                });
                await _db.SaveChangesAsync(ct);

                throw AppException.Forbidden($"Địa chỉ MAC của máy tính này ({mac}) không khớp với máy tính đã đăng ký của bạn ({registeredMac}). Không thể chấm công từ máy lạ để tránh chấm công hộ!");
            }

            device = pcDevice;
        }
        else
        {
            // Đối với thiết bị checkin là Mobile: kiểm tra thiết bị đã duyệt qua device secret
            device = await _deviceService.ValidateDeviceSecretAsync(employeeCode, rawDeviceSecret, ct);
            if (device == null)
            {
                // Ghi nhật ký an ninh
                _db.SecurityAuditLogs.Add(new SecurityAuditLog
                {
                    EventType = "DEVICE_REJECTED",
                    Detail = $"Nhân viên {employeeCode} chấm công từ thiết bị di động chưa duyệt hoặc sai mã bí mật ({request.Channel}).",
                    PublicIP = clientIp,
                    UserAgent = request.UserAgent
                });
                await _db.SaveChangesAsync(ct);
                throw AppException.Forbidden("Thiết bị di động này chưa được phê duyệt hoặc không khớp với tài khoản.");
            }
        }

        // 2. Chống ghi trùng qua ClientRequestId
        var existingLog = await _db.WebAttendanceLogs.FirstOrDefaultAsync(l => l.ClientRequestId == request.ClientRequestId, ct);
        if (existingLog != null)
        {
            var localTime = ToVietnamTime(existingLog.CheckTimeUtc);
            return new PunchResultDto
            {
                WebLogId = existingLog.WebLogId,
                CheckTimeUtc = existingLog.CheckTimeUtc,
                CheckTimeLocal = localTime,
                WorkDate = existingLog.WorkDate.ToString("yyyy-MM-dd"),
                VerificationStatus = existingLog.VerificationStatus,
                ReasonCode = existingLog.ReasonCode,
                ReviewState = existingLog.ReviewState,
                Message = "Lượt bấm đã được ghi nhận trước đó.",
                DetectedBranchCode = existingLog.DetectedBranchCode,
                IpOk = existingLog.IpOk,
                GpsState = existingLog.GpsState,
                DistanceMeters = (double?)existingLog.DistanceMeters
            };
        }

        var nowUtc = DateTime.UtcNow;
        var nowLocal = ToVietnamTime(nowUtc);
        var workDate = nowLocal.Date;

        // 3. Giới hạn tần suất và số lượt: Mỗi ngày chỉ check-in 1 lần và check-out 1 lần (tối đa 2 lượt hợp lệ)
        var recentLogs = await _db.WebAttendanceLogs
            .Where(l => l.EmployeeCode == employeeCode && l.WorkDate == workDate)
            .OrderBy(l => l.CheckTimeUtc)
            .ToListAsync(ct);

        var usableLogs = recentLogs.Where(l => l.VerificationStatus == "VALID" || l.ReviewState == "ACCEPTED").ToList();
        if (usableLogs.Count >= 2)
        {
            throw AppException.Bad("Hôm nay bạn đã thực hiện đủ 1 lượt Check-in và 1 lượt Check-out. Hệ thống không cho phép chấm công thêm để tránh dữ liệu trùng lặp.");
        }

        const int minIntervalSeconds = 60;
        var lastLog = recentLogs.LastOrDefault();
        if (lastLog != null && (nowUtc - lastLog.CheckTimeUtc).TotalSeconds < minIntervalSeconds)
        {
            throw AppException.Bad($"Thao tác quá nhanh. Vui lòng đợi ít nhất {minIntervalSeconds} giây giữa 2 lần bấm.");
        }

        // 4. Lấy chính sách chấm công áp dụng (CHECKIN_POLICY)
        string policy = "OFFICE_STRICT";
        var emp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.EmployeeCode == employeeCode, ct);
        if (emp != null)
        {
            var groupParam = await _db.ParameterValues
                .AsNoTracking()
                .Where(p => p.GroupId == emp.GroupId && p.Code == "CHECKIN_POLICY")
                .OrderByDescending(p => p.EffectiveFrom)
                .FirstOrDefaultAsync(ct);

            if (groupParam != null && !string.IsNullOrWhiteSpace(groupParam.Value))
            {
                policy = groupParam.Value.Trim();
            }
        }

        // 5. Đánh giá hiện diện (Geofence + CIDR IP)
        var eval = await _geofenceService.EvaluatePresenceAsync(
            employeeCode,
            clientIp,
            request.Channel,
            request.Latitude,
            request.Longitude,
            request.Accuracy,
            request.GpsError,
            policy,
            ct);

        // Đối với Mobile: kiểm tra nếu bị từ chối do không ở mạng văn phòng
        if (request.Channel != "PC_WEB")
        {
            if (eval.ReasonCode == "BRANCH_NO_PUBLIC_IP")
            {
                throw AppException.Bad(eval.Message ?? "Hội sở chưa được thiết lập Mạng Public IP văn phòng. Vui lòng liên hệ Admin/HCNS để cài đặt IP văn phòng.");
            }
            if (eval.ReasonCode == "PC_NOT_IN_OFFICE")
            {
                throw AppException.Bad(eval.Message ?? "Thiết bị hiện tại không kết nối mạng văn phòng hội sở.");
            }
        }

        // 6. Ghi nhật ký lượt bấm bất biến
        var isPc = request.Channel == "PC_WEB";
        var userAgentInfo = isPc && !string.IsNullOrWhiteSpace(request.MacAddress)
            ? $"{request.UserAgent} [MAC: {request.MacAddress}]"
            : request.UserAgent;

        var log = new WebAttendanceLog
        {
            ClientRequestId = request.ClientRequestId == Guid.Empty ? Guid.NewGuid() : request.ClientRequestId,
            EmployeeCode = employeeCode,
            DeviceBindingId = device.DeviceBindingId,
            Channel = request.Channel,
            CheckTimeUtc = nowUtc,
            WorkDate = workDate,
            DetectedBranchCode = eval.DetectedBranchCode,
            CheckinPolicy = isPc ? "PC_MAC_AUTH" : policy,
            Latitude = isPc ? null : request.Latitude,
            Longitude = isPc ? null : request.Longitude,
            GpsAccuracyMeters = isPc ? null : request.Accuracy,
            DistanceMeters = isPc ? null : (eval.DistanceMeters.HasValue ? (decimal?)eval.DistanceMeters.Value : null),
            ClientPublicIP = clientIp,
            IpOk = isPc ? true : eval.IpOk,
            GpsState = isPc ? "NA" : eval.GpsState,
            VerificationStatus = eval.VerificationStatus,
            ReasonCode = eval.ReasonCode,
            ReviewState = eval.ReviewState,
            UserAgent = userAgentInfo
        };

        _db.WebAttendanceLogs.Add(log);

        // Cập nhật thông tin thiết bị
        device.LastUsedAtUtc = nowUtc;
        device.LastUsedPublicIP = clientIp;

        await _db.SaveChangesAsync(ct);

        // 7. Tự động gộp dữ liệu ngày vào tbl_DailyPunchSummary & RawPunches
        try
        {
            await AggregateDailySummaryAsync(employeeCode, workDate, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi khi tổng hợp dữ liệu ngày công (AggregateDailySummaryAsync) cho nhân viên {EmployeeCode} ngày {WorkDate:yyyy-MM-dd}: {Message}", employeeCode, workDate, ex.Message);
        }

        // 8. Kiểm tra cảnh báo đổi Public IP văn phòng nếu cờ là OFF_NETWORK nhưng GPS OK
        if (eval.ReasonCode == "OFF_NETWORK" && eval.DetectedBranchCode != null)
        {
            await CheckAndRaiseIpDriftAlertAsync(eval.DetectedBranchCode, clientIp, ct);
        }

        return new PunchResultDto
        {
            WebLogId = log.WebLogId,
            CheckTimeUtc = log.CheckTimeUtc,
            CheckTimeLocal = nowLocal,
            WorkDate = workDate.ToString("yyyy-MM-dd"),
            VerificationStatus = log.VerificationStatus,
            ReasonCode = log.ReasonCode,
            ReviewState = log.ReviewState,
            Message = eval.Message,
            DetectedBranchCode = log.DetectedBranchCode,
            IpOk = log.IpOk,
            GpsState = log.GpsState,
            DistanceMeters = eval.DistanceMeters
        };
    }

    public async Task AggregateDailySummaryAsync(string employeeCode, DateTime workDate, CancellationToken ct = default)
    {
        // 1. Lấy tất cả lượt bấm của ngày
        var logs = await _db.WebAttendanceLogs
            .Where(l => l.EmployeeCode == employeeCode && l.WorkDate == workDate)
            .OrderBy(l => l.CheckTimeUtc)
            .ToListAsync(ct);

        if (!logs.Any())
        {
            var existingSummary = await _db.DailyPunchSummaries
                .FirstOrDefaultAsync(s => s.EmployeeCode == employeeCode && s.WorkDate == workDate, ct);
            if (existingSummary != null)
            {
                _db.DailyPunchSummaries.Remove(existingSummary);
            }
            var empDel = await _db.Employees.FirstOrDefaultAsync(e => e.EmployeeCode == employeeCode, ct);
            if (empDel != null)
            {
                var existingRaw = await _db.RawPunches
                    .FirstOrDefaultAsync(r => r.EmployeeId == empDel.Id && r.WorkDate == workDate && r.Source == "APP", ct);
                if (existingRaw != null)
                {
                    _db.RawPunches.Remove(existingRaw);
                }
            }
            await _db.SaveChangesAsync(ct);
            return;
        }

        // Lượt bấm được dùng: VerificationStatus == 'VALID' hoặc ReviewState == 'ACCEPTED'
        var usableLogs = logs.Where(l => l.VerificationStatus == "VALID" || l.ReviewState == "ACCEPTED").ToList();
        bool hasPendingReview = logs.Any(l => l.ReviewState == "PENDING");

        // 2. Kiểm tra điều chỉnh giờ đã duyệt (TimeAdjustment)
        var adj = await _db.TimeAdjustments
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.EmployeeCode == employeeCode && a.WorkDate == workDate && a.IsActive, ct);

        TimeSpan? inTime = null;
        TimeSpan? outTime = null;
        long? inLogId = null;
        long? outLogId = null;
        string source = "APP";

        if (adj != null)
        {
            inTime = adj.AdjInTime;
            outTime = adj.AdjOutTime;
            source = "REGULARIZED";
        }
        else if (usableLogs.Any())
        {
            // Lượt vào: lượt hợp lệ sớm nhất
            var firstLog = usableLogs.First();
            var firstLocal = ToVietnamTime(firstLog.CheckTimeUtc);
            inTime = firstLocal.TimeOfDay;
            inLogId = firstLog.WebLogId;

            // Lượt ra: lượt hợp lệ thứ 2 (Lần 2: Check-out)
            if (usableLogs.Count > 1)
            {
                var lastLog = usableLogs.Last();
                var lastLocal = ToVietnamTime(lastLog.CheckTimeUtc);
                outTime = lastLocal.TimeOfDay;
                outLogId = lastLog.WebLogId;
            }
        }

        // 3. Cập nhật hoặc thêm mới tbl_DailyPunchSummary
        var summary = await _db.DailyPunchSummaries
            .FirstOrDefaultAsync(s => s.EmployeeCode == employeeCode && s.WorkDate == workDate, ct);

        if (summary == null)
        {
            summary = new DailyPunchSummary
            {
                EmployeeCode = employeeCode,
                WorkDate = workDate,
                InTime = inTime,
                OutTime = outTime,
                Source = source,
                InLogId = inLogId,
                OutLogId = outLogId,
                UsedPunchCount = usableLogs.Count,
                HasPendingReview = hasPendingReview,
                BuiltAtUtc = DateTime.UtcNow
            };
            _db.DailyPunchSummaries.Add(summary);
        }
        else
        {
            summary.InTime = inTime;
            summary.OutTime = outTime;
            summary.Source = source;
            summary.InLogId = inLogId;
            summary.OutLogId = outLogId;
            summary.UsedPunchCount = usableLogs.Count;
            summary.HasPendingReview = hasPendingReview;
            summary.BuiltAtUtc = DateTime.UtcNow;
        }

        // 4. Đồng bộ vào bảng RawPunches (dành cho Engine Phase 1)
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.EmployeeCode == employeeCode, ct);
        if (emp != null && emp.AttendanceSource == "APP")
        {
            var openPeriod = await _db.Periods
                .FirstOrDefaultAsync(p => p.CompanyId == emp.CompanyId && p.FromDate <= workDate && p.ToDate >= workDate, ct);

            if (openPeriod != null)
            {
                var existingRaw = await _db.RawPunches
                    .FirstOrDefaultAsync(r => r.PeriodId == openPeriod.Id && r.EmployeeId == emp.Id && r.WorkDate == workDate, ct);

                short? inMin = inTime.HasValue ? (short?)(inTime.Value.Hours * 60 + inTime.Value.Minutes) : null;
                short? outMin = outTime.HasValue ? (short?)(outTime.Value.Hours * 60 + outTime.Value.Minutes) : null;
                string? inStr = inTime.HasValue ? inTime.Value.ToString(@"hh\:mm\:ss") : null;
                string? outStr = outTime.HasValue ? outTime.Value.ToString(@"hh\:mm\:ss") : null;

                if (existingRaw == null)
                {
                    _db.RawPunches.Add(new RawPunch
                    {
                        PeriodId = openPeriod.Id,
                        BatchId = null,
                        EmployeeId = emp.Id,
                        MachineCode = emp.EmployeeCode,
                        MachineName = emp.FullName,
                        WorkDate = workDate,
                        InMin = inMin,
                        OutMin = outMin,
                        InTime = inStr,
                        OutTime = outStr,
                        Source = source,
                        SourceRow = 0
                    });
                }
                else if (existingRaw.Source == "APP" || existingRaw.Source == "REGULARIZED")
                {
                    existingRaw.InMin = inMin;
                    existingRaw.OutMin = outMin;
                    existingRaw.InTime = inStr;
                    existingRaw.OutTime = outStr;
                    existingRaw.Source = source;
                }
            }
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task BatchReviewPunchesAsync(
        List<long> logIds,
        bool accept,
        string? note,
        int reviewerUserId,
        CancellationToken ct = default)
    {
        if (!logIds.Any()) return;

        var logs = await _db.WebAttendanceLogs.Where(l => logIds.Contains(l.WebLogId)).ToListAsync(ct);
        var affectedDays = new HashSet<(string EmployeeCode, DateTime WorkDate)>();

        foreach (var l in logs)
        {
            l.ReviewState = accept ? "ACCEPTED" : "REJECTED";
            l.ReviewedByUserId = reviewerUserId;
            l.ReviewedAtUtc = DateTime.UtcNow;
            l.ReviewNote = note;

            affectedDays.Add((l.EmployeeCode, l.WorkDate));
        }

        await _db.SaveChangesAsync(ct);

        // Tự động gộp lại ngày công cho tất cả các ngày bị ảnh hưởng
        foreach (var item in affectedDays)
        {
            await AggregateDailySummaryAsync(item.EmployeeCode, item.WorkDate, ct);
        }
    }

    public async Task<int> BatchDeletePunchesAsync(
        List<long> logIds,
        int deleterUserId,
        CancellationToken ct = default)
    {
        if (!logIds.Any()) return 0;

        var logs = await _db.WebAttendanceLogs.Where(l => logIds.Contains(l.WebLogId)).ToListAsync(ct);
        if (!logs.Any()) return 0;

        var affectedDays = logs.Select(l => (l.EmployeeCode, l.WorkDate)).Distinct().ToList();

        _db.WebAttendanceLogs.RemoveRange(logs);
        await _db.SaveChangesAsync(ct);

        // Tự động tính toán lại hoặc dọn dẹp ngày công cho tất cả các ngày bị ảnh hưởng
        foreach (var (empCode, workDate) in affectedDays)
        {
            await AggregateDailySummaryAsync(empCode, workDate, ct);
        }

        return logs.Count;
    }

    public async Task CheckAndRaiseIpDriftAlertAsync(string branchCode, string clientIp, CancellationToken ct = default)
    {
        // 5 lượt bấm trong 30 phút có GPS OK nhưng IP lạ cùng hội sở
        var cutoff = DateTime.UtcNow.AddMinutes(-30);
        var count = await _db.WebAttendanceLogs
            .CountAsync(l => l.DetectedBranchCode == branchCode &&
                             l.ClientPublicIP == clientIp &&
                             l.GpsState == "OK" &&
                             l.ReasonCode == "OFF_NETWORK" &&
                             l.CheckTimeUtc >= cutoff, ct);

        const int threshold = 5;
        if (count >= threshold)
        {
            // Kiểm tra xem đã có Alert mở cho IP này chưa
            var existingAlert = await _db.HrAlerts
                .FirstOrDefaultAsync(a => a.BranchCode == branchCode &&
                                          a.AlertType == "IP_DRIFT" &&
                                          a.Status == "OPEN" &&
                                          a.Detail.Contains(clientIp), ct);

            if (existingAlert == null)
            {
                _db.HrAlerts.Add(new HrAlert
                {
                    AlertType = "IP_DRIFT",
                    BranchCode = branchCode,
                    Detail = $"Phát hiện {count} lượt chấm công có GPS hợp lệ nhưng sử dụng Public IP mới: {clientIp}.",
                    Status = "OPEN",
                    CreatedAtUtc = DateTime.UtcNow
                });
                await _db.SaveChangesAsync(ct);
                _logger.LogWarning("Đã phát hiện cảnh báo đổi IP văn phòng hội sở {BranchCode}: IP={ClientIp}", branchCode, clientIp);
            }
        }
    }
}
