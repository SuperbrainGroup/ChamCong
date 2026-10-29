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
public class TimesheetController : ControllerBase
{
    private readonly ITimesheetPublicationService _publicationService;
    private readonly AppDbContext _db;
    private readonly AuditService _audit;
    private readonly ILeaveService _leaveService;

    public TimesheetController(ITimesheetPublicationService publicationService, AppDbContext db, AuditService audit, ILeaveService leaveService)
    {
        _publicationService = publicationService;
        _db = db;
        _audit = audit;
        _leaveService = leaveService;
    }

    public record DisputeDto(int PublicationId, string? WorkDate, string Content);

    /// <summary>Lấy danh sách các kỳ công của nhân viên để lựa chọn trên giao diện.</summary>
    [HttpGet("periods")]
    public async Task<IActionResult> GetMyPeriods(CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { code = "NO_EMPLOYEE", message = "Tài khoản chưa liên kết nhân viên." });
        }

        var emp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.EmployeeCode == user.EmployeeCode, ct);
        if (emp == null)
        {
            return BadRequest(new { code = "NO_EMPLOYEE", message = "Không tìm thấy thông tin nhân viên." });
        }

        var periods = await _db.Periods
            .AsNoTracking()
            .Where(p => p.CompanyId == emp.CompanyId)
            .OrderByDescending(p => p.Year)
            .ThenByDescending(p => p.Month)
            .Select(p => new
            {
                id = p.Id,
                month = p.Month,
                year = p.Year,
                name = $"Tháng {p.Month:00}/{p.Year}" + (p.Status == PeriodStatus.Closed ? " (Đã chốt)" : p.Status == PeriodStatus.Calculated ? " (Đã tính)" : " (Bản nháp)"),
                status = p.Status.ToString(),
                isClosed = p.Status == PeriodStatus.Closed
            })
            .ToListAsync(ct);

        return Ok(periods);
    }

    /// <summary>Nhân viên xem bảng chấm công cá nhân chi tiết theo kỳ (ngày phép, ngày trễ, phép năm còn lại).</summary>
    [HttpGet("mine")]
    public async Task<IActionResult> GetMyTimesheet([FromQuery] int periodId, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { code = "NO_EMPLOYEE", message = "Tài khoản chưa liên kết nhân viên." });
        }

        var emp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.EmployeeCode == user.EmployeeCode, ct);
        if (emp == null)
        {
            return BadRequest(new { code = "NO_EMPLOYEE", message = "Không tìm thấy hồ sơ nhân viên tương ứng." });
        }

        // 1. Tải danh sách tất cả các kỳ của hội sở
        var allPeriods = await _db.Periods
            .AsNoTracking()
            .Where(p => p.CompanyId == emp.CompanyId)
            .OrderByDescending(p => p.Year)
            .ThenByDescending(p => p.Month)
            .ToListAsync(ct);

        if (!allPeriods.Any())
        {
            return Ok(new
            {
                isPublished = false,
                message = "Hội sở hiện chưa có kỳ công nào được khởi tạo.",
                availablePeriods = new List<object>(),
                days = new List<object>()
            });
        }

        var availablePeriods = allPeriods.Select(p => new
        {
            id = p.Id,
            month = p.Month,
            year = p.Year,
            name = $"Tháng {p.Month:00}/{p.Year}" + (p.Status == PeriodStatus.Closed ? " (Đã chốt)" : p.Status == PeriodStatus.Calculated ? " (Đã tính)" : " (Bản nháp)"),
            status = p.Status.ToString(),
            isClosed = p.Status == PeriodStatus.Closed
        }).ToList();

        // 2. Xác định kỳ công mục tiêu
        Period? targetPeriod = null;
        if (periodId > 0)
        {
            targetPeriod = allPeriods.FirstOrDefault(p => p.Id == periodId);
            if (targetPeriod == null)
            {
                // Kiểm tra xem periodId có phải là publicationId không
                var pubPeriodId = await _db.TimesheetPublications
                    .Where(p => p.PublicationId == periodId)
                    .Select(p => p.PeriodId)
                    .FirstOrDefaultAsync(ct);
                if (pubPeriodId > 0)
                {
                    targetPeriod = allPeriods.FirstOrDefault(p => p.Id == pubPeriodId);
                }
            }
        }

        // Nếu chưa chọn hoặc không tìm thấy, ưu tiên kỳ Đã chốt mới nhất, sau đó đến Đã tính, sau cùng là kỳ đầu tiên
        targetPeriod ??= allPeriods.FirstOrDefault(p => p.Status == PeriodStatus.Closed)
                       ?? allPeriods.FirstOrDefault(p => p.Status == PeriodStatus.Calculated)
                       ?? allPeriods.First();

        // 3. Kiểm tra bản công bố chính thức (nếu có)
        var pub = await _db.TimesheetPublications
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.PeriodId == targetPeriod.Id && p.IsCurrent && p.RetractedAtUtc == null, ct);

        // 4. Lấy toàn bộ kết quả chấm công theo ngày (DayResults)
        var dayResults = await _db.DayResults
            .AsNoTracking()
            .Where(r => r.PeriodId == targetPeriod.Id && r.EmployeeId == emp.Id)
            .OrderBy(r => r.Date)
            .ToListAsync(ct);

        // 5. Lấy danh sách mã chấm công của hội sở
        var codes = await _db.AttendanceCodes
            .AsNoTracking()
            .Where(c => c.CompanyId == emp.CompanyId)
            .ToDictionaryAsync(c => c.Code, c => c, ct);

        // 6. Tính toán quỹ phép năm còn lại của nhân viên cho năm và tháng của kỳ công
        int targetYear = targetPeriod.Year;
        var balance = await _leaveService.GetEmployeeLeaveBalanceAsync(emp.Id, targetYear, targetPeriod.Month, ct);
        decimal leaveAvailable = balance.AvailableBalance;

        // 7. Xây dựng danh sách chi tiết từng ngày và tổng hợp số liệu
        decimal workDays = 0m;
        decimal holidayDays = 0m;
        decimal annualLeaveDays = 0m;
        decimal paidLeaveDays = 0m;
        decimal unpaidLeaveDays = 0m;
        int lateArrivalCount = 0;
        int earlyDepartureCount = 0;
        int totalLateMinutes = 0;
        int totalEarlyMinutes = 0;
        int lateEarlyDaysCount = 0;

        var dayItems = dayResults.Select(r =>
        {
            var rawCode = string.IsNullOrEmpty(r.Code) ? (r.AutoCode ?? "-") : r.Code;
            codes.TryGetValue(rawCode, out var ac);

            string dayOfWeekVi = r.Date.DayOfWeek switch
            {
                DayOfWeek.Monday => "Thứ Hai",
                DayOfWeek.Tuesday => "Thứ Ba",
                DayOfWeek.Wednesday => "Thứ Tư",
                DayOfWeek.Thursday => "Thứ Năm",
                DayOfWeek.Friday => "Thứ Sáu",
                DayOfWeek.Saturday => "Thứ Bảy",
                DayOfWeek.Sunday => "Chủ Nhật",
                _ => ""
            };

            bool isLate = r.LateMinutes > 0;
            bool isEarly = r.EarlyMinutes > 0;
            if (isLate || isEarly)
            {
                lateEarlyDaysCount++;
            }
            if (isLate)
            {
                lateArrivalCount++;
                totalLateMinutes += r.LateMinutes;
            }
            if (isEarly)
            {
                earlyDepartureCount++;
                totalEarlyMinutes += r.EarlyMinutes;
            }

            // Phân loại ngày phép
            bool isAnnualLeave = rawCode == "P" || rawCode == "P/2" || rawCode == "P/2K" || (ac != null && ac.AnnualLeaveValue > 0);
            bool isPaidLeave = (ac != null && ac.PaidLeaveValue > 0) || rawCode == "B" || rawCode == "CD" || rawCode == "Ro" || rawCode == "K";
            bool isUnpaidLeave = rawCode == "KP" || rawCode == "V" || rawCode == "N" || (ac != null && ac.FundType == 0 && ac.WorkValue == 0 && ac.HolidayValue == 0 && ac.PaidLeaveValue == 0 && rawCode != "OFF" && rawCode != "L" && rawCode != "?");
            bool isHoliday = rawCode == "L" || (ac != null && ac.HolidayValue > 0);
            bool isWeekendOff = rawCode == "OFF" || (!r.OutOfEmployment && r.Date.DayOfWeek == DayOfWeek.Sunday && rawCode == "-");

            // Cộng dồn thống kê kỳ công (bỏ qua ngày ngoài thời gian làm việc)
            if (!r.OutOfEmployment)
            {
                if (ac != null)
                {
                    workDays += ac.WorkValue;
                    holidayDays += ac.HolidayValue;
                    annualLeaveDays += ac.AnnualLeaveValue;
                    paidLeaveDays += ac.PaidLeaveValue;
                    if (ac.FundType == 0 && ac.WorkValue == 0 && ac.HolidayValue == 0 && ac.PaidLeaveValue == 0 && rawCode != "OFF" && rawCode != "?")
                    {
                        unpaidLeaveDays += 1m;
                    }
                }
                else
                {
                    if (rawCode == "1") workDays += 1m;
                    else if (rawCode == "0.5" || rawCode == "1/2") workDays += 0.5m;
                    else if (rawCode == "P") annualLeaveDays += 1m;
                    else if (rawCode == "P/2" || rawCode == "1/2P" || rawCode == "P/2K") { annualLeaveDays += 0.5m; workDays += 0.5m; }
                    else if (rawCode == "KP" || rawCode == "V" || rawCode == "N") unpaidLeaveDays += 1m;
                    else if (rawCode == "L") holidayDays += 1m;
                    else if (rawCode == "CD" || rawCode == "B" || rawCode == "Ro" || rawCode == "K") paidLeaveDays += 1m;
                    else if (r.PaidValue > 0) workDays += r.PaidValue;
                }
            }

            string leaveCategory = isAnnualLeave ? "ANNUAL_LEAVE"
                                 : isPaidLeave ? "PAID_LEAVE"
                                 : isUnpaidLeave ? "UNPAID_LEAVE"
                                 : isHoliday ? "HOLIDAY"
                                 : isWeekendOff ? "WEEKEND_OFF"
                                 : "WORK";

            string categoryLabel = r.OutOfEmployment ? "Ngoài kỳ làm việc"
                                 : isAnnualLeave ? (rawCode == "P/2" || rawCode == "P/2K" ? "Nửa ngày phép" : "Phép năm")
                                 : isPaidLeave ? (ac?.Name ?? "Nghỉ hưởng lương")
                                 : isUnpaidLeave ? "Không phép"
                                 : isHoliday ? "Nghỉ lễ"
                                 : isWeekendOff ? "Nghỉ tuần"
                                 : rawCode == "?" ? "Thiếu quẹt (?)"
                                 : isLate ? $"Đi trễ ({r.LateMinutes}p)"
                                 : isEarly ? $"Về sớm ({r.EarlyMinutes}p)"
                                 : (ac?.Name ?? "Đi làm đủ");

            return new
            {
                date = r.Date.ToString("yyyy-MM-dd"),
                dateDisplay = r.Date.ToString("dd/MM/yyyy"),
                day = r.Date.Day,
                dayOfWeek = dayOfWeekVi,
                code = rawCode,
                codeName = ac?.Name ?? rawCode,
                color = ac?.Color ?? (isLate ? "#DC2626" : isAnnualLeave ? "#D97706" : isUnpaidLeave ? "#991B1B" : "#16A34A"),
                inTime = r.InTime ?? (r.InMin.HasValue ? $"{r.InMin / 60:D2}:{r.InMin % 60:D2}" : null),
                outTime = r.OutTime ?? (r.OutMin.HasValue ? $"{r.OutMin / 60:D2}:{r.OutMin % 60:D2}" : null),
                workedMinutes = r.WorkedMinutes ?? 0,
                lateMinutes = (int)r.LateMinutes,
                earlyMinutes = (int)r.EarlyMinutes,
                isLate,
                isEarly,
                isLeave = isAnnualLeave || isPaidLeave || isUnpaidLeave,
                leaveCategory,
                categoryLabel,
                paidValue = r.PaidValue,
                isManual = r.IsManual,
                manualReason = r.ManualReason,
                isOutOfEmployment = r.OutOfEmployment
            };
        }).ToList();

        decimal totalPaidDays = workDays + holidayDays + annualLeaveDays + paidLeaveDays;
        decimal totalLeaveDays = annualLeaveDays + paidLeaveDays;
        int totalLateEarlyOccurrences = lateArrivalCount + earlyDepartureCount;
        bool isClosedOrPublished = targetPeriod.Status == PeriodStatus.Closed || pub != null;

        string? departmentName = null;
        if (emp.DepartmentId.HasValue)
        {
            var dept = await _db.Departments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == emp.DepartmentId.Value, ct);
            departmentName = dept?.Name;
        }

        return Ok(new
        {
            isPublished = isClosedOrPublished,
            isClosed = targetPeriod.Status == PeriodStatus.Closed,
            publicationId = pub?.PublicationId,
            versionNo = pub?.VersionNo ?? 1,
            publishedAt = pub?.PublishedAtUtc ?? targetPeriod.ClosedAt,
            period = new
            {
                id = targetPeriod.Id,
                month = targetPeriod.Month,
                year = targetPeriod.Year,
                fromDate = targetPeriod.FromDate.ToString("dd/MM/yyyy"),
                toDate = targetPeriod.ToDate.ToString("dd/MM/yyyy"),
                standardDays = targetPeriod.StandardDays,
                status = targetPeriod.Status.ToString(),
                closedAt = targetPeriod.ClosedAt?.ToString("dd/MM/yyyy HH:mm"),
                closedBy = targetPeriod.ClosedBy
            },
            availablePeriods,
            employee = new
            {
                emp.Id,
                emp.EmployeeCode,
                emp.FullName,
                departmentName,
                startDate = emp.StartDate.ToString("dd/MM/yyyy")
            },
            leaveBalance = new
            {
                year = targetYear,
                month = targetPeriod.Month,
                annualOpening = balance.AnnualOpening,
                carryOpening = balance.CarryOpening,
                compOpening = balance.CompOpening,
                opening = balance.AnnualOpening + balance.CarryOpening,
                accrued = balance.Accrued,
                totalOpening = balance.TotalAnnualEarned,
                totalEarned = balance.TotalAnnualEarned,
                monthUsed = balance.MonthUsed > 0 ? balance.MonthUsed : annualLeaveDays,
                monthAnnualUsed = balance.MonthAnnualUsed,
                used = balance.TotalUsed > 0 ? balance.TotalUsed : annualLeaveDays,
                held = balance.PendingDays,
                available = (balance.MonthUsed == 0 && annualLeaveDays > 0) ? Math.Max(0, balance.AvailableBalance - annualLeaveDays) : balance.AvailableBalance,
                isExhausted = balance.IsExhausted
            },
            summary = new
            {
                workDays,
                holidayDays,
                annualLeaveDays,
                paidLeaveDays,
                unpaidLeaveDays,
                totalLeaveDays,
                paidDays = totalPaidDays,
                lateArrivalCount,
                earlyDepartureCount,
                lateEarlyDaysCount,
                totalLateEarlyOccurrences,
                totalLateMinutes,
                totalEarlyMinutes
            },
            days = dayItems
        });
    }

    /// <summary>Nhân viên gửi khiếu nại bảng công (trong vòng DISPUTE_WINDOW_DAYS ngày).</summary>
    [HttpPost("disputes")]
    public async Task<IActionResult> SubmitDispute([FromBody] DisputeDto dto, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode)) return Unauthorized();

        DateTime? workDate = DateTime.TryParse(dto.WorkDate, out var wd) ? wd.Date : null;
        var dispute = await _publicationService.SubmitDisputeAsync(dto.PublicationId, user.EmployeeCode, workDate, dto.Content, ct);

        _audit.Log("Dispute", dispute.DisputeId, "SubmitDispute", dto.Content);
        return Ok(new { dispute.DisputeId, message = "Đã gửi khiếu nại thành công. HCNS sẽ phản hồi sớm." });
    }
}

