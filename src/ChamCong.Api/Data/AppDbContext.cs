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
    public DbSet<PeriodNote> PeriodNotes => Set<PeriodNote>();
    public DbSet<LeaveFund> LeaveFunds => Set<LeaveFund>();
    public DbSet<LeaveLedgerEntry> LeaveLedger => Set<LeaveLedgerEntry>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<ExportHistory> ExportHistory => Set<ExportHistory>();

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

        foreach (var entity in b.Model.GetEntityTypes())
            foreach (var prop in entity.GetProperties().Where(p => p.ClrType == typeof(DateTime) || p.ClrType == typeof(DateTime?)))
                if (prop.GetColumnType() == null) prop.SetColumnType("datetime");
    }
}
