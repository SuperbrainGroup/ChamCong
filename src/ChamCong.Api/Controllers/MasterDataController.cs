using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Engine;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/companies/{companyId}")]
[Authorize]
public class MasterDataController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public MasterDataController(AppDbContext db, AccessService access, AuditService audit)
    {
        _db = db;
        _access = access;
        _audit = audit;
    }

    // ==========================================
    // 1. DEPARTMENTS (Bộ phận)
    // ==========================================
    public record DepartmentDto(int Id, int CompanyId, string Name, int SortOrder);
    public record SaveDepartmentDto(string Name, int SortOrder);

    [HttpGet("departments")]
    public async Task<IActionResult> GetDepartments(int companyId, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var list = await _db.Departments
            .AsNoTracking()
            .Where(d => d.CompanyId == companyId)
            .OrderBy(d => d.SortOrder)
            .ThenBy(d => d.Name)
            .Select(d => new DepartmentDto(d.Id, d.CompanyId, d.Name, d.SortOrder))
            .ToListAsync(ct);
        return Ok(list);
    }

    [HttpPost("departments")]
    public async Task<IActionResult> CreateDepartment(int companyId, [FromBody] SaveDepartmentDto dto, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var name = Text.Required(dto.Name, "Tên bộ phận", 100);

        if (await _db.Departments.AnyAsync(d => d.CompanyId == companyId && d.Name == name, ct))
        {
            return BadRequest(new { message = $"Bộ phận '{name}' đã tồn tại trong hội sở." });
        }

        var dept = new Department
        {
            CompanyId = companyId,
            Name = name,
            SortOrder = dto.SortOrder
        };
        _db.Departments.Add(dept);
        await _db.SaveChangesAsync(ct);

        _audit.Log("Department", dept.Id, "Create", new { name, sortOrder = dto.SortOrder }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new DepartmentDto(dept.Id, dept.CompanyId, dept.Name, dept.SortOrder));
    }

    [HttpPut("departments/{id}")]
    public async Task<IActionResult> UpdateDepartment(int companyId, int id, [FromBody] SaveDepartmentDto dto, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var dept = await _db.Departments.FirstOrDefaultAsync(d => d.Id == id && d.CompanyId == companyId, ct);
        if (dept == null) return NotFound();

        var name = Text.Required(dto.Name, "Tên bộ phận", 100);
        if (await _db.Departments.AnyAsync(d => d.CompanyId == companyId && d.Name == name && d.Id != id, ct))
        {
            return BadRequest(new { message = $"Bộ phận '{name}' đã tồn tại trong hội sở." });
        }

        dept.Name = name;
        dept.SortOrder = dto.SortOrder;

        _audit.Log("Department", dept.Id, "Update", new { name, sortOrder = dto.SortOrder }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new DepartmentDto(dept.Id, dept.CompanyId, dept.Name, dept.SortOrder));
    }

    [HttpDelete("departments/{id}")]
    public async Task<IActionResult> DeleteDepartment(int companyId, int id, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var dept = await _db.Departments.FirstOrDefaultAsync(d => d.Id == id && d.CompanyId == companyId, ct);
        if (dept == null) return NotFound();

        if (await _db.Employees.AnyAsync(e => e.DepartmentId == id, ct))
        {
            return BadRequest(new { message = "Không thể xóa bộ phận đang có nhân viên trực thuộc." });
        }

        _db.Departments.Remove(dept);
        _audit.Log("Department", dept.Id, "Delete", $"Xóa bộ phận '{dept.Name}'", companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã xóa bộ phận." });
    }

    // ==========================================
    // 2. EMPLOYEE GROUPS (Khối nhân viên)
    // ==========================================
    public record EmployeeGroupDto(int Id, int CompanyId, string Code, string Name, bool IsDefault);
    public record SaveEmployeeGroupDto(string Code, string Name);

    [HttpGet("groups")]
    public async Task<IActionResult> GetGroups(int companyId, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var list = await _db.EmployeeGroups
            .AsNoTracking()
            .Where(g => g.CompanyId == companyId)
            .OrderBy(g => g.Id)
            .Select(g => new EmployeeGroupDto(g.Id, g.CompanyId, g.Code, g.Name, g.IsDefault))
            .ToListAsync(ct);
        return Ok(list);
    }

    [HttpPost("groups")]
    public async Task<IActionResult> CreateGroup(int companyId, [FromBody] SaveEmployeeGroupDto dto, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var code = Text.Required(dto.Code, "Mã khối", 20).ToUpperInvariant();
        var name = Text.Required(dto.Name, "Tên khối", 100);

        if (await _db.EmployeeGroups.AnyAsync(g => g.CompanyId == companyId && g.Code == code, ct))
        {
            return BadRequest(new { message = $"Mã khối '{code}' đã tồn tại trong hội sở." });
        }

        var grp = new EmployeeGroup
        {
            CompanyId = companyId,
            Code = code,
            Name = name,
            IsDefault = false
        };
        _db.EmployeeGroups.Add(grp);
        await _db.SaveChangesAsync(ct);

        _audit.Log("EmployeeGroup", grp.Id, "Create", new { code, name }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new EmployeeGroupDto(grp.Id, grp.CompanyId, grp.Code, grp.Name, grp.IsDefault));
    }

    // ==========================================
    // 3. ATTENDANCE CODES (Bảng quy chuẩn mã ký hiệu)
    // ==========================================
    public record AttendanceCodeDto(
        int Id,
        int CompanyId,
        string Code,
        string Name,
        decimal WorkValue,
        decimal HolidayValue,
        decimal AnnualLeaveValue,
        decimal PaidLeaveValue,
        byte FundType,
        decimal FundDeduct,
        bool IsHalfLeave,
        string? Color,
        int SortOrder,
        bool IsSystem,
        string? Condition);

    public record SaveAttendanceCodeDto(
        string Name,
        decimal WorkValue,
        decimal HolidayValue,
        decimal AnnualLeaveValue,
        decimal PaidLeaveValue,
        byte FundType,
        decimal FundDeduct,
        bool IsHalfLeave,
        string? Color,
        int SortOrder,
        string? Condition);

    [HttpGet("codes")]
    public async Task<IActionResult> GetCodes(int companyId, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var list = await _db.AttendanceCodes
            .AsNoTracking()
            .Where(c => c.CompanyId == companyId)
            .OrderBy(c => c.SortOrder)
            .Select(c => new AttendanceCodeDto(
                c.Id, c.CompanyId, c.Code, c.Name, c.WorkValue, c.HolidayValue,
                c.AnnualLeaveValue, c.PaidLeaveValue, c.FundType, c.FundDeduct,
                c.IsHalfLeave, c.Color, c.SortOrder, c.IsSystem, c.Condition))
            .ToListAsync(ct);
        return Ok(list);
    }

    [HttpPut("codes/{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> UpdateCode(int companyId, int id, [FromBody] SaveAttendanceCodeDto dto, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var code = await _db.AttendanceCodes.FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId, ct);
        if (code == null) return NotFound();

        var name = Text.Required(dto.Name, "Tên mã ký hiệu", 150);

        code.Name = name;
        code.WorkValue = dto.WorkValue;
        code.HolidayValue = dto.HolidayValue;
        code.AnnualLeaveValue = dto.AnnualLeaveValue;
        code.PaidLeaveValue = dto.PaidLeaveValue;
        code.FundType = dto.FundType;
        code.FundDeduct = dto.FundDeduct;
        code.IsHalfLeave = dto.IsHalfLeave;
        code.Color = dto.Color?.TrimStart('#');
        code.SortOrder = dto.SortOrder;
        code.Condition = dto.Condition;

        _audit.Log("AttendanceCode", code.Id, "Update", new { code = code.Code, name, dto.Color }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Cập nhật mã ký hiệu thành công." });
    }
}
