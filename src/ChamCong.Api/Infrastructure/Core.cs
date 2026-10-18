using System.Security.Claims;
using System.Text.Json;
using ChamCong.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Infrastructure;

/// <summary>Lỗi nghiệp vụ trả về cho client với mã HTTP tương ứng.</summary>
public class AppException : Exception
{
    public int Status { get; }
    public object? Data2 { get; }
    public AppException(int status, string message, object? data = null) : base(message) { Status = status; Data2 = data; }
    public static AppException NotFound(string msg = "Dữ liệu không tồn tại hoặc bạn không có quyền truy cập.") => new(404, msg);
    public static AppException Forbidden(string msg = "Bạn không có quyền thực hiện thao tác này.") => new(403, msg);
    public static AppException Bad(string msg, object? data = null) => new(400, msg, data);
    public static AppException Conflict(string msg) => new(409, msg);
}

public static class ClaimsExtensions
{
    public static int UserId(this ClaimsPrincipal u) => int.Parse(u.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");
    public static string Username(this ClaimsPrincipal u) => u.FindFirstValue(ClaimTypes.Name) ?? "";
    public static string GetEmployeeCode(this ClaimsPrincipal u) => u.FindFirstValue("EmployeeCode") ?? "";
    public static bool IsAdmin(this ClaimsPrincipal u) => u.IsInRole(Roles.Admin) || u.IsInRole("ADMIN");
    public static bool IsHR(this ClaimsPrincipal u) => IsAdmin(u) || u.IsInRole(Roles.HR) || u.IsInRole("HR") || u.IsInRole("OPERATOR") || u.IsInRole("Operator");
    public static bool IsOperator(this ClaimsPrincipal u) => IsHR(u);
    public static bool IsStaffOrAbove(this ClaimsPrincipal u) => IsHR(u);
    public static bool IsEmployee(this ClaimsPrincipal u) => u.IsInRole(Roles.Employee) || u.IsInRole("EMPLOYEE");
}

/// <summary>Kiểm soát truy cập theo hội sở (chống BOLA/IDOR): mọi truy vấn theo Id đều đi qua đây.</summary>
public class AccessService
{
    private readonly AppDbContext _db;
    private readonly IHttpContextAccessor _http;
    private HashSet<int>? _allowed;

