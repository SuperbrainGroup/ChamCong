export interface User {
  id: number;
  username: string;
  fullName: string;
  role: 'Admin' | 'HR' | 'Employee';
  roles?: string[];
  employeeCode?: string;
  employeeType?: 'STANDARD' | 'PARTTIME' | 'REMOTE' | string;
  privacyConsentAtUtc?: string;
  isActive: boolean;
  isLocked: boolean;
  failedLoginCount?: number;
  mustChangePassword: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  assignedCompanyIds: number[];
}

export interface EmployeeDevice {
  deviceBindingId: number;
  employeeCode?: string;
  employeeName?: string;
  deviceType: 'MOBILE' | 'PC';
  deviceName?: string;
  operatingSystem?: string;
  browserInfo?: string;
  fingerprintHash?: string;
  macAddress?: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  requestedAtUtc: string;
  lastUsedAtUtc?: string;
}

export interface PunchItem {
  webLogId: number;
  checkTimeLocal?: string;
  time?: string;
  verificationStatus: 'VALID' | 'REVIEW' | 'OUT_OF_OFFICE';
  reasonCode?: string;
  reviewState: 'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED';
  channel: string;
  ipOk?: boolean;
  gpsState?: string;
  deviceInfo?: string;
  deviceName?: string;
  deviceType?: string;
  deviceMac?: string;
  operatingSystem?: string;
  browserInfo?: string;
}

export interface PunchState {
  workDate: string;
  currentMode: 'CHECK_IN' | 'CHECKED_IN' | 'WORKING' | 'WORKING_NOT_CHECKED_IN' | 'CHECK_OUT' | 'COMPLETED' | 'NEED_EXPLANATION';
  hasValidCheckin?: boolean;
  canCheckout?: boolean;
  remainingMinutesToCheckout?: number;
  firstPunchTime?: string;
  lastPunchTime?: string;
  todayPunchCount: number;
  totalPunchLogs?: number;
  validPunchCount?: number;
  clientPublicIp: string;
  pcMacAddress?: string;
  pcApprovalStatus?: string;
  allowCheckoutWithExplanation?: boolean;
  shift?: {
    shiftStart: string;
    shiftEnd: string;
    checkoutStartTime: string;
    checkoutPrepareMinutes: number;
    lunchStart: string;
    lunchMinutes: number;
    standardRange: string;
    isCheckinWindow: boolean;
    isWorkingWindow: boolean;
    isCheckoutWindow: boolean;
    isPastShiftEnd: boolean;
    statusLabel: string;
    statusDescription: string;
  };
  explanationPrompt?: {
    required: boolean;
    suggestedDate: string;
    suggestedInTime: string;
    suggestedOutTime: string;
    reason: string;
  } | null;
  punches: PunchItem[];
}

export interface UserRequestItem {
  requestId: number;
  requestType: 'LEAVE' | 'REGULARIZATION';
  employeeCode?: string;
  fullName?: string;
  departmentName?: string;
  leaveCode?: string;
  fromDate: string;
  toDate: string;
  dayPart?: string;
  daysRequested: number;
  reasonCode?: string;
  reason: string;
  actualTimeIn?: string;
  actualTimeOut?: string;
  actualIn?: string;
  actualOut?: string;
  status: 'PENDING_HR' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  hrNote?: string;
  createdAt: string;
  attachmentCount: number;
  attachments?: Array<{
    attachmentId: number;
    originalFileName: string;
    fileSizeBytes: number;
    mimeType: string;
  }>;
}

export interface LeaveBalanceSummary {
  year: number;
  month?: number;
  annualOpening: number;
  carryOpening: number;
  compOpening: number;
  opening?: number;
  accrued?: number;
  totalOpening: number;
  totalEarned?: number;
  monthUsed?: number;
  monthAnnualUsed?: number;
  used: number;
  held: number;
  available: number;
  isExhausted?: boolean;
}

export interface TimesheetDayItem {
  date: string;
  dateDisplay: string;
  day: number;
  dayOfWeek: string;
  code: string;
  codeName: string;
  color?: string;
  inTime?: string | null;
  outTime?: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  isLate: boolean;
  isEarly: boolean;
  isLeave: boolean;
  leaveCategory: 'ANNUAL_LEAVE' | 'PAID_LEAVE' | 'UNPAID_LEAVE' | 'HOLIDAY' | 'WEEKEND_OFF' | 'WORK';
  categoryLabel: string;
  paidValue: number;
  isManual: boolean;
  manualReason?: string | null;
  isOutOfEmployment: boolean;
  hasDispute?: boolean;
  disputeStatus?: string;
  disputeContent?: string;
  disputeResponse?: string;
}

export interface TimesheetPeriodItem {
  id: number;
  month: number;
  year: number;
  name: string;
  status: string;
  isClosed: boolean;
}

