using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Services;

public record LeaveBalanceDetailDto(
    int EmployeeId,
    string EmployeeCode,
    string FullName,
    int Year,
    decimal AnnualOpening,     // Phép năm đầu kỳ
    decimal CarryOpening,      // Phép chuyển từ năm trước
    decimal CompOpening,       // Quỹ nghỉ bù
    decimal Accrued,           // Tích lũy trong năm / đến thời điểm tháng đó (+1 ngày mỗi kỳ làm việc >= 50% ngày công chuẩn)
    decimal TotalAnnualEarned, // Tổng phép năm (Đầu kỳ + Tích lũy)
    decimal AnnualUsed,        // Đã dùng phép năm
    decimal CarryUsed,         // Đã dùng phép chuyển
    decimal CompUsed,          // Đã dùng nghỉ bù
    decimal TotalUsed,         // Tổng số ngày đã sử dụng
    decimal PendingDays,       // Số ngày đang chờ HR duyệt
    decimal AvailableBalance,  // Số ngày phép năm còn lại khả dụng tại thời điểm đó
    bool IsExhausted,          // true nếu đã hết phép năm tại thời điểm đó
    int? Month = null,         // Tháng đang lọc (null nếu cả năm)
    decimal MonthUsed = 0m,    // Số ngày phép (tất cả các quỹ) đã sử dụng riêng trong tháng đó
    decimal MonthAnnualUsed = 0m // Số ngày phép năm đã sử dụng riêng trong tháng đó
);

public record LeaveLedgerItemDto(
    long Id,
    int EmployeeId,
    int? PeriodId,
    short Year,
    DateTime Date,
    string Fund,
    decimal Amount,
    decimal BalanceAfter,
    string? Code,
    string? Note,
    DateTime CreatedAt
);

public interface ILeaveService
{
    Task<LeaveBalanceDetailDto> GetEmployeeLeaveBalanceAsync(int employeeId, int year, CancellationToken ct = default);
    Task<LeaveBalanceDetailDto> GetEmployeeLeaveBalanceAsync(int employeeId, int year, int? month, CancellationToken ct = default);
    Task<List<LeaveBalanceDetailDto>> GetCompanyLeaveFundsAsync(int companyId, int year, CancellationToken ct = default);
    Task<List<LeaveBalanceDetailDto>> GetCompanyLeaveFundsAsync(int companyId, int year, int? month, CancellationToken ct = default);
    Task<List<LeaveLedgerItemDto>> GetEmployeeLedgerAsync(int employeeId, int year, CancellationToken ct = default);
    Task<int> RecalculateAndAccrueLeaveForPeriodAsync(int periodId, CancellationToken ct = default);
    Task RevertLeaveAccrualForPeriodAsync(int periodId, CancellationToken ct = default);
    Task ValidateLeaveRequestAllowedAsync(int employeeId, string leaveCode, decimal daysRequested, DateTime fromDate, int? companyId = null, CancellationToken ct = default);
}

public class LeaveService : ILeaveService
{
    private readonly AppDbContext _db;

    public LeaveService(AppDbContext db)
    {
        _db = db;
    }

    public Task<LeaveBalanceDetailDto> GetEmployeeLeaveBalanceAsync(int employeeId, int year, CancellationToken ct = default)
        => GetEmployeeLeaveBalanceAsync(employeeId, year, null, ct);

    public async Task<LeaveBalanceDetailDto> GetEmployeeLeaveBalanceAsync(int employeeId, int year, int? month, CancellationToken ct = default)
    {
        var emp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.Id == employeeId, ct)
            ?? throw AppException.NotFound("Không tìm thấy nhân viên.");

        var fund = await _db.LeaveFunds.AsNoTracking().FirstOrDefaultAsync(f => f.EmployeeId == employeeId && f.Year == year, ct);

        decimal annualOpening = fund?.AnnualOpening ?? 0m;
        decimal carryOpening = fund?.CarryOpening ?? 0m;
        decimal compOpening = fund?.CompOpening ?? 0m;

