using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Services;

public class PublishedTimesheetDto
{
    public int PublicationId { get; set; }
    public int VersionNo { get; set; }
    public DateTime PublishedAtUtc { get; set; }
    public TimesheetPublishedLine Line { get; set; } = new();
    public List<DayCodeItemDto> Days { get; set; } = new();
}

public class DayCodeItemDto
{
    public int DayIndex { get; set; }
    public string Code { get; set; } = "";
}

public interface ITimesheetPublicationService
{
    Task<TimesheetPublication> PublishTimesheetAsync(int periodId, string branchCode, string? note, int hrUserId, CancellationToken ct = default);
    Task RetractTimesheetAsync(int publicationId, string? note, int hrUserId, CancellationToken ct = default);
    Task<PublishedTimesheetDto?> GetEmployeePublishedTimesheetAsync(string employeeCode, int periodId, CancellationToken ct = default);
    Task<TimesheetDispute> SubmitDisputeAsync(int publicationId, string employeeCode, DateTime? workDate, string content, CancellationToken ct = default);
    Task<TimesheetDispute> ResolveDisputeAsync(int disputeId, bool accept, string response, int hrUserId, CancellationToken ct = default);
}

public class TimesheetPublicationService : ITimesheetPublicationService
{
    private readonly AppDbContext _db;
    private readonly ILogger<TimesheetPublicationService> _logger;

