using ClosedXML.Excel;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Engine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/companies/{companyId}/employees")]
[Authorize]
public class EmployeesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public EmployeesController(AppDbContext db, AccessService access, AuditService audit)
    {
        _db = db;
        _access = access;
        _audit = audit;
    }

    public record EmployeeDto(
        int Id,
        int CompanyId,
        string EmployeeCode,
        string FullName,
        int? DepartmentId,
        string? DepartmentName,
        int GroupId,
        string GroupName,
        DateTime StartDate,
        DateTime? EndDate,
        bool ExemptPunch,
        string? DefaultNote,
        int SortOrder,
        DateTime CreatedAt);

    public class SaveEmployeeDto
    {
        public string EmployeeCode { get; set; } = "";
        public string FullName { get; set; } = "";
        public int? DepartmentId { get; set; }
        public int GroupId { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public bool ExemptPunch { get; set; }
        public string? DefaultNote { get; set; }
        public int SortOrder { get; set; }
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(int companyId, [FromQuery] string? keyword, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);

        var q = _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == companyId);

        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var kw = keyword.Trim().ToLower();
            q = q.Where(e => e.FullName.ToLower().Contains(kw) || e.EmployeeCode.ToLower().Contains(kw));
        }

        var emps = await q.OrderBy(e => e.SortOrder).ThenBy(e => e.EmployeeCode).ToListAsync(ct);
        var depts = await _db.Departments.AsNoTracking().Where(d => d.CompanyId == companyId).ToDictionaryAsync(d => d.Id, d => d.Name, ct);
        var grps = await _db.EmployeeGroups.AsNoTracking().Where(g => g.CompanyId == companyId).ToDictionaryAsync(g => g.Id, g => g.Name, ct);

        var list = emps.Select(e => new EmployeeDto(
            e.Id,
            e.CompanyId,
            e.EmployeeCode,
            e.FullName,
            e.DepartmentId,
            e.DepartmentId.HasValue && depts.TryGetValue(e.DepartmentId.Value, out var dn) ? dn : null,
            e.GroupId,
            grps.TryGetValue(e.GroupId, out var gn) ? gn : "",
            e.StartDate,
            e.EndDate,
            e.ExemptPunch,
            e.DefaultNote,
            e.SortOrder,
            e.CreatedAt
        )).ToList();

        return Ok(list);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int companyId, int id, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var e = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.CompanyId == companyId, ct);
        if (e == null) return NotFound();

        var depts = await _db.Departments.AsNoTracking().Where(d => d.CompanyId == companyId).ToDictionaryAsync(d => d.Id, d => d.Name, ct);
        var grps = await _db.EmployeeGroups.AsNoTracking().Where(g => g.CompanyId == companyId).ToDictionaryAsync(g => g.Id, g => g.Name, ct);

        return Ok(new EmployeeDto(
            e.Id, e.CompanyId, e.EmployeeCode, e.FullName,
            e.DepartmentId, e.DepartmentId.HasValue && depts.TryGetValue(e.DepartmentId.Value, out var dn) ? dn : null,
            e.GroupId, grps.TryGetValue(e.GroupId, out var gn) ? gn : "",
            e.StartDate, e.EndDate, e.ExemptPunch, e.DefaultNote, e.SortOrder, e.CreatedAt
        ));
    }

    [HttpPost]
    public async Task<IActionResult> Create(int companyId, [FromBody] SaveEmployeeDto dto, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var code = Text.Required(dto.EmployeeCode, "Mã nhân viên", 30).Trim();
        var name = Text.Required(dto.FullName, "Họ và tên", 150);

        if (await _db.Employees.AnyAsync(e => e.CompanyId == companyId && e.EmployeeCode == code, ct))
        {
            return BadRequest(new { message = $"Mã nhân viên '{code}' đã tồn tại trong hội sở." });
        }

        var emp = new Employee
        {
            CompanyId = companyId,
            EmployeeCode = code,
            FullName = name,
            DepartmentId = dto.DepartmentId,
            GroupId = dto.GroupId,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            ExemptPunch = dto.ExemptPunch,
            DefaultNote = Text.Clean(dto.DefaultNote, 500),
            SortOrder = dto.SortOrder,
            CreatedAt = DateTime.Now
        };

        _db.Employees.Add(emp);
        await _db.SaveChangesAsync(ct);

        _audit.Log("Employee", emp.Id, "Create", new { code, name }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetById), new { companyId, id = emp.Id }, emp);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int companyId, int id, [FromBody] SaveEmployeeDto dto, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == id && e.CompanyId == companyId, ct);
        if (emp == null) return NotFound();

        var code = Text.Required(dto.EmployeeCode, "Mã nhân viên", 30).Trim();
        var name = Text.Required(dto.FullName, "Họ và tên", 150);

        if (await _db.Employees.AnyAsync(e => e.CompanyId == companyId && e.EmployeeCode == code && e.Id != id, ct))
        {
            return BadRequest(new { message = $"Mã nhân viên '{code}' đã tồn tại trong hội sở." });
        }

        emp.EmployeeCode = code;
        emp.FullName = name;
        emp.DepartmentId = dto.DepartmentId;
        emp.GroupId = dto.GroupId;
        emp.StartDate = dto.StartDate;
        emp.EndDate = dto.EndDate;
        emp.ExemptPunch = dto.ExemptPunch;
        emp.DefaultNote = Text.Clean(dto.DefaultNote, 500);
        emp.SortOrder = dto.SortOrder;

        _audit.Log("Employee", emp.Id, "Update", new { code, name }, companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Cập nhật nhân viên thành công." });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int companyId, int id, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == id && e.CompanyId == companyId, ct);
        if (emp == null) return NotFound();

        // Ràng buộc: Nhân viên đã có dữ liệu trong kỳ công thì không được xóa, chỉ đánh dấu ngày nghỉ việc
        if (await _db.DayResults.AnyAsync(r => r.EmployeeId == id, ct) || await _db.RawPunches.AnyAsync(p => p.EmployeeId == id, ct))
        {
            return BadRequest(new { message = "Nhân viên đã có dữ liệu chấm công trong các kỳ, không được xóa khỏi hệ thống. Vui lòng thiết lập 'Ngày nghỉ việc' để kết thúc làm việc." });
        }

        var funds = await _db.LeaveFunds.Where(f => f.EmployeeId == id).ToListAsync(ct);
        if (funds.Count > 0) _db.LeaveFunds.RemoveRange(funds);

        var ledger = await _db.LeaveLedger.Where(l => l.EmployeeId == id).ToListAsync(ct);
        if (ledger.Count > 0) _db.LeaveLedger.RemoveRange(ledger);

        var requests = await _db.LeaveRequests.Where(r => r.EmployeeId == id).ToListAsync(ct);
        if (requests.Count > 0) _db.LeaveRequests.RemoveRange(requests);

        var notes = await _db.PeriodNotes.Where(n => n.EmployeeId == id).ToListAsync(ct);
        if (notes.Count > 0) _db.PeriodNotes.RemoveRange(notes);

        _db.Employees.Remove(emp);
        _audit.Log("Employee", emp.Id, "Delete", $"Xóa nhân viên {emp.EmployeeCode} - {emp.FullName}", companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = "Đã xóa nhân viên." });
    }

    [HttpGet("template-excel")]
    public IActionResult DownloadTemplateExcel()
    {
        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("DanhSachNhanVien");

        var headers = new[]
        {
            "Mã nhân viên (*)",
            "Họ và tên (*)",
            "Phòng ban / Vị trí",
            "Khối nhân viên",
            "Ngày vào làm (DD/MM/YYYY)",
            "Miễn quẹt thẻ (CÓ/KHÔNG)",
            "Ghi chú mặc định"
        };

        for (int i = 0; i < headers.Length; i++)
        {
            var cell = ws.Cell(1, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#1e40af");
            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        }
        ws.Row(1).Height = 28;

        // Dữ liệu mẫu minh họa
        var samples = new[]
        {
            new { Code = "SB001", Name = "Nguyễn Thị Mai", Dept = "Đào tạo", Group = "STANDARD", Date = "01/01/2024", Exempt = "KHÔNG", Note = "Giáo viên Toán trí tuệ" },
            new { Code = "SB002", Name = "Trần Văn Hùng", Dept = "Kinh doanh", Group = "STANDARD", Date = "15/03/2024", Exempt = "KHÔNG", Note = "Chuyên viên tư vấn" },
            new { Code = "SB003", Name = "Lê Hoàng Yến", Dept = "Ban Giám Đốc", Group = "REMOTE", Date = "01/06/2023", Exempt = "CÓ", Note = "Giám đốc chuyên môn (Miễn quẹt)" },
        };

        for (int i = 0; i < samples.Length; i++)
        {
            int r = i + 2;
            var s = samples[i];
            ws.Cell(r, 1).SetValue(s.Code);
            ws.Cell(r, 2).SetValue(s.Name);
            ws.Cell(r, 3).SetValue(s.Dept);
            ws.Cell(r, 4).SetValue(s.Group);
            ws.Cell(r, 5).SetValue(s.Date);
            ws.Cell(r, 6).SetValue(s.Exempt);
            ws.Cell(r, 7).SetValue(s.Note);
        }

        ws.Columns(1, headers.Length).AdjustToContents(12, 45);

        using var memory = new MemoryStream();
        workbook.SaveAs(memory);
        var bytes = memory.ToArray();

        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Mau_Danh_Sach_Nhan_Vien_Superbrain.xlsx");
    }

    [HttpPost("import-excel")]
    public async Task<IActionResult> ImportExcel(int companyId, IFormFile file, CancellationToken ct)
    {
        await _access.EnsureCompanyAsync(companyId, ct);

        using var stream = file.OpenReadStream();
        using var workbook = new XLWorkbook(stream);
        var ws = workbook.Worksheets.First();

        var existingCodes = (await _db.Employees.Where(e => e.CompanyId == companyId).Select(e => e.EmployeeCode).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var groups = await _db.EmployeeGroups.Where(g => g.CompanyId == companyId).ToListAsync(ct);
        var defaultGroup = groups.FirstOrDefault(g => g.IsDefault) ?? groups.First();

        var depts = await _db.Departments.Where(d => d.CompanyId == companyId).ToListAsync(ct);
        var deptMap = depts.ToDictionary(d => d.Name.Trim().ToLowerInvariant(), d => d);

        int importedCount = 0;
        var errors = new List<string>();

        int lastRow = ws.LastRowUsed()?.RowNumber() ?? 1;
        for (int r = 2; r <= lastRow; r++)
        {
            var empCode = ws.Cell(r, 1).GetString().Trim();
            var fullName = ws.Cell(r, 2).GetString().Trim();
            var deptName = ws.Cell(r, 3).GetString().Trim();
            var groupCodeOrName = ws.Cell(r, 4).GetString().Trim();
            var dateVal = ws.Cell(r, 5).Value;
            var exemptStr = ws.Cell(r, 6).GetString().Trim().ToUpperInvariant();
            var note = ws.Cell(r, 7).GetString().Trim();

            if (string.IsNullOrEmpty(empCode) || string.IsNullOrEmpty(fullName)) continue;

            if (existingCodes.Contains(empCode))
            {
                errors.Add($"Dòng {r}: Mã nhân viên '{empCode}' đã tồn tại trong hội sở.");
                continue;
            }

            // Xử lý bộ phận (Department)
            int? deptId = null;
            if (!string.IsNullOrEmpty(deptName))
            {
                var lowerDept = deptName.ToLowerInvariant();
                if (deptMap.TryGetValue(lowerDept, out var existingDept))
                {
                    deptId = existingDept.Id;
                }
                else
                {
                    var newDept = new Department { CompanyId = companyId, Name = deptName, SortOrder = depts.Count + 1 };
                    _db.Departments.Add(newDept);
                    await _db.SaveChangesAsync(ct);
                    depts.Add(newDept);
                    deptMap[lowerDept] = newDept;
                    deptId = newDept.Id;
                }
            }

            // Xử lý khối nhân viên (Group)
            int targetGroupId = defaultGroup.Id;
            if (!string.IsNullOrEmpty(groupCodeOrName))
            {
                var matched = groups.FirstOrDefault(g =>
                    string.Equals(g.Code, groupCodeOrName, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(g.Name, groupCodeOrName, StringComparison.OrdinalIgnoreCase) ||
                    (groupCodeOrName.Contains("part", StringComparison.OrdinalIgnoreCase) && g.Code.Contains("PART")) ||
                    (groupCodeOrName.Contains("remote", StringComparison.OrdinalIgnoreCase) && g.Code.Contains("REMOTE"))
                );
                if (matched != null)
                {
                    targetGroupId = matched.Id;
                }
            }

            // Xử lý ngày vào làm
            DateTime startDate = DateTime.Now.Date;
            if (dateVal.IsDateTime)
            {
                startDate = dateVal.GetDateTime().Date;
            }
            else if (DateTime.TryParse(ws.Cell(r, 5).GetString().Trim(), out var parsedDate))
            {
                startDate = parsedDate.Date;
            }

            // Miễn quẹt thẻ BoD
            bool exempt = exemptStr is "CÓ" or "CO" or "YES" or "1" or "TRUE" or "X";

            var emp = new Employee
            {
                CompanyId = companyId,
                EmployeeCode = empCode,
                FullName = fullName,
                DepartmentId = deptId,
                GroupId = targetGroupId,
                StartDate = startDate,
                ExemptPunch = exempt,
                DefaultNote = string.IsNullOrEmpty(note) ? null : note,
                SortOrder = importedCount + 1,
                CreatedAt = DateTime.Now
            };

            _db.Employees.Add(emp);
            existingCodes.Add(empCode);
            importedCount++;
        }

        await _db.SaveChangesAsync(ct);
        _audit.Log("Employee", null, "ImportExcel", $"Import thành công {importedCount} nhân viên, {errors.Count} lỗi", companyId: companyId);
        await _db.SaveChangesAsync(ct);

        return Ok(new { importedCount, errors });
    }
}