        var ledgerQuery = _db.LeaveLedger
            .AsNoTracking()
            .Where(l => l.EmployeeId == employeeId && l.Year == year);

        DateTime? cutoffDate = null;
        if (month.HasValue && month.Value >= 1 && month.Value <= 12)
        {
            cutoffDate = new DateTime(year, month.Value, DateTime.DaysInMonth(year, month.Value), 23, 59, 59);
            ledgerQuery = ledgerQuery.Where(l => l.Date <= cutoffDate.Value);
        }

        var ledger = await ledgerQuery.ToListAsync(ct);

        decimal accrued = 0m;
        decimal annualUsed = 0m;
        decimal carryUsed = 0m;
        decimal compUsed = 0m;
        decimal monthUsed = 0m;
        decimal monthAnnualUsed = 0m;
        decimal monthAccrued = 0m;
        decimal priorUsed = 0m;
        decimal priorAccrued = 0m;

        // Tìm danh sách PeriodId thuộc tháng đó để tính chính xác cả kỳ công vắt tháng
        List<int> monthPeriodIds = new();
        if (month.HasValue && month.Value >= 1 && month.Value <= 12)
        {
            monthPeriodIds = await _db.Periods
                .AsNoTracking()
                .Where(p => p.CompanyId == emp.CompanyId && p.Year == year && p.Month == month.Value)
                .Select(p => p.Id)
                .ToListAsync(ct);
        }

        DateTime? priorCutoff = (month.HasValue && month.Value > 1)
            ? new DateTime(year, month.Value - 1, DateTime.DaysInMonth(year, month.Value - 1), 23, 59, 59)
            : null;

        foreach (var l in ledger)
        {
            bool isInSelectedMonth = month.HasValue && ((l.PeriodId.HasValue && monthPeriodIds.Contains(l.PeriodId.Value)) || (l.Date.Year == year && l.Date.Month == month.Value));
            bool isPriorToMonth = month.HasValue && (month.Value > 1) && (priorCutoff.HasValue && l.Date <= priorCutoff.Value) && !isInSelectedMonth;

            if (l.Amount > 0)
            {
                accrued += l.Amount;
                if (isInSelectedMonth) monthAccrued += l.Amount;
                if (isPriorToMonth) priorAccrued += l.Amount;
            }
            else
            {
                var deduct = Math.Abs(l.Amount);
                if (isInSelectedMonth) monthUsed += deduct;
                if (isPriorToMonth) priorUsed += deduct;

                if (string.Equals(l.Fund, "CARRY", StringComparison.OrdinalIgnoreCase))
                {
                    carryUsed += deduct;
                }
                else if (string.Equals(l.Fund, "COMP", StringComparison.OrdinalIgnoreCase))
                {
                    compUsed += deduct;
                }
                else
                {
                    annualUsed += deduct;
                    if (isInSelectedMonth)
                    {
                        monthAnnualUsed += deduct;
                    }
                }
            }
        }

        // Lấy số ngày đang chờ duyệt (Pending) cho các đơn xin phép năm
        var pendingQuery = _db.EmployeeRequests
            .AsNoTracking()
            .Where(r => r.EmployeeCode == emp.EmployeeCode &&
                        r.RequestType == "LEAVE" &&
                        r.Status == "PENDING_HR" &&
                        r.FromDate.Year == year &&
                        r.LeaveCode != null && r.LeaveCode.StartsWith("P"));

        if (cutoffDate.HasValue)
        {
            pendingQuery = pendingQuery.Where(r => r.FromDate <= cutoffDate.Value);
        }

        var pendingDays = await pendingQuery.SumAsync(r => (decimal?)r.DaysRequested, ct) ?? 0m;

        decimal effectiveOpening;
        decimal effectiveAccrued;
        decimal totalAnnualEarned;
        decimal availableBalance;

