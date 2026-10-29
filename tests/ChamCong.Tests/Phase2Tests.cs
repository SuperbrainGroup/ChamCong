using System.Security.Claims;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using ChamCong.Engine;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ChamCong.Tests;

public class Phase2Tests
{
    private AppDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(x => x.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new AppDbContext(options);
    }

    [Fact]
    public void Haversine_CalculatesAccurateDistance()
    {
        using var db = CreateInMemoryDb();
        var geofence = new GeofenceService(db);

        // Tọa độ Hội sở Superbrain (Ví dụ: 10.776889, 106.700806)
        double lat1 = 10.776889;
        double lon1 = 106.700806;

        // Điểm cách ~50 mét
        double lat2 = 10.777250;
        double lon2 = 106.701100;

        double distance = geofence.CalculateDistance(lat1, lon1, lat2, lon2);
        Assert.InRange(distance, 40, 70);
    }

    [Theory]
    [InlineData("192.168.1.45", "192.168.1.0/24", true)]
    [InlineData("192.168.2.45", "192.168.1.0/24", false)]
    [InlineData("203.0.113.25", "203.0.113.25/32", true)]
    [InlineData("203.0.113.26", "203.0.113.25/32", false)]
    [InlineData("10.0.0.1", "10.0.0.0/8", true)]
    [InlineData("172.16.5.10", "172.16.0.0/16", true)]
    [InlineData("2001:db8:1234::1", "2001:db8:1234::/64", true)]
    [InlineData("2001:db8:5678::1", "2001:db8:1234::/64", false)]
    public void IsIpInCidr_MatchesCorrectly(string clientIp, string cidr, bool expected)
    {
        using var db = CreateInMemoryDb();
        var geofence = new GeofenceService(db);

        bool result = geofence.IsIpInCidr(clientIp, cidr);
        Assert.Equal(expected, result);
    }

    [Fact]
    public async Task EvaluatePresence_OfficeStrict_ValidWhenIpAndGpsMatch()
    {
        using var db = CreateInMemoryDb();
        var geofence = new GeofenceService(db);

        db.Companies.Add(new Company { Id = 1, Code = "SB_HCM", Name = "Superbrain HCM" });
        db.Employees.Add(new Employee { Id = 1, CompanyId = 1, EmployeeCode = "NV001", FullName = "Nguyễn Văn A" });
        db.BranchNetworks.Add(new BranchNetwork
        {
            BranchCode = "SB_HCM",
            Cidr = "203.0.113.50/32",
            IsActive = true,
            ValidFrom = DateTime.Today.AddDays(-10)
        });
        db.BranchLocations.Add(new BranchLocation
        {
            BranchCode = "SB_HCM",
            LocationName = "Cổng chính",
            Latitude = 10.776889m,
            Longitude = 106.700806m,
            RadiusMeters = 50,
            IsActive = true
        });
        await db.SaveChangesAsync();

        // Check-in đúng IP và đúng tọa độ GPS
        var result = await geofence.EvaluatePresenceAsync(
            "NV001",
            "203.0.113.50",
            "MOBILE_PWA",
            10.776890m,
            106.700807m,
            10m,
            null,
            "OFFICE_STRICT");

        Assert.Equal("VALID", result.VerificationStatus);
        Assert.Equal("NONE", result.ReviewState);
        Assert.True(result.IpOk);
        Assert.Equal("OK", result.GpsState);
    }

    [Fact]
    public async Task EvaluatePresence_OfficeStrict_ReviewWhenIpOkButGpsOut()
    {
        using var db = CreateInMemoryDb();
        var geofence = new GeofenceService(db);

        db.Companies.Add(new Company { Id = 1, Code = "SB_HCM", Name = "Superbrain HCM" });
        db.Employees.Add(new Employee { Id = 1, CompanyId = 1, EmployeeCode = "NV001", FullName = "Nguyễn Văn A" });
        db.BranchNetworks.Add(new BranchNetwork
        {
            BranchCode = "SB_HCM",
            Cidr = "203.0.113.50/32",
            IsActive = true,
            ValidFrom = DateTime.Today.AddDays(-10)
        });
        db.BranchLocations.Add(new BranchLocation
        {
            BranchCode = "SB_HCM",
            LocationName = "Cổng chính",
            Latitude = 10.776889m,
            Longitude = 106.700806m,
            RadiusMeters = 50,
            IsActive = true
        });
        await db.SaveChangesAsync();

        // Check-in đúng IP văn phòng nhưng GPS bị trôi cách 1km
        var result = await geofence.EvaluatePresenceAsync(
            "NV001",
            "203.0.113.50",
            "MOBILE_PWA",
            10.785000m,
            106.710000m,
            20m,
            null,
            "OFFICE_STRICT");

        Assert.Equal("REVIEW", result.VerificationStatus);
        Assert.Equal("GPS_DRIFT", result.ReasonCode);
        Assert.Equal("PENDING", result.ReviewState);
    }

    [Fact]
    public async Task EvaluatePresence_OfficeStrict_ReviewWhen4GOffNetwork()
    {
        using var db = CreateInMemoryDb();
        var geofence = new GeofenceService(db);

        db.Companies.Add(new Company { Id = 1, Code = "SB_HCM", Name = "Superbrain HCM" });
        db.Employees.Add(new Employee { Id = 1, CompanyId = 1, EmployeeCode = "NV001", FullName = "Nguyễn Văn A" });
        db.BranchNetworks.Add(new BranchNetwork
        {
            BranchCode = "SB_HCM",
            Cidr = "203.0.113.50/32",
            IsActive = true,
            ValidFrom = DateTime.Today.AddDays(-10)
        });
        db.BranchLocations.Add(new BranchLocation
        {
            BranchCode = "SB_HCM",
            LocationName = "Cổng chính",
            Latitude = 10.776889m,
            Longitude = 106.700806m,
            RadiusMeters = 50,
            IsActive = true
        });
        await db.SaveChangesAsync();

        // Check-in ở văn phòng nhưng bật 4G (IP lạ, GPS đúng trong bán kính)
        var result = await geofence.EvaluatePresenceAsync(
            "NV001",
            "113.161.45.12",
            "MOBILE_PWA",
            10.776890m,
            106.700807m,
            15m,
            null,
            "OFFICE_STRICT");

        Assert.Equal("REVIEW", result.VerificationStatus);
        Assert.Equal("OFF_NETWORK", result.ReasonCode);
        Assert.Equal("PENDING", result.ReviewState);
    }

    [Fact]
    public async Task EvaluatePresence_OfficeStrict_OutOfOfficeWhenBothIpAndGpsWrong()
    {
        using var db = CreateInMemoryDb();
        var geofence = new GeofenceService(db);

        db.Companies.Add(new Company { Id = 1, Code = "SB_HCM", Name = "Superbrain HCM" });
        db.Employees.Add(new Employee { Id = 1, CompanyId = 1, EmployeeCode = "NV001", FullName = "Nguyễn Văn A" });
        db.BranchNetworks.Add(new BranchNetwork
        {
            BranchCode = "SB_HCM",
            Cidr = "203.0.113.50/32",
            IsActive = true,
            ValidFrom = DateTime.Today.AddDays(-10)
        });
        db.BranchLocations.Add(new BranchLocation
        {
            BranchCode = "SB_HCM",
            LocationName = "Cổng chính",
            Latitude = 10.776889m,
            Longitude = 106.700806m,
            RadiusMeters = 50,
            IsActive = true
        });
        await db.SaveChangesAsync();

        // Check-in ở nhà (IP nhà, GPS ở nhà cách 5km)
        var result = await geofence.EvaluatePresenceAsync(
            "NV001",
            "113.161.45.12",
            "MOBILE_PWA",
            10.820000m,
            106.750000m,
            15m,
            null,
            "OFFICE_STRICT");

        Assert.Equal("OUT_OF_OFFICE", result.VerificationStatus);
        Assert.Equal("OUTSIDE", result.ReasonCode);
        Assert.Equal("PENDING", result.ReviewState);
    }

