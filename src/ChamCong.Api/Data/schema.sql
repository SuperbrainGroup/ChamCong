-- =====================================================================
-- Phần mềm Tính Chấm Công (PRJ-TIME-ONPREM-2026) — Lược đồ CSDL
-- Tương thích SQL Server 2008 / 2008 R2 (COMPATIBILITY_LEVEL = 100).
-- Script chạy lặp lại an toàn: chỉ tạo đối tượng chưa có, không xóa dữ liệu.
-- =====================================================================
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

IF OBJECT_ID(N'dbo.Companies', N'U') IS NULL
CREATE TABLE dbo.Companies (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Companies PRIMARY KEY,
    Code NVARCHAR(30) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Logo VARBINARY(MAX) NULL,
    LogoContentType NVARCHAR(50) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Companies_IsActive DEFAULT (1),
    CreatedAt DATETIME NOT NULL CONSTRAINT DF_Companies_CreatedAt DEFAULT (GETDATE()),
    CONSTRAINT UQ_Companies_Code UNIQUE (Code)
)
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
CREATE TABLE dbo.Users (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    Username NVARCHAR(50) NOT NULL,
    FullName NVARCHAR(150) NOT NULL,
    PasswordHash NVARCHAR(500) NOT NULL,
    Role NVARCHAR(20) NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1),
    IsLocked BIT NOT NULL CONSTRAINT DF_Users_IsLocked DEFAULT (0),
    FailedLoginCount INT NOT NULL CONSTRAINT DF_Users_Failed DEFAULT (0),
    MustChangePassword BIT NOT NULL CONSTRAINT DF_Users_MustChange DEFAULT (1),
    LastLoginAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (GETDATE()),
    CONSTRAINT UQ_Users_Username UNIQUE (Username)
)
GO

IF OBJECT_ID(N'dbo.UserCompanies', N'U') IS NULL
CREATE TABLE dbo.UserCompanies (
    UserId INT NOT NULL,
    CompanyId INT NOT NULL,
    CONSTRAINT PK_UserCompanies PRIMARY KEY (UserId, CompanyId),
    CONSTRAINT FK_UserCompanies_Users FOREIGN KEY (UserId) REFERENCES dbo.Users (Id) ON DELETE CASCADE,
    CONSTRAINT FK_UserCompanies_Companies FOREIGN KEY (CompanyId) REFERENCES dbo.Companies (Id)
)
GO

IF OBJECT_ID(N'dbo.Departments', N'U') IS NULL
CREATE TABLE dbo.Departments (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Departments PRIMARY KEY,
    CompanyId INT NOT NULL CONSTRAINT FK_Departments_Companies REFERENCES dbo.Companies (Id),
    Name NVARCHAR(100) NOT NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_Departments_Sort DEFAULT (0),
    CONSTRAINT UQ_Departments_Name UNIQUE (CompanyId, Name)
)
GO

IF OBJECT_ID(N'dbo.EmployeeGroups', N'U') IS NULL
CREATE TABLE dbo.EmployeeGroups (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmployeeGroups PRIMARY KEY,
    CompanyId INT NOT NULL CONSTRAINT FK_EmployeeGroups_Companies REFERENCES dbo.Companies (Id),
    Code NVARCHAR(20) NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    IsDefault BIT NOT NULL CONSTRAINT DF_EmployeeGroups_Default DEFAULT (0),
    CONSTRAINT UQ_EmployeeGroups_Code UNIQUE (CompanyId, Code)
)
GO