[ApiController]
[Authorize]
[Route("api/v1/hr/timesheet")]
[Route("api/hr/timesheet")]
public class HrTimesheetController : ControllerBase
{
    private readonly ITimesheetPublicationService _publicationService;
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;
    private readonly ILeaveService _leaveService;

    public HrTimesheetController(
        ITimesheetPublicationService publicationService,
        AppDbContext db,
        AccessService access,
        AuditService audit,
        ILeaveService leaveService)
    {
        _publicationService = publicationService;
        _db = db;
        _access = access;
        _audit = audit;
        _leaveService = leaveService;
    }

    public record PublishDto(int PeriodId, string BranchCode, string? Note);
    public record RetractDto(int PublicationId, string? Note);
    public record ResolveDisputeDto(string Action, string Response); // Action = ACCEPT | REJECT

    /// <summary>HCNS công bố bảng công có phiên bản, tạo snapshot bất biến.</summary>
    [HttpPost("publish")]
    public async Task<IActionResult> Publish([FromBody] PublishDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        await _access.EnsureBranchAsync(dto.BranchCode, ct);

        var pub = await _publicationService.PublishTimesheetAsync(dto.PeriodId, dto.BranchCode, dto.Note, User.UserId(), ct);
        _audit.Log("TimesheetPublication", pub.PublicationId, "PublishTimesheet", $"Công bố kỳ {dto.PeriodId} hội sở {dto.BranchCode} v{pub.VersionNo}");

        return Ok(new
        {
            pub.PublicationId,
            pub.VersionNo,
            pub.PublishedAtUtc,
            message = $"Đã công bố bảng chấm công thành công (Phiên bản {pub.VersionNo})."
        });
    }