    [Fact]
    public async Task DeviceBinding_EnforcesDualDeviceLimits()
    {
        using var db = CreateInMemoryDb();
        var deviceService = new DeviceService(db);

        db.Employees.Add(new Employee { Id = 1, CompanyId = 1, EmployeeCode = "NV001", FullName = "Nguyễn Văn A" });
        await db.SaveChangesAsync();

        // 1. Đăng ký Mobile lần đầu (ví dụ Safari) -> thành công và tự động kích hoạt
        var (dev1, secret1) = await deviceService.RegisterDeviceAsync("NV001", "MOBILE", "iPhone 15 (Safari)", "iOS", "Safari", "fp1", "127.0.0.1");
        Assert.Equal("APPROVED", dev1.ApprovalStatus);
        Assert.False(string.IsNullOrEmpty(secret1));

        // 2. Đăng ký thêm Mobile thứ hai (ví dụ PWA) trên cùng tài khoản -> Cho phép thành công!
        var (dev2, secret2) = await deviceService.RegisterDeviceAsync("NV001", "MOBILE", "iPhone 15 (PWA)", "iOS", "PWA", "fp2", "127.0.0.1");
        Assert.Equal("APPROVED", dev2.ApprovalStatus);
        Assert.False(string.IsNullOrEmpty(secret2));
        Assert.NotEqual(secret1, secret2);

        // 3. Đăng ký lại Mobile cùng MAC fp1 (ví dụ xóa cache trình duyệt) -> Tự động tái cấp secret mới
        var (dev1Re, secret1Re) = await deviceService.RegisterDeviceAsync("NV001", "MOBILE", "iPhone 15 (Safari)", "iOS", "Safari", "fp1", "127.0.0.1");
        Assert.Equal(dev1.DeviceBindingId, dev1Re.DeviceBindingId);
        Assert.False(string.IsNullOrEmpty(secret1Re));

        // 4. Đăng ký PC -> Thành công (vì khe PC còn trống)
        var (devPc, secretPc) = await deviceService.RegisterDeviceAsync("NV001", "PC", "MacBook Pro", "macOS", "Chrome", "fp3", "127.0.0.1");
        Assert.Equal("APPROVED", devPc.ApprovalStatus);
        Assert.False(string.IsNullOrEmpty(secretPc));

        // 5. Đăng ký thêm PC thứ 2 khi đã có PC active -> Bị từ chối conflict
        await Assert.ThrowsAsync<AppException>(async () =>
        {
            await deviceService.RegisterDeviceAsync("NV001", "PC", "PC Dell", "Windows", "Chrome", "fp4", "127.0.0.1");
        });
    }

    [Fact]
    public async Task AntiSelfApproval_HRCannotApproveOwnRequest_ThrowsForbiddenException()
    {
        using var db = CreateInMemoryDb();
        var requestService = new EmployeeRequestService(db);

        // Tạo HCNS vừa là nhân viên NV_HR, vừa là user có UserId = 99
        db.Employees.Add(new Employee { Id = 10, CompanyId = 1, EmployeeCode = "NV_HR", FullName = "Chuyên viên Nhân sự" });
        db.Users.Add(new User
        {
            Id = 99,
            Username = "hr_user",
            EmployeeCode = "NV_HR",
            FullName = "Chuyên viên Nhân sự",
            Role = Roles.HR,
            IsActive = true
        });
        db.LeaveFunds.Add(new LeaveFund { EmployeeId = 10, Year = (short)DateTime.Today.Year, AnnualOpening = 12 });
        await db.SaveChangesAsync();

        // Nộp đơn nghỉ
        var req = await requestService.SubmitLeaveRequestAsync("NV_HR", new CreateLeaveDto
        {
            LeaveCode = "P",
            FromDate = DateTime.Today.AddDays(2),
            ToDate = DateTime.Today.AddDays(2),
            Reason = "Việc riêng"
        });

        // HCNS cố tình tự duyệt cho chính mình
        var ex = await Assert.ThrowsAsync<AppException>(async () =>
        {
            await requestService.DecideRequestAsync(req.RequestId, true, "Tự duyệt", 99);
        });

        Assert.Equal(403, ex.Status);
        Assert.Contains("tự phê duyệt", ex.Message);
    }

    [Fact]
    public async Task LeaveBalance_ExceedAvailableBalance_ThrowsBadRequestException()
    {
        using var db = CreateInMemoryDb();
        var requestService = new EmployeeRequestService(db);

        db.Employees.Add(new Employee { Id = 5, CompanyId = 1, EmployeeCode = "NV005", FullName = "Nhân viên B" });
        // Quỹ phép chỉ có 1 ngày
        db.LeaveFunds.Add(new LeaveFund { EmployeeId = 5, Year = (short)DateTime.Today.Year, AnnualOpening = 1 });
        await db.SaveChangesAsync();

        // Nộp đơn xin nghỉ 3 ngày phép
        var ex = await Assert.ThrowsAsync<AppException>(async () =>
        {
            await requestService.SubmitLeaveRequestAsync("NV005", new CreateLeaveDto
            {
                LeaveCode = "P",
                FromDate = DateTime.Today.AddDays(1),
                ToDate = DateTime.Today.AddDays(3),
                Reason = "Đi du lịch"
            });
        });

        Assert.Equal(400, ex.Status);
        Assert.Contains("quỹ phép không đủ", ex.Message);
    }

    [Fact]
    public async Task EvaluatePresence_PcWeb_ValidWithMacOnly_NoIpOrGpsRequired()
    {
        using var db = CreateInMemoryDb();
        var geofence = new GeofenceService(db);

        db.Companies.Add(new Company { Id = 1, Code = "HQ", Name = "Hội sở" });
        db.Employees.Add(new Employee { Id = 10, CompanyId = 1, EmployeeCode = "NV010", FullName = "Nhân viên PC" });
        await db.SaveChangesAsync();

        // Máy tính ở mạng bất kỳ (không nằm trong CIDR văn phòng) và không có GPS
        var eval = await geofence.EvaluatePresenceAsync(
            "NV010",
            "118.69.123.45",
            "PC_WEB",
            latitude: null,
            longitude: null,
            accuracy: null,
            gpsError: null,
            policy: "OFFICE_STRICT");

        Assert.Equal("VALID", eval.VerificationStatus);
        Assert.Equal("NONE", eval.ReviewState);
        Assert.Equal("NA", eval.GpsState);
        Assert.True(eval.IpOk);
        Assert.Contains("PC", eval.Message);
    }

