using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = Roles.Admin)]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPasswordService _passwordService;
    private readonly AuditService _audit;

    public UsersController(AppDbContext db, IPasswordService passwordService, AuditService audit)
    {
        _db = db;
        _passwordService = passwordService;
        _audit = audit;
    }

    public record UserDto(
        int Id,
        string Username,
        string FullName,
        string Role,
        bool IsActive,
        bool IsLocked,
        int FailedLoginCount,
        bool MustChangePassword,
        DateTime? LastLoginAt,
        DateTime CreatedAt,
        List<int> AssignedCompanyIds);

    public record CreateUserDto(string Username, string FullName, string Password, string Role, List<int> AssignedCompanyIds);
    public record UpdateUserDto(string FullName, string Role, bool IsActive, List<int> AssignedCompanyIds);
    public record ResetPasswordDto(string NewPassword);

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var users = await _db.Users
            .Include(u => u.Companies)
            .AsNoTracking()
            .OrderBy(u => u.Username)
            .Select(u => new UserDto(
                u.Id,
                u.Username,
                u.FullName,
                u.Role,
                u.IsActive,
                u.IsLocked,
                u.FailedLoginCount,
                u.MustChangePassword,
                u.LastLoginAt,
                u.CreatedAt,
                u.Companies.Select(c => c.CompanyId).ToList()
            ))
            .ToListAsync(ct);

        return Ok(users);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id, CancellationToken ct)
    {
        var u = await _db.Users
            .Include(x => x.Companies)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, ct);

        if (u == null) return NotFound();

        return Ok(new UserDto(
            u.Id,
            u.Username,
            u.FullName,
            u.Role,
            u.IsActive,
            u.IsLocked,
            u.FailedLoginCount,
            u.MustChangePassword,
            u.LastLoginAt,
            u.CreatedAt,
            u.Companies.Select(c => c.CompanyId).ToList()
        ));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserDto dto, CancellationToken ct)
    {
        var username = Text.Required(dto.Username, "Tên đăng nhập", 50).ToLowerInvariant();
        var fullName = Text.Required(dto.FullName, "Họ và tên", 150);
        var password = Text.Required(dto.Password, "Mật khẩu", 100);
        var role = dto.Role == Roles.Admin ? Roles.Admin : Roles.Operator;

        if (password.Length < 8)
        {
            return BadRequest(new { message = "Mật khẩu phải có tối thiểu 8 ký tự." });
        }

        if (await _db.Users.AnyAsync(u => u.Username == username, ct))
        {
            return BadRequest(new { message = $"Tên đăng nhập '{username}' đã tồn tại." });
        }

        if (role == Roles.Operator && (dto.AssignedCompanyIds == null || dto.AssignedCompanyIds.Count == 0))
        {
            return BadRequest(new { message = "Nhân viên chấm công phải được gán ít nhất một hội sở." });
        }

        var user = new User
        {
            Username = username,
            FullName = fullName,
            PasswordHash = _passwordService.HashPassword(password),
            Role = role,
            IsActive = true,
            MustChangePassword = true,
            CreatedAt = DateTime.Now
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        if (dto.AssignedCompanyIds != null && dto.AssignedCompanyIds.Count > 0)
        {
            foreach (var cid in dto.AssignedCompanyIds)
            {
                _db.UserCompanies.Add(new UserCompany { UserId = user.Id, CompanyId = cid });
            }
            await _db.SaveChangesAsync(ct);
        }

        _audit.Log("User", user.Id, "Create", new { username, fullName, role, companies = dto.AssignedCompanyIds });
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetById), new { id = user.Id }, new UserDto(
            user.Id, user.Username, user.FullName, user.Role, user.IsActive, false, 0, true, null, user.CreatedAt, dto.AssignedCompanyIds ?? new List<int>()
        ));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateUserDto dto, CancellationToken ct)
    {
        var user = await _db.Users.Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user == null) return NotFound();

        var fullName = Text.Required(dto.FullName, "Họ và tên", 150);
        var role = dto.Role == Roles.Admin ? Roles.Admin : Roles.Operator;

        // Ràng buộc: luôn còn ít nhất 1 tài khoản Admin đang hoạt động
        if (user.Role == Roles.Admin && (role != Roles.Admin || !dto.IsActive))
        {
            var adminCount = await _db.Users.CountAsync(u => u.Role == Roles.Admin && u.IsActive && u.Id != id, ct);
            if (adminCount == 0)
            {
                return BadRequest(new { message = "Hệ thống phải có ít nhất một tài khoản Quản trị viên (Admin) đang hoạt động." });
            }
        }

        if (role == Roles.Operator && (dto.AssignedCompanyIds == null || dto.AssignedCompanyIds.Count == 0))
        {
            return BadRequest(new { message = "Nhân viên chấm công phải được gán ít nhất một hội sở." });
        }

        user.FullName = fullName;
        user.Role = role;
        user.IsActive = dto.IsActive;

        // Cập nhật danh sách hội sở
        _db.UserCompanies.RemoveRange(user.Companies);
        if (dto.AssignedCompanyIds != null)
        {
            foreach (var cid in dto.AssignedCompanyIds)
            {
                _db.UserCompanies.Add(new UserCompany { UserId = user.Id, CompanyId = cid });
            }
        }

        _audit.Log("User", user.Id, "Update", new { fullName, role, isActive = dto.IsActive, companies = dto.AssignedCompanyIds });
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Cập nhật tài khoản thành công." });
    }

    [HttpPost("{id}/reset-password")]
    public async Task<IActionResult> ResetPassword(int id, [FromBody] ResetPasswordDto dto, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user == null) return NotFound();

        var password = Text.Required(dto.NewPassword, "Mật khẩu mới", 100);
        if (password.Length < 8)
        {
            return BadRequest(new { message = "Mật khẩu phải có tối thiểu 8 ký tự." });
        }

        user.PasswordHash = _passwordService.HashPassword(password);
        user.MustChangePassword = true;
        user.FailedLoginCount = 0;
        user.IsLocked = false;

        _audit.Log("User", user.Id, "ResetPassword", "Quản trị viên đặt lại mật khẩu");
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đặt lại mật khẩu thành công. Người dùng sẽ phải đổi mật khẩu ở lần đăng nhập tiếp theo." });
    }

    [HttpPost("{id}/toggle-lock")]
    public async Task<IActionResult> ToggleLock(int id, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user == null) return NotFound();

        user.IsLocked = !user.IsLocked;
        if (!user.IsLocked)
        {
            user.FailedLoginCount = 0;
        }

        _audit.Log("User", user.Id, user.IsLocked ? "LockUser" : "UnlockUser", user.IsLocked ? "Khóa tài khoản" : "Mở khóa tài khoản");
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = user.IsLocked ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản.", isLocked = user.IsLocked });
    }
}
