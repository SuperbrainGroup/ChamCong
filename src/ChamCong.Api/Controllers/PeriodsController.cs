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
    private readonly ICalculationService _calcService;
    private readonly IExcelExportService _exportService;

    public PeriodsController(
        AppDbContext db,
        AccessService access,
        AuditService audit,
        IImportService importService,
        ICalculationService calcService,
        IExcelExportService exportService)
    {
        _db = db;
        _access = access;
        _audit = audit;
        _importService = importService;
        _calcService = calcService;
        _exportService = exportService;
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

            var summary = SummaryCalculator.Summarize(summaryDays, codeDefs, period.StandardDays);

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
                    defaultNote = emp.DefaultNote,
                    startDate = emp.StartDate,
                    endDate = emp.EndDate
                },
                note = notes.TryGetValue(emp.Id, out var nt) ? nt : "",
                summary,
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

        var result = await _db.DayResults
            .FirstOrDefaultAsync(r => r.PeriodId == id && r.EmployeeId == dto.EmployeeId && r.Date == dto.Date.Date, ct);

        if (result == null) return NotFound(new { message = "Không tìm thấy ngày công của nhân viên." });

        var codeDef = !string.IsNullOrEmpty(dto.Code)
            ? await _db.AttendanceCodes.FirstOrDefaultAsync(c => c.CompanyId == period.CompanyId && c.Code == dto.Code, ct)
            : null;

        if (!string.IsNullOrEmpty(dto.Code) && codeDef == null)
        {
            return BadRequest(new { message = $"Mã ký hiệu '{dto.Code}' không có trong Bảng quy chuẩn." });
        }

        var oldCode = result.Code;
        result.Code = dto.Code;
        result.PaidValue = codeDef != null ? (codeDef.WorkValue + codeDef.HolidayValue + codeDef.AnnualLeaveValue + codeDef.PaidLeaveValue) : 0;
        result.IsManual = true;
        result.ManualReason = reason;
        result.ManualBy = _access.Username;
        result.ManualAt = DateTime.Now;

        _audit.Log("DayResult", result.Id, "ManualOverride",
            new { periodId = id, employeeId = dto.EmployeeId, date = dto.Date, oldCode, newCode = dto.Code, reason },
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
            .Where(r => r.PeriodId == id && !r.OutOfEmployment && (!string.IsNullOrEmpty(r.Warnings) || r.Code == Codes.Missing || r.Code == Codes.Vacant))
            .OrderBy(r => r.Date)
            .ThenBy(r => r.EmployeeId)
            .ToListAsync(ct);

        var emps = await _db.Employees
            .AsNoTracking()
            .Where(e => list.Select(l => l.EmployeeId).Contains(e.Id))
            .ToDictionaryAsync(e => e.Id, e => new { e.EmployeeCode, e.FullName }, ct);

        var result = list.Select(r =>
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
        // Không chốt được khi còn ngày mang mã ? hoặc V chưa được giải trình/sửa tay
        var unreviewedCount = await _db.DayResults
            .CountAsync(r => r.PeriodId == id && !r.OutOfEmployment && !r.IsManual && (r.Code == Codes.Missing || r.Code == Codes.Vacant), ct);

        if (unreviewedCount > 0)
        {
            return BadRequest(new
            {
                message = $"Không thể chốt kỳ công: Còn {unreviewedCount} ngày có nghi vấn thiếu quẹt (?) hoặc vắng (V) chưa được giải trình/chọn mã đúng. Vui lòng xử lý toàn bộ danh sách giải trình trước khi chốt.",
                unreviewedCount
            });
        }

        // Kiểm tra xem có mã máy quẹt nào chưa khớp không
        var lastBatch = await _db.ImportBatches.FirstOrDefaultAsync(b => b.PeriodId == id && b.IsCurrent, ct);
        if (lastBatch != null && lastBatch.UnmatchedCodes > 0)
        {
            return BadRequest(new
            {
                message = $"Không thể chốt kỳ công: Còn {lastBatch.UnmatchedCodes} mã máy chấm công chưa được gán nhân viên. Vui lòng vào danh mục nhân viên cập nhật mã máy hoặc xác nhận loại trừ."
            });
        }

        period.Status = PeriodStatus.Closed;
        period.ClosedBy = _access.Username;
        period.ClosedAt = DateTime.Now;

        _audit.Log("Period", period.Id, "ClosePeriod", $"Chốt kỳ công tháng {period.Month:00}/{period.Year}", companyId: period.CompanyId, periodId: id);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Chốt kỳ công thành công. Toàn bộ kết quả và sổ cái phép của kỳ đã được khóa an toàn." });
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

        _audit.Log("Period", period.Id, "ReopenPeriod", new { reason, reopenedBy = _access.Username }, companyId: period.CompanyId, periodId: id);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã mở chốt kỳ công thành công." });
    }

    // Xóa toàn bộ dữ liệu chấm công của một kỳ
    [HttpDelete("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeletePeriod(int id, CancellationToken ct)
    {
        var period = await _access.GetPeriodAsync(id, tracking: true, ct);

        if (period.Status == PeriodStatus.Closed)
        {
            return BadRequest(new { message = "Kỳ công đã chốt. Chỉ Admin mới có thể mở chốt và xóa kỳ công. Hãy mở chốt kỳ trước khi xóa." });
        }

        // Xóa toàn bộ dữ liệu chấm công
        var dayResults = await _db.DayResults.Where(r => r.PeriodId == id).ToListAsync(ct);
        if (dayResults.Count > 0) _db.DayResults.RemoveRange(dayResults);

        var manualBackups = await _db.DayResultManualBackups.Where(b => b.PeriodId == id).ToListAsync(ct);
        if (manualBackups.Count > 0) _db.DayResultManualBackups.RemoveRange(manualBackups);

        var rawPunches = await _db.RawPunches.Where(p => p.PeriodId == id).ToListAsync(ct);
        if (rawPunches.Count > 0) _db.RawPunches.RemoveRange(rawPunches);

        var importBatches = await _db.ImportBatches.Where(b => b.PeriodId == id).ToListAsync(ct);
        if (importBatches.Count > 0) _db.ImportBatches.RemoveRange(importBatches);

        var periodNotes = await _db.PeriodNotes.Where(n => n.PeriodId == id).ToListAsync(ct);
        if (periodNotes.Count > 0) _db.PeriodNotes.RemoveRange(periodNotes);

        var exportHistory = await _db.ExportHistory.Where(e => e.PeriodId == id).ToListAsync(ct);
        if (exportHistory.Count > 0) _db.ExportHistory.RemoveRange(exportHistory);

        _audit.Log("Period", period.Id, "DeletePeriod",
            $"Xóa toàn bộ kỳ công tháng {period.Month:00}/{period.Year} ({dayResults.Count} ngày công, {rawPunches.Count} raw punches, {importBatches.Count} batches)",
            companyId: period.CompanyId, periodId: id);

        _db.Periods.Remove(period);
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            message = $"Đã xóa toàn bộ kỳ công tháng {period.Month:00}/{period.Year} và {dayResults.Count} bản ghi chấm công.",
            deletedDayResults = dayResults.Count,
            deletedRawPunches = rawPunches.Count
        });
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

        bool isDraft = period.Status != PeriodStatus.Closed;
        var bytes = _exportService.ExportAttendanceSheet(company, period, employees, depts, dayResults, notes, codes, isDraft);

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
