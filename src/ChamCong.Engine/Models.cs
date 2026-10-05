namespace ChamCong.Engine;

/// <summary>Loại ngày theo lịch làm việc (Thực thể: Lịch làm việc).</summary>
public enum DayType : byte
{
    Work = 1,          // Làm việc cả ngày
    HalfWork = 2,      // Làm nửa ngày (vd: sáng Thứ 7)
    WeeklyOff = 3,     // Nghỉ tuần
    Holiday = 4,       // Lễ cả ngày
    HalfHoliday = 5,   // Lễ nửa ngày
    CompanyOff = 6     // Nghỉ toàn công ty
}

public enum FundType : byte
{
    None = 0,
    Annual = 1,   // Phép năm (trừ phép tồn năm trước trước, sau đó phép năm hiện tại)
    Comp = 2      // Quỹ bù (Lễ Tết / sự kiện)
}

/// <summary>Định nghĩa một mã ký hiệu chấm công (Bảng quy chuẩn).</summary>
public sealed class CodeDef
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>Phần đóng góp vào cột "Số ngày làm ca 1, HC" (H).</summary>
    public decimal WorkValue { get; set; }
    /// <summary>Phần đóng góp vào cột "Ngày lễ" (I).</summary>
    public decimal HolidayValue { get; set; }
    /// <summary>Phần đóng góp vào cột "Nghỉ phép năm" (K).</summary>
    public decimal AnnualLeaveValue { get; set; }
    /// <summary>Phần đóng góp vào cột "Nghỉ hưởng lương" (L).</summary>
    public decimal PaidLeaveValue { get; set; }
    public FundType FundType { get; set; }
    public decimal FundDeduct { get; set; }
    /// <summary>Mã nghỉ nửa ngày, yêu cầu làm thực tế ≥ ngưỡng nửa công.</summary>
    public bool IsHalfLeave { get; set; }
    public string? Color { get; set; }
    public int SortOrder { get; set; }
    public bool IsSystem { get; set; }
    public string? Condition { get; set; }

    public decimal PaidValue => WorkValue + HolidayValue + AnnualLeaveValue + PaidLeaveValue;
}

/// <summary>Các mã engine dùng trực tiếp — không được xóa/đổi mã.</summary>
public static class Codes
{
    public const string Full = "1";
    public const string Half = "0.5";
    public const string Holiday = "L";
    public const string HalfHoliday = "L/2";
    public const string Annual = "P";
    public const string AnnualHalf = "P/2";
    public const string AnnualHalfUnpaid = "P/2K";
    public const string Comp = "BL";
    public const string CompHalf = "BL/2";
    public const string Absent = "N";
    public const string UnpaidLeave = "NL";
    public const string PaidLeave = "K";
    public const string Missing = "?";
    public const string Vacant = "V";

    public static readonly string[] SystemCodes =
    {
        Full, Half, Holiday, HalfHoliday, Annual, AnnualHalf, AnnualHalfUnpaid,
        Comp, CompHalf, Absent, UnpaidLeave, PaidLeave, Missing, Vacant
    };

    public static bool NeedsExplanation(string? code) => code == Missing || code == Vacant;

