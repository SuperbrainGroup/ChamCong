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
    private readonly ILeaveService _leaveService;

    public ProfileController(AppDbContext db, IEmployeeRequestService requestService, IDeviceService deviceService, ILeaveService leaveService)
    {
        _db = db;
        _requestService = requestService;
        _deviceService = deviceService;
        _leaveService = leaveService;
    }

    /// <summary>Lấy thông tin hồ sơ cá nhân đầy đủ (Hội sở chính/phụ, ca làm việc, 2 khe thiết bị).</summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMyProfile(CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
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

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == user.EmployeeCode);
        if (primaryCompanyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        }
        var emp = await empQuery.FirstOrDefaultAsync(ct);
        int? companyId = emp?.CompanyId ?? primaryCompanyId;

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
        var secondaryQuery = _db.EmployeeBranchAssignments
            .AsNoTracking()
            .Where(a => a.EmployeeCode == user.EmployeeCode && !a.IsPrimary && (a.ToDate == null || a.ToDate >= DateTime.Today));

        if (companyId.HasValue)
        {
            secondaryQuery = secondaryQuery.Where(a => a.CompanyId == companyId.Value || a.CompanyId == null);
        }

        var secondaryAssignments = await secondaryQuery.ToListAsync(ct);

        var devices = await _deviceService.GetMyDevicesAsync(user.EmployeeCode, companyId, ct);

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
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return Ok(new { available = 0, annualOpening = 0, carryOpening = 0, compOpening = 0, used = 0, held = 0 });
        }

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == user.EmployeeCode);
        if (primaryCompanyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        }
        var emp = await empQuery.FirstOrDefaultAsync(ct);
        if (emp == null) return Ok(new { available = 0 });

        int year = DateTime.Today.Year;
        var b = await _leaveService.GetEmployeeLeaveBalanceAsync(emp.Id, year, ct);

        return Ok(new
        {
            year,
            annualOpening = b.AnnualOpening,
            accrued = b.Accrued,
            carryOpening = b.CarryOpening,
            compOpening = b.CompOpening,
            totalEarned = b.TotalAnnualEarned,
            used = b.TotalUsed,
            held = b.PendingDays,
            available = b.AvailableBalance,
            isExhausted = b.IsExhausted
        });
    }
}