export interface EmployeeBriefItem {
  id: number;
  employeeCode: string;
  fullName: string;
  departmentId?: number;
  departmentName?: string;
  companyId: number;
  startDate: string;
}

export interface TimesheetDisputeItem {
  disputeId: number;
  workDate?: string;
  content: string;
  status: string;
  hrResponse?: string;
  createdAt: string;
}

export interface PublishedTimesheetData {
  isPublished: boolean;
  isClosed?: boolean;
  message?: string;
  publicationId?: number;
  versionNo?: number;
  publishedAt?: string;
  period?: {
    id: number;
    month: number;
    year: number;
    fromDate: string;
    toDate: string;
    standardDays: number;
    status: string;
    closedAt?: string;
    closedBy?: string;
  };
  availablePeriods?: TimesheetPeriodItem[];
  employee?: {
    id: number;
    employeeCode: string;
    fullName: string;
    departmentName?: string;
    startDate?: string;
    tenureYears?: number;
    tenureDisplay?: string;
  };
  employeesList?: EmployeeBriefItem[];
  disputes?: TimesheetDisputeItem[];
  leaveBalance?: {
    year: number;
    month?: number;
    annualOpening: number;
    carryOpening: number;
    compOpening: number;
    opening?: number;
    accrued?: number;
    totalOpening: number;
    totalEarned?: number;
    monthUsed?: number;
    monthAnnualUsed?: number;
    used: number;
    held: number;
    available: number;
    isExhausted?: boolean;
  };
  summary?: {
    workDays: number;
    holidayDays: number;
    annualLeaveDays: number;
    paidLeaveDays: number;
    unpaidLeaveDays: number;
    totalLeaveDays?: number;
    paidDays: number;
    lateArrivalCount: number;
    earlyDepartureCount?: number;
    totalLateEarlyOccurrences?: number;
    lateEarlyDaysCount?: number;
    totalLateMinutes: number;
    totalEarlyMinutes: number;
  };
  days?: TimesheetDayItem[];
  dailyCodes?: { dayIndex: number; code: string }[];
}

export interface BranchLocationItem {
  locationId: number;
  branchCode: string;
  locationName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isActive: boolean;
}

export interface BranchNetworkItem {
  networkId: number;
  branchCode: string;
  cidr: string;
  description?: string;
  isActive: boolean;
  validFrom: string;
  validTo?: string;
}

export interface HrDashboardSummary {
  todayDate: string;
  checkedInCount: number;
  validCount: number;
  reviewCount: number;
  outCount: number;
  pendingDevices: number;
  pendingRequests: number;
  openAlerts: number;
}

export interface AppNotification {
  notificationId: number;
  userId?: number;
  companyId?: number;
  companyCode?: string;
  companyName?: string;
  branchCode?: string;
  title: string;
  body?: string;
  linkType?: string;
  linkId?: number;
  isRead: boolean;
  timeLocal: string;
}

export interface Company {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  hasLogo: boolean;
}

export interface Department {
  id: number;
  companyId: number;
  name: string;
  sortOrder: number;
}

export interface EmployeeGroup {
  id: number;
  companyId: number;
  code: string;
  name: string;
  isDefault: boolean;
}

export interface Employee {
  id: number;
  companyId: number;
  employeeCode: string;
  fullName: string;
  departmentId?: number;
  departmentName?: string;
  groupId: number;
  groupName: string;
  startDate: string;
  endDate?: string;
  exemptPunch: boolean;
  employeeType?: 'STANDARD' | 'REMOTE' | 'PARTTIME';
  defaultNote?: string;
  sortOrder: number;
  hasAccount?: boolean;
  username?: string;
}

export interface AttendanceCode {
  id: number;
  companyId: number;
  code: string;
  name: string;
  workValue: number;
  holidayValue: number;
  annualLeaveValue: number;
  paidLeaveValue: number;
  fundType: number;
  fundDeduct: number;
  isHalfLeave: boolean;
  color?: string;
  sortOrder: number;
  isSystem: boolean;
  condition?: string;
}

export interface Period {
  id: number;
  companyId: number;
  year: number;
  month: number;
  fromDate: string;
  toDate: string;
  standardDays: number;
  standardDaysManual: boolean;
  status: 'Draft' | 'Imported' | 'Calculated' | 'Closed';
  createdBy: string;
  createdAt: string;
  calculatedAt?: string;
  closedBy?: string;
  closedAt?: string;
  unresolvedCount: number;
}

export interface InspectionReport {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  matchedEmployees: number;
  unmatchedEmployees: number;
  unmatchedMachineCodes: string[];
  missingPunchEmployees: string[];
  errors: string[];
  warnings: string[];
}

export interface GridDayCell {
  date: string;
  code?: string;
  autoCode?: string;
  paidValue: number;
  workedMinutes?: number;
  lateMinutes: number;
  earlyMinutes: number;
  otMinutes: number;
  inTime?: string;
  outTime?: string;
  warnings?: string;
  isManual: boolean;
  manualReason?: string;
  outOfEmployment: boolean;
}