    /// <summary>Bảng mã mặc định khởi tạo từ file Excel (13 dòng; ?/V tách 2 mã).</summary>
    public static List<CodeDef> Defaults() => new()
    {
        new() { Code = Full, Name = "Đi làm đủ ngày công", WorkValue = 1m, SortOrder = 1, IsSystem = true,
            Condition = "Quẹt vào/ra đủ ≥ 7.5h hoặc đạt chuẩn bù giờ Flexitime" },
        new() { Code = Half, Name = "Đi làm nửa ngày công", WorkValue = 0.5m, SortOrder = 2, IsSystem = true,
            Condition = "Làm thực tế từ 3.5h đến dưới 7.5h", Color = "FFF2CC" },
        new() { Code = Holiday, Name = "Nghỉ Lễ/Tết hưởng lương", HolidayValue = 1m, SortOrder = 3, IsSystem = true,
            Condition = "Trùng ngày nghỉ Lễ quốc gia", Color = "F4B7BE" },
        new() { Code = HalfHoliday, Name = "Nghỉ Lễ nửa ngày", HolidayValue = 0.5m, WorkValue = 0.5m, IsHalfLeave = true,
            SortOrder = 4, IsSystem = true, Condition = "Lễ nửa ngày + quẹt thẻ làm thực tế ≥ 3.5h", Color = "F4B7BE" },
        new() { Code = Annual, Name = "Nghỉ phép năm cả ngày", AnnualLeaveValue = 1m, FundType = FundType.Annual, FundDeduct = 1m,
            SortOrder = 5, IsSystem = true, Condition = "Có đơn nghỉ phép năm được duyệt trước kỳ chốt", Color = "EF949F" },
        new() { Code = AnnualHalf, Name = "Nghỉ phép năm 1/2 ngày", AnnualLeaveValue = 0.5m, WorkValue = 0.5m, IsHalfLeave = true,
            FundType = FundType.Annual, FundDeduct = 0.5m, SortOrder = 6, IsSystem = true,
            Condition = "Nghỉ phép 0.5 + quẹt thẻ làm việc ≥ 3.5h", Color = "F8C9CF" },
        new() { Code = AnnualHalfUnpaid, Name = "Nghỉ 0.5 phép + 0.5 trừ lương", AnnualLeaveValue = 0.5m,
            FundType = FundType.Annual, FundDeduct = 0.5m, SortOrder = 7, IsSystem = true,
            Condition = "Nghỉ cả ngày nhưng chỉ còn/chỉ xin 0.5 ngày phép", Color = "F8C9CF" },
        new() { Code = Comp, Name = "Nghỉ bù Lễ Tết/Sự kiện", AnnualLeaveValue = 1m, FundType = FundType.Comp, FundDeduct = 1m,
            SortOrder = 8, IsSystem = true, Condition = "Có đơn nghỉ bù từ quỹ hỗ trợ workshop, cuộc thi ngoài giờ", Color = "D9C2EC" },
        new() { Code = CompHalf, Name = "Nghỉ bù 1/2 ngày", AnnualLeaveValue = 0.5m, WorkValue = 0.5m, IsHalfLeave = true,
            FundType = FundType.Comp, FundDeduct = 0.5m, SortOrder = 9, IsSystem = true,
            Condition = "Nghỉ bù 0.5 + đi làm thực tế ≥ 3.5h", Color = "E8DAF4" },
        new() { Code = Absent, Name = "Nghỉ việc không xin phép", SortOrder = 10, IsSystem = true,
            Condition = "Nghỉ không lương có đơn hoặc vắng mặt không phép", Color = "BFBFBF" },
        new() { Code = UnpaidLeave, Name = "Nghỉ phép không hưởng lương", SortOrder = 11, IsSystem = true,
            Condition = "Chế độ nghỉ không hưởng lương theo Luật Lao động", Color = "D9D9D9" },
        new() { Code = PaidLeave, Name = "Nghỉ phép có hưởng lương", PaidLeaveValue = 1m, SortOrder = 12, IsSystem = true,
            Condition = "Chế độ nghỉ có hưởng lương theo Luật Lao động", Color = "C6E0B4" },
        new() { Code = Missing, Name = "Nghi vấn thiếu quẹt", SortOrder = 13, IsSystem = true,
            Condition = "Chỉ có 1 lượt quẹt; xuất danh sách giải trình", Color = "FFD966" },
        new() { Code = Vacant, Name = "Vắng (không quẹt)", SortOrder = 14, IsSystem = true,
            Condition = "Không có lượt quẹt nào; xuất danh sách giải trình", Color = "F4B183" },
    };
}

/// <summary>Thông tin ngày theo lịch của hội sở.</summary>
public sealed class CalendarDay
{
    public DateTime Date { get; set; }
    public DayType Type { get; set; }
    /// <summary>"AM" | "PM" cho Lễ nửa ngày / Làm nửa ngày.</summary>
    public string? HalfSession { get; set; }
    public int? ShiftStart { get; set; }
    public int? ShiftEnd { get; set; }
    public string? CompanyOffCode { get; set; }
    public string? Note { get; set; }
}

public sealed class EmployeeInfo
{
    public int Id { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public bool ExemptPunch { get; set; }
    public EngineParams Params { get; set; } = new();
}

public sealed class Punch
{
    public int? In { get; set; }   // phút trong ngày
    public int? Out { get; set; }
}

public sealed class DayOutcome
{
    public DateTime Date { get; set; }
    /// <summary>null = để trống (không tính công).</summary>
    public string? Code { get; set; }
    public decimal PaidValue { get; set; }
    public int? WorkedMinutes { get; set; }
    public int LateMinutes { get; set; }
    public int EarlyMinutes { get; set; }
    public int OtMinutes { get; set; }
    public bool OutOfEmployment { get; set; }
    public List<string> Warnings { get; } = new();

    public int LateEarlyMinutes => LateMinutes + EarlyMinutes;
}

public sealed class MonthSummary
{
    public decimal WorkDays { get; set; }        // H (= J)
    public decimal HolidayDays { get; set; }     // I
    public decimal AnnualLeaveDays { get; set; } // K
    public decimal PaidLeaveDays { get; set; }   // L
    public decimal UnpaidDays { get; set; }      // M
    public decimal PaidDays { get; set; }        // N
    public int LateEarlyMinutes { get; set; }
    public decimal LateEarlyHours { get; set; }
    public int OtMinutes { get; set; }
}
