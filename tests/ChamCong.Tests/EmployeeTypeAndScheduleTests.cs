using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ChamCong.Api.Controllers;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using ChamCong.Engine;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ChamCong.Tests;

public class EmployeeTypeAndScheduleTests
{
    private AppDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(x => x.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new AppDbContext(options);
    }

    private void SeedBaseCompanyAndEmployee(AppDbContext db, out Company comp, out Employee empPartTime, out Employee empRemote)
    {
        comp = new Company
        {
            Id = 1,
            Code = "HQ_TEST",
            Name = "Hội Sở Kiểm Thử",
            CreatedAt = DateTime.UtcNow
        };
        db.Companies.Add(comp);

        empPartTime = new Employee
        {
            Id = 101,
            CompanyId = 1,
            EmployeeCode = "PT01",
            FullName = "Nguyễn Văn PartTime",
            EmployeeType = "PARTTIME",
            StartDate = new DateTime(2026, 1, 1),
            CreatedAt = DateTime.UtcNow
        };

        empRemote = new Employee
        {
            Id = 102,
            CompanyId = 1,
            EmployeeCode = "RM01",
            FullName = "Trần Thị Remote",
            EmployeeType = "REMOTE",
            StartDate = new DateTime(2026, 1, 1),
            CreatedAt = DateTime.UtcNow
        };

        var user = new User
        {
            Id = 201,
            Username = "pt01_user",
            FullName = "Nguyễn Văn PartTime",
            PasswordHash = "dummy",
            Role = Roles.Employee,
            EmployeeCode = empPartTime.EmployeeCode,
            CreatedAt = DateTime.UtcNow
        };

        db.Employees.AddRange(empPartTime, empRemote);
        db.Users.Add(user);
        db.SaveChanges();
    }

