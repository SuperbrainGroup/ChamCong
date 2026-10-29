using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using ChamCong.Engine;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ChamCong.Tests;

public class DeviceAndGpsTests
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
    public async Task SameMac_CanBeRegisteredAcrossDifferentCompanies_ButBlockedInSameCompany()
    {
        using var db = CreateInMemoryDb();
        var deviceService = new DeviceService(db);

        // Company 1 and Company 2
        var c1 = new Company { Id = 1, Code = "HOIS01", Name = "Hội Sở 1", IsActive = true };
        var c2 = new Company { Id = 2, Code = "HOIS02", Name = "Chi Nhánh 2", IsActive = true };
        db.Companies.AddRange(c1, c2);

        var emp1 = new Employee { Id = 1, EmployeeCode = "NV01", FullName = "Nhân viên 1", CompanyId = 1 };
        var emp2 = new Employee { Id = 2, EmployeeCode = "NV02", FullName = "Nhân viên 2", CompanyId = 2 };
        var emp3 = new Employee { Id = 3, EmployeeCode = "NV03", FullName = "Nhân viên 3", CompanyId = 1 };
        db.Employees.AddRange(emp1, emp2, emp3);
        await db.SaveChangesAsync();

        string sharedMac = "AA-BB-CC-DD-EE-FF";

        // Register for NV01 in Company 1 -> Success
        var (dev1, _) = await deviceService.RegisterDeviceAsync(
            "NV01", "PC", "PC C1", "Windows", "Chrome", sharedMac, "127.0.0.1", 1);
        Assert.NotNull(dev1);
        Assert.Equal(sharedMac, dev1.FingerprintHash);

        // Register same MAC for NV02 in Company 2 -> Allowed! (Different Company)
        var (dev2, _) = await deviceService.RegisterDeviceAsync(
            "NV02", "PC", "PC C2", "Windows", "Chrome", sharedMac, "127.0.0.1", 2);
        Assert.NotNull(dev2);
        Assert.Equal(sharedMac, dev2.FingerprintHash);

        // Register same MAC for NV03 in Company 1 -> Should be REJECTED! (Same Company)
        var ex = await Assert.ThrowsAsync<AppException>(() =>
            deviceService.RegisterDeviceAsync("NV03", "PC", "PC C1 Dup", "Windows", "Chrome", sharedMac, "127.0.0.1", 1));

        Assert.Contains("đã được đăng ký", ex.Message);
    }

    [Fact]
    public async Task MobilePunch_WithoutGps_IsRejected()
    {
        using var db = CreateInMemoryDb();
        var geofence = new GeofenceService(db);
        var deviceService = new DeviceService(db);
        var logger = NullLogger<AttendancePunchService>.Instance;
        var punchService = new AttendancePunchService(db, deviceService, geofence, logger);

        var company = new Company { Id = 1, Code = "TEST", Name = "Công ty Test", IsActive = true };
        db.Companies.Add(company);

        var emp = new Employee { Id = 10, EmployeeCode = "NV_MOB", FullName = "Mobile User", CompanyId = 1 };
        db.Employees.Add(emp);
        await db.SaveChangesAsync();

        // Punch via mobile with NO GPS coordinates
        var punchReq = new PunchRequestDto
        {
            PunchType = "IN",
            Channel = "MOBILE",
            Latitude = null,
            Longitude = null
        };

        var ex = await Assert.ThrowsAsync<AppException>(() =>
            punchService.PunchAsync("NV_MOB", null, "192.168.1.100", punchReq, 1));

        Assert.Contains("GPS", ex.Message);
    }

    [Fact]
    public async Task EnsureEmployeeProfileAsync_CreatesProfileForHrUser()
    {
        using var db = CreateInMemoryDb();
        var http = new HttpContextAccessor();
        var accessService = new AccessService(db, http);

        var company = new Company { Id = 1, Code = "HQ", Name = "Trụ sở chính", IsActive = true };
        db.Companies.Add(company);

        var hrUser = new User
        {
            Id = 5,
            Username = "hr_test",
            FullName = "Nguyễn Văn HR",
            Role = "hr",
            IsActive = true
        };
        db.Users.Add(hrUser);
        await db.SaveChangesAsync();

        // Initially no EmployeeCode
        Assert.Null(hrUser.EmployeeCode);

        // Call EnsureEmployeeProfileAsync
        var emp = await accessService.EnsureEmployeeProfileAsync(hrUser, 1);
        Assert.NotNull(emp);
        Assert.Equal("HR005", emp.EmployeeCode);
        Assert.Equal("HR005", hrUser.EmployeeCode);
        Assert.Equal(1, emp.CompanyId);

        // Verify in DB
        var savedEmp = await db.Employees.FirstOrDefaultAsync(e => e.EmployeeCode == "HR005");
        Assert.NotNull(savedEmp);
        Assert.Equal("Nguyễn Văn HR", savedEmp.FullName);
    }
}
