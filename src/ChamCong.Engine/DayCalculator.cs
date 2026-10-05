namespace ChamCong.Engine;

/// <summary>
/// Engine tính công một ngày (Module 3, Phụ lục B). Hàm thuần: không đọc DB, không phụ thuộc giao diện.
/// </summary>
public static class DayCalculator
{
    public static DayOutcome Calculate(
        EmployeeInfo emp,
        CalendarDay day,
        Punch? punch,
        string? leaveCode,
        IReadOnlyDictionary<string, CodeDef> codes)
    {
        var p = emp.Params;
        var o = new DayOutcome { Date = day.Date.Date };
        int? pin = punch?.In, pout = punch?.Out;
        bool anyPunch = pin.HasValue || pout.HasValue;

        // 1. Ngoài hiệu lực nhân viên → trống
        if (day.Date.Date < emp.StartDate.Date || (emp.EndDate.HasValue && day.Date.Date > emp.EndDate.Value.Date))
        {
            o.OutOfEmployment = true;
            if (anyPunch) o.Warnings.Add("Có dữ liệu quẹt ngoài thời gian làm việc của nhân viên");
            return o;
        }

        // 2. Nghỉ tuần → trống
        if (day.Type == DayType.WeeklyOff)
        {
            if (anyPunch) o.Warnings.Add("Có quẹt thẻ vào ngày nghỉ tuần (không tự tính công)");
            if (leaveCode != null) o.Warnings.Add($"Đơn nghỉ {leaveCode} trùng ngày nghỉ tuần — bỏ qua");
            return o;
        }

        // 3. Lễ cả ngày → L
        if (day.Type == DayType.Holiday)
        {
            SetCode(o, Codes.Holiday, codes);
            if (leaveCode != null) o.Warnings.Add($"Đơn nghỉ {leaveCode} trùng ngày Lễ — không trừ phép");
            return o;
        }

        // 4. Nghỉ toàn công ty → mã công ty chọn
        if (day.Type == DayType.CompanyOff)
        {
            SetCode(o, string.IsNullOrWhiteSpace(day.CompanyOffCode) ? Codes.Annual : day.CompanyOffCode!, codes);
            if (leaveCode != null) o.Warnings.Add($"Đơn nghỉ {leaveCode} trùng ngày nghỉ toàn công ty — bỏ qua đơn");
            if (anyPunch) o.Warnings.Add("Có quẹt thẻ vào ngày nghỉ toàn công ty");
            return o;
        }

        // Lễ nửa ngày → L/2 nếu làm thực tế đủ ngưỡng nửa công
        if (day.Type == DayType.HalfHoliday)
        {
            if (leaveCode != null) o.Warnings.Add($"Đơn nghỉ {leaveCode} trùng ngày Lễ nửa ngày — bỏ qua đơn");
            if (emp.ExemptPunch) { SetCode(o, Codes.HalfHoliday, codes); return o; }
            var (ss, se) = day.HalfSession == "PM" ? (p.ShiftStart, p.LunchStart) : (p.LunchEnd, p.ShiftEnd);
            return HalfDayWithWork(o, p, pin, pout, Codes.HalfHoliday, ss, se, codes,
                "Lễ nửa ngày nhưng giờ làm thực tế dưới ngưỡng nửa công", fallbackCode: Codes.Missing);
        }

        // 5. Có ngoại lệ nghỉ (đơn đã duyệt)
        if (leaveCode != null)
        {
            codes.TryGetValue(leaveCode, out var def);
            if (def == null) o.Warnings.Add($"Mã nghỉ '{leaveCode}' không có trong Bảng quy chuẩn");
            if (def != null && def.IsHalfLeave)
            {
                if (emp.ExemptPunch) { SetCode(o, leaveCode, codes); return o; }
                int ss, se;
                if (pin.HasValue && pout.HasValue && pout > pin)
                {
                    var am = Overlap(pin.Value, pout.Value, p.ShiftStart, p.LunchStart);
                    var pm = Overlap(pin.Value, pout.Value, p.LunchEnd, p.ShiftEnd);
                    (ss, se) = pm >= am ? (p.LunchEnd, p.ShiftEnd) : (p.ShiftStart, p.LunchStart);
                }
                else (ss, se) = (p.ShiftStart, p.LunchStart);
                var fallback = leaveCode == Codes.AnnualHalf ? Codes.AnnualHalfUnpaid : Codes.Missing;
                return HalfDayWithWork(o, p, pin, pout, leaveCode, ss, se, codes,
                    $"Nghỉ {leaveCode} nhưng giờ làm thực tế dưới ngưỡng nửa công", fallback);
            }
            SetCode(o, leaveCode, codes);
            if (anyPunch) o.Warnings.Add($"Có quẹt thẻ trong ngày nghỉ {leaveCode} — kiểm tra mâu thuẫn đơn nghỉ");
            return o;
        }

        // 6. Miễn quẹt thẻ
        if (emp.ExemptPunch)
        {
            SetCode(o, day.Type == DayType.HalfWork ? Codes.Half : Codes.Full, codes);
            return o;
        }

        // 7. Không quẹt / 1 lượt quẹt
        if (!anyPunch) { SetCode(o, Codes.Vacant, codes); return o; }
        if (!pin.HasValue || !pout.HasValue)
        {
            SetCode(o, Codes.Missing, codes);
            o.Warnings.Add(pin.HasValue ? "Chỉ có giờ vào, thiếu giờ ra" : "Chỉ có giờ ra, thiếu giờ vào");
            return o;
        }
        if (pout.Value <= pin.Value)
        {
            SetCode(o, Codes.Missing, codes);
            o.Warnings.Add("Giờ ra nhỏ hơn hoặc bằng giờ vào (nghi qua đêm/nhầm lượt)");
            return o;
        }

        // 8. Đủ 2 lượt quẹt
        int i = pin.Value, x = pout.Value;
        bool halfWorkDay = day.Type == DayType.HalfWork;
        int sStart, sEnd;
        if (day.ShiftStart.HasValue && day.ShiftEnd.HasValue) (sStart, sEnd) = (day.ShiftStart.Value, day.ShiftEnd.Value);
        else if (halfWorkDay) (sStart, sEnd) = day.HalfSession == "PM" ? (p.LunchEnd, p.ShiftEnd) : (p.ShiftStart, p.LunchStart);
        else (sStart, sEnd) = (p.ShiftStart, p.ShiftEnd);

        bool flexAllowed = p.Flexitime && !halfWorkDay;
        int flexInEnd = sStart + (p.FlexInEnd - p.ShiftStart);
        int flexOutEnd = sEnd + (p.FlexOutEnd - p.ShiftEnd);
        var le = LateEarly(p, sStart, sEnd, i, x, flexAllowed, flexInEnd, flexOutEnd);

        int worked = WorkedMinutes(p, i, x, sStart, Math.Max(sEnd, le.RequiredOut));
        o.WorkedMinutes = worked;
        int fullMin = (int)Math.Round(p.MinHoursFull * 60m);
        int halfMin = (int)Math.Round(p.MinHoursHalf * 60m);

        string code;
        if (halfWorkDay) code = worked >= halfMin ? Codes.Half : Codes.Missing;
        else if (worked >= fullMin || le.Compensated) code = Codes.Full;
        else if (worked >= halfMin) code = Codes.Half;
        else code = Codes.Missing;
        SetCode(o, code, codes);

        if (code == Codes.Missing)
        {
            o.Warnings.Add($"Giờ làm thực tế {worked / 60m:0.##}h dưới ngưỡng nửa công {p.MinHoursHalf}h");
        }
        else
        {
            bool penalize = code == Codes.Full || halfWorkDay || p.PenalizeLateOnHalfDay;
            if (penalize) { o.LateMinutes = le.Late; o.EarlyMinutes = le.Early; }
            if (code == Codes.Half && !halfWorkDay && (le.RawLate >= p.HalfDaySuspectMinutes || le.Early >= p.HalfDaySuspectMinutes))
                o.Warnings.Add("Nghi nghỉ nửa buổi — đối chiếu đơn nghỉ (P/2, BL/2…)");
        }

        if (p.OtEnabled && x - le.RequiredOut >= p.OtThreshold && p.OtThreshold >= 0 && code != Codes.Missing)
            o.OtMinutes = x - le.RequiredOut;

        return o;
    }