    /// <summary>HCNS thu hồi công bố khi phát hiện sai sót.</summary>
    [HttpPost("retract")]
    public async Task<IActionResult> Retract([FromBody] RetractDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var pub = await _db.TimesheetPublications.AsNoTracking().FirstOrDefaultAsync(p => p.PublicationId == dto.PublicationId, ct);
        if (pub == null) return NotFound(new { message = "Không tìm thấy bản công bố." });
        await _access.EnsureBranchAsync(pub.BranchCode, ct);

        await _publicationService.RetractTimesheetAsync(dto.PublicationId, dto.Note, User.UserId(), ct);
        _audit.Log("TimesheetPublication", dto.PublicationId, "RetractTimesheet", dto.Note);

        return Ok(new { message = "Đã thu hồi bản công bố bảng công thành công." });
    }

    /// <summary>HCNS xem danh sách khiếu nại bảng công.</summary>
    [HttpGet("disputes")]
    public async Task<IActionResult> GetDisputes([FromQuery] int? publicationId, [FromQuery] string? status, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var allowedBranches = await _access.AllowedBranchCodesAsync(ct);
        var q = _db.TimesheetDisputes.AsNoTracking();

        if (allowedBranches != null)
        {
            q = from d in q
                join p in _db.TimesheetPublications.AsNoTracking() on d.PublicationId equals p.PublicationId
                where allowedBranches.Contains(p.BranchCode)
                select d;
        }

        if (publicationId.HasValue) q = q.Where(d => d.PublicationId == publicationId.Value);
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(d => d.Status == status);

        var list = await q.OrderByDescending(d => d.CreatedAtUtc).Take(100).ToListAsync(ct);
        return Ok(list);
    }

