using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CompaniesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public CompaniesController(AppDbContext db, AccessService access, AuditService audit)
    {
        _db = db;
        _access = access;
        _audit = audit;
    }

    public record CompanyDto(int Id, string Code, string Name, bool IsActive, bool HasLogo);
    public record CreateCompanyDto(string Code, string Name);
    public record UpdateCompanyDto(string Name, bool IsActive);

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var allowed = await _access.AllowedCompanyIdsAsync(ct);
        var q = _db.Companies.AsNoTracking();
        if (allowed != null)
        {
            q = q.Where(c => allowed.Contains(c.Id));
        }

        var list = await q.OrderBy(c => c.Name)
            .Select(c => new CompanyDto(c.Id, c.Code, c.Name, c.IsActive, c.Logo != null))
            .ToListAsync(ct);

        return Ok(list);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(id, ct);
        var c = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c == null) return NotFound();

        return Ok(new CompanyDto(c.Id, c.Code, c.Name, c.IsActive, c.Logo != null));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Create([FromBody] CreateCompanyDto dto, CancellationToken ct)
    {
        var code = Text.Required(dto.Code, "Mã hội sở", 30).ToUpperInvariant();
        var name = Text.Required(dto.Name, "Tên hội sở", 200);

        if (await _db.Companies.AnyAsync(c => c.Code == code, ct))
        {
            return BadRequest(new { message = $"Mã hội sở '{code}' đã tồn tại trong hệ thống." });
        }

        var comp = new Company
        {
            Code = code,
            Name = name,
            IsActive = true,
            CreatedAt = DateTime.Now
        };
        _db.Companies.Add(comp);
        await _db.SaveChangesAsync(ct);

        // Khởi tạo các danh mục mặc định cho hội sở: 3 khối, bảng mã chuẩn, tham số
        await DbSeeder.InitializeCompanyDefaultsAsync(_db, comp.Id, _access.Username);

        _audit.Log("Company", comp.Id, "Create", new { code, name }, companyId: comp.Id);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetById), new { id = comp.Id }, new CompanyDto(comp.Id, comp.Code, comp.Name, comp.IsActive, false));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateCompanyDto dto, CancellationToken ct)
    {
        var comp = await _db.Companies.FindAsync(new object[] { id }, ct);
        if (comp == null) return NotFound();

        var name = Text.Required(dto.Name, "Tên hội sở", 200);

        // Ràng buộc: Hội sở đã có kỳ công thì không được ngưng nếu đang active trừ khi xác nhận
        comp.Name = name;
        comp.IsActive = dto.IsActive;

        _audit.Log("Company", comp.Id, "Update", new { name, isActive = dto.IsActive }, companyId: comp.Id);
        await _db.SaveChangesAsync(ct);

        return Ok(new CompanyDto(comp.Id, comp.Code, comp.Name, comp.IsActive, comp.Logo != null));
    }

    [HttpGet("{id}/logo")]
    [AllowAnonymous]
    public async Task<IActionResult> GetLogo(int id, CancellationToken ct)
    {
        var comp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (comp == null || comp.Logo == null) return NotFound();

        return File(comp.Logo, comp.LogoContentType ?? "image/png");
    }

    [HttpPost("{id}/logo")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> UploadLogo(int id, IFormFile file, CancellationToken ct)
    {
        var comp = await _db.Companies.FindAsync(new object[] { id }, ct);
        if (comp == null) return NotFound();

        if (file.Length > 1024 * 1024)
        {
            return BadRequest(new { message = "Kích thước file logo không được vượt quá 1MB." });
        }

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);

        comp.Logo = ms.ToArray();
        comp.LogoContentType = file.ContentType;

        _audit.Log("Company", comp.Id, "UploadLogo", $"Cập nhật logo ({file.Length} bytes)", companyId: comp.Id);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Tải lên logo thành công." });
    }

    [HttpDelete("{id}/logo")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteLogo(int id, CancellationToken ct)
    {
        var comp = await _db.Companies.FindAsync(new object[] { id }, ct);
        if (comp == null) return NotFound();

        comp.Logo = null;
        comp.LogoContentType = null;

        _audit.Log("Company", comp.Id, "DeleteLogo", "Xóa logo", companyId: comp.Id);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã xóa logo." });
    }
}
