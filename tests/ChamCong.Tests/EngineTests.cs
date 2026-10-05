using System.Security.Claims;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using ChamCong.Engine;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ChamCong.Tests;

/// <summary>Bộ ca kiểm thử mẫu Phụ lục C (giả định Q1=A, Q2=A, Q3 phạt toàn bộ từ giờ vào ca).</summary>
public class EngineTests
{
    private static readonly Dictionary<string, CodeDef> CodesMap = Codes.Defaults().ToDictionary(c => c.Code);
    private static readonly DateTime D = new(2026, 9, 7);

    private static int T(int h, int m) => h * 60 + m;

    private static EmployeeInfo Emp(EngineParams? p = null, DateTime? start = null, bool exempt = false) => new()
    {
        Id = 1, StartDate = start ?? new DateTime(2020, 1, 1), ExemptPunch = exempt, Params = p ?? new EngineParams()
    };

    private static CalendarDay Work(DateTime? d = null) => new() { Date = d ?? D, Type = DayType.Work };

    private static DayOutcome Calc(int? i, int? o, string? leave = null, CalendarDay? day = null, EmployeeInfo? emp = null) =>
        DayCalculator.Calculate(emp ?? Emp(), day ?? Work(), new Punch { In = i, Out = o }, leave, CodesMap);

