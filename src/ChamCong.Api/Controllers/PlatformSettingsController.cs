using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Route("api/platform")]
public class PlatformSettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public PlatformSettingsController(AppDbContext db, AuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    public class PlatformSettingsDto
    {
        public string SiteTitle { get; set; } = "Hệ Thống Chấm Công Thông Minh";
        public string SiteSubtitle { get; set; } = "Nền tảng Quản trị Chấm công & Nhân sự Doanh nghiệp";
        public string LogoUrl { get; set; } = "";
        public string FaviconUrl { get; set; } = "";
        public string CopyrightText { get; set; } = "© 2026 Bản quyền thuộc về Nền tảng Chấm công Doanh nghiệp.";
        public string BrandColor { get; set; } = "#3B82F6";
    }

    [HttpGet("settings")]
    [AllowAnonymous]
    public async Task<IActionResult> GetSettings(CancellationToken ct)
    {
        var settings = await _db.PlatformSettings.AsNoTracking().ToListAsync(ct);
        var map = settings.ToDictionary(s => s.SettingKey, s => s.SettingValue ?? "", StringComparer.OrdinalIgnoreCase);

        var dto = new PlatformSettingsDto
        {
            SiteTitle = map.GetValueOrDefault("SITE_TITLE", "Hệ Thống Chấm Công Thông Minh"),
            SiteSubtitle = map.GetValueOrDefault("SITE_SUBTITLE", "Nền tảng Quản trị Chấm công & Nhân sự Doanh nghiệp"),
            LogoUrl = map.GetValueOrDefault("LOGO_URL", ""),
            FaviconUrl = map.GetValueOrDefault("FAVICON_URL", ""),
            CopyrightText = map.GetValueOrDefault("COPYRIGHT_TEXT", "© 2026 Bản quyền thuộc về Nền tảng Chấm công Doanh nghiệp."),
            BrandColor = map.GetValueOrDefault("BRAND_COLOR", "#3B82F6")
        };

        return Ok(dto);
    }

    [HttpPut("settings")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> UpdateSettings([FromBody] PlatformSettingsDto dto, CancellationToken ct)
    {
        var username = User.Identity?.Name ?? "admin";
        var existing = await _db.PlatformSettings.ToListAsync(ct);
        var map = existing.ToDictionary(s => s.SettingKey, StringComparer.OrdinalIgnoreCase);

        void Upsert(string key, string? value, string desc)
        {
            if (map.TryGetValue(key, out var entity))
            {
                entity.SettingValue = value ?? "";
                entity.UpdatedAtUtc = DateTime.UtcNow;
                entity.UpdatedBy = username;
            }
            else
            {
                _db.PlatformSettings.Add(new PlatformSetting
                {
                    SettingKey = key,
                    SettingValue = value ?? "",
                    Description = desc,
                    UpdatedAtUtc = DateTime.UtcNow,
                    UpdatedBy = username
                });
            }
        }

        Upsert("SITE_TITLE", dto.SiteTitle, "Tiêu đề hiển thị nền tảng");
        Upsert("SITE_SUBTITLE", dto.SiteSubtitle, "Mô tả phụ nền tảng");
        Upsert("LOGO_URL", dto.LogoUrl, "Đường dẫn logo thương hiệu");
        Upsert("FAVICON_URL", dto.FaviconUrl, "Đường dẫn biểu tượng website");
        Upsert("COPYRIGHT_TEXT", dto.CopyrightText, "Thông tin bản quyền chân trang");
        Upsert("BRAND_COLOR", dto.BrandColor, "Mã màu nhận diện thương hiệu");

        await _db.SaveChangesAsync(ct);
        _audit.Log("Platform", 0, "UpdateSettings", "Cập nhật thông tin nhận diện nền tảng Platform Identity");

        return Ok(dto);
    }

    [HttpPost("logo")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> UploadLogo(IFormFile file, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "Vui lòng chọn file hình ảnh hợp lệ." });
        }

        if (file.Length > 2 * 1024 * 1024)
        {
            return BadRequest(new { message = "Kích thước logo không được vượt quá 2MB." });
        }

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var base64 = Convert.ToBase64String(ms.ToArray());
        var dataUrl = $"data:{file.ContentType};base64,{base64}";

        var username = User.Identity?.Name ?? "admin";
        var setting = await _db.PlatformSettings.FirstOrDefaultAsync(s => s.SettingKey == "LOGO_URL", ct);
        if (setting == null)
        {
            _db.PlatformSettings.Add(new PlatformSetting
            {
                SettingKey = "LOGO_URL",
                SettingValue = dataUrl,
                Description = "Đường dẫn logo thương hiệu",
                UpdatedAtUtc = DateTime.UtcNow,
                UpdatedBy = username
            });
        }
        else
        {
            setting.SettingValue = dataUrl;
            setting.UpdatedAtUtc = DateTime.UtcNow;
            setting.UpdatedBy = username;
        }

        await _db.SaveChangesAsync(ct);
        _audit.Log("Platform", 0, "UploadLogo", $"Cập nhật logo nền tảng ({file.Length} bytes)");

        return Ok(new { logoUrl = dataUrl, message = "Cập nhật logo nền tảng thành công." });
    }

    [HttpPost("favicon")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> UploadFavicon(IFormFile file, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "Vui lòng chọn file biểu tượng hợp lệ." });
        }

        if (file.Length > 1024 * 1024)
        {
            return BadRequest(new { message = "Kích thước favicon không được vượt quá 1MB." });
        }

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var base64 = Convert.ToBase64String(ms.ToArray());
        var dataUrl = $"data:{file.ContentType};base64,{base64}";

        var username = User.Identity?.Name ?? "admin";
        var setting = await _db.PlatformSettings.FirstOrDefaultAsync(s => s.SettingKey == "FAVICON_URL", ct);
        if (setting == null)
        {
            _db.PlatformSettings.Add(new PlatformSetting
            {
                SettingKey = "FAVICON_URL",
                SettingValue = dataUrl,
                Description = "Đường dẫn biểu tượng website",
                UpdatedAtUtc = DateTime.UtcNow,
                UpdatedBy = username
            });
        }
        else
        {
            setting.SettingValue = dataUrl;
            setting.UpdatedAtUtc = DateTime.UtcNow;
            setting.UpdatedBy = username;
        }

        await _db.SaveChangesAsync(ct);
        _audit.Log("Platform", 0, "UploadFavicon", $"Cập nhật favicon nền tảng ({file.Length} bytes)");

        return Ok(new { faviconUrl = dataUrl, message = "Cập nhật favicon nền tảng thành công." });
    }
}
