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
public class RequestsController : ControllerBase
{
    private readonly IEmployeeRequestService _requestService;
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public RequestsController(IEmployeeRequestService requestService, AppDbContext db, AuditService audit)
    {
        _requestService = requestService;
        _db = db;
        _audit = audit;
    }

    /// <summary>Nộp đơn mới (Nghỉ phép hoặc Giải trình bất thường) kèm tệp đính kèm.</summary>
    [HttpPost]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> SubmitRequest([FromForm] SubmitRequestForm form, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { code = "NO_EMPLOYEE", message = "Tài khoản chưa liên kết nhân viên." });
        }

        if (form.RequestType?.Equals("LEAVE", StringComparison.OrdinalIgnoreCase) == true)
        {
            var dto = new CreateLeaveDto
            {
                LeaveCode = form.LeaveCode ?? "P",
                FromDate = form.FromDate,
                ToDate = form.ToDate,
                DayPart = form.DayPart,
                Reason = form.Reason ?? "",
                Files = form.Files
            };
            var req = await _requestService.SubmitLeaveRequestAsync(user.EmployeeCode, dto, ct);
            _audit.Log("Request", req.RequestId, "SubmitLeave", form.Reason);
            return Ok(new { req.RequestId, message = "Đã gửi đơn nghỉ phép thành công." });
        }
        else if (form.RequestType?.Equals("REGULARIZATION", StringComparison.OrdinalIgnoreCase) == true)
        {
            if (!TimeSpan.TryParse(form.ActualIn, out var actualIn) || !TimeSpan.TryParse(form.ActualOut, out var actualOut))
            {
                return BadRequest(new { code = "INVALID_TIME", message = "Giờ vào hoặc giờ ra thực tế không đúng định dạng HH:mm." });
            }

            var dto = new CreateRegularizationDto
            {
                WorkDate = form.FromDate,
                ActualTimeIn = actualIn,
                ActualTimeOut = actualOut,
                ReasonCode = form.ReasonCode,
                Reason = form.Reason ?? "",
                Files = form.Files
            };
            var req = await _requestService.SubmitRegularizationRequestAsync(user.EmployeeCode, dto, ct);
            _audit.Log("Request", req.RequestId, "SubmitRegularization", form.Reason);
            return Ok(new { req.RequestId, message = "Đã gửi giải trình chấm công thành công." });
        }

        return BadRequest(new { code = "INVALID_TYPE", message = "Loại yêu cầu chỉ chấp nhận LEAVE hoặc REGULARIZATION." });
    }

    /// <summary>Xem danh sách đơn của tôi.</summary>
    [HttpGet("mine")]
    public async Task<IActionResult> GetMyRequests([FromQuery] string? status, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode)) return Ok(new List<object>());

        var q = _db.EmployeeRequests
            .Include(r => r.Attachments)
            .AsNoTracking()
            .Where(r => r.EmployeeCode == user.EmployeeCode);

        if (!string.IsNullOrWhiteSpace(status))
        {
            q = q.Where(r => r.Status == status);
        }

        var list = await q.OrderByDescending(r => r.CreatedAtUtc).Take(100).ToListAsync(ct);
        var result = list.Select(r => new
        {
            r.RequestId,
            r.RequestType,
            r.LeaveCode,
            fromDate = r.FromDate.ToString("yyyy-MM-dd"),
            toDate = r.ToDate.ToString("yyyy-MM-dd"),
            r.DayPart,
            r.DaysRequested,
            r.ReasonCode,
            r.Reason,
            actualTimeIn = r.ActualTimeIn?.ToString(@"hh\:mm"),
            actualTimeOut = r.ActualTimeOut?.ToString(@"hh\:mm"),
            r.Status,
            r.HRNote,
            createdAt = r.CreatedAtUtc,
            attachmentCount = r.Attachments.Count
        });

        return Ok(result);
    }

    /// <summary>Xem chi tiết 1 đơn.</summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetRequest(int id, CancellationToken ct)
    {
        var req = await _db.EmployeeRequests
            .Include(r => r.Attachments)
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.RequestId == id, ct);

        if (req == null) return NotFound();

        // Kiểm tra phân quyền: Chủ đơn, HR hoặc Admin
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null) return Unauthorized();

        if (req.EmployeeCode != user.EmployeeCode && !User.IsHR())
        {
            return StatusCode(403, new { message = "Bạn không có quyền xem đơn này." });
        }

        return Ok(new
        {
            req.RequestId,
            req.RequestType,
            req.EmployeeCode,
            req.LeaveCode,
            fromDate = req.FromDate.ToString("yyyy-MM-dd"),
            toDate = req.ToDate.ToString("yyyy-MM-dd"),
            req.DayPart,
            req.DaysRequested,
            req.ReasonCode,
            req.Reason,
            actualTimeIn = req.ActualTimeIn?.ToString(@"hh\:mm"),
            actualTimeOut = req.ActualTimeOut?.ToString(@"hh\:mm"),
            req.Status,
            req.HRNote,
            req.CreatedAtUtc,
            attachments = req.Attachments.Select(a => new
            {
                a.AttachmentId,
                a.OriginalFileName,
                a.FileSizeBytes,
                a.MimeType
            })
        });
    }

    /// <summary>Hủy đơn khi chưa duyệt.</summary>
    [HttpPost("{id}/cancel")]
    public async Task<IActionResult> CancelRequest(int id, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode)) return Unauthorized();

        await _requestService.CancelRequestAsync(id, user.EmployeeCode, ct);
        _audit.Log("Request", id, "CancelRequest", "Hủy đơn");
        return Ok(new { message = "Đã hủy đơn thành công." });
    }
}

