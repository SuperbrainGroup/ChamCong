using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Route("api/[controller]")]
[Authorize(Policy = "RequireHR")]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;

    public DashboardController(AppDbContext db, AccessService access)
    {
        _db = db;
        _access = access;
    }

    /// <summary>
    /// Thống kê tổng quan dữ liệu chấm công theo tháng dành cho quản lý (Admin / HR):
    /// Báo cáo nhân viên đi đúng giờ (check-in trước/đúng giờ vào ca), đi trễ, tỷ lệ chuyên cần,
    /// danh sách chi tiết các lần trễ, biểu đồ xu hướng ngày trong tháng, và tình trạng điểm danh hôm nay.
    /// </summary>
    [HttpGet("monthly-overview")]
    public async Task<IActionResult> GetMonthlyOverview(
        [FromQuery] int? companyId,
        [FromQuery] int? month,
        [FromQuery] int? year,
        CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền truy cập trang tổng quan quản lý." });

        var nowLocal = AttendancePunchService.ToVietnamTime(DateTime.UtcNow);
        int targetMonth = month ?? nowLocal.Month;
        int targetYear = year ?? nowLocal.Year;

        if (targetMonth < 1 || targetMonth > 12) targetMonth = nowLocal.Month;
        if (targetYear < 2000 || targetYear > 2100) targetYear = nowLocal.Year;

        var fromDate = new DateTime(targetYear, targetMonth, 1);
        var toDate = new DateTime(targetYear, targetMonth, DateTime.DaysInMonth(targetYear, targetMonth));
        var today = nowLocal.Date;

        // Phân quyền hội sở
        var allowedCompanies = await _access.AllowedCompanyIdsAsync(ct);
        if (companyId.HasValue)
        {
            await _access.EnsureCompanyAsync(companyId.Value, ct);
        }

        // Lấy giờ bắt đầu ca chuẩn từ tham số
        var paramVal = await _db.ParameterValues.AsNoTracking()
            .Where(p => p.Code == "SHIFT_STANDARD_HOURS" && (companyId == null || p.CompanyId == null || p.CompanyId == companyId.Value))
            .OrderByDescending(p => p.CompanyId.HasValue)
            .Select(p => p.Value)
            .FirstOrDefaultAsync(ct);

        var shiftHours = string.IsNullOrWhiteSpace(paramVal) ? "08:00-17:00" : paramVal.Trim();
        var shiftParts = shiftHours.Split('-');
        var startStr = shiftParts.Length > 0 ? shiftParts[0].Trim() : "08:00";
        if (!TimeSpan.TryParse(startStr, out var standardStartTime))
        {
            standardStartTime = new TimeSpan(8, 0, 0);
            startStr = "08:00";
        }

        // Lấy giờ nghỉ trưa (mặc định 12:00 - 13:00)
        var lunchStartVal = await _db.ParameterValues.AsNoTracking()
            .Where(p => p.Code == "LUNCH_BREAK_START" && (companyId == null || p.CompanyId == null || p.CompanyId == companyId.Value))
            .OrderByDescending(p => p.CompanyId.HasValue)
            .Select(p => p.Value)
            .FirstOrDefaultAsync(ct);
        if (!TimeSpan.TryParse(lunchStartVal, out var lunchStartTime))
        {
            lunchStartTime = new TimeSpan(12, 0, 0);
        }

        var lunchMinVal = await _db.ParameterValues.AsNoTracking()
            .Where(p => p.Code == "LUNCH_BREAK_MINUTES" && (companyId == null || p.CompanyId == null || p.CompanyId == companyId.Value))
            .OrderByDescending(p => p.CompanyId.HasValue)
            .Select(p => p.Value)
            .FirstOrDefaultAsync(ct);
        int lunchMins = int.TryParse(lunchMinVal, out var lm) ? lm : 60;
        var lunchEndTime = lunchStartTime.Add(TimeSpan.FromMinutes(lunchMins));

        // 1. Danh sách nhân viên
        var empQuery = _db.Employees.AsNoTracking();
        if (companyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == companyId.Value);
        }
        else if (allowedCompanies != null)
        {
            empQuery = empQuery.Where(e => allowedCompanies.Contains(e.CompanyId));
        }

        // Nhân viên đang làm việc trong tháng đó
        empQuery = empQuery.Where(e => e.StartDate <= toDate && (e.EndDate == null || e.EndDate >= fromDate));
        var employees = await empQuery.OrderBy(e => e.SortOrder).ThenBy(e => e.FullName).ToListAsync(ct);
        var empIds = employees.Select(e => e.Id).ToList();
        var empCodes = employees.Select(e => e.EmployeeCode).ToList();

        var departments = await _db.Departments.AsNoTracking().ToDictionaryAsync(d => d.Id, d => d.Name, ct);

        // 2. Lấy DailyPunchSummaries trong tháng
        var punchQuery = _db.DailyPunchSummaries.AsNoTracking()
            .Where(p => empCodes.Contains(p.EmployeeCode) && p.WorkDate >= fromDate && p.WorkDate <= toDate);
        if (companyId.HasValue)
        {
            punchQuery = punchQuery.Where(p => p.CompanyId == companyId.Value);
        }
        var punchSummaries = await punchQuery.ToListAsync(ct);

        // 3. Lấy DayResults trong tháng (đối với kỳ công đã import / tính)
        var dayResults = await _db.DayResults.AsNoTracking()
            .Where(r => empIds.Contains(r.EmployeeId) && r.Date >= fromDate && r.Date <= toDate)
            .ToListAsync(ct);

        // 4. Lấy WebAttendanceLogs trong tháng
        var webLogs = await _db.WebAttendanceLogs.AsNoTracking()
            .Where(l => empCodes.Contains(l.EmployeeCode) && l.WorkDate >= fromDate && l.WorkDate <= toDate)
            .OrderBy(l => l.CheckTimeUtc)
            .ToListAsync(ct);

        // 5. Lấy đơn nghỉ phép trong tháng
        var leaveRequests = await _db.LeaveRequests.AsNoTracking()
            .Where(r => empIds.Contains(r.EmployeeId) && r.Date >= fromDate && r.Date <= toDate)
            .ToListAsync(ct);

        var employeeRequests = await _db.EmployeeRequests.AsNoTracking()
            .Where(r => empCodes.Contains(r.EmployeeCode) && r.FromDate <= toDate && r.ToDate >= fromDate)
            .ToListAsync(ct);

        // Map hợp nhất chấm công theo (EmployeeCode, WorkDate)
        // Key: $"{empCode}_{date:yyyy-MM-dd}"
        var dailyPunchesMap = new Dictionary<string, (TimeSpan InTime, string Source)>();

        // Điền từ WebAttendanceLogs trước (lấy giờ vào sớm nhất)
        foreach (var log in webLogs)
        {
            var key = $"{log.EmployeeCode}_{log.WorkDate:yyyy-MM-dd}";
            var localTime = AttendancePunchService.ToVietnamTime(log.CheckTimeUtc).TimeOfDay;
            if (!dailyPunchesMap.TryGetValue(key, out var existing) || localTime < existing.InTime)
            {
                dailyPunchesMap[key] = (localTime, "WEB");
            }
        }

        // Điền đè từ DayResults (nếu có)
        foreach (var dr in dayResults)
        {
            var emp = employees.FirstOrDefault(e => e.Id == dr.EmployeeId);
            if (emp == null) continue;
            var key = $"{emp.EmployeeCode}_{dr.Date:yyyy-MM-dd}";

            if (!string.IsNullOrWhiteSpace(dr.InTime) && TimeSpan.TryParse(dr.InTime, out var ts))
            {
                dailyPunchesMap[key] = (ts, "CALCULATED");
            }
        }

        // Điền đè từ DailyPunchSummaries (nguồn tổng hợp chính xác nhất)
        foreach (var ps in punchSummaries)
        {
            if (ps.InTime.HasValue)
            {
                var key = $"{ps.EmployeeCode}_{ps.WorkDate:yyyy-MM-dd}";
                dailyPunchesMap[key] = (ps.InTime.Value, ps.Source);
            }
        }

        // Map đơn nghỉ phép đã duyệt
        // Key: $"{empCode}_{date:yyyy-MM-dd}"
        var leaveDates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var lr in leaveRequests)
        {
            var emp = employees.FirstOrDefault(e => e.Id == lr.EmployeeId);
            if (emp != null)
            {
                leaveDates.Add($"{emp.EmployeeCode}_{lr.Date:yyyy-MM-dd}");
            }
        }
        foreach (var er in employeeRequests.Where(r => r.RequestType == "LEAVE" && r.Status == "APPROVED"))
        {
            for (var d = er.FromDate.Date; d <= er.ToDate.Date; d = d.AddDays(1))
            {
                leaveDates.Add($"{er.EmployeeCode}_{d:yyyy-MM-dd}");
            }
        }

        // Map đơn giải trình (để biết lần trễ nào đã có giải trình)
        var regularizationMap = employeeRequests
            .Where(r => r.RequestType == "REGULARIZATION")
            .ToLookup(r => $"{r.EmployeeCode}_{r.FromDate:yyyy-MM-dd}");

        // --- TÍNH TOÁN THỐNG KÊ CHI TIẾT ---
        int totalOnTimePunches = 0;
        int totalLatePunches = 0;
        int totalLateMinutes = 0;
        var lateDetailsList = new List<object>();

        // Thống kê theo từng nhân viên
        var employeeStatsList = new List<object>();

        foreach (var emp in employees)
        {
            int empOnTime = 0;
            int empLate = 0;
            int empLateMinutes = 0;
            int empLeaveDays = 0;

            // Duyệt từng ngày trong tháng
            for (var d = fromDate; d <= toDate; d = d.AddDays(1))
            {
                // Kiểm tra trong thời gian làm việc của nhân viên
                if (d < emp.StartDate.Date) continue;
                if (emp.EndDate.HasValue && d > emp.EndDate.Value.Date) continue;

                var key = $"{emp.EmployeeCode}_{d:yyyy-MM-dd}";

                if (dailyPunchesMap.TryGetValue(key, out var punch))
                {
                    var inTime = punch.InTime;
                    // QUY TẮC CỦA NGƯỜI DÙNG:
                    // - Đúng giờ ca sáng: inTime <= standardStartTime
                    // - Đúng giờ ca chiều (đến sớm trong giờ nghỉ trưa trước ca chiều): inTime >= lunchStartTime && inTime <= lunchEndTime
                    //   -> Ví dụ check-in 12:30 là đi sớm ca chiều (13h) nên không tính đi trễ!
                    bool isOnTime = inTime <= standardStartTime || (inTime >= lunchStartTime && inTime <= lunchEndTime);

                    if (isOnTime)
                    {
                        empOnTime++;
                        totalOnTimePunches++;
                    }
                    else
                    {
                        empLate++;
                        totalLatePunches++;
                        var effectiveStart = inTime > lunchEndTime ? lunchEndTime : standardStartTime;
                        int mins = (int)Math.Ceiling((inTime - effectiveStart).TotalMinutes);
                        empLateMinutes += mins;
                        totalLateMinutes += mins;

                        var hasReg = regularizationMap[key].FirstOrDefault();

                        lateDetailsList.Add(new
                        {
                            employeeCode = emp.EmployeeCode,
                            fullName = emp.FullName,
                            department = emp.DepartmentId.HasValue && departments.TryGetValue(emp.DepartmentId.Value, out var dname) ? dname : "Chưa phân bộ phận",
                            workDate = d.ToString("yyyy-MM-dd"),
                            workDateFormatted = d.ToString("dd/MM/yyyy"),
                            dayOfWeek = GetDayOfWeekName(d.DayOfWeek),
                            inTime = $"{inTime.Hours:D2}:{inTime.Minutes:D2}",
                            standardTime = inTime > lunchEndTime ? $"{lunchEndTime.Hours:D2}:{lunchEndTime.Minutes:D2}" : startStr,
                            lateMinutes = mins,
                            hasExplanation = hasReg != null,
                            explanationStatus = hasReg?.Status,
                            explanationReason = hasReg?.Reason
                        });
                    }
                }
                else if (leaveDates.Contains(key))
                {
                    empLeaveDays++;
                }
            }

            int presentDays = empOnTime + empLate;
            double punctualityRate = presentDays > 0 ? Math.Round((double)empOnTime * 100.0 / presentDays, 1) : 100.0;

            string statusTag = "Chưa phát sinh";
            if (presentDays > 0)
            {
                if (empLate == 0) statusTag = "Xuất sắc (100% đúng giờ)";
                else if (empLate <= 1) statusTag = "Tốt";
                else if (empLate <= 3) statusTag = "Cần lưu ý";
                else statusTag = "Thường xuyên đi trễ";
            }

            employeeStatsList.Add(new
            {
                employeeId = emp.Id,
                employeeCode = emp.EmployeeCode,
                fullName = emp.FullName,
                department = emp.DepartmentId.HasValue && departments.TryGetValue(emp.DepartmentId.Value, out var dname2) ? dname2 : "Chưa phân bộ phận",
                onTimeCount = empOnTime,
                lateCount = empLate,
                totalLateMinutes = empLateMinutes,
                leaveDays = empLeaveDays,
                presentDays = presentDays,
                punctualityRate = punctualityRate,
                statusTag = statusTag
            });
        }

        // Thống kê theo ngày trong tháng (Daily Trend Chart)
        var dailyTrend = new List<object>();
        var lastDateToTrend = (targetYear == nowLocal.Year && targetMonth == nowLocal.Month) ? today : toDate;
        if (lastDateToTrend > toDate) lastDateToTrend = toDate;

        for (var d = fromDate; d <= lastDateToTrend; d = d.AddDays(1))
        {
            int dOnTime = 0;
            int dLate = 0;
            int dLeave = 0;

            foreach (var emp in employees)
            {
                if (d < emp.StartDate.Date) continue;
                if (emp.EndDate.HasValue && d > emp.EndDate.Value.Date) continue;

                var key = $"{emp.EmployeeCode}_{d:yyyy-MM-dd}";
                if (dailyPunchesMap.TryGetValue(key, out var punch))
                {
                    if (punch.InTime <= standardStartTime) dOnTime++;
                    else dLate++;
                }
                else if (leaveDates.Contains(key))
                {
                    dLeave++;
                }
            }

            dailyTrend.Add(new
            {
                date = d.ToString("dd/MM"),
                fullDate = d.ToString("yyyy-MM-dd"),
                dayOfWeek = GetDayOfWeekName(d.DayOfWeek),
                isWeekend = d.DayOfWeek == DayOfWeek.Sunday || d.DayOfWeek == DayOfWeek.Saturday,
                onTimeCount = dOnTime,
                lateCount = dLate,
                leaveCount = dLeave,
                totalActive = dOnTime + dLate
            });
        }

        // Thống kê hôm nay (Today Status)
        int todayCheckedIn = 0;
        int todayOnTime = 0;
        int todayLate = 0;
        var todayEmployeesList = new List<object>();

        if (targetYear == nowLocal.Year && targetMonth == nowLocal.Month)
        {
            foreach (var emp in employees)
            {
                if (today < emp.StartDate.Date) continue;
                if (emp.EndDate.HasValue && today > emp.EndDate.Value.Date) continue;

                var key = $"{emp.EmployeeCode}_{today:yyyy-MM-dd}";
                bool hasPunch = dailyPunchesMap.TryGetValue(key, out var punch);
                bool isLeave = leaveDates.Contains(key);

                string todayStatus;
                string? todayInTime = null;
                int minsLate = 0;

                if (hasPunch)
                {
                    todayCheckedIn++;
                    todayInTime = $"{punch.InTime.Hours:D2}:{punch.InTime.Minutes:D2}";
                    bool isOnTime = punch.InTime <= standardStartTime || (punch.InTime >= lunchStartTime && punch.InTime <= lunchEndTime);
                    if (isOnTime)
                    {
                        todayOnTime++;
                        todayStatus = "Đúng giờ";
                    }
                    else
                    {
                        todayLate++;
                        var effectiveStart = punch.InTime > lunchEndTime ? lunchEndTime : standardStartTime;
                        minsLate = (int)Math.Ceiling((punch.InTime - effectiveStart).TotalMinutes);
                        todayStatus = "Đi trễ";
                    }
                }
                else if (isLeave)
                {
                    todayStatus = "Nghỉ phép";
                }
                else
                {
                    todayStatus = "Chưa chấm công";
                }

                todayEmployeesList.Add(new
                {
                    employeeCode = emp.EmployeeCode,
                    fullName = emp.FullName,
                    department = emp.DepartmentId.HasValue && departments.TryGetValue(emp.DepartmentId.Value, out var dname3) ? dname3 : "-",
                    inTime = todayInTime,
                    status = todayStatus,
                    lateMinutes = minsLate
                });
            }
        }

        // Đếm việc cần xử lý (Pending queues)
        int pendingLeaves = await _db.EmployeeRequests.AsNoTracking().CountAsync(r => r.RequestType == "LEAVE" && r.Status == "PENDING_HR", ct);
        int pendingRegularizations = await _db.EmployeeRequests.AsNoTracking().CountAsync(r => r.RequestType == "REGULARIZATION" && r.Status == "PENDING_HR", ct);
        int pendingDevices = await _db.EmployeeDevices.AsNoTracking().CountAsync(d => d.ApprovalStatus == "PENDING" && d.IsActiveSlot, ct);

        int totalPunches = totalOnTimePunches + totalLatePunches;
        double overallOnTimeRate = totalPunches > 0 ? Math.Round((double)totalOnTimePunches * 100.0 / totalPunches, 1) : 100.0;
        double avgLateMins = totalLatePunches > 0 ? Math.Round((double)totalLateMinutes / totalLatePunches, 1) : 0;

        return Ok(new
        {
            month = targetMonth,
            year = targetYear,
            companyId,
            standardStartTime = startStr,
            kpis = new
            {
                totalEmployees = employees.Count,
                totalPunches,
                onTimePunches = totalOnTimePunches,
                latePunches = totalLatePunches,
                onTimeRate = overallOnTimeRate,
                totalLateMinutes,
                averageLateMinutes = avgLateMins,
                totalLeaveCount = leaveDates.Count,
                todayCheckedIn,
                todayOnTime,
                todayLate,
                todayNotCheckedIn = Math.Max(0, employees.Count - todayCheckedIn),
                pendingActionCount = pendingLeaves + pendingRegularizations + pendingDevices,
                pendingLeaves,
                pendingRegularizations,
                pendingDevices
            },
            employeeStats = employeeStatsList,
            lateDetails = lateDetailsList,
            dailyTrend,
            todayStatus = todayEmployeesList
        });
    }

    private static string GetDayOfWeekName(DayOfWeek d) => d switch
    {
        DayOfWeek.Monday => "Thứ 2",
        DayOfWeek.Tuesday => "Thứ 3",
        DayOfWeek.Wednesday => "Thứ 4",
        DayOfWeek.Thursday => "Thứ 5",
        DayOfWeek.Friday => "Thứ 6",
        DayOfWeek.Saturday => "Thứ 7",
        DayOfWeek.Sunday => "Chủ nhật",
        _ => ""
    };
}
