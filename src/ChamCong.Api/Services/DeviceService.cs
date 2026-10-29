using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Services;

public interface IDeviceService
{
    Task<(EmployeeDevice Device, string RawSecret)> RegisterDeviceAsync(
        string employeeCode,
        string deviceType,
        string? deviceName,
        string? os,
        string? browser,
        string? fingerprintHash,
        string clientIp,
        int? companyId = null,
        CancellationToken ct = default);

    Task<EmployeeDevice?> ValidateDeviceSecretAsync(
        string employeeCode,
        string? rawSecret,
        int? companyId = null,
        CancellationToken ct = default);

    Task<List<EmployeeDevice>> GetMyDevicesAsync(string employeeCode, int? companyId = null, CancellationToken ct = default);

    Task<List<EmployeeDevice>> GetPendingDevicesAsync(string? branchCode, CancellationToken ct = default);

    Task<EmployeeDevice> DecideDeviceAsync(
        int deviceBindingId,
        int decidedByUserId,
        bool approve,
        string? note,
        CancellationToken ct = default);

    Task RevokeDeviceAsync(
        int deviceBindingId,
        int revokedByUserId,
        string? note,
        CancellationToken ct = default);

    Task<EmployeeDevice?> ValidatePcDeviceByMacAsync(
        string employeeCode,
        string macAddress,
        int? companyId = null,
        CancellationToken ct = default);

    Task<EmployeeDevice> GetOrCreatePcDeviceAsync(
        string employeeCode,
        string macAddress,
        string? userAgent,
        string clientIp,
        int? companyId = null,
        CancellationToken ct = default);
}

public class DeviceService : IDeviceService
{
    private readonly AppDbContext _db;

