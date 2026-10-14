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

    /// <summary>Xem danh sách thông báo của người dùng hiện tại.</summary>
    [HttpGet]
    public async Task<IActionResult> GetMyNotifications(CancellationToken ct)
    {
        var uid = User.UserId();
        var list = await _db.Notifications
            .AsNoTracking()
            .Where(n => n.UserId == uid)
            .OrderByDescending(n => n.CreatedAtUtc)
            .Take(50)
            .ToListAsync(ct);

        int unreadCount = await _db.Notifications.CountAsync(n => n.UserId == uid && !n.IsRead, ct);

        return Ok(new
        {
            unreadCount,
            notifications = list.Select(n => new
            {
                n.NotificationId,
                n.Title,
                n.Body,
                n.LinkType,
                n.LinkId,
                n.IsRead,
                timeLocal = n.CreatedAtUtc.AddHours(7).ToString("HH:mm dd/MM/yyyy")
            })
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
