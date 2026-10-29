using System.Text.Json;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using ChamCong.Engine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/periods")]
[Authorize]
public class PeriodsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;
    private readonly IImportService _importService;
    private readonly IExcelExportService _exportService;
    private readonly ITimesheetPublicationService _publicationService;
    private readonly ICalculationService _calcService;
    private readonly ILeaveService _leaveService;

    public PeriodsController(
        AppDbContext db,
        AccessService access,
        AuditService audit,
        IImportService importService,
        ICalculationService calcService,
        IExcelExportService exportService,
        ITimesheetPublicationService publicationService,
        ILeaveService leaveService)
    {
        _db = db;
        _access = access;
        _audit = audit;
        _importService = importService;
        _calcService = calcService;
        _exportService = exportService;
        _publicationService = publicationService;
        _leaveService = leaveService;
    }

    public record PeriodDto(
        int Id,
        int CompanyId,
        short Year,
        byte Month,
        DateTime FromDate,
        DateTime ToDate,
        decimal StandardDays,
        bool StandardDaysManual,
        string Status,
        string CreatedBy,
        DateTime CreatedAt,
        DateTime? CalculatedAt,
        string? ClosedBy,
        DateTime? ClosedAt,
        int UnresolvedCount);

    [HttpGet("company/{companyId}")]
    public async Task<IActionResult> GetByCompany(int companyId, CancellationToken ct)
    {
        _access.EnsureStaffOrAbove();
        await _access.EnsureCompanyAsync(companyId, ct);

        var list = await _db.Periods
            .AsNoTracking()
            .Where(p => p.CompanyId == companyId)
            .OrderByDescending(p => p.Year)
            .ThenByDescending(p => p.Month)
            .ToListAsync(ct);

        var periodIds = list.Select(p => p.Id).ToList();
        var unresolvedMap = await _db.DayResults
            .Where(r => periodIds.Contains(r.PeriodId) && !r.OutOfEmployment && !r.IsManual && (r.Code == Codes.Missing || r.Code == Codes.Vacant))
            .GroupBy(r => r.PeriodId)
            .Select(g => new { PeriodId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.PeriodId, x => x.Count, ct);

        var dtos = list.Select(p => new PeriodDto(
            p.Id,
            p.CompanyId,
            p.Year,
            p.Month,
            p.FromDate,
            p.ToDate,
            p.StandardDays,
            p.StandardDaysManual,
            p.Status.ToString(),
            p.CreatedBy,
            p.CreatedAt,
            p.CalculatedAt,
            p.ClosedBy,
            p.ClosedAt,
            unresolvedMap.TryGetValue(p.Id, out var count) ? count : 0
        )).ToList();

        return Ok(dtos);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id, CancellationToken ct)
    {
        _access.EnsureStaffOrAbove();
        var p = await _access.GetPeriodAsync(id, ct: ct);
        var unresolved = await _db.DayResults
            .CountAsync(r => r.PeriodId == id && !r.OutOfEmployment && !r.IsManual && (r.Code == Codes.Missing || r.Code == Codes.Vacant), ct);

        return Ok(new PeriodDto(
            p.Id, p.CompanyId, p.Year, p.Month, p.FromDate, p.ToDate, p.StandardDays, p.StandardDaysManual,
            p.Status.ToString(), p.CreatedBy, p.CreatedAt, p.CalculatedAt, p.ClosedBy, p.ClosedAt, unresolved
        ));
    }

    public record CreatePeriodDto(int CompanyId, short Year, byte Month, decimal? StandardDays);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePeriodDto dto, CancellationToken ct)
    {
        _access.EnsureOperatorOrAdmin();
        await _access.EnsureCompanyAsync(dto.CompanyId, ct);

        if (dto.Month < 1 || dto.Month > 12) return BadRequest(new { message = "Tháng không hợp lệ." });
        if (dto.Year < 2020 || dto.Year > 2040) return BadRequest(new { message = "Năm không hợp lệ." });

        if (await _db.Periods.AnyAsync(p => p.CompanyId == dto.CompanyId && p.Year == dto.Year && p.Month == dto.Month, ct))
        {
            return BadRequest(new { message = $"Kỳ công tháng {dto.Month:00}/{dto.Year} đã tồn tại trong hội sở." });
        }

        // Đọc tham số ngày bắt đầu kỳ (mặc định 26)
        var startDayParam = await _db.ParameterValues
            .Where(p => p.CompanyId == dto.CompanyId && p.Code == ParamCatalog.PeriodStartDay)
            .OrderByDescending(p => p.EffectiveFrom)
            .FirstOrDefaultAsync(ct);

        int startDay = 26;
        if (startDayParam != null && int.TryParse(startDayParam.Value, out var sd)) startDay = sd;

        DateTime fromDate, toDate;
        if (startDay == 1)
        {
            fromDate = new DateTime(dto.Year, dto.Month, 1);
            toDate = new DateTime(dto.Year, dto.Month, DateTime.DaysInMonth(dto.Year, dto.Month));
        }
        else
        {
            // Mẫu: kỳ tháng 09/2026 chạy từ 26/08 đến 25/09
            var prevMonth = new DateTime(dto.Year, dto.Month, 1).AddMonths(-1);
            fromDate = new DateTime(prevMonth.Year, prevMonth.Month, startDay);
            toDate = new DateTime(dto.Year, dto.Month, startDay - 1);
        }

        // Tính số ngày làm việc chuẩn từ lịch
        var calDays = await _db.CalendarDays
            .Where(c => c.CompanyId == dto.CompanyId && c.Date >= fromDate && c.Date <= toDate)
            .ToListAsync(ct);

        var daysCount = (toDate - fromDate).Days + 1;
        var calendarList = new List<CalendarDay>();
        for (int i = 0; i < daysCount; i++)
        {
            var d = fromDate.AddDays(i);
            var ent = calDays.FirstOrDefault(c => c.Date.Date == d.Date);
            if (ent != null)
            {
                calendarList.Add(new CalendarDay { Date = d, Type = (DayType)ent.DayType });
            }
            else
            {
                calendarList.Add(new CalendarDay
                {
                    Date = d,
                    Type = d.DayOfWeek == DayOfWeek.Sunday ? DayType.WeeklyOff : (d.DayOfWeek == DayOfWeek.Saturday ? DayType.HalfWork : DayType.Work)
                });
            }
        }

        decimal standardDays = dto.StandardDays ?? SummaryCalculator.StandardDays(calendarList);

        // Chụp bản snapshot tham số và bảng mã
        var curParams = await _db.ParameterValues.Where(p => p.CompanyId == dto.CompanyId || p.CompanyId == null).ToListAsync(ct);
        var curCodes = await _db.AttendanceCodes.Where(c => c.CompanyId == dto.CompanyId).ToListAsync(ct);

        var period = new Period
        {
            CompanyId = dto.CompanyId,
            Year = dto.Year,
            Month = dto.Month,
            FromDate = fromDate,
            ToDate = toDate,
            StandardDays = standardDays,
            StandardDaysManual = dto.StandardDays.HasValue,
            Status = PeriodStatus.Draft,
            ParamSnapshot = JsonSerializer.Serialize(curParams),
            CodeSnapshot = JsonSerializer.Serialize(curCodes),
            CreatedBy = _access.Username,
            CreatedAt = DateTime.Now
        };

        _db.Periods.Add(period);
        await _db.SaveChangesAsync(ct);

        _audit.Log("Period", period.Id, "Create", new { period.CompanyId, period.Year, period.Month, period.FromDate, period.ToDate, standardDays }, companyId: period.CompanyId, periodId: period.Id);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetById), new { id = period.Id }, new PeriodDto(
            period.Id, period.CompanyId, period.Year, period.Month, period.FromDate, period.ToDate, period.StandardDays, period.StandardDaysManual,
            period.Status.ToString(), period.CreatedBy, period.CreatedAt, null, null, null, 0
        ));
    }

    [HttpPost("{id}/import-punches")]
    [RequestSizeLimit(52428800)]
    [RequestFormLimits(MultipartBodyLengthLimit = 52428800)]
    public async Task<IActionResult> ImportPunches(int id, IFormFile? file, [FromQuery] bool commit = true, CancellationToken ct = default)
    {
        _access.EnsureOperatorOrAdmin();
        if (file == null || file.Length == 0) return BadRequest(new { message = "Vui lòng chọn file Excel chấm công (.xlsx, .xls)." });
        if (file.Length > 30 * 1024 * 1024) return BadRequest(new { message = "Kích thước file không được vượt quá 30MB." });

        using var stream = file.OpenReadStream();
        var report = await _importService.InspectAndImportPunchesAsync(id, stream, file.FileName, commit, ct);

        if (commit)
        {
            // Tự động tính công ngay sau khi nạp dữ liệu để Bước 2 (Kiểm tra & Giải trình) có sẵn dữ liệu và cảnh báo
            await _calcService.CalculatePeriodAsync(id, resetManual: false, ct);
        }

        return Ok(report);
    }

    [HttpPost("{id}/calculate")]
    public async Task<IActionResult> Calculate(int id, [FromQuery] bool resetManual = false, CancellationToken ct = default)
    {
        _access.EnsureOperatorOrAdmin();
        var period = await _access.GetPeriodAsync(id, ct: ct);
        if (period.Status == PeriodStatus.Closed)
        {
            return BadRequest(new { message = "Kỳ công đã chốt, không thể tính lại." });
        }

        // Tự động đồng bộ và gộp dữ liệu chấm công từ thiết bị cá nhân (PC/Mobile) trước khi tính
        var syncStats = await SyncDeviceAttendanceInternalAsync(period, ct);

        var result = await _calcService.CalculatePeriodAsync(id, resetManual, ct);
        return Ok(new
        {
            message = $"Đã tự động lấy dữ liệu chấm công thiết bị ({syncStats.syncedDays} lượt công) và tính công thành công.",
            syncedCount = syncStats.syncedDays,
            employeesWithPunches = syncStats.employeesWithPunches,
            totalEmployees = syncStats.totalEmployees,
            calculationResult = result
        });
    }

    /// <summary>HCNS đồng bộ dữ liệu tự chấm công (Web/Mobile PWA) của nhân viên vào kỳ công và tính công tự động.</summary>
    [HttpPost("{id}/sync-self-attendance")]
    public async Task<IActionResult> SyncSelfAttendance(int id, CancellationToken ct = default)
    {
        _access.EnsureOperatorOrAdmin();
        var period = await _access.GetPeriodAsync(id, ct: ct);
        if (period.Status == PeriodStatus.Closed)
        {
            return BadRequest(new { message = "Kỳ công đã chốt, không thể đồng bộ dữ liệu mới." });
        }

        var (syncedCount, employeesWithPunches, totalEmployees) = await SyncDeviceAttendanceInternalAsync(period, ct);

        // Tự động chạy tính công cho kỳ
        var calcResult = await _calcService.CalculatePeriodAsync(id, resetManual: false, ct);

        _audit.Log("Period", id, "SyncSelfAttendance", new
        {
            SyncedDays = syncedCount,
            EmployeesWithPunches = employeesWithPunches,
            TotalEmployees = totalEmployees
        }, companyId: period.CompanyId, periodId: id);

        return Ok(new
        {
            message = $"Đã tự động tổng hợp {syncedCount} lượt ngày công thiết bị ({employeesWithPunches} nhân viên) và hoàn tất tính công.",
            syncedCount,
            employeesWithPunches,
            totalEmployees,
            calculationResult = calcResult
        });
    }

    private async Task<(int syncedDays, int employeesWithPunches, int totalEmployees)> SyncDeviceAttendanceInternalAsync(Period period, CancellationToken ct)
    {
        var employees = await _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == period.CompanyId)
            .ToListAsync(ct);

        if (!employees.Any())
        {
            return (0, 0, 0);
        }

        var empCodes = employees.Select(e => e.EmployeeCode).ToList();

        // 1. Tải tất cả TimeAdjustments đã duyệt trong kỳ (Đơn giải trình chấm công)
        var adjustments = await _db.TimeAdjustments
            .AsNoTracking()
            .Where(a => (a.CompanyId == null || a.CompanyId == period.CompanyId) && empCodes.Contains(a.EmployeeCode) && a.WorkDate >= period.FromDate && a.WorkDate <= period.ToDate && a.IsActive)
            .ToListAsync(ct);

        // 2. Tải tất cả DailyPunchSummary trong kỳ (đã có In/Out chuẩn, tính cả giải trình)
        var summaries = await _db.DailyPunchSummaries
            .AsNoTracking()
            .Where(s => s.CompanyId == period.CompanyId && empCodes.Contains(s.EmployeeCode) && s.WorkDate >= period.FromDate && s.WorkDate <= period.ToDate)
            .ToListAsync(ct);

        // 3. Tải tất cả WebAttendanceLogs hợp lệ trong kỳ phòng trường hợp chưa có summary
        var validLogs = await _db.WebAttendanceLogs
            .AsNoTracking()
            .Where(l => (l.CompanyId == null || l.CompanyId == period.CompanyId) && empCodes.Contains(l.EmployeeCode) && l.WorkDate >= period.FromDate && l.WorkDate <= period.ToDate &&
                        (l.VerificationStatus == "VALID" || l.ReviewState == "ACCEPTED"))
            .OrderBy(l => l.CheckTimeUtc)
            .ToListAsync(ct);

        // 4. Tải các bản ghi RawPunch hiện tại của kỳ
        var existingRaws = await _db.RawPunches
            .Where(r => r.PeriodId == period.Id)
            .ToListAsync(ct);

        var rawDict = existingRaws
            .Where(r => r.EmployeeId.HasValue)
            .GroupBy(r => (r.EmployeeId!.Value, r.WorkDate.Date))
            .ToDictionary(g => g.Key, g => g.First());

        int syncedCount = 0;
        var empPunchedSet = new HashSet<int>();

        // Lặp qua từng ngày trong kỳ
        var daysCount = (period.ToDate.Date - period.FromDate.Date).Days + 1;
        for (int i = 0; i < daysCount; i++)
        {
            var date = period.FromDate.Date.AddDays(i);

            foreach (var emp in employees)
            {
                TimeSpan? inTime = null;
                TimeSpan? outTime = null;
                string source = "APP";

                // Ưu tiên 1: Đơn giải trình chấm công đã duyệt (TimeAdjustment)
                var adj = adjustments.FirstOrDefault(a => a.EmployeeCode == emp.EmployeeCode && a.WorkDate.Date == date);
                if (adj != null)
                {
                    inTime = adj.AdjInTime;
                    outTime = adj.AdjOutTime;
                    source = "REGULARIZED";
                }
                else
                {
                    // Ưu tiên 2: DailyPunchSummary
                    var sum = summaries.FirstOrDefault(s => s.EmployeeCode == emp.EmployeeCode && s.WorkDate.Date == date);
                    if (sum != null && (sum.InTime.HasValue || sum.OutTime.HasValue))
                    {
                        inTime = sum.InTime;
                        outTime = sum.OutTime;
                        source = sum.Source ?? "APP";
                    }
                    else
                    {
                        // Ưu tiên 3: WebAttendanceLogs
                        var dayLogs = validLogs.Where(l => l.EmployeeCode == emp.EmployeeCode && l.WorkDate.Date == date).ToList();
                        if (dayLogs.Any())
                        {
                            var firstLog = dayLogs.First();
                            inTime = AttendancePunchService.ToVietnamTime(firstLog.CheckTimeUtc).TimeOfDay;

                            const double minWorkSpanMin = 30.0;
                            var outCandidates = dayLogs.Where(l => (l.CheckTimeUtc - firstLog.CheckTimeUtc).TotalMinutes >= minWorkSpanMin).ToList();
                            if (outCandidates.Any())
                            {
                                outTime = AttendancePunchService.ToVietnamTime(outCandidates.Last().CheckTimeUtc).TimeOfDay;
                            }
                        }
                    }
                }

                if (!inTime.HasValue && !outTime.HasValue) continue;

                empPunchedSet.Add(emp.Id);
                short? inMin = inTime.HasValue ? (short?)(inTime.Value.Hours * 60 + inTime.Value.Minutes) : null;
                short? outMin = outTime.HasValue ? (short?)(outTime.Value.Hours * 60 + outTime.Value.Minutes) : null;

                if (rawDict.TryGetValue((emp.Id, date), out var raw))
                {
                    if (source == "REGULARIZED")
                    {
                        raw.InMin = inMin;
                        raw.OutMin = outMin;
                        raw.InTime = inMin.HasValue ? $"{(inMin.Value / 60):D2}:{(inMin.Value % 60):D2}:00" : null;
                        raw.OutTime = outMin.HasValue ? $"{(outMin.Value / 60):D2}:{(outMin.Value % 60):D2}:00" : null;
                        raw.Source = "REGULARIZED";
                    }
                    else
                    {
                        // Gộp thông minh nếu đã có punch trước đó (từ file hoặc lần sync trước)
                        short? finalInMin = null;
                        if (raw.InMin.HasValue && inMin.HasValue)
                            finalInMin = Math.Min(raw.InMin.Value, inMin.Value);
                        else
                            finalInMin = inMin ?? raw.InMin;

                        short? finalOutMin = null;
                        if (raw.OutMin.HasValue && outMin.HasValue)
                            finalOutMin = Math.Max(raw.OutMin.Value, outMin.Value);
                        else
                            finalOutMin = outMin ?? raw.OutMin;

                        raw.InMin = finalInMin;
                        raw.OutMin = finalOutMin;
                        raw.InTime = finalInMin.HasValue ? $"{(finalInMin.Value / 60):D2}:{(finalInMin.Value % 60):D2}:00" : null;
                        raw.OutTime = finalOutMin.HasValue ? $"{(finalOutMin.Value / 60):D2}:{(finalOutMin.Value % 60):D2}:00" : null;
                        raw.Source = (raw.Source == "EXCEL" || raw.Source == "MERGED") ? "MERGED" : source;
                    }
                    syncedCount++;
                }
                else
                {
                    var newRaw = new RawPunch
                    {
                        PeriodId = period.Id,
                        BatchId = null,
                        EmployeeId = emp.Id,
                        MachineCode = emp.EmployeeCode,
                        MachineName = emp.FullName,
                        WorkDate = date,
                        InMin = inMin,
                        OutMin = outMin,
                        InTime = inMin.HasValue ? $"{(inMin.Value / 60):D2}:{(inMin.Value % 60):D2}:00" : null,
                        OutTime = outMin.HasValue ? $"{(outMin.Value / 60):D2}:{(outMin.Value % 60):D2}:00" : null,
                        Source = source,
                        SourceRow = 0
                    };
                    _db.RawPunches.Add(newRaw);
                    rawDict[(emp.Id, date)] = newRaw;
                    syncedCount++;
                }
            }
        }

        await _db.SaveChangesAsync(ct);
        return (syncedCount, empPunchedSet.Count, employees.Count);
    }

    // Grid View
    [HttpGet("{id}/grid")]
    public async Task<IActionResult> GetGrid(int id, CancellationToken ct)
    {
        _access.EnsureStaffOrAbove();
        var period = await _access.GetPeriodAsync(id, ct: ct);

        var days = await _db.DayResults
            .AsNoTracking()
            .Where(r => r.PeriodId == id)
            .OrderBy(r => r.Date)
            .ToListAsync(ct);

        var empWithData = days.Select(d => d.EmployeeId).ToHashSet();
        var rawEmpWithData = await _db.RawPunches.AsNoTracking().Where(p => p.PeriodId == id && p.EmployeeId != null).Select(p => p.EmployeeId!.Value).ToListAsync(ct);
        foreach (var re in rawEmpWithData) empWithData.Add(re);

        var allEmployees = await _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == period.CompanyId)
            .OrderBy(e => e.SortOrder)
            .ThenBy(e => e.EmployeeCode)
            .ToListAsync(ct);

        // Tự động loại bỏ nhân sự đã nghỉ việc trước kỳ công để BCC luôn gọn gàng
        var employees = allEmployees.Where(e =>
            (e.EndDate == null || e.EndDate.Value.Date >= period.FromDate.Date || empWithData.Contains(e.Id)) &&
            (e.StartDate.Date <= period.ToDate.Date || empWithData.Contains(e.Id))
        ).ToList();

        var depts = await _db.Departments.AsNoTracking().Where(d => d.CompanyId == period.CompanyId).ToDictionaryAsync(d => d.Id, d => d.Name, ct);
        var grps = await _db.EmployeeGroups.AsNoTracking().Where(g => g.CompanyId == period.CompanyId).ToDictionaryAsync(g => g.Id, g => g.Name, ct);

        var codes = await _db.AttendanceCodes
            .AsNoTracking()
            .Where(c => c.CompanyId == period.CompanyId)
            .ToDictionaryAsync(c => c.Code, c => new { c.Code, c.Name, c.Color, c.WorkValue, c.HolidayValue, c.AnnualLeaveValue, c.PaidLeaveValue, c.IsHalfLeave }, ct);

        var notes = await _db.PeriodNotes
            .AsNoTracking()
            .Where(n => n.PeriodId == id)
            .ToDictionaryAsync(n => n.EmployeeId, n => n.Note, ct);

        // Lấy dữ liệu quỹ phép năm tại kỳ công hiện tại
        var leaveFundsList = await _leaveService.GetCompanyLeaveFundsAsync(period.CompanyId, period.Year, period.Month, ct);
        var leaveFundsMap = leaveFundsList.ToDictionary(f => f.EmployeeId);

        var daysCount = (period.ToDate.Date - period.FromDate.Date).Days + 1;
        var periodDates = Enumerable.Range(0, daysCount).Select(i => period.FromDate.Date.AddDays(i)).ToList();

        var empGrid = employees.Select(emp =>
        {
            var empDays = days.Where(d => d.EmployeeId == emp.Id)
                .GroupBy(d => d.Date.Date)
                .ToDictionary(g => g.Key, g => g.First());

            var dayCells = periodDates.Select(d =>
            {
                empDays.TryGetValue(d, out var r);
                return new
                {
                    date = d,
                    code = r?.Code,
                    autoCode = r?.AutoCode,
                    paidValue = r?.PaidValue ?? 0,
                    workedMinutes = r?.WorkedMinutes,
                    lateMinutes = r?.LateMinutes ?? 0,
                    earlyMinutes = r?.EarlyMinutes ?? 0,
                    otMinutes = r?.OtMinutes ?? 0,
                    inTime = !string.IsNullOrEmpty(r?.InTime) ? r.InTime : TimeUtil.Format(r?.InMin),
                    outTime = !string.IsNullOrEmpty(r?.OutTime) ? r.OutTime : TimeUtil.Format(r?.OutMin),
                    warnings = r?.Warnings,
                    isManual = r?.IsManual ?? false,
                    manualReason = r?.ManualReason,
                    outOfEmployment = r?.OutOfEmployment ?? false
                };
            }).ToList();

            // Tính tổng hợp tháng cho nhân viên
            var summaryDays = dayCells.Select(c => ((string?)c.code, c.lateMinutes + c.earlyMinutes, (int)c.otMinutes)).ToList();
            var codeDefs = codes.ToDictionary(k => k.Key, k => new CodeDef
            {
                Code = k.Value.Code,
                WorkValue = k.Value.WorkValue,
                HolidayValue = k.Value.HolidayValue,
                AnnualLeaveValue = k.Value.AnnualLeaveValue,
                PaidLeaveValue = k.Value.PaidLeaveValue
            });

            var empStandard = emp.EmployeeType == "PARTTIME"
                ? SummaryCalculator.Summarize(summaryDays, codeDefs, 0).PaidDays
                : period.StandardDays;
            var summary = SummaryCalculator.Summarize(summaryDays, codeDefs, empStandard);

            leaveFundsMap.TryGetValue(emp.Id, out var lb);

            return new
            {
                employee = new
                {
                    emp.Id,
                    emp.EmployeeCode,
                    emp.FullName,
                    departmentName = emp.DepartmentId.HasValue && depts.TryGetValue(emp.DepartmentId.Value, out var dn) ? dn : "",
                    groupName = grps.TryGetValue(emp.GroupId, out var gn) ? gn : "",
                    emp.ExemptPunch,
                    employeeType = emp.EmployeeType ?? "STANDARD",
                    defaultNote = emp.DefaultNote,
                    startDate = emp.StartDate,
                    endDate = emp.EndDate
                },
                note = notes.TryGetValue(emp.Id, out var nt) ? nt : "",
                summary,
                leaveBalance = lb != null ? new
                {
                    annualOpening = lb.AnnualOpening,
                    carryOpening = lb.CarryOpening,
                    opening = lb.AnnualOpening + lb.CarryOpening,
                    accrued = lb.Accrued,
                    totalEarned = lb.TotalAnnualEarned,
                    monthUsed = lb.MonthUsed,
                    monthAnnualUsed = lb.MonthAnnualUsed,
                    totalUsed = lb.TotalUsed,
                    available = lb.AvailableBalance,
                    isExhausted = lb.IsExhausted
                } : null,
                days = dayCells
            };
        }).ToList();

        return Ok(new
        {
            period = new
            {
                period.Id,
                period.Year,
                period.Month,
                period.FromDate,
                period.ToDate,
                period.StandardDays,
                period.Status
            },
            dates = periodDates.Select(d => new
            {
                date = d,
                dayName = d.ToString("dd/MM"),
                dayOfWeek = d.DayOfWeek.ToString()
            }),
            codes,
            grid = empGrid
        });
    }

    public record OverrideCellDto(
        int EmployeeId,
        DateTime Date,
        string? Code,
        string Reason);

    [HttpPost("{id}/override")]
    public async Task<IActionResult> OverrideCell(int id, [FromBody] OverrideCellDto dto, CancellationToken ct)
    {
        _access.EnsureOperatorOrAdmin();
        var period = await _access.GetPeriodAsync(id, ct: ct);
        if (period.Status == PeriodStatus.Closed)
        {
            return BadRequest(new { message = "Kỳ công đã chốt, không thể chỉnh sửa." });
        }

        var reason = Text.Required(dto.Reason, "Lý do chỉnh sửa", 500);

        var targetDate = dto.Date.Date;
        var result = await _db.DayResults
            .FirstOrDefaultAsync(r => r.PeriodId == id && r.EmployeeId == dto.EmployeeId && r.Date == targetDate, ct);

        if (result == null)
        {
            // Dự phòng trường hợp client gửi lệch múi giờ +-1 ngày
            result = await _db.DayResults
                .FirstOrDefaultAsync(r => r.PeriodId == id && r.EmployeeId == dto.EmployeeId &&
                    (r.Date == targetDate.AddDays(1) || r.Date == targetDate.AddDays(-1)), ct);
        }

        if (result == null) return NotFound(new { message = "Không tìm thấy ngày công của nhân viên." });

        var codeToUse = dto.Code?.Trim();
        if (codeToUse == "1/2P") codeToUse = "P/2";

        var codeDef = !string.IsNullOrEmpty(codeToUse)
            ? await _db.AttendanceCodes.FirstOrDefaultAsync(c => c.CompanyId == period.CompanyId && c.Code == codeToUse, ct)
            : null;

        if (!string.IsNullOrEmpty(codeToUse) && codeDef == null)
        {
            return BadRequest(new { message = $"Mã ký hiệu '{codeToUse}' không có trong Bảng quy chuẩn." });
        }

        var oldCode = result.Code;
        result.Code = codeToUse;
        result.PaidValue = codeDef != null ? (codeDef.WorkValue + codeDef.HolidayValue + codeDef.AnnualLeaveValue + codeDef.PaidLeaveValue) : 0;
        result.IsManual = true;
        result.ManualReason = reason;
        result.ManualBy = _access.Username;
        result.ManualAt = DateTime.Now;
        result.Warnings = null; // Đã xử lý giải trình xong, xóa cảnh báo tồn đọng

        _audit.Log("DayResult", result.Id, "ManualOverride",
            new { periodId = id, employeeId = dto.EmployeeId, date = dto.Date, oldCode, newCode = codeToUse, reason },
            companyId: period.CompanyId, periodId: id);

        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã cập nhật kết quả công.", result });
    }

    public record SavePeriodNoteDto(int EmployeeId, string Note);

    [HttpPost("{id}/save-note")]
    public async Task<IActionResult> SaveNote(int id, [FromBody] SavePeriodNoteDto dto, CancellationToken ct)
    {
        _access.EnsureOperatorOrAdmin();
        var period = await _access.GetPeriodAsync(id, ct: ct);
        if (period.Status == PeriodStatus.Closed)
        {
            return BadRequest(new { message = "Kỳ công đã chốt, không thể cập nhật ghi chú." });
        }

        var note = Text.Clean(dto.Note, 500) ?? "";

        var existing = await _db.PeriodNotes.FirstOrDefaultAsync(n => n.PeriodId == id && n.EmployeeId == dto.EmployeeId, ct);
        if (existing != null)
        {
            existing.Note = note;
        }
        else
        {
            _db.PeriodNotes.Add(new PeriodNote
            {
                PeriodId = id,
                EmployeeId = dto.EmployeeId,
                Note = note
            });
        }

        await _db.SaveChangesAsync(ct);
        return Ok(new { message = "Đã lưu ghi chú." });
    }

    [HttpGet("{id}/manual-backup-status")]
    public async Task<IActionResult> GetManualBackupStatus(int id, CancellationToken ct)
    {
        _access.EnsureOperatorOrAdmin();
        var backups = await _db.DayResultManualBackups
            .AsNoTracking()
            .Where(b => b.PeriodId == id)
            .ToListAsync(ct);

        return Ok(new
        {
            hasBackup = backups.Any(),
            backupCount = backups.Count,
            backedUpAt = backups.OrderByDescending(b => b.BackedUpAt).FirstOrDefault()?.BackedUpAt
        });
    }

    [HttpPost("{id}/undo-reset-manual")]
    public async Task<IActionResult> UndoResetManual(int id, CancellationToken ct)
    {
        _access.EnsureOperatorOrAdmin();
        var period = await _access.GetPeriodAsync(id, ct: ct);
        if (period.Status == PeriodStatus.Closed)
        {
            return BadRequest(new { message = "Kỳ công đã chốt, không thể hoàn tác." });
        }

        var backups = await _db.DayResultManualBackups
            .Where(b => b.PeriodId == id)
            .ToListAsync(ct);

        if (!backups.Any())
        {
            return BadRequest(new { message = "Không tìm thấy bản sao lưu nào để hoàn tác." });
        }

        var dayResults = await _db.DayResults
            .Where(r => r.PeriodId == id)
            .ToListAsync(ct);

        var resultMap = dayResults
            .GroupBy(r => (r.EmployeeId, r.Date.Date))
            .ToDictionary(g => g.Key, g => g.First());
        int restoredCount = 0;

        foreach (var b in backups)
        {
            if (resultMap.TryGetValue((b.EmployeeId, b.Date.Date), out var dr))
            {
                dr.Code = b.Code;
                dr.PaidValue = b.PaidValue;
                dr.IsManual = true;
                dr.ManualReason = b.ManualReason;
                dr.ManualBy = b.ManualBy;
                dr.ManualAt = b.ManualAt;
                restoredCount++;
            }
        }

        // Xóa backup sau khi đã khôi phục thành công
        _db.DayResultManualBackups.RemoveRange(backups);
        await _db.SaveChangesAsync(ct);

        _audit.Log("Period", id, "UndoResetManual", new { RestoredCount = restoredCount },
            companyId: period.CompanyId, periodId: id);

        return Ok(new
        {
            message = $"Đã hoàn tác và khôi phục thành công {restoredCount} ô đã sửa tay trước đó!",
            restoredCount
        });
    }

    [HttpGet("{id}/warnings")]
    public async Task<IActionResult> GetWarnings(int id, CancellationToken ct)
    {
        _access.EnsureStaffOrAbove();
        await _access.GetPeriodAsync(id, ct: ct);

        // Nếu chưa từng tính công cho kỳ, tự động tính để nạp danh sách cảnh báo vào DayResults
        if (!await _db.DayResults.AnyAsync(r => r.PeriodId == id, ct))
        {
            await _calcService.CalculatePeriodAsync(id, resetManual: false, ct);
        }

        var list = await _db.DayResults
            .AsNoTracking()
            .Where(r => r.PeriodId == id && !r.OutOfEmployment && (!string.IsNullOrEmpty(r.Warnings) || r.Code == Codes.Missing || r.Code == Codes.Vacant || r.Code == "V" || r.Code == "KP"))
            .OrderBy(r => r.Date)
            .ThenBy(r => r.EmployeeId)
            .ToListAsync(ct);

        var emps = await _db.Employees
            .AsNoTracking()
            .Where(e => list.Select(l => l.EmployeeId).Contains(e.Id))
            .ToDictionaryAsync(e => e.Id, e => new { e.EmployeeCode, e.FullName, e.StartDate, e.EndDate }, ct);

        // Lọc kỹ thêm một lần nữa theo StartDate và EndDate của nhân viên
        var filteredList = list.Where(r =>
        {
            if (emps.TryGetValue(r.EmployeeId, out var empInfo))
            {
                if (r.Date.Date < empInfo.StartDate.Date) return false;
                if (empInfo.EndDate.HasValue && r.Date.Date > empInfo.EndDate.Value.Date) return false;
            }
            return true;
        }).ToList();

        var result = filteredList.Select(r =>
        {
            emps.TryGetValue(r.EmployeeId, out var emp);
            return new
            {
                r.Id,
                r.EmployeeId,
                employeeCode = emp?.EmployeeCode ?? "",
                fullName = emp?.FullName ?? "",
                date = r.Date,
                r.Code,
                r.AutoCode,
                inTime = !string.IsNullOrEmpty(r.InTime) ? r.InTime : TimeUtil.Format(r.InMin),
                outTime = !string.IsNullOrEmpty(r.OutTime) ? r.OutTime : TimeUtil.Format(r.OutMin),
                r.Warnings,
                r.IsManual,
                r.ManualReason,
                r.ManualBy
            };
        });

        return Ok(result);
    }

    [HttpPost("{id}/close")]
    public async Task<IActionResult> ClosePeriod(int id, CancellationToken ct)
    {
        _access.EnsureOperatorOrAdmin();
        var period = await _access.GetPeriodAsync(id, tracking: true, ct);
        if (period.Status == PeriodStatus.Closed)
        {
            return BadRequest(new { message = "Kỳ công đã ở trạng thái đã chốt." });
        }

        // Ràng buộc bảo đảm chất lượng dữ liệu:
        // Không chốt được khi còn ngày mang mã ? hoặc V/KP chưa được giải trình/sửa tay (loại trừ ngoài thời gian làm việc)
        var unreviewedCount = await _db.DayResults
            .CountAsync(r => r.PeriodId == id && !r.OutOfEmployment && !r.IsManual && (r.Code == Codes.Missing || r.Code == Codes.Vacant || r.Code == "V" || r.Code == "KP"), ct);

        if (unreviewedCount > 0)
        {
            return BadRequest(new
            {
                message = $"Không thể chốt kỳ công: Còn {unreviewedCount} ngày có nghi vấn thiếu quẹt (?) hoặc vắng không phép (KP) chưa được giải trình/chọn mã đúng. Vui lòng xử lý toàn bộ danh sách giải trình trước khi chốt.",
                unreviewedCount
            });
        }

        // Không chặn chốt công khi còn mã máy quẹt chưa gán (cho phép chốt bình thường do file import danh sách có thể bị dư)
        var lastBatch = await _db.ImportBatches.FirstOrDefaultAsync(b => b.PeriodId == id && b.IsCurrent, ct);
        var unmatchedInfo = lastBatch != null && lastBatch.UnmatchedCodes > 0
            ? $" (Ghi nhận {lastBatch.UnmatchedCodes} mã máy chưa gán từ file import đã được bỏ qua)"
            : "";

        period.Status = PeriodStatus.Closed;
        period.ClosedBy = _access.Username;
        period.ClosedAt = DateTime.Now;

        // Tự động tính lại số ngày phép năm cho từng nhân viên: +1 ngày nếu làm việc >= 50% ngày công chuẩn của tháng
        var accruedCount = await _leaveService.RecalculateAndAccrueLeaveForPeriodAsync(period.Id, ct);

        _audit.Log("Period", period.Id, "ClosePeriod", $"Chốt kỳ công tháng {period.Month:00}/{period.Year} (Cộng +1 phép năm cho {accruedCount} nhân viên đủ >= 50% ngày công chuẩn){unmatchedInfo}", companyId: period.CompanyId, periodId: id);
        await _db.SaveChangesAsync(ct);

        // Tự động công bố bảng chấm công chính thức và gửi thông báo tới nhân viên
        var comp = await _db.Companies.FirstOrDefaultAsync(c => c.Id == period.CompanyId, ct);
        try
        {
            if (comp != null)
            {
                var hrUserId = User.UserId();
                await _publicationService.PublishTimesheetAsync(period.Id, comp.Code, $"Tự động công bố khi chốt kỳ công tháng {period.Month:00}/{period.Year}", hrUserId, ct);
            }
        }
        catch
        {
            // Dự phòng: Nếu PublishTimesheetAsync gặp lỗi ngoại lệ, tạo thông báo trực tiếp cho nhân viên
            var activeEmployees = await _db.Employees
                .AsNoTracking()
                .Where(e => e.CompanyId == period.CompanyId && (e.EndDate == null || e.EndDate >= period.FromDate))
                .ToListAsync(ct);
            var empCodes = activeEmployees.Select(e => e.EmployeeCode).ToHashSet();
            var empUsers = await _db.Users
                .Where(u => u.EmployeeCode != null && empCodes.Contains(u.EmployeeCode) && u.IsActive)
                .ToListAsync(ct);

            foreach (var u in empUsers)
            {
                _db.Notifications.Add(new Notification
                {
                    UserId = u.Id,
                    CompanyId = period.CompanyId,
                    BranchCode = comp?.Code,
                    Title = $"Bảng chấm công Tháng {period.Month:00}/{period.Year} đã được chốt",
                    Body = $"HCNS đã hoàn tất chốt kỳ công Tháng {period.Month:00}/{period.Year}. Bạn có thể vào xem chi tiết chấm công, ngày phép, ngày trễ và phép năm còn lại.",
                    LinkType = "TIMESHEET",
                    LinkId = period.Id,
                    IsRead = false,
                    CreatedAtUtc = DateTime.UtcNow
                });
            }
            await _db.SaveChangesAsync(ct);
        }

        return Ok(new
        {
            message = $"Chốt kỳ công thành công. Đã tính lại số ngày phép và cộng +1 ngày phép năm cho {accruedCount} nhân viên làm việc đủ từ 50% ngày công chuẩn.",
            accruedCount
        });
    }

    public record ReopenPeriodDto(string Reason);

    [HttpPost("{id}/reopen")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> ReopenPeriod(int id, [FromBody] ReopenPeriodDto dto, CancellationToken ct)
    {
        var period = await _access.GetPeriodAsync(id, tracking: true, ct);
        if (period.Status != PeriodStatus.Closed)
        {
            return BadRequest(new { message = "Kỳ công hiện không ở trạng thái đã chốt." });
        }

        var reason = Text.Required(dto.Reason, "Lý do mở chốt kỳ", 500);

        period.Status = PeriodStatus.Calculated;
        period.ClosedBy = null;
        period.ClosedAt = null;

        // Hoàn tác phần ngày phép tích lũy từ kỳ công này khi mở chốt
        await _leaveService.RevertLeaveAccrualForPeriodAsync(period.Id, ct);

        _audit.Log("Period", period.Id, "ReopenPeriod", new { reason, reopenedBy = _access.Username }, companyId: period.CompanyId, periodId: id);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã mở chốt kỳ công thành công và hoàn tác ngày phép tích lũy của kỳ này." });
    }

    // Xóa toàn bộ dữ liệu chấm công của một kỳ kèm theo toàn bộ bảng khóa ngoại liên quan
    [HttpDelete("{id}")]
    [Authorize(Roles = $"{Roles.Admin},{Roles.HR},Operator,ADMIN,HR,OPERATOR")]
    public async Task<IActionResult> DeletePeriod(int id, [FromQuery] bool force = false, CancellationToken ct = default)
    {
        _access.EnsureOperatorOrAdmin();
        var period = await _access.GetPeriodAsync(id, tracking: true, ct);

        // Nếu kỳ đã chốt nhưng chưa xác nhận force và không phải Admin, yêu cầu xác nhận rõ ràng
        if (period.Status == PeriodStatus.Closed && !force && !_access.IsAdmin)
        {
            return BadRequest(new
            {
                message = "Kỳ công đã chốt. Vui lòng xác nhận để hoàn tác ngày phép tích lũy và xóa sạch toàn bộ dữ liệu liên quan.",
                requiresConfirm = true
            });
        }

        int deletedDayResults = 0;
        int deletedRawPunches = 0;
        int deletedImportBatches = 0;
        int deletedLeaveLedger = 0;
        int deletedPublications = 0;

        try
        {
            var strategy = _db.Database.CreateExecutionStrategy();
            await strategy.ExecuteAsync(async () =>
            {
                using var tx = await _db.Database.BeginTransactionAsync(ct);

                // 0. Nếu kỳ đã chốt hoặc đã tính, hoàn tác các ngày phép năm tích lũy (+1 phép) của kỳ này trước
                if (period.Status == PeriodStatus.Closed)
                {
                    await _leaveService.RevertLeaveAccrualForPeriodAsync(id, ct);
                }

                // 1. Xóa các bản công bố bảng công, khiếu nại và dòng chi tiết (Phase 2 snapshot & dispute)
                var publications = await _db.TimesheetPublications.Where(p => p.PeriodId == id).ToListAsync(ct);
                if (publications.Count > 0)
                {
                    deletedPublications = publications.Count;
                    var pubIds = publications.Select(p => p.PublicationId).ToList();

                    var disputes = await _db.TimesheetDisputes.Where(d => pubIds.Contains(d.PublicationId)).ToListAsync(ct);
                    if (disputes.Count > 0) _db.TimesheetDisputes.RemoveRange(disputes);

                    var publishedLines = await _db.TimesheetPublishedLines.Where(l => pubIds.Contains(l.PublicationId)).ToListAsync(ct);
                    if (publishedLines.Count > 0) _db.TimesheetPublishedLines.RemoveRange(publishedLines);

                    await _db.SaveChangesAsync(ct);

                    _db.TimesheetPublications.RemoveRange(publications);
                    await _db.SaveChangesAsync(ct);
                }

                // 2. Dữ liệu quẹt thô và các đợt nạp file (RawPunches & ImportBatches)
                // Lưu ý: RawPunches có FK tới ImportBatches (BatchId) -> Xóa hoặc unbind RawPunches trước
                var importBatches = await _db.ImportBatches.Where(b => b.PeriodId == id).ToListAsync(ct);
                var batchIds = importBatches.Select(b => b.Id).ToList();

                var rawPunches = await _db.RawPunches.Where(p => p.PeriodId == id || (p.BatchId != null && batchIds.Contains(p.BatchId.Value))).ToListAsync(ct);
                if (rawPunches.Count > 0)
                {
                    deletedRawPunches = rawPunches.Count;
                    _db.RawPunches.RemoveRange(rawPunches);
                    await _db.SaveChangesAsync(ct);
                }

                if (batchIds.Count > 0)
                {
                    var punchesWithBatch = await _db.RawPunches.Where(p => p.BatchId != null && batchIds.Contains(p.BatchId.Value)).ToListAsync(ct);
                    if (punchesWithBatch.Count > 0)
                    {
                        foreach (var p in punchesWithBatch) p.BatchId = null;
                        await _db.SaveChangesAsync(ct);
                    }
                }

                if (importBatches.Count > 0)
                {
                    deletedImportBatches = importBatches.Count;
                    _db.ImportBatches.RemoveRange(importBatches);
                    await _db.SaveChangesAsync(ct);
                }

                // 3. Kết quả ngày công và bản lưu thủ công
                var manualBackups = await _db.DayResultManualBackups.Where(b => b.PeriodId == id).ToListAsync(ct);
                if (manualBackups.Count > 0) _db.DayResultManualBackups.RemoveRange(manualBackups);

                var dayResults = await _db.DayResults.Where(r => r.PeriodId == id).ToListAsync(ct);
                if (dayResults.Count > 0)
                {
                    deletedDayResults = dayResults.Count;
                    _db.DayResults.RemoveRange(dayResults);
                }
                await _db.SaveChangesAsync(ct);

                // 4. Sổ cái phép phát sinh từ kỳ này (FK_LeaveLedger_Periods)
                var leaveLedger = await _db.LeaveLedger.Where(l => l.PeriodId == id).ToListAsync(ct);
                if (leaveLedger.Count > 0)
                {
                    deletedLeaveLedger = leaveLedger.Count;
                    _db.LeaveLedger.RemoveRange(leaveLedger);
                }

                // 5. Thông báo liên kết với kỳ này
                var notis = await _db.Notifications.Where(n => n.LinkType == "TIMESHEET" && n.LinkId == id).ToListAsync(ct);
                if (notis.Count > 0) _db.Notifications.RemoveRange(notis);

                // 6. Ghi chú kỳ công
                var periodNotes = await _db.PeriodNotes.Where(n => n.PeriodId == id).ToListAsync(ct);
                if (periodNotes.Count > 0) _db.PeriodNotes.RemoveRange(periodNotes);

                // 7. Lịch sử xuất file
                var exportHistory = await _db.ExportHistory.Where(e => e.PeriodId == id).ToListAsync(ct);
                if (exportHistory.Count > 0) _db.ExportHistory.RemoveRange(exportHistory);

                await _db.SaveChangesAsync(ct);

                // 8. Gỡ liên kết PeriodId trong AuditLogs nếu có
                var auditLogs = await _db.AuditLogs.Where(a => a.PeriodId == id).ToListAsync(ct);
                if (auditLogs.Count > 0)
                {
                    foreach (var al in auditLogs) al.PeriodId = null;
                    await _db.SaveChangesAsync(ct);
                }

                // 9. Ghi log kiểm toán thao tác xóa kỳ công (periodId: null để tránh FK)
                _audit.Log("Period", period.Id, "DeletePeriod",
                    $"Xóa hoàn toàn kỳ công tháng {period.Month:00}/{period.Year} ({deletedDayResults} ngày công, {deletedRawPunches} raw punches, {deletedImportBatches} batches, {deletedLeaveLedger} sổ cái phép, {deletedPublications} bản công bố)",
                    companyId: period.CompanyId, periodId: null);

                // 10. Xóa Period chính
                _db.Periods.Remove(period);
                await _db.SaveChangesAsync(ct);

                await tx.CommitAsync(ct);
            });

            return Ok(new
            {
                message = $"Đã xóa thành công kỳ công tháng {period.Month:00}/{period.Year} và toàn bộ dữ liệu phụ thuộc liên quan.",
                deletedDayResults,
                deletedRawPunches,
                deletedImportBatches,
                deletedLeaveLedger,
                deletedPublications
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Lỗi khi xóa kỳ chấm công: " + ex.Message });
        }
    }

    // EXPORT EXCEL
    [HttpGet("{id}/export-excel")]
    public async Task<IActionResult> ExportExcel(int id, CancellationToken ct)
    {
        _access.EnsureStaffOrAbove();
        var period = await _access.GetPeriodAsync(id, ct: ct);
        var company = await _db.Companies.FindAsync(new object[] { period.CompanyId }, ct);
        if (company == null) return NotFound();

        var dayResults = await _db.DayResults.AsNoTracking().Where(r => r.PeriodId == id).ToListAsync(ct);
        var empWithData = dayResults.Select(d => d.EmployeeId).ToHashSet();
        var rawEmpWithData = await _db.RawPunches.AsNoTracking().Where(p => p.PeriodId == id && p.EmployeeId != null).Select(p => p.EmployeeId!.Value).ToListAsync(ct);
        foreach (var re in rawEmpWithData) empWithData.Add(re);

        var allEmployees = await _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == period.CompanyId)
            .OrderBy(e => e.SortOrder)
            .ThenBy(e => e.EmployeeCode)
            .ToListAsync(ct);

        var employees = allEmployees.Where(e =>
            (e.EndDate == null || e.EndDate.Value.Date >= period.FromDate.Date || empWithData.Contains(e.Id)) &&
            (e.StartDate.Date <= period.ToDate.Date || empWithData.Contains(e.Id))
        ).ToList();

        var depts = await _db.Departments.AsNoTracking().Where(d => d.CompanyId == period.CompanyId).ToDictionaryAsync(d => d.Id, ct);
        var notes = await _db.PeriodNotes.AsNoTracking().Where(n => n.PeriodId == id).ToDictionaryAsync(n => n.EmployeeId, n => n.Note, ct);

        var codes = await _db.AttendanceCodes
            .AsNoTracking()
            .Where(c => c.CompanyId == period.CompanyId)
            .ToDictionaryAsync(c => c.Code, c => new CodeDef
            {
                Code = c.Code,
                Name = c.Name,
                WorkValue = c.WorkValue,
                HolidayValue = c.HolidayValue,
                AnnualLeaveValue = c.AnnualLeaveValue,
                PaidLeaveValue = c.PaidLeaveValue,
                Color = c.Color
            }, ct);

        // Tổng hợp số ngày nghỉ phép theo từng tháng trong năm cho Sheet Phép năm
        var empIds = employees.Select(e => e.Id).ToList();
        var yearlyLeaveByMonth = new Dictionary<int, Dictionary<int, decimal>>();
        foreach (var eid in empIds)
        {
            var mDict = new Dictionary<int, decimal>();
            for (int m = 1; m <= 12; m++) mDict[m] = 0m;
            yearlyLeaveByMonth[eid] = mDict;
        }

        // 1. Lấy kết quả từ DayResults của các kỳ khác trong cùng năm
        var yearPeriodIds = await _db.Periods.AsNoTracking()
            .Where(p => p.CompanyId == period.CompanyId && p.Year == period.Year && p.Id != id)
            .Select(p => p.Id)
            .ToListAsync(ct);

        if (yearPeriodIds.Count > 0)
        {
            var yearDayResults = await _db.DayResults.AsNoTracking()
                .Where(r => yearPeriodIds.Contains(r.PeriodId) && empIds.Contains(r.EmployeeId) && !r.OutOfEmployment && !string.IsNullOrEmpty(r.Code))
                .ToListAsync(ct);

            foreach (var r in yearDayResults)
            {
                if (codes.TryGetValue(r.Code!, out var cd) && cd.AnnualLeaveValue > 0)
                {
                    if (yearlyLeaveByMonth.TryGetValue(r.EmployeeId, out var mDict))
                    {
                        mDict[r.Date.Month] += cd.AnnualLeaveValue;
                    }
                }
            }
        }

        // 2. Điền kết quả của kỳ hiện tại từ dayResults
        foreach (var r in dayResults)
        {
            if (!r.OutOfEmployment && !string.IsNullOrEmpty(r.Code) && codes.TryGetValue(r.Code, out var cd) && cd.AnnualLeaveValue > 0)
            {
                if (yearlyLeaveByMonth.TryGetValue(r.EmployeeId, out var mDict))
                {
                    mDict[r.Date.Month] += cd.AnnualLeaveValue;
                }
            }
        }

        bool isDraft = period.Status != PeriodStatus.Closed;
        var leaveFundsList = await _leaveService.GetCompanyLeaveFundsAsync(company.Id, period.Year, period.Month, ct);
        var leaveBalances = leaveFundsList.ToDictionary(f => f.EmployeeId);
        var bytes = _exportService.ExportAttendanceSheet(company, period, employees, depts, dayResults, notes, codes, isDraft, yearlyLeaveByMonth, leaveBalances);

        var fileName = $"BCC_{company.Code}_{period.Year}_{period.Month:00}.xlsx";

        // Ghi nhật ký xuất
        _db.ExportHistory.Add(new ExportHistory
        {
            PeriodId = id,
            FileName = fileName,
            ExportedBy = _access.Username,
            ExportedAt = DateTime.Now,
            PeriodStatus = period.Status
        });
        await _db.SaveChangesAsync(ct);

        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
    }

    [HttpGet("{id}/export-warnings")]
    public async Task<IActionResult> ExportWarnings(int id, CancellationToken ct)
    {
        _access.EnsureStaffOrAbove();
        var period = await _access.GetPeriodAsync(id, ct: ct);
        var company = await _db.Companies.FindAsync(new object[] { period.CompanyId }, ct);
        if (company == null) return NotFound();

        var dayResults = await _db.DayResults.AsNoTracking().Where(r => r.PeriodId == id).ToListAsync(ct);
        var empWithData = dayResults.Select(d => d.EmployeeId).ToHashSet();
        var rawEmpWithData = await _db.RawPunches.AsNoTracking().Where(p => p.PeriodId == id && p.EmployeeId != null).Select(p => p.EmployeeId!.Value).ToListAsync(ct);
        foreach (var re in rawEmpWithData) empWithData.Add(re);

        var allEmployees = await _db.Employees.AsNoTracking().Where(e => e.CompanyId == period.CompanyId).ToListAsync(ct);
        var employees = allEmployees.Where(e =>
            (e.EndDate == null || e.EndDate.Value.Date >= period.FromDate.Date || empWithData.Contains(e.Id)) &&
            (e.StartDate.Date <= period.ToDate.Date || empWithData.Contains(e.Id))
        ).ToList();

        var unmatched = await _db.RawPunches.AsNoTracking().Where(p => p.PeriodId == id && p.EmployeeId == null).ToListAsync(ct);

        var bytes = _exportService.ExportWarningsSheet(company, period, employees, dayResults, unmatched);
        var fileName = $"CanhBao_{company.Code}_{period.Year}_{period.Month:00}.xlsx";

        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
    }
}
