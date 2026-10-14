using System.Data;
using System.Text.RegularExpressions;
using ChamCong.Api.Infrastructure;
using ChamCong.Engine;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ChamCong.Api.Data;

public static class DbSeeder
{
    public static async Task EnsureDatabaseAndSchemaAsync(AppDbContext db, IConfiguration config, IPasswordService passwordService, ILogger logger)
    {
        var connStr = config.GetConnectionString("DefaultConnection") ?? db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connStr)) return;

        // 1. Đảm bảo Database tồn tại bằng master connection (nếu có quyền)
        try
        {
            var csb = new SqlConnectionStringBuilder(connStr);
            var targetDb = csb.InitialCatalog;
            if (!string.IsNullOrWhiteSpace(targetDb))
            {
                var masterCsb = new SqlConnectionStringBuilder(connStr)
                {
                    InitialCatalog = "master"
                };
                using var masterConn = new SqlConnection(masterCsb.ConnectionString);
                await masterConn.OpenAsync();
                using var cmd = masterConn.CreateCommand();
                cmd.CommandText = $"IF DB_ID(N'{targetDb}') IS NULL CREATE DATABASE [{targetDb}]";
                await cmd.ExecuteNonQueryAsync();
                logger.LogInformation("Đã kiểm tra/khởi tạo Database: {Database}", targetDb);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning("Không thể kiểm tra/tạo Database qua master (có thể user không có quyền trên master): {Message}", ex.Message);
        }

        // 2. Thực thi schema.sql để khởi tạo bảng mới hoặc tự động bổ sung cột còn thiếu (Idempotent)
        string? schemaSql = null;
        var potentialPaths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Data", "schema.sql"),
            Path.Combine(AppContext.BaseDirectory, "schema.sql"),
            Path.Combine(Directory.GetCurrentDirectory(), "src", "ChamCong.Api", "Data", "schema.sql"),
            Path.Combine(Directory.GetCurrentDirectory(), "Data", "schema.sql"),
            Path.Combine(Directory.GetCurrentDirectory(), "schema.sql")
        };

        foreach (var path in potentialPaths)
        {
            if (File.Exists(path))
            {
                schemaSql = await File.ReadAllTextAsync(path);
                logger.LogInformation("Tìm thấy schema.sql tại: {Path}", path);
                break;
            }
        }

        if (!string.IsNullOrWhiteSpace(schemaSql))
        {
            try
            {
                var conn = db.Database.GetDbConnection();
                if (conn.State != ConnectionState.Open)
                {
                    await conn.OpenAsync();
                }

                // Tách câu lệnh theo GO
                var batches = Regex.Split(schemaSql, @"^\s*GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                foreach (var b in batches)
                {
                    var sql = b.Trim();
                    if (string.IsNullOrWhiteSpace(sql)) continue;
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = sql;
                    cmd.CommandTimeout = 120;
                    try
                    {
                        await cmd.ExecuteNonQueryAsync();
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning("Chi tiết thực thi batch SQL: {Message}", ex.Message);
                    }
                }

                logger.LogInformation("✅ Đã kiểm tra & đồng bộ cấu trúc CSDL thành công từ schema.sql!");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Lỗi khi chạy schema.sql: {Message}", ex.Message);
            }
        }

        // 3. Đảm bảo các cột InTime, OutTime, BatchId trong bảng RawPunches luôn tồn tại và phù hợp
        try
        {
            var conn = db.Database.GetDbConnection();
            if (conn.State != ConnectionState.Open) await conn.OpenAsync();

            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                IF OBJECT_ID(N'dbo.RawPunches', N'U') IS NOT NULL
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = N'RawPunches' AND COLUMN_NAME = N'InTime')
                        ALTER TABLE dbo.RawPunches ADD InTime NVARCHAR(20) NULL;
                    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = N'RawPunches' AND COLUMN_NAME = N'OutTime')
                        ALTER TABLE dbo.RawPunches ADD OutTime NVARCHAR(20) NULL;
                    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = N'RawPunches' AND COLUMN_NAME = N'BatchId' AND IS_NULLABLE = 'NO')
                        ALTER TABLE dbo.RawPunches ALTER COLUMN BatchId INT NULL;
                END";
            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            logger.LogWarning("Kiểm tra cột RawPunches (InTime/OutTime/BatchId): {Message}", ex.Message);
        }

        // 4. Tiến hành nạp dữ liệu mặc định (Admin, Công ty, Mã chấm công, v.v.)
        await SeedAsync(db, passwordService, logger);
    }

    public static async Task SeedAsync(AppDbContext db, IPasswordService passwordService, ILogger logger)
    {
        // 1. Seed Admin nếu chưa có
        if (!await db.Users.AnyAsync(u => u.Role == Roles.Admin))
        {
            var admin = new User
            {
                Username = "admin",
                FullName = "Quản trị viên Hệ thống",
                PasswordHash = passwordService.HashPassword("Admin@123"),
                Role = Roles.Admin,
                IsActive = true,
                MustChangePassword = true,
                CreatedAt = DateTime.Now
            };
            db.Users.Add(admin);
            await db.SaveChangesAsync();
            logger.LogInformation("Đã khởi tạo tài khoản quản trị viên mặc định: admin / Admin@123");
        }

        // 2. Seed System Parameter Defaults (nếu chưa có giá trị hệ thống)
        var sysParams = await db.ParameterValues.Where(p => p.CompanyId == null && p.GroupId == null).ToListAsync();
        var existingCodes = sysParams.Select(p => p.Code).ToHashSet();

        bool hasNewParam = false;
        foreach (var def in ParamCatalog.All)
        {
            if (!existingCodes.Contains(def.Code))
            {
                db.ParameterValues.Add(new ParameterValue
                {
                    CompanyId = null,
                    GroupId = null,
                    Code = def.Code,
                    Value = def.Default,
                    EffectiveFrom = new DateTime(2020, 1, 1),
                    UpdatedBy = "system",
                    UpdatedAt = DateTime.Now
                });
                hasNewParam = true;
            }
        }
        if (hasNewParam)
        {
            await db.SaveChangesAsync();
            logger.LogInformation("Đã khởi tạo bảng tham số mặc định toàn hệ thống.");
        }

        // 2b. Seed Platform Settings nếu chưa có
        try
        {
            if (!await db.PlatformSettings.AnyAsync())
            {
                db.PlatformSettings.AddRange(
                    new PlatformSetting { SettingKey = "SITE_TITLE", SettingValue = "Hệ Thống Chấm Công Thông Minh", Description = "Tiêu đề hiển thị nền tảng", UpdatedAtUtc = DateTime.UtcNow },
                    new PlatformSetting { SettingKey = "SITE_SUBTITLE", SettingValue = "Nền tảng Quản trị Chấm công & Nhân sự Doanh nghiệp", Description = "Mô tả phụ", UpdatedAtUtc = DateTime.UtcNow },
                    new PlatformSetting { SettingKey = "LOGO_URL", SettingValue = "", Description = "Đường dẫn logo thương hiệu", UpdatedAtUtc = DateTime.UtcNow },
                    new PlatformSetting { SettingKey = "FAVICON_URL", SettingValue = "", Description = "Đường dẫn biểu tượng website", UpdatedAtUtc = DateTime.UtcNow },
                    new PlatformSetting { SettingKey = "COPYRIGHT_TEXT", SettingValue = "© 2026 Bản quyền thuộc về Nền tảng Chấm công Doanh nghiệp.", Description = "Thông tin bản quyền chân trang", UpdatedAtUtc = DateTime.UtcNow }
                );
                await db.SaveChangesAsync();
                logger.LogInformation("Đã khởi tạo cấu hình nền tảng mặc định (PlatformSettings).");
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning("Không thể seed PlatformSettings (bảng có thể chưa tạo): {Message}", ex.Message);
        }

        // 3. Seed Superbrain Default Company nếu chưa có công ty nào
        Company? defaultCompany = await db.Companies.FirstOrDefaultAsync();
        if (defaultCompany == null)
        {
            defaultCompany = new Company
            {
                Code = "SUPERBRAIN",
                Name = "Toán Trí Tuệ Superbrain Việt Nam",
                IsActive = true,
                CreatedAt = DateTime.Now
            };
            db.Companies.Add(defaultCompany);
            await db.SaveChangesAsync();

            await InitializeCompanyDefaultsAsync(db, defaultCompany.Id, "admin");

            // Gán quyền cho admin
            var adminUser = await db.Users.FirstOrDefaultAsync(u => u.Username == "admin");
            if (adminUser != null)
            {
                db.UserCompanies.Add(new UserCompany { UserId = adminUser.Id, CompanyId = defaultCompany.Id });
                await db.SaveChangesAsync();
            }

            logger.LogInformation("Đã khởi tạo Hội sở mặc định: {Code} - {Name}", defaultCompany.Code, defaultCompany.Name);
        }

        // 4. Seed tài khoản HCNS (hr / Hr@123456)
        var hrUser = await db.Users.FirstOrDefaultAsync(u => u.Username == "hr");
        if (hrUser == null)
        {
            hrUser = new User
            {
                Username = "hr",
                FullName = "Chuyên viên Nhân sự HCNS",
                PasswordHash = passwordService.HashPassword("Hr@123456"),
                Role = Roles.HR,
                IsActive = true,
                MustChangePassword = false,
                CreatedAt = DateTime.Now
            };
            db.Users.Add(hrUser);
            await db.SaveChangesAsync();

            db.UserCompanies.Add(new UserCompany { UserId = hrUser.Id, CompanyId = defaultCompany.Id });
            await db.SaveChangesAsync();
            logger.LogInformation("Đã khởi tạo tài khoản HCNS: hr / Hr@123456");
        }

        // 5. Seed Nhân viên mẫu NV01 và tài khoản ESS (nv01 / Nv@123456)
        var emp = await db.Employees.FirstOrDefaultAsync(e => e.EmployeeCode == "NV01");
        if (emp == null)
        {
            var standardGroup = await db.EmployeeGroups.FirstOrDefaultAsync(g => g.CompanyId == defaultCompany.Id && g.IsDefault);
            emp = new Employee
            {
                CompanyId = defaultCompany.Id,
                EmployeeCode = "NV01",
                FullName = "Nguyễn Văn A",
                GroupId = standardGroup != null ? standardGroup.Id : 0,
                StartDate = new DateTime(2025, 1, 1),
                AttendanceSource = "APP"
            };
            db.Employees.Add(emp);
            await db.SaveChangesAsync();
            logger.LogInformation("Đã khởi tạo nhân viên mẫu: NV01 - Nguyễn Văn A");
        }

        var empUser = await db.Users.FirstOrDefaultAsync(u => u.Username == "nv01");
        if (empUser == null)
        {
            empUser = new User
            {
                Username = "nv01",
                FullName = "Nguyễn Văn A",
                EmployeeCode = "NV01",
                PasswordHash = passwordService.HashPassword("Nv@123456"),
                Role = Roles.Employee,
                IsActive = true,
                MustChangePassword = false,
                CreatedAt = DateTime.Now
            };
            db.Users.Add(empUser);
            await db.SaveChangesAsync();

            db.UserCompanies.Add(new UserCompany { UserId = empUser.Id, CompanyId = defaultCompany.Id });
            await db.SaveChangesAsync();
            logger.LogInformation("Đã khởi tạo tài khoản nhân viên ESS: nv01 / Nv@123456");
        }

        // 6. Seed Geofence mẫu cho Hội sở Superbrain
        if (!await db.BranchLocations.AnyAsync(g => g.BranchCode == defaultCompany.Code))
        {
            db.BranchLocations.Add(new BranchLocation
            {
                BranchCode = defaultCompany.Code,
                LocationName = "Trụ sở chính Superbrain",
                Latitude = 10.796123m,
                Longitude = 106.685321m,
                RadiusMeters = 150,
                IsActive = true
            });
            await db.SaveChangesAsync();
            logger.LogInformation("Đã cấu hình toạ độ Geofence mẫu (R=150m) cho hội sở {Code}", defaultCompany.Code);
        }

        // 6b. Seed Mạng IP văn phòng mẫu cho Hội sở Superbrain (bao gồm Localhost IPv4 & IPv6 phục vụ dev/test)
        if (!await db.BranchNetworks.AnyAsync(n => n.BranchCode == defaultCompany.Code))
        {
            db.BranchNetworks.AddRange(
                new BranchNetwork
                {
                    BranchCode = defaultCompany.Code,
                    Cidr = "127.0.0.1/32",
                    Description = "Mạng phát triển Localhost IPv4",
                    IsActive = true,
                    ValidFrom = new DateTime(2020, 1, 1)
                },
                new BranchNetwork
                {
                    BranchCode = defaultCompany.Code,
                    Cidr = "::1/128",
                    Description = "Mạng phát triển Localhost IPv6",
                    IsActive = true,
                    ValidFrom = new DateTime(2020, 1, 1)
                },
                new BranchNetwork
                {
                    BranchCode = defaultCompany.Code,
                    Cidr = "192.168.1.0/24",
                    Description = "Mạng Wi-Fi Văn phòng Mặc định",
                    IsActive = true,
                    ValidFrom = new DateTime(2020, 1, 1)
                }
            );
            await db.SaveChangesAsync();
            logger.LogInformation("Đã cấu hình dải IP mạng văn phòng mẫu cho hội sở {Code}", defaultCompany.Code);
        }

        // 7. Seed Quỹ phép năm hiện tại cho NV01
        short currentYear = (short)DateTime.Now.Year;
        if (!await db.LeaveFunds.AnyAsync(l => l.EmployeeId == emp.Id && l.Year == currentYear))
        {
            db.LeaveFunds.Add(new LeaveFund
            {
                EmployeeId = emp.Id,
                Year = currentYear,
                AnnualOpening = 12,
                CarryOpening = 0,
                CompOpening = 0
            });
            await db.SaveChangesAsync();
            logger.LogInformation("Đã cấp sổ quỹ phép năm {Year} cho nhân viên NV01: 12 ngày phép", currentYear);
        }
    }

    /// <summary>
    /// Khởi tạo các danh mục mặc định cho một Hội sở mới: 3 khối mặc định, bảng mã ký hiệu chuẩn (14 mã), sao chép tham số hệ thống.
    /// </summary>
    public static async Task InitializeCompanyDefaultsAsync(AppDbContext db, int companyId, string user)
    {
        // 1. Tạo 3 khối mặc định
        if (!await db.EmployeeGroups.AnyAsync(g => g.CompanyId == companyId))
        {
            var standard = new EmployeeGroup { CompanyId = companyId, Code = "STANDARD", Name = "Chuẩn (Global)", IsDefault = true };
            var parttime = new EmployeeGroup { CompanyId = companyId, Code = "PARTTIME", Name = "Part-time / Tạp vụ", IsDefault = false };
            var remote = new EmployeeGroup { CompanyId = companyId, Code = "REMOTE", Name = "Remote / Online", IsDefault = false };

            db.EmployeeGroups.AddRange(standard, parttime, remote);
            await db.SaveChangesAsync();

            // Khởi tạo các tham số ghi đè cho khối Part-time và Remote theo ParamCatalog.GroupDefaults
            foreach (var kvp in ParamCatalog.GroupDefaults("PARTTIME"))
            {
                db.ParameterValues.Add(new ParameterValue
                {
                    CompanyId = companyId,
                    GroupId = parttime.Id,
                    Code = kvp.Key,
                    Value = kvp.Value,
                    EffectiveFrom = new DateTime(2020, 1, 1),
                    UpdatedBy = user,
                    UpdatedAt = DateTime.Now
                });
            }

            foreach (var kvp in ParamCatalog.GroupDefaults("REMOTE"))
            {
                db.ParameterValues.Add(new ParameterValue
                {
                    CompanyId = companyId,
                    GroupId = remote.Id,
                    Code = kvp.Key,
                    Value = kvp.Value,
                    EffectiveFrom = new DateTime(2020, 1, 1),
                    UpdatedBy = user,
                    UpdatedAt = DateTime.Now
                });
            }
        }

        // 2. Tạo 14 mã ký hiệu chuẩn cho hội sở
        if (!await db.AttendanceCodes.AnyAsync(c => c.CompanyId == companyId))
        {
            var defaults = Codes.Defaults();
            foreach (var def in defaults)
            {
                db.AttendanceCodes.Add(new AttendanceCode
                {
                    CompanyId = companyId,
                    Code = def.Code,
                    Name = def.Name,
                    WorkValue = def.WorkValue,
                    HolidayValue = def.HolidayValue,
                    AnnualLeaveValue = def.AnnualLeaveValue,
                    PaidLeaveValue = def.PaidLeaveValue,
                    FundType = (byte)def.FundType,
                    FundDeduct = def.FundDeduct,
                    IsHalfLeave = def.IsHalfLeave,
                    Color = def.Color,
                    SortOrder = def.SortOrder,
                    IsSystem = def.IsSystem,
                    Condition = def.Condition
                });
            }
        }

        await db.SaveChangesAsync();
    }
}
