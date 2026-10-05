using System.Security.Claims;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPasswordService _passwordService;
    private readonly ITokenService _tokenService;
    private readonly AuditService _audit;

    public AuthController(AppDbContext db, IPasswordService passwordService, ITokenService tokenService, AuditService audit)
    {
        _db = db;
        _passwordService = passwordService;
        _tokenService = tokenService;
        _audit = audit;
    }

    public record LoginDto(string Username, string Password);
    public record ChangePasswordDto(string OldPassword, string NewPassword);

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
            return Unauthorized(new { message = "Tên đăng nhập hoặc mật khẩu không chính xác." });
        }

        if (user.IsLocked)
        {
            return StatusCode(423, new { message = "Tài khoản của bạn đã bị khóa do đăng nhập sai nhiều lần. Vui lòng liên hệ Admin để mở khóa." });
        }

        if (!_passwordService.VerifyPassword(password, user.PasswordHash))
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= 5)
            {
                user.IsLocked = true;
                _audit.Log("User", user.Id, "AccountLocked", "Khóa tài khoản do sai mật khẩu 5 lần");
            }
            await _db.SaveChangesAsync(ct);
            return Unauthorized(new { message = "Tên đăng nhập hoặc mật khẩu không chính xác." });
        }

        user.FailedLoginCount = 0;
        user.LastLoginAt = DateTime.Now;
        await _db.SaveChangesAsync(ct);

        var companyIds = user.Companies.Select(c => c.CompanyId).ToList();
        var token = _tokenService.GenerateToken(user, companyIds);

        _audit.Log("User", user.Id, "Login", "Đăng nhập thành công");
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            token,
            user = new
            {
                user.Id,
                user.Username,
                user.FullName,
                user.Role,
                user.MustChangePassword,
                assignedCompanyIds = companyIds
            }
        });
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
            return BadRequest(new { message = "Mật khẩu hiện tại không chính xác." });
        }

        if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 8)
        {
            return BadRequest(new { message = "Mật khẩu mới phải có tối thiểu 8 ký tự." });
        }

        user.PasswordHash = _passwordService.HashPassword(dto.NewPassword);
        user.MustChangePassword = false;
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

        return Ok(new
        {
            user.Id,
            user.Username,
            user.FullName,
            user.Role,
            user.MustChangePassword,
            assignedCompanyIds = user.Companies.Select(c => c.CompanyId).ToList()
        });
    }
}
