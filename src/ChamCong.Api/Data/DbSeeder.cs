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

        // 2. Kiểm tra xem bảng Users đã tồn tại trong Database đích chưa
        bool usersTableExists = false;
        try
        {
            var conn = db.Database.GetDbConnection();
            if (conn.State != ConnectionState.Open)
            {
                await conn.OpenAsync();
            }

            using var checkCmd = conn.CreateCommand();
            checkCmd.CommandText = "SELECT OBJECT_ID(N'dbo.Users', N'U')";
            var objId = await checkCmd.ExecuteScalarAsync();
            usersTableExists = (objId != null && objId != DBNull.Value);
        }
        catch (Exception ex)
        {
            logger.LogWarning("Chưa kết nối được hoặc bảng chưa tồn tại: {Message}", ex.Message);
        }

        // 3. Nếu bảng Users chưa tồn tại -> thực thi schema.sql
        if (!usersTableExists)
        {
            logger.LogInformation("Bảng Users chưa tồn tại. Đang tiến hành tạo cấu trúc CSDL từ schema.sql...");
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
                    await cmd.ExecuteNonQueryAsync();
                }

                logger.LogInformation("✅ Đã khởi tạo hoàn tất cấu trúc CSDL từ schema.sql!");
            }
            else
            {
                logger.LogError("❌ Không tìm thấy file schema.sql để khởi tạo CSDL!");
            }
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

        // 3. Seed Superbrain Default Company nếu chưa có công ty nào
        if (!await db.Companies.AnyAsync())
        {
            var company = new Company
            {
                Code = "SUPERBRAIN",
                Name = "Toán Trí Tuệ Superbrain Việt Nam",
                IsActive = true,
                CreatedAt = DateTime.Now
            };
            db.Companies.Add(company);
            await db.SaveChangesAsync();

            await InitializeCompanyDefaultsAsync(db, company.Id, "admin");

            // Gán quyền cho admin
            var adminUser = await db.Users.FirstOrDefaultAsync(u => u.Username == "admin");
            if (adminUser != null)
            {
                db.UserCompanies.Add(new UserCompany { UserId = adminUser.Id, CompanyId = company.Id });
                await db.SaveChangesAsync();
            }

            logger.LogInformation("Đã khởi tạo Hội sở mặc định: {Code} - {Name}", company.Code, company.Name);
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