    [Fact]
    public async Task ReimportPeriod4AndVerify()
    {
        var connStr = "Server=.\\SQLEXPRESS;Database=ChamCong;Trusted_Connection=True;TrustServerCertificate=True;";
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(connStr, o => o.UseCompatibilityLevel(100)).Options;
        using var db = new AppDbContext(options);
        var period = await db.Periods.FindAsync(4);
        if (period == null) return;

        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "1"),
            new Claim(ClaimTypes.Name, "admin"),
            new Claim(ClaimTypes.Role, "Admin")
        }, "TestAuth"));
        var httpAccessor = new HttpContextAccessor { HttpContext = httpContext };
        var accessService = new AccessService(db, httpAccessor);
        var auditService = new AuditService(db, httpAccessor);
        var calcService = new CalculationService(db, accessService, auditService);
        var importService = new ImportService(db, accessService, auditService);

        var filePath = @"C:\Users\ADMIN\Downloads\Dữ liệu Chấm công.xlsx";
        using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);

        var report = await importService.InspectAndImportPunchesAsync(4, fs, "Dữ liệu Chấm công.xlsx", commit: true, CancellationToken.None);
        Assert.True(report.TotalRows > 0);

        // Run calculation
        await calcService.CalculatePeriodAsync(4, resetManual: false, CancellationToken.None);

        // Verify RawPunches: NO negative numbers, InTime is populated
        var punches = await db.RawPunches.Where(p => p.PeriodId == 4).ToListAsync();
        Assert.All(punches.Where(p => p.InMin.HasValue), p => Assert.True(p.InMin >= 0 && p.InMin < 1440, $"InMin was {p.InMin}"));
        Assert.All(punches.Where(p => p.OutMin.HasValue), p => Assert.True(p.OutMin >= 0 && p.OutMin < 1440, $"OutMin was {p.OutMin}"));

        // Verify DayResults: NO negative numbers, InTime is populated
        var days = await db.DayResults.Where(d => d.PeriodId == 4).ToListAsync();
        Assert.All(days.Where(d => d.InMin.HasValue), d => Assert.True(d.InMin >= 0 && d.InMin < 1440, $"Day InMin was {d.InMin}"));
        Assert.All(days.Where(d => d.OutMin.HasValue), d => Assert.True(d.OutMin >= 0 && d.OutMin < 1440, $"Day OutMin was {d.OutMin}"));

        // Check Employee 4 (Đoan Thục) on 2026-09-17
        var dayRow = days.FirstOrDefault(d => d.EmployeeId == 4 && d.Date == new DateTime(2026, 9, 17));
        Assert.NotNull(dayRow);
        Assert.Equal("11:23:42", dayRow.InTime);
        Assert.Equal("17:32:35", dayRow.OutTime);
        Assert.Equal(683, (int)dayRow.InMin!.Value);
        Assert.Equal(1052, (int)dayRow.OutMin!.Value);
        Console.WriteLine($"SUCCESS: Emp 4 on 2026-09-17 has InTime={dayRow.InTime}, OutTime={dayRow.OutTime}, InMin={dayRow.InMin}, OutMin={dayRow.OutMin}, LateMin={dayRow.LateMinutes}, EarlyMin={dayRow.EarlyMinutes}");
    }

    [Fact] // #1 bù giờ đối xứng
    public void Case01_FlexCompensated()
    {
        var r = Calc(T(8, 31), T(17, 35));
        Assert.Equal("1", r.Code); Assert.Equal(1m, r.PaidValue); Assert.Equal(0, r.LateEarlyMinutes);
    }

    [Fact] // #2 vào sau 08:45 không được bù
    public void Case02_AfterFlexWindow()
    {
        var r = Calc(T(8, 46), T(17, 34));
        Assert.Equal("1", r.Code); Assert.Equal(46, r.LateEarlyMinutes);
    }

    [Fact] // #3 có OT
    public void Case03_Overtime()
    {
        var r = Calc(T(8, 29), T(19, 20));
        Assert.Equal("1", r.Code); Assert.Equal(0, r.LateEarlyMinutes); Assert.Equal(111, r.OtMinutes);
    }

    [Fact] // #4 giảm công và vẫn phạt phút trễ
    public void Case04_HalfDayLate()
    {
        var r = Calc(T(9, 49), T(17, 50));
        Assert.Equal("0.5", r.Code); Assert.Equal(0.5m, r.PaidValue); Assert.Equal(109, r.LateEarlyMinutes);
    }

    [Fact] // #5 nghi nghỉ sáng
    public void Case05_SuspectMorningOff()
    {
        var r = Calc(T(11, 23), T(17, 32));
        Assert.Equal("0.5", r.Code); Assert.Equal(203, r.LateEarlyMinutes);
        Assert.Contains(r.Warnings, w => w.Contains("Nghi nghỉ nửa buổi"));
    }

    [Fact] // #6 vào 12:48 không có đơn
    public void Case06_NoLeaveRequest()
    {
        var r = Calc(T(12, 48), T(18, 20));
        Assert.Equal("0.5", r.Code); Assert.Equal(288, r.LateEarlyMinutes);
        Assert.Contains(r.Warnings, w => w.Contains("Nghi nghỉ nửa buổi"));
    }

    [Fact] // #7 có đơn P/2
    public void Case07_WithHalfLeave()
    {
        var r = Calc(T(12, 48), T(18, 20), "P/2");
        Assert.Equal("P/2", r.Code); Assert.Equal(1m, r.PaidValue); Assert.Equal(0, r.LateEarlyMinutes);
    }

    [Fact] // #8 chỉ có giờ vào
    public void Case08_OnlyIn()
    {
        var r = Calc(T(7, 34), null);
        Assert.Equal("?", r.Code); Assert.Equal(0m, r.PaidValue);
    }

    [Fact] // #9 chỉ có giờ ra
    public void Case09_OnlyOut()
    {
        var r = Calc(null, T(16, 0));
        Assert.Equal("?", r.Code);
    }

    [Fact] // #10 ngày 25/09 không khai báo giờ ca riêng → phạt sớm 78
    public void Case10_EarlyLeaveWithoutCustomShift()
    {
        var r = Calc(T(6, 34), T(15, 42));
        Assert.Equal("1", r.Code); Assert.Equal(78, r.LateEarlyMinutes);
    }

    [Fact] // #10b có giờ ca riêng 08:00–15:30 → không phạt
    public void Case10b_CustomShift()
    {
        var day = new CalendarDay { Date = D, Type = DayType.Work, ShiftStart = T(8, 0), ShiftEnd = T(15, 30) };
        var r = Calc(T(6, 34), T(15, 42), day: day);
        Assert.Equal(0, r.LateEarlyMinutes);
    }

    [Fact] // #11 không quẹt
    public void Case11_NoPunch()
    {
        Assert.Equal("V", Calc(null, null).Code);
    }

    [Fact] // #12 ngày Lễ kể cả không quẹt
    public void Case12_Holiday()
    {
        var r = Calc(null, null, day: new CalendarDay { Date = new DateTime(2026, 9, 2), Type = DayType.Holiday });
        Assert.Equal("L", r.Code); Assert.Equal(1m, r.PaidValue);
    }

    [Fact] // #13 nhân viên mới, trước ngày bắt đầu → trống
    public void Case13_BeforeStartDate()
    {
        var r = Calc(T(8, 0), T(17, 0), emp: Emp(start: new DateTime(2026, 9, 14)));
        Assert.Null(r.Code); Assert.True(r.OutOfEmployment);
    }

    [Fact] // #14 ngày bị hoán đổi 09-Jan-2026 trong kỳ 26/08–25/09 → 01/09
    public void Case14_SwappedDate()
    {
        var c = DataCleaner.DateCandidates(new DateTime(2026, 1, 9));
        var res = DataCleaner.ResolveDates(new List<(string, List<DateTime>)> { ("1", c) }, new DateTime(2026, 8, 26), new DateTime(2026, 9, 25));
        Assert.Equal(new DateTime(2026, 9, 1), res[0]);
    }

    [Fact]
    public void TextDate_MDY()
    {
        var c = DataCleaner.DateCandidates("8/26/2026");
        var res = DataCleaner.ResolveDates(new List<(string, List<DateTime>)> { ("1", c) }, new DateTime(2026, 8, 26), new DateTime(2026, 9, 25));
        Assert.Equal(new DateTime(2026, 8, 26), res[0]);
    }

    [Fact]
    public void Grace_NotLate()
    {
        var r = Calc(T(8, 7), T(17, 0));
        Assert.Equal(0, r.LateEarlyMinutes);
    }

    [Fact] // Q2 = A: vào 08:35, ra 17:20 → phạt 15 phút
    public void Flex_Shortfall()
    {
        Assert.Equal(15, Calc(T(8, 35), T(17, 20)).LateEarlyMinutes);
        var pB = new EngineParams { ShortfallOnly = false };
        Assert.Equal(35, Calc(T(8, 35), T(17, 20), emp: Emp(pB)).LateEarlyMinutes);
    }

    [Fact] // Q1: vào 09:00 ra 18:30 → A: 1.0; B: 0.5
    public void WorkedHoursModes()
    {
        Assert.Equal("1", Calc(T(9, 0), T(18, 30)).Code);
        var pB = new EngineParams { WorkedActual = false };
        Assert.Equal("0.5", Calc(T(9, 0), T(18, 30), emp: Emp(pB)).Code);
    }

    [Fact]
    public void LunchOverlapPartial()
    {
        Assert.Equal(T(5, 20), DayCalculator.WorkedMinutes(new EngineParams(), T(12, 48), T(18, 20), null, null));
    }

    [Fact]
    public void ExemptPunch()
    {
        Assert.Equal("1", Calc(null, null, emp: Emp(exempt: true)).Code);
    }

    [Fact]
    public void Summary_SampleNumbers()
    {
        var days = new List<(string?, int, int)>();
        for (int i = 0; i < 21; i++) days.Add(("1", 0, 0));
        days.Add(("L", 0, 0)); days.Add(("L", 0, 0)); days.Add(("P", 65, 0)); days.Add(("P", 0, 0));
        var s = SummaryCalculator.Summarize(days, CodesMap, 25);
        Assert.Equal(21, s.WorkDays); Assert.Equal(2, s.HolidayDays); Assert.Equal(2, s.AnnualLeaveDays);
        Assert.Equal(25, s.PaidDays); Assert.Equal(0, s.UnpaidDays); Assert.Equal(1.1m, s.LateEarlyHours);
    }

    [Fact]
    public void Summary_NewEmployee()
    {
        var days = Enumerable.Range(0, 9).Select(_ => ((string?)"1", 0, 0)).ToList();
        var s = SummaryCalculator.Summarize(days, CodesMap, 25);
        Assert.Equal(16, s.UnpaidDays);
    }

    [Fact]
    public void Ledger_OrderAndNoNegative()
    {
        var warnings = new Dictionary<DateTime, List<string>>();
        var lines = LeaveLedgerCalculator.Allocate(
            new[] { (new DateTime(2026, 9, 1), "P"), (new DateTime(2026, 9, 2), "P"), (new DateTime(2026, 9, 3), "BL") },
            CodesMap, _ => new LeaveBalance { Carry = 0.5m, Annual = 1m, Comp = 0 }, warnings);
        Assert.Equal(-0.5m, lines.Where(l => l.Fund == "CARRY").Sum(l => l.Amount));
        Assert.Equal(-1m, lines.Where(l => l.Fund == "ANNUAL").Sum(l => l.Amount));
        Assert.True(warnings.ContainsKey(new DateTime(2026, 9, 2)));
        Assert.True(warnings.ContainsKey(new DateTime(2026, 9, 3)));
    }

    [Fact]
    public void ExportAttendanceSheet_CreatesTwoSheets_WithTimesNewRoman()
    {
        var exportService = new ChamCong.Api.Services.ExcelExportService();
        var company = new ChamCong.Api.Data.Company { Id = 1, Code = "SB", Name = "Superbrain Headquarters" };
        var period = new ChamCong.Api.Data.Period
        {
            Id = 1,
            CompanyId = 1,
            Month = 9,
            Year = 2026,
            FromDate = new DateTime(2026, 9, 1),
            ToDate = new DateTime(2026, 9, 30),
            StandardDays = 25
        };
        var employees = new List<ChamCong.Api.Data.Employee>
        {
            new ChamCong.Api.Data.Employee { Id = 1, EmployeeCode = "SB001", FullName = "Nguyễn Văn A", CompanyId = 1 }
        };
        var departments = new Dictionary<int, ChamCong.Api.Data.Department>();
        var dayResults = new List<ChamCong.Api.Data.DayResult>();
        var notes = new Dictionary<int, string>();
        var codes = new Dictionary<string, ChamCong.Engine.CodeDef>();

        var bytes = exportService.ExportAttendanceSheet(company, period, employees, departments, dayResults, notes, codes, isDraft: true);
        Assert.NotNull(bytes);
        Assert.True(bytes.Length > 0);

        using var ms = new MemoryStream(bytes);
        using var wb = new ClosedXML.Excel.XLWorkbook(ms);

        Assert.Equal(2, wb.Worksheets.Count);
        Assert.True(wb.Worksheets.Contains("Chấm công"));
        Assert.True(wb.Worksheets.Contains("Đi trễ về sớm"));

        var ws1 = wb.Worksheet("Chấm công");
        var ws2 = wb.Worksheet("Đi trễ về sớm");

        Assert.Equal("Times New Roman", ws1.Style.Font.FontName);
        Assert.Equal("Times New Roman", ws2.Style.Font.FontName);
    }
}
