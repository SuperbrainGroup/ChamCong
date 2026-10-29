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
    public string? PunchType { get; set; } // AUTO | CHECK_IN | CHECK_OUT
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
    public bool NeedsExplanation { get; set; }
    public string? ShiftStatus { get; set; }
}

public interface IAttendancePunchService
{
    Task<PunchResultDto> PunchAsync(
        string employeeCode,
        string? rawDeviceSecret,
        string clientIp,
        PunchRequestDto request,
        int? companyId = null,
        CancellationToken ct = default);

    Task AggregateDailySummaryAsync(string employeeCode, DateTime workDate, int? companyId = null, CancellationToken ct = default);

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
        int? companyId = null,
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

            // Tìm thiết bị PC đã đăng ký của nhân viên (phân giải theo đúng Hội sở)
            var pcDevice = await _db.EmployeeDevices.FirstOrDefaultAsync(d =>
                d.EmployeeCode == employeeCode &&
                (companyId == null || d.CompanyId == null || d.CompanyId == companyId) &&
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
            // Bắt buộc phải có vị trí GPS khi chấm công bằng điện thoại (Mobile)
            // Không cho phép chấm công bằng điện thoại mà không có GPS (tránh phát sinh GPS_DRIFT do thiếu vị trí)
            if (!request.Latitude.HasValue || !request.Longitude.HasValue || !string.IsNullOrWhiteSpace(request.GpsError))
            {
                throw AppException.Bad("Hệ thống yêu cầu bắt buộc phải có vị trí GPS khi chấm công bằng điện thoại. Không cho phép chấm công khi không có GPS (GPS_DRIFT). Vui lòng bật định vị GPS trên điện thoại và cấp quyền truy cập vị trí.");
            }

            // Đối với thiết bị checkin là Mobile: kiểm tra thiết bị đã duyệt qua device secret
            device = await _deviceService.ValidateDeviceSecretAsync(employeeCode, rawDeviceSecret, companyId, ct);
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
            .Where(l => l.EmployeeCode == employeeCode && (companyId == null || l.CompanyId == null || l.CompanyId == companyId) && l.WorkDate == workDate)
            .OrderBy(l => l.CheckTimeUtc)
            .ToListAsync(ct);

        var usableLogs = recentLogs.Where(l => l.VerificationStatus == "VALID" || l.ReviewState == "ACCEPTED").ToList();
        if (usableLogs.Count >= 2)
        {
            throw AppException.Bad("Hôm nay bạn đã thực hiện đủ 1 lượt Check-in và 1 lượt Check-out. Hệ thống không cho phép chấm công thêm để tránh dữ liệu trùng lặp.");
        }

        // Nếu đã có 1 lượt Check-in hợp lệ, lượt bấm tiếp theo là Check-out -> Cần giới hạn thời gian làm việc tối thiểu 30 phút để chống quẹt nhầm Check-out khi vừa vào làm
        if (usableLogs.Count == 1)
        {
            var firstPunch = usableLogs[0];
            var elapsedMinutes = (nowUtc - firstPunch.CheckTimeUtc).TotalMinutes;
            const double minWorkSpanMinutes = 30.0;
            if (elapsedMinutes < minWorkSpanMinutes)
            {
                var remainingMinutes = (int)Math.Max(1, Math.Ceiling(minWorkSpanMinutes - elapsedMinutes));
                var checkinTimeStr = ToVietnamTime(firstPunch.CheckTimeUtc).ToString("HH:mm:ss");
                throw AppException.Bad($"Bạn vừa Check-in lúc {checkinTimeStr}. Để tránh quẹt nhầm Check-out khi vừa vào làm, ca làm việc cần tối thiểu {minWorkSpanMinutes} phút trước khi bấm Check-out (vui lòng đợi thêm {remainingMinutes} phút).");
            }
        }

        const int minIntervalSeconds = 60;
        var lastLog = recentLogs.LastOrDefault();
        if (lastLog != null && (nowUtc - lastLog.CheckTimeUtc).TotalSeconds < minIntervalSeconds)
        {
            throw AppException.Bad($"Thao tác quá nhanh. Vui lòng đợi ít nhất {minIntervalSeconds} giây giữa 2 lần bấm.");
        }

        // 4. Lấy chính sách chấm công áp dụng (CHECKIN_POLICY)
        string policy = "OFFICE_STRICT";
        var emp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.EmployeeCode == employeeCode && (companyId == null || e.CompanyId == companyId), ct);
        var effectiveCompanyId = companyId ?? emp?.CompanyId;

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

