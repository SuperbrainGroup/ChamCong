using System.Security.Cryptography;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Services;

public class CreateLeaveDto
{
    public string LeaveCode { get; set; } = "P";
    public DateTime FromDate { get; set; }
    public DateTime ToDate { get; set; }
    public string? DayPart { get; set; } // FULL | MORNING | AFTERNOON
    public string Reason { get; set; } = "";
    public List<IFormFile>? Files { get; set; }
}

public class CreateRegularizationDto
{
    public DateTime WorkDate { get; set; }
    public TimeSpan ActualTimeIn { get; set; }
    public TimeSpan ActualTimeOut { get; set; }
    public string? ReasonCode { get; set; } // Quên bấm | Lỗi mạng | Công tác...
    public string Reason { get; set; } = "";
    public List<IFormFile>? Files { get; set; }
}

public interface IEmployeeRequestService
{
    Task<EmployeeRequest> SubmitLeaveRequestAsync(string employeeCode, CreateLeaveDto dto, int? companyId = null, CancellationToken ct = default);
    Task<EmployeeRequest> SubmitRegularizationRequestAsync(string employeeCode, CreateRegularizationDto dto, int? companyId = null, CancellationToken ct = default);
    Task<EmployeeRequest> DecideRequestAsync(int requestId, bool approve, string? note, int hrUserId, CancellationToken ct = default);
    Task CancelRequestAsync(int requestId, string employeeCode, CancellationToken ct = default);
    Task<decimal> GetAvailableLeaveBalanceAsync(string employeeCode, int year, int? companyId = null, CancellationToken ct = default);
}

public class EmployeeRequestService : IEmployeeRequestService
{
    private readonly AppDbContext _db;
    private readonly IAttendancePunchService _punchService;
    private readonly IConfiguration _config;
    private readonly ILogger<EmployeeRequestService> _logger;

    public EmployeeRequestService(
        AppDbContext db,
        IAttendancePunchService? punchService = null,
        IConfiguration? config = null,
        ILogger<EmployeeRequestService>? logger = null)
    {
        _db = db;
        _punchService = punchService!;
        _config = config!;
        _logger = logger!;
    }

    private string GetEvidenceStoragePath()
    {
        var basePath = _config?["Storage:EvidencePath"]
            ?? Path.Combine(AppContext.BaseDirectory, "Storage", "Evidence");

        if (!Directory.Exists(basePath))
        {
            Directory.CreateDirectory(basePath);
        }
        return basePath;
    }

