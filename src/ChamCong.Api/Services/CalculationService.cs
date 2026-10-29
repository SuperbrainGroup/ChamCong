using System.Text.Json;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Engine;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Services;

public class CalculationResultDto
{
    public int TotalEmployees { get; set; }
    public int CalculatedDays { get; set; }
    public int TotalWarnings { get; set; }
    public int MissingPunchesCount { get; set; }
    public int VacantCount { get; set; }
    public int PreservedManualCount { get; set; }
}

public interface ICalculationService
{
    Task<CalculationResultDto> CalculatePeriodAsync(
        int periodId,
        bool resetManual = false,
        CancellationToken ct = default);
}

public class CalculationService : ICalculationService
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public CalculationService(AppDbContext db, AccessService access, AuditService audit)
    {
        _db = db;
        _access = access;
        _audit = audit;
    }

    public async Task<CalculationResultDto> CalculatePeriodAsync(
        int periodId,
        bool resetManual = false,
        CancellationToken ct = default)
    {
        var period = await _access.GetPeriodAsync(periodId, tracking: true, ct);
        if (period.Status == PeriodStatus.Closed)
        {
            throw AppException.Bad("Kỳ công đã chốt, không thể tính lại.");
        }

        // 1. Tải bảng mã ký hiệu từ snapshot của kỳ (hoặc từ DB nếu snapshot chưa có)
        var codesList = await _db.AttendanceCodes
            .AsNoTracking()
            .Where(c => c.CompanyId == period.CompanyId)
            .ToListAsync(ct);

        var codesMap = codesList
            .GroupBy(c => c.Code, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g =>
            {
                var c = g.First();
                return new CodeDef
                {
                    Code = c.Code,
                    Name = c.Name,
                    WorkValue = c.WorkValue,
                    HolidayValue = c.HolidayValue,
                    AnnualLeaveValue = c.AnnualLeaveValue,
                    PaidLeaveValue = c.PaidLeaveValue,
                    FundType = (FundType)c.FundType,
                    FundDeduct = c.FundDeduct,
                    IsHalfLeave = c.IsHalfLeave,
                    Color = c.Color,
                    SortOrder = c.SortOrder,
                    IsSystem = c.IsSystem,
                    Condition = c.Condition
                };
            }, StringComparer.OrdinalIgnoreCase);

        // 2. Tải tham số hiệu lực
        var paramValues = await _db.ParameterValues
            .AsNoTracking()
            .Where(p => (p.CompanyId == null || p.CompanyId == period.CompanyId) && p.EffectiveFrom <= period.ToDate)
            .OrderBy(p => p.EffectiveFrom)
            .ToListAsync(ct);

        // Gom tham số: System -> Company -> Group
        var sysParams = paramValues.Where(p => p.CompanyId == null && p.GroupId == null)
            .GroupBy(p => p.Code).ToDictionary(g => g.Key, g => g.Last().Value);
        var comParams = paramValues.Where(p => p.CompanyId == period.CompanyId && p.GroupId == null)
            .GroupBy(p => p.Code).ToDictionary(g => g.Key, g => g.Last().Value);
        var grpParams = paramValues.Where(p => p.CompanyId == period.CompanyId && p.GroupId != null)
            .GroupBy(p => (p.GroupId!.Value, p.Code)).ToDictionary(g => g.Key, g => g.Last().Value);

        // 3. Tải lịch làm việc trong khoảng kỳ
        var calEntities = await _db.CalendarDays
            .AsNoTracking()
            .Where(c => c.CompanyId == period.CompanyId && c.Date >= period.FromDate && c.Date <= period.ToDate)
            .ToListAsync(ct);

        var daysCount = (period.ToDate.Date - period.FromDate.Date).Days + 1;
        var calendarDays = new Dictionary<DateTime, CalendarDay>();

        for (int i = 0; i < daysCount; i++)
        {
            var dt = period.FromDate.Date.AddDays(i);
            var calEnt = calEntities.FirstOrDefault(c => c.Date.Date == dt);

            if (calEnt != null)
            {
                calendarDays[dt] = new CalendarDay
                {
                    Date = dt,
                    Type = (DayType)calEnt.DayType,
                    HalfSession = calEnt.HalfSession,
                    ShiftStart = calEnt.ShiftStart,
                    ShiftEnd = calEnt.ShiftEnd,
                    CompanyOffCode = calEnt.CompanyOffCode,
                    Note = calEnt.Note
                };
            }
            else
            {
                // Mặc định: CN là nghỉ tuần, T7 là nửa ngày (hoặc theo SaturdayWorkPolicy)
                var dtType = dt.DayOfWeek == DayOfWeek.Sunday ? DayType.WeeklyOff
                    : dt.DayOfWeek == DayOfWeek.Saturday ? DayType.HalfWork
                    : DayType.Work;

                calendarDays[dt] = new CalendarDay
                {
                    Date = dt,
                    Type = dtType
                };
            }
        }

        // Cập nhật số ngày làm việc chuẩn nếu chưa sửa tay
        if (!period.StandardDaysManual)
        {
            period.StandardDays = SummaryCalculator.StandardDays(calendarDays.Values);
        }

        // 4. Tải dữ liệu quẹt thô mới nhất của kỳ
        var punches = await _db.RawPunches
            .AsNoTracking()
            .Where(p => p.PeriodId == period.Id && p.EmployeeId != null)
            .ToListAsync(ct);

        var punchMap = punches
            .GroupBy(p => (p.EmployeeId!.Value, p.WorkDate.Date))
            .ToDictionary(g => g.Key, g => g.First());

        var empWithPunches = punches.Where(p => p.EmployeeId != null).Select(p => p.EmployeeId!.Value).ToHashSet();

        // 5. Tải danh sách nhân viên thuộc kỳ công:
        // Tự động loại bỏ nhân sự đã nghỉ việc trước kỳ công (trừ khi có quẹt công)
        // và nhân sự vào làm sau kỳ công để BCC luôn gọn gàng
        var allEmployees = await _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == period.CompanyId)
            .ToListAsync(ct);

        var employees = allEmployees.Where(e =>
            (e.EndDate == null || e.EndDate.Value.Date >= period.FromDate.Date || empWithPunches.Contains(e.Id)) &&
            (e.StartDate.Date <= period.ToDate.Date || empWithPunches.Contains(e.Id))
        ).ToList();

        // 6. Tải đơn ngoại lệ nghỉ phép
        var leaves = await _db.LeaveRequests
            .AsNoTracking()
            .Where(l => l.CompanyId == period.CompanyId && l.Date >= period.FromDate && l.Date <= period.ToDate)
            .ToListAsync(ct);

        var leaveMap = leaves
            .GroupBy(l => (l.EmployeeId, l.Date.Date))
            .ToDictionary(g => g.Key, g => g.First().Code);

        // 6b. Tải lịch đăng ký làm việc (dành cho Remote và Part-time)
        var schedules = await _db.WorkSchedules
            .AsNoTracking()
            .Where(s => s.CompanyId == period.CompanyId && s.WorkDate >= period.FromDate && s.WorkDate <= period.ToDate && s.Status == "REGISTERED")
            .ToListAsync(ct);

        var scheduleMap = schedules
            .GroupBy(s => (s.EmployeeCode, s.WorkDate.Date))
            .ToDictionary(g => g.Key, g => g.First());

        var empScheduledCodes = schedules.Select(s => s.EmployeeCode).ToHashSet(StringComparer.OrdinalIgnoreCase);

        // 7. Tải kết quả cũ để giữ chỉnh sửa tay (nếu không chọn resetManual)
        var oldResults = await _db.DayResults
            .Where(r => r.PeriodId == period.Id)
            .ToListAsync(ct);

        var manualList = oldResults.Where(r => r.IsManual).ToList();
        if (resetManual && manualList.Any())
        {
            // Tự động tạo bản sao lưu trước khi xóa để người dùng có thể Hoàn tác bất kỳ lúc nào nếu thao tác nhầm
            var oldBackups = await _db.DayResultManualBackups
                .Where(b => b.PeriodId == period.Id)
                .ToListAsync(ct);
            _db.DayResultManualBackups.RemoveRange(oldBackups);

            var newBackups = manualList.Select(m => new DayResultManualBackup
            {
                PeriodId = period.Id,
                EmployeeId = m.EmployeeId,
                Date = m.Date,
                Code = m.Code,
                PaidValue = m.PaidValue,
                ManualReason = m.ManualReason,
                ManualBy = m.ManualBy,
                ManualAt = m.ManualAt,
                BackedUpAt = DateTime.UtcNow
            }).ToList();
            _db.DayResultManualBackups.AddRange(newBackups);
        }

        var manualMap = resetManual ? new Dictionary<(int, DateTime), DayResult>()
            : manualList.ToDictionary(r => (r.EmployeeId, r.Date.Date));

        // 8. Chạy Engine cho từng nhân viên và ngày
        var newResults = new List<DayResult>();
        int preservedManual = 0;
        int totalWarnings = 0;
        int missingPunches = 0;
        int vacantCount = 0;

        foreach (var emp in employees)
        {
            // Phân giải tham số của nhân viên: System -> Company -> Group
            var resolvedParams = new Dictionary<string, string>(sysParams);
            foreach (var kvp in comParams) resolvedParams[kvp.Key] = kvp.Value;
            foreach (var pDef in ParamCatalog.All)
            {
                if (grpParams.TryGetValue((emp.GroupId, pDef.Code), out var gv))
                {
                    resolvedParams[pDef.Code] = gv;
                }
            }

            var engParams = EngineParams.FromValues(resolvedParams);
            var empInfo = new EmployeeInfo
            {
                Id = emp.Id,
                StartDate = emp.StartDate,
                EndDate = emp.EndDate,
                ExemptPunch = emp.ExemptPunch,
                Params = engParams
            };

            int graceUsedCount = 0;

            for (int i = 0; i < daysCount; i++)
            {
                var dt = period.FromDate.Date.AddDays(i);
                var cal = calendarDays[dt];

                punchMap.TryGetValue((emp.Id, dt), out var rawPunch);
                leaveMap.TryGetValue((emp.Id, dt), out var leaveCode);

                Punch? pObj = rawPunch == null ? null : new Punch { In = rawPunch.InMin, Out = rawPunch.OutMin };

                // Xác định xem ngày này có đủ điều kiện và được miễn trễ theo du di (ân hạn) không:
                bool isGracePardoned = false;
                if (rawPunch != null && rawPunch.InMin.HasValue && rawPunch.OutMin.HasValue && rawPunch.OutMin.Value > rawPunch.InMin.Value)
                {
                    int pin = rawPunch.InMin.Value;
                    int pout = rawPunch.OutMin.Value;
                    bool halfWorkDay = cal.Type == DayType.HalfWork;
                    int sStart = cal.ShiftStart ?? (halfWorkDay ? (cal.HalfSession == "PM" ? engParams.LunchEnd : engParams.ShiftStart) : engParams.ShiftStart);
                    int sEnd = cal.ShiftEnd ?? (halfWorkDay ? (cal.HalfSession == "PM" ? engParams.ShiftEnd : engParams.LunchStart) : engParams.ShiftEnd);
                    int rawLate = Math.Max(0, pin - sStart);

                    if (rawLate > 0 && rawLate <= engParams.GraceMinutes)
                    {
                        // Kiểm tra nếu đã bù giờ Flexitime thì không cần tính vào số lần du di
                        bool flexAllowed = engParams.Flexitime && !halfWorkDay;
                        int flexInEnd = sStart + (engParams.FlexInEnd - engParams.ShiftStart);
                        int flexOutEnd = sEnd + (engParams.FlexOutEnd - engParams.ShiftEnd);
                        bool compensatedByFlex = flexAllowed && pin <= flexInEnd && pout >= Math.Min(sEnd + rawLate, flexOutEnd);

                        if (!compensatedByFlex)
                        {
                            if (engParams.GraceMaxTimesMonth > 0 && graceUsedCount < engParams.GraceMaxTimesMonth)
                            {
                                graceUsedCount++;
                                isGracePardoned = true;
                            }
                        }
                    }
                }

                var outcome = DayCalculator.Calculate(empInfo, cal, pObj, leaveCode, codesMap, isGracePardoned);

                // Quy tắc đặc thù cho nhân sự Part-time và Remote:
                bool isParttime = string.Equals(emp.EmployeeType, "PARTTIME", StringComparison.OrdinalIgnoreCase);
                bool isRemote = string.Equals(emp.EmployeeType, "REMOTE", StringComparison.OrdinalIgnoreCase);
                bool isScheduled = scheduleMap.ContainsKey((emp.EmployeeCode, dt.Date));
                bool hasPunch = rawPunch != null && (rawPunch.InMin.HasValue || rawPunch.OutMin.HasValue);

                if (isParttime)
                {
                    // 1. Trường hợp part-time có quẹt thẻ (đăng ký 8 ngày nhưng làm 9 hay 10 ngày vẫn tính đủ công)
                    if (hasPunch)
                    {
                        outcome.Code = Codes.Full;
                        outcome.PaidValue = 1.0m;
                        outcome.Warnings.Clear();
                    }
                    // 2. Không quẹt thẻ và ngoài lịch làm việc đăng ký: ngày nghỉ tự nhiên, không cần giải trình, không báo KP
                    else if (!isScheduled)
                    {
                        outcome.Code = null;
                        outcome.PaidValue = 0m;
                        outcome.Warnings.Clear();
                    }
                    // 3. Có đăng ký lịch làm việc nhưng không đi làm (không quẹt thẻ)
                    else if (leaveCode == null)
                    {
                        outcome.Code = Codes.Vacant;
                        outcome.PaidValue = 0m;
                    }
                }
                else if (isRemote)
                {
                    var empHasSchedule = empScheduledCodes.Contains(emp.EmployeeCode);
                    // 1. Nếu có đăng ký lịch làm việc: những ngày ngoài lịch không quẹt thẻ không cần giải trình
                    if (empHasSchedule && !isScheduled && !hasPunch)
                    {
                        outcome.Code = null;
                        outcome.PaidValue = 0m;
                        outcome.Warnings.Clear();
                    }
                    // 2. Điểm danh remote hợp lệ (tại nhà hoặc văn phòng) -> tính đủ công (ví dụ tháng 25 ngày thì tính đủ 25 ngày)
                    else if (hasPunch)
                    {
                        outcome.Code = Codes.Full;
                        outcome.PaidValue = 1.0m;
                        outcome.Warnings.Clear();
                    }
                }

                var formattedIn = !string.IsNullOrEmpty(rawPunch?.InTime)
                    ? rawPunch.InTime
                    : (rawPunch?.InMin.HasValue == true ? TimeUtil.Format(rawPunch.InMin) : null);
                var formattedOut = !string.IsNullOrEmpty(rawPunch?.OutTime)
                    ? rawPunch.OutTime
                    : (rawPunch?.OutMin.HasValue == true ? TimeUtil.Format(rawPunch.OutMin) : null);

                // Kiểm tra có sửa tay không
                if (manualMap.TryGetValue((emp.Id, dt), out var manualOld))
                {
                    preservedManual++;
                    manualOld.AutoCode = outcome.Code;
                    manualOld.WorkedMinutes = outcome.WorkedMinutes.HasValue ? (short)outcome.WorkedMinutes.Value : null;
                    manualOld.LateMinutes = (short)outcome.LateMinutes;
                    manualOld.EarlyMinutes = (short)outcome.EarlyMinutes;
                    manualOld.OtMinutes = (short)outcome.OtMinutes;
                    manualOld.InMin = rawPunch?.InMin;
                    manualOld.OutMin = rawPunch?.OutMin;
                    manualOld.InTime = formattedIn;
                    manualOld.OutTime = formattedOut;
                    manualOld.OutOfEmployment = outcome.OutOfEmployment;
                    // Giữ Code và PaidValue của manual
                    if (codesMap.TryGetValue(manualOld.Code ?? "", out var mCodeDef))
                    {
                        manualOld.PaidValue = mCodeDef.PaidValue;
                    }
                    newResults.Add(manualOld);
                }
                else
                {
                    var warnStr = outcome.Warnings.Count > 0 ? string.Join("; ", outcome.Warnings) : null;
                    if (outcome.Warnings.Count > 0) totalWarnings++;
                    if (outcome.Code == Codes.Missing) missingPunches++;
                    if (outcome.Code == Codes.Vacant) vacantCount++;

                    newResults.Add(new DayResult
                    {
                        PeriodId = period.Id,
                        EmployeeId = emp.Id,
                        Date = dt,
                        Code = outcome.Code,
                        AutoCode = outcome.Code,
                        PaidValue = outcome.PaidValue,
                        WorkedMinutes = outcome.WorkedMinutes.HasValue ? (short)outcome.WorkedMinutes.Value : null,
                        LateMinutes = (short)outcome.LateMinutes,
                        EarlyMinutes = (short)outcome.EarlyMinutes,
                        OtMinutes = (short)outcome.OtMinutes,
                        InMin = rawPunch?.InMin,
                        OutMin = rawPunch?.OutMin,
                        InTime = formattedIn,
                        OutTime = formattedOut,
                        Warnings = warnStr,
                        OutOfEmployment = outcome.OutOfEmployment,
                        IsManual = false
                    });
                }
            }
        }

        // 9. Lưu DayResults (tránh xung đột IDENTITY khi giữ các dòng sửa tay)
        var currentEmpIds = employees.Select(e => e.Id).ToHashSet();
        if (!resetManual)
        {
            var toDelete = oldResults.Where(r => !currentEmpIds.Contains(r.EmployeeId) || !r.IsManual).ToList();
            _db.DayResults.RemoveRange(toDelete);
            var toInsert = newResults.Where(r => r.Id == 0).ToList();
            _db.DayResults.AddRange(toInsert);
        }
        else
        {
            _db.DayResults.RemoveRange(oldResults);
            _db.DayResults.AddRange(newResults);
        }

        // 10. Module 5 (Cơ bản): Cập nhật Sổ cái phép cho kỳ này (xóa các bản ghi khấu trừ của kỳ này để tính lại)
        var empIds = employees.Select(e => e.Id).ToList();
        var oldLedgers = await _db.LeaveLedger
            .Where(l => (l.PeriodId == period.Id && l.Amount < 0) || (l.PeriodId == null && l.Date >= period.FromDate && l.Date <= period.ToDate && empIds.Contains(l.EmployeeId)))
            .ToListAsync(ct);
        if (oldLedgers.Count > 0) _db.LeaveLedger.RemoveRange(oldLedgers);

        var currentFunds = await _db.LeaveFunds
            .Where(f => f.Year == period.Year && empIds.Contains(f.EmployeeId))
            .ToListAsync(ct);
        var fundMap = currentFunds.ToDictionary(f => f.EmployeeId);

        // Lấy các giao dịch phép từ các kỳ khác trong năm để biết chính xác số dư lũy kế
        var otherLedgers = await _db.LeaveLedger
            .AsNoTracking()
            .Where(l => l.Year == period.Year && empIds.Contains(l.EmployeeId) && l.PeriodId != period.Id)
            .ToListAsync(ct);
        var otherLedgerMap = otherLedgers.GroupBy(l => l.EmployeeId).ToDictionary(g => g.Key, g => g.ToList());

        foreach (var emp in employees)
        {
            fundMap.TryGetValue(emp.Id, out var fund);
            var empDays = newResults
                .Where(r => r.EmployeeId == emp.Id && !string.IsNullOrEmpty(r.Code))
                .Select(r => (r.Date, r.Code!))
                .ToList();

            decimal otherAccrued = 0m;
            decimal otherAnnualUsed = 0m;
            decimal otherCarryUsed = 0m;
            decimal otherCompUsed = 0m;
            if (otherLedgerMap.TryGetValue(emp.Id, out var oList))
            {
                foreach (var ol in oList)
                {
                    if (ol.Amount > 0) otherAccrued += ol.Amount;
                    else
                    {
                        var d = Math.Abs(ol.Amount);
                        if (string.Equals(ol.Fund, "CARRY", StringComparison.OrdinalIgnoreCase)) otherCarryUsed += d;
                        else if (string.Equals(ol.Fund, "COMP", StringComparison.OrdinalIgnoreCase)) otherCompUsed += d;
                        else otherAnnualUsed += d;
                    }
                }
            }

            var leaveWarnings = new Dictionary<DateTime, List<string>>();
            var ledgerLines = LeaveLedgerCalculator.Allocate(
                empDays,
                codesMap,
                yr => new LeaveBalance
                {
                    Carry = Math.Max(0m, (fund?.CarryOpening ?? 0m) - otherCarryUsed),
                    Annual = Math.Max(0m, (fund?.AnnualOpening ?? 0m) + otherAccrued - otherAnnualUsed),
                    Comp = Math.Max(0m, (fund?.CompOpening ?? 0m) - otherCompUsed)
                },
                leaveWarnings);

            foreach (var (warnDate, warnList) in leaveWarnings)
            {
                var dayResult = newResults.FirstOrDefault(r => r.EmployeeId == emp.Id && r.Date == warnDate);
                if (dayResult != null)
                {
                    var joined = string.Join("; ", warnList);
                    dayResult.Warnings = string.IsNullOrEmpty(dayResult.Warnings) ? joined : $"{dayResult.Warnings}; {joined}";
                    totalWarnings += warnList.Count;
                }
            }

            foreach (var line in ledgerLines)
            {
                _db.LeaveLedger.Add(new LeaveLedgerEntry
                {
                    EmployeeId = emp.Id,
                    Year = period.Year,
                    Fund = line.Fund,
                    PeriodId = period.Id,
                    Date = line.Date,
                    Code = line.Code,
                    Amount = -Math.Abs(line.Amount),
                    Note = $"Khấu trừ phép tự động từ kỳ {period.Month:00}/{period.Year}"
                });
            }
        }

        period.Status = PeriodStatus.Calculated;
        period.CalculatedAt = DateTime.Now;

        _audit.Log("Period", period.Id, "CalculatePeriod",
            new { employees = employees.Count, warnings = totalWarnings, missing = missingPunches, vacant = vacantCount, preserved = preservedManual },
            companyId: period.CompanyId, periodId: period.Id);

        await _db.SaveChangesAsync(ct);

        return new CalculationResultDto
        {
            TotalEmployees = employees.Count,
            CalculatedDays = newResults.Count,
            TotalWarnings = totalWarnings,
            MissingPunchesCount = missingPunches,
            VacantCount = vacantCount,
            PreservedManualCount = preservedManual
        };
    }
}