IF OBJECT_ID(N'dbo.Employees', N'U') IS NULL
CREATE TABLE dbo.Employees (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Employees PRIMARY KEY,
    CompanyId INT NOT NULL CONSTRAINT FK_Employees_Companies REFERENCES dbo.Companies (Id),
    EmployeeCode NVARCHAR(30) NOT NULL,
    MachineCode NVARCHAR(30) NULL,
    FullName NVARCHAR(150) NOT NULL,
    MachineName NVARCHAR(150) NULL,
    DepartmentId INT NULL CONSTRAINT FK_Employees_Departments REFERENCES dbo.Departments (Id),
    GroupId INT NOT NULL CONSTRAINT FK_Employees_Groups REFERENCES dbo.EmployeeGroups (Id),
    StartDate DATE NOT NULL,
    EndDate DATE NULL,
    ExemptPunch BIT NOT NULL CONSTRAINT DF_Employees_Exempt DEFAULT (0),
    DefaultNote NVARCHAR(500) NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_Employees_Sort DEFAULT (0),
    CreatedAt DATETIME NOT NULL CONSTRAINT DF_Employees_CreatedAt DEFAULT (GETDATE()),
    CONSTRAINT UQ_Employees_Code UNIQUE (CompanyId, EmployeeCode)
)
GO

-- Mã máy chấm công duy nhất trong hội sở (filtered index — có từ SQL Server 2008)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Employees_MachineCode')
CREATE UNIQUE NONCLUSTERED INDEX UX_Employees_MachineCode ON dbo.Employees (CompanyId, MachineCode) WHERE MachineCode IS NOT NULL
GO

IF OBJECT_ID(N'dbo.AttendanceCodes', N'U') IS NULL
CREATE TABLE dbo.AttendanceCodes (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AttendanceCodes PRIMARY KEY,
    CompanyId INT NOT NULL CONSTRAINT FK_AttendanceCodes_Companies REFERENCES dbo.Companies (Id),
    Code NVARCHAR(10) NOT NULL,
    Name NVARCHAR(150) NOT NULL,
    WorkValue DECIMAL(4,2) NOT NULL CONSTRAINT DF_AC_Work DEFAULT (0),
    HolidayValue DECIMAL(4,2) NOT NULL CONSTRAINT DF_AC_Holiday DEFAULT (0),
    AnnualLeaveValue DECIMAL(4,2) NOT NULL CONSTRAINT DF_AC_Annual DEFAULT (0),
    PaidLeaveValue DECIMAL(4,2) NOT NULL CONSTRAINT DF_AC_Paid DEFAULT (0),
    FundType TINYINT NOT NULL CONSTRAINT DF_AC_Fund DEFAULT (0),
    FundDeduct DECIMAL(4,2) NOT NULL CONSTRAINT DF_AC_Deduct DEFAULT (0),
    IsHalfLeave BIT NOT NULL CONSTRAINT DF_AC_Half DEFAULT (0),
    Color NVARCHAR(6) NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_AC_Sort DEFAULT (0),
    IsSystem BIT NOT NULL CONSTRAINT DF_AC_System DEFAULT (0),
    Condition NVARCHAR(500) NULL,
    CONSTRAINT UQ_AttendanceCodes UNIQUE (CompanyId, Code)
)
GO

IF OBJECT_ID(N'dbo.ParameterValues', N'U') IS NULL
CREATE TABLE dbo.ParameterValues (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ParameterValues PRIMARY KEY,
    CompanyId INT NULL CONSTRAINT FK_ParameterValues_Companies REFERENCES dbo.Companies (Id),
    GroupId INT NULL CONSTRAINT FK_ParameterValues_Groups REFERENCES dbo.EmployeeGroups (Id),
    Code NVARCHAR(50) NOT NULL,
    Value NVARCHAR(100) NOT NULL,
    EffectiveFrom DATE NOT NULL,
    UpdatedBy NVARCHAR(50) NOT NULL,
    UpdatedAt DATETIME NOT NULL CONSTRAINT DF_ParameterValues_UpdatedAt DEFAULT (GETDATE()),
    CONSTRAINT UQ_ParameterValues UNIQUE (CompanyId, GroupId, Code, EffectiveFrom)
)
GO