public class SubmitRequestForm
{
    public string RequestType { get; set; } = "LEAVE"; // LEAVE | REGULARIZATION
    public string? LeaveCode { get; set; }
    public DateTime FromDate { get; set; }
    public DateTime ToDate { get; set; }
    public string? DayPart { get; set; }
    public string? ReasonCode { get; set; }
    public string? Reason { get; set; }
    public string? ActualIn { get; set; }
    public string? ActualOut { get; set; }
    public List<IFormFile>? Files { get; set; }
}

[ApiController]
[Authorize]
[Route("api/v1/hr/requests")]
[Route("api/hr/requests")]
public class HrRequestsController : ControllerBase
{
    private readonly IEmployeeRequestService _requestService;
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public HrRequestsController(IEmployeeRequestService requestService, AppDbContext db, AccessService access, AuditService audit)
    {
        _requestService = requestService;
        _db = db;
        _access = access;
        _audit = audit;
    }

    public record RequestDecisionDto(string Action, string? Note); // Action = APPROVE | REJECT

    /// <summary>HCNS xem danh sách đơn chờ duyệt / đã duyệt.</summary>
    [HttpGet]
    public async Task<IActionResult> GetRequests([FromQuery] string? status, [FromQuery] string? branch, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var q = _db.EmployeeRequests
            .Include(r => r.Attachments)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(branch))
        {
            await _access.EnsureBranchAsync(branch, ct);
            var branchComp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Code == branch, ct);
            var empInBranch = await _db.Employees.AsNoTracking().Where(e => branchComp != null && e.CompanyId == branchComp.Id).Select(e => e.EmployeeCode).ToListAsync(ct);
            var assignedInBranch = await _db.EmployeeBranchAssignments.AsNoTracking().Where(a => a.BranchCode == branch && (a.ToDate == null || a.ToDate >= DateTime.Today)).Select(a => a.EmployeeCode).ToListAsync(ct);
            var targetEmpCodes = empInBranch.Concat(assignedInBranch).Distinct().ToList();
            q = q.Where(d => targetEmpCodes.Contains(d.EmployeeCode));
        }
        else
        {
            var allowedEmpCodes = await _access.AllowedEmployeeCodesAsync(ct);
            if (allowedEmpCodes != null)
            {
                q = q.Where(d => allowedEmpCodes.Contains(d.EmployeeCode));
            }
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            q = q.Where(r => r.Status == status);
        }

        var list = await q.OrderByDescending(r => r.CreatedAtUtc).Take(200).ToListAsync(ct);
        var result = list.Select(r => new
        {
            r.RequestId,
            r.RequestType,
            r.EmployeeCode,
            r.LeaveCode,
            fromDate = r.FromDate.ToString("yyyy-MM-dd"),
            toDate = r.ToDate.ToString("yyyy-MM-dd"),
            r.DayPart,
            r.DaysRequested,
            r.ReasonCode,
            r.Reason,
            actualTimeIn = r.ActualTimeIn?.ToString(@"hh\:mm"),
            actualTimeOut = r.ActualTimeOut?.ToString(@"hh\:mm"),
            r.Status,
            r.HRNote,
            createdAt = r.CreatedAtUtc,
            attachmentCount = r.Attachments.Count
        });

        return Ok(result);
    }

    /// <summary>HCNS phê duyệt hoặc từ chối đơn.</summary>
    [HttpPost("{id}/decision")]
    public async Task<IActionResult> DecideRequest(int id, [FromBody] RequestDecisionDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var reqTarget = await _db.EmployeeRequests.AsNoTracking().FirstOrDefaultAsync(r => r.RequestId == id, ct);
        if (reqTarget == null) return NotFound(new { message = "Không tìm thấy đơn." });

        await _access.EnsureEmployeeCodeAsync(reqTarget.EmployeeCode, ct);

        bool approve = dto.Action?.Equals("APPROVE", StringComparison.OrdinalIgnoreCase) == true;
        var req = await _requestService.DecideRequestAsync(id, approve, dto.Note, User.UserId(), ct);

        _audit.Log("Request", req.RequestId, approve ? "ApproveRequest" : "RejectRequest", dto.Note);
        return Ok(new { message = $"Đã { (approve ? "phê duyệt" : "từ chối") } đơn thành công." });
    }
}