    /// <summary>Ngày nghỉ nửa ngày (L/2, P/2, BL/2): bắt buộc làm thực tế ≥ ngưỡng nửa công.</summary>
    private static DayOutcome HalfDayWithWork(DayOutcome o, EngineParams p, int? pin, int? pout, string code,
        int sStart, int sEnd, IReadOnlyDictionary<string, CodeDef> codes, string shortMsg, string fallbackCode)
    {
        int halfMin = (int)Math.Round(p.MinHoursHalf * 60m);
        if (pin.HasValue && pout.HasValue && pout > pin)
        {
            var worked = WorkedMinutes(p, pin.Value, pout.Value, null, null);
            o.WorkedMinutes = worked;
            if (worked >= halfMin)
            {
                SetCode(o, code, codes);
                var le = LateEarly(p, sStart, sEnd, pin.Value, pout.Value, false, sStart, sEnd);
                o.LateMinutes = le.Late;
                o.EarlyMinutes = le.Early;
                return o;
            }
        }
        SetCode(o, fallbackCode, codes);
        o.Warnings.Add(fallbackCode == Codes.Missing ? shortMsg : $"{shortMsg} → tạm ghi {fallbackCode}");
        return o;
    }

    public readonly record struct LateEarlyResult(int Late, int Early, int RequiredOut, bool Compensated, int RawLate);

