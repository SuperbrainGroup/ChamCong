export interface User {
  id: number;
  username: string;
  fullName: string;
  role: 'Admin' | 'Operator';
  isActive: boolean;
  isLocked: boolean;
  failedLoginCount?: number;
  mustChangePassword: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  assignedCompanyIds: number[];
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
  defaultNote?: string;
  sortOrder: number;
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
    defaultNote?: string;
  };
  note: string;
  summary: MonthSummary;
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
  annualOpening: number;
  carryOpening: number;
  compOpening: number;
  annualUsed: number;
  carryUsed: number;
  compUsed: number;
  totalRemaining: number;
}

export interface LeaveLedgerItem {
  id: number;
  employeeId: number;
  periodId?: number;
  year: number;
  date: string;
  fund: 'ANNUAL' | 'CARRY' | 'COMP';
  amount: number;
  balanceAfter: number;
  reason?: string;
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

