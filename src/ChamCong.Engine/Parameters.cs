using System.Globalization;

namespace ChamCong.Engine;

public enum ParamType { Int, Decimal, Time, TimeRange, Enum, Bool }

public sealed record ParamOption(string Value, string Label);

public sealed class ParamDef
{
    public string Code { get; init; } = "";
    public string Group { get; init; } = "";
    public string Name { get; init; } = "";
    public ParamType Type { get; init; }
    public string Default { get; init; } = "";
    public string Description { get; init; } = "";
    public decimal? Min { get; init; }
    public decimal? Max { get; init; }
    public ParamOption[] Options { get; init; } = Array.Empty<ParamOption>();
    /// <summary>Chỉ cấu hình ở mức hệ thống/hội sở (không theo khối).</summary>
    public bool CompanyOnly { get; init; }
}

/// <summary>Danh mục tham số (Bảng cấu hình tham số quản trị đa hội sở) + tham số chốt Q1–Q16.</summary>
public static class ParamCatalog
{
    public const string ShiftStandardHours = "SHIFT_STANDARD_HOURS";
    public const string LunchBreakStart = "LUNCH_BREAK_START";
    public const string LunchBreakMinutes = "LUNCH_BREAK_MINUTES";
    public const string FlexitimeMode = "FLEXITIME_MODE";
    public const string FlexInWindow = "FLEX_IN_WINDOW";
    public const string FlexOutWindow = "FLEX_OUT_WINDOW";
    public const string GracePeriodMinutes = "GRACE_PERIOD_MINUTES";
    public const string MinHoursFullDay = "MIN_HOURS_FULL_DAY";
    public const string MinHoursHalfDay = "MIN_HOURS_HALF_DAY";
    public const string SaturdayWorkPolicy = "SATURDAY_WORK_POLICY";
    public const string OtEnabled = "OT_ENABLED";
    public const string OtTriggerThresholdMin = "OT_TRIGGER_THRESHOLD_MIN";
    public const string MissingPunchPolicy = "MISSING_PUNCH_POLICY";
    public const string WorkedHoursMode = "WORKED_HOURS_MODE";
    public const string FlexShortfallMode = "FLEX_SHORTFALL_MODE";
    public const string LatePenaltyMode = "LATE_PENALTY_MODE";
    public const string PenalizeLateOnHalfDay = "PENALIZE_LATE_ON_HALF_DAY";
    public const string EarlyInCompensation = "EARLY_IN_COMPENSATION";
    public const string HalfDaySuspectMinutes = "HALF_DAY_SUSPECT_MINUTES";
    public const string PeriodStartDay = "PERIOD_START_DAY";