    public TimesheetPublicationService(AppDbContext db, ILogger<TimesheetPublicationService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<TimesheetPublication> PublishTimesheetAsync(int periodId, string branchCode, string? note, int hrUserId, CancellationToken ct = default)
    {
        var period = await _db.Periods.FirstOrDefaultAsync(p => p.Id == periodId, ct)
            ?? throw AppException.NotFound("Không tìm thấy kỳ công.");

        // Kiểm tra kỳ đã được tính toán hoặc đã chốt
        if (period.Status != PeriodStatus.Calculated && period.Status != PeriodStatus.Closed)
        {
            throw AppException.Bad("Kỳ công phải ở trạng thái Đã tính hoặc Đã chốt mới được công bố.");
        }

        // Kiểm tra xem còn lượt bấm nào đang chờ duyệt cờ trong kỳ này không
        var comp = await _db.Companies.FirstOrDefaultAsync(c => c.Code == branchCode, ct);
        if (comp == null) throw AppException.NotFound($"Không tìm thấy hội sở có mã {branchCode}.");

        var employees = await _db.Employees
            .Where(e => e.CompanyId == comp.Id)
            .ToListAsync(ct);

        var empCodes = employees.Select(e => e.EmployeeCode).ToList();

        var pendingFlags = await _db.WebAttendanceLogs
            .AnyAsync(l => empCodes.Contains(l.EmployeeCode) &&
                           l.WorkDate >= period.FromDate &&
                           l.WorkDate <= period.ToDate &&
                           l.ReviewState == "PENDING", ct);

        if (period.Status != PeriodStatus.Closed && pendingFlags)
        {
            throw AppException.Bad("Không thể công bố vì vẫn còn lượt chấm công đang chờ HCNS duyệt cờ trong kỳ này.");
        }

        // Xác định VersionNo
        var existingPubs = await _db.TimesheetPublications
            .Where(p => p.PeriodId == periodId && p.BranchCode == branchCode)
            .ToListAsync(ct);

        int nextVer = 1;
        if (existingPubs.Any())
        {
            nextVer = existingPubs.Max(p => p.VersionNo) + 1;
            foreach (var p in existingPubs)
            {
                p.IsCurrent = false;
            }
        }

        var pub = new TimesheetPublication
        {
            PeriodId = periodId,
            BranchCode = branchCode,
            VersionNo = nextVer,
            IsCurrent = true,
            PublishedByUserId = hrUserId,
            PublishedAtUtc = DateTime.UtcNow,
            Note = note
        };
        _db.TimesheetPublications.Add(pub);
        await _db.SaveChangesAsync(ct);

        // Chụp snapshot bất biến cho từng nhân viên từ DayResults
        var empIds = employees.Select(e => e.Id).ToList();
        var allResults = await _db.DayResults
            .Where(r => r.PeriodId == periodId && empIds.Contains(r.EmployeeId))
            .OrderBy(r => r.Date)
            .ToListAsync(ct);

        var codes = await _db.AttendanceCodes
            .Where(c => c.CompanyId == comp.Id)
            .ToDictionaryAsync(c => c.Code, c => c, ct);

        foreach (var emp in employees)
        {
            var empRes = allResults.Where(r => r.EmployeeId == emp.Id).ToList();
            var dayCodeList = empRes.Select(r => string.IsNullOrEmpty(r.Code) ? (r.AutoCode ?? "-") : r.Code).ToList();
            var dailyCodesStr = string.Join("|", dayCodeList);

            decimal workDays = 0m;
            decimal holidayDays = 0m;
            decimal annualLeaveDays = 0m;
            decimal paidLeaveDays = 0m;
            decimal unpaidLeaveDays = 0m;
            int lateEarlyMin = 0;

            foreach (var r in empRes)
            {
                var c = string.IsNullOrEmpty(r.Code) ? r.AutoCode : r.Code;
                if (!string.IsNullOrEmpty(c) && codes.TryGetValue(c, out var ac))
                {
                    workDays += ac.WorkValue;
                    holidayDays += ac.HolidayValue;
                    annualLeaveDays += ac.AnnualLeaveValue;
                    paidLeaveDays += ac.PaidLeaveValue;
                    if (ac.FundType == 0 && ac.WorkValue == 0 && ac.HolidayValue == 0 && ac.PaidLeaveValue == 0)
                    {
                        unpaidLeaveDays += 1m;
                    }
                }
                lateEarlyMin += r.LateMinutes + r.EarlyMinutes;
            }

            decimal paidDays = workDays + holidayDays + annualLeaveDays + paidLeaveDays;

            _db.TimesheetPublishedLines.Add(new TimesheetPublishedLine
            {
                PublicationId = pub.PublicationId,
                EmployeeCode = emp.EmployeeCode,
                DailyCodes = dailyCodesStr,
                WorkDays = workDays,
                HolidayDays = holidayDays,
                AnnualLeaveDays = annualLeaveDays,
                PaidLeaveDays = paidLeaveDays,
                UnpaidLeaveDays = unpaidLeaveDays,
                PaidDays = paidDays,
                LateEarlyMinutes = lateEarlyMin,
                LeaveBalanceAfter = null,
                Note = null
            });

            // Gửi thông báo cho nhân viên
            var user = await _db.Users.FirstOrDefaultAsync(u => u.EmployeeCode == emp.EmployeeCode, ct);
            if (user != null)
            {
                _db.Notifications.Add(new Notification
                {
                    UserId = user.Id,
                    CompanyId = comp.Id,
                    BranchCode = branchCode,
                    Title = $"Bảng chấm công Tháng {period.Month:00}/{period.Year} đã được chốt",
                    Body = $"HCNS đã hoàn tất chốt kỳ công Tháng {period.Month:00}/{period.Year}. Bạn có thể vào xem chi tiết chấm công, ngày phép, ngày trễ và phép năm còn lại.",
                    LinkType = "TIMESHEET",
                    LinkId = period.Id,
                    IsRead = false,
                    CreatedAtUtc = DateTime.UtcNow
                });
            }
        }

        await _db.SaveChangesAsync(ct);
        return pub;
    }

    public async Task RetractTimesheetAsync(int publicationId, string? note, int hrUserId, CancellationToken ct = default)
    {
        var pub = await _db.TimesheetPublications.FirstOrDefaultAsync(p => p.PublicationId == publicationId, ct)
            ?? throw AppException.NotFound("Không tìm thấy bản công bố.");

        pub.IsCurrent = false;
        pub.RetractedAtUtc = DateTime.UtcNow;
        pub.Note = string.IsNullOrWhiteSpace(note) ? "Đã thu hồi bởi HCNS" : note;

        await _db.SaveChangesAsync(ct);
    }

    public async Task<PublishedTimesheetDto?> GetEmployeePublishedTimesheetAsync(string employeeCode, int periodId, CancellationToken ct = default)
    {
        var pub = await _db.TimesheetPublications
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.PeriodId == periodId && p.IsCurrent && p.RetractedAtUtc == null, ct);

        if (pub == null) return null;

        var line = await _db.TimesheetPublishedLines
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.PublicationId == pub.PublicationId && l.EmployeeCode == employeeCode, ct);

        if (line == null) return null;

        var rawCodes = line.DailyCodes.Split('|');
        var dayList = new List<DayCodeItemDto>();
        for (int i = 0; i < rawCodes.Length; i++)
        {
            dayList.Add(new DayCodeItemDto
            {
                DayIndex = i + 1,
                Code = rawCodes[i]
            });
        }

