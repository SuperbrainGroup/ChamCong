using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ChamCong.Tests;

public class Phase2Tests
{
    private AppDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
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

        // 1. Đăng ký Mobile lần đầu -> thành công và tự động kích hoạt
        var (dev1, secret1) = await deviceService.RegisterDeviceAsync("NV001", "MOBILE", "iPhone 15", "iOS", "Safari", "fp1", "127.0.0.1");
        Assert.Equal("APPROVED", dev1.ApprovalStatus);
        Assert.False(string.IsNullOrEmpty(secret1));

        // 2. Đăng ký thêm Mobile khi đã có thiết bị đang active -> Bị từ chối conflict
        await Assert.ThrowsAsync<AppException>(async () =>
        {
            await deviceService.RegisterDeviceAsync("NV001", "MOBILE", "Samsung S24", "Android", "Chrome", "fp2", "127.0.0.1");
        });

        // 3. Đăng ký PC -> Thành công (vì khe PC còn trống)
        var (dev2, secret2) = await deviceService.RegisterDeviceAsync("NV001", "PC", "MacBook Pro", "macOS", "Chrome", "fp3", "127.0.0.1");
        Assert.Equal("APPROVED", dev2.ApprovalStatus);
        Assert.False(string.IsNullOrEmpty(secret2));
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
}
