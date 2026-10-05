import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { CalendarDay, AttendanceCode } from '../../types';
import { api } from '../../api/client';
import {
  Calendar as CalendarIcon,
  RefreshCw,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CalendarPlus,
  HelpCircle,
  X,
  LayoutGrid,
  ListFilter,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface CalendarManagerProps {
  onBack?: () => void;
}

const DAY_TYPES = [
  { value: 1, label: 'Làm cả ngày (Work)', badgeClass: 'badge-success', desc: 'Ngày làm việc bình thường theo ca quy định (1.0 công)' },
  { value: 2, label: 'Làm nửa ngày (HalfWork)', badgeClass: 'badge-warning', desc: 'Thường áp dụng cho Thứ Bảy buổi sáng (0.5 công)' },
  { value: 3, label: 'Nghỉ tuần (WeeklyOff)', badgeClass: 'badge-neutral', desc: 'Ngày nghỉ cuối tuần (Chủ Nhật hoặc Thứ Hai)' },
  { value: 4, label: 'Nghỉ Lễ (Holiday)', badgeClass: 'badge-danger', desc: 'Hưởng 100% lương lễ theo Luật LĐ (Mã L - 1.0 công)' },
  { value: 6, label: 'Nghỉ công ty (CompanyOff)', badgeClass: 'badge-primary', desc: 'Du lịch, teambuilding, nghỉ đột xuất' }
];

export const CalendarManager: React.FC<CalendarManagerProps> = () => {
  const { selectedCompany } = useAuth();
  const toast = useToast();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth() + 1);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [codes, setCodes] = useState<AttendanceCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Edit / Add Holiday Modal
  const [editingDay, setEditingDay] = useState<CalendarDay | null>(null);
  const [showAddHolidayModal, setShowAddHolidayModal] = useState(false);
  const [editDateStr, setEditDateStr] = useState('');
  const [editDayType, setEditDayType] = useState<number>(4); // Default to Holiday when adding
  const [editHalfSession, setEditHalfSession] = useState<'AM' | 'PM'>('AM');
  const [editShiftStart, setEditShiftStart] = useState('');
  const [editShiftEnd, setEditShiftEnd] = useState('');
  const [editCompanyOffCode, setEditCompanyOffCode] = useState('L');
  const [editNote, setEditNote] = useState('');
  const [savingDay, setSavingDay] = useState(false);

  // Batch Generate Modal
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchYear, setBatchYear] = useState<number>(today.getFullYear());
  const [workScheduleType, setWorkScheduleType] = useState<string>('STANDARD_T2_T6_T7_HALF');
  const [mondayPolicy, setMondayPolicy] = useState<string>('FULL');
  const [tuesdayPolicy, setTuesdayPolicy] = useState<string>('FULL');
  const [wednesdayPolicy, setWednesdayPolicy] = useState<string>('FULL');
  const [thursdayPolicy, setThursdayPolicy] = useState<string>('FULL');
  const [fridayPolicy, setFridayPolicy] = useState<string>('FULL');
  const [saturdayPolicy, setSaturdayPolicy] = useState<string>('HALF');
  const [sundayPolicy, setSundayPolicy] = useState<string>('OFF');
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(true);
  const [generating, setGenerating] = useState(false);

  // Fetch codes for CompanyOff dropdown
  useEffect(() => {
    if (!selectedCompany) return;
    api.get<AttendanceCode[]>(`/companies/${selectedCompany.id}/codes`)
      .then(res => setCodes(res.data))
      .catch(console.error);
  }, [selectedCompany?.id]);

  const fetchCalendar = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    setMessage(null);
    try {
      const from = new Date(currentYear, currentMonth - 1, 1);
      const to = new Date(currentYear, currentMonth, 0);
      const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;
      const toStr = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`;

      const res = await api.get<CalendarDay[]>(`/companies/${selectedCompany.id}/calendar?from=${fromStr}&to=${toStr}`);
      setDays(res.data);
    } catch (err: any) {
      console.error(err);
      setMessage({ text: err.response?.data?.message || 'Không thể tải lịch làm việc.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
  }, [selectedCompany?.id, currentYear, currentMonth]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleOpenEdit = (d: CalendarDay) => {
    setEditingDay(d);
    setEditDateStr(d.date.substring(0, 10));
    setEditDayType(d.dayType);
    setEditHalfSession((d.halfSession as 'AM' | 'PM') || 'AM');
    setEditShiftStart(d.shiftStartText || '');
    setEditShiftEnd(d.shiftEndText || '');
    setEditCompanyOffCode(d.companyOffCode || 'L');
    setEditNote(d.note || '');
  };

  const handleOpenAddHoliday = () => {
    const defaultDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    setEditingDay(null);
    setEditDateStr(defaultDate);
    setEditDayType(4); // Holiday
    setEditHalfSession('AM');
    setEditShiftStart('');
    setEditShiftEnd('');
    setEditCompanyOffCode('L');
    setEditNote('');
    setShowAddHolidayModal(true);
  };

  const handleApplyHolidayPreset = (dateIso: string, holidayName: string) => {
    setEditDateStr(dateIso);
    setEditDayType(4);
    setEditNote(holidayName);
  };

  const handleSaveDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !editDateStr) return;
    setSavingDay(true);
    setMessage(null);

    try {
      await api.post(`/companies/${selectedCompany.id}/calendar/save-day`, {
        date: editDateStr,
        dayType: editDayType,
        halfSession: editDayType === 2 ? editHalfSession : null,
        shiftStartTime: editShiftStart.trim() || null,
        shiftEndTime: editShiftEnd.trim() || null,
        companyOffCode: editDayType === 6 ? (editCompanyOffCode.trim().toUpperCase() || 'CT') : null,
        note: editNote.trim() || null
      });

      const savedDate = new Date(editDateStr);
      const succMsg = `Đã lưu thiết lập cho ngày ${savedDate.toLocaleDateString('vi-VN')} thành công!`;
      setMessage({ text: succMsg, type: 'success' });
      toast.success(succMsg);
      setEditingDay(null);
      setShowAddHolidayModal(false);

      if (savedDate.getFullYear() !== currentYear || savedDate.getMonth() + 1 !== currentMonth) {
        setCurrentYear(savedDate.getFullYear());
        setCurrentMonth(savedDate.getMonth() + 1);
      } else {
        fetchCalendar();
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể lưu ngày.';
      setMessage({ text: errMsg, type: 'error' });
      toast.error(errMsg);
    } finally {
      setSavingDay(false);
    }
  };

  const handleBatchGenerate = async () => {
    if (!selectedCompany) return;
    setGenerating(true);
    setMessage(null);
    try {
      const res = await api.post(`/companies/${selectedCompany.id}/calendar/batch-generate`, {
        year: batchYear,
        workScheduleType,
        mondayPolicy,
        tuesdayPolicy,
        wednesdayPolicy,
        thursdayPolicy,
        fridayPolicy,
        saturdayPolicy,
        sundayPolicy,
        overwriteExisting
      });
      const succMsg = res.data.message || 'Khởi tạo thành công!';
      setMessage({ text: succMsg, type: 'success' });
      toast.success(succMsg);
      setShowBatchModal(false);
      setCurrentYear(batchYear);
      fetchCalendar();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Lỗi khi khởi tạo lịch.';
      setMessage({ text: errMsg, type: 'error' });
      toast.error(errMsg);
    } finally {
      setGenerating(false);
    }
  };

  const getDayTypeName = (type: number) => {
    const item = DAY_TYPES.find(t => t.value === type);
    return item ? item.label : 'Khác';
  };

  const getDayTypeBadge = (type: number) => {
    const item = DAY_TYPES.find(t => t.value === type);
    return item?.badgeClass || 'badge-neutral';
  };

  // Helper map days by date string (YYYY-MM-DD)
  const daysByDate = React.useMemo(() => {
    const map: Record<string, CalendarDay> = {};
    days.forEach(d => {
      const key = d.date.substring(0, 10);
      map[key] = d;
    });
    return map;
  }, [days]);

  // Generate calendar grid cells (Monday to Sunday)
  const calendarGrid = React.useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const totalDays = lastDay.getDate();

    // Monday is 1, Sunday is 7 (getDay(): Sunday is 0, so convert 0 -> 7)
    let startDayOfWeek = firstDay.getDay();
    if (startDayOfWeek === 0) startDayOfWeek = 7; // Monday = 1 ... Sunday = 7

    const leadingEmptyCells = startDayOfWeek - 1; // Number of blank cells before day 1

    const cells: Array<{ dayNumber: number; dateStr: string; day?: CalendarDay } | null> = [];
    for (let i = 0; i < leadingEmptyCells; i++) {
      cells.push(null);
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateStr,
        day: daysByDate[dateStr]
      });
    }

    return cells;
  }, [currentYear, currentMonth, daysByDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header Card */}
      <div className="card">
        <div
          className="card-body"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            padding: '1.25rem 1.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '10px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CalendarIcon size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Quản lý Lịch Làm Việc & Nghỉ Lễ — {selectedCompany?.name}
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                Cấu hình mô hình làm việc (T2-T7, T3-CN, Thứ 7 cách tuần), ngày lễ và số công chuẩn
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* View Mode Switcher */}
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px', marginRight: '6px' }}>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid size={14} />
                <span>Dạng Lịch</span>
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                onClick={() => setViewMode('table')}
              >
                <ListFilter size={14} />
                <span>Dạng Bảng</span>
              </button>
            </div>

            <button
              className="btn btn-primary btn-sm"
              onClick={handleOpenAddHoliday}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CalendarPlus size={15} />
              <span>Thiết lập Ngày Nghỉ Lễ</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setBatchYear(currentYear);
                setShowBatchModal(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Sparkles size={15} color="#d97706" />
              <span>Khởi tạo lịch năm tự động</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={fetchCalendar}
              disabled={loading}
              title="Làm mới dữ liệu"
              style={{ width: '32px', height: '32px', padding: 0 }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Banner nghiệp vụ */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '8px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          fontSize: '13px',
          color: '#1e3a8a',
          lineHeight: '1.6',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px'
        }}
      >
        <HelpCircle size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong>Cơ chế tự động hóa:</strong> Khi một ngày được gắn nhãn <strong>"Nghỉ Lễ (Holiday)"</strong>, hệ thống tự động gán mã <code>L</code> (1.0 công nghỉ lễ hưởng 100% lương theo Luật Lao động) cho toàn bộ nhân sự khi chạy <em>Tính công</em> mà không cần quẹt thẻ. Nếu nhân sự đi làm thực tế ngày lễ, hệ thống tự động cộng thêm phụ cấp công làm ngày Lễ (+300% lương).
        </div>
      </div>

      {message && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            backgroundColor: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`
          }}
        >
          {message.text}
        </div>
      )}

      {/* Month Navigator Bar */}
      <div className="card">
        <div
          className="card-body"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrevMonth} title="Tháng trước" style={{ width: '32px', height: '32px', padding: 0 }}>
              <ChevronLeft size={16} />
            </button>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', minWidth: '150px', textAlign: 'center' }}>
              Tháng {currentMonth} / {currentYear}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleNextMonth} title="Tháng sau" style={{ width: '32px', height: '32px', padding: 0 }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="badge badge-danger" style={{ fontSize: '11px' }}>Nghỉ Lễ</span>
              <span>1.0 công (Mã L)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="badge badge-warning" style={{ fontSize: '11px' }}>Nửa ngày</span>
              <span>0.5 công</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="badge badge-neutral" style={{ fontSize: '11px' }}>Nghỉ tuần</span>
              <span>Chủ nhật / T7 / T2</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="badge badge-success" style={{ fontSize: '11px' }}>Làm cả ngày</span>
              <span>1.0 công</span>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW 1: DẠNG LỊCH THÁNG (CALENDAR GRID VIEW) */}
      {viewMode === 'grid' && (
        <div className="card" style={{ padding: '16px' }}>
          {/* Header 7 thứ trong tuần */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '8px', textAlign: 'center' }}>
            {['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'].map((dayName, idx) => (
              <div
                key={dayName}
                style={{
                  padding: '8px 4px',
                  fontWeight: 800,
                  fontSize: '13px',
                  color: idx === 6 ? '#dc2626' : (idx === 5 ? '#d97706' : '#334155'),
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0'
                }}
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Grid Cells */}
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 10px auto', display: 'block', color: '#2563eb' }} />
              Đang tải lịch tháng {currentMonth}/{currentYear}...
            </div>
          ) : days.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
              Chưa có lịch cho tháng {currentMonth}/{currentYear}. Nhấn <strong>"Khởi tạo lịch năm tự động"</strong> để tạo nhanh theo mô hình của hội sở bạn.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
              {calendarGrid.map((cell, idx) => {
                if (!cell) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      style={{
                        minHeight: '105px',
                        backgroundColor: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px dashed #e2e8f0',
                        opacity: 0.5
                      }}
                    />
                  );
                }

                const d = cell.day;
                const isHoliday = d && (d.dayType === 4 || d.dayType === 5);
                const isCompanyOff = d && d.dayType === 6;
                const isHalfWork = d && d.dayType === 2;
                const isWeeklyOff = d && d.dayType === 3;

                let cellBg = '#ffffff';
                let borderColor = '#e2e8f0';
                if (isHoliday) {
                  cellBg = '#fff1f2';
                  borderColor = '#fecdd3';
                } else if (isCompanyOff) {
                  cellBg = '#eff6ff';
                  borderColor = '#bfdbfe';
                } else if (isHalfWork) {
                  cellBg = '#fffbeb';
                  borderColor = '#fde68a';
                } else if (isWeeklyOff) {
                  cellBg = '#f8fafc';
                  borderColor = '#e2e8f0';
                }

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => {
                      if (d) handleOpenEdit(d);
                      else {
                        setEditingDay(null);
                        setEditDateStr(cell.dateStr);
                        setEditDayType(1);
                        setShowAddHolidayModal(true);
                      }
                    }}
                    style={{
                      minHeight: '105px',
                      backgroundColor: cellBg,
                      border: `1px solid ${borderColor}`,
                      borderRadius: '8px',
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isHoliday ? '0 1px 3px rgba(225,29,72,0.1)' : 'none'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                    title="Nhấn để xem hoặc hiệu chỉnh chế độ ngày này"
                  >
                    <div>
                      {/* Top: Day number & Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          style={{
                            fontSize: '15px',
                            fontWeight: 800,
                            color: isHoliday ? '#e11d48' : '#0f172a'
                          }}
                        >
                          {cell.dayNumber}
                        </span>

                        {d && (
                          <span className={`badge ${getDayTypeBadge(d.dayType)}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                            {isHoliday ? 'Nghỉ Lễ' : (isHalfWork ? 'Nửa ngày' : (isWeeklyOff ? 'Nghỉ tuần' : (isCompanyOff ? 'Nghỉ C.Ty' : 'Làm cả ngày')))}
                          </span>
                        )}
                      </div>

                      {/* Middle: Shift Time or Code */}
                      {d && (
                        <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>
                          {isHoliday ? (
                            <span style={{ fontWeight: 700, color: '#e11d48' }}>Mã L (1.0 công)</span>
                          ) : isCompanyOff ? (
                            <span style={{ fontWeight: 700, color: '#2563eb' }}>Mã {d.companyOffCode || 'CT'}</span>
                          ) : isHalfWork ? (
                            <span style={{ fontWeight: 600, color: '#d97706' }}>
                              {d.halfSession === 'PM' ? 'Chiều (0.5 công)' : 'Sáng (0.5 công)'}
                            </span>
                          ) : isWeeklyOff ? (
                            <span style={{ color: '#94a3b8' }}>Nghỉ tuần</span>
                          ) : (
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>Cả ngày (1.0)</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom: Note / Title */}
                    {d && d.note && (
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: isHoliday ? 700 : 500,
                          color: isHoliday ? '#be123c' : '#475569',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: '4px'
                        }}
                        title={d.note}
                      >
                        {d.note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: DẠNG BẢNG CHI TIẾT (TABLE VIEW) */}
      {viewMode === 'table' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Ngày</th>
                <th style={{ width: '110px' }}>Thứ</th>
                <th style={{ width: '190px' }}>Chế độ làm việc</th>
                <th style={{ width: '100px' }}>Buổi làm</th>
                <th style={{ width: '150px' }}>Khung giờ ca</th>
                <th style={{ width: '120px' }}>Mã công quy đổi</th>
                <th>Ghi chú</th>
                <th style={{ textAlign: 'center', width: '80px' }}>Sửa</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#2563eb' }} />
                    Đang tải lịch làm việc tháng {currentMonth}/{currentYear}...
                  </td>
                </tr>
              ) : days.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    Chưa có lịch cho tháng {currentMonth}/{currentYear}. Nhấn <strong>"Khởi tạo lịch năm tự động"</strong> ở trên để tạo nhanh.
                  </td>
                </tr>
              ) : (
                days.map((d) => {
                  const dateObj = new Date(d.date);
                  const dayOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][dateObj.getDay()];
                  const isSunday = dateObj.getDay() === 0;
                  const isSaturday = dateObj.getDay() === 6;
                  const isHoliday = d.dayType === 4 || d.dayType === 5;
                  const isCompanyOff = d.dayType === 6;

                  let rowBg = 'transparent';
                  if (isHoliday) rowBg = '#fff1f2';
                  else if (isCompanyOff) rowBg = '#eff6ff';
                  else if (isSunday) rowBg = '#f8fafc';
                  else if (isSaturday) rowBg = '#fffbeb';

                  return (
                    <tr
                      key={d.id}
                      style={{ backgroundColor: rowBg, cursor: 'pointer' }}
                      onClick={() => handleOpenEdit(d)}
                    >
                      <td style={{ fontWeight: 700, color: isHoliday ? '#e11d48' : '#0f172a' }}>
                        {dateObj.toLocaleDateString('vi-VN')}
                      </td>
                      <td style={{ fontWeight: 600, color: isHoliday ? '#e11d48' : (isSunday ? '#dc2626' : (isSaturday ? '#d97706' : '#334155')) }}>
                        {dayOfWeek}
                      </td>
                      <td>
                        <span className={`badge ${getDayTypeBadge(d.dayType)}`} style={{ fontWeight: 700 }}>
                          {getDayTypeName(d.dayType)}
                        </span>
                      </td>
                      <td style={{ color: '#475569' }}>
                        {d.dayType === 2 ? (d.halfSession === 'PM' ? 'Chiều (0.5)' : 'Sáng (0.5)') : (d.dayType === 1 ? 'Cả ngày (1.0)' : '-')}
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                        {d.shiftStartText && d.shiftEndText
                          ? `${d.shiftStartText} - ${d.shiftEndText}`
                          : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Theo khối NV</span>}
                      </td>
                      <td>
                        {isHoliday ? (
                          <span className="badge badge-danger" style={{ fontWeight: 800 }}>L (Lễ 1.0 công)</span>
                        ) : isCompanyOff ? (
                          <span className="badge badge-primary" style={{ fontWeight: 800 }}>{d.companyOffCode || 'CT'}</span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </td>
                      <td style={{ color: isHoliday ? '#be123c' : '#475569', fontWeight: isHoliday ? 600 : 400 }}>
                        {d.note || '-'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(d);
                          }}
                          title="Hiệu chỉnh ngày này"
                        >
                          <Edit2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal 1: Hiệu chỉnh / Thêm ngày Nghỉ Lễ */}
      {(editingDay || showAddHolidayModal) && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div>
                <h2 className="card-title" style={{ margin: 0, fontSize: '15px' }}>
                  {editingDay ? `Hiệu chỉnh Lịch: ${new Date(editDateStr).toLocaleDateString('vi-VN')}` : 'Thiết Lập Ngày Nghỉ Lễ & Chế Độ Công'}
                </h2>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Xác định ngày làm việc hoặc ngày nghỉ lễ tự động tính công cho nhân sự
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditingDay(null);
                  setShowAddHolidayModal(false);
                }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveDay}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Ngày áp dụng (*)</label>
                  <input
                    type="date"
                    required
                    value={editDateStr}
                    onChange={(e) => setEditDateStr(e.target.value)}
                    className="form-control"
                    style={{ fontWeight: 600 }}
                  />
                </div>

                {/* Gợi ý ngày Lễ Quốc gia */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                    Chọn nhanh các ngày Lễ chính thức năm {currentYear}:
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      onClick={() => handleApplyHolidayPreset(`${currentYear}-01-01`, 'Tết Dương Lịch')}
                    >
                      01/01 Tết Dương Lịch
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      onClick={() => handleApplyHolidayPreset(`${currentYear}-04-30`, 'Giải phóng miền Nam (30/4)')}
                    >
                      30/04 Giải phóng
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      onClick={() => handleApplyHolidayPreset(`${currentYear}-05-01`, 'Quốc tế Lao động (1/5)')}
                    >
                      01/05 Quốc tế LĐ
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      onClick={() => handleApplyHolidayPreset(`${currentYear}-09-02`, 'Quốc khánh (2/9)')}
                    >
                      02/09 Quốc Khánh
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Chế độ & Phân loại ngày (*)</label>
                  <select
                    className="form-control"
                    value={editDayType}
                    onChange={(e) => setEditDayType(Number(e.target.value))}
                    style={{ fontWeight: 600 }}
                  >
                    {DAY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label} — {t.desc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Hướng dẫn khi chọn Nghỉ Lễ */}
                {editDayType === 4 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#fff1f2',
                      border: '1px solid #fecdd3',
                      fontSize: '12px',
                      color: '#be123c',
                      lineHeight: '1.5'
                    }}
                  >
                    <strong>Chế độ Nghỉ Lễ:</strong> Tự động tính <strong>1.0 công (Mã L)</strong> hưởng nguyên lương cho toàn bộ nhân sự khi chạy tính công. Nhân viên đi làm hôm đó sẽ được hưởng thêm phụ cấp làm ngày lễ (+300%).
                  </div>
                )}

                {/* Hướng dẫn khi chọn Nghỉ Công ty */}
                {editDayType === 6 && (
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Mã ký hiệu chấm công quy đổi (*)</label>
                    <select
                      className="form-control"
                      value={editCompanyOffCode}
                      onChange={(e) => setEditCompanyOffCode(e.target.value)}
                    >
                      <option value="L">L - Nghỉ Lễ (Hưởng 1.0 công)</option>
                      <option value="CT">CT - Công tác (Hưởng 1.0 công)</option>
                      <option value="RO">RO - Nghỉ chế độ / Du lịch (Hưởng 1.0 công)</option>
                      {codes.filter(c => c.code !== 'L' && c.code !== 'CT' && c.code !== 'RO').map(c => (
                        <option key={c.id} value={c.code}>
                          {c.code} - {c.name} (Hưởng {c.workValue} công)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {editDayType === 2 && (
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Buổi làm việc</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        type="button"
                        className={`btn ${editHalfSession === 'AM' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setEditHalfSession('AM')}
                      >
                        Buổi Sáng (0.5 công)
                      </button>
                      <button
                        type="button"
                        className={`btn ${editHalfSession === 'PM' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setEditHalfSession('PM')}
                      >
                        Buổi Chiều (0.5 công)
                      </button>
                    </div>
                  </div>
                )}

                {(editDayType === 1 || editDayType === 2) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px' }}>Giờ vào ca (Tùy chọn)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="08:00"
                        value={editShiftStart}
                        onChange={(e) => setEditShiftStart(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px' }}>Giờ ra ca (Tùy chọn)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="17:00"
                        value={editShiftEnd}
                        onChange={(e) => setEditShiftEnd(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Ghi chú / Tên ngày nghỉ</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ví dụ: Nghỉ Tết Dương Lịch, Du lịch hè công ty..."
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingDay(null);
                    setShowAddHolidayModal(false);
                  }}
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingDay}>
                  {savingDay ? 'Đang lưu...' : 'Lưu thiết lập'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Khởi tạo lịch năm tự động với các mô hình linh hoạt */}
      {showBatchModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#d97706" />
                <span>Khởi Tạo Lịch Năm Tự Động Cho Hội Sở</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBatchModal(false)}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>Năm cần tạo lịch (*)</label>
                <input
                  type="number"
                  min="2020"
                  max="2035"
                  className="form-control"
                  value={batchYear}
                  onChange={(e) => setBatchYear(parseInt(e.target.value) || currentYear)}
                  style={{ fontWeight: 800, width: '120px' }}
                />
              </div>

              {/* Mô hình làm việc */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>Chọn mẫu gợi ý áp dụng nhanh</label>
                <select
                  className="form-control"
                  value={workScheduleType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setWorkScheduleType(val);
                    if (val === 'MON_TO_SAT_FULL') {
                      setMondayPolicy('FULL');
                      setTuesdayPolicy('FULL');
                      setWednesdayPolicy('FULL');
                      setThursdayPolicy('FULL');
                      setFridayPolicy('FULL');
                      setSaturdayPolicy('FULL');
                      setSundayPolicy('OFF');
                    } else if (val === 'MON_TO_FRI_FULL') {
                      setMondayPolicy('FULL');
                      setTuesdayPolicy('FULL');
                      setWednesdayPolicy('FULL');
                      setThursdayPolicy('FULL');
                      setFridayPolicy('FULL');
                      setSaturdayPolicy('OFF');
                      setSundayPolicy('OFF');
                    } else if (val === 'T2_T6_T7_ALTERNATE') {
                      setMondayPolicy('FULL');
                      setTuesdayPolicy('FULL');
                      setWednesdayPolicy('FULL');
                      setThursdayPolicy('FULL');
                      setFridayPolicy('FULL');
                      setSaturdayPolicy('ALTERNATE_OFF');
                      setSundayPolicy('OFF');
                    } else if (val === 'T3_CN_FULL') {
                      setMondayPolicy('OFF');
                      setTuesdayPolicy('FULL');
                      setWednesdayPolicy('FULL');
                      setThursdayPolicy('FULL');
                      setFridayPolicy('FULL');
                      setSaturdayPolicy('FULL');
                      setSundayPolicy('FULL');
                    } else if (val === 'T3_CN_T7_HALF') {
                      setMondayPolicy('OFF');
                      setTuesdayPolicy('FULL');
                      setWednesdayPolicy('FULL');
                      setThursdayPolicy('FULL');
                      setFridayPolicy('FULL');
                      setSaturdayPolicy('HALF');
                      setSundayPolicy('FULL');
                    } else if (val === 'STANDARD_T2_T6_T7_HALF') {
                      setMondayPolicy('FULL');
                      setTuesdayPolicy('FULL');
                      setWednesdayPolicy('FULL');
                      setThursdayPolicy('FULL');
                      setFridayPolicy('FULL');
                      setSaturdayPolicy('HALF');
                      setSundayPolicy('OFF');
                    }
                  }}
                  style={{ fontWeight: 700, padding: '8px 12px' }}
                >
                  <option value="STANDARD_T2_T6_T7_HALF">
                    1. Thứ 2 - Thứ 6 cả ngày, Thứ 7 nửa ngày sáng, Chủ Nhật nghỉ
                  </option>
                  <option value="MON_TO_SAT_FULL">
                    2. Thứ 2 - Thứ 7 làm cả ngày, Chủ Nhật nghỉ
                  </option>
                  <option value="MON_TO_FRI_FULL">
                    3. Thứ 2 - Thứ 6 làm cả ngày, Thứ 7 & Chủ Nhật nghỉ
                  </option>
                  <option value="T2_T6_T7_ALTERNATE">
                    4. Thứ 2 - Thứ 6 cả ngày, Thứ 7 nghỉ cách tuần (tuần làm, tuần nghỉ)
                  </option>
                  <option value="T3_CN_FULL">
                    5. Thứ 3 - Chủ Nhật làm cả ngày, Thứ 2 nghỉ tuần
                  </option>
                  <option value="T3_CN_T7_HALF">
                    6. Thứ 3 - Thứ 7 cả ngày, Chủ Nhật làm nửa ngày, Thứ 2 nghỉ tuần
                  </option>
                  <option value="CUSTOM">
                    7. Tùy chỉnh tự do theo từng ngày bên dưới...
                  </option>
                </select>
              </div>

              {/* Cài đặt chế độ theo từng ngày từ Thứ 2 đến Chủ Nhật */}
              <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1.5px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>
                    Cài đặt chế độ chi tiết theo từng ngày (Thứ 2 → Chủ Nhật):
                  </span>
                  <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                    {workScheduleType === 'CUSTOM' ? 'Đang tùy chỉnh riêng' : 'Theo mẫu đã chọn'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {/* Thứ Hai */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                      Thứ Hai
                    </label>
                    <select
                      className="form-control"
                      value={mondayPolicy}
                      onChange={(e) => { setMondayPolicy(e.target.value); setWorkScheduleType('CUSTOM'); }}
                      style={{ fontSize: '12.5px', fontWeight: 600 }}
                    >
                      <option value="FULL">Làm cả ngày (1.0 công)</option>
                      <option value="HALF">Làm nửa ngày sáng (0.5 công)</option>
                      <option value="HALF_PM">Làm nửa ngày chiều (0.5 công)</option>
                      <option value="OFF">Nghỉ tuần Thứ Hai (0 công)</option>
                    </select>
                  </div>

                  {/* Thứ Ba */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                      Thứ Ba
                    </label>
                    <select
                      className="form-control"
                      value={tuesdayPolicy}
                      onChange={(e) => { setTuesdayPolicy(e.target.value); setWorkScheduleType('CUSTOM'); }}
                      style={{ fontSize: '12.5px', fontWeight: 600 }}
                    >
                      <option value="FULL">Làm cả ngày (1.0 công)</option>
                      <option value="HALF">Làm nửa ngày sáng (0.5 công)</option>
                      <option value="HALF_PM">Làm nửa ngày chiều (0.5 công)</option>
                      <option value="OFF">Nghỉ tuần Thứ Ba (0 công)</option>
                    </select>
                  </div>

                  {/* Thứ Tư */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                      Thứ Tư
                    </label>
                    <select
                      className="form-control"
                      value={wednesdayPolicy}
                      onChange={(e) => { setWednesdayPolicy(e.target.value); setWorkScheduleType('CUSTOM'); }}
                      style={{ fontSize: '12.5px', fontWeight: 600 }}
                    >
                      <option value="FULL">Làm cả ngày (1.0 công)</option>
                      <option value="HALF">Làm nửa ngày sáng (0.5 công)</option>
                      <option value="HALF_PM">Làm nửa ngày chiều (0.5 công)</option>
                      <option value="OFF">Nghỉ tuần Thứ Tư (0 công)</option>
                    </select>
                  </div>

                  {/* Thứ Năm */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                      Thứ Năm
                    </label>
                    <select
                      className="form-control"
                      value={thursdayPolicy}
                      onChange={(e) => { setThursdayPolicy(e.target.value); setWorkScheduleType('CUSTOM'); }}
                      style={{ fontSize: '12.5px', fontWeight: 600 }}
                    >
                      <option value="FULL">Làm cả ngày (1.0 công)</option>
                      <option value="HALF">Làm nửa ngày sáng (0.5 công)</option>
                      <option value="HALF_PM">Làm nửa ngày chiều (0.5 công)</option>
                      <option value="OFF">Nghỉ tuần Thứ Năm (0 công)</option>
                    </select>
                  </div>

                  {/* Thứ Sáu */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                      Thứ Sáu
                    </label>
                    <select
                      className="form-control"
                      value={fridayPolicy}
                      onChange={(e) => { setFridayPolicy(e.target.value); setWorkScheduleType('CUSTOM'); }}
                      style={{ fontSize: '12.5px', fontWeight: 600 }}
                    >
                      <option value="FULL">Làm cả ngày (1.0 công)</option>
                      <option value="HALF">Làm nửa ngày sáng (0.5 công)</option>
                      <option value="HALF_PM">Làm nửa ngày chiều (0.5 công)</option>
                      <option value="OFF">Nghỉ tuần Thứ Sáu (0 công)</option>
                    </select>
                  </div>

                  {/* Chủ Nhật */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626' }}>
                      Chủ Nhật
                    </label>
                    <select
                      className="form-control"
                      value={sundayPolicy}
                      onChange={(e) => { setSundayPolicy(e.target.value); setWorkScheduleType('CUSTOM'); }}
                      style={{ fontSize: '12.5px', fontWeight: 600 }}
                    >
                      <option value="OFF">Nghỉ tuần Chủ Nhật (0 công)</option>
                      <option value="FULL">Làm cả ngày Chủ Nhật (1.0 công)</option>
                      <option value="HALF">Làm nửa ngày sáng Chủ Nhật (0.5 công)</option>
                      <option value="HALF_PM">Làm nửa ngày chiều Chủ Nhật (0.5 công)</option>
                    </select>
                  </div>
                </div>

                {/* Thứ Bảy */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#d97706' }}>
                    Thứ Bảy (Có hỗ trợ chế độ cách tuần)
                  </label>
                  <select
                    className="form-control"
                    value={saturdayPolicy}
                    onChange={(e) => { setSaturdayPolicy(e.target.value); setWorkScheduleType('CUSTOM'); }}
                    style={{ fontSize: '12.5px', fontWeight: 600 }}
                  >
                    <option value="HALF">Làm nửa buổi sáng Thứ Bảy (0.5 công)</option>
                    <option value="FULL">Làm cả ngày Thứ Bảy (1.0 công)</option>
                    <option value="HALF_PM">Làm nửa buổi chiều Thứ Bảy (0.5 công)</option>
                    <option value="OFF">Nghỉ trọn vẹn Thứ Bảy (0 công)</option>
                    <option value="ALTERNATE_OFF">Nghỉ Thứ 7 cách tuần (Tuần 1 & 3 làm, Tuần 2 & 4 nghỉ)</option>
                    <option value="ALTERNATE_WORK">Nghỉ Thứ 7 cách tuần (Tuần 2 & 4 làm, Tuần 1 & 3 nghỉ)</option>
                  </select>
                </div>
              </div>

              {/* Tùy chọn ghi đè */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="overwriteCheckbox"
                  checked={overwriteExisting}
                  onChange={(e) => setOverwriteExisting(e.target.checked)}
                />
                <label htmlFor="overwriteCheckbox" style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
                  Ghi đè và áp dụng lại toàn bộ các ngày trong năm {batchYear} (Không ghi đè kỳ đã chốt)
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowBatchModal(false)} disabled={generating}>
                Hủy
              </button>
              <button className="btn btn-primary" onClick={handleBatchGenerate} disabled={generating}>
                {generating ? 'Đang tạo lịch...' : `Khởi tạo lịch năm ${batchYear}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