    public static readonly IReadOnlyList<ParamDef> All = new List<ParamDef>
    {
        new() { Code = ShiftStandardHours, Group = "Ca làm việc", Name = "Khung giờ ca chuẩn", Type = ParamType.TimeRange,
            Default = "08:00-17:00", Description = "Giờ vào (S) – giờ ra (E) ca hành chính." },
        new() { Code = LunchBreakStart, Group = "Ca làm việc", Name = "Giờ bắt đầu nghỉ trưa", Type = ParamType.Time,
            Default = "12:00", Description = "Khung nghỉ trưa bắt đầu lúc này, kéo dài LUNCH_BREAK_MINUTES phút." },
        new() { Code = LunchBreakMinutes, Group = "Ca làm việc", Name = "Giờ nghỉ trưa cố định (phút)", Type = ParamType.Int,
            Default = "60", Min = 0, Max = 240, Description = "Chỉ trừ phần giao giữa giờ làm thực tế và khung nghỉ trưa." },
        new() { Code = FlexitimeMode, Group = "Flexitime", Name = "Chế độ Flexitime", Type = ParamType.Enum, Default = "ON",
            Options = new[] { new ParamOption("ON", "Kích hoạt (bù giờ đối xứng)"), new ParamOption("OFF", "Không áp dụng") },
            Description = "Vào trễ trong khung linh hoạt thì ra muộn tương ứng được tính đủ công, 0 phút trễ." },
        new() { Code = FlexInWindow, Group = "Flexitime", Name = "Khung giờ vào linh hoạt", Type = ParamType.TimeRange,
            Default = "08:00-08:45", Description = "Phải bắt đầu từ giờ vào ca chuẩn." },
        new() { Code = FlexOutWindow, Group = "Flexitime", Name = "Khung giờ ra bù giờ", Type = ParamType.TimeRange,
            Default = "17:00-17:45", Description = "Giờ ra bù không vượt quá cuối khung này." },
        new() { Code = GracePeriodMinutes, Group = "Flexitime", Name = "Thời gian du di (phút)", Type = ParamType.Int,
            Default = "10", Min = 0, Max = 120, Description = "Vào trễ không quá số phút này thì không bị coi là đi trễ. 0 = không áp dụng." },
        new() { Code = MinHoursFullDay, Group = "Ngưỡng công", Name = "Ngưỡng tính đủ 1.0 công (giờ)", Type = ParamType.Decimal,
            Default = "7.5", Min = 0, Max = 24 },
        new() { Code = MinHoursHalfDay, Group = "Ngưỡng công", Name = "Ngưỡng tính nửa công 0.5 (giờ)", Type = ParamType.Decimal,
            Default = "3.5", Min = 0, Max = 24, Description = "Phải nhỏ hơn ngưỡng đủ công." },
        new() { Code = SaturdayWorkPolicy, Group = "Lịch", Name = "Chế độ làm việc Thứ 7", Type = ParamType.Enum, Default = "HALF",
            Options = new[] { new ParamOption("HALF", "Làm sáng Thứ 7 (0.5)"), new ParamOption("FULL", "Làm cả ngày Thứ 7"), new ParamOption("OFF", "Nghỉ Thứ 7") },
            Description = "Dùng khi tạo nhanh lịch năm; lịch từng ngày là nguồn chính (Q5).", CompanyOnly = true },
        new() { Code = OtEnabled, Group = "Làm thêm giờ", Name = "Tính OT", Type = ParamType.Bool, Default = "true",
            Description = "Tắt cho khối không tính OT (Part-time/Tạp vụ)." },
        new() { Code = OtTriggerThresholdMin, Group = "Làm thêm giờ", Name = "Ngưỡng kích hoạt OT (phút)", Type = ParamType.Int,
            Default = "30", Min = 0, Max = 600 },
        new() { Code = MissingPunchPolicy, Group = "Bất thường", Name = "Xử lý quên quẹt (1 lần)", Type = ParamType.Enum, Default = "WARN",
            Options = new[] { new ParamOption("WARN", "Gán cảnh báo (?)") } },
        new() { Code = WorkedHoursMode, Group = "Quy tắc tính (Q1–Q4)", Name = "Cách tính giờ làm hữu dụng (Q1)", Type = ParamType.Enum, Default = "ACTUAL",
            Options = new[] { new ParamOption("ACTUAL", "A: (ra − vào) trừ nghỉ trưa"), new ParamOption("SHIFT_CLIPPED", "B: cắt theo khung ca + bù Flexitime") } },
        new() { Code = FlexShortfallMode, Group = "Quy tắc tính (Q1–Q4)", Name = "Vào khung linh hoạt nhưng ra không đủ bù (Q2)", Type = ParamType.Enum, Default = "SHORTFALL",
            Options = new[] { new ParamOption("SHORTFALL", "A: chỉ phạt phần thiếu"), new ParamOption("FULL_LATE", "B: phạt toàn bộ phút trễ") } },
        new() { Code = LatePenaltyMode, Group = "Quy tắc tính (Q1–Q4)", Name = "Phút trễ khi không được bù (Q3)", Type = ParamType.Enum, Default = "FROM_SHIFT_START",
            Options = new[] { new ParamOption("FROM_SHIFT_START", "Tính từ giờ vào ca"), new ParamOption("AFTER_GRACE", "Chỉ phần vượt du di") } },
        new() { Code = PenalizeLateOnHalfDay, Group = "Quy tắc tính (Q1–Q4)", Name = "Ngày 0.5 công vẫn tính phút trễ/sớm (Q3)", Type = ParamType.Bool, Default = "true" },
        new() { Code = EarlyInCompensation, Group = "Quy tắc tính (Q1–Q4)", Name = "Vào sớm được bù về sớm (Q4)", Type = ParamType.Bool, Default = "false" },
        new() { Code = HalfDaySuspectMinutes, Group = "Bất thường", Name = "Ngưỡng nghi nghỉ nửa buổi (phút trễ/sớm)", Type = ParamType.Int,
            Default = "120", Min = 0, Max = 600, Description = "Ngày 0.5 công có phút trễ hoặc sớm từ ngưỡng này trở lên sẽ được cảnh báo đối chiếu đơn nghỉ." },
        new() { Code = PeriodStartDay, Group = "Kỳ công", Name = "Ngày bắt đầu kỳ công", Type = ParamType.Int, Default = "26", Min = 1, Max = 28,
            Description = "Kỳ tháng M chạy từ ngày này của tháng M-1 đến ngày trước đó của tháng M (mặc định 26 → 25). Đặt 1 để chạy theo tháng dương lịch.", CompanyOnly = true },
    };

