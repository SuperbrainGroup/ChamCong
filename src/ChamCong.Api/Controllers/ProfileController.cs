using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/[controller]")]
[Route("api/[controller]")]
public class ProfileController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IEmployeeRequestService _requestService;
    private readonly IDeviceService _deviceService;

    public ProfileController(AppDbContext db, IEmployeeRequestService requestService, IDeviceService deviceService)
    {
        _db = db;
        _requestService = requestService;
        _deviceService = deviceService;
    }

    /// <summary>Lấy thông tin hồ sơ cá nhân đầy đủ (Hội sở chính/phụ, ca làm việc, 2 khe thiết bị).</summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMyProfile(CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return Ok(new
            {
                user.Id,
                user.Username,
                user.FullName,
                user.Role,
                employee = (object?)null
            });
        }

        var emp = await _db.Employees
            .Include(e => e.DepartmentId)
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.EmployeeCode == user.EmployeeCode, ct);

        Department? dept = null;
        if (emp?.DepartmentId != null)
        {
            dept = await _db.Departments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == emp.DepartmentId.Value, ct);
        }

        Company? primaryComp = null;
        if (emp != null)
        {
            primaryComp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == emp.CompanyId, ct);
        }

        // Hội sở phụ
        var secondaryAssignments = await _db.EmployeeBranchAssignments
            .AsNoTracking()
            .Where(a => a.EmployeeCode == user.EmployeeCode && !a.IsPrimary && (a.ToDate == null || a.ToDate >= DateTime.Today))
            .ToListAsync(ct);

        var devices = await _deviceService.GetMyDevicesAsync(user.EmployeeCode, ct);

        return Ok(new
        {
            user.Id,
            user.Username,
            user.FullName,
            user.Role,
            employeeCode = user.EmployeeCode,
            departmentName = dept?.Name ?? "Chưa phân bổ",
            primaryBranchCode = primaryComp?.Code ?? "",
            primaryBranchName = primaryComp?.Name ?? "",
            secondaryBranches = secondaryAssignments.Select(a => a.BranchCode),
            startDate = emp?.StartDate.ToString("dd/MM/yyyy"),
            devices = devices.Select(d => new
            {
                d.DeviceBindingId,
                d.DeviceType,
                d.DeviceName,
                d.ApprovalStatus,
                d.RequestedAtUtc,
                d.LastUsedAtUtc
            })
        });
    }

    /// <summary>Xem thẻ quỹ phép: Phép năm được cấp, phép tồn, phép bù, đã dùng, đang giữ chỗ, còn lại có thể xin.</summary>
    [HttpGet("leave/balance")]
    public async Task<IActionResult> GetLeaveBalance(CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return Ok(new { available = 0, annualOpening = 0, carryOpening = 0, compOpening = 0, used = 0, held = 0 });
        }

        var emp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.EmployeeCode == user.EmployeeCode, ct);
        if (emp == null) return Ok(new { available = 0 });

        int year = DateTime.Today.Year;
        var fund = await _db.LeaveFunds.AsNoTracking().FirstOrDefaultAsync(f => f.EmployeeId == emp.Id && f.Year == year, ct);

        decimal annualOpening = fund?.AnnualOpening ?? 12m;
        decimal carryOpening = fund?.CarryOpening ?? 0m;
        decimal compOpening = fund?.CompOpening ?? 0m;

        var ledgerDeducted = await _db.LeaveLedger
            .AsNoTracking()
            .Where(l => l.EmployeeId == emp.Id && l.Year == year)
            .SumAsync(l => (decimal?)l.Amount, ct) ?? 0m;

        var heldDays = await _db.EmployeeRequests
            .AsNoTracking()
            .Where(r => r.EmployeeCode == user.EmployeeCode &&
                        r.RequestType == "LEAVE" &&
                        r.Status == "PENDING_HR" &&
                        r.FromDate.Year == year)
            .SumAsync(r => (decimal?)r.DaysRequested, ct) ?? 0m;

        decimal totalOpening = annualOpening + carryOpening + compOpening;
        decimal available = Math.Max(0m, totalOpening - ledgerDeducted - heldDays);

        return Ok(new
        {
            year,
            annualOpening,
            carryOpening,
            compOpening,
            totalOpening,
            used = ledgerDeducted,
            held = heldDays,
            available
        });
    }
}
