import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePlatform } from '../context/PlatformContext';
import {
  Building2,
  UserCircle,
  KeyRound,
  LogOut,
  ChevronDown,
  LayoutDashboard,
  Users,
  UserCheck,
  FileText,
  Sliders,
  Calendar,
  Wallet,
  Shield,
  Clock,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  ShieldCheck,
  Palette,
  Monitor,
  Bell,
  FileSpreadsheet,
  ClipboardCheck
} from 'lucide-react';
import { notificationsApi } from '../api/client';
import { AppNotification } from '../types';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenChangePassword: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, onOpenChangePassword }) => {
  const { user, companies, selectedCompany, setSelectedCompany, logout } = useAuth();
  const { settings } = usePlatform();
  const toast = useToast();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const subnavRef = useRef<HTMLElement>(null);

  // Thông báo hệ thống
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotiCount, setUnreadNotiCount] = useState<number>(0);
  const [showNotiPopover, setShowNotiPopover] = useState(false);
  const [notiFilterCurrentBranch, setNotiFilterCurrentBranch] = useState(false);
  const notiMenuRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await notificationsApi.getMyNotifications();
      setNotifications(res.notifications || []);
      setUnreadNotiCount(res.unreadCount || 0);
    } catch {
      // ignore
    }
  };

  const displayedNotifications = React.useMemo(() => {
    if (!notiFilterCurrentBranch || !selectedCompany) return notifications;
    return notifications.filter(n => !n.companyId || n.companyId === selectedCompany.id);
  }, [notifications, notiFilterCurrentBranch, selectedCompany]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    const handleUpdate = () => fetchNotifications();
    window.addEventListener('notification-updated', handleUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('notification-updated', handleUpdate);
    };
  }, []);

  const handleReadNotification = async (id: number) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications(prev => prev.map(n => n.notificationId === id ? { ...n, isRead: true } : n));
      setUnreadNotiCount(prev => Math.max(0, prev - 1));
    } catch { }
  };

  const handleReadAllNotifications = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadNotiCount(0);
    } catch { }
  };

  const resolveNotificationTargetView = (n: AppNotification, role?: string): string => {
    const linkType = (n.linkType || '').toUpperCase();
    const title = (n.title || '').toLowerCase();
    const body = (n.body || '').toLowerCase();
    const isHrOrAdmin = role === 'Admin' || role === 'HR';

    // 1. Đơn nghỉ phép -> Chuyển đến Quản lý nghỉ phép (admin-leave) với HR/Admin, hoặc Đơn từ cá nhân (ess-requests) với Nhân viên
    if (linkType === 'LEAVE' || title.includes('nghỉ phép') || body.includes('nghỉ phép') || title.includes('đơn xin nghỉ')) {
      return isHrOrAdmin ? 'admin-leave' : 'ess-requests';
    }

    // 2. Giải trình chấm công -> admin-regularization (Quản lý duyệt giải trình) với HR/Admin, hoặc ess-requests với Nhân viên
    if (linkType === 'REGULARIZATION' || title.includes('giải trình') || body.includes('giải trình')) {
      return isHrOrAdmin ? 'admin-regularization' : 'ess-requests';
    }

    // 3. Đơn từ nói chung -> admin-leave với HR/Admin, ess-requests với Nhân viên
    if (linkType === 'REQUEST' || title.includes('đơn từ') || title.includes('đơn cần duyệt') || title.includes('nộp đơn')) {
      return isHrOrAdmin ? 'admin-leave' : 'ess-requests';
    }

    // 4. Bảng chấm công cá nhân / Kỳ công / Khiếu nại -> Trang bảng chấm công cá nhân (ess-history)
    if (linkType === 'TIMESHEET' || linkType === 'DISPUTE' || title.includes('bảng chấm công') || title.includes('kỳ công') || body.includes('bảng chấm công') || title.includes('khiếu nại')) {
      return 'ess-history';
    }

    // 5. Thiết bị & MAC -> Trang thiết bị (ess-devices)
    if (linkType === 'DEVICE' || title.includes('thiết bị') || title.includes('mac') || body.includes('địa chỉ mac')) {
      return 'ess-devices';
    }

    // 6. Tính công / Vận hành kỳ công
    if (linkType === 'OPERATOR' || title.includes('vận hành') || title.includes('chốt công')) {
      return isHrOrAdmin ? 'operator' : 'ess-history';
    }

    // 7. Nhân sự
    if (linkType === 'EMPLOYEE' || title.includes('nhân sự') || title.includes('nhân viên')) {
      return isHrOrAdmin ? 'admin-employees' : 'ess-portal';
    }

    // 8. Lịch làm việc
    if (linkType === 'CALENDAR' || title.includes('lịch làm việc') || title.includes('ngày lễ')) {
      return isHrOrAdmin ? 'admin-calendar' : 'ess-portal';
    }

    // Mặc định
    return isHrOrAdmin ? 'admin-leave' : 'ess-requests';
  };

  const getNotificationTargetLabel = (n: AppNotification): string => {
    const linkType = (n.linkType || '').toUpperCase();
    const title = (n.title || '').toLowerCase();
    const body = (n.body || '').toLowerCase();
    const isHrOrAdmin = user?.role === 'Admin' || user?.role === 'HR';

    if (linkType === 'LEAVE' || title.includes('nghỉ phép') || body.includes('nghỉ phép') || title.includes('đơn xin nghỉ')) {
      return isHrOrAdmin ? 'Quản lý nghỉ phép' : 'Đơn từ của tôi';
    }
    if (linkType === 'REGULARIZATION' || title.includes('giải trình') || body.includes('giải trình')) {
      return isHrOrAdmin ? 'Duyệt giải trình' : 'Giải trình của tôi';
    }
    if (linkType === 'REQUEST' || title.includes('đơn')) {
      return isHrOrAdmin ? 'Quản lý đơn từ' : 'Đơn từ của tôi';
    }
    if (linkType === 'TIMESHEET' || linkType === 'DISPUTE' || title.includes('bảng chấm công') || title.includes('kỳ công')) {
      return 'Bảng chấm công';
    }
    if (linkType === 'DEVICE' || title.includes('thiết bị') || title.includes('mac')) {
      return 'Thiết bị & MAC';
    }
    return isHrOrAdmin ? 'Quản lý nghỉ phép' : 'Đơn từ';
  };

  const handleNotificationClick = (n: AppNotification) => {
    handleReadNotification(n.notificationId);
    setShowNotiPopover(false);

    // Tự động chuyển hội sở làm việc nếu thông báo thuộc cơ sở khác
    if (n.companyId && selectedCompany && selectedCompany.id !== n.companyId) {
      const targetComp = companies.find(c => c.id === n.companyId || (n.companyCode && c.code.toLowerCase() === n.companyCode.toLowerCase()));
      if (targetComp) {
        setSelectedCompany(targetComp);
        toast.info(`Đã tự động chuyển sang cơ sở ${targetComp.name} (${targetComp.code}) để xem nội dung.`);
      }
    } else if (!n.companyId && n.companyCode && selectedCompany && selectedCompany.code.toLowerCase() !== n.companyCode.toLowerCase()) {
      const targetComp = companies.find(c => c.code.toLowerCase() === n.companyCode!.toLowerCase());
      if (targetComp) {
        setSelectedCompany(targetComp);
        toast.info(`Đã tự động chuyển sang cơ sở ${targetComp.name} (${targetComp.code}) để xem nội dung.`);
      }
    }

    const target = resolveNotificationTargetView(n, user?.role);
    onNavigate(target);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (notiMenuRef.current && !notiMenuRef.current.contains(event.target as Node)) {
        setShowNotiPopover(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowUserMenu(false);
        setShowNotiPopover(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Di chuột vào navbar: tự động cuộn ngang bằng lăn chuột mà không cần giữ Shift
  useEffect(() => {
    const el = subnavRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const handleScrollSubnav = (direction: 'left' | 'right') => {
    if (subnavRef.current) {
      subnavRef.current.scrollBy({
        left: direction === 'left' ? -220 : 220,
        behavior: 'smooth'
      });
    }
  };

  const isAdmin = user?.role === 'Admin';

  const adminNavItems = [
    { id: 'admin-dashboard', label: 'Trang Tổng Quan', icon: LayoutDashboard },
    { id: 'operator', label: 'Chấm Công', icon: Clock },
    { id: 'admin-employee-timesheet', label: 'Bảng Công Nhân Viên', icon: FileSpreadsheet },
    { id: 'admin-hr-attendance', label: 'Duyệt Chấm Công', icon: ShieldCheck },
    { id: 'admin-regularization', label: 'Duyệt Giải Trình', icon: ClipboardCheck },
    { id: 'admin-companies', label: 'Hội sở / Đơn vị', icon: Building2 },
    { id: 'admin-users', label: 'Tài khoản & Phân quyền', icon: Users },
    { id: 'admin-employees', label: 'Danh mục Nhân sự', icon: UserCheck },
    { id: 'admin-codes', label: 'Mã Ký Hiệu Chấm Công', icon: FileText },
    { id: 'admin-parameters', label: 'Cấu Hình Tham Số', icon: Sliders },
    { id: 'admin-calendar', label: 'Lịch Làm Việc & Nghỉ Lễ', icon: Calendar },
    { id: 'admin-leave', label: 'Quản lý nghỉ phép', icon: Wallet },
    { id: 'admin-audit', label: 'Nhật Ký Thao tác', icon: Shield },
    { id: 'admin-platform', label: 'Cấu hình Nền tảng', icon: Palette },
  ];

  const hrNavItems = [
    { id: 'admin-dashboard', label: 'Trang Tổng Quan', icon: LayoutDashboard },
    { id: 'operator', label: 'Chấm Công', icon: Clock },
    { id: 'admin-employee-timesheet', label: 'Bảng Công Nhân viên', icon: FileSpreadsheet },
    { id: 'admin-hr-attendance', label: 'Duyệt Chấm Công', icon: ShieldCheck },
    { id: 'admin-regularization', label: 'Duyệt Giải Trình', icon: ClipboardCheck },
    { id: 'admin-users', label: 'Tài khoản & Phân quyền', icon: Users },
    { id: 'admin-employees', label: 'Danh mục Nhân sự', icon: UserCheck },
    { id: 'admin-calendar', label: 'Lịch Làm Việc & Nghỉ Lễ', icon: Calendar },
    { id: 'admin-leave', label: 'Quản lý nghỉ phép', icon: Wallet },
    { id: 'admin-codes', label: 'Mã Ký Hiệu Chấm Công', icon: FileText },
    { id: 'admin-parameters', label: 'Cấu Hình Tham Số', icon: Sliders },
    { id: 'ess-portal', label: 'Chấm Công Cá Nhân', icon: Monitor },
  ];

  const isEligibleForSchedule = user?.employeeType === 'PARTTIME' || user?.employeeType === 'REMOTE' || user?.role !== 'Employee';

  const employeeNavItems = [
    { id: 'ess-portal', label: 'Điểm Danh & Chấm Công (PC)', icon: Monitor },
    ...(isEligibleForSchedule ? [{ id: 'ess-schedules', label: 'Đăng Ký Chỗ Làm & Lịch', icon: Calendar }] : []),
    { id: 'ess-history', label: 'Lịch Sử Chấm Công', icon: Clock },
    { id: 'ess-requests', label: 'Đơn Nghỉ Phép & Giải Trình', icon: Wallet },
    { id: 'ess-devices', label: 'Thiết Bị & Địa Chỉ MAC', icon: ShieldCheck },
  ];

  const isEssView = currentView.startsWith('ess-');

  const staffEssNavItems = [
    { id: user?.role === 'Admin' ? 'admin-dashboard' : 'operator', label: '← Quay lại Quản trị', icon: ChevronLeft },
    ...employeeNavItems
  ];

  const activeNavItems = isEssView && user?.role !== 'Employee'
    ? staffEssNavItems
    : isAdmin
      ? adminNavItems
      : user?.role === 'Employee'
        ? employeeNavItems
        : hrNavItems;

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: '#ffffff', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)' }}>
      {/* ============================================================== */}
      {/* TIER 1: TOP MAIN NAVBAR */}
      {/* ============================================================== */}
      <header
        style={{
          borderBottom: '1px solid var(--neutral-200)',
          padding: '0 24px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* BRAND / LOGO (BÊN TRÁI) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {settings.logoUrl ? (
            <img
              src={settings.logoUrl}
              alt={settings.siteTitle}
              style={{ maxHeight: '38px', maxWidth: '160px', objectFit: 'contain', cursor: 'pointer' }}
              onClick={() => onNavigate(isAdmin ? 'admin-dashboard' : 'operator')}
            />
          ) : selectedCompany?.hasLogo ? (
            <img
              src={`/api/companies/${selectedCompany.id}/logo?t=${Date.now()}`}
              alt={selectedCompany.name}
              style={{ maxHeight: '36px', maxWidth: '140px', objectFit: 'contain', cursor: 'pointer' }}
              onClick={() => onNavigate(isAdmin ? 'admin-dashboard' : 'operator')}
            />
          ) : (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
              onClick={() => onNavigate(isAdmin ? 'admin-dashboard' : 'operator')}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: settings.brandColor || 'var(--primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '16px',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)'
                }}
              >
                {settings.siteTitle ? settings.siteTitle.charAt(0).toUpperCase() : 'P'}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--neutral-900)', lineHeight: 1.2 }}>
                  {settings.siteTitle || 'HỆ THỐNG CHẤM CÔNG'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--neutral-500)', fontWeight: 600 }}>
                  {settings.siteSubtitle || 'Nền tảng quản lý chấm công & tính lương'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CÙNG BÊN PHẢI: CHỌN HỘI SỞ + USER INFO POPUP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* CHỌN HỘI SỞ / ĐƠN VỊ (MOVED TO RIGHT NEXT TO USER INFO) */}
          {companies.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--neutral-50)',
                padding: '4px 10px',
                borderRadius: '10px',
                border: '1px solid var(--neutral-200)',
              }}
            >
              <Building2 size={16} color="var(--primary)" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase', lineHeight: 1 }}>
                  Hội sở làm việc
                </span>
                <select
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--neutral-800)',
                    cursor: 'pointer',
                    padding: '2px 0',
                    maxWidth: '220px'
                  }}
                  value={selectedCompany ? selectedCompany.id : (isAdmin ? 'ALL' : '')}
                  onChange={(e) => {
                    if (e.target.value === 'ALL') {
                      setSelectedCompany(null);
                    } else {
                      const c = companies.find(x => x.id === parseInt(e.target.value));
                      setSelectedCompany(c ?? null);
                    }
                  }}
                >
                  {isAdmin && <option value="ALL">🏢 Tất cả hội sở</option>}
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {!c.isActive ? '(Ngưng)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* NÚT THÔNG BÁO HỆ THỐNG */}
          <div style={{ position: 'relative' }} ref={notiMenuRef}>
            <button
              id="navbar-notification-btn"
              type="button"
              onClick={() => setShowNotiPopover(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                height: '42px',
                borderRadius: '10px',
                border: showNotiPopover || unreadNotiCount > 0 ? '1px solid #BFDBFE' : '1px solid var(--neutral-200)',
                backgroundColor: showNotiPopover || unreadNotiCount > 0 ? '#EFF6FF' : 'var(--neutral-50)',
                color: showNotiPopover || unreadNotiCount > 0 ? '#1D4ED8' : 'var(--neutral-700)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '13px',
                transition: 'all 0.15s ease',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap'
              }}
              title="Thông báo hệ thống"
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Bell size={18} color={unreadNotiCount > 0 ? '#2563EB' : 'var(--neutral-600)'} />
                {unreadNotiCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: -6,
                    right: -8,
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    borderRadius: '9999px',
                    padding: '1px 5px',
                    fontSize: '10px',
                    fontWeight: 800,
                    lineHeight: 1
                  }}>
                    {unreadNotiCount}
                  </span>
                )}
              </div>
              <span>Thông báo</span>
            </button>

            {showNotiPopover && (
              <div
                id="navbar-notification-popover"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '360px',
                  maxHeight: '440px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  border: '1px solid var(--neutral-200)',
                  overflow: 'hidden',
                  zIndex: 120,
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'fadeIn 0.15s ease-out'
                }}>
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--neutral-50)',
                  borderBottom: '1px solid var(--neutral-200)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--neutral-900)' }}>
                      Thông báo hệ thống ({notifications.length})
                    </div>
                    {unreadNotiCount > 0 && (
                      <button
                        type="button"
                        onClick={handleReadAllNotifications}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--primary)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Đọc tất cả
                      </button>
                    )}
                  </div>

                  {selectedCompany && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setNotiFilterCurrentBranch(false)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: !notiFilterCurrentBranch ? 'var(--primary)' : 'var(--neutral-200)',
                          backgroundColor: !notiFilterCurrentBranch ? 'var(--primary-bg)' : '#FFFFFF',
                          color: !notiFilterCurrentBranch ? 'var(--primary)' : 'var(--neutral-600)'
                        }}
                      >
                        Tất cả ({notifications.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotiFilterCurrentBranch(true)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: notiFilterCurrentBranch ? 'var(--primary)' : 'var(--neutral-200)',
                          backgroundColor: notiFilterCurrentBranch ? 'var(--primary-bg)' : '#FFFFFF',
                          color: notiFilterCurrentBranch ? 'var(--primary)' : 'var(--neutral-600)'
                        }}
                      >
                        Tại {selectedCompany.code} ({notifications.filter(n => !n.companyId || n.companyId === selectedCompany.id).length})
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ overflowY: 'auto', maxHeight: '360px', padding: '8px' }}>
                  {displayedNotifications.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--neutral-400)', fontSize: '13px' }}>
                      {notiFilterCurrentBranch ? `Không có thông báo nào của hội sở ${selectedCompany?.code}.` : 'Chưa có thông báo nào.'}
                    </div>
                  ) : (
                    displayedNotifications.map((n) => {
                      const targetLabel = getNotificationTargetLabel(n);
                      const isCurrentComp = !n.companyId || (selectedCompany && n.companyId === selectedCompany.id);
                      const branchText = n.companyName ? `${n.companyCode ? n.companyCode + ' - ' : ''}${n.companyName}` : (n.branchCode || n.companyCode);

                      return (
                        <div
                          key={n.notificationId}
                          onClick={() => handleNotificationClick(n)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '10px',
                            marginBottom: '8px',
                            backgroundColor: n.isRead ? '#FFFFFF' : '#EFF6FF',
                            border: `1px solid ${n.isRead ? '#E2E8F0' : '#BFDBFE'}`,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = n.isRead ? '#F8FAFC' : '#DBEAFE';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = n.isRead ? '#FFFFFF' : '#EFF6FF';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A', flex: 1 }}>
                              {n.title}
                            </div>
                            {!n.isRead && (
                              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#2563EB', flexShrink: 0, marginTop: '4px' }} />
                            )}
                          </div>

                          {branchText && (
                            <div style={{ marginTop: '4px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                color: isCurrentComp ? '#15803D' : '#B45309',
                                backgroundColor: isCurrentComp ? '#DCFCE7' : '#FEF3C7'
                              }}>
                                <Building2 size={11} />
                                {branchText}
                                {!isCurrentComp && ' (Bấm để chuyển cơ sở)'}
                              </span>
                            </div>
                          )}

                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px', lineHeight: 1.4 }}>
                            {n.body}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px' }}>
                            <span style={{ color: '#94A3B8' }}>{n.timeLocal || ''}</span>
                            <span style={{
                              color: '#0056B3',
                              fontWeight: 700,
                              backgroundColor: '#E0F2FE',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              {targetLabel} →
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* USER INFO VÀ POPUP THAO TÁC (ĐỔI MẬT KHẨU / ĐĂNG XUẤT) */}
          <div style={{ position: 'relative' }} ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setShowUserMenu(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 12px',
                borderRadius: '12px',
                border: showUserMenu ? '1px solid var(--primary)' : '1px solid var(--neutral-200)',
                backgroundColor: showUserMenu ? '#eff6ff' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Tài khoản và thao tác"
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: isAdmin ? '#eff6ff' : '#f0fdf4',
                  color: isAdmin ? 'var(--primary)' : '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '13px'
                }}
              >
                {user?.fullName?.charAt(0).toUpperCase() || 'U'}
              </div>

              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--neutral-900)', lineHeight: 1.2 }}>
                  {user?.fullName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>
                    @{user?.username}
                  </span>
                </div>
              </div>

              <ChevronDown
                size={16}
                color="var(--neutral-500)"
                style={{
                  transform: showUserMenu ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease'
                }}
              />
            </button>

            {/* FLOATING DROPDOWN POPUP MENU */}
            {showUserMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  width: '260px',
                  backgroundColor: '#ffffff',
                  borderRadius: '14px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  border: '1px solid var(--neutral-200)',
                  overflow: 'hidden',
                  zIndex: 110,
                  animation: 'fadeIn 0.15s ease-out'
                }}
              >
                {/* Header in Popup */}
                <div style={{ padding: '14px 16px', backgroundColor: 'var(--neutral-50)', borderBottom: '1px solid var(--neutral-100)' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--neutral-900)' }}>
                    {user?.fullName}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-500)', marginTop: '2px' }}>
                    Tài khoản: <strong style={{ color: 'var(--neutral-700)' }}>{user?.username}</strong>
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    <span
                      className={`badge ${isAdmin ? 'badge-primary' : 'badge-neutral'}`}
                      style={{ fontSize: '10px', padding: '2px 8px' }}
                    >
                      {isAdmin ? 'Quyền: Toàn quyền Quản trị' : 'Quyền: Nhân viên'}
                    </span>
                  </div>
                </div>

                {/* Actions list */}
                <div style={{ padding: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      onOpenChangePassword();
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--neutral-700)',
                      textAlign: 'left',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--neutral-100)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <KeyRound size={16} color="var(--primary)" />
                    <span>Đổi mật khẩu</span>
                  </button>

                  <div style={{ height: '1px', backgroundColor: 'var(--neutral-100)', margin: '4px 6px' }} />

                  <button
                    type="button"
                    onClick={async () => {
                      setShowUserMenu(false);
                      const confirmed = await toast.confirm({
                        title: 'Xác nhận đăng xuất',
                        message: 'Bạn có chắc chắn muốn đăng xuất khỏi hệ thống Chấm Công không?',
                        confirmText: 'Đăng xuất',
                        cancelText: 'Hủy',
                        type: 'danger'
                      });
                      if (confirmed) {
                        logout();
                        toast.success('Đã đăng xuất thành công.');
                      }
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--danger)',
                      textAlign: 'left',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--danger-light)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <LogOut size={16} color="var(--danger)" />
                    <span>Đăng xuất hệ thống</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ============================================================== */}
      {/* TIER 2: SUB-NAVBAR CHỨC NĂNG DỄ DÀNG THAO TÁC */}
      {/* ============================================================== */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', backgroundColor: '#fafbfc', borderBottom: '1px solid var(--neutral-200)' }}>
        <button
          type="button"
          onClick={() => handleScrollSubnav('left')}
          style={{
            padding: '10px 8px',
            backgroundColor: '#fafbfc',
            border: 'none',
            borderRight: '1px solid var(--neutral-200)',
            cursor: 'pointer',
            color: 'var(--neutral-500)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            transition: 'color 0.15s ease'
          }}
          title="Cuộn menu sang trái"
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--neutral-500)')}
        >
          <ChevronLeft size={16} />
        </button>

        <nav
          ref={subnavRef}
          className="subnav-scrollbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flex: 1,
            padding: '2px 12px',
          }}
        >
          {activeNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 14px',
                  fontSize: '13px',
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? 'var(--primary)' : 'var(--neutral-600)',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  borderRadius: '0',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--neutral-900)';
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--neutral-600)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <Icon size={15} color={isActive ? 'var(--primary)' : 'var(--neutral-500)'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => handleScrollSubnav('right')}
          style={{
            padding: '10px 8px',
            backgroundColor: '#fafbfc',
            border: 'none',
            borderLeft: '1px solid var(--neutral-200)',
            cursor: 'pointer',
            color: 'var(--neutral-500)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            transition: 'color 0.15s ease'
          }}
          title="Cuộn menu sang phải"
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--neutral-500)')}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};