    public static ParamDef? Find(string code) => All.FirstOrDefault(p => p.Code == code);

    /// <summary>Giá trị mặc định theo khối (seed từ Bảng cấu hình tham số).</summary>
    public static Dictionary<string, string> GroupDefaults(string groupCode) => groupCode switch
    {
        "PARTTIME" => new()
        {
            [LunchBreakMinutes] = "0",
            [FlexitimeMode] = "OFF",
            [GracePeriodMinutes] = "10",
            [OtEnabled] = "false",
        },
        "REMOTE" => new()
        {
            [LunchBreakMinutes] = "0",
            [FlexitimeMode] = "ON",
            [FlexInWindow] = "00:00-23:59",
            [FlexOutWindow] = "00:00-23:59",
            [GracePeriodMinutes] = "0",
            [OtEnabled] = "false",
        },
        _ => new()
    };

    /// <summary>Kiểm tra một giá trị; trả về thông báo lỗi hoặc null.</summary>
    public static string? Validate(ParamDef def, string value)
    {
        value = value.Trim();
        switch (def.Type)
        {
            case ParamType.Int:
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)) return "Phải là số nguyên";
                if (def.Min.HasValue && i < def.Min) return $"Không nhỏ hơn {def.Min}";
                if (def.Max.HasValue && i > def.Max) return $"Không lớn hơn {def.Max}";
                return null;
            case ParamType.Decimal:
                if (!decimal.TryParse(value.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var d)) return "Phải là số";
                if (def.Min.HasValue && d < def.Min) return $"Không nhỏ hơn {def.Min}";
                if (def.Max.HasValue && d > def.Max) return $"Không lớn hơn {def.Max}";
                return null;
            case ParamType.Time:
                return TimeUtil.TryParseHm(value, out _) ? null : "Định dạng HH:mm";
            case ParamType.TimeRange:
                if (!TimeUtil.TryParseRange(value, out var a, out var b)) return "Định dạng HH:mm-HH:mm";
                return a < b ? null : "Giờ bắt đầu phải nhỏ hơn giờ kết thúc";
            case ParamType.Enum:
                return def.Options.Any(o => o.Value == value) ? null : "Giá trị không nằm trong danh sách";
            case ParamType.Bool:
                return value is "true" or "false" ? null : "Chỉ nhận true/false";
        }
        return null;
    }
}

/// <summary>Tham số đã phân giải (Khối → Hội sở → Mặc định), kiểu mạnh cho engine.</summary>
public sealed class EngineParams
{
    public int ShiftStart { get; set; } = 8 * 60;
    public int ShiftEnd { get; set; } = 17 * 60;
    public int LunchStart { get; set; } = 12 * 60;
    public int LunchMinutes { get; set; } = 60;
    public bool Flexitime { get; set; } = true;
    public int FlexInStart { get; set; } = 8 * 60;
    public int FlexInEnd { get; set; } = 8 * 60 + 45;
    public int FlexOutStart { get; set; } = 17 * 60;
    public int FlexOutEnd { get; set; } = 17 * 60 + 45;
    public int GraceMinutes { get; set; } = 10;
    public decimal MinHoursFull { get; set; } = 7.5m;
    public decimal MinHoursHalf { get; set; } = 3.5m;
    public bool OtEnabled { get; set; } = true;
    public int OtThreshold { get; set; } = 30;
    public bool WorkedActual { get; set; } = true;          // Q1 = A
    public bool ShortfallOnly { get; set; } = true;         // Q2 = A
    public bool LateFromShiftStart { get; set; } = true;    // Q3
    public bool PenalizeLateOnHalfDay { get; set; } = true; // Q3
    public bool EarlyInCompensation { get; set; }           // Q4
    public int HalfDaySuspectMinutes { get; set; } = 120;

