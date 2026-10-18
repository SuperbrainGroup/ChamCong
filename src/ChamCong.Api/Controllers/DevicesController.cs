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
public class DevicesController : ControllerBase
{
    private readonly IDeviceService _deviceService;
    private readonly IGeofenceService _geofenceService;
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public DevicesController(
        IDeviceService deviceService,
        IGeofenceService geofenceService,
        AppDbContext db,
        AuditService audit)
    {
        _deviceService = deviceService;
        _geofenceService = geofenceService;
        _db = db;
        _audit = audit;
    }

    public record RegisterDeviceDto(
        string DeviceType,
        string? DeviceName,
        string? OperatingSystem,
        string? BrowserInfo,
        string? FingerprintHash);

    public record DeviceDecisionDto(string Action, string? Note); // Action = APPROVE | REJECT
    public record DeviceRevokeDto(string? Note);

    /// <summary>Nhân viên đăng ký thiết bị mới (Mobile hoặc PC). Nhận Secret Token (một lần).</summary>
    [HttpPost("register")]
    public async Task<IActionResult> RegisterDevice([FromBody] RegisterDeviceDto dto, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null) return Unauthorized();

        var empCode = user.EmployeeCode;
        if (string.IsNullOrWhiteSpace(empCode))
        {
            return BadRequest(new { code = "NO_EMPLOYEE_LINKED", message = "Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên." });
        }

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == empCode);
        if (primaryCompanyId.HasValue) empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        var emp = await empQuery.FirstOrDefaultAsync(ct);
        int? companyId = emp?.CompanyId ?? primaryCompanyId;

        var clientIp = _geofenceService.ResolveClientIp(HttpContext);
        var (device, rawSecret) = await _deviceService.RegisterDeviceAsync(
            empCode,
            dto.DeviceType,
            dto.DeviceName,
            dto.OperatingSystem,
            dto.BrowserInfo,
            dto.FingerprintHash,
            clientIp,
            companyId,
            ct);

        _audit.Log("Device", device.DeviceBindingId, "RegisterDevice", $"Đăng ký thiết bị {device.DeviceType} cho {empCode}");

        return Ok(new
        {
            device.DeviceBindingId,
            device.EmployeeCode,
            device.DeviceType,
            device.DeviceName,
            device.ApprovalStatus,
            secretToken = rawSecret, // Client lưu vào IndexedDB/HttpOnly cookie
            message = "Đăng ký thiết bị thành công. Vui lòng chờ HCNS phê duyệt trước khi chấm công."
        });
    }

    public record RegisterMacDto(string MacAddress, string? DeviceName = null);

    /// <summary>Nhân viên tự bấm đăng ký địa chỉ MAC cho máy tính của mình.</summary>
    [HttpPost("register-mac")]
    public async Task<IActionResult> RegisterMacAddress([FromBody] RegisterMacDto dto, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { code = "NO_EMPLOYEE_LINKED", message = "Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên." });
        }

        if (string.IsNullOrWhiteSpace(dto.MacAddress))
        {
            return BadRequest(new { code = "NO_MAC_ADDRESS", message = "Địa chỉ MAC máy tính không được để trống." });
        }

        var cleanMac = dto.MacAddress.Trim().ToUpperInvariant();

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == user.EmployeeCode);
        if (primaryCompanyId.HasValue) empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        var emp = await empQuery.FirstOrDefaultAsync(ct);
        int? companyId = emp?.CompanyId ?? primaryCompanyId;

        // 1. Ràng buộc: Mỗi địa chỉ MAC chỉ được đăng ký cho 1 nhân viên duy nhất trong cùng hội sở (Chống check-in hộ)
        // Cho phép cùng địa chỉ MAC đăng ký ở các hội sở khác nhau
        var macCompanyId = companyId;
        var occupiedByOther = await _db.EmployeeDevices.AsNoTracking().FirstOrDefaultAsync(d =>
            d.DeviceType == "PC" &&
            d.FingerprintHash == cleanMac &&
            d.EmployeeCode != user.EmployeeCode &&
            (macCompanyId == null ? d.CompanyId == null : d.CompanyId == macCompanyId) &&
            d.IsActiveSlot, ct);

        if (occupiedByOther != null)
        {
            return StatusCode(409, new
            {
                code = "MAC_ALREADY_REGISTERED",
                message = $"Địa chỉ MAC máy tính này ({cleanMac}) đã được đăng ký cho một nhân viên khác ({occupiedByOther.EmployeeCode}) trong cùng hội sở. Mỗi máy tính chỉ được dùng cho 1 nhân viên trong cùng hội sở để chống chấm công hộ. Vui lòng liên hệ HCNS để được hỗ trợ!"
            });
        }

        // 2. Kiểm tra khe PC của nhân viên
        var existingPcQuery = _db.EmployeeDevices.Where(d =>
            d.EmployeeCode == user.EmployeeCode &&
            d.DeviceType == "PC" &&
            d.IsActiveSlot);

        if (companyId.HasValue)
        {
            existingPcQuery = existingPcQuery.Where(d => d.CompanyId == companyId.Value || d.CompanyId == null);
        }

        var existingPc = await existingPcQuery.FirstOrDefaultAsync(ct);

        if (existingPc != null)
        {
            // Nếu đã đăng ký một MAC khác từ trước -> không cho tự ý đổi máy
            var existingMac = existingPc.FingerprintHash?.Trim();
            if (!string.IsNullOrWhiteSpace(existingMac) && !existingMac.Equals(cleanMac, StringComparison.OrdinalIgnoreCase))
            {
                return StatusCode(409, new
                {
                    code = "ALREADY_HAS_DEVICE",
                    message = $"Tài khoản của bạn đã được gắn cố định với máy tính có MAC: {existingMac}. Không thể tự ý đăng ký máy tính mới. Vui lòng liên hệ HCNS để reset thiết bị nếu bạn đổi máy tính!"
                });
            }

            if (companyId.HasValue) existingPc.CompanyId = companyId.Value;
            existingPc.FingerprintHash = cleanMac;
            existingPc.ApprovalStatus = "APPROVED";
            if (!string.IsNullOrWhiteSpace(dto.DeviceName)) existingPc.DeviceName = dto.DeviceName;
            await _db.SaveChangesAsync(ct);

            _audit.Log("Device", existingPc.DeviceBindingId, "RegisterMacAddress", $"Cập nhật đăng ký MAC {cleanMac} cho {user.EmployeeCode}");

            return Ok(new
            {
                message = "Đăng ký địa chỉ MAC cho máy tính thành công!",
                macAddress = cleanMac,
                device = existingPc
            });
        }

        // 3. Nếu chưa có thiết bị PC -> Tạo mới và tự động kích hoạt
        var clientIp = _geofenceService.ResolveClientIp(HttpContext);
        var (newDevice, _) = await _deviceService.RegisterDeviceAsync(
            user.EmployeeCode,
            "PC",
            dto.DeviceName ?? $"PC - {user.FullName}",
            "Windows / PC",
            Request.Headers.UserAgent,
            cleanMac,
            clientIp,
            companyId,
            ct);

        _audit.Log("Device", newDevice.DeviceBindingId, "RegisterMacAddress", $"Đăng ký mới MAC {cleanMac} cho {user.EmployeeCode}");

        return Ok(new
        {
            message = "Đăng ký địa chỉ MAC cho máy tính thành công!",
            macAddress = cleanMac,
            device = newDevice
        });
    }

    /// <summary>Xem trạng thái 2 khe thiết bị của chính mình.</summary>
    [HttpGet("mine")]
    public async Task<IActionResult> GetMyDevices(CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return Ok(new { mobile = (object?)null, pc = (object?)null });
        }

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == user.EmployeeCode);
        if (primaryCompanyId.HasValue) empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        var emp = await empQuery.FirstOrDefaultAsync(ct);
        int? companyId = emp?.CompanyId ?? primaryCompanyId;

        var devices = await _deviceService.GetMyDevicesAsync(user.EmployeeCode, companyId, ct);
        var mobile = devices.FirstOrDefault(d => d.DeviceType == "MOBILE" && d.IsActiveSlot);
        var pc = devices.FirstOrDefault(d => d.DeviceType == "PC" && d.IsActiveSlot);

        return Ok(new
        {
            mobile = mobile == null ? null : new
            {
                mobile.DeviceBindingId,
                mobile.DeviceName,
                mobile.OperatingSystem,
                mobile.BrowserInfo,
                mobile.ApprovalStatus,
                mobile.RequestedAtUtc,
                mobile.LastUsedAtUtc,
                fingerprintHash = mobile.FingerprintHash,
                macAddress = mobile.FingerprintHash
            },
            pc = pc == null ? null : new
            {
                pc.DeviceBindingId,
                pc.DeviceName,
                pc.OperatingSystem,
                pc.BrowserInfo,
                pc.ApprovalStatus,
                pc.RequestedAtUtc,
                pc.LastUsedAtUtc,
                fingerprintHash = pc.FingerprintHash,
                macAddress = pc.FingerprintHash
            }
        });
    }
}

