import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { schedulesApi } from '../../api/client';
import { WorkSchedule } from '../../types';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Plus,
  AlertCircle,
  HelpCircle,
  LayoutGrid,
  ListFilter,
  Check,
  X,
  Building2,
  Briefcase,
  Laptop,
  Sparkles,
  Info
} from 'lucide-react';

interface EmployeeScheduleViewProps {
  onBack?: () => void;
}

interface CompanyCalendarDayItem {
  id: number;
  date: string;
  dayType: number;
  halfSession?: string;
  companyOffCode?: string;
  note?: string;
}

export const EmployeeScheduleView: React.FC<EmployeeScheduleViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  const { addToast } = useToast();

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth() + 1);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [companyCalendar, setCompanyCalendar] = useState<CompanyCalendarDayItem[]>([]);
  const [employeeInfo, setEmployeeInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Chế độ chọn nhiều ngày để đăng ký (Batch select)
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [batchShift, setBatchShift] = useState<'FULL' | 'MORNING' | 'AFTERNOON'>('FULL');
  const [batchNote, setBatchNote] = useState<string>('');
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Modal xem / hủy chi tiết ngày đã đăng ký
  const [viewingSchedule, setViewingSchedule] = useState<WorkSchedule | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Tải dữ liệu lịch tháng
  const fetchMonthSchedules = async () => {
    setLoading(true);
    try {
      const from = new Date(currentYear, currentMonth - 1, 1);
      const to = new Date(currentYear, currentMonth, 0);

      const fromStr = `${from.getFullYear()}-${String(currentMonth).padStart(2, '0')}-01`;
      const toStr = `${to.getFullYear()}-${String(currentMonth).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`;

      const res = await schedulesApi.getMySchedules(fromStr, toStr);
      setSchedules(res.schedules || []);
      setCompanyCalendar(res.companyCalendar || []);
      if (res.employee) setEmployeeInfo(res.employee);
    } catch (err: any) {
      console.error('Lỗi tải lịch làm việc:', err);
      addToast(err.response?.data?.message || 'Không thể tải lịch làm việc cá nhân.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthSchedules();
    setSelectedDates([]);
  }, [currentYear, currentMonth]);

  // Điều hướng tháng
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const handleGoToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
  };

  // Map ngày đã đăng ký theo dateStr (YYYY-MM-DD)
  const schedulesByDate = useMemo(() => {
    const map: Record<string, WorkSchedule> = {};
    schedules.forEach(s => {
      const key = s.workDate.split('T')[0];
      if (s.status === 'REGISTERED') {
        map[key] = s;
      }
    });
    return map;
  }, [schedules]);

  // Map lịch công ty (Lễ, nghỉ tuần, làm nửa ngày)
  const companyCalByDate = useMemo(() => {
    const map: Record<string, CompanyCalendarDayItem> = {};
    companyCalendar.forEach(c => {
      const key = c.date.split('T')[0];
      map[key] = c;
    });
    return map;
  }, [companyCalendar]);

  // Thống kê tháng
  const monthStats = useMemo(() => {
    let fullCount = 0;
    let morningCount = 0;
    let afternoonCount = 0;

    Object.values(schedulesByDate).forEach(s => {
      const d = s.workDate.split('T')[0];
      const [y, m] = d.split('-').map(Number);
      if (y === currentYear && m === currentMonth) {
        if (s.shiftCode === 'MORNING') morningCount++;
        else if (s.shiftCode === 'AFTERNOON') afternoonCount++;
        else fullCount++;
      }
    });

    const totalDays = fullCount + (morningCount + afternoonCount) * 0.5;

    return {
      totalRegistered: fullCount + morningCount + afternoonCount,
      fullCount,
      morningCount,
      afternoonCount,
      totalDays
    };
  }, [schedulesByDate, currentYear, currentMonth]);

  // Lưới Calendar Grid 7 cột (Thứ Hai -> Chủ Nhật)
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const totalDays = lastDay.getDate();

    let startDayOfWeek = firstDay.getDay();
    if (startDayOfWeek === 0) startDayOfWeek = 7;

    const leadingEmptyCells = startDayOfWeek - 1;
    const cells: Array<{
      dayNumber: number;
      dateStr: string;
      isPast: boolean;
      isToday: boolean;
      schedule?: WorkSchedule;
      companyDay?: CompanyCalendarDayItem;
    } | null> = [];

    for (let i = 0; i < leadingEmptyCells; i++) {
      cells.push(null);
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isPast = dateStr < todayStr;
      const isToday = dateStr === todayStr;

      cells.push({
        dayNumber: d,
        dateStr,
        isPast,
        isToday,
        schedule: schedulesByDate[dateStr],
        companyDay: companyCalByDate[dateStr]
      });
    }

    return cells;
  }, [currentYear, currentMonth, schedulesByDate, companyCalByDate, todayStr]);

  const currentEmpType = employeeInfo?.employeeType || user?.employeeType || 'STANDARD';
  const isEligibleForSchedule = currentEmpType === 'PARTTIME' || currentEmpType === 'REMOTE' || user?.role !== 'Employee';

  // Toggle chọn ngày để đăng ký theo Batch
  const handleToggleSelectDate = (dateStr: string) => {
    if (!isEligibleForSchedule) {
      addToast('Chức năng đăng ký lịch làm việc chỉ mở cho nhân sự Part-time hoặc Remote. Nhân viên Chuẩn (Full-time) làm việc theo ca quy định của công ty.', 'warning');
      return;
    }

    if (dateStr < todayStr) {
      addToast('Không thể chọn ngày đã qua. Quy tắc: Phải đăng ký lịch trước ngày làm việc.', 'warning');
      return;
    }

    setSelectedDates(prev => {
      if (prev.includes(dateStr)) {
        return prev.filter(d => d !== dateStr);
      } else {
        return [...prev, dateStr].sort();
      }
    });
  };

  // Chọn nhanh tất cả các ngày làm việc khả dụng trong tháng
  const handleSelectAllWorkingDays = () => {
    if (!isEligibleForSchedule) {
      addToast('Chức năng đăng ký lịch làm việc chỉ áp dụng cho nhân sự Part-time hoặc Remote.', 'warning');
      return;
    }

    const availableDates = calendarGrid
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .filter(c => !c.isPast && !c.schedule && c.companyDay?.dayType !== 3 && c.companyDay?.dayType !== 4)
      .map(c => c.dateStr);

    if (availableDates.length === 0) {
      addToast('Không còn ngày làm việc nào khả dụng trong tháng để chọn.', 'info');
      return;
    }

    setSelectedDates(availableDates);
  };

  // Xác nhận đăng ký các ngày đã chọn
  const handleConfirmBatchRegister = async () => {
    if (selectedDates.length === 0) {
      addToast('Vui lòng chọn ít nhất một ngày để đăng ký.', 'warning');
      return;
    }

    setSubmittingBatch(true);
    try {
      const res = await schedulesApi.register({
        dates: selectedDates,
        shiftCode: batchShift,
        note: batchNote.trim() || undefined
      });

      addToast(res.message || `Đã đăng ký thành công ${selectedDates.length} ngày làm việc!`, 'success');
      setSelectedDates([]);
      setBatchNote('');
      fetchMonthSchedules();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi đăng ký lịch làm việc.', 'error');
    } finally {
      setSubmittingBatch(false);
    }
  };

  // Hủy đăng ký ngày làm việc
  const handleCancelSchedule = async (scheduleId: number, dateStr: string) => {
    if (dateStr < todayStr) {
      addToast('Không thể hủy lịch làm việc của ngày đã qua.', 'warning');
      return;
    }

    const confirmed = window.confirm(`Bạn có chắc chắn muốn hủy lịch làm việc ngày ${dateStr.split('-').reverse().join('/')}?`);
    if (!confirmed) return;

    setCancellingId(scheduleId);
    try {
      const res = await schedulesApi.cancel(scheduleId);
      addToast(res.message || 'Đã hủy lịch làm việc thành công.', 'success');
      setViewingSchedule(null);
      fetchMonthSchedules();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Không thể hủy lịch làm việc.', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const getShiftBadge = (shiftCode: string) => {
    switch (shiftCode) {
      case 'MORNING':
        return { label: 'Ca sáng (08h-12h)', color: '#0369A1', bg: '#E0F2FE', border: '#BAE6FD' };
      case 'AFTERNOON':
        return { label: 'Ca chiều (13h-17h)', color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' };
      default:
        return { label: 'Cả ngày (08h-17h)', color: '#166534', bg: '#DCFCE7', border: '#BBF7D0' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1400px', margin: '0 auto', paddingBottom: '80px' }}>
      {/* 1. TOP HEADER CARD */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(37,99,235,0.15)'
            }}
          >
            <CalendarIcon size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Đăng Ký Chỗ Làm & Lịch Làm Việc
              </h1>
              {employeeInfo && (
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: employeeInfo.employeeType === 'PARTTIME' ? '#FEF3C7' : (employeeInfo.employeeType === 'REMOTE' ? '#E0F2FE' : '#F1F5F9'),
                    color: employeeInfo.employeeType === 'PARTTIME' ? '#92400E' : (employeeInfo.employeeType === 'REMOTE' ? '#0369A1' : '#475569')
                  }}
                >
                  {employeeInfo.employeeType === 'PARTTIME' ? 'Nhân sự Part-time' : (employeeInfo.employeeType === 'REMOTE' ? 'Nhân sự Remote' : 'Nhân sự Tiêu chuẩn')}
                </span>
              )}
            </div>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '3px' }}>
              Chọn ngày trực quan trên lịch để đăng ký ca làm, đăng ký chỗ làm việc hoặc hỗ trợ hội sở.
            </div>
          </div>
        </div>

        {/* BỘ ĐIỀU HƯỚNG THÁNG & VIEW SWITCH */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* View mode */}
          <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: viewMode === 'grid' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'grid' ? '#0F172A' : '#64748B',
                boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <LayoutGrid size={14} />
              <span>Dạng Lịch</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: viewMode === 'table' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'table' ? '#0F172A' : '#64748B',
                boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <ListFilter size={14} />
              <span>Dạng Bảng</span>
            </button>
          </div>

          {/* Month selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '2px 4px' }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              style={{ background: 'none', border: 'none', padding: '6px 8px', cursor: 'pointer', color: '#475569', borderRadius: '4px' }}
              title="Tháng trước"
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', minWidth: '125px', textAlign: 'center' }}>
              Tháng {String(currentMonth).padStart(2, '0')} / {currentYear}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              style={{ background: 'none', border: 'none', padding: '6px 8px', cursor: 'pointer', color: '#475569', borderRadius: '4px' }}
              title="Tháng sau"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoToday}
            style={{
              padding: '7px 12px',
              fontSize: '12.5px',
              fontWeight: 700,
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            Hôm nay
          </button>

          <button
            type="button"
            onClick={fetchMonthSchedules}
            disabled={loading}
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              color: '#334155',
              cursor: 'pointer'
            }}
            title="Làm mới"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2. STATS & SUMMARY BANNER */}
      {!isEligibleForSchedule && (
        <div
          style={{
            backgroundColor: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            color: '#92400E'
          }}
        >
          <AlertCircle size={24} color="#D97706" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '14px' }}>
              Quy chế: Chức năng đăng ký lịch làm việc chỉ áp dụng cho Nhân sự Part-time hoặc Remote
            </div>
            <div style={{ fontSize: '13px', marginTop: '2px', color: '#B45309' }}>
              Bạn đang được thiết lập là <strong>Nhân sự Tiêu chuẩn (Full-time)</strong>, làm việc theo ca quy định chuẩn của công ty. Giao diện này đang hiển thị ở chế độ xem lịch công ty (không hỗ trợ đăng ký lịch tự chọn).
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px'
        }}
      >
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Đã đăng ký Tháng {currentMonth}</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0056B3', marginTop: '4px' }}>
            {monthStats.totalRegistered}
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}> ngày ({monthStats.totalDays} công)</span>
          </div>
          <div style={{ fontSize: '11px', color: '#16A34A', marginTop: '2px', fontWeight: 600 }}>
            ✓ Đã xác nhận trên hệ thống
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Ca Cả Ngày (08:00 - 17:00)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
            {monthStats.fullCount}
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}> ngày</span>
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
            Ca tiêu chuẩn 1.0 công
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Ca Sáng / Ca Chiều</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
            {monthStats.morningCount + monthStats.afternoonCount}
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}> buổi</span>
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
            Sáng: {monthStats.morningCount} · Chiều: {monthStats.afternoonCount} (0.5 công/buổi)
          </div>
        </div>

        <div style={{ backgroundColor: '#EFF6FF', borderRadius: '12px', border: '1px solid #BFDBFE', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#1E40AF' }}>
            <Info size={15} />
            <span>Quy Chế Đăng Ký Lịch Làm</span>
          </div>
          <div style={{ fontSize: '12px', color: '#1E3A8A', marginTop: '6px', lineHeight: '1.5' }}>
            • Chỉ mở cho nhân viên Part-time hoặc Remote.<br />
            • Bắt buộc đăng ký trước ngày làm việc (không được đăng ký lùi ngày).
          </div>
        </div>
      </div>

      {/* 3. BẢNG ĐIỀU KHIỂN CHỌN NHANH */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#475569' }}>
          <span><strong>Hướng dẫn chọn ngày:</strong></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#EFF6FF', border: '1px solid #2563EB', display: 'inline-block' }}></span>
            Đang chọn
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#F0FDF4', border: '1px solid #16A34A', display: 'inline-block' }}></span>
            Đã đăng ký
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', display: 'inline-block' }}></span>
            Chưa đăng ký
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isEligibleForSchedule && (
            <button
              type="button"
              onClick={handleSelectAllWorkingDays}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: '#F1F5F9',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              ⚡ Chọn tất cả ngày làm còn lại
            </button>
          )}
          {selectedDates.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedDates([])}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: '#FEE2E2',
                border: '1px solid #FCA5A5',
                borderRadius: '6px',
                color: '#991B1B',
                cursor: 'pointer'
              }}
            >
              ✕ Bỏ chọn ({selectedDates.length})
            </button>
          )}
        </div>
      </div>

      {/* 4. CHẾ ĐỘ XEM LỊCH (CALENDAR GRID) */}
      {viewMode === 'grid' && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          {/* Thứ trong tuần */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '8px', textAlign: 'center' }}>
            {['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'].map((dayName, idx) => (
              <div
                key={dayName}
                style={{
                  padding: '10px 4px',
                  fontWeight: 800,
                  fontSize: '13px',
                  color: idx === 6 ? '#DC2626' : (idx === 5 ? '#D97706' : '#334155'),
                  backgroundColor: idx === 6 ? '#FEF2F2' : (idx === 5 ? '#FFFBEB' : '#F8FAFC'),
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0'
                }}
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Ô ngày trong tháng */}
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 10px auto', display: 'block', color: '#2563EB' }} />
              Đang tải lịch Tháng {currentMonth}/{currentYear}...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
              {calendarGrid.map((cell, idx) => {
                if (!cell) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      style={{
                        minHeight: '115px',
                        backgroundColor: '#F8FAFC',
                        borderRadius: '10px',
                        border: '1px dashed #E2E8F0',
                        opacity: 0.4
                      }}
                    />
                  );
                }

                const { dayNumber, dateStr, isPast, isToday, schedule, companyDay } = cell;
                const isSelected = selectedDates.includes(dateStr);
                const isHoliday = companyDay && (companyDay.dayType === 4 || companyDay.dayType === 5);
                const isWeeklyOff = companyDay && companyDay.dayType === 3;
                const isHalfWork = companyDay && companyDay.dayType === 2;

                const shiftInfo = schedule ? getShiftBadge(schedule.shiftCode) : null;

                // Border & Background style
                let cellBg = '#FFFFFF';
                let cellBorder = '1px solid #E2E8F0';

                if (isSelected) {
                  cellBg = '#EFF6FF';
                  cellBorder = '2px solid #2563EB';
                } else if (schedule) {
                  cellBg = '#F0FDF4';
                  cellBorder = '1.5px solid #86EFAC';
                } else if (isPast) {
                  cellBg = '#F8FAFC';
                  cellBorder = '1px solid #E2E8F0';
                } else if (isHoliday) {
                  cellBg = '#FEF2F2';
                  cellBorder = '1px solid #FECACA';
                } else if (isWeeklyOff) {
                  cellBg = '#F8FAFC';
                }

                return (
                  <div
                    key={dateStr}
                    onClick={() => {
                      if (schedule) {
                        setViewingSchedule(schedule);
                      } else if (!isPast) {
                        handleToggleSelectDate(dateStr);
                      }
                    }}
                    style={{
                      minHeight: '115px',
                      backgroundColor: cellBg,
                      border: cellBorder,
                      borderRadius: '10px',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      cursor: isPast && !schedule ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 4px 10px rgba(37,99,235,0.15)' : (schedule ? '0 1px 3px rgba(22,163,74,0.1)' : 'none')
                    }}
                    title={
                      isPast
                        ? `Ngày ${dayNumber}/${currentMonth}: Đã qua ngày`
                        : schedule
                          ? `Đã đăng ký ca: ${shiftInfo?.label}. Nhấp để xem chi tiết / hủy`
                          : `Nhấp để chọn đăng ký ngày ${dayNumber}/${currentMonth}`
                    }
                  >
                    {/* Header ngày */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '15px',
                            fontWeight: isToday || isSelected || schedule ? 800 : 700,
                            color: isPast ? '#94A3B8' : (isToday ? '#2563EB' : (schedule ? '#166534' : '#0F172A')),
                            backgroundColor: isToday ? '#DBEAFE' : 'transparent',
                            width: isToday ? '26px' : 'auto',
                            height: isToday ? '26px' : 'auto',
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {dayNumber}
                        </span>

                        {isToday && (
                          <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563EB', backgroundColor: '#EFF6FF', padding: '1px 5px', borderRadius: '4px' }}>
                            Hôm nay
                          </span>
                        )}
                      </div>

                      {/* Checkbox khi chọn */}
                      {!isPast && !schedule && (
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '4px',
                            border: isSelected ? '2px solid #2563EB' : '1.5px solid #CBD5E1',
                            backgroundColor: isSelected ? '#2563EB' : '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF'
                          }}
                        >
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                      )}
                    </div>

                    {/* Nội dung trạng thái */}
                    <div style={{ margin: '6px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {/* Lịch công ty */}
                      {isHoliday && (
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', backgroundColor: '#FEE2E2', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          🎉 {companyDay.note || 'Nghỉ Lễ'}
                        </div>
                      )}

                      {isHalfWork && !isHoliday && (
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#D97706', backgroundColor: '#FEF3C7', padding: '1px 5px', borderRadius: '4px' }}>
                          0.5 công T7
                        </div>
                      )}

                      {/* ĐÃ ĐĂNG KÝ */}
                      {schedule && shiftInfo && (
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: shiftInfo.color,
                            backgroundColor: shiftInfo.bg,
                            border: `1px solid ${shiftInfo.border}`,
                            padding: '3px 6px',
                            borderRadius: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} />
                            <span>{shiftInfo.label.split(' ')[0]} {shiftInfo.label.split(' ')[1]}</span>
                          </div>
                          {schedule.note && (
                            <div style={{ fontSize: '10px', fontWeight: 500, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              📍 {schedule.note}
                            </div>
                          )}
                        </div>
                      )}

                      {/* CHƯA ĐĂNG KÝ VÀ LÀ NGÀY TRONG TƯƠNG LAI */}
                      {!schedule && !isPast && !isSelected && (
                        <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', padding: '4px 0', border: '1px dashed #CBD5E1', borderRadius: '6px' }}>
                          + Bấm để đăng ký
                        </div>
                      )}

                      {/* ĐANG ĐƯỢC CHỌN */}
                      {isSelected && (
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', textAlign: 'center', padding: '4px 0', backgroundColor: '#DBEAFE', borderRadius: '6px' }}>
                          ✓ Đang chọn
                        </div>
                      )}
                    </div>

                    {/* Footer nhỏ */}
                    <div style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'right' }}>
                      {schedule && !isPast && (
                        <span style={{ color: '#0056B3', fontWeight: 600 }}>Chi tiết ➔</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. CHẾ ĐỘ XEM BẢNG (TABLE VIEW) */}
      {viewMode === 'table' && (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 700, fontSize: '14px', color: '#0F172A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Danh sách các ngày đã đăng ký trong Tháng {currentMonth}/{currentYear} ({monthStats.totalRegistered} ngày)</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', width: '60px' }}>STT</th>
                  <th style={{ padding: '12px 16px', width: '130px' }}>Ngày làm việc</th>
                  <th style={{ padding: '12px 16px', width: '160px' }}>Ca đăng ký</th>
                  <th style={{ padding: '12px 16px' }}>Chỗ làm việc / Ghi chú</th>
                  <th style={{ padding: '12px 16px', width: '130px' }}>Trạng thái</th>
                  <th style={{ padding: '12px 16px', width: '100px', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                      Chưa có lịch làm việc nào được đăng ký trong tháng này.
                    </td>
                  </tr>
                ) : (
                  schedules.map((s, idx) => {
                    const dStr = s.workDate.split('T')[0];
                    const isPast = dStr < todayStr;
                    const shift = getShiftBadge(s.shiftCode);

                    return (
                      <tr key={s.scheduleId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', color: '#94A3B8' }}>{idx + 1}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                          {dStr.split('-').reverse().join('/')}
                          {dStr === todayStr && (
                            <span style={{ marginLeft: '6px', fontSize: '10px', color: '#2563EB', backgroundColor: '#EFF6FF', padding: '1px 5px', borderRadius: '4px' }}>
                              Hôm nay
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: shift.color,
                              backgroundColor: shift.bg,
                              border: `1px solid ${shift.border}`,
                              padding: '2px 8px',
                              borderRadius: '6px'
                            }}
                          >
                            {shift.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {s.note ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <MapPin size={13} color="#0056B3" />
                              <span>{s.note}</span>
                            </span>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>Mặc định hội sở</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {isPast ? (
                            <span style={{ fontSize: '11px', color: '#64748B', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                              Đã hoàn thành
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', backgroundColor: '#F0FDF4', padding: '2px 6px', borderRadius: '4px' }}>
                              Sắp diễn ra
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {!isPast && (
                            <button
                              type="button"
                              onClick={() => handleCancelSchedule(s.scheduleId, dStr)}
                              disabled={cancellingId === s.scheduleId}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                color: '#DC2626',
                                backgroundColor: '#FEF2F2',
                                border: '1px solid #FECACA',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                              title="Hủy lịch này"
                            >
                              Hủy
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. FLOATING BATCH REGISTRATION BAR KHI CÓ NGÀY ĐƯỢC CHỌN */}
      {selectedDates.length > 0 && isEligibleForSchedule && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '92%',
            maxWidth: '900px',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            borderRadius: '16px',
            padding: '16px 24px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.3)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '13px'
                }}
              >
                {selectedDates.length}
              </span>
              <span style={{ fontWeight: 800, fontSize: '15px' }}>
                Đang chọn {selectedDates.length} ngày làm việc trong Tháng {currentMonth}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedDates([])}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '13px'
              }}
            >
              <X size={16} /> Bỏ chọn
            </button>
          </div>

          {/* Form chọn Ca & Chỗ làm */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
            {/* Chọn ca */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                Ca làm việc
              </label>
              <select
                value={batchShift}
                onChange={e => setBatchShift(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1E293B',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700
                }}
              >
                <option value="FULL">Cả ngày (08:00 - 17:00)</option>
                <option value="MORNING">Ca sáng (08:00 - 12:00)</option>
                <option value="AFTERNOON">Ca chiều (13:00 - 17:00)</option>
              </select>
            </div>

            {/* Chỗ làm / Ghi chú */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                Chỗ làm việc / Ghi chú
              </label>
              <input
                type="text"
                placeholder="VD: Văn phòng Hội sở, Chi nhánh Tân Bình..."
                value={batchNote}
                onChange={e => setBatchNote(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1E293B',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#FFFFFF',
                  fontSize: '13px'
                }}
              />
            </div>

            {/* Nút hành động */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginTop: '18px' }}>
              <button
                type="button"
                onClick={handleConfirmBatchRegister}
                disabled={submittingBatch}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: submittingBatch ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {submittingBatch ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} strokeWidth={3} />
                    <span>Xác nhận đăng ký {selectedDates.length} ngày</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Gợi ý tag nhanh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11px', color: '#94A3B8' }}>
            <span>Gợi ý chỗ làm nhanh:</span>
            {['Văn phòng Hội sở', 'Chi nhánh', 'Làm việc từ xa (Remote)', 'Dạy lớp Part-time'].map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => setBatchNote(tag)}
                style={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  color: '#CBD5E1',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 7. MODAL XEM CHI TIẾT / HỦY NGÀY ĐÃ ĐĂNG KÝ */}
      {viewingSchedule && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
          onClick={() => setViewingSchedule(null)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '450px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} color="#16A34A" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Chi Tiết Lịch Làm Việc
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingSchedule(null)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ color: '#64748B' }}>Ngày làm việc:</span>
                <span style={{ fontWeight: 800, color: '#0F172A' }}>
                  {viewingSchedule.workDate.split('T')[0].split('-').reverse().join('/')}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ color: '#64748B' }}>Ca đăng ký:</span>
                <span style={{ fontWeight: 700, color: '#16A34A' }}>
                  {getShiftBadge(viewingSchedule.shiftCode).label}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ color: '#64748B' }}>Chỗ làm / Ghi chú:</span>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>
                  {viewingSchedule.note || 'Mặc định hội sở'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ color: '#64748B' }}>Thời gian đăng ký:</span>
                <span style={{ color: '#475569' }}>
                  {new Date(viewingSchedule.registeredAtUtc).toLocaleString('vi-VN')}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setViewingSchedule(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Đóng
              </button>

              {viewingSchedule.workDate.split('T')[0] >= todayStr && (
                <button
                  type="button"
                  onClick={() => handleCancelSchedule(viewingSchedule.scheduleId, viewingSchedule.workDate.split('T')[0])}
                  disabled={cancellingId === viewingSchedule.scheduleId}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#FEF2F2',
                    color: '#DC2626',
                    border: '1px solid #FECACA',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: cancellingId === viewingSchedule.scheduleId ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 size={15} />
                  <span>{cancellingId === viewingSchedule.scheduleId ? 'Đang hủy...' : 'Hủy lịch ngày này'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
