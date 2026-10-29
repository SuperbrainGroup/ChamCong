import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Printer,
  RefreshCw,
  Award,
  Building2,
  UserCheck,
  Wallet,
  Info,
  CalendarDays,
  FileSpreadsheet,
  ArrowLeft,
  ShieldCheck,
  Coffee,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { timesheetApi } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type {
  PublishedTimesheetData,
  TimesheetDayItem,
  TimesheetPeriodItem,
  EmployeeBriefItem,
  TimesheetDisputeItem
} from '../../types';

interface HrEmployeeTimesheetViewProps {
  onBack?: () => void;
}

export const HrEmployeeTimesheetView: React.FC<HrEmployeeTimesheetViewProps> = ({ onBack }) => {
  const { selectedCompany, companies, setSelectedCompany, user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PublishedTimesheetData | null>(null);

  // Bộ chọn
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(() => {
    const saved = localStorage.getItem('hr_selected_period_id');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [selectedEmpId, setSelectedEmpId] = useState<number>(() => {
    const saved = localStorage.getItem('hr_selected_employee_id');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [empSearch, setEmpSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'LEAVE' | 'LATE' | 'KP'>('ALL');

  // Tải dữ liệu bảng công của nhân viên
  const fetchEmployeeTimesheet = async (empId?: number, periodId?: number) => {
    setLoading(true);
    try {
      const res = await timesheetApi.getEmployeeTimesheet({
        employeeId: empId && empId > 0 ? empId : undefined,
        periodId: periodId && periodId > 0 ? periodId : undefined,
        companyId: selectedCompany ? selectedCompany.id : undefined
      });
      setData(res);

      // Cập nhật selectedPeriodId và selectedEmpId nếu server tự xác định
      if (res.period?.id && res.period.id !== selectedPeriodId) {
        setSelectedPeriodId(res.period.id);
      }
      if (res.employee?.id && res.employee.id !== selectedEmpId) {
        setSelectedEmpId(res.employee.id);
      }
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Không thể tải bảng chấm công nhân viên.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Khởi động hoặc khi đổi hội sở
  useEffect(() => {
    const targetEmpId = selectedEmpId > 0 ? selectedEmpId : undefined;
    const targetPeriodId = selectedPeriodId > 0 ? selectedPeriodId : undefined;
    fetchEmployeeTimesheet(targetEmpId, targetPeriodId);

    // Xóa bộ nhớ tạm sau khi đã đọc
    localStorage.removeItem('hr_selected_employee_id');
    localStorage.removeItem('hr_selected_period_id');
  }, [selectedCompany?.id]);

  const handlePeriodChange = (newPeriodId: number) => {
    setSelectedPeriodId(newPeriodId);
    fetchEmployeeTimesheet(selectedEmpId, newPeriodId);
  };

  const handleEmployeeChange = (newEmpId: number) => {
    setSelectedEmpId(newEmpId);
    fetchEmployeeTimesheet(newEmpId, selectedPeriodId);
  };

  // Danh sách nhân viên được lọc theo tìm kiếm
  const employeesList = data?.employeesList || [];
  const filteredEmployeesList = useMemo(() => {
    if (!empSearch.trim()) return employeesList;
    const q = empSearch.toLowerCase().trim();
    return employeesList.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        (e.departmentName && e.departmentName.toLowerCase().includes(q))
    );
  }, [employeesList, empSearch]);

  // Vị trí nhân viên hiện tại để hỗ trợ Trước / Sau
  const currentEmpIndex = useMemo(() => {
    if (!data?.employee?.id || !employeesList.length) return -1;
    return employeesList.findIndex((e) => e.id === data.employee?.id);
  }, [data?.employee?.id, employeesList]);

  const handlePrevEmployee = () => {
    if (currentEmpIndex > 0) {
      const prevEmp = employeesList[currentEmpIndex - 1];
      handleEmployeeChange(prevEmp.id);
    }
  };

  const handleNextEmployee = () => {
    if (currentEmpIndex >= 0 && currentEmpIndex < employeesList.length - 1) {
      const nextEmp = employeesList[currentEmpIndex + 1];
      handleEmployeeChange(nextEmp.id);
    }
  };

  // Bộ lọc ngày trong kỳ
  const days = data?.days || [];
  const filteredDays = useMemo(() => {
    return days.filter((d: TimesheetDayItem) => {
      if (filterType === 'LEAVE') return d.isLeave || d.leaveCategory === 'ANNUAL_LEAVE' || d.leaveCategory === 'PAID_LEAVE';
      if (filterType === 'LATE') return d.isLate || d.isEarly;
      if (filterType === 'KP') return d.code === 'KP' || d.code === '?' || d.leaveCategory === 'UNPAID_LEAVE';
      return true;
    });
  }, [days, filterType]);

  const leaveCount = days.filter((d) => d.isLeave || d.leaveCategory === 'ANNUAL_LEAVE' || d.leaveCategory === 'PAID_LEAVE').length;
  const lateCount = days.filter((d) => d.isLate || d.isEarly).length;
  const issueCount = days.filter((d) => d.code === 'KP' || d.code === '?' || d.leaveCategory === 'UNPAID_LEAVE').length;

  const handlePrint = () => {
    window.print();
  };

  const currentEmp = data?.employee;
  const currentPeriod = data?.period;
  const summary = data?.summary;
  const leaveBalance = data?.leaveBalance;
  const disputes = data?.disputes || [];

  // Tính toán số liệu thống kê đầy đủ và chính xác từ dữ liệu kỳ công & danh sách ngày
  const calculatedSummary = useMemo(() => {
    const s = data?.summary;
    const ds = data?.days || [];

    let work = 0;
    let hol = 0;
    let pAnnual = 0;
    let pPaid = 0;
    let pUnpaid = 0;
    let lateOcc = 0;
    let earlyOcc = 0;
    let lateMin = 0;
    let earlyMin = 0;

    for (const d of ds) {
      if (d.isOutOfEmployment) continue;
      if (d.leaveCategory === 'ANNUAL_LEAVE') {
        const val = d.paidValue > 0 ? d.paidValue : (d.code === 'P/2' || d.code === 'P/2K' ? 0.5 : 1);
        pAnnual += val;
        if (d.code === 'P/2') work += 0.5;
      } else if (d.leaveCategory === 'PAID_LEAVE') {
        pPaid += d.paidValue > 0 ? d.paidValue : 1;
      } else if (d.leaveCategory === 'UNPAID_LEAVE' || d.code === 'KP' || d.code === 'V') {
        pUnpaid += 1;
      } else if (d.leaveCategory === 'HOLIDAY') {
        hol += d.paidValue > 0 ? d.paidValue : 1;
      } else if (d.leaveCategory === 'WORK' || (!d.isLeave && d.code === '1')) {
        work += d.paidValue > 0 ? d.paidValue : (d.code === '0.5' ? 0.5 : 1);
      }

      if (d.isLate) {
        lateOcc++;
        lateMin += d.lateMinutes || 0;
      }
      if (d.isEarly) {
        earlyOcc++;
        earlyMin += d.earlyMinutes || 0;
      }
    }

    const paid = s?.paidDays ?? (work + hol + pAnnual + pPaid);
    const totalLeave = s?.totalLeaveDays ?? ((s?.annualLeaveDays ?? pAnnual) + (s?.paidLeaveDays ?? pPaid));
    const totalLateEarly = s?.totalLateEarlyOccurrences ?? ((s?.lateArrivalCount ?? lateOcc) + (s?.earlyDepartureCount ?? earlyOcc));

    return {
      workDays: s?.workDays ?? work,
      holidayDays: s?.holidayDays ?? hol,
      annualLeaveDays: s?.annualLeaveDays ?? pAnnual,
      paidLeaveDays: s?.paidLeaveDays ?? pPaid,
      unpaidLeaveDays: s?.unpaidLeaveDays ?? pUnpaid,
      totalLeaveDays: totalLeave,
      paidDays: paid,
      lateArrivalCount: s?.lateArrivalCount ?? lateOcc,
      earlyDepartureCount: s?.earlyDepartureCount ?? earlyOcc,
      totalLateEarlyOccurrences: totalLateEarly,
      totalLateMinutes: s?.totalLateMinutes ?? lateMin,
      totalEarlyMinutes: s?.totalEarlyMinutes ?? earlyMin,
    };
  }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', paddingBottom: '40px' }}>
      {/* 1. THANH ĐIỀU HƯỚNG & TIÊU ĐỀ */}
      <div
        className="no-print"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: '#EFF6FF',
              color: '#0056B3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <CalendarDays size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Bảng Chấm Công Từng Nhân Viên
              </h2>
              {currentPeriod && (
                <span
                  style={{
                    backgroundColor: currentPeriod.status === 'Closed' ? '#DEF7EC' : '#FEF3C7',
                    color: currentPeriod.status === 'Closed' ? '#03543F' : '#92400E',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px'
                  }}
                >
                  {currentPeriod.status === 'Closed' ? 'Đã Chốt' : currentPeriod.status === 'Calculated' ? 'Đã Tính' : 'Bản Nháp'}
                </span>
              )}
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>
              Tra cứu chi tiết ngày công, thâm niên, quỹ phép năm và các lần đi trễ của nhân sự
            </div>
          </div>
        </div>

        {/* Cụm công cụ: In, Làm mới */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => fetchEmployeeTimesheet(selectedEmpId, selectedPeriodId)}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontWeight: 600 }}
            title="Làm mới dữ liệu"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="btn btn-primary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              fontWeight: 700,
              backgroundColor: '#0056B3',
              borderColor: '#0056B3'
            }}
            title="In bảng chấm công nhân viên"
          >
            <Printer size={15} />
            <span>In Bảng Công</span>
          </button>
        </div>
      </div>

      {/* 2. THANH BỘ LỌC ĐA NĂNG: HỘI SỞ, KỲ CÔNG, CHỌN NHÂN VIÊN */}
      <div
        className="no-print"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          alignItems: 'center'
        }}
      >
        {/* Chọn Hội sở (nếu có nhiều) */}
        {companies.length > 1 && (
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              Hội sở / Đơn vị
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={selectedCompany?.id || ''}
                onChange={(e) => {
                  const comp = companies.find((c) => c.id === parseInt(e.target.value, 10));
                  if (comp) setSelectedCompany(comp);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: '#F8FAFC',
                  color: '#0F172A'
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Chọn Kỳ công */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
            Kỳ công
          </label>
          <select
            value={selectedPeriodId || ''}
            onChange={(e) => handlePeriodChange(parseInt(e.target.value, 10))}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: '#F8FAFC',
              color: '#0F172A'
            }}
          >
            {data?.availablePeriods && data.availablePeriods.length > 0 ? (
              data.availablePeriods.map((p: TimesheetPeriodItem) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            ) : (
              <option value="">Chưa có kỳ công</option>
            )}
          </select>
        </div>

        {/* Tìm kiếm & Chọn Nhân viên */}
        <div style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', margin: 0 }}>
              Chọn nhân viên{' '}
              {employeesList.length > 0 && (
                <span style={{ color: '#0056B3', fontWeight: 800 }}>
                  ({currentEmpIndex >= 0 ? currentEmpIndex + 1 : 0}/{employeesList.length})
                </span>
              )}
            </label>

            {/* Nút Chuyển nhanh Trước / Sau */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={handlePrevEmployee}
                disabled={currentEmpIndex <= 0}
                className="btn btn-secondary btn-sm"
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  opacity: currentEmpIndex <= 0 ? 0.5 : 1
                }}
                title="Nhân viên trước"
              >
                <ChevronLeft size={14} />
                <span>Trước</span>
              </button>
              <button
                type="button"
                onClick={handleNextEmployee}
                disabled={currentEmpIndex < 0 || currentEmpIndex >= employeesList.length - 1}
                className="btn btn-secondary btn-sm"
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  opacity: currentEmpIndex < 0 || currentEmpIndex >= employeesList.length - 1 ? 0.5 : 1
                }}
                title="Nhân viên tiếp theo"
              >
                <span>Sau</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={selectedEmpId || ''}
              onChange={(e) => handleEmployeeChange(parseInt(e.target.value, 10))}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #0056B3',
                fontSize: '13px',
                fontWeight: 700,
                backgroundColor: '#EFF6FF',
                color: '#0056B3'
              }}
            >
              {employeesList.length > 0 ? (
                employeesList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employeeCode} — {emp.fullName} {emp.departmentName ? `(${emp.departmentName})` : ''}
                  </option>
                ))
              ) : (
                <option value="">Không có nhân viên</option>
              )}
            </select>

            <div style={{ position: 'relative', width: '220px' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
              />
              <input
                type="text"
                placeholder="Lọc nhanh tên/mã..."
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 30px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12.5px'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. THẺ HỒ SƠ NHÂN SỰ TÓM TẮT & THÂM NIÊN */}
      {currentEmp && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #0056B3 0%, #1D4ED8 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                fontWeight: 800,
                boxShadow: '0 4px 10px rgba(0, 86, 179, 0.25)',
                flexShrink: 0
              }}
            >
              {currentEmp.fullName ? currentEmp.fullName.trim().charAt(0).toUpperCase() : 'U'}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  {currentEmp.fullName}
                </h3>
                <span
                  style={{
                    backgroundColor: '#EFF6FF',
                    color: '#0056B3',
                    fontSize: '12px',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid #BFDBFE'
                  }}
                >
                  {currentEmp.employeeCode}
                </span>
                {currentEmp.departmentName && (
                  <span
                    style={{
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '6px'
                    }}
                  >
                    Phòng: {currentEmp.departmentName}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '12.5px', color: '#64748B' }}>
                  Ngày vào làm: <strong style={{ color: '#1E293B' }}>{currentEmp.startDate || 'Chưa cập nhật'}</strong>
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748B' }}>
                  Thâm niên công tác:{' '}
                  <strong style={{ color: '#0056B3' }}>
                    {currentEmp.tenureDisplay || `${currentEmp.tenureYears || 0} năm`}
                  </strong>
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748B' }}>
                  Mức phép năm theo thâm niên:{' '}
                  <strong style={{ color: (currentEmp.tenureYears || 0) >= 5 ? '#16A34A' : '#D97706' }}>
                    {(currentEmp.tenureYears || 0) >= 5 ? '13 ngày (≥ 5 năm)' : '12 ngày (< 5 năm)'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Hộp ngày công kỳ */}
          {currentPeriod && (
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '10px 16px',
                textAlign: 'right'
              }}
            >
              <div style={{ fontSize: '12px', color: '#64748B' }}>Khoảng thời gian tính công</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                {currentPeriod.fromDate} → {currentPeriod.toDate}
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                Chuẩn công tháng:{' '}
                <strong style={{ color: '#0056B3' }}>{currentPeriod.standardDays} công</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. 4 THẺ TỔNG HỢP CHỈ SỐ CHUYÊN CẦN (KPIS) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px'
        }}
      >
        {/* Thẻ 1: Tổng công tính lương */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: '#EFF6FF',
              color: '#0056B3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Công Tính Lương</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0056B3', marginTop: '2px' }}>
              {calculatedSummary.paidDays}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8' }}>
                {' '}
                / {currentPeriod?.standardDays ?? 26}
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
              Làm: <b>{calculatedSummary.workDays}</b> · Lễ: <b>{calculatedSummary.holidayDays}</b>
            </div>
          </div>
        </div>

        {/* Thẻ 2: Quỹ phép năm */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: '#FEF3C7',
              color: '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Wallet size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
              Tồn Phép (Tại T{data?.period?.month ?? leaveBalance?.month})
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: (leaveBalance?.available ?? 0) <= 0 ? '#DC2626' : '#16A34A', marginTop: '2px' }}>
              {leaveBalance?.available ?? 0}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8' }}> ngày</span>
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
              Đã dùng T{data?.period?.month ?? leaveBalance?.month}: <b>{leaveBalance?.monthUsed ?? calculatedSummary.annualLeaveDays}</b> · Tổng hưởng: <b>{leaveBalance?.totalEarned ?? leaveBalance?.totalOpening ?? 12}</b>
            </div>
          </div>
        </div>

        {/* Thẻ 3: Chế độ & Nghỉ phép */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: '#F3E8FF',
              color: '#7C3AED',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Coffee size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Nghỉ Phép Trong Kỳ</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#7C3AED', marginTop: '2px' }}>
              {calculatedSummary.totalLeaveDays}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8' }}> ngày</span>
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
              Phép năm: <b>{calculatedSummary.annualLeaveDays}</b> · Chế độ: <b>{calculatedSummary.paidLeaveDays}</b>
            </div>
          </div>
        </div>

        {/* Thẻ 4: Chuyên cần & Đi trễ */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: calculatedSummary.totalLateEarlyOccurrences > 0 ? '#FEE2E2' : '#DEF7EC',
              color: calculatedSummary.totalLateEarlyOccurrences > 0 ? '#DC2626' : '#16A34A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            {calculatedSummary.totalLateEarlyOccurrences > 0 ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Đi Trễ & Về Sớm</div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: 800,
                color: calculatedSummary.totalLateEarlyOccurrences > 0 ? '#DC2626' : '#16A34A',
                marginTop: '2px'
              }}
            >
              {calculatedSummary.totalLateEarlyOccurrences}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8' }}> lần</span>
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
              Trễ: <b>{calculatedSummary.lateArrivalCount} lần ({calculatedSummary.totalLateMinutes}p)</b> · Sớm: <b>{calculatedSummary.earlyDepartureCount} lần ({calculatedSummary.totalEarlyMinutes}p)</b>
            </div>
          </div>
        </div>
      </div>

      {/* 5. HỘP CHI TIẾT QUỸ PHÉP NĂM (LEAVE BALANCE BREAKDOWN) */}
      {leaveBalance && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '18px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Award size={18} color="#D97706" />
              <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Chi tiết Quỹ Phép Năm (Kỳ Tháng {data?.period?.month ?? leaveBalance.month}/{leaveBalance.year})
              </h4>
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748B' }}>
              Thâm niên: <strong>{currentEmp?.tenureDisplay || `${currentEmp?.tenureYears || 0} năm`}</strong> · Quy chế: <strong>+1 phép/tháng đủ ≥ 50% công</strong>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
              backgroundColor: '#F8FAFC',
              padding: '16px 20px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0'
            }}
          >
            {/* 1. Phép năm (Đầu kỳ) */}
            <div>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Phép năm (Đầu kỳ)</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                {leaveBalance.opening ?? (leaveBalance.annualOpening + (leaveBalance.carryOpening || 0))}
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748B' }}> ngày</span>
              </div>
              {leaveBalance.carryOpening > 0 && (
                <div style={{ fontSize: '10.5px', color: '#64748B' }}>Tồn cũ: +{leaveBalance.carryOpening}</div>
              )}
            </div>

            {/* 2. Tích lũy (Đến T...) */}
            <div style={{ backgroundColor: '#F0FDF4', padding: '6px 10px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
              <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>
                Tích lũy (Đến T{data?.period?.month ?? leaveBalance.month})
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
                +{leaveBalance.accrued ?? 0}
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#166534' }}> ngày</span>
              </div>
              <div style={{ fontSize: '10.5px', color: '#166534' }}>Đủ ≥ 50% công chuẩn</div>
            </div>

            {/* 3. Tổng phép hưởng */}
            <div style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '12px' }}>
              <div style={{ fontSize: '11px', color: '#0056B3', fontWeight: 700 }}>Tổng phép hưởng</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0056B3', marginTop: '4px' }}>
                {leaveBalance.totalEarned ?? leaveBalance.totalOpening}
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#0056B3' }}> ngày</span>
              </div>
              <div style={{ fontSize: '10.5px', color: '#64748B' }}>= Đầu kỳ + Tích lũy</div>
            </div>

            {/* 4. Đã dùng trong T... */}
            <div style={{ backgroundColor: '#FFFBEB', padding: '6px 10px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
              <div style={{ fontSize: '11px', color: '#92400E', fontWeight: 700 }}>
                Đã dùng trong T{data?.period?.month ?? leaveBalance.month}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
                {leaveBalance.monthUsed ?? summary?.annualLeaveDays ?? 0}
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#92400E' }}> ngày</span>
              </div>
              <div style={{ fontSize: '10.5px', color: '#92400E' }}>Lũy kế cả năm: {leaveBalance.used}</div>
            </div>

            {/* 5. Tồn phép (Tại T...) */}
            <div style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '12px' }}>
              <div style={{ fontSize: '11px', color: (leaveBalance.available <= 0) ? '#DC2626' : '#16A34A', fontWeight: 800 }}>
                Tồn phép (Tại T{data?.period?.month ?? leaveBalance.month})
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: (leaveBalance.available <= 0) ? '#DC2626' : '#16A34A',
                  marginTop: '4px'
                }}
              >
                {leaveBalance.available}
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748B' }}> ngày</span>
              </div>
              {leaveBalance.held > 0 && (
                <div style={{ fontSize: '10.5px', color: '#D97706' }}>Đang chờ duyệt: {leaveBalance.held}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. HỘP KHIẾU NẠI TRONG KỲ (NẾU CÓ) */}
      {disputes.length > 0 && (
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '16px',
            padding: '16px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <MessageSquare size={18} color="#0056B3" />
            <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#1E40AF', margin: 0 }}>
              Khiếu nại / Phản ánh của nhân viên trong kỳ công này ({disputes.length})
            </h4>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {disputes.map((d: TimesheetDisputeItem) => (
              <div
                key={d.disputeId}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #DBEAFE',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '13px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>
                    {d.workDate ? `Ngày: ${d.workDate}` : 'Toàn kỳ công'} · {d.createdAt}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: d.status === 'ACCEPTED' ? '#DEF7EC' : d.status === 'REJECTED' ? '#FDE8E8' : '#FEF3C7',
                      color: d.status === 'ACCEPTED' ? '#03543F' : d.status === 'REJECTED' ? '#9B1C1C' : '#92400E'
                    }}
                  >
                    {d.status === 'ACCEPTED' ? 'Đã chấp nhận' : d.status === 'REJECTED' ? 'Từ chối' : 'Chờ xử lý'}
                  </span>
                </div>
                <div style={{ color: '#334155' }}>
                  <strong>Nội dung:</strong> {d.content}
                </div>
                {d.hrResponse && (
                  <div style={{ marginTop: '4px', color: '#0056B3', fontSize: '12.5px' }}>
                    <strong>HCNS phản hồi:</strong> {d.hrResponse}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. BẢNG LỊCH CÔNG CHI TIẾT TỪNG NGÀY TRONG KỲ */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}
      >
        {/* Bộ lọc tab ngày */}
        <div
          className="no-print"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Chi tiết nhật ký quẹt thẻ & công theo từng ngày
            </h3>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0' }}>
              Hiển thị giờ vào, giờ ra, số phút trễ, phân loại ngày và ghi chú giải trình.
            </p>
          </div>

          <div style={{ display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`btn btn-sm ${filterType === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '5px 12px', fontSize: '12px', border: 'none' }}
            >
              Tất cả ({days.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('LATE')}
              className={`btn btn-sm ${filterType === 'LATE' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                border: 'none',
                color: filterType === 'LATE' ? '#FFFFFF' : lateCount > 0 ? '#DC2626' : undefined
              }}
            >
              Đi trễ / Sớm ({lateCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('LEAVE')}
              className={`btn btn-sm ${filterType === 'LEAVE' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '5px 12px', fontSize: '12px', border: 'none' }}
            >
              Nghỉ phép ({leaveCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('KP')}
              className={`btn btn-sm ${filterType === 'KP' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                border: 'none',
                color: filterType === 'KP' ? '#FFFFFF' : issueCount > 0 ? '#DC2626' : undefined
              }}
            >
              Không phép / Lỗi ({issueCount})
            </button>
          </div>
        </div>

        {/* Bảng dữ liệu */}
        <div className="table-container" style={{ border: 'none' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC' }}>
                <th style={{ width: '110px', textAlign: 'center' }}>Ngày</th>
                <th style={{ width: '100px' }}>Thứ</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Mã công</th>
                <th style={{ minWidth: '150px' }}>Tên mã / Trạng thái</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Giờ vào</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Giờ ra</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Phút trễ</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Phút sớm</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Công hưởng</th>
                <th style={{ minWidth: '180px' }}>Ghi chú / Điều chỉnh</th>
              </tr>
            </thead>
            <tbody>
              {filteredDays.length > 0 ? (
                filteredDays.map((d: TimesheetDayItem) => {
                  const isSunday = d.dayOfWeek === 'Chủ Nhật';
                  const isLate = d.isLate;
                  const isHoliday = d.leaveCategory === 'HOLIDAY';
                  const isAnnualLeave = d.leaveCategory === 'ANNUAL_LEAVE';
                  const isUnpaid = d.code === 'KP' || d.code === '?' || d.leaveCategory === 'UNPAID_LEAVE';

                  let rowBg = '#FFFFFF';
                  if (isSunday) rowBg = '#F8FAFC';
                  else if (isHoliday) rowBg = '#FEF9C3';
                  else if (isAnnualLeave) rowBg = '#FEF3C7';
                  else if (isUnpaid) rowBg = '#FEF2F2';
                  else if (isLate) rowBg = '#FFF1F2';

                  return (
                    <tr key={d.date} style={{ backgroundColor: rowBg }}>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: '#0F172A' }}>
                        {d.dateDisplay}
                      </td>
                      <td style={{ fontWeight: 600, color: isSunday ? '#DC2626' : '#475569' }}>
                        {d.dayOfWeek}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            fontSize: '12px',
                            color: '#FFFFFF',
                            backgroundColor: d.color || '#64748B'
                          }}
                        >
                          {d.code}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '13px' }}>
                          {d.codeName}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          {d.categoryLabel}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: isLate ? '#DC2626' : '#16A34A' }}>
                        {d.inTime || '-'}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                        {d.outTime || '-'}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: d.lateMinutes > 0 ? '#DC2626' : '#94A3B8' }}>
                        {d.lateMinutes > 0 ? `${d.lateMinutes}p` : '-'}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: d.earlyMinutes > 0 ? '#D97706' : '#94A3B8' }}>
                        {d.earlyMinutes > 0 ? `${d.earlyMinutes}p` : '-'}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 800, color: d.paidValue > 0 ? '#0056B3' : '#94A3B8' }}>
                        {d.paidValue}
                      </td>
                      <td>
                        {d.isManual && (
                          <div style={{ fontSize: '11.5px', color: '#D97706', fontWeight: 600 }}>
                            ⚡ Điều chỉnh tay {d.manualReason ? `: ${d.manualReason}` : ''}
                          </div>
                        )}
                        {d.hasDispute && (
                          <div style={{ fontSize: '11.5px', color: '#0056B3', fontWeight: 600, marginTop: '2px' }}>
                            💬 Có khiếu nại ({d.disputeStatus === 'ACCEPTED' ? 'Đã duyệt' : d.disputeStatus === 'REJECTED' ? 'Từ chối' : 'Chờ xử lý'})
                          </div>
                        )}
                        {!d.isManual && !d.hasDispute && (
                          <span style={{ fontSize: '12px', color: '#94A3B8' }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                    {loading ? 'Đang tải dữ liệu chấm công...' : 'Không có bản ghi nào phù hợp bộ lọc.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FOOTER CHỮ KÝ DÀNH CHO BẢN IN */}
      <div
        className="only-print"
        style={{
          display: 'none',
          marginTop: '30px',
          justifyContent: 'space-between',
          pageBreakInside: 'avoid'
        }}
      >
        <div style={{ textAlign: 'center', width: '200px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>Người lao động</div>
          <div style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>(Ký và ghi rõ họ tên)</div>
          <div style={{ height: '70px' }} />
          <div style={{ fontWeight: 600 }}>{currentEmp?.fullName}</div>
        </div>

        <div style={{ textAlign: 'center', width: '200px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>Phụ trách HCNS</div>
          <div style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>(Ký và ghi rõ họ tên)</div>
          <div style={{ height: '70px' }} />
          <div style={{ fontWeight: 600 }}>{user?.fullName || 'Bộ phận HCNS'}</div>
        </div>

        <div style={{ textAlign: 'center', width: '200px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>Giám đốc Đơn vị</div>
          <div style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>(Ký và đóng dấu)</div>
          <div style={{ height: '70px' }} />
        </div>
      </div>
    </div>
  );
};