    [Fact]
    public async Task AttendancePunch_PcWeb_SucceedsWithMacAddress()
    {
        using var db = CreateInMemoryDb();
        var devService = new DeviceService(db);
        var geofence = new GeofenceService(db);
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<AttendancePunchService>();
        var punchService = new AttendancePunchService(db, devService, geofence, logger);

        db.Companies.Add(new Company { Id = 1, Code = "HQ", Name = "Hội sở" });
        db.Employees.Add(new Employee { Id = 11, CompanyId = 1, EmployeeCode = "NV011", FullName = "Nhân viên Test PC" });
        db.EmployeeDevices.Add(new EmployeeDevice
        {
            EmployeeCode = "NV011",
            DeviceType = "PC",
            DeviceName = "Test PC 1",
            FingerprintHash = "02:5A:3C:9B:44:1E",
            IsActiveSlot = true,
            RequestedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var punchReq = new PunchRequestDto
        {
            ClientRequestId = Guid.NewGuid(),
            Channel = "PC_WEB",
            MacAddress = "02:5A:3C:9B:44:1E",
            UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        };

        var result = await punchService.PunchAsync("NV011", null, "118.69.123.45", punchReq);

        Assert.Equal("VALID", result.VerificationStatus);
        Assert.Equal("NONE", result.ReviewState);

        // Kiểm tra log trong database
        var log = await db.WebAttendanceLogs.FirstOrDefaultAsync(l => l.EmployeeCode == "NV011");
        Assert.NotNull(log);
        Assert.Equal("PC_WEB", log.Channel);
        Assert.Equal("PC_MAC_AUTH", log.CheckinPolicy);
        Assert.Null(log.Latitude);
        Assert.Null(log.Longitude);
        Assert.Contains("02:5A:3C:9B:44:1E", log.UserAgent);
    }

    [Fact]
    public async Task AttendancePunch_OnlyAllowsOneCheckinAndOneCheckoutPerDay()
    {
        using var db = CreateInMemoryDb();
        var devService = new DeviceService(db);
        var geofence = new GeofenceService(db);
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<AttendancePunchService>();
        var punchService = new AttendancePunchService(db, devService, geofence, logger);

        db.Companies.Add(new Company { Id = 1, Code = "HQ", Name = "Hội sở" });
        db.Employees.Add(new Employee { Id = 12, CompanyId = 1, EmployeeCode = "NV012", FullName = "Nhân viên Test Limit" });
        db.EmployeeDevices.Add(new EmployeeDevice
        {
            EmployeeCode = "NV012",
            DeviceType = "PC",
            DeviceName = "Test PC 2",
            FingerprintHash = "02:AA:BB:CC:DD:01",
            IsActiveSlot = true,
            RequestedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        // 1. Lần 1: Check-in thành công
        var punch1 = await punchService.PunchAsync("NV012", null, "118.69.123.45", new PunchRequestDto
        {
            ClientRequestId = Guid.NewGuid(),
            Channel = "PC_WEB",
            MacAddress = "02:AA:BB:CC:DD:01",
            UserAgent = "TestBrowser"
        });
        Assert.Equal("VALID", punch1.VerificationStatus);

        // Giả lập thời gian trôi qua để vượt qua cooldown 60 giây
        var log1 = await db.WebAttendanceLogs.FirstAsync(l => l.WebLogId == punch1.WebLogId);
        log1.CheckTimeUtc = DateTime.UtcNow.AddHours(-4);
        await db.SaveChangesAsync();

        // 2. Lần 2: Check-out thành công
        var punch2 = await punchService.PunchAsync("NV012", null, "118.69.123.45", new PunchRequestDto
        {
            ClientRequestId = Guid.NewGuid(),
            Channel = "PC_WEB",
            MacAddress = "02:AA:BB:CC:DD:01",
            UserAgent = "TestBrowser"
        });
        Assert.Equal("VALID", punch2.VerificationStatus);

        // Kiểm tra DailyPunchSummary có đủ InTime và OutTime
        var summary = await db.DailyPunchSummaries.FirstOrDefaultAsync(s => s.EmployeeCode == "NV012");
        Assert.NotNull(summary);
        Assert.NotNull(summary.InTime);
        Assert.NotNull(summary.OutTime);

        // Giả lập thời gian trôi qua để vượt cooldown
        var log2 = await db.WebAttendanceLogs.FirstAsync(l => l.WebLogId == punch2.WebLogId);
        log2.CheckTimeUtc = DateTime.UtcNow.AddMinutes(-5);
        await db.SaveChangesAsync();

        // 3. Lần 3: Cố tình bấm thêm -> Phải bị từ chối
        var ex = await Assert.ThrowsAsync<AppException>(async () =>
        {
            await punchService.PunchAsync("NV012", null, "118.69.123.45", new PunchRequestDto
            {
                ClientRequestId = Guid.NewGuid(),
                Channel = "PC_WEB",
                MacAddress = "02:AA:BB:CC:DD:01",
                UserAgent = "TestBrowser"
            });
        });

        Assert.Equal(400, ex.Status);
        Assert.Contains("đủ 1 lượt Check-in và 1 lượt Check-out", ex.Message);
    }

    [Fact]
    public void TokenService_ValidateToken_ValidatesSuccessfully()
    {
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "Superbrain_ChamCong_Secret_Key_For_Jwt_Token_2026_Secure_Key_Long_Enough_256bits!",
                ["Jwt:Issuer"] = "ChamCongApp",
                ["Jwt:Audience"] = "ChamCongUsers",
                ["Jwt:ExpiryHours"] = "24"
            })
            .Build();

        var tokenService = new TokenService(config);
        var user = new User
        {
            Id = 99,
            Username = "test_user",
            FullName = "Nguyễn Văn Test",
            Role = "Employee",
            EmployeeCode = "NV099"
        };

        var token = tokenService.GenerateToken(user, new[] { 1 });
        Assert.NotNull(token);

        var principal = tokenService.ValidateToken(token);
        Assert.NotNull(principal);
        Assert.Equal("99", principal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value);
        Assert.Equal("NV099", principal.FindFirst("EmployeeCode")?.Value);
    }

    [Fact]
    public async Task EmployeeRequestService_SaveWebpAttachment_SavesCorrectMimeAndExtension()
    {
        using var db = CreateInMemoryDb();
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:EvidencePath"] = Path.Combine(Path.GetTempPath(), "ChamCong_Test_Evidence_" + Guid.NewGuid().ToString("N"))
            })
            .Build();

        var requestService = new EmployeeRequestService(db, null, config, null);

        var fakeBytes = System.Text.Encoding.UTF8.GetBytes("RIFF....WEBPVP8 ...");
        using var stream = new MemoryStream(fakeBytes);
        var formFile = new Microsoft.AspNetCore.Http.FormFile(stream, 0, fakeBytes.Length, "files", "minh_chung_nghiphep.webp")
        {
            Headers = new Microsoft.AspNetCore.Http.HeaderDictionary(),
            ContentType = "image/webp"
        };

        var dto = new CreateLeaveDto
        {
            LeaveCode = "KL",
            FromDate = DateTime.Today,
            ToDate = DateTime.Today,
            DayPart = "FULL",
            Reason = "Nghỉ không lương việc cá nhân",
            Files = new List<Microsoft.AspNetCore.Http.IFormFile> { formFile }
        };

        var req = await requestService.SubmitLeaveRequestAsync("NV099", dto, null);
        Assert.NotNull(req);

        var attachment = await db.RequestAttachments.FirstOrDefaultAsync(a => a.RequestId == req.RequestId);
        Assert.NotNull(attachment);
        Assert.Equal("image/webp", attachment.MimeType);
        Assert.EndsWith(".webp", attachment.OriginalFileName);
        Assert.EndsWith(".webp", attachment.StoredFileName);
    }