    /// <summary>Flexitime &amp; ân hạn (Tính năng 3.2.2).</summary>
    public static LateEarlyResult LateEarly(EngineParams p, int sStart, int sEnd, int i, int x,
        bool flexAllowed, int flexInEnd, int flexOutEnd)
    {
        int rawLate = Math.Max(0, i - sStart);
        int reqOut = sEnd;
        if (p.EarlyInCompensation && i < sStart)
        {
            int credit = Math.Min(sStart - i, Math.Max(0, flexInEnd - sStart));
            reqOut = sEnd - credit;
        }

        if (rawLate <= p.GraceMinutes)
            return new(0, Math.Max(0, reqOut - x), reqOut, false, rawLate);

        if (flexAllowed && i <= flexInEnd)
        {
            reqOut = Math.Min(sEnd + rawLate, flexOutEnd);
            if (x >= reqOut) return new(0, 0, reqOut, true, rawLate);
            int early = Math.Max(0, sEnd - x);
            int late = p.ShortfallOnly ? (reqOut - x) - early : rawLate;
            return new(late, early, reqOut, false, rawLate);
        }

        int lateMin = p.LateFromShiftStart ? rawLate : rawLate - p.GraceMinutes;
        return new(Math.Max(0, lateMin), Math.Max(0, sEnd - x), sEnd, false, rawLate);
    }

    /// <summary>Giờ làm hữu dụng (Tính năng 3.2.1). clip* chỉ dùng cho phương án B.</summary>
    public static int WorkedMinutes(EngineParams p, int i, int x, int? clipStart, int? clipEnd)
    {
        int a = i, b = x;
        if (!p.WorkedActual && clipStart.HasValue && clipEnd.HasValue)
        {
            a = Math.Max(i, clipStart.Value);
            b = Math.Min(x, clipEnd.Value);
            if (b <= a) return 0;
        }
        int lunch = p.LunchMinutes > 0 ? Overlap(a, b, p.LunchStart, p.LunchEnd) : 0;
        return Math.Max(0, b - a - lunch);
    }

    public static int Overlap(int a1, int a2, int b1, int b2) => Math.Max(0, Math.Min(a2, b2) - Math.Max(a1, b1));

    private static void SetCode(DayOutcome o, string code, IReadOnlyDictionary<string, CodeDef> codes)
    {
        o.Code = code;
        o.PaidValue = codes.TryGetValue(code, out var d) ? d.PaidValue : 0m;
    }
}

/// <summary>Tổng hợp tháng (Tính năng 3.6.1).</summary>
public static class SummaryCalculator
{
    public static MonthSummary Summarize(IEnumerable<(string? Code, int LateEarly, int Ot)> days,
        IReadOnlyDictionary<string, CodeDef> codes, decimal standardDays)
    {
        var s = new MonthSummary();
        foreach (var d in days)
        {
            s.LateEarlyMinutes += d.LateEarly;
            s.OtMinutes += d.Ot;
            if (d.Code == null || !codes.TryGetValue(d.Code, out var c)) continue;
            s.WorkDays += c.WorkValue;
            s.HolidayDays += c.HolidayValue;
            s.AnnualLeaveDays += c.AnnualLeaveValue;
            s.PaidLeaveDays += c.PaidLeaveValue;
        }
        s.PaidDays = s.WorkDays + s.HolidayDays + s.AnnualLeaveDays + s.PaidLeaveDays;
        s.UnpaidDays = Math.Max(0, standardDays - s.PaidDays);
        s.LateEarlyHours = Math.Round(s.LateEarlyMinutes / 60m, 1, MidpointRounding.AwayFromZero);
        return s;
    }

    /// <summary>Số ngày làm việc chuẩn của kỳ tính từ lịch (Q6).</summary>
    public static decimal StandardDays(IEnumerable<CalendarDay> days) => days.Sum(d => d.Type switch
    {
        DayType.Work => 1m,
        DayType.HalfWork => 0.5m,
        DayType.Holiday => 1m,
        DayType.HalfHoliday => 1m,
        DayType.CompanyOff => 1m,
        _ => 0m
    });
}
