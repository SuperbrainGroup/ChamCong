using System.Security.Claims;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPasswordService _passwordService;
    private readonly ITokenService _tokenService;
    private readonly IDeviceService _deviceService;
    private readonly IGeofenceService _geofenceService;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public AuthController(
        AppDbContext db,
        IPasswordService passwordService,
        ITokenService tokenService,
        IDeviceService deviceService,
        IGeofenceService geofenceService,
        AccessService access,
        AuditService audit)
    {
        _db = db;
        _passwordService = passwordService;
        _tokenService = tokenService;
        _deviceService = deviceService;
        _geofenceService = geofenceService;
        _access = access;
        _audit = audit;
    }

    public record LoginDto(string Username, string Password, bool RememberMe = false, string? MacAddress = null);
    public record RefreshDto(string RefreshToken);
    public record ChangePasswordDto(string OldPassword, string NewPassword);
    public record ConsentDto(string Version);

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginDto dto, CancellationToken ct)
    {
        var username = Text.Required(dto.Username, "Tên đăng nhập", 50);
        var password = dto.Password ?? "";

        var user = await _db.Users
            .Include(u => u.Companies)
            .FirstOrDefaultAsync(u => u.Username == username, ct);

        if (user == null || !user.IsActive)
        {
            return Unauthorized(new { code = "INVALID_CREDENTIALS", message = "Tên đăng nhập hoặc mật khẩu không chính xác." });
        }

        var nowUtc = DateTime.UtcNow;
        if (user.IsLocked || (user.LockedUntilUtc != null && user.LockedUntilUtc > nowUtc))
        {
            var unlockTime = user.LockedUntilUtc != null ? user.LockedUntilUtc.Value.AddHours(7).ToString("HH:mm dd/MM/yyyy") : "Vui lòng liên hệ Admin";
            return StatusCode(423, new { code = "ACCOUNT_LOCKED", message = $"Tài khoản tạm thời bị khóa. Mở khóa lúc: {unlockTime}." });
        }

        if (!_passwordService.VerifyPassword(password, user.PasswordHash))
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= 5)
            {
                user.IsLocked = true;
                user.LockedUntilUtc = nowUtc.AddMinutes(15);
                _audit.Log("User", user.Id, "AccountLocked", "Tài khoản bị tạm khóa 15 phút do nhập sai mật khẩu 5 lần");
                _db.SecurityAuditLogs.Add(new SecurityAuditLog
                {
                    UserId = user.Id,
                    EventType = "LOGIN_LOCK",
                    Detail = $"Khóa tài khoản {username} sau 5 lần thất bại.",
                    PublicIP = _geofenceService.ResolveClientIp(HttpContext),
                    UserAgent = Request.Headers.UserAgent
                });
            }
            await _db.SaveChangesAsync(ct);
            return Unauthorized(new { code = "INVALID_CREDENTIALS", message = "Tên đăng nhập hoặc mật khẩu không chính xác." });
        }

        user.FailedLoginCount = 0;
        user.IsLocked = false;
        user.LockedUntilUtc = null;
        user.LastLoginAt = DateTime.Now;

        // Lấy danh sách vai trò
        var roles = await _db.UserRoles.Where(r => r.UserId == user.Id).Select(r => r.RoleCode).ToListAsync(ct);
        if (!roles.Any()) roles.Add(user.Role);

        var companyIds = user.Companies.Select(c => c.CompanyId).ToList();
        int? primaryCompanyId = companyIds.Cast<int?>().FirstOrDefault();

        var clientIp = _geofenceService.ResolveClientIp(HttpContext);
        var clientMac = !string.IsNullOrWhiteSpace(dto.MacAddress) 
            ? dto.MacAddress 
            : Request.Headers["X-Device-Mac"].FirstOrDefault();

        if (string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            await _access.EnsureEmployeeProfileAsync(user, primaryCompanyId, ct);
        }

        // Kiểm tra thiết bị gửi kèm nếu có header X-Device-Secret (Mobile)
        var rawDeviceSecret = Request.Headers["X-Device-Secret"].FirstOrDefault();
        bool isDeviceApproved = false;
        EmployeeDevice? validatedDevice = null;

        if (!string.IsNullOrEmpty(user.EmployeeCode) && !string.IsNullOrEmpty(rawDeviceSecret))
        {
            validatedDevice = await _deviceService.ValidateDeviceSecretAsync(user.EmployeeCode, rawDeviceSecret, primaryCompanyId, ct);
            isDeviceApproved = validatedDevice != null;
        }

        // Lấy thông tin thiết bị PC đã đăng ký của nhân viên (nếu có)
        EmployeeDevice? myPcDevice = null;
        if (!string.IsNullOrEmpty(user.EmployeeCode))
        {
            var pcQuery = _db.EmployeeDevices.AsNoTracking().Where(d =>
                d.EmployeeCode == user.EmployeeCode &&
                d.DeviceType == "PC" &&
                d.IsActiveSlot);

            if (primaryCompanyId.HasValue)
            {
                pcQuery = pcQuery.Where(d => d.CompanyId == primaryCompanyId.Value || d.CompanyId == null);
            }

            myPcDevice = await pcQuery.FirstOrDefaultAsync(ct);
        }

        Employee? myEmp = null;
        if (!string.IsNullOrEmpty(user.EmployeeCode))
        {
            myEmp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.EmployeeCode == user.EmployeeCode, ct);
        }

        // Sinh Access Token (8 tiếng nếu thường, 7 ngày nếu RememberMe)
        var tokenLifetime = dto.RememberMe ? TimeSpan.FromDays(7) : TimeSpan.FromHours(8);
        var refreshDays = dto.RememberMe ? 90 : 30;
        var accessToken = _tokenService.GenerateAccessToken(user, roles, companyIds, tokenLifetime);

        // Sinh Refresh Token xoay vòng (30 - 90 ngày)
        var (rawRefresh, refreshHash) = _tokenService.GenerateRefreshToken();
        var refreshTokenEntity = new RefreshToken
        {
            UserId = user.Id,
            DeviceBindingId = validatedDevice?.DeviceBindingId,
            TokenHash = refreshHash,
            ExpiresAtUtc = nowUtc.AddDays(refreshDays),
            CreatedAtUtc = nowUtc,
            CreatedPublicIP = clientIp
        };
        _db.RefreshTokens.Add(refreshTokenEntity);

        _audit.Log("User", user.Id, "Login", "Đăng nhập thành công");
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            accessToken,
            token = accessToken,
            refreshToken = rawRefresh,
            expiresIn = (int)tokenLifetime.TotalSeconds,
            deviceApproved = myPcDevice?.ApprovalStatus == "APPROVED",
            pcMacAddress = myPcDevice?.FingerprintHash?.Trim(),
            isMacRegistered = !string.IsNullOrWhiteSpace(myPcDevice?.FingerprintHash),
            privacyConsentRequired = user.PrivacyConsentAtUtc == null,
            user = new
            {
                user.Id,
                user.EmployeeCode,
                employeeType = myEmp?.EmployeeType ?? "STANDARD",
                user.Username,
                user.FullName,
                user.Role,
                roles,
                user.IsActive,
                user.IsLocked,
                user.MustChangePassword,
                privacyConsentAtUtc = user.PrivacyConsentAtUtc,
                assignedCompanyIds = companyIds
            }
        });
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.RefreshToken))
        {
            return BadRequest(new { code = "INVALID_TOKEN", message = "Refresh token không hợp lệ." });
        }

        var tokenHash = CryptoUtil.Sha256Hex(dto.RefreshToken.Trim());
        var nowUtc = DateTime.UtcNow;

        var existingToken = await _db.RefreshTokens
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash && t.RevokedAtUtc == null && t.ExpiresAtUtc > nowUtc, ct);

        if (existingToken == null)
        {
            return Unauthorized(new { code = "TOKEN_EXPIRED_OR_REVOKED", message = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." });
        }

        // Xoay vòng Refresh Token: thu hồi token cũ
        existingToken.RevokedAtUtc = nowUtc;

        var user = await _db.Users
            .Include(u => u.Companies)
            .FirstOrDefaultAsync(u => u.Id == existingToken.UserId, ct);

        if (user == null || !user.IsActive)
        {
            return Unauthorized(new { code = "USER_INACTIVE", message = "Tài khoản không hoạt động." });
        }

        var roles = await _db.UserRoles.Where(r => r.UserId == user.Id).Select(r => r.RoleCode).ToListAsync(ct);
        if (!roles.Any()) roles.Add(user.Role);
        var companyIds = user.Companies.Select(c => c.CompanyId).ToList();

        // Cấp Access Token mới (24 giờ)
        var newAccessToken = _tokenService.GenerateAccessToken(user, roles, companyIds, TimeSpan.FromHours(24));

        // Cấp Refresh Token mới (90 ngày)
        var (newRawRefresh, newRefreshHash) = _tokenService.GenerateRefreshToken();
        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            DeviceBindingId = existingToken.DeviceBindingId,
            TokenHash = newRefreshHash,
            ExpiresAtUtc = nowUtc.AddDays(90),
            CreatedAtUtc = nowUtc,
            CreatedPublicIP = _geofenceService.ResolveClientIp(HttpContext)
        });

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            accessToken = newAccessToken,
            refreshToken = newRawRefresh,
            expiresIn = (int)TimeSpan.FromHours(24).TotalSeconds
        });
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshDto? dto, CancellationToken ct)
    {
        if (dto != null && !string.IsNullOrWhiteSpace(dto.RefreshToken))
        {
            var hash = CryptoUtil.Sha256Hex(dto.RefreshToken.Trim());
            var token = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
            if (token != null)
            {
                token.RevokedAtUtc = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
            }
        }
        return Ok(new { message = "Đăng xuất thành công." });
    }

    [Authorize]
    [HttpPost("consent")]
    public async Task<IActionResult> ConsentPrivacy([FromBody] ConsentDto dto, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.FindAsync(new object[] { uid }, ct);
        if (user == null) return NotFound();

        user.PrivacyConsentAtUtc = DateTime.UtcNow;
        user.PrivacyConsentVer = string.IsNullOrWhiteSpace(dto.Version) ? "v1.0" : dto.Version;
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã ghi nhận đồng ý xử lý dữ liệu cá nhân." });
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.FindAsync(new object[] { uid }, ct);
        if (user == null) return NotFound();

        if (!_passwordService.VerifyPassword(dto.OldPassword ?? "", user.PasswordHash))
        {
            return BadRequest(new { code = "WRONG_OLD_PASSWORD", message = "Mật khẩu hiện tại không chính xác." });
        }

        if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 8)
        {
            return BadRequest(new { code = "PASSWORD_TOO_SHORT", message = "Mật khẩu mới phải có tối thiểu 8 ký tự." });
        }

        user.PasswordHash = _passwordService.HashPassword(dto.NewPassword);
        user.MustChangePassword = false;

        // Đổi mật khẩu -> Thu hồi tất cả refresh token hiện có
        var tokens = await _db.RefreshTokens.Where(t => t.UserId == uid && t.RevokedAtUtc == null).ToListAsync(ct);
        foreach (var t in tokens) t.RevokedAtUtc = DateTime.UtcNow;

        _audit.Log("User", user.Id, "ChangePassword", "Đổi mật khẩu thành công");
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đổi mật khẩu thành công." });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetProfile(CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users
            .Include(u => u.Companies)
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == uid, ct);

        if (user == null) return NotFound();

        var roles = await _db.UserRoles.Where(r => r.UserId == uid).Select(r => r.RoleCode).ToListAsync(ct);
        if (!roles.Any()) roles.Add(user.Role);

        string? employeeType = null;
        if (!string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            var emp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.EmployeeCode == user.EmployeeCode, ct);
            employeeType = emp?.EmployeeType;
        }

        return Ok(new
        {
            user.Id,
            user.EmployeeCode,
            employeeType = employeeType ?? "STANDARD",
            user.Username,
            user.FullName,
            user.Role,
            roles,
            user.IsActive,
            user.IsLocked,
            user.MustChangePassword,
            privacyConsentAtUtc = user.PrivacyConsentAtUtc,
            assignedCompanyIds = user.Companies.Select(c => c.CompanyId).ToList()
        });
    }
}