        // 5. Đánh giá hiện diện:
        // Remote: Điểm danh tại nhà/từ xa được miễn IP & GPS văn phòng, tự động ghi nhận VALID
        // PC: Chỉ kiểm tra MAC Address (đã xác thực ở Bước 1), KHÔNG kiểm tra Wifi và Location.
        // Mobile: Không kiểm tra MAC, CHỈ kiểm tra Wifi và Location (GPS).
        var isRemote = string.Equals(emp?.EmployeeType, "REMOTE", StringComparison.OrdinalIgnoreCase);
        var isPc = request.Channel == "PC_WEB";
        BranchPresenceResult eval;

        if (isRemote)
        {
            string? branchCode = null;
            var branchAssign = await _db.EmployeeBranchAssignments
                .AsNoTracking()
                .Where(a => a.EmployeeCode == employeeCode && (effectiveCompanyId == null || a.CompanyId == null || a.CompanyId == effectiveCompanyId) && (a.ToDate == null || a.ToDate >= DateTime.Today))
                .FirstOrDefaultAsync(ct);
            if (branchAssign != null)
            {
                branchCode = branchAssign.BranchCode;
            }
            else if (emp?.CompanyId != null)
            {
                var comp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == emp.CompanyId, ct);
                branchCode = comp?.Code;
            }