IF OBJECT_ID(N'dbo.CalendarDays', N'U') IS NULL
CREATE TABLE dbo.CalendarDays (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CalendarDays PRIMARY KEY,
    CompanyId INT NOT NULL CONSTRAINT FK_CalendarDays_Companies REFERENCES dbo.Companies (Id),
    [Date] DATE NOT NULL,
    DayType TINYINT NOT NULL,
    HalfSession NVARCHAR(2) NULL,
    ShiftStart SMALLINT NULL,
    ShiftEnd SMALLINT NULL,
    CompanyOffCode NVARCHAR(10) NULL,
    Note NVARCHAR(200) NULL,
    CONSTRAINT UQ_CalendarDays UNIQUE (CompanyId, [Date])
)
GO

IF OBJECT_ID(N'dbo.Periods', N'U') IS NULL
CREATE TABLE dbo.Periods (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Periods PRIMARY KEY,
    CompanyId INT NOT NULL CONSTRAINT FK_Periods_Companies REFERENCES dbo.Companies (Id),
    [Year] SMALLINT NOT NULL,
    [Month] TINYINT NOT NULL,
    FromDate DATE NOT NULL,
    ToDate DATE NOT NULL,
    StandardDays DECIMAL(5,2) NOT NULL,
    StandardDaysManual BIT NOT NULL CONSTRAINT DF_Periods_StdManual DEFAULT (0),
    Status TINYINT NOT NULL CONSTRAINT DF_Periods_Status DEFAULT (0),
    ParamSnapshot NVARCHAR(MAX) NOT NULL,
    CodeSnapshot NVARCHAR(MAX) NOT NULL,
    CreatedBy NVARCHAR(50) NOT NULL,
    CreatedAt DATETIME NOT NULL CONSTRAINT DF_Periods_CreatedAt DEFAULT (GETDATE()),
    CalculatedAt DATETIME NULL,
    ClosedBy NVARCHAR(50) NULL,
    ClosedAt DATETIME NULL,
    CONSTRAINT UQ_Periods UNIQUE (CompanyId, [Year], [Month])
)
GO

IF OBJECT_ID(N'dbo.ImportBatches', N'U') IS NULL
CREATE TABLE dbo.ImportBatches (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ImportBatches PRIMARY KEY,
    PeriodId INT NOT NULL CONSTRAINT FK_ImportBatches_Periods REFERENCES dbo.Periods (Id),
    FileName NVARCHAR(260) NOT NULL,
    FileHash NVARCHAR(64) NOT NULL,
    ImportedBy NVARCHAR(50) NOT NULL,
    ImportedAt DATETIME NOT NULL CONSTRAINT DF_ImportBatches_At DEFAULT (GETDATE()),
    TotalRows INT NOT NULL,
    ErrorRows INT NOT NULL,
    WarningRows INT NOT NULL,
    MatchedEmployees INT NOT NULL,
    UnmatchedCodes INT NOT NULL,
    IsCurrent BIT NOT NULL
)
GO

IF OBJECT_ID(N'dbo.RawPunches', N'U') IS NULL
CREATE TABLE dbo.RawPunches (
    Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RawPunches PRIMARY KEY,
    PeriodId INT NOT NULL CONSTRAINT FK_RawPunches_Periods REFERENCES dbo.Periods (Id),
    BatchId INT NOT NULL CONSTRAINT FK_RawPunches_Batches REFERENCES dbo.ImportBatches (Id),
    EmployeeId INT NULL,
    MachineCode NVARCHAR(30) NOT NULL,
    MachineName NVARCHAR(150) NULL,
    WorkDate DATE NOT NULL,
    InMin SMALLINT NULL,
    OutMin SMALLINT NULL,
    InTime NVARCHAR(20) NULL,
    OutTime NVARCHAR(20) NULL,
    MyTimeHours NVARCHAR(50) NULL,
    LeaveType NVARCHAR(100) NULL,
    LeaveStatus NVARCHAR(100) NULL,
    LeaveHours NVARCHAR(50) NULL,
    InOutStatus NVARCHAR(100) NULL,
    Reason NVARCHAR(500) NULL,
    ShiftApproval NVARCHAR(100) NULL,
    SourceRow INT NOT NULL
)
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = N'RawPunches' AND COLUMN_NAME = N'InTime')
    ALTER TABLE dbo.RawPunches ADD InTime NVARCHAR(20) NULL, OutTime NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RawPunches_Period')
