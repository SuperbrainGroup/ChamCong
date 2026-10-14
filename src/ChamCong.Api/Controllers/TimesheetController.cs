using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/[controller]")]
[Route("api/[controller]")]
public class TimesheetController : ControllerBase
{
    private readonly ITimesheetPublicationService _publicationService;
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public TimesheetController(ITimesheetPublicationService publicationService, AppDbContext db, AuditService audit)
    {
        _publicationService = publicationService;
        _db = db;
        _audit = audit;
    }

    public record DisputeDto(int PublicationId, string? WorkDate, string Content);

    /// <summary>Nhân viên xem bảng chấm công chính thức đã công bố. Nếu chưa công bố -> báo đang đối soát.</summary>
    [HttpGet("mine")]
    public async Task<IActionResult> GetMyTimesheet([FromQuery] int periodId, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { code = "NO_EMPLOYEE", message = "Tài khoản chưa liên kết nhân viên." });
        }

        var published = await _publicationService.GetEmployeePublishedTimesheetAsync(user.EmployeeCode, periodId, ct);
        if (published == null)
        {
            return Ok(new
            {
                isPublished = false,
                message = "Bảng chấm công kỳ này đang được HCNS đối soát và chưa công bố."
            });
        }

        return Ok(new
        {
            isPublished = true,
            published.PublicationId,
            published.VersionNo,
            publishedAt = published.PublishedAtUtc,
            summary = new
            {
                published.Line.WorkDays,
                published.Line.HolidayDays,
                published.Line.AnnualLeaveDays,
                published.Line.PaidLeaveDays,
                published.Line.UnpaidLeaveDays,
                published.Line.PaidDays,
                published.Line.LateEarlyMinutes
            },
            dailyCodes = published.Days
        });
    }

    /// <summary>Nhân viên gửi khiếu nại bảng công (trong vòng DISPUTE_WINDOW_DAYS ngày).</summary>
    [HttpPost("disputes")]
    public async Task<IActionResult> SubmitDispute([FromBody] DisputeDto dto, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode)) return Unauthorized();

        DateTime? workDate = DateTime.TryParse(dto.WorkDate, out var wd) ? wd.Date : null;
        var dispute = await _publicationService.SubmitDisputeAsync(dto.PublicationId, user.EmployeeCode, workDate, dto.Content, ct);

        _audit.Log("Dispute", dispute.DisputeId, "SubmitDispute", dto.Content);
        return Ok(new { dispute.DisputeId, message = "Đã gửi khiếu nại thành công. HCNS sẽ phản hồi sớm." });
    }
}

[ApiController]
[Authorize]
[Route("api/v1/hr/timesheet")]
[Route("api/hr/timesheet")]
public class HrTimesheetController : ControllerBase
{
    private readonly ITimesheetPublicationService _publicationService;
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public HrTimesheetController(ITimesheetPublicationService publicationService, AppDbContext db, AccessService access, AuditService audit)
    {
        _publicationService = publicationService;
        _db = db;
        _access = access;
        _audit = audit;
    }

    public record PublishDto(int PeriodId, string BranchCode, string? Note);
    public record RetractDto(int PublicationId, string? Note);
    public record ResolveDisputeDto(string Action, string Response); // Action = ACCEPT | REJECT

    /// <summary>HCNS công bố bảng công có phiên bản, tạo snapshot bất biến.</summary>
    [HttpPost("publish")]
    public async Task<IActionResult> Publish([FromBody] PublishDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        await _access.EnsureBranchAsync(dto.BranchCode, ct);

        var pub = await _publicationService.PublishTimesheetAsync(dto.PeriodId, dto.BranchCode, dto.Note, User.UserId(), ct);
        _audit.Log("TimesheetPublication", pub.PublicationId, "PublishTimesheet", $"Công bố kỳ {dto.PeriodId} hội sở {dto.BranchCode} v{pub.VersionNo}");

        return Ok(new
        {
            pub.PublicationId,
            pub.VersionNo,
            pub.PublishedAtUtc,
            message = $"Đã công bố bảng chấm công thành công (Phiên bản {pub.VersionNo})."
        });
    }

    /// <summary>HCNS thu hồi công bố khi phát hiện sai sót.</summary>
    [HttpPost("retract")]
    public async Task<IActionResult> Retract([FromBody] RetractDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var pub = await _db.TimesheetPublications.AsNoTracking().FirstOrDefaultAsync(p => p.PublicationId == dto.PublicationId, ct);
        if (pub == null) return NotFound(new { message = "Không tìm thấy bản công bố." });
        await _access.EnsureBranchAsync(pub.BranchCode, ct);

        await _publicationService.RetractTimesheetAsync(dto.PublicationId, dto.Note, User.UserId(), ct);
        _audit.Log("TimesheetPublication", dto.PublicationId, "RetractTimesheet", dto.Note);

        return Ok(new { message = "Đã thu hồi bản công bố bảng công thành công." });
    }

    /// <summary>HCNS xem danh sách khiếu nại bảng công.</summary>
    [HttpGet("disputes")]
    public async Task<IActionResult> GetDisputes([FromQuery] int? publicationId, [FromQuery] string? status, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var allowedBranches = await _access.AllowedBranchCodesAsync(ct);
        var q = _db.TimesheetDisputes.AsNoTracking();

        if (allowedBranches != null)
        {
            q = from d in q
                join p in _db.TimesheetPublications.AsNoTracking() on d.PublicationId equals p.PublicationId
                where allowedBranches.Contains(p.BranchCode)
                select d;
        }

        if (publicationId.HasValue) q = q.Where(d => d.PublicationId == publicationId.Value);
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(d => d.Status == status);

        var list = await q.OrderByDescending(d => d.CreatedAtUtc).Take(100).ToListAsync(ct);
        return Ok(list);
    }

    /// <summary>HCNS giải quyết khiếu nại (Chấp nhận / Từ chối kèm phản hồi).</summary>
    [HttpPost("disputes/{id}/resolve")]
    public async Task<IActionResult> ResolveDispute(int id, [FromBody] ResolveDisputeDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var targetDispute = await (from d in _db.TimesheetDisputes.AsNoTracking()
                                   join p in _db.TimesheetPublications.AsNoTracking() on d.PublicationId equals p.PublicationId
                                   where d.DisputeId == id
                                   select new { d, p.BranchCode }).FirstOrDefaultAsync(ct);
        if (targetDispute == null) return NotFound(new { message = "Không tìm thấy khiếu nại." });
        await _access.EnsureBranchAsync(targetDispute.BranchCode, ct);

        bool accept = dto.Action?.Equals("ACCEPT", StringComparison.OrdinalIgnoreCase) == true;
        var dispute = await _publicationService.ResolveDisputeAsync(id, accept, dto.Response, User.UserId(), ct);

        _audit.Log("Dispute", dispute.DisputeId, accept ? "AcceptDispute" : "RejectDispute", dto.Response);
        return Ok(new { message = "Đã xử lý khiếu nại thành công." });
    }
}
