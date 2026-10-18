using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Route("api/[controller]")]
[Authorize(Policy = "RequireHR")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPasswordService _passwordService;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public UsersController(
        AppDbContext db,
        IPasswordService passwordService,
        AccessService access,
        AuditService audit)
    {
        _db = db;
        _passwordService = passwordService;
        _access = access;
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
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền quản lý tài khoản." });

        var allowedCompanies = await _access.AllowedCompanyIdsAsync(ct);
        var q = _db.Users
            .Include(u => u.Companies)
            .AsNoTracking();

        if (allowedCompanies != null)
        {
            // HCNS chỉ thấy tài khoản thuộc cơ sở của mình và KHÔNG thấy tài khoản Admin
            q = q.Where(u => u.Role != Roles.Admin && u.Companies.Any(c => allowedCompanies.Contains(c.CompanyId)));
        }

        var users = await q
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
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền quản lý tài khoản." });

        var u = await _db.Users
            .Include(x => x.Companies)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, ct);

        if (u == null) return NotFound();

        var allowedCompanies = await _access.AllowedCompanyIdsAsync(ct);
        if (allowedCompanies != null)
        {
            if (u.Role == Roles.Admin || !u.Companies.Any(c => allowedCompanies.Contains(c.CompanyId)))
            {
                return NotFound();
            }
        }

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
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền quản lý tài khoản." });

        var username = Text.Required(dto.Username, "Tên đăng nhập", 50).ToLowerInvariant();
        var fullName = Text.Required(dto.FullName, "Họ và tên", 150);
        var password = Text.Required(dto.Password, "Mật khẩu", 100);

        string requestedRole = dto.Role switch
        {
            Roles.Admin => Roles.Admin,
            Roles.Employee => Roles.Employee,
            _ => Roles.HR
        };

        var allowedCompanies = await _access.AllowedCompanyIdsAsync(ct);
        if (allowedCompanies != null)
        {
            // HCNS không được phép tạo tài khoản Admin
            if (requestedRole == Roles.Admin)
            {
                return StatusCode(403, new { message = "Nhân sự HCNS không có quyền tạo tài khoản Quản trị viên (Admin)." });
            }

            // HCNS chỉ được gán các cơ sở nằm trong danh sách được phân quyền
            if (dto.AssignedCompanyIds == null || dto.AssignedCompanyIds.Count == 0)
            {
                return BadRequest(new { message = "Vui lòng chọn ít nhất một hội sở cho tài khoản này." });
            }

            if (dto.AssignedCompanyIds.Any(cid => !allowedCompanies.Contains(cid)))
            {
                return StatusCode(403, new { message = "Bạn không có quyền gán tài khoản vào cơ sở ngoài phạm vi quản lý." });
            }
        }
        else
        {
            // Admin tổng
            if ((requestedRole == Roles.Operator || requestedRole == Roles.HR) && (dto.AssignedCompanyIds == null || dto.AssignedCompanyIds.Count == 0))
            {
                return BadRequest(new { message = "Nhân viên phụ trách phải được gán ít nhất một hội sở." });
            }
        }

        if (password.Length < 8)
        {
            return BadRequest(new { message = "Mật khẩu phải có tối thiểu 8 ký tự." });
        }

        if (await _db.Users.AnyAsync(u => u.Username == username, ct))
        {
            return BadRequest(new { message = $"Tên đăng nhập '{username}' đã tồn tại." });
        }

        var user = new User
        {
            Username = username,
            FullName = fullName,
            PasswordHash = _passwordService.HashPassword(password),
            Role = requestedRole,
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

        _audit.Log("User", user.Id, "Create", new { username, fullName, role = requestedRole, companies = dto.AssignedCompanyIds });
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetById), new { id = user.Id }, new UserDto(
            user.Id, user.Username, user.FullName, user.Role, user.IsActive, false, 0, true, null, user.CreatedAt, dto.AssignedCompanyIds ?? new List<int>()
        ));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateUserDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền quản lý tài khoản." });

        var user = await _db.Users.Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user == null) return NotFound();

        var allowedCompanies = await _access.AllowedCompanyIdsAsync(ct);
        if (allowedCompanies != null)
        {
            // HCNS không được sửa tài khoản Admin
            if (user.Role == Roles.Admin)
            {
                return StatusCode(403, new { message = "Bạn không có quyền chỉnh sửa tài khoản Quản trị viên." });
            }

            // Target user phải thuộc cơ sở của HCNS
            if (!user.Companies.Any(c => allowedCompanies.Contains(c.CompanyId)))
            {
                return StatusCode(403, new { message = "Bạn không có quyền chỉnh sửa tài khoản thuộc cơ sở khác." });
            }

            // HCNS không được nâng quyền tài khoản lên Admin
            if (dto.Role == Roles.Admin)
            {
                return StatusCode(403, new { message = "Bạn không có quyền gán vai trò Quản trị viên (Admin)." });
            }

            // Kiểm tra các cơ sở được gán mới
            if (dto.AssignedCompanyIds == null || dto.AssignedCompanyIds.Count == 0)
            {
                return BadRequest(new { message = "Vui lòng chọn ít nhất một hội sở cho tài khoản này." });
            }

            if (dto.AssignedCompanyIds.Any(cid => !allowedCompanies.Contains(cid)))
            {
                return StatusCode(403, new { message = "Bạn không có quyền gán tài khoản vào cơ sở ngoài phạm vi quản lý." });
            }
        }

        var fullName = Text.Required(dto.FullName, "Họ và tên", 150);
        string requestedRole = dto.Role switch
        {
            Roles.Admin => Roles.Admin,
            Roles.Employee => Roles.Employee,
            _ => Roles.HR
        };

        // Ràng buộc: luôn còn ít nhất 1 tài khoản Admin đang hoạt động
        if (user.Role == Roles.Admin && (requestedRole != Roles.Admin || !dto.IsActive))
        {
            var adminCount = await _db.Users.CountAsync(u => u.Role == Roles.Admin && u.IsActive && u.Id != id, ct);
            if (adminCount == 0)
            {
                return BadRequest(new { message = "Hệ thống phải có ít nhất một tài khoản Quản trị viên (Admin) đang hoạt động." });
            }
        }

        if (requestedRole == Roles.HR && (dto.AssignedCompanyIds == null || dto.AssignedCompanyIds.Count == 0))
        {
            return BadRequest(new { message = "Nhân sự phụ trách phải được gán ít nhất một hội sở." });
        }

        user.FullName = fullName;
        user.Role = requestedRole;
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

        _audit.Log("User", user.Id, "Update", new { fullName, role = requestedRole, isActive = dto.IsActive, companies = dto.AssignedCompanyIds });
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Cập nhật tài khoản thành công." });
    }

    [HttpPost("{id}/reset-password")]
    public async Task<IActionResult> ResetPassword(int id, [FromBody] ResetPasswordDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền quản lý tài khoản." });

        var user = await _db.Users.Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user == null) return NotFound();

        var allowedCompanies = await _access.AllowedCompanyIdsAsync(ct);
        if (allowedCompanies != null)
        {
            if (user.Role == Roles.Admin)
            {
                return StatusCode(403, new { message = "Bạn không có quyền đặt lại mật khẩu cho Quản trị viên." });
            }
            if (!user.Companies.Any(c => allowedCompanies.Contains(c.CompanyId)))
            {
                return StatusCode(403, new { message = "Bạn không có quyền đặt lại mật khẩu cho tài khoản thuộc cơ sở khác." });
            }
        }

        var password = Text.Required(dto.NewPassword, "Mật khẩu mới", 100);
        if (password.Length < 8)
        {
            return BadRequest(new { message = "Mật khẩu phải có tối thiểu 8 ký tự." });
        }

        user.PasswordHash = _passwordService.HashPassword(password);
        user.MustChangePassword = true;
        user.FailedLoginCount = 0;
        user.IsLocked = false;

        _audit.Log("User", user.Id, "ResetPassword", "Đặt lại mật khẩu");
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đặt lại mật khẩu thành công. Người dùng sẽ phải đổi mật khẩu ở lần đăng nhập tiếp theo." });
    }

    [HttpPost("{id}/toggle-lock")]
    public async Task<IActionResult> ToggleLock(int id, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền quản lý tài khoản." });

        var user = await _db.Users.Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user == null) return NotFound();

        var allowedCompanies = await _access.AllowedCompanyIdsAsync(ct);
        if (allowedCompanies != null)
        {
            if (user.Role == Roles.Admin)
            {
                return StatusCode(403, new { message = "Bạn không có quyền khóa/mở khóa tài khoản Quản trị viên." });
            }
            if (!user.Companies.Any(c => allowedCompanies.Contains(c.CompanyId)))
            {
                return StatusCode(403, new { message = "Bạn không có quyền khóa/mở khóa tài khoản thuộc cơ sở khác." });
            }
        }

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