    [Fact]
    public async Task LeaveAccrual_Worked14Days_AccruesOneLeaveDayOnClosePeriod()
    {
        using var db = CreateInMemoryDb();
        var leaveService = new LeaveService(db);

        // Setup company, employee, period
        db.Companies.Add(new Company { Id = 1, Code = "HQ", Name = "Hội sở" });
        db.Employees.Add(new Employee { Id = 101, CompanyId = 1, EmployeeCode = "NV101", FullName = "Nhân viên 14 Công", StartDate = new DateTime(2026, 1, 1) });
        db.LeaveFunds.Add(new LeaveFund { EmployeeId = 101, Year = 2026, AnnualOpening = 0 }); // Đầu kỳ 0 phép

        var period = new Period
        {
            Id = 10,
            CompanyId = 1,
            Month = 1,
            Year = 2026,
            FromDate = new DateTime(2026, 1, 1),
            ToDate = new DateTime(2026, 1, 31),
            StandardDays = 24.0m, // Tháng 24 ngày chuẩn -> 50% là 12 ngày
            Status = PeriodStatus.Calculated
        };
        db.Periods.Add(period);

        // 14 ngày làm việc đủ công (mã "1", WorkValue = 1) -> 14 >= 12 ngày -> +1 phép năm
        db.AttendanceCodes.Add(new AttendanceCode { CompanyId = 1, Code = "1", Name = "Đi làm đủ", WorkValue = 1.0m });
        for (int day = 1; day <= 14; day++)
        {
            db.DayResults.Add(new DayResult
            {
                PeriodId = 10,
                EmployeeId = 101,
                Date = new DateTime(2026, 1, day),
                Code = "1",
                PaidValue = 1.0m
            });
        }
        await db.SaveChangesAsync();

        // Chốt kỳ công -> Tính lại và cộng phép
        int accrued = await leaveService.RecalculateAndAccrueLeaveForPeriodAsync(10);
        Assert.Equal(1, accrued);

        // Kiểm tra số dư phép
        var balance = await leaveService.GetEmployeeLeaveBalanceAsync(101, 2026);
        Assert.Equal(1.0m, balance.Accrued);
        Assert.Equal(1.0m, balance.AvailableBalance);

        // Kiểm tra hoàn tác khi mở lại kỳ công
        await leaveService.RevertLeaveAccrualForPeriodAsync(10);
        var balanceAfterRevert = await leaveService.GetEmployeeLeaveBalanceAsync(101, 2026);
        Assert.Equal(0.0m, balanceAfterRevert.Accrued);
        Assert.Equal(0.0m, balanceAfterRevert.AvailableBalance);
    }

    [Fact]
    public async Task LeaveAccrual_WorkedLessThan50Percent_DoesNotAccrueLeaveDay()
    {
        using var db = CreateInMemoryDb();
        var leaveService = new LeaveService(db);

        db.Companies.Add(new Company { Id = 1, Code = "HQ", Name = "Hội sở" });
        db.Employees.Add(new Employee { Id = 102, CompanyId = 1, EmployeeCode = "NV102", FullName = "Nhân viên 11 Công", StartDate = new DateTime(2026, 1, 1) });
        db.LeaveFunds.Add(new LeaveFund { EmployeeId = 102, Year = 2026, AnnualOpening = 0 });

        var period = new Period
        {
            Id = 11,
            CompanyId = 1,
            Month = 2,
            Year = 2026,
            FromDate = new DateTime(2026, 2, 1),
            ToDate = new DateTime(2026, 2, 28),
            StandardDays = 24.0m, // Tháng 24 ngày chuẩn -> 50% là 12 ngày
            Status = PeriodStatus.Calculated
        };
        db.Periods.Add(period);

        db.AttendanceCodes.Add(new AttendanceCode { CompanyId = 1, Code = "1", Name = "Đi làm đủ", WorkValue = 1.0m });
        // Chỉ làm việc 11 ngày (< 12 ngày công = 50% của 24 ngày) -> không được cộng phép
        for (int day = 1; day <= 11; day++)
        {
            db.DayResults.Add(new DayResult
            {
                PeriodId = 11,
                EmployeeId = 102,
                Date = new DateTime(2026, 2, day),
                Code = "1",
                PaidValue = 1.0m
            });
        }
        await db.SaveChangesAsync();

        int accrued = await leaveService.RecalculateAndAccrueLeaveForPeriodAsync(11);
        Assert.Equal(0, accrued);

        var balance = await leaveService.GetEmployeeLeaveBalanceAsync(102, 2026);
        Assert.Equal(0.0m, balance.Accrued);
        Assert.Equal(0.0m, balance.AvailableBalance);
    }

    [Fact]
    public async Task LeaveAccrual_WorkedExactly50Percent_AccruesOneLeaveDay()
    {
        using var db = CreateInMemoryDb();
        var leaveService = new LeaveService(db);

        db.Companies.Add(new Company { Id = 1, Code = "HQ", Name = "Hội sở" });
        db.Employees.Add(new Employee { Id = 103, CompanyId = 1, EmployeeCode = "NV103", FullName = "Nhân viên 12 Công", StartDate = new DateTime(2026, 1, 1) });
        db.LeaveFunds.Add(new LeaveFund { EmployeeId = 103, Year = 2026, AnnualOpening = 0 });

        var period = new Period
        {
            Id = 12,
            CompanyId = 1,
            Month = 3,
            Year = 2026,
            FromDate = new DateTime(2026, 3, 1),
            ToDate = new DateTime(2026, 3, 31),
            StandardDays = 24.0m, // 50% = 12 ngày
            Status = PeriodStatus.Calculated
        };
        db.Periods.Add(period);

        db.AttendanceCodes.Add(new AttendanceCode { CompanyId = 1, Code = "1", Name = "Đi làm đủ", WorkValue = 1.0m });
        // Làm đúng 12 ngày (= 50% ngày công chuẩn) -> +1 phép năm
        for (int day = 1; day <= 12; day++)
        {
            db.DayResults.Add(new DayResult
            {
                PeriodId = 12,
                EmployeeId = 103,
                Date = new DateTime(2026, 3, day),
                Code = "1",
                PaidValue = 1.0m
            });
        }
        await db.SaveChangesAsync();

        int accrued = await leaveService.RecalculateAndAccrueLeaveForPeriodAsync(12);
        Assert.Equal(1, accrued);

        var balance = await leaveService.GetEmployeeLeaveBalanceAsync(103, 2026);
        Assert.Equal(1.0m, balance.Accrued);
        Assert.Equal(1.0m, balance.AvailableBalance);
    }