    public DeviceService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<(EmployeeDevice Device, string RawSecret)> RegisterDeviceAsync(
        string employeeCode,
        string deviceType,
        string? deviceName,
        string? os,
        string? browser,
        string? fingerprintHash,
        string clientIp,
        int? companyId = null,
        CancellationToken ct = default)
    {
        deviceType = deviceType.ToUpperInvariant();
        if (deviceType != "MOBILE" && deviceType != "PC")
        {
            throw AppException.Bad("Loại thiết bị chỉ chấp nhận MOBILE hoặc PC.");
        }

        // 1. Kiểm tra nhân viên tồn tại (phân giải theo đúng Hội sở / CompanyId)
        var emp = await _db.Employees.AsNoTracking()
            .FirstOrDefaultAsync(e => e.EmployeeCode == employeeCode && (companyId == null || e.CompanyId == companyId), ct);
        if (emp == null)
        {
            throw AppException.NotFound($"Không tìm thấy nhân viên có mã {employeeCode}.");
        }
        var effectiveCompanyId = companyId ?? emp.CompanyId;

        // 2. Chuẩn hóa địa chỉ MAC / Fingerprint nếu có
        string? cleanFp = null;
        if (!string.IsNullOrWhiteSpace(fingerprintHash))
        {
            cleanFp = fingerprintHash.Trim().ToUpperInvariant();
        }

        // 3. Ràng buộc chống chấm công hộ:
        // Một địa chỉ MAC / Fingerprint chỉ được đăng ký cho 1 nhân viên duy nhất trong cùng hội sở.
        // Khác hội sở thì được phép dùng chung thiết bị/MAC.
        if (!string.IsNullOrWhiteSpace(cleanFp))
        {
            var occupiedByOther = await _db.EmployeeDevices.AsNoTracking().FirstOrDefaultAsync(d =>
                d.FingerprintHash == cleanFp &&
                d.EmployeeCode != employeeCode &&
                (d.CompanyId == null || d.CompanyId == effectiveCompanyId) &&
                d.IsActiveSlot, ct);

            if (occupiedByOther != null)
            {
                var label = deviceType == "PC" ? "Địa chỉ MAC máy tính" : "Địa chỉ MAC / Thiết bị di động";
                throw AppException.Conflict($"{label} ({cleanFp}) đã được đăng ký cho một nhân viên khác ({occupiedByOther.EmployeeCode}) trong cùng hội sở. Mỗi thiết bị chỉ được sử dụng cho 1 tài khoản trong cùng hội sở để đảm bảo tính minh bạch và tránh chấm công hộ!");
            }
        }

        // 4. Nếu thiết bị này đã từng được chính nhân viên này đăng ký trước đó (trùng FingerprintHash / MAC):
        // Cấp lại secret token mới để thiết bị tiếp tục chấm công (Safari/PWA sau khi xóa cache hoặc cài lại)
        if (!string.IsNullOrWhiteSpace(cleanFp))
        {
            var existingSameFp = await _db.EmployeeDevices
                .FirstOrDefaultAsync(d => d.EmployeeCode == employeeCode &&
                    (d.CompanyId == null || d.CompanyId == effectiveCompanyId) &&
                    d.FingerprintHash == cleanFp &&
                    d.IsActiveSlot, ct);

            if (existingSameFp != null)
            {
                var reissuedRawSecret = CryptoUtil.GenerateRandomSecret(32);
                existingSameFp.SecretHash = CryptoUtil.Sha256Hex(reissuedRawSecret);
                existingSameFp.ApprovalStatus = "APPROVED";
                if (!string.IsNullOrWhiteSpace(deviceName)) existingSameFp.DeviceName = deviceName.Length > 100 ? deviceName.Substring(0, 100) : deviceName;
                if (!string.IsNullOrWhiteSpace(os)) existingSameFp.OperatingSystem = os.Length > 50 ? os.Substring(0, 50) : os;
                if (!string.IsNullOrWhiteSpace(browser)) existingSameFp.BrowserInfo = browser.Length > 100 ? browser.Substring(0, 100) : browser;
                if (!string.IsNullOrWhiteSpace(clientIp)) existingSameFp.LastUsedPublicIP = clientIp.Length > 45 ? clientIp.Substring(0, 45) : clientIp;
                existingSameFp.LastUsedAtUtc = DateTime.UtcNow;

                await _db.SaveChangesAsync(ct);
                return (existingSameFp, reissuedRawSecret);
            }
        }

        // 5. Kiểm tra ràng buộc theo loại thiết bị:
        // - Đối với PC: Giữ quy định 1 khe PC duy nhất cho mỗi nhân viên
        if (deviceType == "PC")
        {
            var existingPc = await _db.EmployeeDevices
                .FirstOrDefaultAsync(d => d.EmployeeCode == employeeCode && (d.CompanyId == null || d.CompanyId == effectiveCompanyId) && d.DeviceType == "PC" && d.IsActiveSlot, ct);

            if (existingPc != null)
            {
                if (existingPc.ApprovalStatus == "APPROVED")
                {
                    throw AppException.Conflict($"Tài khoản đã có thiết bị PC đã được duyệt (MAC: {existingPc.FingerprintHash}). Hãy liên hệ HCNS để reset thiết bị cũ trước khi đăng ký máy mới.");
                }
                if (existingPc.ApprovalStatus == "PENDING")
                {
                    throw AppException.Conflict("Bạn đã gửi yêu cầu đăng ký thiết bị PC và đang chờ HCNS phê duyệt.");
                }
            }
        }
        // - Đối với MOBILE: Cho phép 1 tài khoản đăng ký nhiều địa chỉ MAC trên mobile (Safari, PWA, máy phụ...).
        // Giới hạn tối đa 10 thiết bị active để phòng ngừa lạm dụng.
        else if (deviceType == "MOBILE")
        {
            var activeMobileCount = await _db.EmployeeDevices
                .CountAsync(d => d.EmployeeCode == employeeCode && (d.CompanyId == null || d.CompanyId == effectiveCompanyId) && d.DeviceType == "MOBILE" && d.IsActiveSlot, ct);

            if (activeMobileCount >= 10)
            {
                throw AppException.Conflict("Tài khoản đã đăng ký tối đa 10 thiết bị di động. Vui lòng liên hệ HCNS để thu hồi thiết bị cũ không còn sử dụng.");
            }
        }

        // 6. Cấp mã bí mật ngẫu nhiên 256-bit (Hex 64 ký tự) cho thiết bị mới
        var rawSecret = CryptoUtil.GenerateRandomSecret(32);
        var secretHash = CryptoUtil.Sha256Hex(rawSecret);

        // Kiểm tra xem secret hash này có bị trùng với máy nào không
        var isDuplicateSecret = await _db.EmployeeDevices.AnyAsync(d => d.SecretHash == secretHash && d.IsActiveSlot, ct);
        if (isDuplicateSecret)
        {
            throw AppException.Conflict("Mã nhận diện thiết bị đã tồn tại trên hệ thống. Vui lòng thử lại.");
        }

        // Tự động gán tên thiết bị theo tên nhân viên nếu để trống (PC - [Tên nhân viên] hoặc Mobile - [Tên nhân viên])
        if (string.IsNullOrWhiteSpace(deviceName))
        {
            deviceName = deviceType == "PC" ? $"PC - {emp.FullName}" : $"Mobile - {emp.FullName}";
        }

        var cleanDeviceName = deviceName.Length > 100 ? deviceName.Substring(0, 100) : deviceName;
        var cleanOs = !string.IsNullOrWhiteSpace(os) && os.Length > 50 ? os.Substring(0, 50) : os;
        var cleanBrowser = !string.IsNullOrWhiteSpace(browser) && browser.Length > 100 ? browser.Substring(0, 100) : browser;
        var cleanIp = !string.IsNullOrWhiteSpace(clientIp) && clientIp.Length > 45 ? clientIp.Substring(0, 45) : clientIp;
        var finalFp = cleanFp ?? fingerprintHash;
        if (!string.IsNullOrWhiteSpace(finalFp) && finalFp.Length > 64)
        {
            finalFp = finalFp.Substring(0, 64);
        }

        var device = new EmployeeDevice
        {
            CompanyId = effectiveCompanyId,
            EmployeeCode = employeeCode,
            DeviceType = deviceType,
            SecretHash = secretHash,
            FingerprintHash = finalFp,
            DeviceName = cleanDeviceName,
            OperatingSystem = cleanOs,
            BrowserInfo = cleanBrowser,
            RegisteredPublicIP = cleanIp,
            ApprovalStatus = "APPROVED",
            IsActiveSlot = true,
            RequestedAtUtc = DateTime.UtcNow,
            DecidedAtUtc = DateTime.UtcNow,
            DecisionNote = "Tự động kích hoạt khi nhân viên đăng ký thiết bị"
        };

        _db.EmployeeDevices.Add(device);
        await _db.SaveChangesAsync(ct);

        return (device, rawSecret);
    }

