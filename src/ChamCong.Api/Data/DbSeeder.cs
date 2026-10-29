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
                logger.LogInformation("Tìm thấy schema.sql tại tập tin: {Path}", path);
                break;
            }
        }

        // Nếu không tìm thấy file ngoài đĩa, nạp trực tiếp từ Embedded Resource được nhúng trong assembly
        if (string.IsNullOrWhiteSpace(schemaSql))
        {
            try
            {
                var assembly = typeof(DbSeeder).Assembly;
                var resName = assembly.GetManifestResourceNames()
                    .FirstOrDefault(n => n.EndsWith("schema.sql", StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrEmpty(resName))
                {
                    using var stream = assembly.GetManifestResourceStream(resName);
                    if (stream != null)
                    {
                        using var reader = new StreamReader(stream);
                        schemaSql = await reader.ReadToEndAsync();
                        logger.LogInformation("Đã nạp schema.sql từ Embedded Resource: {ResourceName}", resName);
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning("Không thể nạp schema.sql từ Embedded Resource: {Message}", ex.Message);
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
                int executedBatches = 0;
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
                        executedBatches++;
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning("Chi tiết thực thi batch SQL: {Message}", ex.Message);
                    }
                }

                logger.LogInformation("✅ [Auto-Migration] Đã tự động kiểm tra & cập nhật cấu trúc CSDL thành công ({Count} batch SQL đã thực thi)!", executedBatches);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Lỗi khi chạy schema.sql: {Message}", ex.Message);
            }
        }
        else
        {
            logger.LogWarning("⚠️ Không tìm thấy schema.sql từ đĩa hoặc Embedded Resource để tự động đồng bộ CSDL.");
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

        // 3b. Đảm bảo các bảng liên quan đến nhân sự có CompanyId để hỗ trợ trùng mã khác hội sở
        try
        {
            var conn = db.Database.GetDbConnection();
            if (conn.State != ConnectionState.Open) await conn.OpenAsync();

            var multiBranchMigrationSqls = new[]
            {
                @"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_EmployeeRequests' AND COLUMN_NAME = 'CompanyId')
                  BEGIN
                      ALTER TABLE dbo.tbl_EmployeeRequests ADD CompanyId INT NULL CONSTRAINT FK_Req_Company REFERENCES dbo.Companies(Id);
                  END",

                @"UPDATE r SET r.CompanyId = e.CompanyId
                  FROM dbo.tbl_EmployeeRequests r
                  JOIN dbo.Employees e ON r.EmployeeCode = e.EmployeeCode
                  WHERE r.CompanyId IS NULL",

                @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Req_Comp_Emp')
                      CREATE NONCLUSTERED INDEX IX_Req_Comp_Emp ON dbo.tbl_EmployeeRequests(CompanyId, EmployeeCode)",

                @"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_EmployeeDevices' AND COLUMN_NAME = 'CompanyId')
                  BEGIN
                      ALTER TABLE dbo.tbl_EmployeeDevices ADD CompanyId INT NULL CONSTRAINT FK_Dev_Company REFERENCES dbo.Companies(Id);
                  END",

                @"UPDATE d SET d.CompanyId = e.CompanyId
                  FROM dbo.tbl_EmployeeDevices d
                  JOIN dbo.Employees e ON d.EmployeeCode = e.EmployeeCode
                  WHERE d.CompanyId IS NULL",

                @"IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Dev_ActiveSlot' AND object_id = OBJECT_ID('dbo.tbl_EmployeeDevices'))
                      DROP INDEX UX_Dev_ActiveSlot ON dbo.tbl_EmployeeDevices",

                @"SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;
                  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Dev_ActiveSlot_PC' AND object_id = OBJECT_ID('dbo.tbl_EmployeeDevices'))
                      CREATE UNIQUE NONCLUSTERED INDEX UX_Dev_ActiveSlot_PC ON dbo.tbl_EmployeeDevices(CompanyId, EmployeeCode) WHERE IsActiveSlot = 1 AND DeviceType = 'PC'",

                @"SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;
                  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Dev_Active_Emp_Fp' AND object_id = OBJECT_ID('dbo.tbl_EmployeeDevices'))
                      CREATE UNIQUE NONCLUSTERED INDEX UX_Dev_Active_Emp_Fp ON dbo.tbl_EmployeeDevices(CompanyId, EmployeeCode, FingerprintHash) WHERE FingerprintHash IS NOT NULL AND IsActiveSlot = 1",

                @"IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_EmployeeDevices_ActiveMac')
                  BEGIN
                      IF NOT EXISTS (
                          SELECT 1 FROM sys.index_columns ic
                          JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                          JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                          WHERE i.name = N'UQ_EmployeeDevices_ActiveMac' AND c.name = 'CompanyId'
                      )
                      BEGIN
                          DROP INDEX UQ_EmployeeDevices_ActiveMac ON dbo.tbl_EmployeeDevices;
                      END
                  END",

                @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_EmployeeDevices_ActiveMac')
                      CREATE UNIQUE NONCLUSTERED INDEX UQ_EmployeeDevices_ActiveMac ON dbo.tbl_EmployeeDevices(CompanyId, FingerprintHash) WHERE FingerprintHash IS NOT NULL AND IsActiveSlot = 1 AND DeviceType = 'PC'",

                @"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_DailyPunchSummary' AND COLUMN_NAME = 'CompanyId')
                  BEGIN
                      ALTER TABLE dbo.tbl_DailyPunchSummary ADD CompanyId INT NOT NULL CONSTRAINT DF_DPS_Comp DEFAULT (1);
                  END",

                @"UPDATE s SET s.CompanyId = ISNULL(e.CompanyId, 1)
                  FROM dbo.tbl_DailyPunchSummary s
                  JOIN dbo.Employees e ON s.EmployeeCode = e.EmployeeCode
                  WHERE s.CompanyId = 1",

                @"IF NOT EXISTS (
                      SELECT 1 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                      WHERE TABLE_NAME = 'tbl_DailyPunchSummary' AND CONSTRAINT_NAME = 'PK_DailyPunch' AND COLUMN_NAME = 'CompanyId'
                  )
                  BEGIN
                      ALTER TABLE dbo.tbl_DailyPunchSummary DROP CONSTRAINT PK_DailyPunch;
                      ALTER TABLE dbo.tbl_DailyPunchSummary ADD CONSTRAINT PK_DailyPunch PRIMARY KEY (CompanyId, EmployeeCode, WorkDate);
                  END",

                @"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_TimeAdjustments' AND COLUMN_NAME = 'CompanyId')
                  BEGIN
                      ALTER TABLE dbo.tbl_TimeAdjustments ADD CompanyId INT NULL CONSTRAINT FK_Adj_Company REFERENCES dbo.Companies(Id);
                  END",

                @"UPDATE a SET a.CompanyId = e.CompanyId
                  FROM dbo.tbl_TimeAdjustments a
                  JOIN dbo.Employees e ON a.EmployeeCode = e.EmployeeCode
                  WHERE a.CompanyId IS NULL",

                @"IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Adj_Active')
                      DROP INDEX UX_Adj_Active ON dbo.tbl_TimeAdjustments",

                @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Adj_Active')
                      CREATE UNIQUE NONCLUSTERED INDEX UX_Adj_Active ON dbo.tbl_TimeAdjustments(CompanyId, EmployeeCode, WorkDate) WHERE IsActive = 1",

                @"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_EmployeeBranchAssignments' AND COLUMN_NAME = 'CompanyId')
                  BEGIN
                      ALTER TABLE dbo.tbl_EmployeeBranchAssignments ADD CompanyId INT NULL CONSTRAINT FK_EBA_Company REFERENCES dbo.Companies(Id);
                  END",

                @"UPDATE a SET a.CompanyId = e.CompanyId
                  FROM dbo.tbl_EmployeeBranchAssignments a
                  JOIN dbo.Employees e ON a.EmployeeCode = e.EmployeeCode
                  WHERE a.CompanyId IS NULL",

                @"IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EBA_Primary')
                      DROP INDEX UX_EBA_Primary ON dbo.tbl_EmployeeBranchAssignments",

                @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EBA_Primary')
                      CREATE UNIQUE NONCLUSTERED INDEX UX_EBA_Primary ON dbo.tbl_EmployeeBranchAssignments(CompanyId, EmployeeCode) WHERE IsPrimary = 1 AND ToDate IS NULL",

                @"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_WebAttendanceLogs' AND COLUMN_NAME = 'CompanyId')
                  BEGIN
                      ALTER TABLE dbo.tbl_WebAttendanceLogs ADD CompanyId INT NULL CONSTRAINT FK_Log_Company REFERENCES dbo.Companies(Id);
                  END",

                @"UPDATE l SET l.CompanyId = e.CompanyId
                  FROM dbo.tbl_WebAttendanceLogs l
                  JOIN dbo.Employees e ON l.EmployeeCode = e.EmployeeCode
                  WHERE l.CompanyId IS NULL",

                @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Log_Comp_Emp_Date')
                      CREATE NONCLUSTERED INDEX IX_Log_Comp_Emp_Date ON dbo.tbl_WebAttendanceLogs(CompanyId, EmployeeCode, WorkDate, CheckTimeUtc)",

                @"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_Notifications' AND COLUMN_NAME = 'CompanyId')
                  BEGIN
                      ALTER TABLE dbo.tbl_Notifications ADD CompanyId INT NULL CONSTRAINT FK_tbl_Notifications_CompanyId FOREIGN KEY REFERENCES dbo.Companies(Id);
                  END",

                @"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_Notifications' AND COLUMN_NAME = 'BranchCode')
                  BEGIN
                      ALTER TABLE dbo.tbl_Notifications ADD BranchCode NVARCHAR(50) NULL;
                  END",

                @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Noti_User_Company')
                      CREATE NONCLUSTERED INDEX IX_Noti_User_Company ON dbo.tbl_Notifications(UserID, CompanyId, IsRead, CreatedAtUtc)",

                @"IF OBJECT_ID(N'dbo.Employees', N'U') IS NOT NULL
                  BEGIN
                      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = N'Employees' AND COLUMN_NAME = N'EmployeeType')
                          ALTER TABLE dbo.Employees ADD EmployeeType NVARCHAR(20) NOT NULL CONSTRAINT DF_Employees_EmployeeType DEFAULT (N'STANDARD');
                  END",

                @"IF OBJECT_ID(N'dbo.tbl_WorkSchedules', N'U') IS NULL
                  BEGIN
                      CREATE TABLE dbo.tbl_WorkSchedules (
                          ScheduleId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tbl_WorkSchedules PRIMARY KEY,
                          CompanyId INT NOT NULL,
                          EmployeeId INT NULL,
                          EmployeeCode NVARCHAR(30) NOT NULL,
                          WorkDate DATE NOT NULL,
                          ShiftCode NVARCHAR(20) NOT NULL CONSTRAINT DF_tbl_WorkSchedules_Shift DEFAULT (N'FULL'),
                          Note NVARCHAR(250) NULL,
                          Status NVARCHAR(20) NOT NULL CONSTRAINT DF_tbl_WorkSchedules_Status DEFAULT (N'REGISTERED'),
                          RegisteredAtUtc DATETIME NOT NULL CONSTRAINT DF_tbl_WorkSchedules_RegAt DEFAULT (GETDATE()),
                          RegisteredBy NVARCHAR(50) NULL,
                          CONSTRAINT UQ_tbl_WorkSchedules_EmpDate UNIQUE (CompanyId, EmployeeCode, WorkDate)
                      );
                      CREATE NONCLUSTERED INDEX IX_tbl_WorkSchedules_CompDate ON dbo.tbl_WorkSchedules (CompanyId, WorkDate, EmployeeCode);
                  END",

                @"IF OBJECT_ID(N'dbo.AttendanceCodes', N'U') IS NOT NULL
                  BEGIN
                      INSERT INTO dbo.AttendanceCodes (CompanyId, Code, Name, WorkValue, HolidayValue, AnnualLeaveValue, PaidLeaveValue, FundType, FundDeduct, IsHalfLeave, Color, SortOrder, IsSystem, Condition)
                      SELECT c.Id, N'KL', N'Nghỉ không hưởng lương', 0, 0, 0, 0, 0, 0, 0, N'E2EFDA', 13, 1, N'Đã hết phép năm hoặc nghỉ việc riêng không hưởng lương; có đơn xin phép được duyệt'
                      FROM dbo.Companies c
                      WHERE NOT EXISTS (SELECT 1 FROM dbo.AttendanceCodes a WHERE a.CompanyId = c.Id AND a.Code = N'KL');
                  END",

                @"IF OBJECT_ID(N'dbo.tbl_HrAlerts', N'U') IS NULL
                  BEGIN
                      CREATE TABLE dbo.tbl_HrAlerts (
                          AlertId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                          AlertType VARCHAR(30) NOT NULL,
                          BranchCode NVARCHAR(50) NULL,
                          Detail NVARCHAR(500) NOT NULL,
                          Status VARCHAR(20) NOT NULL CONSTRAINT DF_tbl_HrAlerts_Status DEFAULT ('OPEN'),
                          AckedByUserId INT NULL,
                          AckedAtUtc DATETIME2(0) NULL,
                          CreatedAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_tbl_HrAlerts_Created DEFAULT (SYSUTCDATETIME())
                      );
                  END"
            };

            foreach (var sql in multiBranchMigrationSqls)
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = sql;
                await cmd.ExecuteNonQueryAsync();
            }
            logger.LogInformation("✅ [Auto-Migration] Đã đồng bộ hỗ trợ trùng mã nhân viên khác hội sở, EmployeeType, WorkSchedules & KL thành công!");
        }
        catch (Exception ex)
        {
            logger.LogWarning("Kiểm tra cấu trúc đa hội sở (CompanyId): {Message}", ex.Message);
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
                EmployeeCode = "HR01",
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
        else if (string.IsNullOrWhiteSpace(hrUser.EmployeeCode))
        {
            hrUser.EmployeeCode = "HR01";
            await db.SaveChangesAsync();
        }

        // Đảm bảo hồ sơ nhân viên cho HR01 tồn tại để có thể tự chấm công
        var hrEmp = await db.Employees.FirstOrDefaultAsync(e => e.EmployeeCode == "HR01" && e.CompanyId == defaultCompany.Id);
        if (hrEmp == null)
        {
            var standardGroup = await db.EmployeeGroups.FirstOrDefaultAsync(g => g.CompanyId == defaultCompany.Id && g.IsDefault);
            hrEmp = new Employee
            {
                CompanyId = defaultCompany.Id,
                EmployeeCode = "HR01",
                FullName = hrUser.FullName ?? "Chuyên viên Nhân sự HCNS",
                GroupId = standardGroup != null ? standardGroup.Id : 0,
                StartDate = new DateTime(2025, 1, 1),
                AttendanceSource = "APP",
                EmployeeType = "STANDARD"
            };
            db.Employees.Add(hrEmp);
            await db.SaveChangesAsync();
            logger.LogInformation("Đã khởi tạo hồ sơ nhân viên mẫu cho HCNS: HR01");
        }

        var hrAssign = await db.EmployeeBranchAssignments.FirstOrDefaultAsync(a => a.EmployeeCode == "HR01" && a.BranchCode == defaultCompany.Code);
        if (hrAssign == null)
        {
            db.EmployeeBranchAssignments.Add(new EmployeeBranchAssignment
            {
                CompanyId = defaultCompany.Id,
                EmployeeCode = "HR01",
                BranchCode = defaultCompany.Code,
                IsPrimary = true,
                FromDate = new DateTime(2025, 1, 1)
            });
            await db.SaveChangesAsync();
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

        // 2. Tạo hoặc đồng bộ các mã ký hiệu chuẩn cho hội sở
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
        else
        {
            // Tự động nâng cấp mã cũ: V -> KP, xóa NL, 1/2P -> P/2
            var oldV = await db.AttendanceCodes.FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Code == "V");
            if (oldV != null)
            {
                oldV.Code = Codes.Vacant;
                oldV.Name = "Không Phép (KP)";
            }
            var oldNl = await db.AttendanceCodes.FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Code == "NL");
            if (oldNl != null)
            {
                db.AttendanceCodes.Remove(oldNl);
            }
            var oldHalf = await db.AttendanceCodes.FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Code == "1/2P");
            if (oldHalf != null)
            {
                oldHalf.Code = "P/2";
                oldHalf.Name = "Nghỉ phép năm 1/2 ngày";
            }

            var klCode = await db.AttendanceCodes.FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Code == "KL");
            if (klCode == null)
            {
                db.AttendanceCodes.Add(new AttendanceCode
                {
                    CompanyId = companyId,
                    Code = Codes.UnpaidLeave,
                    Name = "Nghỉ không hưởng lương",
                    WorkValue = 0,
                    HolidayValue = 0,
                    AnnualLeaveValue = 0,
                    PaidLeaveValue = 0,
                    FundType = 0,
                    FundDeduct = 0,
                    IsHalfLeave = false,
                    Color = "E2EFDA",
                    SortOrder = 13,
                    IsSystem = true,
                    Condition = "Đã hết phép năm hoặc nghỉ việc riêng không hưởng lương; có đơn xin phép được duyệt"
                });
            }
        }

        await db.SaveChangesAsync();
    }
}