[ApiController]
[Authorize]
[Route("api/v1/hr/devices")]
[Route("api/hr/devices")]
public class HrDevicesController : ControllerBase
{
    private readonly IDeviceService _deviceService;
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public HrDevicesController(
        IDeviceService deviceService,
        AppDbContext db,
        AccessService access,
        AuditService audit)
    {
        _deviceService = deviceService;
        _db = db;
        _access = access;
        _audit = audit;
    }

    /// <summary>HCNS xem danh sách thiết bị chờ duyệt hoặc đã duyệt của hội sở.</summary>
    [HttpGet]
    public async Task<IActionResult> GetDevices([FromQuery] string? status, [FromQuery] string? branch, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var q = _db.EmployeeDevices.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(branch))
        {
            await _access.EnsureBranchAsync(branch, ct);
            var branchComp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Code == branch, ct);
            if (branchComp != null)
            {
                var empInBranch = await _db.Employees.AsNoTracking().Where(e => e.CompanyId == branchComp.Id).Select(e => e.EmployeeCode).ToListAsync(ct);
                var assignedInBranch = await _db.EmployeeBranchAssignments.AsNoTracking().Where(a => a.BranchCode == branch && (a.ToDate == null || a.ToDate >= DateTime.Today)).Select(a => a.EmployeeCode).ToListAsync(ct);
                var targetEmpCodes = empInBranch.Concat(assignedInBranch).Distinct().ToList();
                q = q.Where(d => d.CompanyId == branchComp.Id || (d.CompanyId == null && targetEmpCodes.Contains(d.EmployeeCode)));
            }
        }
        else
        {
            var allowedCodes = await _access.AllowedBranchCodesAsync(ct);
            if (allowedCodes != null)
            {
                var allowedCompIds = await _db.Companies.AsNoTracking().Where(c => allowedCodes.Contains(c.Code)).Select(c => c.Id).ToListAsync(ct);
                var allowedEmpCodes = await _access.AllowedEmployeeCodesAsync(ct);
                q = q.Where(d => (d.CompanyId != null && allowedCompIds.Contains(d.CompanyId.Value)) || (allowedEmpCodes != null && allowedEmpCodes.Contains(d.EmployeeCode)));
            }
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            q = q.Where(d => d.ApprovalStatus == status);
        }

        var devices = await q.OrderByDescending(d => d.RequestedAtUtc).Take(100).ToListAsync(ct);
        return Ok(devices);
    }

    /// <summary>HCNS duyệt hoặc từ chối thiết bị.</summary>
    [HttpPost("{id}/decision")]
    public async Task<IActionResult> DecideDevice(int id, [FromBody] DevicesController.DeviceDecisionDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var devTarget = await _db.EmployeeDevices.FirstOrDefaultAsync(d => d.DeviceBindingId == id, ct);
        if (devTarget == null) return NotFound(new { message = "Không tìm thấy thiết bị." });

        await _access.EnsureEmployeeCodeAsync(devTarget.EmployeeCode, devTarget.CompanyId, ct);

        bool approve = dto.Action?.Equals("APPROVE", StringComparison.OrdinalIgnoreCase) == true;
        var dev = await _deviceService.DecideDeviceAsync(id, User.UserId(), approve, dto.Note, ct);

        _audit.Log("Device", dev.DeviceBindingId, approve ? "ApproveDevice" : "RejectDevice", dto.Note);
        return Ok(new { message = approve ? "Đã phê duyệt thiết bị thành công." : "Đã từ chối thiết bị." });
    }

    public record UpdateMacDto(string MacAddress);

    /// <summary>HCNS cập nhật địa chỉ MAC cho thiết bị PC của nhân viên.</summary>
    [HttpPut("{id}/mac")]
    public async Task<IActionResult> UpdateDeviceMac(int id, [FromBody] UpdateMacDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var devTarget = await _db.EmployeeDevices.FirstOrDefaultAsync(d => d.DeviceBindingId == id, ct);
        if (devTarget == null) return NotFound(new { message = "Không tìm thấy thiết bị." });

        await _access.EnsureEmployeeCodeAsync(devTarget.EmployeeCode, devTarget.CompanyId, ct);

        devTarget.FingerprintHash = dto.MacAddress?.Trim().ToUpperInvariant();
        devTarget.ApprovalStatus = "APPROVED";
        await _db.SaveChangesAsync(ct);

        _audit.Log("Device", id, "UpdateDeviceMac", $"Cập nhật MAC: {devTarget.FingerprintHash} cho NV {devTarget.EmployeeCode}");
        return Ok(new { message = "Đã cập nhật địa chỉ MAC cho thiết bị thành công.", macAddress = devTarget.FingerprintHash });
    }

    /// <summary>HCNS thu hồi (Reset) thiết bị cũ khi nhân viên đổi máy hoặc mất máy.</summary>
    [HttpPost("{id}/revoke")]
    public async Task<IActionResult> RevokeDevice(int id, [FromBody] DevicesController.DeviceRevokeDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var devTarget = await _db.EmployeeDevices.FirstOrDefaultAsync(d => d.DeviceBindingId == id, ct);
        if (devTarget == null) return NotFound(new { message = "Không tìm thấy thiết bị." });

        await _access.EnsureEmployeeCodeAsync(devTarget.EmployeeCode, devTarget.CompanyId, ct);

        await _deviceService.RevokeDeviceAsync(id, User.UserId(), dto.Note, ct);
        _audit.Log("Device", id, "RevokeDevice", dto.Note);

        return Ok(new { message = "Đã thu hồi thiết bị thành công. Nhân viên có thể đăng ký máy mới." });
    }
}