        if (month.HasValue && month.Value >= 1 && month.Value <= 12)
        {
            // "cách tính phép số dư đầu kỳ của tháng này sẽ bằng số phép tồn của tháng trước"
            if (month.Value == 1)
            {
                effectiveOpening = annualOpening + carryOpening;
            }
            else
            {
                decimal priorRemaining = (annualOpening + carryOpening + priorAccrued) - priorUsed;
                effectiveOpening = Math.Max(0m, priorRemaining);
            }

            effectiveAccrued = monthAccrued;
            totalAnnualEarned = effectiveOpening + effectiveAccrued;
            availableBalance = Math.Max(0m, totalAnnualEarned - monthUsed - pendingDays);
        }
        else
        {
            effectiveOpening = annualOpening;
            effectiveAccrued = accrued;
            totalAnnualEarned = annualOpening + carryOpening + accrued;
            decimal totalEarnedAll = totalAnnualEarned + compOpening;
            decimal totalUsed = annualUsed + carryUsed + compUsed;
            availableBalance = Math.Max(0m, totalEarnedAll - totalUsed - pendingDays);
        }

        bool isExhausted = availableBalance <= 0m;

        return new LeaveBalanceDetailDto(
            emp.Id,
            emp.EmployeeCode,
            emp.FullName,
            year,
            effectiveOpening,
            carryOpening,
            compOpening,
            effectiveAccrued,
            totalAnnualEarned,
            annualUsed,
            carryUsed,
            compUsed,
            priorUsed + monthUsed,
            pendingDays,
            availableBalance,
            isExhausted,
            month,
            monthUsed,
            monthAnnualUsed
        );
    }

    public Task<List<LeaveBalanceDetailDto>> GetCompanyLeaveFundsAsync(int companyId, int year, CancellationToken ct = default)
        => GetCompanyLeaveFundsAsync(companyId, year, null, ct);

    public async Task<List<LeaveBalanceDetailDto>> GetCompanyLeaveFundsAsync(int companyId, int year, int? month, CancellationToken ct = default)
    {
        var employees = await _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == companyId)
            .OrderBy(e => e.SortOrder)
            .ThenBy(e => e.EmployeeCode)
            .ToListAsync(ct);

        var empIds = employees.Select(e => e.Id).ToList();

        var funds = await _db.LeaveFunds
            .AsNoTracking()
            .Where(f => f.Year == year && empIds.Contains(f.EmployeeId))
            .ToDictionaryAsync(f => f.EmployeeId, ct);

        DateTime? cutoffDate = null;
        if (month.HasValue && month.Value >= 1 && month.Value <= 12)
        {
            cutoffDate = new DateTime(year, month.Value, DateTime.DaysInMonth(year, month.Value), 23, 59, 59);
        }

        var ledgerQuery = _db.LeaveLedger
            .AsNoTracking()
            .Where(l => l.Year == year && empIds.Contains(l.EmployeeId));

        if (cutoffDate.HasValue)
        {
            ledgerQuery = ledgerQuery.Where(l => l.Date <= cutoffDate.Value);
        }

        var ledgerList = await ledgerQuery.ToListAsync(ct);
        var ledgerMap = ledgerList.GroupBy(l => l.EmployeeId).ToDictionary(g => g.Key, g => g.ToList());

        var pendingQuery = _db.EmployeeRequests
            .AsNoTracking()
            .Where(r => (r.CompanyId == companyId || r.CompanyId == null) &&
                        r.RequestType == "LEAVE" &&
                        r.Status == "PENDING_HR" &&
                        r.FromDate.Year == year &&
                        r.LeaveCode != null && r.LeaveCode.StartsWith("P"));

        if (cutoffDate.HasValue)
        {
            pendingQuery = pendingQuery.Where(r => r.FromDate <= cutoffDate.Value);
        }

        var pendingList = await pendingQuery
            .GroupBy(r => r.EmployeeCode)
            .Select(g => new { EmployeeCode = g.Key, Pending = g.Sum(x => x.DaysRequested) })
            .ToDictionaryAsync(x => x.EmployeeCode, x => x.Pending, ct);

        List<int> monthPeriodIds = new();
        if (month.HasValue && month.Value >= 1 && month.Value <= 12)
        {
            monthPeriodIds = await _db.Periods
                .AsNoTracking()
                .Where(p => p.CompanyId == companyId && p.Year == year && p.Month == month.Value)
                .Select(p => p.Id)
                .ToListAsync(ct);
        }

        DateTime? priorCutoff = (month.HasValue && month.Value > 1)
            ? new DateTime(year, month.Value - 1, DateTime.DaysInMonth(year, month.Value - 1), 23, 59, 59)
            : null;

        var result = new List<LeaveBalanceDetailDto>();

        foreach (var emp in employees)
        {
            funds.TryGetValue(emp.Id, out var fund);
            ledgerMap.TryGetValue(emp.Id, out var empLedger);
            pendingList.TryGetValue(emp.EmployeeCode, out var pending);

            decimal annualOpening = fund?.AnnualOpening ?? 0m;
            decimal carryOpening = fund?.CarryOpening ?? 0m;
            decimal compOpening = fund?.CompOpening ?? 0m;

            decimal accrued = 0m;
            decimal annualUsed = 0m;
            decimal carryUsed = 0m;
            decimal compUsed = 0m;
            decimal monthUsed = 0m;
            decimal monthAnnualUsed = 0m;
            decimal monthAccrued = 0m;
            decimal priorUsed = 0m;
            decimal priorAccrued = 0m;

            if (empLedger != null)
            {
                foreach (var l in empLedger)
                {
                    bool isInSelectedMonth = month.HasValue && ((l.PeriodId.HasValue && monthPeriodIds.Contains(l.PeriodId.Value)) || (l.Date.Year == year && l.Date.Month == month.Value));
                    bool isPriorToMonth = month.HasValue && (month.Value > 1) && (priorCutoff.HasValue && l.Date <= priorCutoff.Value) && !isInSelectedMonth;

                    if (l.Amount > 0)
                    {
                        accrued += l.Amount;
                        if (isInSelectedMonth) monthAccrued += l.Amount;
                        if (isPriorToMonth) priorAccrued += l.Amount;
                    }
                    else
                    {
                        var deduct = Math.Abs(l.Amount);
                        if (isInSelectedMonth) monthUsed += deduct;
                        if (isPriorToMonth) priorUsed += deduct;

                        if (string.Equals(l.Fund, "CARRY", StringComparison.OrdinalIgnoreCase))
                        {
                            carryUsed += deduct;
                        }
                        else if (string.Equals(l.Fund, "COMP", StringComparison.OrdinalIgnoreCase))
                        {
                            compUsed += deduct;
                        }
                        else
                        {
                            annualUsed += deduct;
                            if (isInSelectedMonth)
                            {
                                monthAnnualUsed += deduct;
                            }
                        }
                    }
                }
            }

            decimal effectiveOpening;
            decimal effectiveAccrued;
            decimal totalAnnualEarned;
            decimal availableBalance;

            if (month.HasValue && month.Value >= 1 && month.Value <= 12)
            {
                // "cách tính phép số dư đầu kỳ của tháng này sẽ bằng số phép tồn của tháng trước"
                if (month.Value == 1)
                {
                    effectiveOpening = annualOpening + carryOpening;
                }
                else
                {
                    decimal priorRemaining = (annualOpening + carryOpening + priorAccrued) - priorUsed;
                    effectiveOpening = Math.Max(0m, priorRemaining);
                }

                effectiveAccrued = monthAccrued;
                totalAnnualEarned = effectiveOpening + effectiveAccrued;
                availableBalance = Math.Max(0m, totalAnnualEarned - monthUsed - pending);
            }
            else
            {
                effectiveOpening = annualOpening;
                effectiveAccrued = accrued;
                totalAnnualEarned = annualOpening + carryOpening + accrued;
                decimal totalEarnedAll = totalAnnualEarned + compOpening;
                decimal totalUsed = annualUsed + carryUsed + compUsed;
                availableBalance = Math.Max(0m, totalEarnedAll - totalUsed - pending);
            }

            result.Add(new LeaveBalanceDetailDto(
                emp.Id,
                emp.EmployeeCode,
                emp.FullName,
                year,
                effectiveOpening,
                carryOpening,
                compOpening,
                effectiveAccrued,
                totalAnnualEarned,
                annualUsed,
                carryUsed,
                compUsed,
                priorUsed + monthUsed,
                pending,
                availableBalance,
                availableBalance <= 0m,
                month,
                monthUsed,
                monthAnnualUsed
            ));
        }

        return result;
    }

    public async Task<List<LeaveLedgerItemDto>> GetEmployeeLedgerAsync(int employeeId, int year, CancellationToken ct = default)
    {
        var fund = await _db.LeaveFunds.AsNoTracking().FirstOrDefaultAsync(f => f.EmployeeId == employeeId && f.Year == year, ct);
        decimal runningBalance = (fund?.AnnualOpening ?? 0m) + (fund?.CarryOpening ?? 0m) + (fund?.CompOpening ?? 0m);

        var list = await _db.LeaveLedger
            .AsNoTracking()
            .Where(l => l.EmployeeId == employeeId && l.Year == year)
            .OrderBy(l => l.Date)
            .ThenBy(l => l.Id)
            .ToListAsync(ct);

        var dtos = new List<LeaveLedgerItemDto>();
        foreach (var l in list)
        {
            runningBalance += l.Amount; // l.Amount > 0 là cộng phép (+1), < 0 là trừ phép (-1)
            dtos.Add(new LeaveLedgerItemDto(
                l.Id,
                l.EmployeeId,
                l.PeriodId,
                l.Year,
                l.Date,
                l.Fund,
                l.Amount,
                Math.Max(0m, runningBalance),
                l.Code,
                l.Note,
                l.CreatedAt
            ));
        }

        return dtos;
    }

    public async Task<int> RecalculateAndAccrueLeaveForPeriodAsync(int periodId, CancellationToken ct = default)
    {
        var period = await _db.Periods.FirstOrDefaultAsync(p => p.Id == periodId, ct)
            ?? throw AppException.NotFound("Không tìm thấy kỳ công.");

        // 1. Xóa các bản ghi ACCRUAL cũ của kỳ này để chống cộng trùng nếu chốt lại
        var oldAccruals = await _db.LeaveLedger
            .Where(l => l.PeriodId == periodId && (l.Code == "ACCRUAL" || l.Code == "+1" || (l.Note != null && l.Note.Contains("Cộng 1 ngày phép"))))
            .ToListAsync(ct);

        if (oldAccruals.Count > 0)
        {
            _db.LeaveLedger.RemoveRange(oldAccruals);
        }

        // 2. Lấy dữ liệu DayResults của kỳ công
        var dayResults = await _db.DayResults
            .Where(r => r.PeriodId == periodId && !r.OutOfEmployment)
            .ToListAsync(ct);

        if (dayResults.Count == 0)
        {
            await _db.SaveChangesAsync(ct);
            return 0;
        }

        var codes = await _db.AttendanceCodes
            .AsNoTracking()
            .Where(c => c.CompanyId == period.CompanyId)
            .ToDictionaryAsync(c => c.Code, c => c, StringComparer.OrdinalIgnoreCase, ct);

        // 3. Nhóm theo nhân viên và tính tổng ngày công làm việc thực tế
        var empGroups = dayResults.GroupBy(r => r.EmployeeId);
        int accruedCount = 0;

        foreach (var g in empGroups)
        {
            int empId = g.Key;
            decimal workedDays = 0m;

            foreach (var r in g)
            {
                var code = string.IsNullOrEmpty(r.Code) ? r.AutoCode : r.Code;
                if (!string.IsNullOrEmpty(code))
                {
                    if (codes.TryGetValue(code, out var ac))
                    {
                        workedDays += ac.WorkValue;
                    }
                    else if (code == "+" || code == "CT")
                    {
                        workedDays += 1.0m;
                    }
                    else if (code == "1/2")
                    {
                        workedDays += 0.5m;
                    }
                }
            }

            // Quy định: Làm việc từ đủ 50% ngày công chuẩn của kỳ công (ví dụ tháng 24 ngày chuẩn -> từ 12 ngày trở đi) thì được +1 ngày phép năm
            decimal standardDays = period.StandardDays > 0 ? period.StandardDays : 26.0m;
            decimal requiredWorkedDays = standardDays * 0.5m;

            if (workedDays >= requiredWorkedDays)
            {
                // Đảm bảo có bản ghi LeaveFunds trong năm
                var hasFund = await _db.LeaveFunds.AnyAsync(f => f.EmployeeId == empId && f.Year == (short)period.Year, ct);
                if (!hasFund)
                {
                    _db.LeaveFunds.Add(new LeaveFund
                    {
                        EmployeeId = empId,
                        Year = (short)period.Year,
                        AnnualOpening = 0m,
                        CarryOpening = 0m,
                        CompOpening = 0m
                    });
                }

                _db.LeaveLedger.Add(new LeaveLedgerEntry
                {
                    EmployeeId = empId,
                    Year = (short)period.Year,
                    Fund = "ANNUAL",
                    PeriodId = period.Id,
                    Date = period.ToDate,
                    Code = "ACCRUAL",
                    Amount = 1.0m, // +1 ngày phép năm
                    Note = $"Cộng 1 ngày phép năm do làm việc đủ {workedDays:0.##}/{standardDays:0.##} ngày công (≥ 50%) kỳ Tháng {period.Month:00}/{period.Year}",
                    CreatedAt = DateTime.Now
                });

                accruedCount++;
            }
        }

        await _db.SaveChangesAsync(ct);
        return accruedCount;
    }

    public async Task RevertLeaveAccrualForPeriodAsync(int periodId, CancellationToken ct = default)
    {
        var accruals = await _db.LeaveLedger
            .Where(l => l.PeriodId == periodId && (l.Code == "ACCRUAL" || l.Code == "+1" || (l.Note != null && l.Note.Contains("Cộng 1 ngày phép"))))
            .ToListAsync(ct);

        if (accruals.Count > 0)
        {
            _db.LeaveLedger.RemoveRange(accruals);
            await _db.SaveChangesAsync(ct);
        }
    }

    public async Task ValidateLeaveRequestAllowedAsync(
        int employeeId,
        string leaveCode,
        decimal daysRequested,
        DateTime fromDate,
        int? companyId = null,
        CancellationToken ct = default)
    {
        // Kiểm tra xem mã có thuộc nhóm trừ quỹ phép năm không
        bool isAnnual = leaveCode.StartsWith("P", StringComparison.OrdinalIgnoreCase);
        if (!isAnnual)
        {
            return; // Các loại nghỉ khác (KL: Nghỉ không lương, Ro: Chế độ, L: Lễ...) không bị chặn theo quỹ phép năm
        }

        var balance = await GetEmployeeLeaveBalanceAsync(employeeId, fromDate.Year, ct);

        if (balance.AvailableBalance <= 0m)
        {
            throw AppException.Bad(
                $"Nhân viên {balance.FullName} ({balance.EmployeeCode}) đã sử dụng hết ngày phép năm (quỹ phép không đủ, hiện còn 0 ngày). " +
                $"Không thể nghỉ phép năm hưởng lương (mã {leaveCode}). Vui lòng chọn loại nghỉ khác (ví dụ: Nghỉ không lương - KL) hoặc liên hệ HCNS.");
        }

        if (daysRequested > balance.AvailableBalance)
        {
            throw AppException.Bad(
                $"Số dư ngày phép năm không đủ (quỹ phép không đủ): Nhân viên {balance.FullName} chỉ còn {balance.AvailableBalance:0.##} ngày phép khả dụng, " +
                $"nhưng yêu cầu {daysRequested:0.##} ngày. Vui lòng chọn loại nghỉ khác (ví dụ: Nghỉ không lương - KL) hoặc điều chỉnh lại thời gian nghỉ.");
        }
    }
}