CREATE NONCLUSTERED INDEX IX_RawPunches_Period ON dbo.RawPunches (PeriodId, EmployeeId, WorkDate) INCLUDE (InMin, OutMin, MachineCode)
GO

IF OBJECT_ID(N'dbo.LeaveRequests', N'U') IS NULL
CREATE TABLE dbo.LeaveRequests (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LeaveRequests PRIMARY KEY,
    CompanyId INT NOT NULL CONSTRAINT FK_LeaveRequests_Companies REFERENCES dbo.Companies (Id),
    EmployeeId INT NOT NULL CONSTRAINT FK_LeaveRequests_Employees REFERENCES dbo.Employees (Id),
    [Date] DATE NOT NULL,
    Code NVARCHAR(10) NOT NULL,
    Reason NVARCHAR(500) NULL,
    Source NVARCHAR(10) NOT NULL,
    CreatedBy NVARCHAR(50) NOT NULL,
    CreatedAt DATETIME NOT NULL CONSTRAINT DF_LeaveRequests_At DEFAULT (GETDATE()),
    CONSTRAINT UQ_LeaveRequests UNIQUE (EmployeeId, [Date])
)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LeaveRequests_Company')
CREATE NONCLUSTERED INDEX IX_LeaveRequests_Company ON dbo.LeaveRequests (CompanyId, [Date])
GO

IF OBJECT_ID(N'dbo.DayResults', N'U') IS NULL
CREATE TABLE dbo.DayResults (
    Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DayResults PRIMARY KEY,
    PeriodId INT NOT NULL CONSTRAINT FK_DayResults_Periods REFERENCES dbo.Periods (Id),
    EmployeeId INT NOT NULL CONSTRAINT FK_DayResults_Employees REFERENCES dbo.Employees (Id),
    [Date] DATE NOT NULL,
    Code NVARCHAR(10) NULL,
    AutoCode NVARCHAR(10) NULL,
    PaidValue DECIMAL(4,2) NOT NULL,
    WorkedMinutes SMALLINT NULL,
    LateMinutes SMALLINT NOT NULL,
    EarlyMinutes SMALLINT NOT NULL,
    OtMinutes SMALLINT NOT NULL,
    InMin SMALLINT NULL,
    OutMin SMALLINT NULL,
    InTime NVARCHAR(20) NULL,
    OutTime NVARCHAR(20) NULL,
    Warnings NVARCHAR(1000) NULL,
    IsManual BIT NOT NULL CONSTRAINT DF_DayResults_Manual DEFAULT (0),
    ManualReason NVARCHAR(500) NULL,
    ManualBy NVARCHAR(50) NULL,
    ManualAt DATETIME NULL,
    OutOfEmployment BIT NOT NULL CONSTRAINT DF_DayResults_Out DEFAULT (0),
    CONSTRAINT UQ_DayResults UNIQUE (PeriodId, EmployeeId, [Date])
)
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = N'DayResults' AND COLUMN_NAME = N'InTime')
    ALTER TABLE dbo.DayResults ADD InTime NVARCHAR(20) NULL, OutTime NVARCHAR(20) NULL;
GO

