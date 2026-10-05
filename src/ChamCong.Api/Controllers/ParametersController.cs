using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Engine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class ParametersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public ParametersController(AppDbContext db, AccessService access, AuditService audit)
    {
        _db = db;
        _access = access;
        _audit = audit;
    }

    [HttpGet("parameters/catalog")]
    public IActionResult GetCatalog()
    {
        return Ok(ParamCatalog.All);
    }

    public record ParameterMatrixRow(
        string Code,
        string Group,
        string Name,
        string Type,
        string Default,
        string Description,
        bool CompanyOnly,
        string? CompanyValue,
        Dictionary<int, string> GroupValues);

    [HttpGet("companies/{companyId}/parameters")]
    public async Task<IActionResult> GetParameters(int companyId, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);

        var groups = await _db.EmployeeGroups
            .AsNoTracking()
            .Where(g => g.CompanyId == companyId)
            .OrderBy(g => g.Id)
            .ToListAsync(ct);

        var values = await _db.ParameterValues
            .AsNoTracking()
            .Where(p => p.CompanyId == null || p.CompanyId == companyId)
            .ToListAsync(ct);

        var companyVals = values
            .Where(p => p.CompanyId == companyId && p.GroupId == null)
            .GroupBy(p => p.Code)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(p => p.EffectiveFrom).First().Value);

        var groupVals = values
            .Where(p => p.CompanyId == companyId && p.GroupId != null)
            .GroupBy(p => (p.GroupId!.Value, p.Code))
            .ToDictionary(g => g.Key, g => g.OrderByDescending(p => p.EffectiveFrom).First().Value);

        var rows = new List<ParameterMatrixRow>();

        foreach (var def in ParamCatalog.All)
        {
            companyVals.TryGetValue(def.Code, out var compVal);
            var grpDict = new Dictionary<int, string>();

            foreach (var grp in groups)
            {
                if (groupVals.TryGetValue((grp.Id, def.Code), out var gVal))
                {
                    grpDict[grp.Id] = gVal;
                }
            }

            rows.Add(new ParameterMatrixRow(
                def.Code,
                def.Group,
                def.Name,
                def.Type.ToString(),
                def.Default,
                def.Description,
                def.CompanyOnly,
                compVal,
                grpDict
            ));
        }

        return Ok(new
        {
            groups = groups.Select(g => new { g.Id, g.Code, g.Name, g.IsDefault }),
            rows
        });
    }

    public record SaveParameterValueDto(
        string Code,
        int? GroupId,
        string Value,
        DateTime EffectiveFrom);

    [HttpPost("companies/{companyId}/parameters")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> SaveParameter(int companyId, [FromBody] SaveParameterValueDto dto, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var def = ParamCatalog.Find(dto.Code);
        if (def == null) return BadRequest(new { message = $"Mã tham số '{dto.Code}' không hợp lệ." });

        if (def.CompanyOnly && dto.GroupId.HasValue)
        {
            return BadRequest(new { message = $"Tham số '{def.Name}' chỉ áp dụng ở mức toàn hội sở, không phân theo khối." });
        }

        var validationError = ParamCatalog.Validate(def, dto.Value);
        if (validationError != null)
        {
            return BadRequest(new { message = $"Giá trị không hợp lệ: {validationError}" });
        }

        var date = dto.EffectiveFrom.Date;

        var existing = await _db.ParameterValues
            .FirstOrDefaultAsync(p => p.CompanyId == companyId && p.GroupId == dto.GroupId && p.Code == dto.Code && p.EffectiveFrom == date, ct);

        if (existing != null)
        {
            existing.Value = dto.Value.Trim();
            existing.UpdatedBy = _access.Username;
            existing.UpdatedAt = DateTime.Now;
        }
        else
        {
            _db.ParameterValues.Add(new ParameterValue
            {
                CompanyId = companyId,
                GroupId = dto.GroupId,
                Code = dto.Code,
                Value = dto.Value.Trim(),
                EffectiveFrom = date,
                UpdatedBy = _access.Username,
                UpdatedAt = DateTime.Now
            });
        }

        _audit.Log("Parameter", dto.Code, "Update", new { companyId, groupId = dto.GroupId, code = dto.Code, value = dto.Value, effectiveFrom = date }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Lưu tham số thành công." });
    }
}