            eval = new BranchPresenceResult
            {
                DetectedBranchCode = branchCode,
                IpOk = true,
                GpsState = "NA",
                DistanceMeters = null,
                VerificationStatus = "VALID",
                ReasonCode = "REMOTE_HOME_PUNCH",
                ReviewState = "NONE",
                Message = "Điểm danh làm việc từ xa (Remote/Tại nhà) thành công."
            };
        }
        else if (isPc)
        {
            string? branchCode = null;
            var branchAssign = await _db.EmployeeBranchAssignments
                .AsNoTracking()
                .Where(a => a.EmployeeCode == employeeCode && (effectiveCompanyId == null || a.CompanyId == null || a.CompanyId == effectiveCompanyId) && (a.ToDate == null || a.ToDate >= DateTime.Today))
                .FirstOrDefaultAsync(ct);
            if (branchAssign != null)
            {
                branchCode = branchAssign.BranchCode;
            }
            else if (emp?.CompanyId != null)
            {
                var comp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == emp.CompanyId, ct);
                branchCode = comp?.Code;
            }

            eval = new BranchPresenceResult
            {
                DetectedBranchCode = branchCode,
                IpOk = true,
                GpsState = "NA",
                DistanceMeters = null,
                VerificationStatus = "VALID",
                ReasonCode = "PC_MAC_VERIFIED",
                ReviewState = "NONE",
                Message = "Chấm công PC xác thực địa chỉ MAC thành công."
            };
        }
        else
        {
            // Bắt buộc phải có vị trí GPS khi chấm công bằng điện thoại (Mobile)
            // Không cho phép chấm công bằng điện thoại mà không có GPS (tránh phát sinh GPS_DRIFT do thiếu vị trí)
            if (!request.Latitude.HasValue || !request.Longitude.HasValue || !string.IsNullOrWhiteSpace(request.GpsError))
            {
                throw AppException.Bad("Hệ thống yêu cầu bắt buộc phải có vị trí GPS khi chấm công bằng điện thoại. Không cho phép chấm công khi không có GPS (GPS_DRIFT). Vui lòng bật định vị GPS trên điện thoại và cấp quyền truy cập vị trí.");
            }

            eval = await _geofenceService.EvaluatePresenceAsync(
                employeeCode,
                clientIp,
                request.Channel,
                request.Latitude,
                request.Longitude,
                request.Accuracy,
                request.GpsError,
                policy,
                companyId,
                ct);

            if (eval.GpsState == "MISSING")
            {
                throw AppException.Bad("Không xác định được tọa độ GPS của thiết bị di động. Bắt buộc phải có định vị GPS hợp lệ để chấm công.");
            }

            if (eval.ReasonCode == "BRANCH_NO_PUBLIC_IP")
            {
                throw AppException.Bad(eval.Message ?? "Hội sở chưa được thiết lập Mạng Public IP văn phòng. Vui lòng liên hệ Admin/HCNS để cài đặt IP văn phòng.");
            }
        }

        // 6. Ghi nhật ký lượt bấm bất biến
        bool isUncheckedInCheckout = (request.PunchType == "CHECK_OUT" && usableLogs.Count == 0);
        if (isUncheckedInCheckout)
        {
            eval.ReasonCode = "MISSING_IN";
            eval.VerificationStatus = "REVIEW";
            eval.ReviewState = "PENDING";
            eval.Message = "Đã ghi nhận điểm danh ra về. Do chưa có điểm danh vào ca sáng, bạn cần nộp đơn giải trình để được duyệt đủ công.";
        }

        var userAgentInfo = isPc && !string.IsNullOrWhiteSpace(request.MacAddress)
            ? $"{request.UserAgent} [MAC: {request.MacAddress}]"
            : request.UserAgent;

        // Cắt gọt và chuẩn hóa an toàn tuyệt đối mọi trường dữ liệu trước khi lưu vào DB (chống Arithmetic overflow & String truncation)
        decimal? safeLat = null;
        if (!isPc && request.Latitude.HasValue)
        {
            var clamped = Math.Clamp(request.Latitude.Value, -90m, 90m);
            safeLat = Math.Round(clamped, 7);
        }

        decimal? safeLng = null;
        if (!isPc && request.Longitude.HasValue)
        {
            var clamped = Math.Clamp(request.Longitude.Value, -180m, 180m);
            safeLng = Math.Round(clamped, 7);
        }

        decimal? safeAcc = null;
        if (!isPc && request.Accuracy.HasValue)
        {
            // Cột GpsAccuracyMeters là decimal(7,2) -> Max là 99999.99m (~100km)
            var clamped = Math.Clamp(request.Accuracy.Value, 0m, 99999.99m);
            safeAcc = Math.Round(clamped, 2);
        }

        decimal? safeDist = null;
        if (!isPc && eval.DistanceMeters.HasValue)
        {
            // Cột DistanceMeters là decimal(9,2) -> Max là 9999999.99m (~10.000km)
            var clamped = Math.Clamp((decimal)eval.DistanceMeters.Value, 0m, 9999999.99m);
            safeDist = Math.Round(clamped, 2);
        }

        var safeIp = clientIp ?? "127.0.0.1";
        if (safeIp.Length > 45) safeIp = safeIp.Substring(0, 45);

        var safeUserAgent = userAgentInfo;
        if (safeUserAgent != null && safeUserAgent.Length > 300)
        {
            safeUserAgent = safeUserAgent.Substring(0, 300);
        }

        // Đảm bảo GpsState luôn nằm trong CHECK constraint ('OK','OUT','LOW_ACC','MISSING','NA')
        var safeGpsState = isPc ? "NA" : (eval.GpsState ?? "NA");
        if (safeGpsState != "OK" && safeGpsState != "OUT" && safeGpsState != "LOW_ACC" && safeGpsState != "MISSING" && safeGpsState != "NA")
        {
            safeGpsState = "NA";
        }

        var safeReasonCode = eval.ReasonCode;
        if (safeReasonCode != null && safeReasonCode.Length > 30)
        {
            safeReasonCode = safeReasonCode.Substring(0, 30);
        }

        var log = new WebAttendanceLog
        {
            CompanyId = effectiveCompanyId,
            ClientRequestId = request.ClientRequestId == Guid.Empty ? Guid.NewGuid() : request.ClientRequestId,
            EmployeeCode = employeeCode,
            DeviceBindingId = device.DeviceBindingId,
            Channel = request.Channel,
            CheckTimeUtc = nowUtc,
            WorkDate = workDate,
            DetectedBranchCode = eval.DetectedBranchCode,
            CheckinPolicy = isPc ? "PC_MAC_AUTH" : policy,
            Latitude = safeLat,
            Longitude = safeLng,
            GpsAccuracyMeters = safeAcc,
            DistanceMeters = safeDist,
            ClientPublicIP = safeIp,
            IpOk = isPc ? true : eval.IpOk,
            GpsState = safeGpsState,
            VerificationStatus = eval.VerificationStatus,
            ReasonCode = safeReasonCode,
            ReviewState = eval.ReviewState,
            UserAgent = safeUserAgent
        };

        _db.WebAttendanceLogs.Add(log);

        // Cập nhật thông tin thiết bị
        device.LastUsedAtUtc = nowUtc;
        device.LastUsedPublicIP = safeIp;

        await _db.SaveChangesAsync(ct);

        // Tự động gửi thông báo nhắc nhở giải trình cho nhân viên nếu quẹt ra về khi chưa check-in vào ca
        if (isUncheckedInCheckout)
        {
            try
            {
                var userObj = await _db.Users.FirstOrDefaultAsync(u => u.EmployeeCode == employeeCode && (effectiveCompanyId == null || u.Companies.Any(c => c.CompanyId == effectiveCompanyId)), ct);
                if (userObj != null)
                {
                    _db.Notifications.Add(new Notification
                    {
                        UserId = userObj.Id,
                        CompanyId = effectiveCompanyId,
                        BranchCode = eval.DetectedBranchCode,
                        Title = "⚠️ Nhắc nhở nộp đơn giải trình bổ sung giờ vào",
                        Body = $"Bạn vừa điểm danh ra về lúc {nowLocal:HH:mm}. Ca làm việc hôm nay chưa có lượt vào làm, vui lòng tạo đơn giải trình để được ghi nhận công.",
                        LinkType = "REGULARIZATION",
                        CreatedAtUtc = DateTime.UtcNow,
                        IsRead = false
                    });
                    await _db.SaveChangesAsync(ct);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không thể gửi thông báo nhắc nhở giải trình: {Message}", ex.Message);
            }
        }

        // 7. Tự động gộp dữ liệu ngày vào tbl_DailyPunchSummary & RawPunches
        try
        {
            await AggregateDailySummaryAsync(employeeCode, workDate, effectiveCompanyId, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi khi tổng hợp dữ liệu ngày công (AggregateDailySummaryAsync) cho nhân viên {EmployeeCode} ngày {WorkDate:yyyy-MM-dd}: {Message}", employeeCode, workDate, ex.Message);
        }

        // 8. Kiểm tra cảnh báo đổi Public IP văn phòng nếu cờ là OFF_NETWORK nhưng GPS OK
        if (eval.ReasonCode == "OFF_NETWORK" && eval.DetectedBranchCode != null)
        {
            try
            {
                await CheckAndRaiseIpDriftAlertAsync(eval.DetectedBranchCode, clientIp, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không thể kiểm tra hoặc tạo cảnh báo IP Drift: {Message}", ex.Message);
            }
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
            DistanceMeters = eval.DistanceMeters,
            NeedsExplanation = isUncheckedInCheckout,
            ShiftStatus = isUncheckedInCheckout ? "NEED_EXPLANATION" : null
        };
    }

    public async Task AggregateDailySummaryAsync(string employeeCode, DateTime workDate, int? companyId = null, CancellationToken ct = default)
    {
        // 1. Kiểm tra điều chỉnh giờ đã duyệt (TimeAdjustment / Giải trình)
        var adj = await _db.TimeAdjustments
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.EmployeeCode == employeeCode && (companyId == null || a.CompanyId == null || a.CompanyId == companyId) && a.WorkDate == workDate && a.IsActive, ct);

        // 2. Lấy tất cả lượt bấm của ngày
        var logs = await _db.WebAttendanceLogs
            .Where(l => l.EmployeeCode == employeeCode && (companyId == null || l.CompanyId == null || l.CompanyId == companyId) && l.WorkDate == workDate)
            .OrderBy(l => l.CheckTimeUtc)
            .ToListAsync(ct);

        var effectiveCompanyId = companyId ?? logs.FirstOrDefault(l => l.CompanyId.HasValue)?.CompanyId ?? adj?.CompanyId;

        // Nếu không có cả logs và không có cả giải trình đã duyệt
        if (!logs.Any() && adj == null)
        {
            var existingSummary = await _db.DailyPunchSummaries
                .FirstOrDefaultAsync(s => s.EmployeeCode == employeeCode && (effectiveCompanyId == null || s.CompanyId == effectiveCompanyId) && s.WorkDate == workDate, ct);
            if (existingSummary != null)
            {
                _db.DailyPunchSummaries.Remove(existingSummary);
            }
            var empDel = await _db.Employees.FirstOrDefaultAsync(e => e.EmployeeCode == employeeCode && (effectiveCompanyId == null || e.CompanyId == effectiveCompanyId), ct);
            if (empDel != null)
            {
                var existingRaw = await _db.RawPunches
                    .FirstOrDefaultAsync(r => r.EmployeeId == empDel.Id && r.WorkDate == workDate && (r.Source == "APP" || r.Source == "REGULARIZED"), ct);
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
            if (usableLogs.Count == 1 && usableLogs[0].ReasonCode == "MISSING_IN")
            {
                // Chỉ có 1 lượt quẹt khi ra về (quên check-in lúc sáng)
                var onlyLog = usableLogs[0];
                var onlyLocal = ToVietnamTime(onlyLog.CheckTimeUtc);
                outTime = onlyLocal.TimeOfDay;
                outLogId = onlyLog.WebLogId;
                inTime = null;
                inLogId = null;
            }
            else
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
        }

        // 3. Cập nhật hoặc thêm mới tbl_DailyPunchSummary
        var summary = await _db.DailyPunchSummaries
            .FirstOrDefaultAsync(s => s.EmployeeCode == employeeCode && (effectiveCompanyId == null || s.CompanyId == effectiveCompanyId) && s.WorkDate == workDate, ct);

        if (summary == null)
        {
            var empForComp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.EmployeeCode == employeeCode && (effectiveCompanyId == null || e.CompanyId == effectiveCompanyId), ct);
            int compId = effectiveCompanyId ?? empForComp?.CompanyId ?? 1;

            summary = new DailyPunchSummary
            {
                CompanyId = compId,
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
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.EmployeeCode == employeeCode && (effectiveCompanyId == null || e.CompanyId == effectiveCompanyId), ct);
        if (emp != null)
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
                else
                {
                    // Nếu là đơn giải trình đã duyệt (REGULARIZED), ưu tiên tuyệt đối
                    if (source == "REGULARIZED")
                    {
                        existingRaw.InMin = inMin;
                        existingRaw.OutMin = outMin;
                        existingRaw.InTime = inStr;
                        existingRaw.OutTime = outStr;
                        existingRaw.Source = "REGULARIZED";
                    }
                    else if (existingRaw.Source == "APP" || existingRaw.Source == "REGULARIZED")
                    {
                        existingRaw.InMin = inMin;
                        existingRaw.OutMin = outMin;
                        existingRaw.InTime = inStr;
                        existingRaw.OutTime = outStr;
                        existingRaw.Source = source;
                    }
                    else if (existingRaw.Source == "EXCEL" || existingRaw.Source == "MERGED")
                    {
                        short? finalInMin = inMin.HasValue && existingRaw.InMin.HasValue ? Math.Min(existingRaw.InMin.Value, inMin.Value) : (inMin ?? existingRaw.InMin);
                        short? finalOutMin = outMin.HasValue && existingRaw.OutMin.HasValue ? Math.Max(existingRaw.OutMin.Value, outMin.Value) : (outMin ?? existingRaw.OutMin);
                        existingRaw.InMin = finalInMin;
                        existingRaw.OutMin = finalOutMin;
                        existingRaw.InTime = finalInMin.HasValue ? $"{(finalInMin.Value / 60):D2}:{(finalInMin.Value % 60):D2}:00" : null;
                        existingRaw.OutTime = finalOutMin.HasValue ? $"{(finalOutMin.Value / 60):D2}:{(finalOutMin.Value % 60):D2}:00" : null;
                        existingRaw.Source = "MERGED";
                    }
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
        var affectedDays = new HashSet<(string EmployeeCode, DateTime WorkDate, int? CompanyId)>();

        foreach (var l in logs)
        {
            l.ReviewState = accept ? "ACCEPTED" : "REJECTED";
            l.ReviewedByUserId = reviewerUserId;
            l.ReviewedAtUtc = DateTime.UtcNow;
            l.ReviewNote = note;

            affectedDays.Add((l.EmployeeCode, l.WorkDate, l.CompanyId));
        }

        await _db.SaveChangesAsync(ct);

        // Tự động gộp lại ngày công cho tất cả các ngày bị ảnh hưởng
        foreach (var item in affectedDays)
        {
            await AggregateDailySummaryAsync(item.EmployeeCode, item.WorkDate, item.CompanyId, ct);
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

        var affectedDays = logs.Select(l => (l.EmployeeCode, l.WorkDate, l.CompanyId)).Distinct().ToList();

        _db.WebAttendanceLogs.RemoveRange(logs);
        await _db.SaveChangesAsync(ct);

        // Tự động tính toán lại hoặc dọn dẹp ngày công cho tất cả các ngày bị ảnh hưởng
        foreach (var (empCode, workDate, compId) in affectedDays)
        {
            await AggregateDailySummaryAsync(empCode, workDate, compId, ct);
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
