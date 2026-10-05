namespace ChamCong.Engine;

public sealed class LeaveBalance
{
    public decimal Carry { get; set; }   // Phép tồn năm trước
    public decimal Annual { get; set; }  // Phép năm hiện tại
    public decimal Comp { get; set; }    // Quỹ bù
    public decimal TotalAnnual => Carry + Annual;
}

public sealed record LedgerLine(DateTime Date, string Code, string Fund, decimal Amount);

/// <summary>
/// Cấn trừ phép tự động (Tính năng 5.1.2). Thứ tự: mã quỹ bù (BL, BL/2) trừ Quỹ bù;
/// mã phép năm (P, P/2, P/2K) trừ phép tồn năm trước → phép năm hiện tại. Quỹ không bao giờ âm.
/// </summary>
public static class LeaveLedgerCalculator
{
    public const string FundCarry = "CARRY";
    public const string FundAnnual = "ANNUAL";
    public const string FundComp = "COMP";

    public static List<LedgerLine> Allocate(
        IEnumerable<(DateTime Date, string Code)> days,
        IReadOnlyDictionary<string, CodeDef> codes,
        Func<int, LeaveBalance> balanceForYear,
        Dictionary<DateTime, List<string>> warnings)
    {
        var lines = new List<LedgerLine>();
        var balances = new Dictionary<int, LeaveBalance>();
        foreach (var (date, code) in days.OrderBy(d => d.Date))
        {
            if (!codes.TryGetValue(code, out var def) || def.FundType == FundType.None || def.FundDeduct <= 0) continue;
            if (!balances.TryGetValue(date.Year, out var bal)) balances[date.Year] = bal = balanceForYear(date.Year);
            decimal need = def.FundDeduct;

            if (def.FundType == FundType.Comp)
            {
                var take = Math.Min(need, bal.Comp);
                if (take > 0) { bal.Comp -= take; lines.Add(new(date, code, FundComp, -take)); }
                need -= take;
            }
            else
            {
                if (code == Codes.Annual && bal.TotalAnnual == 0.5m)
                    Warn(warnings, date, "Quỹ phép chỉ còn 0.5 ngày — gợi ý đổi sang P/2K");
                var takeCarry = Math.Min(need, bal.Carry);
                if (takeCarry > 0) { bal.Carry -= takeCarry; lines.Add(new(date, code, FundCarry, -takeCarry)); }
                need -= takeCarry;
                var takeAnnual = Math.Min(need, bal.Annual);
                if (takeAnnual > 0) { bal.Annual -= takeAnnual; lines.Add(new(date, code, FundAnnual, -takeAnnual)); }
                need -= takeAnnual;
            }

            if (need > 0)
                Warn(warnings, date, $"Quỹ {(def.FundType == FundType.Comp ? "bù" : "phép")} không đủ, thiếu {need:0.##} ngày — đề nghị đổi mã (P/2K, NL hoặc N)");
        }
        return lines;
    }

    private static void Warn(Dictionary<DateTime, List<string>> w, DateTime d, string msg)
    {
        if (!w.TryGetValue(d, out var l)) w[d] = l = new List<string>();
        l.Add(msg);
    }
}
