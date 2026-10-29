import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import {
  Building2,
  Users,
  UserCheck,
  Calendar,
  Sliders,
  FileText,
  History,
  Shield,
  ArrowRight,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  CalendarDays,
  FileSpreadsheet,
  Award,
  Zap,
  Info,
  ClipboardCheck
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

interface MonthlyKpis {
  totalEmployees: number;
  totalPunches: number;
  onTimePunches: number;
  latePunches: number;
  onTimeRate: number;
  totalLateMinutes: number;
  averageLateMinutes: number;
  totalLeaveCount: number;
  todayCheckedIn: number;
  todayOnTime: number;
  todayLate: number;
  todayNotCheckedIn: number;
  pendingActionCount: number;
  pendingLeaves: number;
  pendingRegularizations: number;
  pendingDevices: number;
}

interface EmployeeStat {
  employeeId: number;
  employeeCode: string;
  fullName: string;
  department: string;
  onTimeCount: number;
  lateCount: number;
  totalLateMinutes: number;
  leaveDays: number;
  presentDays: number;
  punctualityRate: number;
  statusTag: string;
}

interface LateDetail {
  employeeCode: string;
  fullName: string;
  department: string;
  workDate: string;
  workDateFormatted: string;
  dayOfWeek: string;
  inTime: string;
  standardTime: string;
  lateMinutes: number;
  hasExplanation: boolean;
  explanationStatus?: string;
  explanationReason?: string;
}

interface DailyTrendItem {
  date: string;
  fullDate: string;
  dayOfWeek: string;
  isWeekend: boolean;
  onTimeCount: number;
  lateCount: number;
  leaveCount: number;
  totalActive: number;
}

interface TodayEmployeeStatus {
  employeeCode: string;
  fullName: string;
  department: string;
  inTime?: string;
  status: string;
  lateMinutes: number;
}

interface DashboardData {
  month: number;
  year: number;
  companyId?: number;
  standardStartTime: string;
  kpis: MonthlyKpis;
  employeeStats: EmployeeStat[];
  lateDetails: LateDetail[];
  dailyTrend: DailyTrendItem[];
  todayStatus: TodayEmployeeStatus[];
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { selectedCompany, companies, setSelectedCompany, user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'late-details' | 'today' | 'shortcuts'>('overview');

  // Bộ lọc bảng nhân viên
  const [empSearch, setEmpSearch] = useState('');
  const [empFilter, setEmpFilter] = useState<'ALL' | 'ON_TIME' | 'LATE' | 'HIGH_LATE'>('ALL');

  // Bộ lọc bảng chi tiết trễ
  const [lateSearch, setLateSearch] = useState('');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const cid = selectedCompany ? selectedCompany.id : undefined;
      const params = new URLSearchParams({
        month: selectedMonth.toString(),
        year: selectedYear.toString(),
      });
      if (cid) params.append('companyId', cid.toString());

      const res = await api.get<DashboardData>(`/dashboard/monthly-overview?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu tổng quan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedMonth, selectedYear, selectedCompany?.id]);

  // Điều hướng tháng
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(today.getMonth() + 1);
    setSelectedYear(today.getFullYear());
  };

  // Lọc danh sách nhân viên
  const filteredEmployees = useMemo(() => {
    if (!data?.employeeStats) return [];
    return data.employeeStats.filter((emp) => {
      const matchSearch =
        emp.fullName.toLowerCase().includes(empSearch.toLowerCase()) ||
        emp.employeeCode.toLowerCase().includes(empSearch.toLowerCase()) ||
        emp.department.toLowerCase().includes(empSearch.toLowerCase());

      if (!matchSearch) return false;

      if (empFilter === 'ON_TIME') return emp.lateCount === 0 && emp.presentDays > 0;
      if (empFilter === 'LATE') return emp.lateCount > 0;
      if (empFilter === 'HIGH_LATE') return emp.lateCount >= 3;
      return true;
    });
  }, [data?.employeeStats, empSearch, empFilter]);

  // Lọc danh sách chi tiết đi trễ
  const filteredLateDetails = useMemo(() => {
    if (!data?.lateDetails) return [];
    return data.lateDetails.filter((item) => {
      return (
        item.fullName.toLowerCase().includes(lateSearch.toLowerCase()) ||
        item.employeeCode.toLowerCase().includes(lateSearch.toLowerCase()) ||
        item.workDateFormatted.includes(lateSearch)
      );
    });
  }, [data?.lateDetails, lateSearch]);

  // Xuất file CSV báo cáo chuyên cần nhân viên
  const handleExportEmployeesCsv = () => {
    if (!filteredEmployees || filteredEmployees.length === 0) return;
    const headers = [
      'STT',
      'Mã Nhân Viên',
      'Họ Và Tên',
      'Bộ Phận',
      `Số Ngày Đúng Giờ (<= ${standardStartTime})`,
      `Số Lần Đi Trễ (> ${standardStartTime})`,
      'Tổng Phút Trễ',
      'Số Ngày Nghỉ Phép',
      'Số Ngày Đi Làm',
      'Tỷ Lệ Đúng Giờ (%)',
      'Đánh Giá'
    ];
    const rows = filteredEmployees.map((emp, idx) => [
      idx + 1,
      emp.employeeCode,
      emp.fullName,
      emp.department,
      emp.onTimeCount,
      emp.lateCount,
      emp.totalLateMinutes,
      emp.leaveDays,
      emp.presentDays,
      `${emp.punctualityRate}%`,
      emp.statusTag
    ]);

    const bom = '\uFEFF';
    const csvContent = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Bao_Cao_Chuyen_Can_T${selectedMonth}_${selectedYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Xuất file CSV chi tiết các lần đi trễ
  const handleExportLateDetailsCsv = () => {
    if (!filteredLateDetails || filteredLateDetails.length === 0) return;
    const headers = [
      'STT',
      'Ngày Làm Việc',
      'Thứ',
      'Mã Nhân Viên',
      'Họ Và Tên',
      'Bộ Phận',
      'Giờ Ca Chuẩn',
      'Giờ Vào Thực Tế',
      'Số Phút Trễ',
      'Tình Trạng Giải Trình',
      'Lý Do Giải Trình'
    ];
    const rows = filteredLateDetails.map((item, idx) => [
      idx + 1,
      item.workDateFormatted,
      item.dayOfWeek,
      item.employeeCode,
      item.fullName,
      item.department,
      item.standardTime,
      item.inTime,
      item.lateMinutes,
      item.hasExplanation
        ? item.explanationStatus === 'APPROVED'
          ? 'Đã duyệt giải trình'
          : 'Chờ duyệt giải trình'
        : 'Chưa có giải trình',
      item.explanationReason || ''
    ]);

    const bom = '\uFEFF';
    const csvContent = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Chi_Tiet_Di_Tre_T${selectedMonth}_${selectedYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const adminModules = [
    { id: 'operator', title: 'Chấm Công Máy (Workflow 4 Bước)', desc: 'Nạp file dữ liệu máy chấm công (.xlsx, .csv), kiểm tra dữ liệu, tính công tự động và chốt kỳ.', icon: Clock, color: '#0056B3' },
    { id: 'admin-employee-timesheet', title: 'Bảng Chấm Công Từng Người', desc: 'Xem chi tiết ngày công, thâm niên, quỹ phép năm, số lần trễ và lịch sử quẹt thẻ từng nhân sự.', icon: FileSpreadsheet, color: '#0056B3' },
    { id: 'admin-hr-attendance', title: 'Duyệt Chấm Công Di Động (ESS)', desc: 'Duyệt cờ GPS/IP drift, phê duyệt thiết bị di động, cấu hình Geofence hội sở và công bố bảng công.', icon: ShieldCheck, color: '#0f766e' },
    { id: 'admin-regularization', title: 'Duyệt Giải Trình Chấm Công', desc: 'Phê duyệt các đơn xin bổ sung giờ vào/ra, quên quẹt thẻ, công tác ngoài có kèm ảnh minh chứng.', icon: ClipboardCheck, color: '#d97706' },
    { id: 'admin-companies', title: 'Hội sở / Công ty', desc: 'Quản lý danh sách các hội sở đa đơn vị, tải logo thương hiệu riêng.', icon: Building2, color: '#2563eb' },
    { id: 'admin-users', title: 'Tài khoản & Phân quyền', desc: 'Quản lý tài khoản đăng nhập, gán vai trò Admin / Nhân viên chấm công và hội sở phụ trách.', icon: Users, color: '#0f766e' },
    { id: 'admin-employees', title: 'Danh mục Nhân sự', desc: 'Bộ phận, Khối nhân viên (Chuẩn, Part-time, Remote), hồ sơ nhân sự, mã máy chấm công.', icon: UserCheck, color: '#16a34a' },
    { id: 'admin-codes', title: 'Bảng mã ký hiệu chấm công', desc: '14 mã quy chuẩn (1, 0.5, L, P, P/2, BL...), giá trị quy đổi công và màu hiển thị.', icon: FileText, color: '#d97706' },
    { id: 'admin-parameters', title: 'Bảng cấu hình tham số', desc: '11 tham số quản trị: Ca chuẩn, Nghỉ trưa, Flexitime bù giờ đối xứng, Ân hạn, Ngưỡng công.', icon: Sliders, color: '#7c3aed' },
    { id: 'admin-calendar', title: 'Lịch làm việc & Ngày lễ', desc: 'Lịch làm việc từng ngày, tạo nhanh lịch năm với ngày Lễ quốc gia và chế độ Thứ 7.', icon: Calendar, color: '#ea580c' },
    { id: 'admin-leave', title: 'Quản lý nghỉ phép & Giải trình', desc: 'Đơn nghỉ phép năm/bù đã duyệt, khởi tạo số dư đầu kỳ quỹ phép năm và giải trình.', icon: History, color: '#0284c7' },
    { id: 'admin-audit', title: 'Nhật ký thao tác hệ thống', desc: 'Kiểm toán toàn bộ hoạt động nạp file, tính công, sửa tay, đổi tham số (chỉ ghi thêm).', icon: Shield, color: '#475569' },
  ];

  const kpis = data?.kpis;
  const standardStartTime = data?.standardStartTime || '08:00';

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ============================================================== */}
      {/* 1. TOP HEADER & MONTH SELECTOR BAR */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '20px 24px',
          border: '1px solid var(--neutral-200)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#EFF6FF',
                color: '#2563EB'
              }}
            >
              <BarChart3 size={20} />
            </span>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              TRANG TỔNG QUAN CHẤM CÔNG
            </h1>
            <span
              className="badge badge-primary"
              style={{ fontSize: '12px', padding: '4px 10px', backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}
            >
              {selectedCompany ? selectedCompany.name : 'Tất cả các hội sở'}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px', marginBottom: 0 }}>
            Thống kê chuyên cần tháng {selectedMonth}/{selectedYear} • Báo cáo nhân viên đi đúng giờ & đi trễ theo chuẩn ca
          </p>
        </div>

        {/* BỘ LỌC THÁNG & NĂM */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Nhãn ca chuẩn */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              backgroundColor: '#FEF3C7',
              border: '1px solid #FDE68A',
              fontSize: '12px',
              fontWeight: 700,
              color: '#92400E'
            }}
            title={`Quy định giờ vào ca: Trước hoặc đúng ${standardStartTime} là Đúng giờ. Sau ${standardStartTime} tính là Đi trễ.`}
          >
            <Clock size={14} color="#D97706" />
            <span>Giờ vào ca: {standardStartTime} (Đúng giờ: ≤ {standardStartTime})</span>
          </div>

          {/* Chọn tháng năm */}
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: '10px', padding: '3px' }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              className="btn btn-secondary btn-sm"
              style={{ padding: '6px 8px', border: 'none', backgroundColor: 'transparent' }}
              title="Tháng trước"
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ padding: '0 12px', fontWeight: 800, fontSize: '14px', color: '#1E293B' }}>
              Tháng {selectedMonth} / {selectedYear}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="btn btn-secondary btn-sm"
              style={{ padding: '6px 8px', border: 'none', backgroundColor: 'transparent' }}
              title="Tháng sau"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleCurrentMonth}
            className="btn btn-secondary btn-sm"
            style={{ padding: '7px 12px', fontSize: '12.5px', fontWeight: 700 }}
          >
            Tháng này
          </button>

          <button
            type="button"
            onClick={fetchDashboardData}
            disabled={loading}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Đang tải...' : 'Làm mới'}</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. DẢI THẺ KPI SUMMARY CARDS */}
      {/* ============================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px'
        }}
      >
        {/* Card 1: Tỷ lệ Đúng Giờ */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '20px',
            border: '1px solid var(--neutral-200)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tỷ Lệ Đúng Giờ
              </div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A', marginTop: '6px', lineHeight: 1 }}>
                {kpis ? `${kpis.onTimeRate}%` : '---'}
              </div>
            </div>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#DCFCE7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#16A34A'
              }}
            >
              <CheckCircle2 size={24} />
            </div>
          </div>

          <div style={{ marginTop: '14px', borderTop: '1px solid #F1F5F9', paddingTop: '12px', fontSize: '12.5px', color: '#475569' }}>
            <span style={{ fontWeight: 800, color: '#16A34A' }}>{kpis?.onTimePunches ?? 0}</span> lượt đến đúng giờ (≤ {standardStartTime}) trên tổng số {kpis?.totalPunches ?? 0} lượt.
          </div>
        </div>

        {/* Card 2: Lượt Đi Trễ */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '20px',
            border: '1px solid var(--neutral-200)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tổng Lượt Đi Trễ
              </div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: '#DC2626', marginTop: '6px', lineHeight: 1 }}>
                {kpis ? `${kpis.latePunches}` : '---'}
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748B', marginLeft: '6px' }}>lượt</span>
              </div>
            </div>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#FEE2E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#DC2626'
              }}
            >
              <AlertTriangle size={24} />
            </div>
          </div>

          <div style={{ marginTop: '14px', borderTop: '1px solid #F1F5F9', paddingTop: '12px', fontSize: '12.5px', color: '#475569' }}>
            Tổng <strong style={{ color: '#DC2626' }}>{kpis?.totalLateMinutes ?? 0} phút trễ</strong> • Trung bình trễ ~{kpis?.averageLateMinutes ?? 0} phút/lần.
          </div>
        </div>

        {/* Card 3: Điểm Danh Hôm Nay */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '20px',
            border: '1px solid var(--neutral-200)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Điểm Danh Hôm Nay
              </div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: '#0284C7', marginTop: '6px', lineHeight: 1 }}>
                {kpis ? `${kpis.todayCheckedIn} / ${kpis.totalEmployees}` : '---'}
              </div>
            </div>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#E0F2FE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0284C7'
              }}
            >
              <UserCheck size={24} />
            </div>
          </div>

          <div style={{ marginTop: '14px', borderTop: '1px solid #F1F5F9', paddingTop: '12px', fontSize: '12.5px', color: '#475569' }}>
            Hôm nay: <strong style={{ color: '#16A34A' }}>{kpis?.todayOnTime ?? 0} đúng giờ</strong> • <strong style={{ color: '#DC2626' }}>{kpis?.todayLate ?? 0} đi trễ</strong> • {kpis?.todayNotCheckedIn ?? 0} chưa điểm danh.
          </div>
        </div>

        {/* Card 4: Nghỉ Phép & Chờ Duyệt */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '20px',
            border: '1px solid var(--neutral-200)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Nghỉ Phép & Chờ Duyệt
              </div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: '#D97706', marginTop: '6px', lineHeight: 1 }}>
                {kpis ? `${kpis.totalLeaveCount}` : '---'}
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748B', marginLeft: '6px' }}>ngày phép</span>
              </div>
            </div>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#FEF3C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#D97706'
              }}
            >
              <CalendarDays size={24} />
            </div>
          </div>

          <div style={{ marginTop: '14px', borderTop: '1px solid #F1F5F9', paddingTop: '12px', fontSize: '12.5px', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
            <div>
              <span style={{ fontWeight: 800, color: (kpis?.pendingActionCount ?? 0) > 0 ? '#DC2626' : '#16A34A' }}>
                {kpis?.pendingActionCount ?? 0} việc chờ duyệt:
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{ cursor: 'pointer', textDecoration: 'underline', color: (kpis?.pendingRegularizations ?? 0) > 0 ? '#D97706' : '#64748B', fontWeight: (kpis?.pendingRegularizations ?? 0) > 0 ? 700 : 500 }}
                onClick={() => onNavigate('admin-regularization')}
                title="Bấm để mở trang Duyệt Giải Trình Chấm Công"
              >
                {kpis?.pendingRegularizations ?? 0} giải trình
              </span>
              <span>•</span>
              <span
                style={{ cursor: 'pointer', textDecoration: 'underline', color: (kpis?.pendingLeaves ?? 0) > 0 ? '#2563EB' : '#64748B', fontWeight: (kpis?.pendingLeaves ?? 0) > 0 ? 700 : 500 }}
                onClick={() => onNavigate('admin-leave')}
                title="Bấm để mở trang Quản lý Nghỉ Phép"
              >
                {kpis?.pendingLeaves ?? 0} phép
              </span>
              <span>•</span>
              <span
                style={{ cursor: 'pointer', textDecoration: 'underline', color: (kpis?.pendingDevices ?? 0) > 0 ? '#0F766E' : '#64748B', fontWeight: (kpis?.pendingDevices ?? 0) > 0 ? 700 : 500 }}
                onClick={() => onNavigate('admin-hr-attendance')}
                title="Bấm để mở trang Duyệt Thiết Bị"
              >
                {kpis?.pendingDevices ?? 0} thiết bị
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. TABS CHUYỂN ĐỔI CHẾ ĐỘ XEM */}
      {/* ============================================================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: '2px solid #E2E8F0',
          paddingBottom: '2px',
          overflowX: 'auto'
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          style={{
            padding: '10px 18px',
            borderRadius: '10px 10px 0 0',
            fontWeight: activeTab === 'overview' ? 800 : 600,
            fontSize: '14px',
            color: activeTab === 'overview' ? '#1D4ED8' : '#64748B',
            backgroundColor: activeTab === 'overview' ? '#EFF6FF' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'overview' ? '3px solid #2563EB' : '3px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap'
          }}
        >
          <TrendingUp size={16} />
          <span>Xu hướng theo ngày ({selectedMonth}/{selectedYear})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('employees')}
          style={{
            padding: '10px 18px',
            borderRadius: '10px 10px 0 0',
            fontWeight: activeTab === 'employees' ? 800 : 600,
            fontSize: '14px',
            color: activeTab === 'employees' ? '#1D4ED8' : '#64748B',
            backgroundColor: activeTab === 'employees' ? '#EFF6FF' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'employees' ? '3px solid #2563EB' : '3px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap'
          }}
        >
          <Award size={16} />
          <span>Báo cáo chuyên cần nhân viên ({data?.employeeStats?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('late-details')}
          style={{
            padding: '10px 18px',
            borderRadius: '10px 10px 0 0',
            fontWeight: activeTab === 'late-details' ? 800 : 600,
            fontSize: '14px',
            color: activeTab === 'late-details' ? '#DC2626' : '#64748B',
            backgroundColor: activeTab === 'late-details' ? '#FEF2F2' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'late-details' ? '3px solid #DC2626' : '3px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap'
          }}
        >
          <AlertCircle size={16} />
          <span>Chi tiết các lần đi trễ ({data?.lateDetails?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('today')}
          style={{
            padding: '10px 18px',
            borderRadius: '10px 10px 0 0',
            fontWeight: activeTab === 'today' ? 800 : 600,
            fontSize: '14px',
            color: activeTab === 'today' ? '#0284C7' : '#64748B',
            backgroundColor: activeTab === 'today' ? '#F0F9FF' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'today' ? '3px solid #0284C7' : '3px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap'
          }}
        >
          <Clock size={16} />
          <span>Điểm danh hôm nay ({data?.todayStatus?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('shortcuts')}
          style={{
            padding: '10px 18px',
            borderRadius: '10px 10px 0 0',
            fontWeight: activeTab === 'shortcuts' ? 800 : 600,
            fontSize: '14px',
            color: activeTab === 'shortcuts' ? '#7C3AED' : '#64748B',
            backgroundColor: activeTab === 'shortcuts' ? '#F5F3FF' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'shortcuts' ? '3px solid #7C3AED' : '3px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            marginLeft: 'auto'
          }}
        >
          <Zap size={16} />
          <span>Phím tắt quản lý</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* 4. NỘI DUNG TỪNG TAB */}
      {/* ============================================================== */}

      {/* TAB 1: XU HƯỚNG THEO NGÀY (CHART & SUMMARY) */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Card Biểu đồ cột phân bổ từng ngày */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Biểu đồ phân bổ chuyên cần theo từng ngày trong tháng {selectedMonth}/{selectedYear}
                </h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', margin: '3px 0 0' }}>
                  Xanh lá: Đến đúng giờ (trước hoặc đúng {standardStartTime}) • Đỏ cam: Đi trễ (sau {standardStartTime}) • Vàng: Nghỉ phép
                </p>
              </div>

              {/* Chú thích màu */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', fontWeight: 600 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#16A34A' }} />
                  Đúng giờ
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#DC2626' }} />
                  Đi trễ
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#F59E0B' }} />
                  Nghỉ phép
                </span>
              </div>
            </div>

            <div className="card-body" style={{ padding: '24px 20px' }}>
              {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Đang tải biểu đồ xu hướng...</div>
              ) : !data?.dailyTrend || data.dailyTrend.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>Chưa có dữ liệu chấm công cho tháng này</div>
              ) : (
                <div style={{ overflowX: 'auto', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', minWidth: '700px', height: '220px', paddingTop: '20px' }}>
                    {data.dailyTrend.map((day) => {
                      const maxVal = Math.max(1, ...data.dailyTrend.map((d) => d.totalActive + d.leaveCount));
                      const onTimeH = Math.round((day.onTimeCount / maxVal) * 160);
                      const lateH = Math.round((day.lateCount / maxVal) * 160);
                      const leaveH = Math.round((day.leaveCount / maxVal) * 160);

                      return (
                        <div
                          key={day.date}
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            height: '100%',
                            justifyContent: 'flex-end'
                          }}
                          title={`Ngày ${day.date} (${day.dayOfWeek}):\n• Đúng giờ: ${day.onTimeCount}\n• Đi trễ: ${day.lateCount}\n• Nghỉ phép: ${day.leaveCount}`}
                        >
                          {/* Thanh cột xếp chồng */}
                          <div
                            style={{
                              width: '100%',
                              maxWidth: '24px',
                              display: 'flex',
                              flexDirection: 'column-reverse',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              backgroundColor: day.isWeekend ? '#F1F5F9' : '#F8FAFC',
                              border: day.isWeekend ? '1px dashed #CBD5E1' : '1px solid #E2E8F0'
                            }}
                          >
                            {/* Khối đúng giờ */}
                            {day.onTimeCount > 0 && (
                              <div
                                style={{
                                  height: `${onTimeH}px`,
                                  backgroundColor: '#16A34A',
                                  transition: 'height 0.3s ease'
                                }}
                              />
                            )}
                            {/* Khối đi trễ */}
                            {day.lateCount > 0 && (
                              <div
                                style={{
                                  height: `${lateH}px`,
                                  backgroundColor: '#DC2626',
                                  transition: 'height 0.3s ease'
                                }}
                              />
                            )}
                            {/* Khối nghỉ phép */}
                            {day.leaveCount > 0 && (
                              <div
                                style={{
                                  height: `${leaveH}px`,
                                  backgroundColor: '#F59E0B',
                                  transition: 'height 0.3s ease'
                                }}
                              />
                            )}
                          </div>

                          {/* Nhãn ngày bên dưới */}
                          <div style={{ marginTop: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: day.isWeekend ? '#94A3B8' : '#334155' }}>
                              {day.date}
                            </div>
                            <div style={{ fontSize: '9px', color: '#94A3B8' }}>{day.dayOfWeek}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BÁO CÁO CHUYÊN CẦN THEO TỪNG NHÂN VIÊN */}
      {activeTab === 'employees' && (
        <div className="card">
          <div className="card-header" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Bảng đánh giá chuyên cần nhân sự — Tháng {selectedMonth}/{selectedYear}
                </h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', margin: '3px 0 0' }}>
                  Tổng hợp số ngày đi đúng giờ, số ngày đi trễ, tổng phút trễ và tỷ lệ chuyên cần của từng nhân viên.
                </p>
              </div>

              {/* Bộ lọc nhân viên */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="text"
                    placeholder="Tìm tên, mã NV..."
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px 6px 30px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12.5px'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '2px' }}>
                  <button
                    type="button"
                    onClick={() => setEmpFilter('ALL')}
                    className={`btn btn-sm ${empFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '5px 10px', fontSize: '12px', border: 'none' }}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmpFilter('ON_TIME')}
                    className={`btn btn-sm ${empFilter === 'ON_TIME' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '5px 10px', fontSize: '12px', border: 'none' }}
                  >
                    100% Đúng giờ
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmpFilter('LATE')}
                    className={`btn btn-sm ${empFilter === 'LATE' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '5px 10px', fontSize: '12px', border: 'none' }}
                  >
                    Có đi trễ
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmpFilter('HIGH_LATE')}
                    className={`btn btn-sm ${empFilter === 'HIGH_LATE' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '5px 10px', fontSize: '12px', border: 'none' }}
                  >
                    Trễ ≥ 3 lần
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleExportEmployeesCsv}
                  disabled={filteredEmployees.length === 0}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12.5px', fontWeight: 700 }}
                  title="Xuất file Excel / CSV báo cáo chuyên cần"
                >
                  <FileSpreadsheet size={15} color="#16A34A" />
                  <span>Xuất Excel / CSV</span>
                </button>
              </div>
            </div>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                    <th>Mã NV</th>
                    <th>Họ và tên</th>
                    <th>Bộ phận</th>
                    <th style={{ textAlign: 'center', backgroundColor: '#F0FDF4', color: '#166534' }}>Đúng giờ (≤ {standardStartTime})</th>
                    <th style={{ textAlign: 'center', backgroundColor: '#FEF2F2', color: '#991B1B' }}>Đi trễ (&gt; {standardStartTime})</th>
                    <th style={{ textAlign: 'center' }}>Tổng phút trễ</th>
                    <th style={{ textAlign: 'center' }}>Nghỉ phép</th>
                    <th style={{ textAlign: 'center' }}>Số ngày đi làm</th>
                    <th style={{ textAlign: 'center' }}>Tỷ lệ đúng giờ</th>
                    <th style={{ textAlign: 'center' }}>Đánh giá</th>
                    <th style={{ width: '105px', textAlign: 'center' }}>Bảng công</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.map((emp, idx) => (
                      <tr key={emp.employeeId}>
                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 700 }}>{emp.employeeCode}</td>
                        <td style={{ fontWeight: 600 }}>{emp.fullName}</td>
                        <td style={{ color: '#64748B' }}>{emp.department}</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#16A34A', backgroundColor: '#F0FDF4' }}>
                          {emp.onTimeCount} ngày
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: emp.lateCount > 0 ? '#DC2626' : '#94A3B8', backgroundColor: '#FEF2F2' }}>
                          {emp.lateCount > 0 ? `${emp.lateCount} lần` : '-'}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: emp.totalLateMinutes > 0 ? '#DC2626' : '#94A3B8' }}>
                          {emp.totalLateMinutes > 0 ? `${emp.totalLateMinutes} phút` : '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>{emp.leaveDays > 0 ? `${emp.leaveDays} ngày` : '-'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{emp.presentDays} ngày</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            <div style={{ width: '48px', height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${emp.punctualityRate}%`,
                                  height: '100%',
                                  backgroundColor: emp.punctualityRate >= 95 ? '#16A34A' : emp.punctualityRate >= 80 ? '#F59E0B' : '#DC2626'
                                }}
                              />
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 700 }}>{emp.punctualityRate}%</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className={`badge ${emp.statusTag.includes('Xuất sắc')
                                ? 'badge-success'
                                : emp.statusTag.includes('Tốt')
                                  ? 'badge-primary'
                                  : emp.statusTag.includes('Cần lưu ý')
                                    ? 'badge-warning'
                                    : 'badge-danger'
                              }`}
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                          >
                            {emp.statusTag}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem('hr_selected_employee_id', emp.employeeId.toString());
                              onNavigate('admin-employee-timesheet');
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '4px 8px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              color: '#0056B3',
                              backgroundColor: '#EFF6FF',
                              borderColor: '#BFDBFE',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title={`Xem bảng chấm công chi tiết của ${emp.fullName}`}
                          >
                            <CalendarDays size={13} />
                            <span>Xem công</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={12} style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
                        Không có dữ liệu nhân viên phù hợp bộ lọc
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CHI TIẾT CÁC LẦN ĐI TRỄ */}
      {activeTab === 'late-details' && (
        <div className="card">
          <div className="card-header" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#DC2626', margin: 0 }}>
                  Danh sách chi tiết các lần nhân viên đi trễ — Tháng {selectedMonth}/{selectedYear}
                </h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', margin: '3px 0 0' }}>
                  Mọi lần check-in sau {standardStartTime} được hệ thống tự động ghi nhận số phút trễ và tình trạng giải trình.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="text"
                    placeholder="Tìm theo mã NV, tên, ngày..."
                    value={lateSearch}
                    onChange={(e) => setLateSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px 6px 30px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12.5px'
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleExportLateDetailsCsv}
                  disabled={filteredLateDetails.length === 0}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12.5px', fontWeight: 700 }}
                  title="Xuất file Excel / CSV danh sách đi trễ"
                >
                  <FileSpreadsheet size={15} color="#DC2626" />
                  <span>Xuất Excel / CSV</span>
                </button>
              </div>
            </div>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                    <th>Ngày làm việc</th>
                    <th>Thứ</th>
                    <th>Mã NV</th>
                    <th>Họ và tên</th>
                    <th>Bộ phận</th>
                    <th style={{ textAlign: 'center' }}>Giờ ca chuẩn</th>
                    <th style={{ textAlign: 'center', color: '#DC2626' }}>Giờ vào thực tế</th>
                    <th style={{ textAlign: 'center', color: '#DC2626' }}>Số phút trễ</th>
                    <th style={{ textAlign: 'center' }}>Giải trình chấm công</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLateDetails.length > 0 ? (
                    filteredLateDetails.map((item, idx) => (
                      <tr key={`${item.employeeCode}_${item.workDate}_${idx}`}>
                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 700 }}>{item.workDateFormatted}</td>
                        <td style={{ color: '#64748B' }}>{item.dayOfWeek}</td>
                        <td style={{ fontWeight: 700 }}>{item.employeeCode}</td>
                        <td style={{ fontWeight: 600 }}>{item.fullName}</td>
                        <td style={{ color: '#64748B' }}>{item.department}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.standardTime}</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#DC2626', backgroundColor: '#FEF2F2' }}>
                          {item.inTime}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#DC2626' }}>
                          +{item.lateMinutes} phút
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {item.hasExplanation ? (
                            <span
                              className={`badge ${item.explanationStatus === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}
                              style={{ fontSize: '11px' }}
                              title={item.explanationReason || 'Có đơn giải trình'}
                            >
                              {item.explanationStatus === 'APPROVED' ? 'Đã duyệt giải trình' : 'Chờ duyệt giải trình'}
                            </span>
                          ) : (
                            <span className="badge badge-neutral" style={{ fontSize: '11px', color: '#94A3B8' }}>
                              Chưa có giải trình
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: '#16A34A' }}>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>Tuyệt vời! Không có lượt đi trễ nào trong danh sách.</div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>Tất cả nhân viên đều đến làm đúng giờ quy định.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ĐIỂM DANH HÔM NAY (REALTIME TODAY) */}
      {activeTab === 'today' && (
        <div className="card">
          <div className="card-header" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Tình hình điểm danh thực tế hôm nay — {today.toLocaleDateString('vi-VN')}
              </h3>
              <p style={{ fontSize: '12.5px', color: '#64748B', margin: '3px 0 0' }}>
                Cập nhật tức thời nhân viên đã vào làm, đúng giờ hay đi trễ so với giờ ca {standardStartTime}.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={fetchDashboardData}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={13} />
                <span>Cập nhật realtime</span>
              </button>
            </div>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                    <th>Mã NV</th>
                    <th>Họ và tên</th>
                    <th>Bộ phận</th>
                    <th style={{ textAlign: 'center' }}>Giờ Check-in</th>
                    <th style={{ textAlign: 'center' }}>Trạng thái điểm danh</th>
                    <th style={{ textAlign: 'center' }}>Số phút trễ</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.todayStatus && data.todayStatus.length > 0 ? (
                    data.todayStatus.map((item, idx) => (
                      <tr key={item.employeeCode}>
                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 700 }}>{item.employeeCode}</td>
                        <td style={{ fontWeight: 600 }}>{item.fullName}</td>
                        <td style={{ color: '#64748B' }}>{item.department}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.inTime || '---'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className={`badge ${item.status === 'Đúng giờ'
                                ? 'badge-success'
                                : item.status === 'Đi trễ'
                                  ? 'badge-danger'
                                  : item.status === 'Nghỉ phép'
                                    ? 'badge-warning'
                                    : 'badge-neutral'
                              }`}
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: item.lateMinutes > 0 ? '#DC2626' : '#94A3B8' }}>
                          {item.lateMinutes > 0 ? `+${item.lateMinutes} phút` : '-'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
                        Chưa có dữ liệu điểm danh hôm nay
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PHÍM TẮT QUẢN TRỊ HỆ THỐNG */}
      {activeTab === 'shortcuts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {adminModules.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
                onClick={() => onNavigate(m.id)}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-sm)')}
              >
                <div className="card-body">
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      backgroundColor: `${m.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '16px'
                    }}
                  >
                    <Icon size={24} color={m.color} />
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--neutral-900)', marginBottom: '6px' }}>
                    {m.title}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--neutral-600)', lineHeight: 1.5 }}>{m.desc}</p>
                </div>

                <div
                  style={{
                    padding: '12px 20px',
                    borderTop: '1px solid var(--neutral-100)',
                    backgroundColor: 'var(--neutral-50)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: m.color
                  }}
                >
                  <span>Truy cập quản lý</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