    /// <summary>HCNS giải quyết khiếu nại (Chấp nhận / Từ chối kèm phản hồi).</summary>
    [HttpPost("disputes/{id}/resolve")]
    public async Task<IActionResult> ResolveDispute(int id, [FromBody] ResolveDisputeDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var targetDispute = await (from d in _db.TimesheetDisputes.AsNoTracking()
                                   join p in _db.TimesheetPublications.AsNoTracking() on d.PublicationId equals p.PublicationId
                                   where d.DisputeId == id
                                   select new { d, p.BranchCode }).FirstOrDefaultAsync(ct);
        if (targetDispute == null) return NotFound(new { message = "Không tìm thấy khiếu nại." });
        await _access.EnsureBranchAsync(targetDispute.BranchCode, ct);

        bool accept = dto.Action?.Equals("ACCEPT", StringComparison.OrdinalIgnoreCase) == true;
        var dispute = await _publicationService.ResolveDisputeAsync(id, accept, dto.Response, User.UserId(), ct);

        _audit.Log("Dispute", dispute.DisputeId, accept ? "AcceptDispute" : "RejectDispute", dto.Response);
        return Ok(new { message = "Đã xử lý khiếu nại thành công." });
    }

    /// <summary>
    /// HCNS / Quản lý xem bảng chấm công chi tiết của từng nhân viên theo kỳ công.
    /// Bao gồm danh sách nhân viên để chọn/chuyển nhanh, thông tin thâm niên, quỹ phép năm,
    /// thẻ tổng hợp chuyên cần, và bảng lịch công chi tiết từng ngày.
    /// </summary>
    [HttpGet("employee")]
    public async Task<IActionResult> GetEmployeeTimesheet(
        [FromQuery] int? employeeId,
        [FromQuery] string? employeeCode,
        [FromQuery] int? periodId,
        [FromQuery] int? companyId,
        CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS/Quản lý để xem bảng công nhân viên." });

        var allowedCompanies = await _access.AllowedCompanyIdsAsync(ct);
        if (companyId.HasValue)
        {
            await _access.EnsureCompanyAsync(companyId.Value, ct);
        }

        // 1. Lọc danh sách nhân viên hội sở
        var empQuery = _db.Employees.AsNoTracking();
        if (companyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == companyId.Value);
        }
        else if (allowedCompanies != null)
        {
            empQuery = empQuery.Where(e => allowedCompanies.Contains(e.CompanyId));
        }