    public AccessService(AppDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public ClaimsPrincipal User => _http.HttpContext!.User;
    public string Username => User.Username();
    public bool IsAdmin => User.IsAdmin();

    /// <summary>null = toàn quyền (Admin).</summary>
    public async Task<HashSet<int>?> AllowedCompanyIdsAsync(CancellationToken ct = default)
    {
        if (IsAdmin) return null;
        if (_allowed != null) return _allowed;
        var uid = User.UserId();
        _allowed = (await _db.UserCompanies.AsNoTracking().Where(x => x.UserId == uid).Select(x => x.CompanyId).ToListAsync(ct)).ToHashSet();
        return _allowed;
    }

    public async Task EnsureCompanyAsync(int companyId, CancellationToken ct = default)
    {
        var allowed = await AllowedCompanyIdsAsync(ct);
        if (allowed != null && !allowed.Contains(companyId)) throw AppException.NotFound();
    }

    /// <summary>Danh sách mã hội sở được phép truy cập (null = toàn quyền Admin).</summary>
    public async Task<HashSet<string>?> AllowedBranchCodesAsync(CancellationToken ct = default)
    {
        if (IsAdmin) return null;
        var allowed = await AllowedCompanyIdsAsync(ct);
        if (allowed == null) return null;
        var codes = await _db.Companies.AsNoTracking()
            .Where(c => allowed.Contains(c.Id))
            .Select(c => c.Code)
            .ToListAsync(ct);
        return codes.ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>Bảo vệ chống BOLA: Kiểm tra xem user có quyền quản trị hội sở này không.</summary>
    public async Task EnsureBranchAsync(string branchCode, CancellationToken ct = default)
    {
        if (IsAdmin) return;
        var allowed = await AllowedBranchCodesAsync(ct);
        if (allowed != null && !allowed.Contains(branchCode))
        {
            throw AppException.Forbidden($"Bạn không có quyền quản lý cấu hình của cơ sở '{branchCode}'.");
        }
    }

    /// <summary>Danh sách mã nhân viên thuộc các cơ sở được phân quyền (null = toàn quyền Admin).</summary>
    public async Task<HashSet<string>?> AllowedEmployeeCodesAsync(CancellationToken ct = default)
    {
        if (IsAdmin) return null;
        var allowedCompanyIds = await AllowedCompanyIdsAsync(ct);
        if (allowedCompanyIds == null) return null;

        var branchCodes = await AllowedBranchCodesAsync(ct) ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var directEmpCodes = await _db.Employees.AsNoTracking()
            .Where(e => allowedCompanyIds.Contains(e.CompanyId))
            .Select(e => e.EmployeeCode)
            .ToListAsync(ct);

        var assignedEmpCodes = await _db.EmployeeBranchAssignments.AsNoTracking()
            .Where(a => branchCodes.Contains(a.BranchCode) && (a.ToDate == null || a.ToDate >= DateTime.Today))
            .Select(a => a.EmployeeCode)
            .ToListAsync(ct);

        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var code in directEmpCodes) set.Add(code);
        foreach (var code in assignedEmpCodes) set.Add(code);
        return set;
    }

    /// <summary>Bảo vệ chống BOLA: Kiểm tra xem nhân viên này có thuộc cơ sở của user không.</summary>
    public async Task EnsureEmployeeCodeAsync(string employeeCode, int? companyId = null, CancellationToken ct = default)
    {
        if (IsAdmin) return;
        var allowedCompanies = await AllowedCompanyIdsAsync(ct);
        if (allowedCompanies != null && companyId.HasValue && !allowedCompanies.Contains(companyId.Value))
        {
            throw AppException.Forbidden($"Bạn không có quyền quản trị nhân sự '{employeeCode}' thuộc cơ sở khác.");
        }
        var allowed = await AllowedEmployeeCodesAsync(ct);
        if (allowed != null && !allowed.Contains(employeeCode))
        {
            throw AppException.Forbidden($"Bạn không có quyền quản trị nhân sự '{employeeCode}' thuộc cơ sở khác.");
        }
    }

    public async Task<Period> GetPeriodAsync(int periodId, bool tracking = false, CancellationToken ct = default)
    {
        var q = tracking ? _db.Periods : _db.Periods.AsNoTracking();
        var p = await q.FirstOrDefaultAsync(x => x.Id == periodId, ct) ?? throw AppException.NotFound();
        await EnsureCompanyAsync(p.CompanyId, ct);
        return p;
    }

    public async Task<Employee> GetEmployeeAsync(int employeeId, CancellationToken ct = default)
    {
        var e = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(x => x.Id == employeeId, ct) ?? throw AppException.NotFound();
        await EnsureCompanyAsync(e.CompanyId, ct);
        return e;
    }

    public void EnsureAdmin()
    {
        if (!IsAdmin) throw AppException.Forbidden("Yêu cầu quyền Quản trị viên (Admin).");
    }

    public void EnsureHR()
    {
        if (!User.IsHR()) throw AppException.Forbidden("Yêu cầu quyền Quản trị nhân sự (HR).");
    }

    public void EnsureOperatorOrAdmin()
    {
        if (!User.IsOperator()) throw AppException.Forbidden("Yêu cầu quyền Vận hành chấm công (Operator) hoặc Quản trị viên.");
    }

    public void EnsureStaffOrAbove()
    {
        if (!User.IsStaffOrAbove()) throw AppException.Forbidden("Tài khoản nhân viên không có quyền truy cập chức năng này.");
    }
}

/// <summary>Nhật ký thao tác — chỉ thêm, không sửa/xóa.</summary>
public class AuditService
{
    private readonly AppDbContext _db;
    private readonly IHttpContextAccessor _http;
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = false, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public AuditService(AppDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    /// <summary>Thêm bản ghi nhật ký vào context (được lưu cùng SaveChanges của thao tác).</summary>
    public void Log(string entity, object? entityId, string action, object? detail = null, int? companyId = null, int? periodId = null)
    {
        var u = _http.HttpContext?.User;
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = u?.Identity?.IsAuthenticated == true ? u.UserId() : null,
            Username = u?.Identity?.IsAuthenticated == true ? u.Username() : "(hệ thống)",
            Entity = entity,
            EntityId = entityId?.ToString(),
            Action = action,
            Detail = detail switch { null => null, string s => s, _ => JsonSerializer.Serialize(detail, Json) },
            CompanyId = companyId,
            PeriodId = periodId,
        });
    }
}

public static class Text
{
    /// <summary>Làm sạch chuỗi nhập: cắt khoảng trắng, bỏ ký tự điều khiển, giới hạn độ dài.</summary>
    public static string? Clean(string? s, int max = 500)
    {
        if (s == null) return null;
        var t = new string(s.Where(c => !char.IsControl(c) || c == '\n').ToArray()).Trim();
        if (t.Length > max) t = t[..max];
        return t.Length == 0 ? null : t;
    }

    public static string Required(string? s, string field, int max = 200) =>
        Clean(s, max) ?? throw AppException.Bad($"{field} không được để trống");
}
