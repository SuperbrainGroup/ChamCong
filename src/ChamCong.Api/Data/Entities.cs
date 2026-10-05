namespace ChamCong.Api.Data;

public static class Roles
{
    public const string Admin = "Admin";
    public const string Operator = "Operator";
}

public enum PeriodStatus : byte { Draft = 0, Imported = 1, Calculated = 2, Closed = 3 }

public class Company
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public byte[]? Logo { get; set; }
    public string? LogoContentType { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = Roles.Operator;
    public bool IsActive { get; set; } = true;
    public bool IsLocked { get; set; }
    public int FailedLoginCount { get; set; }
    public bool MustChangePassword { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public List<UserCompany> Companies { get; set; } = new();
}

public class UserCompany
{
    public int UserId { get; set; }
    public int CompanyId { get; set; }
}

public class Department
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
}

public class EmployeeGroup
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsDefault { get; set; }
}

public class Employee
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public string FullName { get; set; } = "";
    public int? DepartmentId { get; set; }
    public int GroupId { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public bool ExemptPunch { get; set; }
    public string? DefaultNote { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}

public class AttendanceCode
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal WorkValue { get; set; }
    public decimal HolidayValue { get; set; }
    public decimal AnnualLeaveValue { get; set; }
    public decimal PaidLeaveValue { get; set; }
    public byte FundType { get; set; }
    public decimal FundDeduct { get; set; }
    public bool IsHalfLeave { get; set; }
    public string? Color { get; set; }
    public int SortOrder { get; set; }
    public bool IsSystem { get; set; }
    public string? Condition { get; set; }
}

public class ParameterValue
{
    public int Id { get; set; }
    public int? CompanyId { get; set; }
    public int? GroupId { get; set; }
    public string Code { get; set; } = "";
    public string Value { get; set; } = "";
    public DateTime EffectiveFrom { get; set; }
    public string UpdatedBy { get; set; } = "";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class CalendarDayEntity
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public DateTime Date { get; set; }
    public byte DayType { get; set; }
    public string? HalfSession { get; set; }
    public short? ShiftStart { get; set; }
    public short? ShiftEnd { get; set; }
    public string? CompanyOffCode { get; set; }
    public string? Note { get; set; }
}

public class Period
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public short Year { get; set; }
    public byte Month { get; set; }
    public DateTime FromDate { get; set; }
    public DateTime ToDate { get; set; }
    public decimal StandardDays { get; set; }
    public bool StandardDaysManual { get; set; }
    public PeriodStatus Status { get; set; }
    public string ParamSnapshot { get; set; } = "{}";
    public string CodeSnapshot { get; set; } = "[]";
    public string CreatedBy { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime? CalculatedAt { get; set; }
    public string? ClosedBy { get; set; }
    public DateTime? ClosedAt { get; set; }
}

public class ImportBatch
{
    public int Id { get; set; }
    public int PeriodId { get; set; }
    public string FileName { get; set; } = "";
    public string FileHash { get; set; } = "";
    public string ImportedBy { get; set; } = "";
    public DateTime ImportedAt { get; set; } = DateTime.Now;
    public int TotalRows { get; set; }
    public int ErrorRows { get; set; }
    public int WarningRows { get; set; }
    public int MatchedEmployees { get; set; }
    public int UnmatchedCodes { get; set; }
    public bool IsCurrent { get; set; } = true;
}

public class RawPunch
{
    public long Id { get; set; }
    public int PeriodId { get; set; }
    public int BatchId { get; set; }
    public int? EmployeeId { get; set; }
    public string MachineCode { get; set; } = "";
    public string? MachineName { get; set; }
    public DateTime WorkDate { get; set; }
    public short? InMin { get; set; }
    public short? OutMin { get; set; }
    public string? InTime { get; set; }
    public string? OutTime { get; set; }
    public string? MyTimeHours { get; set; }
    public string? LeaveType { get; set; }
    public string? LeaveStatus { get; set; }
    public string? LeaveHours { get; set; }
    public string? InOutStatus { get; set; }
    public string? Reason { get; set; }
    public string? ShiftApproval { get; set; }
    public int SourceRow { get; set; }
}

public class LeaveRequest
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public int EmployeeId { get; set; }
    public DateTime Date { get; set; }
    public string Code { get; set; } = "";
    public string? Reason { get; set; }
    public string Source { get; set; } = "MANUAL";
    public string CreatedBy { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}

public class DayResult
{
    public long Id { get; set; }
    public int PeriodId { get; set; }
    public int EmployeeId { get; set; }
    public DateTime Date { get; set; }
    public string? Code { get; set; }
    public string? AutoCode { get; set; }
    public decimal PaidValue { get; set; }
    public short? WorkedMinutes { get; set; }
    public short LateMinutes { get; set; }
    public short EarlyMinutes { get; set; }
    public short OtMinutes { get; set; }
    public short? InMin { get; set; }
    public short? OutMin { get; set; }
    public string? InTime { get; set; }
    public string? OutTime { get; set; }
    public string? Warnings { get; set; }
    public bool IsManual { get; set; }
    public string? ManualReason { get; set; }
    public string? ManualBy { get; set; }
    public DateTime? ManualAt { get; set; }
    public bool OutOfEmployment { get; set; }
}

public class PeriodNote
{
    public int PeriodId { get; set; }
    public int EmployeeId { get; set; }
    public string Note { get; set; } = "";
}

public class LeaveFund
{
    public int Id { get; set; }
    public int EmployeeId { get; set; }
    public short Year { get; set; }
    public decimal AnnualOpening { get; set; }
    public decimal CarryOpening { get; set; }
    public decimal CompOpening { get; set; }
}

public class LeaveLedgerEntry
{
    public long Id { get; set; }
    public int EmployeeId { get; set; }
    public short Year { get; set; }
    public string Fund { get; set; } = "";
    public int? PeriodId { get; set; }
    public DateTime Date { get; set; }
    public string? Code { get; set; }
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}

public class AuditLog
{
    public long Id { get; set; }
    public DateTime At { get; set; } = DateTime.Now;
    public int? UserId { get; set; }
    public string Username { get; set; } = "";
    public int? CompanyId { get; set; }
    public int? PeriodId { get; set; }
    public string Entity { get; set; } = "";
    public string? EntityId { get; set; }
    public string Action { get; set; } = "";
    public string? Detail { get; set; }
}

public class ExportHistory
{
    public int Id { get; set; }
    public int PeriodId { get; set; }
    public string FileName { get; set; } = "";
    public string ExportedBy { get; set; } = "";
    public DateTime ExportedAt { get; set; } = DateTime.Now;
    public PeriodStatus PeriodStatus { get; set; }
}