    [Fact]
    public async Task WorkSchedulesController_DisallowsBackdatedRegistration()
    {
        using var db = CreateInMemoryDb();
        SeedBaseCompanyAndEmployee(db, out var comp, out var empPartTime, out _);

        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "201"),
            new Claim(ClaimTypes.Name, "pt01_user"),
            new Claim("CompanyId", comp.Id.ToString()),
            new Claim("EmployeeCode", empPartTime.EmployeeCode),
            new Claim(ClaimTypes.Role, "Staff")
        }, "mock"));

        var httpAccessor = new HttpContextAccessor { HttpContext = httpContext };
        var access = new AccessService(db, httpAccessor);
        var audit = new AuditService(db, httpAccessor);
        var controller = new WorkSchedulesController(db, access, audit)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext }
        };

        // Đăng ký ngày hôm qua (quá khứ) -> Phải bị từ chối với 400 Bad Request
        var yesterday = DateTime.Today.AddDays(-1);
        var req = new WorkSchedulesController.RegisterScheduleRequest
        {
            Dates = new List<DateTime> { yesterday },
            ShiftCode = "FULL",
            Note = "Đăng ký lùi ngày trái quy định"
        };

        var result = await controller.RegisterSchedules(req, CancellationToken.None);
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("trước", badRequestResult.Value?.ToString() ?? "", StringComparison.OrdinalIgnoreCase);

        // Đăng ký ngày hôm nay và ngày mai -> Hợp lệ
        var today = DateTime.Today;
        var tomorrow = DateTime.Today.AddDays(1);
        var validReq = new WorkSchedulesController.RegisterScheduleRequest
        {
            Dates = new List<DateTime> { today, tomorrow },
            ShiftCode = "FULL",
            Note = "Đăng ký hợp lệ"
        };

        var okResult = await controller.RegisterSchedules(validReq, CancellationToken.None);
        Assert.IsType<OkObjectResult>(okResult);

        // Kiểm tra database có 2 bản ghi
        var schedules = await db.WorkSchedules.Where(s => s.EmployeeCode == empPartTime.EmployeeCode).ToListAsync();
        Assert.Equal(2, schedules.Count);
        Assert.All(schedules, s => Assert.Equal("REGISTERED", s.Status));
    }

    [Fact]
    public async Task WorkSchedulesController_GetMySchedules_IncludesCompanyCalendar()
    {
        using var db = CreateInMemoryDb();
        SeedBaseCompanyAndEmployee(db, out var comp, out var empPartTime, out _);

        // Thêm ngày lễ công ty vào CalendarDays
        var holidayDate = DateTime.Today.AddDays(5);
        db.CalendarDays.Add(new CalendarDayEntity
        {
            CompanyId = comp.Id,
            Date = holidayDate,
            DayType = (byte)DayType.Holiday,
            CompanyOffCode = "LE_HOI",
            Note = "Ngày hội văn hóa Superbrain"
        });

        // Thêm lịch đăng ký làm
        var workDate = DateTime.Today.AddDays(1);
        db.WorkSchedules.Add(new WorkSchedule
        {
            CompanyId = comp.Id,
            EmployeeId = empPartTime.Id,
            EmployeeCode = empPartTime.EmployeeCode,
            WorkDate = workDate,
            ShiftCode = "MORNING",
            Note = "Văn phòng Hội sở",
            Status = "REGISTERED",
            RegisteredAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "201"),
            new Claim(ClaimTypes.Name, "pt01_user"),
            new Claim("CompanyId", comp.Id.ToString()),
            new Claim("EmployeeCode", empPartTime.EmployeeCode),
            new Claim(ClaimTypes.Role, "Employee")
        }, "mock"));

        var httpAccessor = new HttpContextAccessor { HttpContext = httpContext };
        var access = new AccessService(db, httpAccessor);
        var audit = new AuditService(db, httpAccessor);
        var controller = new WorkSchedulesController(db, access, audit)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext }
        };

        var from = DateTime.Today.AddDays(-1);
        var to = DateTime.Today.AddDays(10);
        var actionResult = await controller.GetMySchedules(from, to, CancellationToken.None);
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        Assert.NotNull(okResult.Value);

        // Dùng dynamic/reflection để đọc các thuộc tính trả về
        var val = okResult.Value;
        var propSchedules = val.GetType().GetProperty("schedules")?.GetValue(val) as System.Collections.IEnumerable;
        var propCalendar = val.GetType().GetProperty("companyCalendar")?.GetValue(val) as System.Collections.IEnumerable;
        
        Assert.NotNull(propSchedules);
        Assert.NotNull(propCalendar);
        
        var schedulesList = propSchedules.Cast<object>().ToList();
        var calendarList = propCalendar.Cast<object>().ToList();

        Assert.Single(schedulesList);
        Assert.Single(calendarList);
    }

    [Fact]
    public async Task AttendancePunchService_AutoApprovesRemoteEmployeeCheckinAtHome()
    {
        using var db = CreateInMemoryDb();
        SeedBaseCompanyAndEmployee(db, out var comp, out _, out var empRemote);

        // Đăng ký thiết bị PC cho nhân viên remote
        db.EmployeeDevices.Add(new EmployeeDevice
        {
            CompanyId = comp.Id,
            EmployeeCode = empRemote.EmployeeCode,
            DeviceType = "PC",
            DeviceName = "Laptop Home",
            FingerprintHash = "02:5A:3C:9B:44:1E",
            IsActiveSlot = true,
            RequestedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var devService = new DeviceService(db);
        var geofence = new GeofenceService(db);
        var logger = new NullLogger<AttendancePunchService>();
        var punchService = new AttendancePunchService(db, devService, geofence, logger);

        // Remote employee punches check-in from IP/GPS outside branch office
        var punchReq = new PunchRequestDto
        {
            ClientRequestId = Guid.NewGuid(),
            Channel = "PC_WEB",
            MacAddress = "02:5A:3C:9B:44:1E",
            UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            PunchType = "CHECK_IN"
        };

        var resp = await punchService.PunchAsync(empRemote.EmployeeCode, null, "123.45.67.89", punchReq);

        // Remote presence check must evaluate to VALID with reason REMOTE_HOME_PUNCH
        Assert.Equal("VALID", resp.VerificationStatus);
        Assert.Equal("REMOTE_HOME_PUNCH", resp.ReasonCode);
    }

    [Fact]
    public async Task LeaveRequestService_AllowsUnpaidLeave_WithoutAnnualLeaveBalance()
    {
        using var db = CreateInMemoryDb();
        SeedBaseCompanyAndEmployee(db, out var comp, out var empPartTime, out _);

        var reqService = new EmployeeRequestService(db);

        // Employee có 0 ngày phép năm nhưng nộp đơn KL (Nghỉ không hưởng lương)
        var dto = new CreateLeaveDto
        {
            LeaveCode = "KL", // Nghỉ không hưởng lương
            FromDate = DateTime.Today.AddDays(2),
            ToDate = DateTime.Today.AddDays(2),
            DayPart = "FULL",
            Reason = "Việc riêng cá nhân khi đã hết phép năm"
        };

        var req = await reqService.SubmitLeaveRequestAsync(empPartTime.EmployeeCode, dto, comp.Id);
        Assert.NotNull(req);
        Assert.Equal("KL", req.LeaveCode);
        Assert.Contains("PENDING", req.Status);
    }

    [Fact]
    public void AttendanceCodes_Contains_UnpaidLeave_KL()
    {
        var defaults = Codes.Defaults();
        var klDef = defaults.FirstOrDefault(c => c.Code == Codes.UnpaidLeave);
        Assert.NotNull(klDef);
        Assert.Equal("KL", Codes.UnpaidLeave);
        Assert.Equal("Nghỉ không hưởng lương", klDef.Name);
        Assert.Contains(Codes.UnpaidLeave, Codes.SystemCodes);
    }

    [Fact]
    public async Task ForceDeleteCompany_RemovesCompanyAndCascadesCleanly()
    {
        using var db = CreateInMemoryDb();
        
        // 1. Tạo root company để đảm bảo hệ thống duy trì >= 1 hội sở
        var rootComp = new Company
        {
            Id = 1,
            Code = "SUPERBRAIN",
            Name = "Hội Sở Chính Superbrain",
            CreatedAt = DateTime.UtcNow
        };
        db.Companies.Add(rootComp);

        // 2. Tạo branch company để xóa cưỡng bức
        var branchComp = new Company
        {
            Id = 2,
            Code = "BRANCH_TEST",
            Name = "Chi Nhánh Cần Xóa",
            CreatedAt = DateTime.UtcNow
        };
        db.Companies.Add(branchComp);

        var emp = new Employee
        {
            Id = 201,
            CompanyId = branchComp.Id,
            EmployeeCode = "BR01",
            FullName = "Nhân viên Chi Nhánh",
            StartDate = new DateTime(2026, 1, 1),
            CreatedAt = DateTime.UtcNow
        };
        db.Employees.Add(emp);

        var schedule = new WorkSchedule
        {
            ScheduleId = 1,
            CompanyId = branchComp.Id,
            EmployeeId = emp.Id,
            EmployeeCode = emp.EmployeeCode,
            WorkDate = new DateTime(2026, 10, 20),
            ShiftCode = "FULL",
            Status = "REGISTERED",
            RegisteredAtUtc = DateTime.UtcNow
        };
        db.WorkSchedules.Add(schedule);

        // Thêm thiết bị và lượt bấm chấm công tham chiếu thiết bị
        var dev = new EmployeeDevice
        {
            DeviceBindingId = 55,
            CompanyId = branchComp.Id,
            EmployeeCode = emp.EmployeeCode,
            DeviceType = "PC",
            DeviceName = "Laptop BR01",
            FingerprintHash = "AA:BB:CC:DD:EE:FF",
            IsActiveSlot = true,
            RequestedAtUtc = DateTime.UtcNow
        };
        db.EmployeeDevices.Add(dev);

        var token = new RefreshToken
        {
            TokenId = 501,
            DeviceBindingId = dev.DeviceBindingId,
            TokenHash = "dummy_hash",
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            CreatedAtUtc = DateTime.UtcNow
        };
        db.RefreshTokens.Add(token);

        var webLog = new WebAttendanceLog
        {
            WebLogId = 1001,
            CompanyId = branchComp.Id,
            EmployeeCode = emp.EmployeeCode,
            DeviceBindingId = dev.DeviceBindingId,
            ClientRequestId = Guid.NewGuid(),
            Channel = "PC_WEB",
            CheckTimeUtc = DateTime.UtcNow,
            WorkDate = new DateTime(2026, 10, 20),
            CheckinPolicy = "PC_STRICT",
            ClientPublicIP = "1.2.3.4",
            GpsState = "OK",
            VerificationStatus = "VALID"
        };
        db.WebAttendanceLogs.Add(webLog);

        var summary = new DailyPunchSummary
        {
            CompanyId = branchComp.Id,
            EmployeeCode = emp.EmployeeCode,
            WorkDate = new DateTime(2026, 10, 20),
            InTime = new TimeSpan(8, 0, 0),
            OutTime = new TimeSpan(17, 0, 0),
            InLogId = webLog.WebLogId,
            OutLogId = webLog.WebLogId
        };
        db.DailyPunchSummaries.Add(summary);

        var adj = new TimeAdjustment
        {
            AdjustmentId = 301,
            CompanyId = branchComp.Id,
            EmployeeCode = emp.EmployeeCode,
            WorkDate = new DateTime(2026, 10, 20),
            AdjInTime = new TimeSpan(8, 0, 0),
            AdjOutTime = new TimeSpan(17, 0, 0),
            IsActive = true
        };
        db.TimeAdjustments.Add(adj);

        await db.SaveChangesAsync();

        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "1"),
            new Claim(ClaimTypes.Name, "superadmin"),
            new Claim(ClaimTypes.Role, "Admin")
        }, "mock"));

        var httpAccessor = new HttpContextAccessor { HttpContext = httpContext };
        var access = new AccessService(db, httpAccessor);
        var audit = new AuditService(db, httpAccessor);
        var controller = new CompaniesController(db, access, audit);

        var result = await controller.ForceDelete(branchComp.Id, CancellationToken.None);
        var okResult = Assert.IsType<OkObjectResult>(result);

        // Đảm bảo branchComp và các thực thể liên quan đã bị xóa sạch
        var compAfter = await db.Companies.FindAsync(branchComp.Id);
        Assert.Null(compAfter);

        var schedulesAfter = await db.WorkSchedules.Where(s => s.CompanyId == branchComp.Id).ToListAsync();
        Assert.Empty(schedulesAfter);

        var devicesAfter = await db.EmployeeDevices.Where(d => d.CompanyId == branchComp.Id).ToListAsync();
        Assert.Empty(devicesAfter);

        var webLogsAfter = await db.WebAttendanceLogs.Where(w => w.CompanyId == branchComp.Id).ToListAsync();
        Assert.Empty(webLogsAfter);

        var tokensAfter = await db.RefreshTokens.Where(t => t.DeviceBindingId == dev.DeviceBindingId).ToListAsync();
        Assert.Empty(tokensAfter);

        var summariesAfter = await db.DailyPunchSummaries.Where(s => s.CompanyId == branchComp.Id).ToListAsync();
        Assert.Empty(summariesAfter);

        var adjsAfter = await db.TimeAdjustments.Where(a => a.CompanyId == branchComp.Id).ToListAsync();
        Assert.Empty(adjsAfter);

        var employeesAfter = await db.Employees.Where(e => e.CompanyId == branchComp.Id).ToListAsync();
        Assert.Empty(employeesAfter);

        // Root company vẫn còn nguyên vẹn
        var rootAfter = await db.Companies.FindAsync(rootComp.Id);
        Assert.NotNull(rootAfter);
    }

    [Fact]
    public async Task WorkSchedulesController_RejectsStandardEmployees()
    {
        using var db = CreateInMemoryDb();
        var comp = new Company { Id = 1, Code = "HQ_TEST", Name = "Hội Sở", CreatedAt = DateTime.UtcNow };
        db.Companies.Add(comp);

        var empStandard = new Employee
        {
            Id = 103,
            CompanyId = 1,
            EmployeeCode = "STD01",
            FullName = "Nguyễn Văn Chuẩn",
            EmployeeType = "STANDARD",
            StartDate = new DateTime(2026, 1, 1),
            CreatedAt = DateTime.UtcNow
        };
        db.Employees.Add(empStandard);

        var user = new User
        {
            Id = 203,
            Username = "std01_user",
            FullName = "Nguyễn Văn Chuẩn",
            PasswordHash = "dummy",
            Role = Roles.Employee,
            EmployeeCode = empStandard.EmployeeCode,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "203"),
            new Claim(ClaimTypes.Name, "std01_user"),
            new Claim("CompanyId", comp.Id.ToString()),
            new Claim("EmployeeCode", empStandard.EmployeeCode),
            new Claim(ClaimTypes.Role, "Staff")
        }, "mock"));

        var httpAccessor = new HttpContextAccessor { HttpContext = httpContext };
        var access = new AccessService(db, httpAccessor);
        var audit = new AuditService(db, httpAccessor);
        var controller = new WorkSchedulesController(db, access, audit)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext }
        };

        var req = new WorkSchedulesController.RegisterScheduleRequest
        {
            Dates = new List<DateTime> { DateTime.Today.AddDays(1) },
            ShiftCode = "FULL",
            Note = "Nhân viên chuẩn thử đăng ký"
        };

        var result = await controller.RegisterSchedules(req, CancellationToken.None);
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("Part-time", badRequestResult.Value?.ToString() ?? "", StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task LeaveService_MonthlyCarryover_NextMonthOpeningEqualsPriorRemaining()
    {
        using var db = CreateInMemoryDb();
        var comp = new Company { Id = 1, Code = "HQ_TEST", Name = "Hội Sở", CreatedAt = DateTime.UtcNow };
        db.Companies.Add(comp);

        var emp = new Employee
        {
            Id = 501,
            CompanyId = 1,
            EmployeeCode = "NV_LEAVE_TEST",
            FullName = "Lê Thị Test Phép",
            EmployeeType = "STANDARD",
            StartDate = new DateTime(2026, 1, 1),
            CreatedAt = DateTime.UtcNow
        };
        db.Employees.Add(emp);

        // Quỹ phép năm 2026: Đầu năm có 12 ngày
        db.LeaveFunds.Add(new LeaveFund
        {
            EmployeeId = emp.Id,
            Year = 2026,
            AnnualOpening = 12m,
            CarryOpening = 0m,
            CompOpening = 0m
        });

        // Tháng 1/2026: Tích lũy +1 ngày (Date = 31/01/2026)
        db.LeaveLedger.Add(new LeaveLedgerEntry
        {
            EmployeeId = emp.Id,
            Year = 2026,
            Date = new DateTime(2026, 1, 31),
            Amount = 1m,
            Fund = "ANNUAL",
            Note = "Tích lũy tháng 1"
        });

        // Tháng 1/2026: Đã dùng 2 ngày (Date = 15/01/2026, Amount = -2)
        db.LeaveLedger.Add(new LeaveLedgerEntry
        {
            EmployeeId = emp.Id,
            Year = 2026,
            Date = new DateTime(2026, 1, 15),
            Amount = -2m,
            Fund = "ANNUAL",
            Note = "Nghỉ phép 2 ngày tháng 1"
        });

        await db.SaveChangesAsync();

        var leaveService = new LeaveService(db);

        // 1. Kiểm tra Tháng 1:
        // Đầu kỳ T1 = 12
        // Tích lũy T1 = +1
        // Tổng hưởng T1 = 13
        // Đã dùng T1 = 2
        // Tồn T1 = 13 - 2 = 11
        var balanceMonth1 = await leaveService.GetEmployeeLeaveBalanceAsync(emp.Id, 2026, 1);
        Assert.Equal(12m, balanceMonth1.AnnualOpening);
        Assert.Equal(1m, balanceMonth1.Accrued);
        Assert.Equal(13m, balanceMonth1.TotalAnnualEarned);
        Assert.Equal(2m, balanceMonth1.AnnualUsed);
        Assert.Equal(11m, balanceMonth1.AvailableBalance);

        // 2. Kiểm tra Tháng 2:
        // Theo quy tắc: "cách tính phép số dư đầu kỳ của tháng này sẽ bằng số phép tồn của tháng trước"
        // Đầu kỳ T2 = Tồn T1 = 11
        // Trong tháng 2 chưa có tích lũy hay sử dụng gì:
        // Tích lũy T2 = 0
        // Tổng hưởng T2 = 11
        // Tồn T2 = 11
        var balanceMonth2 = await leaveService.GetEmployeeLeaveBalanceAsync(emp.Id, 2026, 2);
        Assert.Equal(11m, balanceMonth2.AnnualOpening);
        Assert.Equal(0m, balanceMonth2.Accrued);
        Assert.Equal(0m, balanceMonth2.MonthUsed);
        Assert.Equal(2m, balanceMonth2.AnnualUsed);
        Assert.Equal(11m, balanceMonth2.AvailableBalance);

        // 3. Kiểm tra qua Company Funds của Tháng 2:
        var companyFundsMonth2 = await leaveService.GetCompanyLeaveFundsAsync(comp.Id, 2026, 2);
        var fundItem = Assert.Single(companyFundsMonth2);
        Assert.Equal(11m, fundItem.AnnualOpening);
        Assert.Equal(11m, fundItem.AvailableBalance);
    }
}
