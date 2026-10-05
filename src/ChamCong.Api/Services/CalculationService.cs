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

        var codesMap = codesList.ToDictionary(c => c.Code, c => new CodeDef
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
        });

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

        // 4. Tải danh sách nhân viên
        var employees = await _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == period.CompanyId)
            .ToListAsync(ct);

        // 5. Tải dữ liệu quẹt thô mới nhất của kỳ
        var punches = await _db.RawPunches
            .AsNoTracking()
            .Where(p => p.PeriodId == period.Id && p.EmployeeId != null)
            .ToListAsync(ct);

        var punchMap = punches
            .GroupBy(p => (p.EmployeeId!.Value, p.WorkDate.Date))
            .ToDictionary(g => g.Key, g => g.First());

        // 6. Tải đơn ngoại lệ nghỉ phép
        var leaves = await _db.LeaveRequests
            .AsNoTracking()
            .Where(l => l.CompanyId == period.CompanyId && l.Date >= period.FromDate && l.Date <= period.ToDate)
            .ToListAsync(ct);

        var leaveMap = leaves
            .GroupBy(l => (l.EmployeeId, l.Date.Date))
            .ToDictionary(g => g.Key, g => g.First().Code);

        // 7. Tải kết quả cũ để giữ chỉnh sửa tay (nếu không chọn resetManual)
        var oldResults = await _db.DayResults
            .Where(r => r.PeriodId == period.Id)
            .ToListAsync(ct);

        var manualMap = resetManual ? new Dictionary<(int, DateTime), DayResult>()
            : oldResults.Where(r => r.IsManual).ToDictionary(r => (r.EmployeeId, r.Date.Date));

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

            for (int i = 0; i < daysCount; i++)
            {
                var dt = period.FromDate.Date.AddDays(i);
                var cal = calendarDays[dt];

                punchMap.TryGetValue((emp.Id, dt), out var rawPunch);
                leaveMap.TryGetValue((emp.Id, dt), out var leaveCode);

                Punch? pObj = rawPunch == null ? null : new Punch { In = rawPunch.InMin, Out = rawPunch.OutMin };

                var outcome = DayCalculator.Calculate(empInfo, cal, pObj, leaveCode, codesMap);

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

        // 9. Lưu DayResults
        _db.DayResults.RemoveRange(oldResults);
        _db.DayResults.AddRange(newResults);

        // 10. Module 5 (Cơ bản): Cập nhật Sổ cái phép cho kỳ này
        var oldLedgers = await _db.LeaveLedger.Where(l => l.PeriodId == period.Id).ToListAsync(ct);
        _db.LeaveLedger.RemoveRange(oldLedgers);

        var currentFunds = await _db.LeaveFunds
            .Where(f => f.Year == period.Year && employees.Select(e => e.Id).Contains(f.EmployeeId))
            .ToListAsync(ct);
        var fundMap = currentFunds.ToDictionary(f => f.EmployeeId);

        foreach (var emp in employees)
        {
            fundMap.TryGetValue(emp.Id, out var fund);
            var empDays = newResults
                .Where(r => r.EmployeeId == emp.Id && !string.IsNullOrEmpty(r.Code))
                .Select(r => (r.Date, r.Code!))
                .ToList();

            var leaveWarnings = new Dictionary<DateTime, List<string>>();
            var ledgerLines = LeaveLedgerCalculator.Allocate(
                empDays,
                codesMap,
                yr => new LeaveBalance
                {
                    Carry = fund?.CarryOpening ?? 0,
                    Annual = fund?.AnnualOpening ?? 0,
                    Comp = fund?.CompOpening ?? 0
                },
                leaveWarnings);

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
                    Amount = line.Amount,
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