    public async Task<EmployeeDevice?> ValidateDeviceSecretAsync(
        string employeeCode,
        string? rawSecret,
        int? companyId = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(rawSecret)) return null;

        var secretHash = CryptoUtil.Sha256Hex(rawSecret.Trim());
        var device = await _db.EmployeeDevices
            .FirstOrDefaultAsync(d => d.EmployeeCode == employeeCode && (companyId == null || d.CompanyId == null || d.CompanyId == companyId) && d.SecretHash == secretHash && d.IsActiveSlot, ct);

        if (device == null || device.ApprovalStatus != "APPROVED") return null;

        return device;
    }

    public async Task<List<EmployeeDevice>> GetMyDevicesAsync(string employeeCode, int? companyId = null, CancellationToken ct = default)
    {
        return await _db.EmployeeDevices
            .AsNoTracking()
            .Where(d => d.EmployeeCode == employeeCode && (companyId == null || d.CompanyId == null || d.CompanyId == companyId))
            .OrderByDescending(d => d.RequestedAtUtc)
            .ToListAsync(ct);
    }

    public async Task<List<EmployeeDevice>> GetPendingDevicesAsync(string? branchCode, CancellationToken ct = default)
    {
        var q = _db.EmployeeDevices.AsNoTracking().Where(d => d.ApprovalStatus == "PENDING" && d.IsActiveSlot);

        if (!string.IsNullOrWhiteSpace(branchCode))
        {
            // Lọc theo hội sở của nhân viên
            var empCodes = await _db.Employees
                .Join(_db.Companies, e => e.CompanyId, c => c.Id, (e, c) => new { e.EmployeeCode, c.Code })
                .Where(x => x.Code == branchCode)
                .Select(x => x.EmployeeCode)
                .ToListAsync(ct);

            q = q.Where(d => empCodes.Contains(d.EmployeeCode));
        }

        return await q.OrderBy(d => d.RequestedAtUtc).ToListAsync(ct);
    }

    public async Task<EmployeeDevice> DecideDeviceAsync(
        int deviceBindingId,
        int decidedByUserId,
        bool approve,
        string? note,
        CancellationToken ct = default)
    {
        var dev = await _db.EmployeeDevices.FirstOrDefaultAsync(d => d.DeviceBindingId == deviceBindingId, ct)
            ?? throw AppException.NotFound("Không tìm thấy thiết bị.");

        dev.ApprovalStatus = approve ? "APPROVED" : "REJECTED";
        dev.IsActiveSlot = approve; // REJECTED -> IsActiveSlot = false
        dev.DecidedByUserId = decidedByUserId;
        dev.DecidedAtUtc = DateTime.UtcNow;
        dev.DecisionNote = note;

        await _db.SaveChangesAsync(ct);
        return dev;
    }

    public async Task RevokeDeviceAsync(
        int deviceBindingId,
        int revokedByUserId,
        string? note,
        CancellationToken ct = default)
    {
        var dev = await _db.EmployeeDevices.FirstOrDefaultAsync(d => d.DeviceBindingId == deviceBindingId, ct)
            ?? throw AppException.NotFound("Không tìm thấy thiết bị.");

        dev.ApprovalStatus = "REVOKED";
        dev.IsActiveSlot = false;
        dev.DecidedByUserId = revokedByUserId;
        dev.DecidedAtUtc = DateTime.UtcNow;
        dev.DecisionNote = note ?? "Thu hồi bởi HCNS / Quản trị viên";

        // Thu hồi toàn bộ Refresh Tokens của thiết bị này
        var tokens = await _db.RefreshTokens.Where(t => t.DeviceBindingId == deviceBindingId && t.RevokedAtUtc == null).ToListAsync(ct);
        foreach (var t in tokens)
        {
            t.RevokedAtUtc = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task<EmployeeDevice?> ValidatePcDeviceByMacAsync(
        string employeeCode,
        string macAddress,
        int? companyId = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(macAddress)) return null;
        var cleanMac = macAddress.Trim().ToUpperInvariant();

        var device = await _db.EmployeeDevices
            .FirstOrDefaultAsync(d => d.EmployeeCode == employeeCode && (companyId == null || d.CompanyId == null || d.CompanyId == companyId) && d.DeviceType == "PC" && d.IsActiveSlot, ct);

        if (device == null || device.ApprovalStatus != "APPROVED") return null;

        // Nếu máy đã có MAC lưu trong FingerprintHash, bắt buộc phải khớp 100%
        if (!string.IsNullOrWhiteSpace(device.FingerprintHash))
        {
            if (device.FingerprintHash.Trim().Equals(cleanMac, StringComparison.OrdinalIgnoreCase))
            {
                return device;
            }
            // Không khớp MAC đã đăng ký của nhân viên
            return null;
        }

        // Nếu thiết bị chưa gán MAC, kiểm tra xem MAC này có bị nhân viên khác trong cùng hội sở đăng ký chưa trước khi gán
        var isDuplicateMac = await _db.EmployeeDevices.AnyAsync(d =>
            d.FingerprintHash == cleanMac &&
            d.EmployeeCode != employeeCode &&
            (companyId == null ? d.CompanyId == null : d.CompanyId == companyId) &&
            d.IsActiveSlot, ct);

        if (isDuplicateMac)
        {
            throw AppException.Conflict($"Địa chỉ MAC ({cleanMac}) đã được đăng ký cho một nhân viên khác trong cùng hội sở. Mỗi máy chỉ được đăng ký cho 1 nhân viên trong cùng hội sở để tránh chấm công hộ.");
        }

        device.FingerprintHash = cleanMac;
        await _db.SaveChangesAsync(ct);
        return device;
    }

    public async Task<EmployeeDevice> GetOrCreatePcDeviceAsync(
        string employeeCode,
        string macAddress,
        string? userAgent,
        string clientIp,
        int? companyId = null,
        CancellationToken ct = default)
    {
        var cleanMac = macAddress.Trim().ToUpperInvariant();

        // 1. Kiểm tra xem địa chỉ MAC này đã thuộc về nhân viên khác trong cùng hội sở chưa (Cho phép cùng MAC ở các hội sở khác nhau)
        var isDuplicateMac = await _db.EmployeeDevices.AnyAsync(d =>
            d.FingerprintHash == cleanMac &&
            d.EmployeeCode != employeeCode &&
            (companyId == null ? d.CompanyId == null : d.CompanyId == companyId) &&
            d.IsActiveSlot, ct);

        if (isDuplicateMac)
        {
            throw AppException.Conflict($"Địa chỉ MAC ({cleanMac}) đã được đăng ký cho một nhân viên khác trong cùng hội sở. Mỗi máy tính chỉ được đăng ký cho 1 nhân viên trong cùng hội sở để tránh chấm công hộ. Vui lòng liên hệ HCNS.");
        }

        var existing = await _db.EmployeeDevices
            .FirstOrDefaultAsync(d => d.EmployeeCode == employeeCode && (companyId == null || d.CompanyId == null || d.CompanyId == companyId) && d.DeviceType == "PC" && d.IsActiveSlot, ct);

        if (existing != null)
        {
            // Nếu nhân viên đã có MAC đăng ký trước đó nhưng khác MAC gửi lên -> Đây là máy lạ, không tự ý ghi đè!
            if (!string.IsNullOrWhiteSpace(existing.FingerprintHash) && !existing.FingerprintHash.Equals(cleanMac, StringComparison.OrdinalIgnoreCase))
            {
                throw AppException.Forbidden($"Thiết bị PC hiện tại (MAC: {cleanMac}) không khớp với máy tính đã đăng ký của bạn ({existing.FingerprintHash}). Vui lòng sử dụng máy tính đã đăng ký hoặc liên hệ HCNS để đổi máy.");
            }

            if (string.IsNullOrWhiteSpace(existing.FingerprintHash))
            {
                existing.FingerprintHash = cleanMac;
            }
            existing.ApprovalStatus = "APPROVED";
            await _db.SaveChangesAsync(ct);
            return existing;
        }

        var (device, _) = await RegisterDeviceAsync(
            employeeCode,
            "PC",
            $"PC - {employeeCode}",
            "Windows / PC",
            userAgent ?? "PC Browser",
            cleanMac,
            clientIp,
            companyId,
            ct);

        return device;
    }
}