    public int LunchEnd => LunchStart + LunchMinutes;

    public static EngineParams FromValues(IReadOnlyDictionary<string, string> v)
    {
        string Get(string code) => v.TryGetValue(code, out var s) && !string.IsNullOrWhiteSpace(s)
            ? s.Trim() : ParamCatalog.Find(code)!.Default;
        int Int(string code) => int.Parse(Get(code), CultureInfo.InvariantCulture);
        decimal Dec(string code) => decimal.Parse(Get(code).Replace(',', '.'), CultureInfo.InvariantCulture);
        bool Bool(string code) => Get(code) == "true";

        var p = new EngineParams();
        TimeUtil.TryParseRange(Get(ParamCatalog.ShiftStandardHours), out var s, out var e);
        p.ShiftStart = s; p.ShiftEnd = e;
        TimeUtil.TryParseHm(Get(ParamCatalog.LunchBreakStart), out var ls);
        p.LunchStart = ls;
        p.LunchMinutes = Int(ParamCatalog.LunchBreakMinutes);
        p.Flexitime = Get(ParamCatalog.FlexitimeMode) == "ON";
        TimeUtil.TryParseRange(Get(ParamCatalog.FlexInWindow), out var fi1, out var fi2);
        p.FlexInStart = fi1; p.FlexInEnd = fi2;
        TimeUtil.TryParseRange(Get(ParamCatalog.FlexOutWindow), out var fo1, out var fo2);
        p.FlexOutStart = fo1; p.FlexOutEnd = fo2;
        p.GraceMinutes = Int(ParamCatalog.GracePeriodMinutes);
        p.MinHoursFull = Dec(ParamCatalog.MinHoursFullDay);
        p.MinHoursHalf = Dec(ParamCatalog.MinHoursHalfDay);
        p.OtEnabled = Bool(ParamCatalog.OtEnabled);
        p.OtThreshold = Int(ParamCatalog.OtTriggerThresholdMin);
        p.WorkedActual = Get(ParamCatalog.WorkedHoursMode) != "SHIFT_CLIPPED";
        p.ShortfallOnly = Get(ParamCatalog.FlexShortfallMode) != "FULL_LATE";
        p.LateFromShiftStart = Get(ParamCatalog.LatePenaltyMode) != "AFTER_GRACE";
        p.PenalizeLateOnHalfDay = Bool(ParamCatalog.PenalizeLateOnHalfDay);
        p.EarlyInCompensation = Bool(ParamCatalog.EarlyInCompensation);
        p.HalfDaySuspectMinutes = Int(ParamCatalog.HalfDaySuspectMinutes);
        return p;
    }
}

public static class TimeUtil
{
    public static bool TryParseHm(string? s, out int minutes)
    {
        minutes = 0;
        if (string.IsNullOrWhiteSpace(s)) return false;
        var parts = s.Trim().Split(':');
        if (parts.Length < 2) return false;
        if (!int.TryParse(parts[0], out var h) || !int.TryParse(parts[1], out var m)) return false;
        if (h < 0 || h > 23 || m < 0 || m > 59) return false;
        minutes = h * 60 + m;
        return true;
    }

    public static bool TryParseRange(string? s, out int start, out int end)
    {
        start = end = 0;
        if (string.IsNullOrWhiteSpace(s)) return false;
        var parts = s.Replace("–", "-").Split('-', StringSplitOptions.TrimEntries);
        return parts.Length == 2 && TryParseHm(parts[0], out start) && TryParseHm(parts[1], out end);
    }

    /// <summary>Format HH:mm:ss cho hiển thị giờ vào - ra chấm công.</summary>
    public static string Format(int? minutes)
    {
        if (minutes is null || minutes < 0 || minutes >= 1440) return "";
        return $"{minutes.Value / 60:00}:{minutes.Value % 60:00}:00";
    }

    /// <summary>Format HH:mm cho ca làm việc hoặc cấu hình tham số.</summary>
    public static string FormatHm(int? minutes)
    {
        if (minutes is null || minutes < 0 || minutes >= 1440) return "";
        return $"{minutes.Value / 60:00}:{minutes.Value % 60:00}";
    }
}