    [Fact]
    public async Task GraceAllowance_Max2TimesMonth_ThirdTimeCountsAsLate()
    {
        // Kiểm thử kịch bản người dùng yêu cầu:
        // Cài đặt thời gian du di = 10 phút, số lần du di trong tháng = 2 lần
        // Ngày 1: vào 08:07 (lần 1) -> 0 phút trễ
        // Ngày 2: vào 08:06 (lần 2) -> 0 phút trễ
        // Ngày 3: vào 08:07 (lần 3 - hết quota) -> tính trễ 7 phút!
        // Ngày 4: vào 08:15 (> 10 phút du di) -> tính trễ 15 phút!
        using var db = CreateInMemoryDb();
        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "1"),
            new Claim(ClaimTypes.Name, "admin"),
            new Claim(ClaimTypes.Role, "Admin")
        }, "TestAuth"));
        var httpAccessor = new HttpContextAccessor { HttpContext = httpContext };
        var accessService = new AccessService(db, httpAccessor);
        var auditService = new AuditService(db, httpAccessor);
        var calcService = new CalculationService(db, accessService, auditService);

        db.Companies.Add(new Company { Id = 1, Code = "HQ", Name = "Hội sở" });
        db.Employees.Add(new Employee
        {
            Id = 105,
            CompanyId = 1,
            EmployeeCode = "NV105",
            FullName = "Nguyễn Văn Test Du Di",
            StartDate = new DateTime(2026, 1, 1),
            EmployeeType = "STANDARD"
        });

        // Thiết lập tham số hội sở: Du di 10 phút, tối đa 2 lần/tháng
        db.ParameterValues.Add(new ParameterValue { CompanyId = 1, Code = ParamCatalog.ShiftStandardHours, Value = "08:00-17:00", EffectiveFrom = new DateTime(2026, 1, 1) });
        db.ParameterValues.Add(new ParameterValue { CompanyId = 1, Code = ParamCatalog.GracePeriodMinutes, Value = "10", EffectiveFrom = new DateTime(2026, 1, 1) });
        db.ParameterValues.Add(new ParameterValue { CompanyId = 1, Code = ParamCatalog.GraceMaxTimesMonth, Value = "2", EffectiveFrom = new DateTime(2026, 1, 1) });

        var period = new Period
        {
            Id = 20,
            CompanyId = 1,
            Month = 1,
            Year = 2026,
            FromDate = new DateTime(2026, 1, 5),
            ToDate = new DateTime(2026, 1, 8),
            StandardDays = 4.0m,
            Status = PeriodStatus.Draft
        };
        db.Periods.Add(period);

        db.AttendanceCodes.Add(new AttendanceCode { CompanyId = 1, Code = "1", Name = "Đủ công", WorkValue = 1.0m });

        // Thứ 2 (05/01): Vào 08:07, Ra 17:00 (Du di lần 1)
        db.RawPunches.Add(new RawPunch { PeriodId = 20, EmployeeId = 105, WorkDate = new DateTime(2026, 1, 5), InMin = 8 * 60 + 7, OutMin = 17 * 60, MachineCode = "105" });
        // Thứ 3 (06/01): Vào 08:06, Ra 17:00 (Du di lần 2)
        db.RawPunches.Add(new RawPunch { PeriodId = 20, EmployeeId = 105, WorkDate = new DateTime(2026, 1, 6), InMin = 8 * 60 + 6, OutMin = 17 * 60, MachineCode = "105" });
        // Thứ 4 (07/01): Vào 08:07, Ra 17:00 (Đã hết 2 lần du di -> tính trễ 7 phút)
        db.RawPunches.Add(new RawPunch { PeriodId = 20, EmployeeId = 105, WorkDate = new DateTime(2026, 1, 7), InMin = 8 * 60 + 7, OutMin = 17 * 60, MachineCode = "105" });
        // Thứ 5 (08/01): Vào 08:15, Ra 17:00 (> 10 phút du di -> tính trễ 15 phút)
        db.RawPunches.Add(new RawPunch { PeriodId = 20, EmployeeId = 105, WorkDate = new DateTime(2026, 1, 8), InMin = 8 * 60 + 15, OutMin = 17 * 60, MachineCode = "105" });

        await db.SaveChangesAsync();

        // Chạy tính toán kỳ công
        await calcService.CalculatePeriodAsync(20);

        var results = await db.DayResults.Where(r => r.PeriodId == 20 && r.EmployeeId == 105).OrderBy(r => r.Date).ToListAsync();
        Assert.Equal(4, results.Count);

        // Ngày 1: Vào 08:07 -> Trễ = 0 (Du di lần 1)
        Assert.Equal(0, results[0].LateMinutes);

        // Ngày 2: Vào 08:06 -> Trễ = 0 (Du di lần 2)
        Assert.Equal(0, results[1].LateMinutes);

        // Ngày 3: Vào 08:07 -> Trễ = 7 phút (Hết quota du di)
        Assert.Equal(7, results[2].LateMinutes);

        // Ngày 4: Vào 08:15 -> Trễ = 15 phút (Vượt thời gian du di 10p)
        Assert.Equal(15, results[3].LateMinutes);
    }

    [Fact]
    public async Task LeaveValidation_ExhaustedBalance_BlocksLeaveSubmission()
    {
        using var db = CreateInMemoryDb();
        var leaveService = new LeaveService(db);

        db.Companies.Add(new Company { Id = 1, Code = "HQ", Name = "Hội sở" });
        db.Employees.Add(new Employee { Id = 103, CompanyId = 1, EmployeeCode = "NV103", FullName = "Nhân viên Hết Phép", StartDate = new DateTime(2026, 1, 1) });
        db.LeaveFunds.Add(new LeaveFund { EmployeeId = 103, Year = 2026, AnnualOpening = 0 });
        await db.SaveChangesAsync();

        // Cố tình xin nghỉ phép 1 ngày khi số dư = 0
        var ex = await Assert.ThrowsAsync<AppException>(async () =>
        {
            await leaveService.ValidateLeaveRequestAllowedAsync(103, "P", 1.0m, new DateTime(2026, 3, 10));
        });

        Assert.Equal(400, ex.Status);
        Assert.Contains("hết ngày phép năm", ex.Message);
    }

    [Fact]
    public async Task Regularization_MoreThan10DaysAgo_AllowedSuccessfully()
    {
        using var db = CreateInMemoryDb();
        var requestService = new EmployeeRequestService(db);

        db.Employees.Add(new Employee { Id = 104, CompanyId = 1, EmployeeCode = "NV104", FullName = "Nhân viên Giải Trình Cũ" });
        await db.SaveChangesAsync();

        // Nộp giải trình cách đây 25 ngày (> 10 ngày)
        var pastDate = DateTime.Today.AddDays(-25);
        var req = await requestService.SubmitRegularizationRequestAsync("NV104", new CreateRegularizationDto
        {
            WorkDate = pastDate,
            ActualTimeIn = new TimeSpan(8, 0, 0),
            ActualTimeOut = new TimeSpan(17, 0, 0),
            ReasonCode = "QUEN_QUET_THE",
            Reason = "Quên quẹt thẻ ngày trước đó"
        }, companyId: 1);

        Assert.NotNull(req);
        Assert.Equal("REGULARIZATION", req.RequestType);
        Assert.Equal(pastDate, req.FromDate);
        Assert.Equal("PENDING_HR", req.Status);
    }

    [Fact]
    public async Task Regularization_FutureDate_ThrowsBadRequestException()
    {
        using var db = CreateInMemoryDb();
        var requestService = new EmployeeRequestService(db);

        db.Employees.Add(new Employee { Id = 105, CompanyId = 1, EmployeeCode = "NV105", FullName = "Nhân viên Giải Trình Tương Lai" });
        await db.SaveChangesAsync();

        // Nộp giải trình cho ngày mai (tương lai) -> Phải bị chặn
        var futureDate = DateTime.Today.AddDays(1);
        var ex = await Assert.ThrowsAsync<AppException>(async () =>
        {
            await requestService.SubmitRegularizationRequestAsync("NV105", new CreateRegularizationDto
            {
                WorkDate = futureDate,
                ActualTimeIn = new TimeSpan(8, 0, 0),
                ActualTimeOut = new TimeSpan(17, 0, 0),
                ReasonCode = "QUEN_QUET_THE",
                Reason = "Quên quẹt thẻ ngày mai"
            }, companyId: 1);
        });

        Assert.Equal(400, ex.Status);
        Assert.Contains("ngày trong tương lai", ex.Message);
    }

    [Fact]
    public async Task LeaveBalance_FilterByMonth_CalculatesUsedAndRemainingAtSpecificMonth()
    {
        using var db = CreateInMemoryDb();
        var leaveService = new LeaveService(db);

        db.Companies.Add(new Company { Id = 1, Code = "HQ", Name = "Hội sở" });
        db.Employees.Add(new Employee { Id = 201, CompanyId = 1, EmployeeCode = "NV201", FullName = "Nhân viên Test Phép Tháng" });
        db.LeaveFunds.Add(new LeaveFund
        {
            EmployeeId = 201,
            Year = 2026,
            AnnualOpening = 2.0m,
            CarryOpening = 0m,
            CompOpening = 0m
        });

        // Tháng 1: Nghỉ 1 ngày (15/01) và Tích lũy 1 ngày sau chốt kỳ (31/01)
        db.LeaveLedger.Add(new LeaveLedgerEntry
        {
            EmployeeId = 201,
            Year = 2026,
            Date = new DateTime(2026, 1, 15),
            Fund = "ANNUAL",
            Amount = -1.0m,
            Note = "Nghỉ phép năm Tháng 1"
        });
        db.LeaveLedger.Add(new LeaveLedgerEntry
        {
            EmployeeId = 201,
            Year = 2026,
            Date = new DateTime(2026, 1, 31),
            Fund = "ANNUAL",
            Amount = 1.0m,
            Code = "ACCRUAL",
            Note = "Cộng 1 ngày phép năm kỳ T1/2026"
        });

        // Tháng 2: Nghỉ 1 ngày (10/02)
        db.LeaveLedger.Add(new LeaveLedgerEntry
        {
            EmployeeId = 201,
            Year = 2026,
            Date = new DateTime(2026, 2, 10),
            Fund = "ANNUAL",
            Amount = -1.0m,
            Note = "Nghỉ phép năm Tháng 2"
        });

        await db.SaveChangesAsync();

        // 1. Kiểm tra tại thời điểm Tháng 1/2026
        var balanceM1 = await leaveService.GetEmployeeLeaveBalanceAsync(201, 2026, month: 1);
        Assert.Equal(1.0m, balanceM1.Accrued);           // Tích lũy T1: +1
        Assert.Equal(3.0m, balanceM1.TotalAnnualEarned); // Tổng hưởng: 2 + 1 = 3
        Assert.Equal(1.0m, balanceM1.MonthUsed);         // Đã dùng trong T1: 1
        Assert.Equal(1.0m, balanceM1.AnnualUsed);        // Lũy kế đến T1: 1
        Assert.Equal(2.0m, balanceM1.AvailableBalance);   // Tồn tại mốc T1: 3 - 1 = 2
        Assert.False(balanceM1.IsExhausted);

        // 2. Kiểm tra tại thời điểm Tháng 2/2026: Đầu kỳ T2 = Tồn T1 (2.0)
        var balanceM2 = await leaveService.GetEmployeeLeaveBalanceAsync(201, 2026, month: 2);
        Assert.Equal(2.0m, balanceM2.AnnualOpening);     // Đầu kỳ T2 = Tồn T1 = 2.0
        Assert.Equal(0m, balanceM2.Accrued);             // Tích lũy trong T2: 0 (chưa chốt T2)
        Assert.Equal(2.0m, balanceM2.TotalAnnualEarned); // Tổng hưởng T2 = Đầu kỳ (2.0) + Tích lũy (0) = 2.0
        Assert.Equal(1.0m, balanceM2.MonthUsed);         // Đã dùng riêng trong T2: 1
        Assert.Equal(2.0m, balanceM2.AnnualUsed);        // Lũy kế đến T2: 2
        Assert.Equal(1.0m, balanceM2.AvailableBalance);   // Tồn tại mốc T2: 2.0 - 1.0 = 1.0
        Assert.False(balanceM2.IsExhausted);

        // 3. Kiểm tra danh sách cấp công ty lọc theo Tháng 2/2026
        var companyFundsM2 = await leaveService.GetCompanyLeaveFundsAsync(1, 2026, month: 2);
        var emp201Fund = companyFundsM2.FirstOrDefault(f => f.EmployeeId == 201);
        Assert.NotNull(emp201Fund);
        Assert.Equal(2, emp201Fund.Month);
        Assert.Equal(1.0m, emp201Fund.MonthUsed);
        Assert.Equal(1.0m, emp201Fund.AvailableBalance);
    }

    [Fact]
    public async Task RequestBackdateMaxDays_ConfiguredLimit_EnforcedCorrectly()
    {
        using var db = CreateInMemoryDb();
        var requestService = new EmployeeRequestService(db);

        db.Employees.Add(new Employee { Id = 301, CompanyId = 1, EmployeeCode = "NV301", FullName = "Nhân viên Test Backdate" });
        db.LeaveFunds.Add(new LeaveFund { EmployeeId = 301, Year = (short)DateTime.Today.Year, AnnualOpening = 10 });
        
        // Cấu hình hạn nộp lùi là 5 ngày
        db.ParameterValues.Add(new ParameterValue
        {
            CompanyId = 1,
            Code = ChamCong.Engine.ParamCatalog.RequestBackdateMaxDays,
            Value = "5",
            EffectiveFrom = new DateTime(2020, 1, 1)
        });
        await db.SaveChangesAsync();

        // 1. Nộp lùi 10 ngày (> 5 ngày) -> Chặn lỗi 400
        var ex = await Assert.ThrowsAsync<AppException>(async () =>
        {
            await requestService.SubmitLeaveRequestAsync("NV301", new CreateLeaveDto
            {
                LeaveCode = "P",
                FromDate = DateTime.Today.AddDays(-10),
                ToDate = DateTime.Today.AddDays(-10),
                Reason = "Nghỉ việc riêng quá hạn"
            }, companyId: 1);
        });
        Assert.Equal(400, ex.Status);
        Assert.Contains("lùi quá 5 ngày", ex.Message);

        // 2. Đổi cấu hình sang 0 (Không giới hạn lùi)
        var param = await db.ParameterValues.FirstAsync(p => p.Code == ChamCong.Engine.ParamCatalog.RequestBackdateMaxDays);
        param.Value = "0";
        await db.SaveChangesAsync();

        // Nộp lùi 45 ngày -> Thành công vì 0 là không giới hạn
        var req = await requestService.SubmitLeaveRequestAsync("NV301", new CreateLeaveDto
        {
            LeaveCode = "P",
            FromDate = DateTime.Today.AddDays(-45),
            ToDate = DateTime.Today.AddDays(-45),
            Reason = "Nghỉ việc riêng lùi sâu"
        }, companyId: 1);
        Assert.NotNull(req);
        Assert.Equal("PENDING_HR", req.Status);
    }

    [Fact]
    public async Task DeleteRequestByHr_ApprovedLeave_RollsBackLeaveAndRestoresBalance()
    {
        using var db = CreateInMemoryDb();
        var leaveService = new LeaveService(db);
        var requestService = new EmployeeRequestService(db, leaveService: leaveService);

        db.Employees.Add(new Employee { Id = 302, CompanyId = 1, EmployeeCode = "NV302", FullName = "Nhân viên Rollback Phép" });
        db.LeaveFunds.Add(new LeaveFund { EmployeeId = 302, Year = (short)DateTime.Today.Year, AnnualOpening = 5 });
        await db.SaveChangesAsync();

        var leaveDate = DateTime.Today.AddDays(2);
        var req = await requestService.SubmitLeaveRequestAsync("NV302", new CreateLeaveDto
        {
            LeaveCode = "P",
            FromDate = leaveDate,
            ToDate = leaveDate,
            Reason = "Nghỉ việc riêng cần duyệt nhầm"
        }, companyId: 1);

        // HR duyệt đơn
        await requestService.DecideRequestAsync(req.RequestId, true, "Duyệt hợp lệ", 999);

        // Kiểm tra sau khi duyệt: có 1 bản ghi LeaveRequests, sổ cái phép đã bị trừ 1 ngày
        var leaves = await db.LeaveRequests.Where(l => l.EmployeeId == 302).ToListAsync();
        Assert.Single(leaves);

        var balanceAfterApprove = await leaveService.GetEmployeeLeaveBalanceAsync(302, DateTime.Today.Year);
        Assert.Equal(4.0m, balanceAfterApprove.AvailableBalance); // 5 - 1 = 4

        // HR nhận ra duyệt nhầm ngày và bấm XÓA đơn đã duyệt
        await requestService.DeleteRequestByHrAsync(req.RequestId, 999);

        // Sau khi xóa:
        // 1. Bản ghi EmployeeRequests đã bị xóa
        var reqInDb = await db.EmployeeRequests.FirstOrDefaultAsync(r => r.RequestId == req.RequestId);
        Assert.Null(reqInDb);

        // 2. Dữ liệu LeaveRequests đã được thu hồi
        var leavesAfterDelete = await db.LeaveRequests.Where(l => l.EmployeeId == 302).ToListAsync();
        Assert.Empty(leavesAfterDelete);

        // 3. Quỹ phép năm được hoàn trả nguyên trạng 5 ngày
        var balanceAfterDelete = await leaveService.GetEmployeeLeaveBalanceAsync(302, DateTime.Today.Year);
        Assert.Equal(5.0m, balanceAfterDelete.AvailableBalance);
    }

    [Fact]
    public async Task DeleteRequestByHr_ApprovedRegularization_RollsBackTimeAdjustments()
    {
        using var db = CreateInMemoryDb();
        var requestService = new EmployeeRequestService(db);

        db.Employees.Add(new Employee { Id = 303, CompanyId = 1, EmployeeCode = "NV303", FullName = "Nhân viên Rollback Giải Trình" });
        await db.SaveChangesAsync();

        var workDate = DateTime.Today.AddDays(-1);
        var req = await requestService.SubmitRegularizationRequestAsync("NV303", new CreateRegularizationDto
        {
            WorkDate = workDate,
            ActualTimeIn = new TimeSpan(8, 0, 0),
            ActualTimeOut = new TimeSpan(17, 30, 0),
            ReasonCode = "QUEN_QUET_THE",
            Reason = "Quên quẹt thẻ về"
        }, companyId: 1);

        // HR duyệt đơn giải trình
        await requestService.DecideRequestAsync(req.RequestId, true, "Đồng ý giải trình", 999);

        var adjustments = await db.TimeAdjustments.Where(a => a.EmployeeCode == "NV303").ToListAsync();
        Assert.Single(adjustments);
        Assert.Equal(workDate, adjustments[0].WorkDate);

        // HR xóa giải trình đã duyệt
        await requestService.DeleteRequestByHrAsync(req.RequestId, 999);

        // Sau khi xóa: TimeAdjustments bị thu hồi
        var adjustmentsAfterDelete = await db.TimeAdjustments.Where(a => a.EmployeeCode == "NV303").ToListAsync();
        Assert.Empty(adjustmentsAfterDelete);

        var reqInDb = await db.EmployeeRequests.FirstOrDefaultAsync(r => r.RequestId == req.RequestId);
        Assert.Null(reqInDb);
    }

    [Fact]
    public async Task DeletePeriod_CompletelyWipesAllRelatedData_AndAllowsCreatingNewPeriod()
    {
        using var db = CreateInMemoryDb();

        var httpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext();
        httpContext.User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(new[]
        {
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, "1"),
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Name, "admin"),
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, "Admin")
        }, "TestAuth"));
        var httpAccessor = new Microsoft.AspNetCore.Http.HttpContextAccessor { HttpContext = httpContext };
        var accessService = new AccessService(db, httpAccessor);
        var auditService = new AuditService(db, httpAccessor);
        var leaveService = new LeaveService(db);
        var pubService = new TimesheetPublicationService(db, Microsoft.Extensions.Logging.Abstractions.NullLogger<TimesheetPublicationService>.Instance);
        var controller = new ChamCong.Api.Controllers.PeriodsController(
            db, accessService, auditService, null!, null!, null!, pubService, leaveService);

        // Chuẩn bị dữ liệu kỳ công với đầy đủ các bảng con phụ thuộc
        db.Companies.Add(new Company { Id = 1, Code = "SB_HO", Name = "Hội sở Superbrain" });
        db.Employees.Add(new Employee { Id = 101, CompanyId = 1, EmployeeCode = "SB001", FullName = "Nhân viên Test" });

        var period = new Period
        {
            Id = 10,
            CompanyId = 1,
            Year = 2026,
            Month = 10,
            FromDate = new DateTime(2026, 9, 26),
            ToDate = new DateTime(2026, 10, 25),
            StandardDays = 26,
            Status = PeriodStatus.Calculated,
            CreatedBy = "admin"
        };
        db.Periods.Add(period);

        var batch = new ImportBatch
        {
            Id = 5,
            PeriodId = 10,
            FileName = "Punches_Oct.xlsx",
            FileHash = "hash123",
            ImportedBy = "admin"
        };
        db.ImportBatches.Add(batch);

        db.RawPunches.Add(new RawPunch
        {
            Id = 501,
            PeriodId = 10,
            BatchId = 5,
            EmployeeId = 101,
            MachineCode = "SB001",
            WorkDate = new DateTime(2026, 10, 5),
            InMin = 480,
            OutMin = 1020,
            Source = "FILE"
        });

        db.DayResults.Add(new DayResult
        {
            PeriodId = 10,
            EmployeeId = 101,
            Date = new DateTime(2026, 10, 5),
            AutoCode = "+",
            Code = "+",
            PaidValue = 1.0m
        });

        db.DayResultManualBackups.Add(new DayResultManualBackup
        {
            PeriodId = 10,
            EmployeeId = 101,
            Date = new DateTime(2026, 10, 5),
            Code = "+",
            PaidValue = 1.0m
        });

        db.LeaveLedger.Add(new LeaveLedgerEntry
        {
            EmployeeId = 101,
            Year = 2026,
            Fund = "ANNUAL",
            PeriodId = 10,
            Date = new DateTime(2026, 10, 10),
            Code = "-1",
            Amount = -1.0m,
            Note = "Nghỉ phép kỳ tháng 10/2026"
        });

        db.PeriodNotes.Add(new PeriodNote
        {
            PeriodId = 10,
            EmployeeId = 101,
            Note = "Ghi chú kỳ công"
        });

        db.ExportHistory.Add(new ExportHistory
        {
            PeriodId = 10,
            FileName = "BangChamCong_T10.xlsx",
            ExportedBy = "admin",
            PeriodStatus = PeriodStatus.Calculated
        });

        db.Notifications.Add(new Notification
        {
            UserId = 1,
            Title = "Bảng công Tháng 10/2026",
            LinkType = "TIMESHEET",
            LinkId = 10
        });

        db.AuditLogs.Add(new AuditLog
        {
            UserId = 1,
            Username = "admin",
            CompanyId = 1,
            PeriodId = 10,
            Entity = "Period",
            EntityId = "10",
            Action = "CalculatePeriod"
        });

        var publication = new TimesheetPublication
        {
            PublicationId = 20,
            PeriodId = 10,
            BranchCode = "SB_HO",
            VersionNo = 1,
            IsCurrent = true,
            PublishedByUserId = 1
        };
        db.TimesheetPublications.Add(publication);

        db.TimesheetPublishedLines.Add(new TimesheetPublishedLine
        {
            PublicationId = 20,
            EmployeeCode = "SB001",
            DailyCodes = "+",
            WorkDays = 1,
            PaidDays = 1
        });

        db.TimesheetDisputes.Add(new TimesheetDispute
        {
            DisputeId = 30,
            PublicationId = 20,
            EmployeeCode = "SB001",
            Content = "Khiếu nại giờ về",
            Status = "OPEN"
        });

        await db.SaveChangesAsync();

        // Thực hiện xóa kỳ công
        var result = await controller.DeletePeriod(10, force: true, CancellationToken.None);
        if (result is Microsoft.AspNetCore.Mvc.ObjectResult obj && obj.StatusCode != 200)
        {
            throw new Exception("DeletePeriod failed: " + System.Text.Json.JsonSerializer.Serialize(obj.Value));
        }
        var okResult = Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(result);
        Assert.NotNull(okResult.Value);

        // Kiểm tra xóa sạch 100% dữ liệu
        Assert.Null(await db.Periods.FindAsync(10));
        Assert.Empty(await db.ImportBatches.Where(b => b.PeriodId == 10).ToListAsync());
        Assert.Empty(await db.RawPunches.Where(p => p.PeriodId == 10).ToListAsync());
        Assert.Empty(await db.DayResults.Where(r => r.PeriodId == 10).ToListAsync());
        Assert.Empty(await db.DayResultManualBackups.Where(b => b.PeriodId == 10).ToListAsync());
        Assert.Empty(await db.LeaveLedger.Where(l => l.PeriodId == 10).ToListAsync());
        Assert.Empty(await db.PeriodNotes.Where(n => n.PeriodId == 10).ToListAsync());
        Assert.Empty(await db.ExportHistory.Where(e => e.PeriodId == 10).ToListAsync());
        Assert.Empty(await db.Notifications.Where(n => n.LinkType == "TIMESHEET" && n.LinkId == 10).ToListAsync());
        Assert.Empty(await db.TimesheetPublications.Where(p => p.PeriodId == 10).ToListAsync());
        Assert.Empty(await db.TimesheetDisputes.Where(d => d.PublicationId == 20).ToListAsync());
        Assert.Empty(await db.TimesheetPublishedLines.Where(l => l.PublicationId == 20).ToListAsync());

        // Kiểm tra AuditLogs cũ không còn giữ PeriodId = 10
        var oldAudit = await db.AuditLogs.FirstOrDefaultAsync(a => a.Action == "CalculatePeriod");
        Assert.NotNull(oldAudit);
        Assert.Null(oldAudit.PeriodId);

        // Kiểm tra có thể tạo lại kỳ công mới cho Tháng 10/2026 ngay lập tức
        var createResult = await controller.Create(new ChamCong.Api.Controllers.PeriodsController.CreatePeriodDto(1, 2026, 10, 26), CancellationToken.None);
        var createOk = Assert.IsType<Microsoft.AspNetCore.Mvc.CreatedAtActionResult>(createResult);
        var newPeriod = Assert.IsType<ChamCong.Api.Controllers.PeriodsController.PeriodDto>(createOk.Value);
        Assert.Equal((byte)10, newPeriod.Month);
        Assert.Equal((short)2026, newPeriod.Year);
        Assert.NotEqual(10, newPeriod.Id); // ID mới
    }

    [Fact]
    public async Task DeletePeriod_ClosedPeriodWithAccrual_RevertsLeaveAccrualAndDeletesCleanly()
    {
        using var db = CreateInMemoryDb();

        var httpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext();
        httpContext.User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(new[]
        {
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, "1"),
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Name, "hr"),
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, "HR")
        }, "TestAuth"));
        var httpAccessor = new Microsoft.AspNetCore.Http.HttpContextAccessor { HttpContext = httpContext };
        var accessService = new AccessService(db, httpAccessor);
        var auditService = new AuditService(db, httpAccessor);
        var leaveService = new LeaveService(db);
        var pubService = new TimesheetPublicationService(db, Microsoft.Extensions.Logging.Abstractions.NullLogger<TimesheetPublicationService>.Instance);
        var controller = new ChamCong.Api.Controllers.PeriodsController(
            db, accessService, auditService, null!, null!, null!, pubService, leaveService);

        db.Companies.Add(new Company { Id = 1, Code = "SB_HO", Name = "Hội sở Superbrain" });
        db.UserCompanies.Add(new UserCompany { UserId = 1, CompanyId = 1 });
        db.Employees.Add(new Employee { Id = 201, CompanyId = 1, EmployeeCode = "SB201", FullName = "Nhân viên Closed Period" });

        var period = new Period
        {
            Id = 55,
            CompanyId = 1,
            Year = 2026,
            Month = 11,
            FromDate = new DateTime(2026, 10, 26),
            ToDate = new DateTime(2026, 11, 25),
            StandardDays = 26,
            Status = PeriodStatus.Closed, // Kỳ đã chốt
            CreatedBy = "admin"
        };
        db.Periods.Add(period);

        // Đã tích lũy +1 ngày phép năm do làm việc đủ công
        db.LeaveLedger.Add(new LeaveLedgerEntry
        {
            EmployeeId = 201,
            Year = 2026,
            Fund = "ANNUAL",
            PeriodId = 55,
            Date = new DateTime(2026, 11, 25),
            Code = "ACCRUAL",
            Amount = 1.0m,
            Note = "Cộng 1 ngày phép năm do làm việc đủ 26 ngày công kỳ Tháng 11/2026"
        });

        await db.SaveChangesAsync();

        // 1. Nếu không có force=true và là HR, trả về yêu cầu xác nhận
        var unforcedResult = await controller.DeletePeriod(55, force: false, CancellationToken.None);
        var badRequest = Assert.IsType<Microsoft.AspNetCore.Mvc.BadRequestObjectResult>(unforcedResult);
        Assert.NotNull(badRequest.Value);

        // 2. Khi HR xác nhận xóa (force = true)
        var forcedResult = await controller.DeletePeriod(55, force: true, CancellationToken.None);
        var okResult = Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(forcedResult);
        Assert.NotNull(okResult.Value);

        // 3. Toàn bộ bản ghi kỳ công & cộng phép năm bị xóa sạch
        Assert.Null(await db.Periods.FindAsync(55));
        var remainingAccruals = await db.LeaveLedger.Where(l => l.PeriodId == 55).ToListAsync();
        Assert.Empty(remainingAccruals);
    }
}



