using System.Data;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/audit-logs")]
[Authorize]
public class AuditLogsController : ControllerBase
{
    private readonly AccessService _access;
    private readonly IConfiguration _config;

    public AuditLogsController(AccessService access, IConfiguration config)
    {
        _access = access;
        _config = config;
    }

    public record AuditLogDto(
        long Id,
        DateTime At,
        string Username,
        int? CompanyId,
        int? PeriodId,
        string Entity,
        string? EntityId,
        string Action,
        string? Detail);

    [HttpGet]
    public async Task<IActionResult> GetPaged(
        [FromQuery] int? companyId,
        [FromQuery] int? periodId,
        [FromQuery] string? keyword,
        [FromQuery] int pageIndex = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var allowedCompanies = await _access.AllowedCompanyIdsAsync(ct);
        string? companyIdsParam = null;

        if (allowedCompanies != null)
        {
            if (companyId.HasValue && !allowedCompanies.Contains(companyId.Value))
            {
                return Ok(new { items = Array.Empty<AuditLogDto>(), totalCount = 0, pageIndex, pageSize });
            }
            companyIdsParam = companyId.HasValue ? companyId.Value.ToString() : string.Join(",", allowedCompanies);
        }
        else if (companyId.HasValue)
        {
            companyIdsParam = companyId.Value.ToString();
        }

        var connStr = Environment.GetEnvironmentVariable("DATABASE_CONNECTION_STRING")
            ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? _config.GetConnectionString("DefaultConnection");
        using var conn = new SqlConnection(connStr);
        await conn.OpenAsync(ct);

        var parameters = new DynamicParameters();
        parameters.Add("@CompanyIds", companyIdsParam);
        parameters.Add("@PeriodId", periodId);
        parameters.Add("@Keyword", Text.Clean(keyword, 100));
        parameters.Add("@PageIndex", Math.Max(1, pageIndex));
        parameters.Add("@PageSize", Math.Clamp(pageSize, 10, 200));
        parameters.Add("@TotalCount", dbType: DbType.Int32, direction: ParameterDirection.Output);

        var items = await conn.QueryAsync<AuditLogDto>(
            "dbo.sp_GetAuditLogsPaged",
            parameters,
            commandType: CommandType.StoredProcedure);

        int totalCount = parameters.Get<int>("@TotalCount");

        return Ok(new
        {
            items = items.ToList(),
            totalCount,
            pageIndex,
            pageSize
        });
    }
}
