using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/hr/branches/{branchCode}")]
[Route("api/hr/branches/{branchCode}")]
public class BranchSettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IGeofenceService _geofenceService;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public BranchSettingsController(
        AppDbContext db,
        IGeofenceService geofenceService,
        AccessService access,
        AuditService audit)
    {
        _db = db;
        _geofenceService = geofenceService;
        _access = access;
        _audit = audit;
    }

    // --- 1. GEOFENCE LOCATIONS ---
    public record CreateLocationDto(string LocationName, decimal Latitude, decimal Longitude, int? RadiusMeters);

    [HttpGet("locations")]
    public async Task<IActionResult> GetLocations(string branchCode, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        await _access.EnsureBranchAsync(branchCode, ct);

        var list = await _db.BranchLocations
            .AsNoTracking()
            .Where(l => l.BranchCode == branchCode && l.IsActive)
            .ToListAsync(ct);
        return Ok(list);
    }

    [HttpPost("locations")]
    public async Task<IActionResult> AddLocation(string branchCode, [FromBody] CreateLocationDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        await _access.EnsureBranchAsync(branchCode, ct);

        int radius = dto.RadiusMeters ?? 50;
        if (radius < 20 || radius > 500)
        {
            return BadRequest(new { code = "INVALID_RADIUS", message = "Bán kính geofence phải từ 20 đến 500 mét." });
        }

        var loc = new BranchLocation
        {
            BranchCode = branchCode,
            LocationName = dto.LocationName,
            Latitude = dto.Latitude,
            Longitude = dto.Longitude,
            RadiusMeters = radius,
            IsActive = true
        };

        _db.BranchLocations.Add(loc);
        await _db.SaveChangesAsync(ct);

        _audit.Log("BranchLocation", loc.LocationId, "AddLocation", $"Thêm điểm {dto.LocationName} bán kính {radius}m cho {branchCode}");
        return Ok(loc);
    }

    [HttpDelete("locations/{id}")]
    public async Task<IActionResult> DeleteLocation(string branchCode, int id, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        await _access.EnsureBranchAsync(branchCode, ct);

        var loc = await _db.BranchLocations.FirstOrDefaultAsync(l => l.LocationId == id && l.BranchCode == branchCode, ct);
        if (loc == null) return NotFound();

        loc.IsActive = false;
        await _db.SaveChangesAsync(ct);

        _audit.Log("BranchLocation", id, "DeleteLocation", $"Ngưng kích hoạt điểm {loc.LocationName} cho {branchCode}");
        return Ok(new { message = "Đã xóa điểm vị trí thành công." });
    }

    // --- 2. PUBLIC IP / NETWORKS ---
    public record CreateNetworkDto(string Cidr, string? Description, string? ValidFrom, string? ValidTo);

    [HttpGet("networks")]
    public async Task<IActionResult> GetNetworks(string branchCode, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        await _access.EnsureBranchAsync(branchCode, ct);

        var list = await _db.BranchNetworks
            .AsNoTracking()
            .Where(n => n.BranchCode == branchCode && n.IsActive)
            .OrderByDescending(n => n.CreatedAtUtc)
            .ToListAsync(ct);
        return Ok(list);
    }

    [HttpPost("networks")]
    public async Task<IActionResult> AddNetwork(string branchCode, [FromBody] CreateNetworkDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        await _access.EnsureBranchAsync(branchCode, ct);

        var cidr = dto.Cidr?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(cidr)) return BadRequest(new { message = "Dải CIDR không được để trống." });

        // Tự động thêm /32 nếu chỉ nhập IP đơn
        if (!cidr.Contains('/'))
        {
            cidr = $"{cidr}/32";
        }

        var validFrom = DateTime.TryParse(dto.ValidFrom, out var vf) ? vf.Date : DateTime.Today;
        DateTime? validTo = DateTime.TryParse(dto.ValidTo, out var vt) ? vt.Date : null;

        // Kiểm tra xem CIDR này đã tồn tại trong CSDL chưa (kể cả đã bị xóa mềm)
        var existingNet = await _db.BranchNetworks
            .FirstOrDefaultAsync(n => n.BranchCode == branchCode && n.Cidr == cidr, ct);

        if (existingNet != null)
        {
            existingNet.IsActive = true;
            existingNet.Description = dto.Description;
            existingNet.ValidFrom = validFrom;
            existingNet.ValidTo = validTo;
            await _db.SaveChangesAsync(ct);
            _audit.Log("BranchNetwork", existingNet.NetworkId, "AddNetwork", $"Kích hoạt lại dải IP {cidr} cho hội sở {branchCode}");
            return Ok(existingNet);
        }

        var net = new BranchNetwork
        {
            BranchCode = branchCode,
            Cidr = cidr,
            Description = dto.Description,
            ValidFrom = validFrom,
            ValidTo = validTo,
            IsActive = true,
            CreatedByUserId = User.UserId(),
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.BranchNetworks.Add(net);
        await _db.SaveChangesAsync(ct);

        _audit.Log("BranchNetwork", net.NetworkId, "AddNetwork", $"Thêm dải IP {cidr} cho hội sở {branchCode}");
        return Ok(net);
    }

    public record UseMyIpDto(string? ClientPublicIp);

    /// <summary>Nút "Dùng IP hiện tại của tôi": Server đọc Public IP của chính HCNS đang gọi và tự động thêm vào hội sở.</summary>
    [HttpPost("networks/use-my-ip")]
    public async Task<IActionResult> UseMyCurrentIp(string branchCode, [FromBody] UseMyIpDto? dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        await _access.EnsureBranchAsync(branchCode, ct);

        string clientIp;
        if (!string.IsNullOrWhiteSpace(dto?.ClientPublicIp) && System.Net.IPAddress.TryParse(dto.ClientPublicIp.Trim(), out var parsedIp))
        {
            clientIp = parsedIp.ToString();
        }
        else
        {
            clientIp = _geofenceService.ResolveClientIp(HttpContext);
        }

        var cidr = $"{clientIp}/32";

        var isLocal = clientIp == "127.0.0.1" || clientIp == "::1" || clientIp.StartsWith("192.168.") || clientIp.StartsWith("10.");
        var noticeSuffix = isLocal ? " (Lưu ý: Đây là IP nội bộ/loopback. Vui lòng đảm bảo kết nối mạng có Public IP của modem để nhân viên chấm công chuẩn xác)." : "";

        var existing = await _db.BranchNetworks
            .FirstOrDefaultAsync(n => n.BranchCode == branchCode && n.Cidr == cidr, ct);

        if (existing != null)
        {
            if (!existing.IsActive)
            {
                existing.IsActive = true;
                existing.Description = $"Kích hoạt lại từ máy HCNS lúc {DateTime.Now:dd/MM/yyyy HH:mm}{(isLocal ? " [Local/LAN]" : " [Public WAN]")}";
                existing.ValidFrom = DateTime.Today;
                existing.ValidTo = null;
                await _db.SaveChangesAsync(ct);
                _audit.Log("BranchNetwork", existing.NetworkId, "UseMyIp", $"HCNS kích hoạt lại IP văn phòng: {cidr} cho {branchCode}");
                return Ok(new { message = $"Đã kích hoạt lại Public IP ({clientIp}) cho hội sở.{noticeSuffix}", existing.NetworkId, cidr, clientIp, isLocal });
            }
            return Ok(new { message = $"Public IP ({clientIp}) đã có trong cấu hình hội sở.{noticeSuffix}", existing.NetworkId, clientIp, isLocal });
        }

        var net = new BranchNetwork
        {
            BranchCode = branchCode,
            Cidr = cidr,
            Description = $"Thêm tự động từ máy HCNS lúc {DateTime.Now:dd/MM/yyyy HH:mm}{(isLocal ? " [Local/LAN]" : " [Public WAN]")}",
            ValidFrom = DateTime.Today,
            IsActive = true,
            CreatedByUserId = User.UserId(),
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.BranchNetworks.Add(net);
        await _db.SaveChangesAsync(ct);

        _audit.Log("BranchNetwork", net.NetworkId, "UseMyIp", $"HCNS thêm IP văn phòng: {cidr} cho {branchCode}");
        return Ok(new { message = $"Đã thêm thành công Public IP ({clientIp}) vào hội sở.{noticeSuffix}", net.NetworkId, cidr, clientIp, isLocal });
    }

    [HttpDelete("networks/{id}")]
    public async Task<IActionResult> DeleteNetwork(string branchCode, int id, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        await _access.EnsureBranchAsync(branchCode, ct);

        var net = await _db.BranchNetworks.FirstOrDefaultAsync(n => n.NetworkId == id && n.BranchCode == branchCode, ct);
        if (net == null) return NotFound();

        net.IsActive = false;
        net.ValidTo = DateTime.Today.AddDays(-1);
        await _db.SaveChangesAsync(ct);

        _audit.Log("BranchNetwork", id, "DeleteNetwork", $"Ngưng kích hoạt mạng IP {net.Cidr} cho {branchCode}");
        return Ok(new { message = "Đã ngưng hiệu lực dải IP thành công." });
    }
}

