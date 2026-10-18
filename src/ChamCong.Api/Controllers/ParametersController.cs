using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Engine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize(Policy = "RequireHR")]
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
        _access.EnsureStaffOrAbove();
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
    public async Task<IActionResult> SaveParameter(int companyId, [FromBody] SaveParameterValueDto dto, CancellationToken ct)
    {
        _access.EnsureHR();
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

    public record ShiftHoursDto(
        string ShiftStart,
        string ShiftEnd,
        string LunchStart,
        int LunchMinutes,
        int CheckoutPrepareMinutes,
        string CheckoutStartTime,
        string StandardHoursRange,
        string CompanyName
    );

    public record SaveShiftHoursRequestDto(
        string ShiftStart,
        string ShiftEnd,
        string? LunchStart,
        int? LunchMinutes,
        int? CheckoutPrepareMinutes
    );

    [HttpGet("companies/{companyId}/shift-hours")]
    public async Task<IActionResult> GetShiftHours(int companyId, CancellationToken ct)
    {
        var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company == null) return NotFound(new { message = "Không tìm thấy hội sở." });

        var comParams = await _db.ParameterValues.AsNoTracking()
            .Where(p => (p.CompanyId == null || p.CompanyId == companyId) && p.GroupId == null)
            .ToListAsync(ct);

        string GetParam(string code, string fallback)
        {
            var comp = comParams.FirstOrDefault(p => p.CompanyId == companyId && p.Code == code);
            if (comp != null && !string.IsNullOrWhiteSpace(comp.Value)) return comp.Value.Trim();
            var sys = comParams.FirstOrDefault(p => p.CompanyId == null && p.Code == code);
            if (sys != null && !string.IsNullOrWhiteSpace(sys.Value)) return sys.Value.Trim();
            return fallback;
        }

        var shiftHours = GetParam(ParamCatalog.ShiftStandardHours, "08:00-17:00");
        var lunchStart = GetParam(ParamCatalog.LunchBreakStart, "12:00");
        var lunchMinutesStr = GetParam(ParamCatalog.LunchBreakMinutes, "60");
        int.TryParse(lunchMinutesStr, out var lunchMinutes);
        if (lunchMinutes <= 0) lunchMinutes = 60;

        TimeUtil.TryParseRange(shiftHours, out var startMin, out var endMin);
        if (startMin <= 0 && endMin <= 0)
        {
            startMin = 480;
            endMin = 1020;
        }

        const int prepareMinutes = 30;
        var checkoutStartMin = Math.Max(startMin, endMin - prepareMinutes);

        return Ok(new ShiftHoursDto(
            TimeUtil.FormatHm(startMin),
            TimeUtil.FormatHm(endMin),
            lunchStart,
            lunchMinutes,
            prepareMinutes,
            TimeUtil.FormatHm(checkoutStartMin),
            $"{TimeUtil.FormatHm(startMin)}-{TimeUtil.FormatHm(endMin)}",
            company.Name
        ));
    }

    [HttpPost("companies/{companyId}/shift-hours")]
    public async Task<IActionResult> SaveShiftHours(int companyId, [FromBody] SaveShiftHoursRequestDto dto, CancellationToken ct)
    {
        _access.EnsureHR();
        await _access.EnsureCompanyAsync(companyId, ct);

        if (!TimeUtil.TryParseHm(dto.ShiftStart, out var startMin) || !TimeUtil.TryParseHm(dto.ShiftEnd, out var endMin))
        {
            return BadRequest(new { message = "Định dạng giờ vào ca hoặc giờ tan ca không hợp lệ (HH:mm)." });
        }

        if (startMin >= endMin)
        {
            return BadRequest(new { message = "Giờ vào ca phải nhỏ hơn giờ tan ca." });
        }

        var shiftRange = $"{TimeUtil.FormatHm(startMin)}-{TimeUtil.FormatHm(endMin)}";
        var lunchStart = string.IsNullOrWhiteSpace(dto.LunchStart) ? "12:00" : dto.LunchStart.Trim();
        var lunchMinutes = dto.LunchMinutes.GetValueOrDefault(60);
        if (lunchMinutes < 0 || lunchMinutes > 240) lunchMinutes = 60;

        var flexInWindow = $"{TimeUtil.FormatHm(startMin)}-{TimeUtil.FormatHm(startMin + 10)}";
        var flexOutWindow = $"{TimeUtil.FormatHm(endMin)}-{TimeUtil.FormatHm(endMin + 10)}";

        var date = DateTime.Today;

        async Task UpsertParamAsync(string code, string val)
        {
            var existing = await _db.ParameterValues
                .FirstOrDefaultAsync(p => p.CompanyId == companyId && p.GroupId == null && p.Code == code && p.EffectiveFrom == date, ct);
            if (existing != null)
            {
                existing.Value = val;
                existing.UpdatedBy = _access.Username;
                existing.UpdatedAt = DateTime.Now;
            }
            else
            {
                _db.ParameterValues.Add(new ParameterValue
                {
                    CompanyId = companyId,
                    GroupId = null,
                    Code = code,
                    Value = val,
                    EffectiveFrom = date,
                    UpdatedBy = _access.Username,
                    UpdatedAt = DateTime.Now
                });
            }
        }

        await UpsertParamAsync(ParamCatalog.ShiftStandardHours, shiftRange);
        await UpsertParamAsync(ParamCatalog.LunchBreakStart, lunchStart);
        await UpsertParamAsync(ParamCatalog.LunchBreakMinutes, lunchMinutes.ToString());
        await UpsertParamAsync(ParamCatalog.FlexInWindow, flexInWindow);
        await UpsertParamAsync(ParamCatalog.FlexOutWindow, flexOutWindow);

        _audit.Log("CompanyShift", companyId.ToString(), "Update", new { companyId, shiftRange, lunchStart, lunchMinutes }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = $"Đã cập nhật ca làm việc hội sở thành công: {shiftRange} (nghỉ trưa: {lunchStart}, {lunchMinutes} phút)." });
    }
}