IF OBJECT_ID(N'dbo.PeriodNotes', N'U') IS NULL
CREATE TABLE dbo.PeriodNotes (
    PeriodId INT NOT NULL CONSTRAINT FK_PeriodNotes_Periods REFERENCES dbo.Periods (Id),
    EmployeeId INT NOT NULL CONSTRAINT FK_PeriodNotes_Employees REFERENCES dbo.Employees (Id),
    Note NVARCHAR(500) NOT NULL,
    CONSTRAINT PK_PeriodNotes PRIMARY KEY (PeriodId, EmployeeId)
)
GO

IF OBJECT_ID(N'dbo.LeaveFunds', N'U') IS NULL
CREATE TABLE dbo.LeaveFunds (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LeaveFunds PRIMARY KEY,
    EmployeeId INT NOT NULL CONSTRAINT FK_LeaveFunds_Employees REFERENCES dbo.Employees (Id),
    [Year] SMALLINT NOT NULL,
    AnnualOpening DECIMAL(5,2) NOT NULL,
    CarryOpening DECIMAL(5,2) NOT NULL,
    CompOpening DECIMAL(5,2) NOT NULL,
    CONSTRAINT UQ_LeaveFunds UNIQUE (EmployeeId, [Year]),
    CONSTRAINT CK_LeaveFunds_NonNegative CHECK (AnnualOpening >= 0 AND CarryOpening >= 0 AND CompOpening >= 0)
)
GO

IF OBJECT_ID(N'dbo.LeaveLedger', N'U') IS NULL
CREATE TABLE dbo.LeaveLedger (
    Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LeaveLedger PRIMARY KEY,
    EmployeeId INT NOT NULL CONSTRAINT FK_LeaveLedger_Employees REFERENCES dbo.Employees (Id),
    [Year] SMALLINT NOT NULL,
    Fund NVARCHAR(10) NOT NULL,
    PeriodId INT NULL CONSTRAINT FK_LeaveLedger_Periods REFERENCES dbo.Periods (Id),
    [Date] DATE NOT NULL,
    Code NVARCHAR(10) NULL,
    Amount DECIMAL(5,2) NOT NULL,
    Note NVARCHAR(200) NULL,
    CreatedAt DATETIME NOT NULL CONSTRAINT DF_LeaveLedger_At DEFAULT (GETDATE())
)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LeaveLedger_Employee')
CREATE NONCLUSTERED INDEX IX_LeaveLedger_Employee ON dbo.LeaveLedger (EmployeeId, [Year]) INCLUDE (Fund, Amount, PeriodId)
GO

IF OBJECT_ID(N'dbo.AuditLogs', N'U') IS NULL
CREATE TABLE dbo.AuditLogs (
    Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLogs PRIMARY KEY,
    At DATETIME NOT NULL CONSTRAINT DF_AuditLogs_At DEFAULT (GETDATE()),
    UserId INT NULL,
    Username NVARCHAR(50) NOT NULL,
    CompanyId INT NULL,
    PeriodId INT NULL,
    Entity NVARCHAR(50) NOT NULL,
    EntityId NVARCHAR(50) NULL,
    Action NVARCHAR(50) NOT NULL,
    Detail NVARCHAR(MAX) NULL
)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLogs_At')
CREATE NONCLUSTERED INDEX IX_AuditLogs_At ON dbo.AuditLogs (At DESC) INCLUDE (CompanyId, PeriodId)
GO

IF OBJECT_ID(N'dbo.ExportHistory', N'U') IS NULL
CREATE TABLE dbo.ExportHistory (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ExportHistory PRIMARY KEY,
    PeriodId INT NOT NULL CONSTRAINT FK_ExportHistory_Periods REFERENCES dbo.Periods (Id),
    FileName NVARCHAR(260) NOT NULL,
    ExportedBy NVARCHAR(50) NOT NULL,
    ExportedAt DATETIME NOT NULL CONSTRAINT DF_ExportHistory_At DEFAULT (GETDATE()),
    PeriodStatus TINYINT NOT NULL
)
GO