[ApiController]
[Authorize]
[Route("api/v1/hr/dashboard")]
[Route("api/hr/dashboard")]
public class HrDashboardController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;

    public HrDashboardController(AppDbContext db, AccessService access)
    {
        _db = db;
        _access = access;
    }

    /// <summary>Số liệu tổng hợp hôm nay và các hàng đợi dành cho HCNS.</summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary([FromQuery] string? branch, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        if (!string.IsNullOrWhiteSpace(branch))
        {
            await _access.EnsureBranchAsync(branch, ct);
        }

        var today = AttendancePunchService.ToVietnamTime(DateTime.UtcNow).Date;

        var punchesQ = _db.WebAttendanceLogs.AsNoTracking().Where(l => l.WorkDate == today);
        if (!string.IsNullOrWhiteSpace(branch))
        {
            punchesQ = punchesQ.Where(l => l.DetectedBranchCode == branch);
        }
        else
        {
            var allowedCodes = await _access.AllowedBranchCodesAsync(ct);
            if (allowedCodes != null)
            {
                punchesQ = punchesQ.Where(l => l.DetectedBranchCode != null && allowedCodes.Contains(l.DetectedBranchCode));
            }
        }

        var punchesToday = await punchesQ.ToListAsync(ct);

        int checkedInCount = punchesToday.Select(p => p.EmployeeCode).Distinct().Count();
        int validCount = punchesToday.Count(p => p.VerificationStatus == "VALID");
        int reviewCount = punchesToday.Count(p => p.VerificationStatus == "REVIEW");
        int outCount = punchesToday.Count(p => p.VerificationStatus == "OUT_OF_OFFICE");

        // Đếm thiết bị chờ duyệt theo đúng cơ sở
        IQueryable<EmployeeDevice> devQuery = _db.EmployeeDevices.AsNoTracking().Where(d => d.ApprovalStatus == "PENDING" && d.IsActiveSlot);
        if (!string.IsNullOrWhiteSpace(branch))
        {
            var branchComp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Code == branch, ct);
            var empInBranch = await _db.Employees.AsNoTracking().Where(e => branchComp != null && e.CompanyId == branchComp.Id).Select(e => e.EmployeeCode).ToListAsync(ct);
            var assignedInBranch = await _db.EmployeeBranchAssignments.AsNoTracking().Where(a => a.BranchCode == branch && (a.ToDate == null || a.ToDate >= DateTime.Today)).Select(a => a.EmployeeCode).ToListAsync(ct);
            var branchEmpSet = empInBranch.Concat(assignedInBranch).Distinct().ToList();
            devQuery = devQuery.Where(d => branchEmpSet.Contains(d.EmployeeCode));
        }
        else
        {
            var allowedEmpCodes = await _access.AllowedEmployeeCodesAsync(ct);
            if (allowedEmpCodes != null)
            {
                devQuery = devQuery.Where(d => allowedEmpCodes.Contains(d.EmployeeCode));
            }
        }
        int pendingDevices = await devQuery.CountAsync(ct);

        // Đếm đơn từ chờ duyệt theo đúng cơ sở
        IQueryable<EmployeeRequest> reqQuery = _db.EmployeeRequests.AsNoTracking().Where(r => r.Status == "PENDING_HR");
        if (!string.IsNullOrWhiteSpace(branch))
        {
            var branchComp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Code == branch, ct);
            var empInBranch = await _db.Employees.AsNoTracking().Where(e => branchComp != null && e.CompanyId == branchComp.Id).Select(e => e.EmployeeCode).ToListAsync(ct);
            var assignedInBranch = await _db.EmployeeBranchAssignments.AsNoTracking().Where(a => a.BranchCode == branch && (a.ToDate == null || a.ToDate >= DateTime.Today)).Select(a => a.EmployeeCode).ToListAsync(ct);
            var branchEmpSet = empInBranch.Concat(assignedInBranch).Distinct().ToList();
            reqQuery = reqQuery.Where(r => branchEmpSet.Contains(r.EmployeeCode));
        }
        else
        {
            var allowedEmpCodes = await _access.AllowedEmployeeCodesAsync(ct);
            if (allowedEmpCodes != null)
            {
                reqQuery = reqQuery.Where(r => allowedEmpCodes.Contains(r.EmployeeCode));
            }
        }
        int pendingRequests = await reqQuery.CountAsync(ct);

        // Đếm cảnh báo theo đúng cơ sở
        IQueryable<HrAlert> alertQuery = _db.HrAlerts.AsNoTracking().Where(a => a.Status == "OPEN");
        if (!string.IsNullOrWhiteSpace(branch))
        {
            alertQuery = alertQuery.Where(a => a.BranchCode == branch);
        }
        else
        {
            var allowedCodes = await _access.AllowedBranchCodesAsync(ct);
            if (allowedCodes != null)
            {
                alertQuery = alertQuery.Where(a => a.BranchCode != null && allowedCodes.Contains(a.BranchCode));
            }
        }
        int openAlerts = await alertQuery.CountAsync(ct);

        return Ok(new
        {
            todayDate = today.ToString("yyyy-MM-dd"),
            checkedInCount,
            validCount,
            reviewCount,
            outCount,
            pendingDevices,
            pendingRequests,
            openAlerts
        });
    }

    /// <summary>Xem các cảnh báo HCNS (IP đổi, lặp lại vi phạm, bất thường).</summary>
    [HttpGet("alerts")]
    public async Task<IActionResult> GetAlerts([FromQuery] string? branch, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var q = _db.HrAlerts.AsNoTracking().Where(a => a.Status == "OPEN");
        if (!string.IsNullOrWhiteSpace(branch))
        {
            await _access.EnsureBranchAsync(branch, ct);
            q = q.Where(a => a.BranchCode == branch);
        }
        else
        {
            var allowedCodes = await _access.AllowedBranchCodesAsync(ct);
            if (allowedCodes != null)
            {
                q = q.Where(a => a.BranchCode != null && allowedCodes.Contains(a.BranchCode));
            }
        }

        var alerts = await q
            .OrderByDescending(a => a.CreatedAtUtc)
            .Take(50)
            .ToListAsync(ct);
        return Ok(alerts);
    }

    /// <summary>Xác nhận cảnh báo HCNS.</summary>
    [HttpPost("alerts/{id}/ack")]
    public async Task<IActionResult> AckAlert(int id, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var alert = await _db.HrAlerts.FirstOrDefaultAsync(a => a.AlertId == id, ct);
        if (alert == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(alert.BranchCode))
        {
            await _access.EnsureBranchAsync(alert.BranchCode, ct);
        }

        alert.Status = "ACKED";
        alert.AckedByUserId = User.UserId();
        alert.AckedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã xác nhận cảnh báo." });
    }
}
