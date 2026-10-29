using System.Security.Claims;
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
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { code = "NO_EMPLOYEE", message = "Tài khoản chưa liên kết nhân viên." });
        }

        var files = (form.Files != null && form.Files.Count > 0)
            ? form.Files
            : Request.Form.Files.ToList();

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == user.EmployeeCode);
        if (primaryCompanyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        }
        var emp = await empQuery.FirstOrDefaultAsync(ct);
        int? companyId = emp?.CompanyId ?? primaryCompanyId;

        if (form.RequestType?.Equals("LEAVE", StringComparison.OrdinalIgnoreCase) == true)
        {
            var dto = new CreateLeaveDto
            {
                LeaveCode = form.LeaveCode ?? "P",
                FromDate = form.FromDate,
                ToDate = form.ToDate,
                DayPart = form.DayPart,
                Reason = form.Reason ?? "",
                Files = files
            };
            var req = await _requestService.SubmitLeaveRequestAsync(user.EmployeeCode, dto, companyId, ct);
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
                Files = files
            };
            var req = await _requestService.SubmitRegularizationRequestAsync(user.EmployeeCode, dto, companyId, ct);
            _audit.Log("Request", req.RequestId, "SubmitRegularization", form.Reason);
            return Ok(new { req.RequestId, message = "Đã gửi giải trình chấm công thành công." });
        }

        return BadRequest(new { code = "INVALID_TYPE", message = "Loại yêu cầu chỉ chấp nhận LEAVE hoặc REGULARIZATION." });
    }

    /// <summary>Cập nhật đơn (Nghỉ phép hoặc Giải trình) khi đang chờ duyệt PENDING_HR.</summary>
    [HttpPut("{id}")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UpdateRequest(int id, [FromForm] SubmitRequestForm form, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode))
        {
            return BadRequest(new { code = "NO_EMPLOYEE", message = "Tài khoản chưa liên kết nhân viên." });
        }

        var files = (form.Files != null && form.Files.Count > 0)
            ? form.Files
            : Request.Form.Files.ToList();

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;
        var empQuery = _db.Employees.AsNoTracking().Where(e => e.EmployeeCode == user.EmployeeCode);
        if (primaryCompanyId.HasValue)
        {
            empQuery = empQuery.Where(e => e.CompanyId == primaryCompanyId.Value);
        }
        var emp = await empQuery.FirstOrDefaultAsync(ct);
        int? companyId = emp?.CompanyId ?? primaryCompanyId;

        if (form.RequestType?.Equals("LEAVE", StringComparison.OrdinalIgnoreCase) == true)
        {
            var dto = new CreateLeaveDto
            {
                LeaveCode = form.LeaveCode ?? "P",
                FromDate = form.FromDate,
                ToDate = form.ToDate,
                DayPart = form.DayPart,
                Reason = form.Reason ?? "",
                Files = files
            };
            var req = await _requestService.UpdateLeaveRequestAsync(id, user.EmployeeCode, dto, companyId, ct);
            _audit.Log("Request", req.RequestId, "UpdateLeave", form.Reason);
            return Ok(new { req.RequestId, message = "Đã cập nhật đơn nghỉ phép thành công." });
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
                Files = files
            };
            var req = await _requestService.UpdateRegularizationRequestAsync(id, user.EmployeeCode, dto, companyId, ct);
            _audit.Log("Request", req.RequestId, "UpdateRegularization", form.Reason);
            return Ok(new { req.RequestId, message = "Đã cập nhật giải trình chấm công thành công." });
        }

        return BadRequest(new { code = "INVALID_TYPE", message = "Loại yêu cầu chỉ chấp nhận LEAVE hoặc REGULARIZATION." });
    }

    /// <summary>Xem danh sách đơn của tôi.</summary>
    [HttpGet("mine")]
    public async Task<IActionResult> GetMyRequests([FromQuery] string? status, CancellationToken ct)
    {
        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().Include(u => u.Companies).FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null || string.IsNullOrWhiteSpace(user.EmployeeCode)) return Ok(new List<object>());

        var primaryCompanyId = user.Companies.FirstOrDefault()?.CompanyId;

        var q = _db.EmployeeRequests
            .Include(r => r.Attachments)
            .AsNoTracking()
            .Where(r => r.EmployeeCode == user.EmployeeCode);

        if (primaryCompanyId.HasValue)
        {
            q = q.Where(r => r.CompanyId == primaryCompanyId.Value || r.CompanyId == null);
        }

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
            attachmentCount = r.Attachments.Count,
            attachments = r.Attachments.Select(a => new
            {
                a.AttachmentId,
                a.OriginalFileName,
                a.FileSizeBytes,
                a.MimeType
            })
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
[Authorize(Policy = "RequireHR")]
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
    public record BatchDecisionDto(List<int> RequestIds, string Action, string? Note);
    public record BatchDeleteDto(List<int> RequestIds);

    /// <summary>HCNS xem danh sách đơn chờ duyệt / đã duyệt.</summary>
    [HttpGet]
    public async Task<IActionResult> GetRequests([FromQuery] string? status, [FromQuery] string? branch, [FromQuery] string? type, CancellationToken ct)
    {
        var q = _db.EmployeeRequests
            .Include(r => r.Attachments)
            .AsNoTracking();

        Company? branchComp = null;
        if (!string.IsNullOrWhiteSpace(branch))
        {
            await _access.EnsureBranchAsync(branch, ct);
            branchComp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Code == branch, ct);
            if (branchComp != null)
            {
                var empInBranch = await _db.Employees.AsNoTracking().Where(e => e.CompanyId == branchComp.Id).Select(e => e.EmployeeCode).ToListAsync(ct);
                var assignedInBranch = await _db.EmployeeBranchAssignments.AsNoTracking().Where(a => a.BranchCode == branch && (a.ToDate == null || a.ToDate >= DateTime.Today)).Select(a => a.EmployeeCode).ToListAsync(ct);
                var targetEmpCodes = empInBranch.Concat(assignedInBranch).Distinct().ToList();
                q = q.Where(d => d.CompanyId == branchComp.Id || (d.CompanyId == null && targetEmpCodes.Contains(d.EmployeeCode)));
            }
        }
        else
        {
            var allowedCodes = await _access.AllowedBranchCodesAsync(ct);
            if (allowedCodes != null)
            {
                var allowedCompIds = await _db.Companies.AsNoTracking().Where(c => allowedCodes.Contains(c.Code)).Select(c => c.Id).ToListAsync(ct);
                var allowedEmpCodes = await _access.AllowedEmployeeCodesAsync(ct);
                q = q.Where(d => (d.CompanyId != null && allowedCompIds.Contains(d.CompanyId.Value)) || (allowedEmpCodes != null && allowedEmpCodes.Contains(d.EmployeeCode)));
            }
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            q = q.Where(r => r.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(type))
        {
            var upperType = type.Trim().ToUpperInvariant();
            q = q.Where(r => r.RequestType == upperType);
        }

        var list = await q.OrderByDescending(r => r.CreatedAtUtc).Take(300).ToListAsync(ct);
        var empCodes = list.Select(r => r.EmployeeCode).Distinct().ToList();
        var compIds = list.Select(r => r.CompanyId).Where(c => c.HasValue).Select(c => c!.Value).Distinct().ToList();
        var empQuery = _db.Employees.AsNoTracking().Where(e => empCodes.Contains(e.EmployeeCode));
        if (compIds.Any())
        {
            empQuery = empQuery.Where(e => compIds.Contains(e.CompanyId));
        }

        var empList = await empQuery
            .Select(e => new { e.EmployeeCode, e.FullName, e.DepartmentId, e.CompanyId })
            .ToListAsync(ct);

        var empDict = empList
            .GroupBy(e => $"{e.CompanyId}_{e.EmployeeCode}", StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var deptIds = empList.Where(e => e.DepartmentId.HasValue).Select(e => e.DepartmentId!.Value).Distinct().ToList();
        var deptList = await _db.Departments.AsNoTracking()
            .Where(d => deptIds.Contains(d.Id))
            .Select(d => new { d.Id, d.Name })
            .ToListAsync(ct);
        var deptDict = deptList
            .GroupBy(d => d.Id)
            .ToDictionary(g => g.Key, g => g.First().Name);

        var result = list.Select(r =>
        {
            string empKey = r.CompanyId.HasValue ? $"{r.CompanyId}_{r.EmployeeCode}" : r.EmployeeCode;
            if (!empDict.TryGetValue(empKey, out var empInfo))
            {
                empInfo = empList.FirstOrDefault(e => string.Equals(e.EmployeeCode, r.EmployeeCode, StringComparison.OrdinalIgnoreCase));
            }
            string? deptName = null;
            if (empInfo?.DepartmentId != null) deptDict.TryGetValue(empInfo.DepartmentId.Value, out deptName);

            return new
            {
                r.RequestId,
                r.RequestType,
                r.EmployeeCode,
                fullName = empInfo?.FullName ?? r.EmployeeCode,
                departmentName = deptName ?? "",
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
                attachmentCount = r.Attachments.Count,
                attachments = r.Attachments.Select(a => new
                {
                    a.AttachmentId,
                    a.OriginalFileName,
                    a.FileSizeBytes,
                    a.MimeType
                })
            };
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

        await _access.EnsureEmployeeCodeAsync(reqTarget.EmployeeCode, reqTarget.CompanyId, ct);

        bool approve = dto.Action?.Equals("APPROVE", StringComparison.OrdinalIgnoreCase) == true;
        var req = await _requestService.DecideRequestAsync(id, approve, dto.Note, User.UserId(), ct);

        _audit.Log("Request", req.RequestId, approve ? "ApproveRequest" : "RejectRequest", dto.Note);
        return Ok(new { message = $"Đã { (approve ? "phê duyệt" : "từ chối") } đơn thành công." });
    }

    /// <summary>HCNS phê duyệt hoặc từ chối hàng loạt đơn.</summary>
    [HttpPost("batch-decision")]
    public async Task<IActionResult> BatchDecideRequests([FromBody] BatchDecisionDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        if (dto.RequestIds == null || dto.RequestIds.Count == 0)
        {
            return BadRequest(new { message = "Danh sách đơn cần xử lý không được rỗng." });
        }

        bool approve = dto.Action?.Equals("APPROVE", StringComparison.OrdinalIgnoreCase) == true;
        int successCount = 0;
        var errors = new List<string>();

        foreach (var id in dto.RequestIds)
        {
            try
            {
                var reqTarget = await _db.EmployeeRequests.AsNoTracking().FirstOrDefaultAsync(r => r.RequestId == id, ct);
                if (reqTarget == null) continue;

                await _access.EnsureEmployeeCodeAsync(reqTarget.EmployeeCode, reqTarget.CompanyId, ct);
                await _requestService.DecideRequestAsync(id, approve, dto.Note, User.UserId(), ct);
                _audit.Log("Request", id, approve ? "BatchApprove" : "BatchReject", dto.Note);
                successCount++;
            }
            catch (Exception ex)
            {
                errors.Add($"Đơn #{id}: {ex.Message}");
            }
        }

        return Ok(new
        {
            success = true,
            successCount,
            totalCount = dto.RequestIds.Count,
            errors,
            message = $"Đã xử lý {(approve ? "phê duyệt" : "từ chối")} thành công {successCount}/{dto.RequestIds.Count} đơn."
        });
    }

    /// <summary>HCNS xóa đơn (kể cả đơn đã duyệt do duyệt nhầm ngày hoặc sai thông tin).</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteRequest(int id, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });

        var reqTarget = await _db.EmployeeRequests.AsNoTracking().FirstOrDefaultAsync(r => r.RequestId == id, ct);
        if (reqTarget == null) return NotFound(new { message = "Không tìm thấy đơn." });

        await _access.EnsureEmployeeCodeAsync(reqTarget.EmployeeCode, reqTarget.CompanyId, ct);

        await _requestService.DeleteRequestByHrAsync(id, User.UserId(), ct);
        _audit.Log("Request", id, "DeleteRequest", $"HCNS xóa đơn {reqTarget.RequestType} ngày {reqTarget.FromDate:dd/MM/yyyy} của nhân viên {reqTarget.EmployeeCode}", reqTarget.CompanyId);
        return Ok(new { message = "Đã xóa đơn thành công." });
    }

    /// <summary>HCNS xóa hàng loạt đơn.</summary>
    [HttpPost("batch-delete")]
    public async Task<IActionResult> BatchDeleteRequests([FromBody] BatchDeleteDto dto, CancellationToken ct)
    {
        if (!User.IsHR()) return StatusCode(403, new { message = "Bạn không có quyền HCNS." });
        if (dto.RequestIds == null || dto.RequestIds.Count == 0)
        {
            return BadRequest(new { message = "Danh sách đơn cần xóa không được rỗng." });
        }

        int successCount = 0;
        var errors = new List<string>();

        foreach (var id in dto.RequestIds)
        {
            try
            {
                var reqTarget = await _db.EmployeeRequests.AsNoTracking().FirstOrDefaultAsync(r => r.RequestId == id, ct);
                if (reqTarget == null) continue;

                await _access.EnsureEmployeeCodeAsync(reqTarget.EmployeeCode, reqTarget.CompanyId, ct);
                await _requestService.DeleteRequestByHrAsync(id, User.UserId(), ct);
                _audit.Log("Request", id, "BatchDelete", $"HCNS xóa đơn {reqTarget.RequestType} #{id}", reqTarget.CompanyId);
                successCount++;
            }
            catch (Exception ex)
            {
                errors.Add($"Đơn #{id}: {ex.Message}");
            }
        }

        return Ok(new
        {
            success = true,
            successCount,
            totalCount = dto.RequestIds.Count,
            errors,
            message = $"Đã xóa thành công {successCount}/{dto.RequestIds.Count} đơn."
        });
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
    private readonly ITokenService _tokenService;

    public AttachmentsController(AppDbContext db, AccessService access, IConfiguration config, ITokenService tokenService)
    {
        _db = db;
        _access = access;
        _config = config;
        _tokenService = tokenService;
    }

    /// <summary>Tải hoặc xem trực tiếp file minh chứng (hỗ trợ Header Bearer hoặc query token cho thẻ img/link tải).</summary>
    [HttpGet("{id}")]
    [AllowAnonymous]
    public async Task<IActionResult> DownloadAttachment(
        int id,
        [FromQuery] string? token = null,
        [FromQuery] bool download = false,
        CancellationToken ct = default)
    {
        var att = await _db.RequestAttachments.AsNoTracking().FirstOrDefaultAsync(a => a.AttachmentId == id, ct);
        if (att == null) return NotFound(new { message = "Không tìm thấy tệp đính kèm." });

        var req = await _db.EmployeeRequests.AsNoTracking().FirstOrDefaultAsync(r => r.RequestId == att.RequestId, ct);
        if (req == null) return NotFound(new { message = "Không tìm thấy đơn yêu cầu liên quan." });

        ClaimsPrincipal? currentPrincipal = (User?.Identity?.IsAuthenticated == true) ? User : null;
        if (currentPrincipal == null && !string.IsNullOrWhiteSpace(token))
        {
            currentPrincipal = _tokenService.ValidateToken(token);
            if (currentPrincipal != null)
            {
                HttpContext.User = currentPrincipal;
            }
        }

        if (currentPrincipal == null)
        {
            return Unauthorized(new { message = "Yêu cầu đăng nhập hoặc token không hợp lệ." });
        }

        var uid = currentPrincipal.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null) return Unauthorized(new { message = "Người dùng không tồn tại." });

        if (req.EmployeeCode != user.EmployeeCode)
        {
            if (!currentPrincipal.IsHR())
            {
                return StatusCode(403, new { message = "Bạn không có quyền xem tệp đính kèm này." });
            }
            await _access.EnsureEmployeeCodeAsync(req.EmployeeCode, req.CompanyId, ct);
        }

        var basePath = _config["Storage:EvidencePath"] ?? Path.Combine(AppContext.BaseDirectory, "Storage", "Evidence");
        var filePath = Path.Combine(basePath, att.StoredFileName);

        if (!System.IO.File.Exists(filePath)) return NotFound("Tệp không tồn tại trên máy chủ.");

        var bytes = await System.IO.File.ReadAllBytesAsync(filePath, ct);

        if (download)
        {
            return File(bytes, att.MimeType, att.OriginalFileName);
        }

        Response.Headers["Content-Disposition"] = "inline; filename=\"" + Uri.EscapeDataString(att.OriginalFileName) + "\"";
        return File(bytes, att.MimeType);
    }

    /// <summary>Xóa tệp đính kèm khi đơn đang chờ duyệt (PENDING_HR).</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteAttachment(int id, CancellationToken ct)
    {
        var att = await _db.RequestAttachments.FirstOrDefaultAsync(a => a.AttachmentId == id, ct);
        if (att == null) return NotFound(new { message = "Không tìm thấy tệp đính kèm." });

        var req = await _db.EmployeeRequests.FirstOrDefaultAsync(r => r.RequestId == att.RequestId, ct);
        if (req == null) return NotFound(new { message = "Không tìm thấy đơn." });

        if (req.Status != "PENDING_HR")
        {
            return BadRequest(new { message = "Chỉ có thể xóa tệp minh chứng khi đơn đang chờ duyệt." });
        }

        var uid = User.UserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user == null) return Unauthorized();

        if (req.EmployeeCode != user.EmployeeCode && !User.IsHR())
        {
            return StatusCode(403, new { message = "Bạn không có quyền xóa tệp đính kèm này." });
        }

        try
        {
            var basePath = _config["Storage:EvidencePath"] ?? Path.Combine(AppContext.BaseDirectory, "Storage", "Evidence");
            var filePath = Path.Combine(basePath, att.StoredFileName);
            if (System.IO.File.Exists(filePath))
            {
                System.IO.File.Delete(filePath);
            }
        }
        catch { }

        _db.RequestAttachments.Remove(att);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã xóa tệp đính kèm thành công." });
    }
}
