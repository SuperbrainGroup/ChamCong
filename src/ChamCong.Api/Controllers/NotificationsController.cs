using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/[controller]")]
[Route("api/[controller]")]
public class NotificationsController : ControllerBase
{
    private readonly AppDbContext _db;

    public NotificationsController(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>Xem danh sách thông báo của người dùng hiện tại (hỗ trợ lọc theo hội sở).</summary>
    [HttpGet]
    public async Task<IActionResult> GetMyNotifications([FromQuery] int? companyId, CancellationToken ct)
    {
        var uid = User.UserId();
        var q = _db.Notifications.AsNoTracking().Where(n => n.UserId == uid);

        if (companyId.HasValue && companyId.Value > 0)
        {
            // Lọc theo hội sở: thông báo của hội sở đó hoặc thông báo toàn hệ thống (CompanyId == null)
            q = q.Where(n => n.CompanyId == null || n.CompanyId == companyId.Value);
        }

        var list = await (from n in q
                          join c in _db.Companies.AsNoTracking() on n.CompanyId equals c.Id into compJoin
                          from c in compJoin.DefaultIfEmpty()
                          orderby n.CreatedAtUtc descending
                          select new
                          {
                              n.NotificationId,
                              n.UserId,
                              n.CompanyId,
                              companyCode = c != null ? c.Code : n.BranchCode,
                              companyName = c != null ? c.Name : null,
                              branchCode = n.BranchCode,
                              n.Title,
                              n.Body,
                              n.LinkType,
                              n.LinkId,
                              n.IsRead,
                              timeLocal = n.CreatedAtUtc.AddHours(7).ToString("HH:mm dd/MM/yyyy")
                          })
                          .Take(50)
                          .ToListAsync(ct);

        int unreadCount = await q.CountAsync(n => !n.IsRead, ct);

        return Ok(new
        {
            unreadCount,
            notifications = list
        });
    }

    /// <summary>Đánh dấu một thông báo là đã đọc.</summary>
    [HttpPost("{id}/read")]
    public async Task<IActionResult> MarkAsRead(long id, CancellationToken ct)
    {
        var uid = User.UserId();
        var noti = await _db.Notifications.FirstOrDefaultAsync(n => n.NotificationId == id && n.UserId == uid, ct);
        if (noti != null)
        {
            noti.IsRead = true;
            await _db.SaveChangesAsync(ct);
        }
        return Ok(new { message = "Đã đánh dấu đã đọc." });
    }

    /// <summary>Đánh dấu tất cả thông báo là đã đọc.</summary>
    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllAsRead(CancellationToken ct)
    {
        var uid = User.UserId();
        var unreads = await _db.Notifications.Where(n => n.UserId == uid && !n.IsRead).ToListAsync(ct);
        foreach (var u in unreads)
        {
            u.IsRead = true;
        }
        await _db.SaveChangesAsync(ct);
        return Ok(new { message = "Đã đánh dấu tất cả là đã đọc." });
    }
}