-- Phân trang nhật ký bằng ROW_NUMBER() (SQL Server 2008 không có OFFSET/FETCH)
IF OBJECT_ID(N'dbo.sp_GetAuditLogsPaged', N'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_GetAuditLogsPaged
GO
CREATE PROCEDURE dbo.sp_GetAuditLogsPaged
    @CompanyIds NVARCHAR(MAX) = NULL,   -- danh sách Id phân tách dấu phẩy; NULL = tất cả (Admin)
    @PeriodId INT = NULL,
    @Keyword NVARCHAR(100) = NULL,
    @PageIndex INT = 1,
    @PageSize INT = 50,
    @TotalCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Ids TABLE (Id INT PRIMARY KEY);
    IF @CompanyIds IS NOT NULL
    BEGIN
        DECLARE @x XML = CAST('<i>' + REPLACE(@CompanyIds, ',', '</i><i>') + '</i>' AS XML);
        INSERT INTO @Ids (Id) SELECT DISTINCT T.c.value('.', 'INT') FROM @x.nodes('/i') T(c) WHERE T.c.value('.', 'NVARCHAR(20)') <> '';
    END

    SELECT @TotalCount = COUNT(1)
    FROM dbo.AuditLogs a
    WHERE (@CompanyIds IS NULL OR a.CompanyId IN (SELECT Id FROM @Ids))
      AND (@PeriodId IS NULL OR a.PeriodId = @PeriodId)
      AND (@Keyword IS NULL OR a.Username LIKE '%' + @Keyword + '%' OR a.Entity LIKE '%' + @Keyword + '%'
           OR a.Action LIKE '%' + @Keyword + '%' OR a.Detail LIKE '%' + @Keyword + '%');

    WITH Paged AS (
        SELECT a.Id, a.At, a.Username, a.CompanyId, a.PeriodId, a.Entity, a.EntityId, a.Action, a.Detail,
               ROW_NUMBER() OVER (ORDER BY a.At DESC, a.Id DESC) AS RowNum
        FROM dbo.AuditLogs a
        WHERE (@CompanyIds IS NULL OR a.CompanyId IN (SELECT Id FROM @Ids))
          AND (@PeriodId IS NULL OR a.PeriodId = @PeriodId)
          AND (@Keyword IS NULL OR a.Username LIKE '%' + @Keyword + '%' OR a.Entity LIKE '%' + @Keyword + '%'
               OR a.Action LIKE '%' + @Keyword + '%' OR a.Detail LIKE '%' + @Keyword + '%')
    )
    SELECT Id, At, Username, CompanyId, PeriodId, Entity, EntityId, Action, Detail
    FROM Paged
    WHERE RowNum BETWEEN ((@PageIndex - 1) * @PageSize + 1) AND (@PageIndex * @PageSize)
    ORDER BY RowNum;
END
GO

-- =====================================================================
-- Dữ liệu hạt giống mặc định (Khởi tạo tài khoản Quản trị viên & Hội sở)
-- =====================================================================

-- 1. Khởi tạo tài khoản Quản trị viên (admin / Admin@123)
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Role = N'Admin')
BEGIN
    INSERT INTO dbo.Users (Username, FullName, PasswordHash, Role, IsActive, IsLocked, FailedLoginCount, MustChangePassword, CreatedAt)
    VALUES (
        N'admin',
        N'Quản trị viên Hệ thống',
        N'100000.2jJG99qLv18/LHM1KfWa9Q==.EIdAMZGAdoqrih/dMvhXRk3kHEhCFjKqUfJPVzOQ2JY=',
        N'Admin',
        1, 0, 0, 1, GETDATE()
    );
END
GO

