namespace ChamCong.Api.Data;

public static class Roles
{
    public const string Admin = "Admin";
    public const string HR = "HR";
    public const string Employee = "Employee";
    public const string Operator = "HR"; // Tương thích ngược: Operator được gộp hoàn toàn vào HR
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
    public string? EmployeeCode { get; set; }
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = Roles.Operator;
    public bool IsActive { get; set; } = true;
    public bool IsLocked { get; set; }
    public int FailedLoginCount { get; set; }
    public bool MustChangePassword { get; set; } = true;
    public DateTime? LockedUntilUtc { get; set; }
    public DateTime? PrivacyConsentAtUtc { get; set; }
    public string? PrivacyConsentVer { get; set; }
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
    public string AttendanceSource { get; set; } = "APP"; // APP | FILE
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
    public int? BatchId { get; set; }
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
    public string Source { get; set; } = "FILE"; // FILE | APP | REGULARIZED
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

// =========================================================================
// PHASE 2 (ESS & CHẤM CÔNG DI ĐỘNG PWA) ENTITIES
// =========================================================================

public class UserRole
{
    public int UserId { get; set; }
    public string RoleCode { get; set; } = "";
}

public class HrBranchScope
{
    public int UserId { get; set; }
    public string BranchCode { get; set; } = "";
    public DateTime FromDate { get; set; }
    public DateTime? ToDate { get; set; }
}

public class EmployeeDevice
{
    public int DeviceBindingId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public string DeviceType { get; set; } = "MOBILE"; // MOBILE | PC
    public string SecretHash { get; set; } = "";
    public string? FingerprintHash { get; set; }
    public string? DeviceName { get; set; }
    public string? OperatingSystem { get; set; }
    public string? BrowserInfo { get; set; }
    public string? RegisteredPublicIP { get; set; }
    public string ApprovalStatus { get; set; } = "PENDING"; // PENDING | APPROVED | REJECTED | REVOKED
    public bool IsActiveSlot { get; set; } = true;
    public DateTime RequestedAtUtc { get; set; } = DateTime.UtcNow;
    public int? DecidedByUserId { get; set; }
    public DateTime? DecidedAtUtc { get; set; }
    public string? DecisionNote { get; set; }
    public DateTime? LastUsedAtUtc { get; set; }
    public string? LastUsedPublicIP { get; set; }
}

public class RefreshToken
{
    public long TokenId { get; set; }
    public int UserId { get; set; }
    public int? DeviceBindingId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string? CreatedPublicIP { get; set; }
}

public class EmployeeBranchAssignment
{
    public int AssignmentId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public string BranchCode { get; set; } = "";
    public bool IsPrimary { get; set; }
    public DateTime FromDate { get; set; }
    public DateTime? ToDate { get; set; }
}

public class BranchLocation
{
    public int LocationId { get; set; }
    public string BranchCode { get; set; } = "";
    public string LocationName { get; set; } = "";
    public decimal Latitude { get; set; }
    public decimal Longitude { get; set; }
    public int RadiusMeters { get; set; } = 50;
    public bool IsActive { get; set; } = true;
}

public class BranchNetwork
{
    public int NetworkId { get; set; }
    public string BranchCode { get; set; } = "";
    public string Cidr { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime ValidFrom { get; set; }
    public DateTime? ValidTo { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class WebAttendanceLog
{
    public long WebLogId { get; set; }
    public Guid ClientRequestId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public int DeviceBindingId { get; set; }
    public string Channel { get; set; } = "MOBILE_PWA"; // MOBILE_PWA | PC_WEB
    public DateTime CheckTimeUtc { get; set; } = DateTime.UtcNow;
    public DateTime WorkDate { get; set; }
    public string? DetectedBranchCode { get; set; }
    public string CheckinPolicy { get; set; } = "OFFICE_STRICT";
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public decimal? GpsAccuracyMeters { get; set; }
    public decimal? DistanceMeters { get; set; }
    public string ClientPublicIP { get; set; } = "";
    public bool? IpOk { get; set; }
    public string GpsState { get; set; } = "NA"; // OK | OUT | LOW_ACC | MISSING | NA
    public string VerificationStatus { get; set; } = "VALID"; // VALID | REVIEW | OUT_OF_OFFICE
    public string? ReasonCode { get; set; } // GPS_DRIFT | OFF_NETWORK | OUTSIDE | WRONG_BRANCH | DEVICE_REJECTED
    public string ReviewState { get; set; } = "NONE"; // NONE | PENDING | ACCEPTED | REJECTED
    public int? ReviewedByUserId { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
    public string? ReviewNote { get; set; }
    public string? UserAgent { get; set; }
}

public class DailyPunchSummary
{
    public string EmployeeCode { get; set; } = "";
    public DateTime WorkDate { get; set; }
    public TimeSpan? InTime { get; set; }
    public TimeSpan? OutTime { get; set; }
    public string Source { get; set; } = "APP"; // APP | REGULARIZED
    public long? InLogId { get; set; }
    public long? OutLogId { get; set; }
    public int UsedPunchCount { get; set; }
    public bool HasPendingReview { get; set; }
    public DateTime BuiltAtUtc { get; set; } = DateTime.UtcNow;
}

public class TimeAdjustment
{
    public int AdjustmentId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public DateTime WorkDate { get; set; }
    public TimeSpan? AdjInTime { get; set; }
    public TimeSpan? AdjOutTime { get; set; }
    public int SourceRequestId { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class EmployeeRequest
{
    public int RequestId { get; set; }
    public string RequestType { get; set; } = "LEAVE"; // LEAVE | REGULARIZATION
    public string EmployeeCode { get; set; } = "";
    public string? LeaveCode { get; set; }
    public DateTime FromDate { get; set; }
    public DateTime ToDate { get; set; }
    public string? DayPart { get; set; } // FULL | MORNING | AFTERNOON
    public decimal DaysRequested { get; set; }
    public string? ReasonCode { get; set; }
    public string Reason { get; set; } = "";
    public TimeSpan? ActualTimeIn { get; set; }
    public TimeSpan? ActualTimeOut { get; set; }
    public string Status { get; set; } = "PENDING_HR"; // PENDING_HR | APPROVED | REJECTED | CANCELLED
    public int? HRUserId { get; set; }
    public DateTime? HRDecidedAtUtc { get; set; }
    public string? HRNote { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<RequestAttachment> Attachments { get; set; } = new();
}

public class RequestAttachment
{
    public int AttachmentId { get; set; }
    public int RequestId { get; set; }
    public string OriginalFileName { get; set; } = "";
    public string StoredFileName { get; set; } = "";
    public string MimeType { get; set; } = "";
    public int FileSizeBytes { get; set; }
    public string Sha256 { get; set; } = "";
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
}

public class TimesheetPublication
{
    public int PublicationId { get; set; }
    public int PeriodId { get; set; }
    public string BranchCode { get; set; } = "";
    public int VersionNo { get; set; } = 1;
    public bool IsCurrent { get; set; } = true;
    public int PublishedByUserId { get; set; }
    public DateTime PublishedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? RetractedAtUtc { get; set; }
    public string? Note { get; set; }
}

public class TimesheetPublishedLine
{
    public int LineId { get; set; }
    public int PublicationId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public string DailyCodes { get; set; } = "";
    public decimal WorkDays { get; set; }
    public decimal HolidayDays { get; set; }
    public decimal AnnualLeaveDays { get; set; }
    public decimal PaidLeaveDays { get; set; }
    public decimal UnpaidLeaveDays { get; set; }
    public decimal PaidDays { get; set; }
    public int LateEarlyMinutes { get; set; }
    public decimal? LeaveBalanceAfter { get; set; }
    public string? Note { get; set; }
}

public class TimesheetDispute
{
    public int DisputeId { get; set; }
    public int PublicationId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public DateTime? WorkDate { get; set; }
    public string Content { get; set; } = "";
    public string Status { get; set; } = "OPEN"; // OPEN | ACCEPTED | REJECTED
    public int? HRUserId { get; set; }
    public string? HRResponse { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAtUtc { get; set; }
}

public class Notification
{
    public long NotificationId { get; set; }
    public int UserId { get; set; }
    public string Title { get; set; } = "";
    public string? Body { get; set; }
    public string? LinkType { get; set; }
    public int? LinkId { get; set; }
    public bool IsRead { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class HrAlert
{
    public int AlertId { get; set; }
    public string AlertType { get; set; } = ""; // IP_DRIFT | REPEAT_FLAG | DEVICE_ANOMALY
    public string? BranchCode { get; set; }
    public string? EmployeeCode { get; set; }
    public string Detail { get; set; } = "";
    public string Status { get; set; } = "OPEN"; // OPEN | ACKED
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public int? AckedByUserId { get; set; }
    public DateTime? AckedAtUtc { get; set; }
}

public class SecurityAuditLog
{
    public long LogId { get; set; }
    public int? UserId { get; set; }
    public string EventType { get; set; } = "";
    public string? Detail { get; set; }
    public string? PublicIP { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class PlatformSetting
{
    public string SettingKey { get; set; } = "";
    public string? SettingValue { get; set; }
    public string? Description { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public string? UpdatedBy { get; set; }
}

