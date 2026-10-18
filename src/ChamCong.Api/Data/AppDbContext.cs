using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<User> Users => Set<User>();
    public DbSet<UserCompany> UserCompanies => Set<UserCompany>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<EmployeeGroup> EmployeeGroups => Set<EmployeeGroup>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<AttendanceCode> AttendanceCodes => Set<AttendanceCode>();
    public DbSet<ParameterValue> ParameterValues => Set<ParameterValue>();
    public DbSet<CalendarDayEntity> CalendarDays => Set<CalendarDayEntity>();
    public DbSet<Period> Periods => Set<Period>();
    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<RawPunch> RawPunches => Set<RawPunch>();
    public DbSet<LeaveRequest> LeaveRequests => Set<LeaveRequest>();
    public DbSet<DayResult> DayResults => Set<DayResult>();
    public DbSet<DayResultManualBackup> DayResultManualBackups => Set<DayResultManualBackup>();
    public DbSet<PeriodNote> PeriodNotes => Set<PeriodNote>();
    public DbSet<LeaveFund> LeaveFunds => Set<LeaveFund>();
    public DbSet<LeaveLedgerEntry> LeaveLedger => Set<LeaveLedgerEntry>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<ExportHistory> ExportHistory => Set<ExportHistory>();

    // --- PHASE 2 DBSETS ---
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<HrBranchScope> HrBranchScopes => Set<HrBranchScope>();
    public DbSet<EmployeeDevice> EmployeeDevices => Set<EmployeeDevice>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<EmployeeBranchAssignment> EmployeeBranchAssignments => Set<EmployeeBranchAssignment>();
    public DbSet<BranchLocation> BranchLocations => Set<BranchLocation>();
    public DbSet<BranchNetwork> BranchNetworks => Set<BranchNetwork>();
    public DbSet<WebAttendanceLog> WebAttendanceLogs => Set<WebAttendanceLog>();
    public DbSet<DailyPunchSummary> DailyPunchSummaries => Set<DailyPunchSummary>();
    public DbSet<TimeAdjustment> TimeAdjustments => Set<TimeAdjustment>();
    public DbSet<EmployeeRequest> EmployeeRequests => Set<EmployeeRequest>();
    public DbSet<RequestAttachment> RequestAttachments => Set<RequestAttachment>();
    public DbSet<TimesheetPublication> TimesheetPublications => Set<TimesheetPublication>();
    public DbSet<TimesheetPublishedLine> TimesheetPublishedLines => Set<TimesheetPublishedLine>();
    public DbSet<TimesheetDispute> TimesheetDisputes => Set<TimesheetDispute>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<HrAlert> HrAlerts => Set<HrAlert>();
    public DbSet<SecurityAuditLog> SecurityAuditLogs => Set<SecurityAuditLog>();
    public DbSet<PlatformSetting> PlatformSettings => Set<PlatformSetting>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Lược đồ do db/schema.sql quản lý (tương thích SQL Server 2008), EF chỉ ánh xạ.
        b.Entity<Company>().ToTable("Companies");
        b.Entity<User>().ToTable("Users").HasMany(u => u.Companies).WithOne().HasForeignKey(x => x.UserId);
        b.Entity<UserCompany>().ToTable("UserCompanies").HasKey(x => new { x.UserId, x.CompanyId });
        b.Entity<Department>().ToTable("Departments");
        b.Entity<EmployeeGroup>().ToTable("EmployeeGroups");
        b.Entity<Employee>(e =>
        {
            e.ToTable("Employees");
            e.Property(x => x.StartDate).HasColumnType("date");
            e.Property(x => x.EndDate).HasColumnType("date");
        });
        b.Entity<AttendanceCode>(e =>
        {
            e.ToTable("AttendanceCodes");
            foreach (var p in new[] { "WorkValue", "HolidayValue", "AnnualLeaveValue", "PaidLeaveValue", "FundDeduct" })
                e.Property(p).HasColumnType("decimal(4,2)");
        });
        b.Entity<ParameterValue>(e =>
        {
            e.ToTable("ParameterValues");
            e.Property(x => x.EffectiveFrom).HasColumnType("date");
        });
        b.Entity<CalendarDayEntity>(e =>
        {
            e.ToTable("CalendarDays");
            e.Property(x => x.Date).HasColumnType("date");
        });
        b.Entity<Period>(e =>
        {
            e.ToTable("Periods");
            e.Property(x => x.FromDate).HasColumnType("date");
            e.Property(x => x.ToDate).HasColumnType("date");
            e.Property(x => x.StandardDays).HasColumnType("decimal(5,2)");
            e.Property(x => x.Status).HasConversion<byte>();
        });
        b.Entity<ImportBatch>().ToTable("ImportBatches");
        b.Entity<RawPunch>(e =>
        {
            e.ToTable("RawPunches");
            e.Property(x => x.WorkDate).HasColumnType("date");
            e.Property(x => x.InTime).HasMaxLength(20);
            e.Property(x => x.OutTime).HasMaxLength(20);
        });
        b.Entity<LeaveRequest>(e =>
        {
            e.ToTable("LeaveRequests");
            e.Property(x => x.Date).HasColumnType("date");
        });
        b.Entity<DayResult>(e =>
        {
            e.ToTable("DayResults");
            e.Property(x => x.Date).HasColumnType("date");
            e.Property(x => x.PaidValue).HasColumnType("decimal(4,2)");
            e.Property(x => x.InTime).HasMaxLength(20);
            e.Property(x => x.OutTime).HasMaxLength(20);
        });
        b.Entity<DayResultManualBackup>(e =>
        {
            e.ToTable("DayResultManualBackups");
            e.Property(x => x.Date).HasColumnType("date");
            e.Property(x => x.PaidValue).HasColumnType("decimal(4,2)");
        });
        b.Entity<PeriodNote>().ToTable("PeriodNotes").HasKey(x => new { x.PeriodId, x.EmployeeId });
        b.Entity<LeaveFund>(e =>
        {
            e.ToTable("LeaveFunds");
            e.Property(x => x.AnnualOpening).HasColumnType("decimal(5,2)");
            e.Property(x => x.CarryOpening).HasColumnType("decimal(5,2)");
            e.Property(x => x.CompOpening).HasColumnType("decimal(5,2)");
        });
        b.Entity<LeaveLedgerEntry>(e =>
        {
            e.ToTable("LeaveLedger");
            e.Property(x => x.Date).HasColumnType("date");
            e.Property(x => x.Amount).HasColumnType("decimal(5,2)");
        });
        b.Entity<AuditLog>().ToTable("AuditLogs");
        b.Entity<ExportHistory>(e =>
        {
            e.ToTable("ExportHistory");
            e.Property(x => x.PeriodStatus).HasConversion<byte>();
        });

        // --- PHASE 2 TABLE MAPPINGS ---
        b.Entity<UserRole>().ToTable("tbl_UserRoles").HasKey(x => new { x.UserId, x.RoleCode });
        b.Entity<HrBranchScope>(e =>
        {
            e.ToTable("tbl_HrBranchScopes").HasKey(x => new { x.UserId, x.BranchCode, x.FromDate });
            e.Property(x => x.FromDate).HasColumnType("date");
            e.Property(x => x.ToDate).HasColumnType("date");
        });
        b.Entity<EmployeeDevice>(e =>
        {
            e.ToTable("tbl_EmployeeDevices").HasKey(x => x.DeviceBindingId);
            e.Property(x => x.RequestedAtUtc).HasColumnType("datetime2(0)");
            e.Property(x => x.DecidedAtUtc).HasColumnType("datetime2(0)");
            e.Property(x => x.LastUsedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<RefreshToken>(e =>
        {
            e.ToTable("tbl_RefreshTokens").HasKey(x => x.TokenId);
            e.Property(x => x.ExpiresAtUtc).HasColumnType("datetime2(0)");
            e.Property(x => x.RevokedAtUtc).HasColumnType("datetime2(0)");
            e.Property(x => x.CreatedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<EmployeeBranchAssignment>(e =>
        {
            e.ToTable("tbl_EmployeeBranchAssignments").HasKey(x => x.AssignmentId);
            e.Property(x => x.FromDate).HasColumnType("date");
            e.Property(x => x.ToDate).HasColumnType("date");
        });
        b.Entity<BranchLocation>(e =>
        {
            e.ToTable("tbl_BranchLocations").HasKey(x => x.LocationId);
            e.Property(x => x.Latitude).HasColumnType("decimal(10,7)");
            e.Property(x => x.Longitude).HasColumnType("decimal(10,7)");
        });
        b.Entity<BranchNetwork>(e =>
        {
            e.ToTable("tbl_BranchNetworks").HasKey(x => x.NetworkId);
            e.Property(x => x.ValidFrom).HasColumnType("date");
            e.Property(x => x.ValidTo).HasColumnType("date");
            e.Property(x => x.CreatedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<WebAttendanceLog>(e =>
        {
            e.ToTable("tbl_WebAttendanceLogs").HasKey(x => x.WebLogId);
            e.Property(x => x.CheckTimeUtc).HasColumnType("datetime2(3)");
            e.Property(x => x.WorkDate).HasColumnType("date");
            e.Property(x => x.Latitude).HasColumnType("decimal(10,7)");
            e.Property(x => x.Longitude).HasColumnType("decimal(10,7)");
            e.Property(x => x.GpsAccuracyMeters).HasColumnType("decimal(7,2)");
            e.Property(x => x.DistanceMeters).HasColumnType("decimal(9,2)");
            e.Property(x => x.ReviewedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<DailyPunchSummary>(e =>
        {
            e.ToTable("tbl_DailyPunchSummary").HasKey(x => new { x.CompanyId, x.EmployeeCode, x.WorkDate });
            e.Property(x => x.WorkDate).HasColumnType("date");
            e.Property(x => x.InTime).HasColumnType("time(0)");
            e.Property(x => x.OutTime).HasColumnType("time(0)");
            e.Property(x => x.BuiltAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<TimeAdjustment>(e =>
        {
            e.ToTable("tbl_TimeAdjustments").HasKey(x => x.AdjustmentId);
            e.Property(x => x.WorkDate).HasColumnType("date");
            e.Property(x => x.AdjInTime).HasColumnType("time(0)");
            e.Property(x => x.AdjOutTime).HasColumnType("time(0)");
            e.Property(x => x.CreatedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<EmployeeRequest>(e =>
        {
            e.ToTable("tbl_EmployeeRequests").HasKey(x => x.RequestId);
            e.Property(x => x.FromDate).HasColumnType("date");
            e.Property(x => x.ToDate).HasColumnType("date");
            e.Property(x => x.DaysRequested).HasColumnType("decimal(4,1)");
            e.Property(x => x.ActualTimeIn).HasColumnType("time(0)");
            e.Property(x => x.ActualTimeOut).HasColumnType("time(0)");
            e.Property(x => x.HRDecidedAtUtc).HasColumnType("datetime2(0)");
            e.Property(x => x.CancelledAtUtc).HasColumnType("datetime2(0)");
            e.Property(x => x.CreatedAtUtc).HasColumnType("datetime2(0)");
            e.Property(x => x.UpdatedAtUtc).HasColumnType("datetime2(0)");
            e.HasMany(x => x.Attachments).WithOne().HasForeignKey(x => x.RequestId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<RequestAttachment>(e =>
        {
            e.ToTable("tbl_RequestAttachments").HasKey(x => x.AttachmentId);
            e.Property(x => x.UploadedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<TimesheetPublication>(e =>
        {
            e.ToTable("tbl_TimesheetPublications").HasKey(x => x.PublicationId);
            e.Property(x => x.PublishedAtUtc).HasColumnType("datetime2(0)");
            e.Property(x => x.RetractedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<TimesheetPublishedLine>(e =>
        {
            e.ToTable("tbl_TimesheetPublishedLines").HasKey(x => x.LineId);
            e.Property(x => x.WorkDays).HasColumnType("decimal(5,1)");
            e.Property(x => x.HolidayDays).HasColumnType("decimal(5,1)");
            e.Property(x => x.AnnualLeaveDays).HasColumnType("decimal(5,1)");
            e.Property(x => x.PaidLeaveDays).HasColumnType("decimal(5,1)");
            e.Property(x => x.UnpaidLeaveDays).HasColumnType("decimal(5,1)");
            e.Property(x => x.PaidDays).HasColumnType("decimal(5,1)");
            e.Property(x => x.LeaveBalanceAfter).HasColumnType("decimal(5,1)");
        });
        b.Entity<TimesheetDispute>(e =>
        {
            e.ToTable("tbl_TimesheetDisputes").HasKey(x => x.DisputeId);
            e.Property(x => x.WorkDate).HasColumnType("date");
            e.Property(x => x.CreatedAtUtc).HasColumnType("datetime2(0)");
            e.Property(x => x.ResolvedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<Notification>(e =>
        {
            e.ToTable("tbl_Notifications").HasKey(x => x.NotificationId);
            e.Property(x => x.CreatedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<HrAlert>(e =>
        {
            e.ToTable("tbl_HrAlerts").HasKey(x => x.AlertId);
            e.Property(x => x.CreatedAtUtc).HasColumnType("datetime2(0)");
            e.Property(x => x.AckedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<SecurityAuditLog>(e =>
        {
            e.ToTable("tbl_SecurityAuditLog").HasKey(x => x.LogId);
            e.Property(x => x.CreatedAtUtc).HasColumnType("datetime2(0)");
        });
        b.Entity<PlatformSetting>(e =>
        {
            e.ToTable("tbl_PlatformSettings").HasKey(x => x.SettingKey);
            e.Property(x => x.SettingKey).HasMaxLength(50);
            e.Property(x => x.UpdatedAtUtc).HasColumnType("datetime2(0)");
        });

        foreach (var entity in b.Model.GetEntityTypes())
            foreach (var prop in entity.GetProperties().Where(p => p.ClrType == typeof(DateTime) || p.ClrType == typeof(DateTime?)))
                if (prop.GetColumnType() == null) prop.SetColumnType("datetime");
    }
}