        var rawEmps = await empQuery
            .OrderBy(e => e.SortOrder)
            .ThenBy(e => e.EmployeeCode)
            .Select(e => new
            {
                e.Id,
                e.EmployeeCode,
                e.FullName,
                e.DepartmentId,
                e.CompanyId,
                e.StartDate,
                e.EndDate
            })
            .ToListAsync(ct);

        if (rawEmps.Count == 0)
        {
            return Ok(new
            {
                message = "Hội sở chưa có nhân viên nào.",
                employeesList = new List<object>(),
                availablePeriods = new List<object>(),
                days = new List<object>()
            });
        }

        // Tải tên phòng ban
        var deptIds = rawEmps.Where(e => e.DepartmentId.HasValue).Select(e => e.DepartmentId!.Value).Distinct().ToList();
        var departments = await _db.Departments.AsNoTracking()
            .Where(d => deptIds.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, d => d.Name, ct);

        var employeesList = rawEmps.Select(e => new
        {
            id = e.Id,
            employeeCode = e.EmployeeCode,
            fullName = e.FullName,
            departmentId = e.DepartmentId,
            departmentName = e.DepartmentId.HasValue && departments.TryGetValue(e.DepartmentId.Value, out var dn) ? dn : "",
            companyId = e.CompanyId,
            startDate = e.StartDate.ToString("dd/MM/yyyy")
        }).ToList();

        // 2. Xác định nhân viên mục tiêu
        var targetEmp = (employeeId.HasValue ? rawEmps.FirstOrDefault(e => e.Id == employeeId.Value) : null)
                     ?? (!string.IsNullOrWhiteSpace(employeeCode) ? rawEmps.FirstOrDefault(e => e.EmployeeCode == employeeCode) : null)
                     ?? rawEmps.FirstOrDefault();