    public async Task<decimal> GetAvailableLeaveBalanceAsync(string employeeCode, int year, int? companyId = null, CancellationToken ct = default)
    {
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == employeeCode);
        if (companyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == companyId.Value);
        }
        var emp = await empQuery.FirstOrDefaultAsync(ct);
        if (emp == null) return 0m;

        // Quỹ phép đầu năm
        var fund = await _db.LeaveFunds.AsNoTracking().FirstOrDefaultAsync(f => f.EmployeeId == emp.Id && f.Year == year, ct);
        decimal opening = fund != null ? (fund.AnnualOpening + fund.CarryOpening + fund.CompOpening) : 12m;

        // Đã trừ trong sổ cái
        var ledgerEntries = await _db.LeaveLedger
            .AsNoTracking()
            .Where(l => l.EmployeeId == emp.Id && l.Year == year)
            .Select(l => l.Amount)
            .ToListAsync(ct);

        decimal ledgerDeducted = ledgerEntries.Sum();

        // Đang giữ chỗ cho các đơn xin nghỉ đang PENDING_HR
        var pendingQuery = _db.EmployeeRequests
            .AsNoTracking()
            .Where(r => r.EmployeeCode == employeeCode &&
                        r.RequestType == "LEAVE" &&
                        r.Status == "PENDING_HR" &&
                        r.FromDate.Year == year);

        if (companyId.HasValue)
        {
            pendingQuery = pendingQuery.Where(r => r.CompanyId == companyId.Value || r.CompanyId == null);
        }

        var pendingDays = await pendingQuery
            .Select(r => r.DaysRequested)
            .ToListAsync(ct);

        decimal heldDays = pendingDays.Sum();

        decimal available = opening - ledgerDeducted - heldDays;
        return Math.Max(0m, available);
    }

    public async Task<EmployeeRequest> SubmitLeaveRequestAsync(string employeeCode, CreateLeaveDto dto, int? companyId = null, CancellationToken ct = default)
    {
        if (dto.FromDate > dto.ToDate)
        {
            throw AppException.Bad("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
        }

        var today = DateTime.Today;
        const int maxBackdateDays = 10;
        const int maxAdvanceDays = 90;

        if (dto.FromDate < today.AddDays(-maxBackdateDays))
        {
            throw AppException.Bad($"Không được nộp đơn lùi quá {maxBackdateDays} ngày về quá khứ.");
        }

        if (dto.ToDate > today.AddDays(maxAdvanceDays))
        {
            throw AppException.Bad($"Không được nộp đơn trước quá {maxAdvanceDays} ngày trong tương lai.");
        }

        // Tính số ngày yêu cầu (nếu nửa ngày thì 0.5)
        decimal daysRequested;
        if (dto.DayPart == "MORNING" || dto.DayPart == "AFTERNOON")
        {
            if (dto.FromDate != dto.ToDate)
            {
                throw AppException.Bad("Xin nghỉ nửa buổi chỉ áp dụng trong cùng 1 ngày.");
            }
            daysRequested = 0.5m;
        }
        else
        {
            daysRequested = (decimal)(dto.ToDate - dto.FromDate).TotalDays + 1m;
        }

        // Kiểm tra số dư phép nếu là nghỉ phép năm (P)
        if (dto.LeaveCode.StartsWith("P", StringComparison.OrdinalIgnoreCase))
        {
            var available = await GetAvailableLeaveBalanceAsync(employeeCode, dto.FromDate.Year, companyId, ct);
            if (daysRequested > available)
            {
                throw AppException.Bad($"Số dư quỹ phép không đủ ({available:0.#} ngày khả dụng, cần {daysRequested:0.#} ngày). Vui lòng chọn nghỉ không lương hoặc điều chỉnh thời gian.");
            }
        }

        // Kiểm tra trùng lặp ngày với đơn khác
        var overlapQuery = _db.EmployeeRequests.Where(r =>
            r.EmployeeCode == employeeCode &&
            (r.Status == "PENDING_HR" || r.Status == "APPROVED") &&
            !(r.ToDate < dto.FromDate || r.FromDate > dto.ToDate));

        if (companyId.HasValue)
        {
            overlapQuery = overlapQuery.Where(r => r.CompanyId == companyId.Value || r.CompanyId == null);
        }

        var hasOverlap = await overlapQuery.AnyAsync(ct);

        if (hasOverlap)
        {
            throw AppException.Conflict("Khoảng thời gian này đã trùng với một đơn nghỉ khác đang xử lý hoặc đã duyệt.");
        }

        var req = new EmployeeRequest
        {
            CompanyId = companyId,
            RequestType = "LEAVE",
            EmployeeCode = employeeCode,
            LeaveCode = dto.LeaveCode,
            FromDate = dto.FromDate,
            ToDate = dto.ToDate,
            DayPart = dto.DayPart ?? "FULL",
            DaysRequested = daysRequested,
            Reason = dto.Reason,
            Status = "PENDING_HR",
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _db.EmployeeRequests.Add(req);
        await _db.SaveChangesAsync(ct);

        // Xử lý lưu tệp đính kèm an toàn
        if (dto.Files != null && dto.Files.Any())
        {
            await SaveAttachmentsAsync(req.RequestId, dto.Files, ct);
        }

        // Tạo thông báo cho nhân viên nộp đơn
        var userQuery = _db.Users.Where(u =>
            (u.EmployeeCode != null && u.EmployeeCode.ToLower() == employeeCode.ToLower()) ||
            u.Username.ToLower() == employeeCode.ToLower());

        if (companyId.HasValue)
        {
            userQuery = userQuery.Where(u => u.Companies.Any(c => c.CompanyId == companyId.Value));
        }

        var user = await userQuery.FirstOrDefaultAsync(ct);

        if (user != null)
        {
            var dateStr = dto.FromDate == dto.ToDate
                ? dto.FromDate.ToString("dd/MM/yyyy")
                : $"{dto.FromDate:dd/MM/yyyy} đến {dto.ToDate:dd/MM/yyyy}";
            _db.Notifications.Add(new Notification
            {
                UserId = user.Id,
                Title = "Đơn nghỉ phép đang chờ duyệt",
                Body = $"Đơn xin nghỉ phép ({daysRequested:0.#} ngày: {dateStr}) của bạn đã được gửi thành công và đang chờ HCNS phê duyệt.",
                LinkType = "LEAVE",
                LinkId = req.RequestId,
                IsRead = false,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        // Tạo thông báo cho HCNS / Quản lý của chi nhánh/hội sở
        var hrQuery = _db.Users.Where(u => u.Role == "HR" || u.Role == "Admin");
        if (companyId.HasValue)
        {
            hrQuery = hrQuery.Where(u => u.Role == "Admin" || u.Companies.Any(c => c.CompanyId == companyId.Value));
        }
        var hrUsers = await hrQuery.ToListAsync(ct);
        foreach (var hr in hrUsers)
        {
            if (user != null && hr.Id == user.Id) continue;
            var dateStr = dto.FromDate == dto.ToDate
                ? dto.FromDate.ToString("dd/MM/yyyy")
                : $"{dto.FromDate:dd/MM/yyyy} - {dto.ToDate:dd/MM/yyyy}";
            _db.Notifications.Add(new Notification
            {
                UserId = hr.Id,
                Title = "Đơn xin nghỉ phép mới cần duyệt",
                Body = $"Nhân viên {employeeCode} vừa gửi đơn xin nghỉ phép ({daysRequested:0.#} ngày: {dateStr}).",
                LinkType = "LEAVE",
                LinkId = req.RequestId,
                IsRead = false,
                CreatedAtUtc = DateTime.UtcNow
            });
        }
        await _db.SaveChangesAsync(ct);

        return req;
    }

    public async Task<EmployeeRequest> SubmitRegularizationRequestAsync(string employeeCode, CreateRegularizationDto dto, int? companyId = null, CancellationToken ct = default)
    {
        if (dto.ActualTimeIn >= dto.ActualTimeOut)
        {
            throw AppException.Bad("Giờ ra thực tế phải sau giờ vào thực tế.");
        }

        var today = DateTime.Today;
        const int maxBackdateDays = 10;
        if (dto.WorkDate < today.AddDays(-maxBackdateDays) || dto.WorkDate > today)
        {
            throw AppException.Bad($"Chỉ được giải trình cho ngày trong vòng {maxBackdateDays} ngày gần nhất.");
        }

        var regQuery = _db.EmployeeRequests.Where(r =>
            r.EmployeeCode == employeeCode &&
            r.RequestType == "REGULARIZATION" &&
            r.FromDate == dto.WorkDate &&
            r.Status == "PENDING_HR");

        if (companyId.HasValue)
        {
            regQuery = regQuery.Where(r => r.CompanyId == companyId.Value || r.CompanyId == null);
        }

        var existingReg = await regQuery.AnyAsync(ct);

        if (existingReg)
        {
            throw AppException.Conflict("Ngày này đã có giải trình đang chờ HCNS phê duyệt.");
        }

        var req = new EmployeeRequest
        {
            CompanyId = companyId,
            RequestType = "REGULARIZATION",
            EmployeeCode = employeeCode,
            FromDate = dto.WorkDate,
            ToDate = dto.WorkDate,
            DayPart = "FULL",
            DaysRequested = 1m,
            ReasonCode = dto.ReasonCode,
            Reason = dto.Reason,
            ActualTimeIn = dto.ActualTimeIn,
            ActualTimeOut = dto.ActualTimeOut,
            Status = "PENDING_HR",
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _db.EmployeeRequests.Add(req);
        await _db.SaveChangesAsync(ct);

        if (dto.Files != null && dto.Files.Any())
        {
            await SaveAttachmentsAsync(req.RequestId, dto.Files, ct);
        }

        // Tạo thông báo cho nhân viên nộp giải trình
        var userQuery = _db.Users.Where(u =>
            (u.EmployeeCode != null && u.EmployeeCode.ToLower() == employeeCode.ToLower()) ||
            u.Username.ToLower() == employeeCode.ToLower());

        if (companyId.HasValue)
        {
            userQuery = userQuery.Where(u => u.Companies.Any(c => c.CompanyId == companyId.Value));
        }

        var user = await userQuery.FirstOrDefaultAsync(ct);

        if (user != null)
        {
            _db.Notifications.Add(new Notification
            {
                UserId = user.Id,
                Title = "Giải trình chấm công đang chờ duyệt",
                Body = $"Giải trình quên bấm công ngày {dto.WorkDate:dd/MM/yyyy} ({dto.ActualTimeIn:hh\\:mm} - {dto.ActualTimeOut:hh\\:mm}) đã được gửi và đang chờ HCNS xem xét.",
                LinkType = "REGULARIZATION",
                LinkId = req.RequestId,
                IsRead = false,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        // Tạo thông báo cho HCNS / Quản lý của chi nhánh/hội sở
        var hrQuery = _db.Users.Where(u => u.Role == "HR" || u.Role == "Admin");
        if (companyId.HasValue)
        {
            hrQuery = hrQuery.Where(u => u.Role == "Admin" || u.Companies.Any(c => c.CompanyId == companyId.Value));
        }
        var hrUsers = await hrQuery.ToListAsync(ct);
        foreach (var hr in hrUsers)
        {
            if (user != null && hr.Id == user.Id) continue;
            _db.Notifications.Add(new Notification
            {
                UserId = hr.Id,
                Title = "Giải trình chấm công mới cần duyệt",
                Body = $"Nhân viên {employeeCode} vừa gửi giải trình chấm công ngày {dto.WorkDate:dd/MM/yyyy}.",
                LinkType = "REGULARIZATION",
                LinkId = req.RequestId,
                IsRead = false,
                CreatedAtUtc = DateTime.UtcNow
            });
        }
        await _db.SaveChangesAsync(ct);

        return req;
    }

    private async Task SaveAttachmentsAsync(int requestId, List<IFormFile> files, CancellationToken ct)
    {
        var storageDir = GetEvidenceStoragePath();
        foreach (var file in files.Take(5))
        {
            if (file.Length == 0 || file.Length > 5 * 1024 * 1024) continue; // max 5MB

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            var allowedExts = new[] { ".jpg", ".jpeg", ".png", ".webp" };
            if (!allowedExts.Contains(ext)) continue;

            var randomName = $"{Guid.NewGuid():N}{ext}";
            var fullPath = Path.Combine(storageDir, randomName);

            using var memStream = new MemoryStream();
            await file.CopyToAsync(memStream, ct);
            var fileBytes = memStream.ToArray();

            var sha256 = CryptoUtil.Sha256Hex(fileBytes);
            await File.WriteAllBytesAsync(fullPath, fileBytes, ct);

            _db.RequestAttachments.Add(new RequestAttachment
            {
                RequestId = requestId,
                OriginalFileName = file.FileName,
                StoredFileName = randomName,
                MimeType = file.ContentType,
                FileSizeBytes = (int)file.Length,
                Sha256 = sha256,
                UploadedAtUtc = DateTime.UtcNow
            });
        }
        await _db.SaveChangesAsync(ct);
    }

    public async Task<EmployeeRequest> DecideRequestAsync(int requestId, bool approve, string? note, int hrUserId, CancellationToken ct = default)
    {
        var req = await _db.EmployeeRequests.FirstOrDefaultAsync(r => r.RequestId == requestId, ct)
            ?? throw AppException.NotFound("Không tìm thấy đơn yêu cầu.");

        if (req.Status != "PENDING_HR")
        {
            throw AppException.Conflict("Đơn này đã được xử lý trước đó.");
        }

        // Chống tự duyệt (Anti-Self-Approval): HCNS không được tự duyệt đơn của chính mình
        var hrUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == hrUserId, ct);
        if (hrUser != null && !string.IsNullOrWhiteSpace(hrUser.EmployeeCode) &&
            string.Equals(hrUser.EmployeeCode, req.EmployeeCode, StringComparison.OrdinalIgnoreCase))
        {
            throw AppException.Forbidden("Chuyên viên HCNS không được phép tự phê duyệt đơn của chính mình. Vui lòng nhờ cấp quản lý khác duyệt.");
        }

        req.Status = approve ? "APPROVED" : "REJECTED";
        req.HRUserId = hrUserId;
        req.HRDecidedAtUtc = DateTime.UtcNow;
        req.HRNote = note;
        req.UpdatedAtUtc = DateTime.UtcNow;

        var empQuery = _db.Employees.Where(e => e.EmployeeCode == req.EmployeeCode);
        if (req.CompanyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == req.CompanyId.Value);
        }
        var emp = await empQuery.FirstOrDefaultAsync(ct);

        if (approve && emp != null)
        {
            if (req.RequestType == "LEAVE")
            {
                // Tự động map sang P/2 nếu là xin nghỉ nửa buổi
                var effectiveCode = (req.DayPart == "MORNING" || req.DayPart == "AFTERNOON") && (req.LeaveCode == "P" || string.IsNullOrEmpty(req.LeaveCode))
                    ? "P/2"
                    : (req.LeaveCode ?? "P");

                // 1. Tạo ngoại lệ ngày nghỉ cho từng ngày trong khoảng
                for (var d = req.FromDate; d <= req.ToDate; d = d.AddDays(1))
                {
                    var existingLeave = await _db.LeaveRequests.FirstOrDefaultAsync(l => l.EmployeeId == emp.Id && l.Date == d, ct);
                    if (existingLeave == null)
                    {
                        _db.LeaveRequests.Add(new LeaveRequest
                        {
                            CompanyId = emp.CompanyId,
                            EmployeeId = emp.Id,
                            Date = d,
                            Code = effectiveCode,
                            Reason = req.Reason,
                            Source = "APP",
                            CreatedBy = $"HR:{hrUserId}",
                            CreatedAt = DateTime.Now
                        });
                    }
                    else
                    {
                        existingLeave.Code = effectiveCode;
                        existingLeave.Reason = req.Reason;
                        existingLeave.Source = "APP";
                    }
                }

                // 2. Ghi trừ vào sổ cái phép nếu là nghỉ phép năm
                if (req.LeaveCode != null && req.LeaveCode.StartsWith("P", StringComparison.OrdinalIgnoreCase))
                {
                    _db.LeaveLedger.Add(new LeaveLedgerEntry
                    {
                        EmployeeId = emp.Id,
                        Year = (short)req.FromDate.Year,
                        Fund = "ANNUAL",
                        Date = req.FromDate,
                        Code = effectiveCode,
                        Amount = req.DaysRequested,
                        Note = $"Đơn nghỉ phép #{req.RequestId} đã duyệt",
                        CreatedAt = DateTime.Now
                    });
                }
            }
            else if (req.RequestType == "REGULARIZATION")
            {
                // Ghi nhận điều chỉnh giờ
                var adjQuery = _db.TimeAdjustments.Where(a => a.EmployeeCode == req.EmployeeCode && a.WorkDate == req.FromDate);
                if (req.CompanyId.HasValue)
                {
                    adjQuery = adjQuery.Where(a => a.CompanyId == req.CompanyId.Value || a.CompanyId == null);
                }
                var existingAdj = await adjQuery.FirstOrDefaultAsync(ct);
                if (existingAdj == null)
                {
                    _db.TimeAdjustments.Add(new TimeAdjustment
                    {
                        CompanyId = req.CompanyId,
                        EmployeeCode = req.EmployeeCode,
                        WorkDate = req.FromDate,
                        AdjInTime = req.ActualTimeIn,
                        AdjOutTime = req.ActualTimeOut,
                        SourceRequestId = req.RequestId,
                        IsActive = true,
                        CreatedAtUtc = DateTime.UtcNow
                    });
                }
                else
                {
                    if (req.CompanyId.HasValue) existingAdj.CompanyId = req.CompanyId.Value;
                    existingAdj.AdjInTime = req.ActualTimeIn;
                    existingAdj.AdjOutTime = req.ActualTimeOut;
                    existingAdj.SourceRequestId = req.RequestId;
                    existingAdj.IsActive = true;
                }

                await _db.SaveChangesAsync(ct);

                // Tự động tính toán lại gộp ngày công cho ngày này
                await _punchService.AggregateDailySummaryAsync(req.EmployeeCode, req.FromDate, req.CompanyId, ct);
            }
        }

        // Tạo thông báo cho nhân viên
        var notifyUserQuery = _db.Users.Where(u =>
            (u.EmployeeCode != null && u.EmployeeCode.ToLower() == req.EmployeeCode.ToLower()) ||
            u.Username.ToLower() == req.EmployeeCode.ToLower());

        if (req.CompanyId.HasValue)
        {
            notifyUserQuery = notifyUserQuery.Where(u => u.Companies.Any(c => c.CompanyId == req.CompanyId.Value));
        }

        var user = await notifyUserQuery.FirstOrDefaultAsync(ct);
        if (user != null)
        {
            var actionText = approve ? "đã được phê duyệt" : "đã bị từ chối";
            var typeText = req.RequestType == "LEAVE" ? "Đơn nghỉ phép" : "Giải trình chấm công";
            var dateStr = req.FromDate == req.ToDate ? req.FromDate.ToString("dd/MM/yyyy") : $"{req.FromDate:dd/MM/yyyy} - {req.ToDate:dd/MM/yyyy}";
            _db.Notifications.Add(new Notification
            {
                UserId = user.Id,
                Title = $"{typeText} {actionText}",
                Body = $"{typeText} ({dateStr}) của bạn {actionText}." + (string.IsNullOrWhiteSpace(note) ? "" : $" Ghi chú từ HCNS: {note}"),
                LinkType = req.RequestType,
                LinkId = req.RequestId,
                IsRead = false,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync(ct);
        return req;
    }

    public async Task CancelRequestAsync(int requestId, string employeeCode, CancellationToken ct = default)
    {
        var req = await _db.EmployeeRequests.FirstOrDefaultAsync(r => r.RequestId == requestId && r.EmployeeCode == employeeCode, ct)
            ?? throw AppException.NotFound("Không tìm thấy đơn.");

        if (req.Status != "PENDING_HR")
        {
            throw AppException.Conflict("Chỉ có thể hủy đơn khi đang ở trạng thái chờ duyệt.");
        }

        req.Status = "CANCELLED";
        req.CancelledAtUtc = DateTime.UtcNow;
        req.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
    }
}
