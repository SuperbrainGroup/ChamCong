import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  ChevronDown,
  RefreshCw,
  MessageSquare,
  ShieldCheck,
  Coffee,
  Sun,
  AlertCircle
} from 'lucide-react';
import { timesheetApi } from '../../api/client';
import type { PublishedTimesheetData, TimesheetDayItem, TimesheetPeriodItem } from '../../types';
import { useToast } from '../../context/ToastContext';

interface PersonalTimesheetViewProps {
  initialPeriodId?: number;
  isMobile?: boolean;
  onOpenDisputeModal?: (publicationId: number, date?: string) => void;
}

export const PersonalTimesheetView: React.FC<PersonalTimesheetViewProps> = ({
  initialPeriodId = 0,
  isMobile = false,
  onOpenDisputeModal
}) => {
  const { addToast } = useToast();
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(initialPeriodId);
  const [timesheet, setTimesheet] = useState<PublishedTimesheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'LEAVE' | 'LATE' | 'KP'>('ALL');

  // Khiếu nại nội bộ nếu không truyền onOpenDisputeModal
  const [showLocalDispute, setShowLocalDispute] = useState(false);
  const [disputeDate, setDisputeDate] = useState<string>('');
  const [disputeContent, setDisputeContent] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  // Tải dữ liệu bảng chấm công theo kỳ
  const fetchTimesheet = async (periodId: number) => {
    setLoading(true);
    try {
      const data = await timesheetApi.getMyTimesheet(periodId);
      setTimesheet(data);
      if (data.period?.id && data.period.id !== selectedPeriodId) {
        setSelectedPeriodId(data.period.id);
      }
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Không thể tải bảng chấm công cá nhân.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimesheet(initialPeriodId);
  }, [initialPeriodId]);

  const handlePeriodChange = (newPeriodId: number) => {
    setSelectedPeriodId(newPeriodId);
    fetchTimesheet(newPeriodId);
  };

  const handleDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timesheet?.publicationId && !timesheet?.period?.id) {
      addToast('Kỳ công này chưa có bản công bố để gửi khiếu nại.', 'warning');
      return;
    }
    if (!disputeContent.trim()) {
      addToast('Vui lòng nhập nội dung thắc mắc / khiếu nại.', 'warning');
      return;
    }

    setSubmittingDispute(true);
    try {
      const pubId = timesheet.publicationId || timesheet.period?.id || 0;
      await timesheetApi.submitDispute(pubId, disputeContent, disputeDate || undefined);
      addToast('Gửi khiếu nại thành công! HCNS sẽ phản hồi sớm nhất.', 'success');
      setShowLocalDispute(false);
      setDisputeContent('');
      setDisputeDate('');
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Gửi khiếu nại thất bại.', 'error');
    } finally {
      setSubmittingDispute(false);
    }
  };

  const days = timesheet?.days || [];

  // Lọc danh sách theo tab filter
  const filteredDays = days.filter((d: TimesheetDayItem) => {
    if (filterType === 'LEAVE') return d.isLeave || d.leaveCategory === 'ANNUAL_LEAVE' || d.leaveCategory === 'PAID_LEAVE';
    if (filterType === 'LATE') return d.isLate || d.isEarly;
    if (filterType === 'KP') return d.code === 'KP' || d.code === '?' || d.leaveCategory === 'UNPAID_LEAVE';
    return true;
  });

  const leaveCount = days.filter(d => d.isLeave || d.leaveCategory === 'ANNUAL_LEAVE' || d.leaveCategory === 'PAID_LEAVE').length;
  const lateCount = days.filter(d => d.isLate || d.isEarly).length;
  const issueCount = days.filter(d => d.code === 'KP' || d.code === '?' || d.leaveCategory === 'UNPAID_LEAVE').length;

  // Tính toán số liệu thống kê đầy đủ và chính xác từ dữ liệu kỳ công & danh sách ngày
  const calculatedSummary = React.useMemo(() => {
    const s = timesheet?.summary;
    const ds = timesheet?.days || [];

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
  }, [timesheet]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* 1. THANH TIÊU ĐỀ & CHỌN KỲ CÔNG */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '16px',
        padding: isMobile ? '16px' : '20px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#EFF6FF',
            color: '#0056B3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Calendar size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Bảng Chấm Công Cá Nhân
              </h2>
              {timesheet?.isClosed ? (
                <span style={{
                  backgroundColor: '#DCFCE7',
                  color: '#15803D',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <ShieldCheck size={13} />
                  ĐÃ CHỐT CÔNG
                </span>
              ) : (
                <span style={{
                  backgroundColor: '#FEF3C7',
                  color: '#B45309',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Clock size={13} />
                  ĐANG ĐỐI SOÁT
                </span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', marginBottom: 0 }}>
              {timesheet?.employee ? `${timesheet.employee.fullName} (${timesheet.employee.employeeCode})` : 'Dữ liệu chấm công chính thức'}
              {timesheet?.period?.closedAt && ` · Chốt ngày: ${timesheet.period.closedAt}`}
            </p>
          </div>
        </div>

        {/* BỘ CHỌN KỲ CÔNG & NÚT THAO TÁC */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
          <div style={{ position: 'relative', flex: isMobile ? 1 : 'unset' }}>
            <select
              value={selectedPeriodId}
              onChange={(e) => handlePeriodChange(Number(e.target.value))}
              disabled={loading}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                padding: '8px 34px 8px 12px',
                fontSize: '13px',
                fontWeight: 700,
                color: '#0F172A',
                cursor: 'pointer',
                outline: 'none',
                width: isMobile ? '100%' : 'auto',
                minWidth: '180px'
              }}
            >
              {timesheet?.availablePeriods && timesheet.availablePeriods.length > 0 ? (
                timesheet.availablePeriods.map((p: TimesheetPeriodItem) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              ) : (
                <option value={0}>Tháng hiện tại</option>
              )}
            </select>
            <ChevronDown
              size={16}
              color="#64748B"
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
          </div>

          <button
            type="button"
            onClick={() => fetchTimesheet(selectedPeriodId)}
            disabled={loading}
            style={{
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              padding: '8px',
              color: '#475569',
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Tải lại bảng công"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>

          <button
            type="button"
            onClick={() => {
              if (onOpenDisputeModal && (timesheet?.publicationId || timesheet?.period?.id)) {
                onOpenDisputeModal(timesheet.publicationId || timesheet.period?.id || 0);
              } else {
                setShowLocalDispute(true);
              }
            }}
            style={{
              backgroundColor: '#E31837',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <MessageSquare size={14} />
            Khiếu nại
          </button>
        </div>
      </div>

      {/* 2. 4 THẺ CHỈ SỐ QUAN TRỌNG: CÔNG LƯƠNG - PHÉP NĂM CÒN LẠI - NGÀY PHÉP - ĐI TRỄ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: '12px'
      }}>
        {/* Card 1: Tổng công tính lương */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '14px 16px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Tổng công tính lương
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0056B3', marginTop: '4px' }}>
            {calculatedSummary.paidDays}
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginLeft: '4px' }}>
              / {timesheet?.period?.standardDays ?? 26} công
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#16A34A', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Làm: <b>{calculatedSummary.workDays}</b> · Lễ: <b>{calculatedSummary.holidayDays}</b>
          </div>
        </div>

        {/* Card 2: Quỹ phép năm còn lại (Đặc biệt theo yêu cầu) */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1.5px solid #0D9488',
          borderRadius: '12px',
          padding: '14px 16px',
          boxShadow: '0 2px 8px rgba(13, 148, 136, 0.08)'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F766E', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Sun size={13} color="#0D9488" />
            Tồn phép (Tại T{timesheet?.period?.month ?? timesheet?.leaveBalance?.month})
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: (timesheet?.leaveBalance?.available ?? 0) <= 0 ? '#DC2626' : '#0F766E', marginTop: '4px' }}>
            {timesheet?.leaveBalance?.available ?? 0}
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginLeft: '4px' }}>ngày</span>
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Đã dùng: <b>{timesheet?.leaveBalance?.monthUsed || calculatedSummary.annualLeaveDays || 0}</b> · Tổng hưởng: <b>{timesheet?.leaveBalance?.totalEarned ?? timesheet?.leaveBalance?.totalOpening ?? 12}</b>
          </div>
        </div>

        {/* Card 3: Số ngày nghỉ phép trong kỳ */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '14px 16px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Coffee size={13} color="#D97706" />
            Nghỉ phép trong tháng
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
            {calculatedSummary.totalLeaveDays}
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginLeft: '4px' }}>ngày</span>
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Phép năm: <b>{calculatedSummary.annualLeaveDays}</b> · Chế độ: <b>{calculatedSummary.paidLeaveDays}</b>
          </div>
        </div>

        {/* Card 4: Tình trạng đi trễ / về sớm */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '14px 16px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={13} color="#DC2626" />
            Đi trễ / Về sớm
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: calculatedSummary.totalLateEarlyOccurrences > 0 ? '#DC2626' : '#16A34A', marginTop: '4px' }}>
            {calculatedSummary.totalLateEarlyOccurrences}
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginLeft: '4px' }}>lần</span>
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Trễ: <b>{calculatedSummary.lateArrivalCount} lần ({calculatedSummary.totalLateMinutes}p)</b> · Sớm: <b>{calculatedSummary.earlyDepartureCount} lần ({calculatedSummary.totalEarlyMinutes}p)</b>
          </div>
        </div>
      </div>

      {/* 2.5 HỘP CHI TIẾT QUỸ PHÉP NĂM */}
      {timesheet?.leaveBalance && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '14px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sun size={15} color="#0D9488" />
              Chi tiết Quỹ Phép Năm (Kỳ Tháng {timesheet.period?.month ?? timesheet.leaveBalance.month}/{timesheet.leaveBalance.year})
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748B' }}>
              Quy chế: +1 phép/tháng đủ ≥ 50% ngày công
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px',
            backgroundColor: '#F8FAFC',
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0'
          }}>
            <div>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Phép năm (Đầu kỳ)</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                {timesheet.leaveBalance.opening ?? (timesheet.leaveBalance.annualOpening + (timesheet.leaveBalance.carryOpening || 0))} ngày
              </div>
            </div>
            <div style={{ backgroundColor: '#F0FDF4', padding: '4px 8px', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>
                Tích lũy (Đến T{timesheet.period?.month ?? timesheet.leaveBalance.month})
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#16A34A', marginTop: '2px' }}>
                +{timesheet.leaveBalance.accrued ?? 0} ngày
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#0056B3', fontWeight: 700 }}>Tổng phép hưởng</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0056B3', marginTop: '2px' }}>
                {timesheet.leaveBalance.totalEarned ?? timesheet.leaveBalance.totalOpening} ngày
              </div>
            </div>
            <div style={{ backgroundColor: '#FFFBEB', padding: '4px 8px', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#92400E', fontWeight: 700 }}>
                Đã dùng trong T{timesheet.period?.month ?? timesheet.leaveBalance.month}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#D97706', marginTop: '2px' }}>
                {timesheet.leaveBalance.monthUsed ?? timesheet.summary?.annualLeaveDays ?? 0} ngày
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: (timesheet.leaveBalance.available <= 0) ? '#DC2626' : '#16A34A', fontWeight: 800 }}>
                Tồn phép (Tại T{timesheet.period?.month ?? timesheet.leaveBalance.month})
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: (timesheet.leaveBalance.available <= 0) ? '#DC2626' : '#16A34A', marginTop: '2px' }}>
                {timesheet.leaveBalance.available} ngày
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. BẢNG CHI TIẾT TỪNG NGÀY TRONG KỲ */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '16px',
        padding: isMobile ? '16px' : '20px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        {/* THANH LỌC NHANH (TẤT CẢ - PHÉP - TRỄ - KHÔNG PHÉP) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
            CHI TIẾT CHẤM CÔNG HÀNG NGÀY ({filteredDays.length} / {days.length} ngày)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              style={{
                backgroundColor: filterType === 'ALL' ? '#0056B3' : '#F1F5F9',
                color: filterType === 'ALL' ? '#FFFFFF' : '#475569',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Tất cả ({days.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('LEAVE')}
              style={{
                backgroundColor: filterType === 'LEAVE' ? '#D97706' : '#FEF3C7',
                color: filterType === 'LEAVE' ? '#FFFFFF' : '#92400E',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🌿 Ngày phép ({leaveCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('LATE')}
              style={{
                backgroundColor: filterType === 'LATE' ? '#DC2626' : '#FEE2E2',
                color: filterType === 'LATE' ? '#FFFFFF' : '#991B1B',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ⚠️ Đi trễ ({lateCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('KP')}
              style={{
                backgroundColor: filterType === 'KP' ? '#475569' : '#F1F5F9',
                color: filterType === 'KP' ? '#FFFFFF' : '#475569',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ❓ Không phép / Cần xem ({issueCount})
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#0056B3' }}>
            <RefreshCw size={24} className="spin" style={{ display: 'inline', marginBottom: 8 }} />
            <div>Đang tải bảng chấm công chi tiết...</div>
          </div>
        ) : filteredDays.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: '#94A3B8', fontSize: '13px' }}>
            Không có ngày nào phù hợp với bộ lọc đã chọn.
          </div>
        ) : isMobile ? (
          /* GIAO DIỆN DẠNG CARD CHO MOBILE */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredDays.map((item: TimesheetDayItem) => {
              const isSunday = item.dayOfWeek === 'Chủ Nhật';
              return (
                <div
                  key={item.date}
                  style={{
                    backgroundColor: item.isLate ? '#FFF5F5' : item.isLeave ? '#FFFDF5' : item.code === 'KP' ? '#FEF2F2' : isSunday ? '#F8FAFC' : '#FFFFFF',
                    border: `1px solid ${item.isLate ? '#FECACA' : item.isLeave ? '#FDE68A' : item.code === 'KP' ? '#FCA5A5' : '#E2E8F0'}`,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        color: isSunday ? '#DC2626' : '#0F172A'
                      }}>
                        {item.dateDisplay} ({item.dayOfWeek})
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        backgroundColor: item.color || '#F1F5F9',
                        color: '#FFFFFF',
                        fontWeight: 800,
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        textShadow: '0 1px 1px rgba(0,0,0,0.2)'
                      }}>
                        {item.code}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: item.paidValue > 0 ? '#16A34A' : '#94A3B8' }}>
                        +{item.paidValue} công
                      </span>
                    </div>
                  </div>

                  {/* Giờ vào & Giờ ra */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                    <div style={{ color: '#64748B' }}>
                      Giờ quẹt: <b style={{ color: item.inTime ? '#16A34A' : '#94A3B8' }}>{item.inTime || '—'}</b> → <b style={{ color: item.outTime ? '#0056B3' : '#94A3B8' }}>{item.outTime || '—'}</b>
                    </div>
                    {item.workedMinutes > 0 && (
                      <span style={{ color: '#475569', fontSize: '11px' }}>
                        Làm: {Math.floor(item.workedMinutes / 60)}h{item.workedMinutes % 60}p
                      </span>
                    )}
                  </div>

                  {/* Badges Phép & Đi trễ */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {item.isLate && (
                      <span style={{ backgroundColor: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        ⚠️ Trễ {item.lateMinutes} phút
                      </span>
                    )}
                    {item.isEarly && (
                      <span style={{ backgroundColor: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        ⚠️ Về sớm {item.earlyMinutes} phút
                      </span>
                    )}
                    {item.isLeave && (
                      <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        🌿 {item.categoryLabel}
                      </span>
                    )}
                    {item.code === 'KP' && (
                      <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        ❌ Không phép
                      </span>
                    )}
                    {item.isManual && (
                      <span style={{ backgroundColor: '#EDE9FE', color: '#6D28D9', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                        ✍️ Đã sửa tay {item.manualReason ? `(${item.manualReason})` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* GIAO DIỆN BẢNG RỘNG DÀNH CHO DESKTOP */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '12px 14px', width: '60px' }}>Ngày</th>
                  <th style={{ padding: '12px 14px', width: '110px' }}>Thứ</th>
                  <th style={{ padding: '12px 14px', width: '130px' }}>Giờ vào</th>
                  <th style={{ padding: '12px 14px', width: '130px' }}>Giờ ra</th>
                  <th style={{ padding: '12px 14px', width: '160px' }}>Mã & Phân loại</th>
                  <th style={{ padding: '12px 14px', width: '180px' }}>Đi trễ / Về sớm</th>
                  <th style={{ padding: '12px 14px', width: '120px' }}>Công tính</th>
                  <th style={{ padding: '12px 14px' }}>Ghi chú / Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filteredDays.map((item: TimesheetDayItem) => {
                  const isSunday = item.dayOfWeek === 'Chủ Nhật';
                  return (
                    <tr
                      key={item.date}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: item.isLate ? '#FFFBFB' : item.isLeave ? '#FFFDF7' : isSunday ? '#F8FAFC' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>
                        {item.dateDisplay}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: isSunday ? '#DC2626' : '#64748B' }}>
                        {item.dayOfWeek}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: item.inTime ? '#16A34A' : '#94A3B8' }}>
                        {item.inTime || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: item.outTime ? '#0056B3' : '#94A3B8' }}>
                        {item.outTime || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            backgroundColor: item.color || '#475569',
                            color: '#FFFFFF',
                            fontWeight: 800,
                            fontSize: '11px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            minWidth: '28px',
                            textAlign: 'center'
                          }}>
                            {item.code}
                          </span>
                          <span style={{ fontSize: '12px', color: '#1E293B', fontWeight: 600 }}>
                            {item.categoryLabel}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {item.isLate ? (
                          <span style={{
                            backgroundColor: '#FEE2E2',
                            color: '#DC2626',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            ⚠️ Trễ {item.lateMinutes} phút
                          </span>
                        ) : item.isEarly ? (
                          <span style={{
                            backgroundColor: '#FEF3C7',
                            color: '#D97706',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            Sớm {item.earlyMinutes} phút
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '12px' }}>Đúng giờ</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 800, color: item.paidValue > 0 ? '#16A34A' : '#94A3B8' }}>
                        +{item.paidValue} công
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748B', fontSize: '12px' }}>
                        {item.isOutOfEmployment ? (
                          <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Chưa vào làm / Đã thôi việc</span>
                        ) : item.isManual ? (
                          <span style={{ color: '#6D28D9', fontWeight: 600 }}>✍️ {item.manualReason || 'HCNS hiệu chỉnh'}</span>
                        ) : item.isLeave ? (
                          <span style={{ color: '#92400E', fontWeight: 600 }}>🌿 Nghỉ phép ({item.codeName})</span>
                        ) : (
                          <span>Bình thường</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. MODAL KHIẾU NẠI BẢNG CHẤM CÔNG */}
      {showLocalDispute && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={18} color="#E31837" />
                Khiếu nại bảng chấm công
              </div>
              <button
                type="button"
                onClick={() => setShowLocalDispute(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleDisputeSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Kỳ công khiếu nại
                </label>
                <input
                  type="text"
                  disabled
                  value={`Tháng ${timesheet?.period?.month}/${timesheet?.period?.year} (Mã kỳ: #${timesheet?.period?.id})`}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#F1F5F9', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Ngày có nghi vấn (Không bắt buộc)
                </label>
                <input
                  type="date"
                  value={disputeDate}
                  onChange={(e) => setDisputeDate(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Nội dung thắc mắc / Đề nghị HCNS kiểm tra *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Ví dụ: Ngày 15/10 em có quẹt thẻ ra về lúc 17:35 nhưng bảng công báo thiếu giờ ra hoặc bị tính trễ..."
                  value={disputeContent}
                  onChange={(e) => setDisputeContent(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowLocalDispute(false)}
                  style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submittingDispute}
                  style={{ backgroundColor: '#E31837', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 700, cursor: submittingDispute ? 'wait' : 'pointer' }}
                >
                  {submittingDispute ? 'Đang gửi...' : 'Gửi khiếu nại tới HCNS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