        if (targetEmp == null)
        {
            return NotFound(new { message = "Không tìm thấy hồ sơ nhân viên chỉ định." });
        }

        // 3. Tải danh sách kỳ công của hội sở nhân viên
        var allPeriods = await _db.Periods.AsNoTracking()
            .Where(p => p.CompanyId == targetEmp.CompanyId)
            .OrderByDescending(p => p.Year)
            .ThenByDescending(p => p.Month)
            .ToListAsync(ct);

        if (allPeriods.Count == 0)
        {
            return Ok(new
            {
                message = "Hội sở chưa có kỳ công nào được khởi tạo.",
                employee = new
                {
                    targetEmp.Id,
                    targetEmp.EmployeeCode,
                    targetEmp.FullName,
                    departmentName = targetEmp.DepartmentId.HasValue && departments.TryGetValue(targetEmp.DepartmentId.Value, out var dname) ? dname : "",
                    startDate = targetEmp.StartDate.ToString("dd/MM/yyyy")
                },
                employeesList,
                availablePeriods = new List<object>(),
                days = new List<object>()
            });
        }

        var availablePeriods = allPeriods.Select(p => new
        {
            id = p.Id,
            month = p.Month,
            year = p.Year,
            name = $"Tháng {p.Month:00}/{p.Year}" + (p.Status == PeriodStatus.Closed ? " (Đã chốt)" : p.Status == PeriodStatus.Calculated ? " (Đã tính)" : " (Bản nháp)"),
            status = p.Status.ToString(),
            isClosed = p.Status == PeriodStatus.Closed
        }).ToList();

        // 4. Xác định kỳ công mục tiêu
        Period? targetPeriod = null;
        if (periodId.HasValue && periodId.Value > 0)
        {
            targetPeriod = allPeriods.FirstOrDefault(p => p.Id == periodId.Value);
        }
        targetPeriod ??= allPeriods.FirstOrDefault(p => p.Status == PeriodStatus.Closed)
                       ?? allPeriods.FirstOrDefault(p => p.Status == PeriodStatus.Calculated)
                       ?? allPeriods.First();