export interface MonthSummary {
  workDays: number;
  holidayDays: number;
  annualLeaveDays: number;
  paidLeaveDays: number;
  unpaidDays: number;
  paidDays: number;
  lateEarlyMinutes: number;
  lateEarlyHours: number;
  otMinutes: number;
}

export interface GridEmployeeRow {
  employee: {
    id: number;
    employeeCode: string;
    fullName: string;
    machineCode?: string;
    departmentName: string;
    groupName: string;
    exemptPunch: boolean;
    employeeType?: 'STANDARD' | 'REMOTE' | 'PARTTIME' | string;
    defaultNote?: string;
    startDate?: string;
    endDate?: string;
  };
  note: string;
  summary: MonthSummary;
  leaveBalance?: {
    annualOpening: number;
    carryOpening: number;
    opening: number;
    accrued: number;
    totalEarned: number;
    monthUsed: number;
    monthAnnualUsed: number;
    totalUsed: number;
    used?: number;
    available: number;
    isExhausted: boolean;
  } | null;
  days: GridDayCell[];
}

export interface PeriodGridData {
  period: {
    id: number;
    year: number;
    month: number;
    fromDate: string;
    toDate: string;
    standardDays: number;
    status: string;
  };
  dates: {
    date: string;
    dayName: string;
    dayOfWeek: string;
  }[];
  codes: Record<string, {
    code: string;
    name: string;
    color?: string;
    workValue: number;
    holidayValue: number;
    annualLeaveValue: number;
    paidLeaveValue: number;
    isHalfLeave: boolean;
  }>;
  grid: GridEmployeeRow[];
}

export interface WarningItem {
  id: number;
  employeeId: number;
  employeeCode: string;
  fullName: string;
  machineCode: string;
  date: string;
  code?: string;
  autoCode?: string;
  inTime?: string;
  outTime?: string;
  warnings?: string;
  isManual: boolean;
  manualReason?: string;
  manualBy?: string;
}

export interface ParameterMatrix {
  groups: { id: number; code: string; name: string; isDefault: boolean }[];
  rows: {
    code: string;
    group: string;
    name: string;
    type: string;
    default: string;
    description: string;
    companyOnly: boolean;
    companyValue?: string;
    groupValues: Record<number, string>;
  }[];
}

export interface CalendarDay {
  id: number;
  date: string;
  dayType: number; // 1=Work, 2=HalfWork, 3=WeeklyOff, 4=Holiday, 5=HalfHoliday, 6=CompanyOff
  halfSession?: string; // 'AM' | 'PM'
  shiftStart?: number;
  shiftEnd?: number;
  shiftStartText?: string;
  shiftEndText?: string;
  companyOffCode?: string;
  note?: string;
}

export interface LeaveRequest {
  id: number;
  companyId: number;
  employeeId: number;
  employeeCode: string;
  fullName: string;
  date: string;
  code: string;
  reason?: string;
  source: string;
  createdBy: string;
  createdAt: string;
}

export interface LeaveFund {
  employeeId: number;
  employeeCode: string;
  fullName: string;
  year: number;
  month?: number | null;
  annualOpening: number;
  carryOpening: number;
  compOpening: number;
  opening?: number;
  accrued?: number;
  totalAnnualEarned?: number;
  totalEarned?: number;
  monthUsed?: number;
  monthAnnualUsed?: number;
  annualUsed?: number;
  carryUsed?: number;
  compUsed?: number;
  totalUsed: number;
  pendingDays?: number;
  totalRemaining?: number;
  availableBalance: number;
  isExhausted?: boolean;
}

export interface LeaveLedgerItem {
  id: number;
  employeeId: number;
  periodId?: number;
  year: number;
  date: string;
  fund: 'ANNUAL' | 'CARRY' | 'COMP' | string;
  amount: number;
  balanceAfter: number;
  code?: string;
  reason?: string;
  note?: string;
  createdAt: string;
}

export interface AuditLogItem {
  id: number;
  at: string;
  username: string;
  companyId?: number;
  periodId?: number;
  entity: string;
  entityId?: string;
  action: string;
  detail?: string;
}

export interface AuditLogPaged {
  items: AuditLogItem[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
}

export interface WorkSchedule {
  id?: number;
  scheduleId: number;
  companyId: number;
  employeeId?: number;
  employeeCode: string;
  employeeName?: string;
  employeeType?: 'STANDARD' | 'REMOTE' | 'PARTTIME' | string;
  workDate: string;
  shiftCode: 'FULL' | 'MORNING' | 'AFTERNOON' | string;
  note?: string;
  status: 'REGISTERED' | 'CANCELLED' | string;
  registeredAtUtc: string;
  registeredBy?: string;
}