        return new PublishedTimesheetDto
        {
            PublicationId = pub.PublicationId,
            VersionNo = pub.VersionNo,
            PublishedAtUtc = pub.PublishedAtUtc,
            Line = line,
            Days = dayList
        };
    }

    public async Task<TimesheetDispute> SubmitDisputeAsync(int publicationId, string employeeCode, DateTime? workDate, string content, CancellationToken ct = default)
    {
        var pub = await _db.TimesheetPublications.FirstOrDefaultAsync(p => p.PublicationId == publicationId && p.IsCurrent, ct)
            ?? throw AppException.NotFound("Bản công bố không tồn tại hoặc đã bị thu hồi.");

        // Kiểm tra thời hạn khiếu nại (mặc định 3 ngày sau khi công bố)
        const int disputeWindowDays = 3;
        if (DateTime.UtcNow > pub.PublishedAtUtc.AddDays(disputeWindowDays))
        {
            throw AppException.Bad($"Đã hết thời hạn gửi khiếu nại ({disputeWindowDays} ngày kể từ ngày công bố). Vui lòng liên hệ trực tiếp HCNS.");
        }

        var dispute = new TimesheetDispute
        {
            PublicationId = publicationId,
            EmployeeCode = employeeCode,
            WorkDate = workDate,
            Content = content,
            Status = "OPEN",
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.TimesheetDisputes.Add(dispute);
        await _db.SaveChangesAsync(ct);

        // Tạo thông báo cho HCNS & Quản trị viên phụ trách hội sở này
        var period = await _db.Periods.FirstOrDefaultAsync(p => p.Id == pub.PeriodId, ct);
        int? companyId = period?.CompanyId;
        string? branchCode = pub.BranchCode;
        if (!companyId.HasValue && !string.IsNullOrEmpty(branchCode))
        {
            var comp = await _db.Companies.FirstOrDefaultAsync(c => c.Code == branchCode, ct);
            companyId = comp?.Id;
        }

        var hrQuery = _db.Users.Where(u => u.Role == "HR" || u.Role == "Admin");
        if (companyId.HasValue)
        {
            hrQuery = hrQuery.Where(u => u.Companies.Any(c => c.CompanyId == companyId.Value) || (u.Role == "Admin" && !u.Companies.Any()));
        }
        var hrUsers = await hrQuery.ToListAsync(ct);
        foreach (var hr in hrUsers)
        {
            _db.Notifications.Add(new Notification
            {
                UserId = hr.Id,
                CompanyId = companyId,
                BranchCode = branchCode,
                Title = "Khiếu nại bảng chấm công mới",
                Body = $"Nhân viên {employeeCode} vừa gửi khiếu nại bảng công kỳ Tháng {period?.Month:00}/{period?.Year}.",
                LinkType = "DISPUTE",
                LinkId = dispute.DisputeId,
                IsRead = false,
                CreatedAtUtc = DateTime.UtcNow
            });
        }
        await _db.SaveChangesAsync(ct);

        return dispute;
    }

    public async Task<TimesheetDispute> ResolveDisputeAsync(int disputeId, bool accept, string response, int hrUserId, CancellationToken ct = default)
    {
        var dispute = await _db.TimesheetDisputes.FirstOrDefaultAsync(d => d.DisputeId == disputeId, ct)
            ?? throw AppException.NotFound("Không tìm thấy khiếu nại.");

        dispute.Status = accept ? "ACCEPTED" : "REJECTED";
        dispute.HRUserId = hrUserId;
        dispute.HRResponse = response;
        dispute.ResolvedAtUtc = DateTime.UtcNow;

        var pub = await _db.TimesheetPublications.FirstOrDefaultAsync(p => p.PublicationId == dispute.PublicationId, ct);
        var period = pub != null ? await _db.Periods.FirstOrDefaultAsync(p => p.Id == pub.PeriodId, ct) : null;
        int? companyId = period?.CompanyId;
        string? branchCode = pub?.BranchCode;
        if (!companyId.HasValue && !string.IsNullOrEmpty(branchCode))
        {
            var comp = await _db.Companies.FirstOrDefaultAsync(c => c.Code == branchCode, ct);
            companyId = comp?.Id;
        }

        // Gửi thông báo cho nhân viên
        var user = await _db.Users.FirstOrDefaultAsync(u => u.EmployeeCode == dispute.EmployeeCode, ct);
        if (user != null)
        {
            var actionText = accept ? "chấp thuận" : "từ chối";
            _db.Notifications.Add(new Notification
            {
                UserId = user.Id,
                CompanyId = companyId,
                BranchCode = branchCode,
                Title = $"Khiếu nại bảng công đã được {actionText}",
                Body = $"Phản hồi từ HCNS: {response}",
                LinkType = "DISPUTE",
                LinkId = dispute.DisputeId,
                IsRead = false,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync(ct);
        return dispute;
    }
}