        // 5. Kiểm tra bản công bố chính thức (nếu có)
        var pub = await _db.TimesheetPublications
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.PeriodId == targetPeriod.Id && p.IsCurrent && p.RetractedAtUtc == null, ct);

        // 6. Tính thâm niên và Quỹ phép năm
        int targetYear = targetPeriod.Year;
        int tenureYears = 0;
        if (targetEmp.StartDate != default)
        {
            var endOfPeriod = targetPeriod.ToDate;
            tenureYears = endOfPeriod.Year - targetEmp.StartDate.Year;
            if (targetEmp.StartDate > endOfPeriod.AddYears(-tenureYears)) tenureYears--;
            if (tenureYears < 0) tenureYears = 0;
        }
        var balance = await _leaveService.GetEmployeeLeaveBalanceAsync(targetEmp.Id, targetYear, targetPeriod.Month, ct);
        decimal leaveAvailable = balance.AvailableBalance;

        // 7. Lấy DayResults, AttendanceCodes, và Disputes
        var dayResults = await _db.DayResults
            .AsNoTracking()
            .Where(r => r.PeriodId == targetPeriod.Id && r.EmployeeId == targetEmp.Id)
            .OrderBy(r => r.Date)
            .ToListAsync(ct);

        var codes = await _db.AttendanceCodes
            .AsNoTracking()
            .Where(c => c.CompanyId == targetEmp.CompanyId)
            .ToDictionaryAsync(c => c.Code, c => c, ct);

        var disputes = await _db.TimesheetDisputes
            .AsNoTracking()
            .Where(d => d.EmployeeCode == targetEmp.EmployeeCode && (pub == null || d.PublicationId == pub.PublicationId))
            .ToListAsync(ct);

        // 8. Tổng hợp số liệu và chi tiết từng ngày
        decimal workDays = 0m;
        decimal holidayDays = 0m;
        decimal annualLeaveDays = 0m;
        decimal paidLeaveDays = 0m;
        decimal unpaidLeaveDays = 0m;
        int lateArrivalCount = 0;
        int earlyDepartureCount = 0;
        int totalLateMinutes = 0;
        int totalEarlyMinutes = 0;
        int lateEarlyDaysCount = 0;

        var dayItems = dayResults.Select(r =>
        {
            var rawCode = string.IsNullOrEmpty(r.Code) ? (r.AutoCode ?? "-") : r.Code;
            codes.TryGetValue(rawCode, out var ac);

            string dayOfWeekVi = r.Date.DayOfWeek switch
            {
                DayOfWeek.Monday => "Thứ Hai",
                DayOfWeek.Tuesday => "Thứ Ba",
                DayOfWeek.Wednesday => "Thứ Tư",
                DayOfWeek.Thursday => "Thứ Năm",
                DayOfWeek.Friday => "Thứ Sáu",
                DayOfWeek.Saturday => "Thứ Bảy",
                DayOfWeek.Sunday => "Chủ Nhật",
                _ => ""
            };

            bool isLate = r.LateMinutes > 0;
            bool isEarly = r.EarlyMinutes > 0;
            if (isLate || isEarly)
            {
                lateEarlyDaysCount++;
            }
            if (isLate)
            {
                lateArrivalCount++;
                totalLateMinutes += r.LateMinutes;
            }
            if (isEarly)
            {
                earlyDepartureCount++;
                totalEarlyMinutes += r.EarlyMinutes;
            }

            bool isAnnualLeave = rawCode == "P" || rawCode == "P/2" || rawCode == "P/2K" || (ac != null && ac.AnnualLeaveValue > 0);
            bool isPaidLeave = (ac != null && ac.PaidLeaveValue > 0) || rawCode == "B" || rawCode == "CD" || rawCode == "Ro" || rawCode == "K";
            bool isUnpaidLeave = rawCode == "KP" || rawCode == "V" || rawCode == "N" || (ac != null && ac.FundType == 0 && ac.WorkValue == 0 && ac.HolidayValue == 0 && ac.PaidLeaveValue == 0 && rawCode != "OFF" && rawCode != "L" && rawCode != "?");
            bool isHoliday = rawCode == "L" || (ac != null && ac.HolidayValue > 0);
            bool isWeekendOff = rawCode == "OFF" || (!r.OutOfEmployment && r.Date.DayOfWeek == DayOfWeek.Sunday && rawCode == "-");

            if (!r.OutOfEmployment)
            {
                if (ac != null)
                {
                    workDays += ac.WorkValue;
                    holidayDays += ac.HolidayValue;
                    annualLeaveDays += ac.AnnualLeaveValue;
                    paidLeaveDays += ac.PaidLeaveValue;
                    if (ac.FundType == 0 && ac.WorkValue == 0 && ac.HolidayValue == 0 && ac.PaidLeaveValue == 0 && rawCode != "OFF" && rawCode != "?")
                    {
                        unpaidLeaveDays += 1m;
                    }
                }
                else
                {
                    if (rawCode == "1") workDays += 1m;
                    else if (rawCode == "0.5" || rawCode == "1/2") workDays += 0.5m;
                    else if (rawCode == "P") annualLeaveDays += 1m;
                    else if (rawCode == "P/2" || rawCode == "1/2P" || rawCode == "P/2K") { annualLeaveDays += 0.5m; workDays += 0.5m; }
                    else if (rawCode == "KP" || rawCode == "V" || rawCode == "N") unpaidLeaveDays += 1m;
                    else if (rawCode == "L") holidayDays += 1m;
                    else if (rawCode == "CD" || rawCode == "B" || rawCode == "Ro" || rawCode == "K") paidLeaveDays += 1m;
                    else if (r.PaidValue > 0) workDays += r.PaidValue;
                }
            }

            string leaveCategory = isAnnualLeave ? "ANNUAL_LEAVE"
                                 : isPaidLeave ? "PAID_LEAVE"
                                 : isUnpaidLeave ? "UNPAID_LEAVE"
                                 : isHoliday ? "HOLIDAY"
                                 : isWeekendOff ? "WEEKEND_OFF"
                                 : "WORK";

            string categoryLabel = r.OutOfEmployment ? "Ngoài kỳ làm việc"
                                 : isAnnualLeave ? (rawCode == "P/2" || rawCode == "P/2K" ? "Nửa ngày phép" : "Phép năm")
                                 : isPaidLeave ? (ac?.Name ?? "Nghỉ hưởng lương")
                                 : isUnpaidLeave ? "Không phép"
                                 : isHoliday ? "Nghỉ lễ"
                                 : isWeekendOff ? "Nghỉ tuần"
                                 : rawCode == "?" ? "Thiếu quẹt (?)"
                                 : isLate ? $"Đi trễ ({r.LateMinutes}p)"
                                 : isEarly ? $"Về sớm ({r.EarlyMinutes}p)"
                                 : (ac?.Name ?? "Đi làm đủ");

            var dayDispute = disputes.FirstOrDefault(d => d.WorkDate.HasValue && d.WorkDate.Value.Date == r.Date.Date);

            return new
            {
                date = r.Date.ToString("yyyy-MM-dd"),
                dateDisplay = r.Date.ToString("dd/MM/yyyy"),
                day = r.Date.Day,
                dayOfWeek = dayOfWeekVi,
                code = rawCode,
                codeName = ac?.Name ?? rawCode,
                color = ac?.Color ?? (isLate ? "#DC2626" : isAnnualLeave ? "#D97706" : isUnpaidLeave ? "#991B1B" : "#16A34A"),
                inTime = r.InTime ?? (r.InMin.HasValue ? $"{r.InMin / 60:D2}:{r.InMin % 60:D2}" : null),
                outTime = r.OutTime ?? (r.OutMin.HasValue ? $"{r.OutMin / 60:D2}:{r.OutMin % 60:D2}" : null),
                workedMinutes = r.WorkedMinutes ?? 0,
                lateMinutes = (int)r.LateMinutes,
                earlyMinutes = (int)r.EarlyMinutes,
                isLate,
                isEarly,
                isLeave = isAnnualLeave || isPaidLeave || isUnpaidLeave,
                leaveCategory,
                categoryLabel,
                paidValue = r.PaidValue,
                isManual = r.IsManual,
                manualReason = r.ManualReason,
                isOutOfEmployment = r.OutOfEmployment,
                hasDispute = dayDispute != null,
                disputeStatus = dayDispute?.Status,
                disputeContent = dayDispute?.Content,
                disputeResponse = dayDispute?.HRResponse
            };
        }).ToList();

        decimal totalPaidDays = workDays + holidayDays + annualLeaveDays + paidLeaveDays;
        decimal totalLeaveDays = annualLeaveDays + paidLeaveDays;
        int totalLateEarlyOccurrences = lateArrivalCount + earlyDepartureCount;
        bool isClosedOrPublished = targetPeriod.Status == PeriodStatus.Closed || pub != null;

        return Ok(new
        {
            isPublished = isClosedOrPublished,
            isClosed = targetPeriod.Status == PeriodStatus.Closed,
            publicationId = pub?.PublicationId,
            versionNo = pub?.VersionNo ?? 1,
            publishedAt = pub?.PublishedAtUtc ?? targetPeriod.ClosedAt,
            period = new
            {
                id = targetPeriod.Id,
                month = targetPeriod.Month,
                year = targetPeriod.Year,
                fromDate = targetPeriod.FromDate.ToString("dd/MM/yyyy"),
                toDate = targetPeriod.ToDate.ToString("dd/MM/yyyy"),
                standardDays = targetPeriod.StandardDays,
                status = targetPeriod.Status.ToString(),
                closedAt = targetPeriod.ClosedAt?.ToString("dd/MM/yyyy HH:mm"),
                closedBy = targetPeriod.ClosedBy
            },
            availablePeriods,
            employee = new
            {
                targetEmp.Id,
                targetEmp.EmployeeCode,
                targetEmp.FullName,
                departmentName = targetEmp.DepartmentId.HasValue && departments.TryGetValue(targetEmp.DepartmentId.Value, out var dname2) ? dname2 : "",
                startDate = targetEmp.StartDate.ToString("dd/MM/yyyy"),
                tenureYears,
                tenureDisplay = $"{tenureYears} năm"
            },
            employeesList,
            leaveBalance = new
            {
                year = targetYear,
                month = targetPeriod.Month,
                annualOpening = balance.AnnualOpening,
                carryOpening = balance.CarryOpening,
                compOpening = balance.CompOpening,
                opening = balance.AnnualOpening + balance.CarryOpening,
                accrued = balance.Accrued,
                totalOpening = balance.TotalAnnualEarned,
                totalEarned = balance.TotalAnnualEarned,
                monthUsed = balance.MonthUsed > 0 ? balance.MonthUsed : annualLeaveDays,
                monthAnnualUsed = balance.MonthAnnualUsed,
                used = balance.TotalUsed > 0 ? balance.TotalUsed : annualLeaveDays,
                held = balance.PendingDays,
                available = (balance.MonthUsed == 0 && annualLeaveDays > 0) ? Math.Max(0, balance.AvailableBalance - annualLeaveDays) : balance.AvailableBalance,
                isExhausted = balance.IsExhausted
            },
            summary = new
            {
                workDays,
                holidayDays,
                annualLeaveDays,
                paidLeaveDays,
                unpaidLeaveDays,
                totalLeaveDays,
                paidDays = totalPaidDays,
                lateArrivalCount,
                earlyDepartureCount,
                lateEarlyDaysCount,
                totalLateEarlyOccurrences,
                totalLateMinutes,
                totalEarlyMinutes
            },
            days = dayItems,
            disputes = disputes.Select(d => new
            {
                d.DisputeId,
                d.WorkDate,
                d.Content,
                d.Status,
                hrResponse = d.HRResponse,
                createdAt = d.CreatedAtUtc.ToString("dd/MM/yyyy HH:mm")
            }).ToList()
        });
    }
}