[ApiController]
[Authorize]
[Route("api/v1/attachments")]
[Route("api/attachments")]
public class AttachmentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly IConfiguration _config;

    public AttachmentsController(AppDbContext db, AccessService access, IConfiguration config)
    {
        _db = db;
        _access = access;
        _config = config;
    }

    /// <summary>Tải file minh chứng an toàn (kiểm tra quyền truy cập).</summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> DownloadAttachment(int id, CancellationToken ct)
    {
        var att = await _db.RequestAttachments.AsNoTracking().FirstOrDefaultAsync(a => a.AttachmentId == id, ct);
        if (att == null) return NotFound();

        var req = await _db.EmployeeRequests.AsNoTracking().FirstOrDefaultAsync(r => r.RequestId == att.RequestId, ct);
        if (req == null) return NotFound();

        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null) return Unauthorized();

        if (req.EmployeeCode != user.EmployeeCode)
        {
            if (!User.IsHR())
            {
                return StatusCode(403, new { message = "Bạn không có quyền xem tệp đính kèm này." });
            }
            await _access.EnsureEmployeeCodeAsync(req.EmployeeCode, ct);
        }

        var basePath = _config["Storage:EvidencePath"] ?? Path.Combine(AppContext.BaseDirectory, "Storage", "Evidence");
        var filePath = Path.Combine(basePath, att.StoredFileName);

        if (!System.IO.File.Exists(filePath)) return NotFound("Tệp không tồn tại trên máy chủ.");

        var bytes = await System.IO.File.ReadAllBytesAsync(filePath, ct);
        return File(bytes, att.MimeType, att.OriginalFileName);
    }
}
