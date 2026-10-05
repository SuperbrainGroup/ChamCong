import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
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
  ChevronRight
} from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenChangePassword: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, onOpenChangePassword }) => {
  const { user, companies, selectedCompany, setSelectedCompany, logout } = useAuth();
  const toast = useToast();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const subnavRef = useRef<HTMLElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowUserMenu(false);
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
    { id: 'admin-dashboard', label: 'Bảng Điều Khiển', icon: LayoutDashboard },
    { id: 'admin-companies', label: 'Hội sở / Đơn vị', icon: Building2 },
    { id: 'admin-users', label: 'Tài khoản & Phân quyền', icon: Users },
    { id: 'admin-employees', label: 'Danh mục Nhân sự', icon: UserCheck },
    { id: 'admin-codes', label: 'Mã Ký Hiệu Chấm Công', icon: FileText },
    { id: 'admin-parameters', label: 'Cấu Hình Tham Số', icon: Sliders },
    { id: 'admin-calendar', label: 'Lịch Làm Việc & Nghỉ Lễ', icon: Calendar },
    { id: 'admin-leave', label: 'Quản lý nghỉ phép', icon: Wallet },
    { id: 'admin-audit', label: 'Nhật Ký Thao tác', icon: Shield },
  ];

  const operatorNavItems = [
    { id: 'operator', label: 'Chấm Công', icon: Clock },
    { id: 'admin-employees', label: 'Danh mục Nhân sự', icon: UserCheck },
    { id: 'admin-calendar', label: 'Lịch Làm Việc & Nghỉ Lễ', icon: Calendar },
    { id: 'admin-leave', label: 'Quản lý nghỉ phép', icon: Wallet },
    { id: 'admin-codes', label: 'Mã Ký Hiệu Chấm Công', icon: FileText },
  ];

  const activeNavItems = isAdmin ? adminNavItems : operatorNavItems;

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
          {selectedCompany?.hasLogo ? (
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
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '16px',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)'
                }}
              >
                SB
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--neutral-900)', lineHeight: 1.2 }}>
                  SUPERBRAIN CHẤM CÔNG
                </div>
                <div style={{ fontSize: '11px', color: 'var(--neutral-500)', fontWeight: 600 }}>
                  Hệ thống quản lý chấm công & tính lương
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
                  value={selectedCompany?.id ?? ''}
                  onChange={(e) => {
                    const c = companies.find(x => x.id === parseInt(e.target.value));
                    setSelectedCompany(c ?? null);
                  }}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {!c.isActive ? '(Ngưng)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

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
