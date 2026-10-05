using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Engine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/companies/{companyId}/calendar")]
[Authorize]
public class CalendarController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public CalendarController(AppDbContext db, AccessService access, AuditService audit)
    {
        _db = db;
        _access = access;
        _audit = audit;
    }

    public record CalendarDayDto(
        int Id,
        DateTime Date,
        byte DayType,
        string? HalfSession,
        short? ShiftStart,
        short? ShiftEnd,
        string? ShiftStartText,
        string? ShiftEndText,
        string? CompanyOffCode,
        string? Note);

    [HttpGet]
    public async Task<IActionResult> GetDays(int companyId, [FromQuery] DateTime from, [FromQuery] DateTime to, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);

        var list = await _db.CalendarDays
            .AsNoTracking()
            .Where(c => c.CompanyId == companyId && c.Date >= from.Date && c.Date <= to.Date)
            .OrderBy(c => c.Date)
            .Select(c => new CalendarDayDto(
                c.Id,
                c.Date,
                c.DayType,
                c.HalfSession,
                c.ShiftStart,
                c.ShiftEnd,
                TimeUtil.FormatHm(c.ShiftStart),
                TimeUtil.FormatHm(c.ShiftEnd),
                c.CompanyOffCode,
                c.Note
            ))
            .ToListAsync(ct);

        return Ok(list);
    }

    public record SaveDayDto(
        DateTime Date,
        byte DayType,
        string? HalfSession,
        string? ShiftStartTime,
        string? ShiftEndTime,
        string? CompanyOffCode,
        string? Note);

    [HttpPost("save-day")]
    public async Task<IActionResult> SaveDay(int companyId, [FromBody] SaveDayDto dto, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var date = dto.Date.Date;

        // Kiểm tra xem ngày có thuộc kỳ đã chốt không
        var closedPeriod = await _db.Periods.AnyAsync(p => p.CompanyId == companyId && p.Status == PeriodStatus.Closed && date >= p.FromDate && date <= p.ToDate, ct);
        if (closedPeriod)
        {
            return BadRequest(new { message = $"Không thể thay đổi lịch của ngày {date:dd/MM/yyyy} vì thuộc kỳ công đã chốt." });
        }

        short? sStart = null, sEnd = null;
        if (!string.IsNullOrWhiteSpace(dto.ShiftStartTime) && TimeUtil.TryParseHm(dto.ShiftStartTime, out var ss))
        {
            sStart = (short)ss;
        }
        if (!string.IsNullOrWhiteSpace(dto.ShiftEndTime) && TimeUtil.TryParseHm(dto.ShiftEndTime, out var se))
        {
            sEnd = (short)se;
        }

        var existing = await _db.CalendarDays.FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Date == date, ct);
        if (existing != null)
        {
            existing.DayType = dto.DayType;
            existing.HalfSession = dto.HalfSession;
            existing.ShiftStart = sStart;
            existing.ShiftEnd = sEnd;
            existing.CompanyOffCode = dto.CompanyOffCode;
            existing.Note = Text.Clean(dto.Note, 200);
        }
        else
        {
            _db.CalendarDays.Add(new CalendarDayEntity
            {
                CompanyId = companyId,
                Date = date,
                DayType = dto.DayType,
                HalfSession = dto.HalfSession,
                ShiftStart = sStart,
                ShiftEnd = sEnd,
                CompanyOffCode = dto.CompanyOffCode,
                Note = Text.Clean(dto.Note, 200)
            });
        }

        _audit.Log("CalendarDay", date.ToString("yyyy-MM-dd"), "SaveDay", new { companyId, date, type = dto.DayType, note = dto.Note }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Lưu lịch làm việc thành công." });
    }

    public record BatchGenerateDto(
        int Year,
        string? MondayPolicy,
        string? TuesdayPolicy,
        string? WednesdayPolicy,
        string? ThursdayPolicy,
        string? FridayPolicy,
        string? SaturdayPolicy,
        string? SundayPolicy,
        string? WorkScheduleType,
        bool OverwriteExisting = false);

    [HttpPost("batch-generate")]
    public async Task<IActionResult> BatchGenerate(int companyId, [FromBody] BatchGenerateDto dto, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        int year = dto.Year;
        if (year < 2020 || year > 2040) return BadRequest(new { message = "Năm không hợp lệ." });

        var scheduleType = dto.WorkScheduleType ?? "STANDARD_T2_T6_T7_HALF";
        var monPolicy = dto.MondayPolicy;
        var tuePolicy = dto.TuesdayPolicy;
        var wedPolicy = dto.WednesdayPolicy;
        var thuPolicy = dto.ThursdayPolicy;
        var friPolicy = dto.FridayPolicy;
        var satPolicy = dto.SaturdayPolicy;
        var sunPolicy = dto.SundayPolicy;

        // Nếu người dùng chọn mẫu nhanh và chưa chỉ định từng ngày, tự động điền theo mẫu
        if (scheduleType == "MON_TO_SAT_FULL")
        {
            monPolicy ??= "FULL";
            tuePolicy ??= "FULL";
            wedPolicy ??= "FULL";
            thuPolicy ??= "FULL";
            friPolicy ??= "FULL";
            satPolicy ??= "FULL";
            sunPolicy ??= "OFF";
        }
        else if (scheduleType == "MON_TO_FRI_FULL")
        {
            monPolicy ??= "FULL";
            tuePolicy ??= "FULL";
            wedPolicy ??= "FULL";
            thuPolicy ??= "FULL";
            friPolicy ??= "FULL";
            satPolicy ??= "OFF";
            sunPolicy ??= "OFF";
        }
        else if (scheduleType == "T2_T6_T7_ALTERNATE")
        {
            monPolicy ??= "FULL";
            tuePolicy ??= "FULL";
            wedPolicy ??= "FULL";
            thuPolicy ??= "FULL";
            friPolicy ??= "FULL";
            satPolicy ??= "ALTERNATE_OFF";
            sunPolicy ??= "OFF";
        }
        else if (scheduleType == "T3_CN_FULL")
        {
            monPolicy ??= "OFF";
            tuePolicy ??= "FULL";
            wedPolicy ??= "FULL";
            thuPolicy ??= "FULL";
            friPolicy ??= "FULL";
            satPolicy ??= "FULL";
            sunPolicy ??= "FULL";
        }
        else if (scheduleType == "T3_CN_T7_HALF")
        {
            monPolicy ??= "OFF";
            tuePolicy ??= "FULL";
            wedPolicy ??= "FULL";
            thuPolicy ??= "FULL";
            friPolicy ??= "FULL";
            satPolicy ??= "HALF";
            sunPolicy ??= "FULL";
        }
        else
        {
            // Mặc định: Thứ 2 - Thứ 6 cả ngày, Thứ 7 nửa ngày, Chủ nhật nghỉ
            monPolicy ??= "FULL";
            tuePolicy ??= "FULL";
            wedPolicy ??= "FULL";
            thuPolicy ??= "FULL";
            friPolicy ??= "FULL";
            satPolicy ??= "HALF";
            sunPolicy ??= "OFF";
        }

        var existing = await _db.CalendarDays
            .Where(c => c.CompanyId == companyId && c.Date.Year == year)
            .ToDictionaryAsync(c => c.Date.Date, ct);

        // Kiểm tra các kỳ công đã chốt để tránh ghi đè
        var closedPeriods = await _db.Periods
            .Where(p => p.CompanyId == companyId && p.Status == PeriodStatus.Closed && p.Year == year)
            .ToListAsync(ct);

        var startDate = new DateTime(year, 1, 1);
        var endDate = new DateTime(year, 12, 31);

        // Danh sách ngày lễ dương lịch cố định Việt Nam
        var fixedHolidays = new Dictionary<(int Month, int Day), string>
        {
            [(1, 1)] = "Tết Dương Lịch",
            [(4, 30)] = "Ngày Giải phóng miền Nam",
            [(5, 1)] = "Ngày Quốc tế Lao động",
            [(9, 2)] = "Quốc khánh",
            [(9, 3)] = "Nghỉ lễ Quốc khánh"
        };

        int createdCount = 0;
        int updatedCount = 0;

        for (var d = startDate; d <= endDate; d = d.AddDays(1))
        {
            // Bỏ qua nếu thuộc kỳ đã chốt
            if (closedPeriods.Any(p => d >= p.FromDate && d <= p.ToDate))
            {
                continue;
            }

            bool hasExisting = existing.TryGetValue(d, out var existingDay);
            if (hasExisting && !dto.OverwriteExisting)
            {
                continue; // Giữ nguyên ngày đã thiết lập thủ công nếu không chọn ghi đè
            }

            DayType type = DayType.Work;
            string? halfSession = null;
            string? note = null;

            if (fixedHolidays.TryGetValue((d.Month, d.Day), out var hName))
            {
                type = DayType.Holiday;
                note = hName;
            }
            else
            {
                string policy = d.DayOfWeek switch
                {
                    DayOfWeek.Monday => monPolicy,
                    DayOfWeek.Tuesday => tuePolicy,
                    DayOfWeek.Wednesday => wedPolicy,
                    DayOfWeek.Thursday => thuPolicy,
                    DayOfWeek.Friday => friPolicy,
                    DayOfWeek.Saturday => satPolicy,
                    DayOfWeek.Sunday => sunPolicy,
                    _ => "FULL"
                };

                string dayNameVi = d.DayOfWeek switch
                {
                    DayOfWeek.Monday => "Thứ Hai",
                    DayOfWeek.Tuesday => "Thứ Ba",
                    DayOfWeek.Wednesday => "Thứ Tư",
                    DayOfWeek.Thursday => "Thứ Năm",
                    DayOfWeek.Friday => "Thứ Sáu",
                    DayOfWeek.Saturday => "Thứ Bảy",
                    DayOfWeek.Sunday => "Chủ Nhật",
                    _ => ""
                };

                if (policy == "OFF")
                {
                    type = DayType.WeeklyOff;
                    note = $"Nghỉ tuần ({dayNameVi})";
                }
                else if (policy is "HALF" or "HALF_AM")
                {
                    type = DayType.HalfWork;
                    halfSession = "AM";
                    note = $"Làm sáng {dayNameVi}";
                }
                else if (policy == "HALF_PM")
                {
                    type = DayType.HalfWork;
                    halfSession = "PM";
                    note = $"Làm chiều {dayNameVi}";
                }
                else if (policy == "ALTERNATE_OFF")
                {
                    int weekNum = System.Globalization.ISOWeek.GetWeekOfYear(d);
                    bool isOffWeek = (weekNum % 2 == 0);
                    if (isOffWeek)
                    {
                        type = DayType.WeeklyOff;
                        note = $"Nghỉ {dayNameVi} (Cách tuần)";
                    }
                    else
                    {
                        type = DayType.Work;
                        note = $"Làm {dayNameVi} (Cách tuần)";
                    }
                }
                else if (policy == "ALTERNATE_WORK")
                {
                    int weekNum = System.Globalization.ISOWeek.GetWeekOfYear(d);
                    bool isOffWeek = (weekNum % 2 != 0);
                    if (isOffWeek)
                    {
                        type = DayType.WeeklyOff;
                        note = $"Nghỉ {dayNameVi} (Cách tuần)";
                    }
                    else
                    {
                        type = DayType.Work;
                        note = $"Làm {dayNameVi} (Cách tuần)";
                    }
                }
                else
                {
                    type = DayType.Work;
                    note = $"Làm việc {dayNameVi}";
                }
            }

            if (hasExisting && existingDay != null)
            {
                existingDay.DayType = (byte)type;
                existingDay.HalfSession = halfSession;
                existingDay.Note = note;
                updatedCount++;
            }
            else
            {
                _db.CalendarDays.Add(new CalendarDayEntity
                {
                    CompanyId = companyId,
                    Date = d,
                    DayType = (byte)type,
                    HalfSession = halfSession,
                    Note = note
                });
                createdCount++;
            }
        }

        _audit.Log("Calendar", year, "BatchGenerate", new { companyId, year, scheduleType, monPolicy, tuePolicy, wedPolicy, thuPolicy, friPolicy, satPolicy, sunPolicy, createdCount, updatedCount }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = $"Đã thiết lập lịch năm {year}: tạo mới {createdCount} ngày, cập nhật {updatedCount} ngày." });
    }
}