-- 2. Khởi tạo Hội sở mặc định Superbrain
IF NOT EXISTS (SELECT 1 FROM dbo.Companies)
BEGIN
    INSERT INTO dbo.Companies (Code, Name, IsActive, CreatedAt)
    VALUES (N'SUPERBRAIN', N'Toán Trí Tuệ Superbrain Việt Nam', 1, GETDATE());
    
    DECLARE @CompId INT = SCOPE_IDENTITY();
    DECLARE @AdminId INT = (SELECT TOP 1 Id FROM dbo.Users WHERE Username = N'admin');
    
    IF @AdminId IS NOT NULL AND @CompId IS NOT NULL
    BEGIN
        INSERT INTO dbo.UserCompanies (UserId, CompanyId) VALUES (@AdminId, @CompId);
    END

    -- Khối nhân viên mặc định
    INSERT INTO dbo.EmployeeGroups (CompanyId, Code, Name, IsDefault)
    VALUES 
        (@CompId, N'STANDARD', N'Chuẩn (Global)', 1),
        (@CompId, N'PARTTIME', N'Part-time / Tạp vụ', 0),
        (@CompId, N'REMOTE', N'Remote / Online', 0);

    -- Phòng ban mặc định
    INSERT INTO dbo.Departments (CompanyId, Name, SortOrder)
    VALUES
        (@CompId, N'Ban Giám Đốc', 1),
        (@CompId, N'Phòng Đào Tạo & Chuyên Môn', 2),
        (@CompId, N'Phòng Hành Chính Nhân Sự', 3),
        (@CompId, N'Phòng Kinh Doanh & Marketing', 4),
        (@CompId, N'Bộ Phận Học Vụ & Giảng Dạy', 5);

    -- Các mã chấm công chuẩn
    INSERT INTO dbo.AttendanceCodes (CompanyId, Code, Name, WorkValue, HolidayValue, AnnualLeaveValue, PaidLeaveValue, FundType, FundDeduct, IsHalfLeave, Color, SortOrder, IsSystem)
    VALUES
        (@CompId, N'+', N'Làm việc đủ công', 1.0, 0, 0, 0, 0, 0, 0, N'16a34a', 1, 1),
        (@CompId, N'1/2', N'Làm nửa công', 0.5, 0, 0, 0, 0, 0, 1, N'ca8a04', 2, 1),
        (@CompId, N'P', N'Nghỉ phép năm', 0, 0, 1.0, 0, 1, 1.0, 0, N'2563eb', 3, 1),
        (@CompId, N'1/2P', N'Nghỉ phép nửa ngày', 0, 0, 0.5, 0, 1, 0.5, 1, N'0284c7', 4, 1),
        (@CompId, N'Ro', N'Nghỉ chế độ', 0, 0, 0, 1.0, 0, 0, 0, N'0d9488', 5, 1),
        (@CompId, N'L', N'Nghỉ Lễ / Tết', 0, 1.0, 0, 0, 0, 0, 0, N'e11d48', 6, 1),
        (@CompId, N'CT', N'Công tác', 1.0, 0, 0, 0, 0, 0, 0, N'7c3aed', 7, 1),
        (@CompId, N'B', N'Nghỉ bù', 0, 0, 0, 1.0, 2, 1.0, 0, N'9333ea', 8, 1),
        (@CompId, N'1/2B', N'Nghỉ bù nửa ngày', 0, 0, 0, 0.5, 2, 0.5, 1, N'a855f7', 9, 1),
        (@CompId, N'KL', N'Nghỉ không lương', 0, 0, 0, 0, 0, 0, 0, N'dc2626', 10, 1),
        (@CompId, N'Kp', N'Nghỉ không phép', 0, 0, 0, 0, 0, 0, 0, N'991b1b', 11, 1),
        (@CompId, N'Ts', N'Nghỉ thai sản', 0, 0, 0, 0, 0, 0, 0, N'db2777', 12, 1),
        (@CompId, N'V', N'Vắng mặt', 0, 0, 0, 0, 0, 0, 0, N'64748b', 13, 1),
        (@CompId, N'Off', N'Nghỉ tuần', 0, 0, 0, 0, 0, 0, 0, N'94a3b8', 14, 1);
END
GO

