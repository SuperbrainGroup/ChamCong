import React, { useState, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { PlatformProvider } from './context/PlatformContext';
import { Navbar } from './components/Navbar';
import { LoginView } from './views/LoginView';
import { ChangePasswordModal } from './views/ChangePasswordModal';

// Code-splitting via lazy imports to reduce initial bundle size
const OperatorWorkflowView = lazy(() => import('./views/operator/OperatorWorkflowView').then(m => ({ default: m.OperatorWorkflowView })));
const AdminDashboard = lazy(() => import('./views/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const CompaniesManager = lazy(() => import('./views/admin/CompaniesManager').then(m => ({ default: m.CompaniesManager })));
const UsersManager = lazy(() => import('./views/admin/UsersManager').then(m => ({ default: m.UsersManager })));
const EmployeesManager = lazy(() => import('./views/admin/EmployeesManager').then(m => ({ default: m.EmployeesManager })));
const CodesManager = lazy(() => import('./views/admin/CodesManager').then(m => ({ default: m.CodesManager })));
const ParametersManager = lazy(() => import('./views/admin/ParametersManager').then(m => ({ default: m.ParametersManager })));
const CalendarManager = lazy(() => import('./views/admin/CalendarManager').then(m => ({ default: m.CalendarManager })));
const LeaveManager = lazy(() => import('./views/admin/LeaveManager').then(m => ({ default: m.LeaveManager })));
const AuditLogsViewer = lazy(() => import('./views/admin/AuditLogsViewer').then(m => ({ default: m.AuditLogsViewer })));
const HrAttendanceView = lazy(() => import('./views/admin/HrAttendanceView').then(m => ({ default: m.HrAttendanceView })));
const HrEmployeeTimesheetView = lazy(() => import('./views/admin/HrEmployeeTimesheetView').then(m => ({ default: m.HrEmployeeTimesheetView })));
const HrRegularizationView = lazy(() => import('./views/admin/HrRegularizationView').then(m => ({ default: m.HrRegularizationView })));
const PlatformSettingsManager = lazy(() => import('./views/admin/PlatformSettingsManager').then(m => ({ default: m.PlatformSettingsManager })));
const EmployeePortalView = lazy(() => import('./views/ess/EmployeePortalView').then(m => ({ default: m.EmployeePortalView })));
const PcCheckinView = lazy(() => import('./views/ess/PcCheckinView').then(m => ({ default: m.PcCheckinView })));

const ViewLoadingFallback: React.FC = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    color: '#64748b',
    fontSize: '14px',
    gap: '10px'
  }}>
    <div style={{
      width: '24px',
      height: '24px',
      border: '3px solid #cbd5e1',
      borderTopColor: 'var(--primary, #0056B3)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    }} />
    <span>Đang tải phân hệ...</span>
  </div>
);

const allowedHrViews = [
  'admin-dashboard',
  'operator',
  'admin-employee-timesheet',
  'admin-hr-attendance',
  'admin-regularization',
  'admin-users',
  'admin-employees',
  'admin-calendar',
  'admin-leave',
  'admin-codes',
  'admin-parameters',
  'ess-portal',
  'ess-schedules',
  'ess-history',
  'ess-requests',
  'ess-devices'
];

const allowedEmployeeViews = [
  'ess-portal',
  'ess-schedules',
  'ess-history',
  'ess-requests',
  'ess-devices'
];

const resolveValidView = (candidateView: string | null | undefined, role?: string): string => {
  const defaultView = role === 'Employee' ? 'ess-portal' : role === 'Admin' ? 'admin-dashboard' : 'operator';
  if (!candidateView) return defaultView;

  const clean = candidateView.trim().replace(/^#\/?/, '').replace(/\/$/, '');
  if (!clean) return defaultView;

  if (role === 'Employee') {
    return allowedEmployeeViews.includes(clean) ? clean : 'ess-portal';
  }
  if (role === 'HR') {
    return allowedHrViews.includes(clean) ? clean : 'operator';
  }
  // Admin: all valid views
  return clean;
};

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<string>(() => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const savedView = localStorage.getItem('chamcong_current_view');
    const savedUser = localStorage.getItem('user');
    let role = 'HR';
    if (savedUser) {
      try {
        role = JSON.parse(savedUser).role;
      } catch {}
    }
    return resolveValidView(hash || savedView, role);
  });
  const [showManualChangePwd, setShowManualChangePwd] = useState<boolean>(false);
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => window.innerWidth <= 768);
  const [forceMobileView, setForceMobileView] = useState<boolean>(false);

  const navigateToView = (v: string) => {
    const valid = resolveValidView(v, user?.role);
    setCurrentView(valid);
    localStorage.setItem('chamcong_current_view', valid);
    if (window.location.hash !== `#/${valid}`) {
      window.location.hash = `#/${valid}`;
    }
  };

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (user) {
      const valid = resolveValidView(currentView, user.role);
      if (valid !== currentView) {
        setCurrentView(valid);
      }
      localStorage.setItem('chamcong_current_view', valid);
      if (window.location.hash !== `#/${valid}`) {
        window.location.hash = `#/${valid}`;
      }
    }
  }, [user?.role]);

  React.useEffect(() => {
    const handleHashChange = () => {
      const newHash = window.location.hash.replace(/^#\/?/, '');
      if (newHash) {
        const valid = resolveValidView(newHash, user?.role);
        if (valid !== currentView) {
          setCurrentView(valid);
          localStorage.setItem('chamcong_current_view', valid);
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [user?.role, currentView]);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Nunito Sans', sans-serif",
        color: 'var(--neutral-600)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--neutral-200)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }} />
          <div>Đang khởi động hệ thống chấm công...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  // Force change password on first login or reset
  if (user.mustChangePassword) {
    return (
      <ChangePasswordModal
        mustChange={true}
        onClose={() => {
          // Window reload or re-fetch me after password changed
          window.location.reload();
        }}
      />
    );
  }

  const handleBack = () => {
    navigateToView(user.role === 'Admin' ? 'admin-dashboard' : user.role === 'Employee' ? 'ess-portal' : 'operator');
  };

  const renderView = () => {
    const isMobileMode = (isMobileScreen || forceMobileView);

    // Xử lý các màn hình tự chấm công của nhân viên (hoặc xem thử)
    if (currentView.startsWith('ess-') || user.role === 'Employee') {
      if (!isMobileMode) {
        const tabMap: Record<string, 'checkin' | 'schedule' | 'history' | 'requests' | 'device'> = {
          'ess-portal': 'checkin',
          'ess-schedules': 'schedule',
          'ess-history': 'history',
          'ess-requests': 'requests',
          'ess-devices': 'device'
        };
        return (
          <PcCheckinView
            initialTab={tabMap[currentView] || 'checkin'}
            onSwitchToMobile={() => setForceMobileView(true)}
            onNavigate={(v) => {
              navigateToView(v);
              setForceMobileView(false);
            }}
          />
        );
      }
      return (
        <EmployeePortalView
          onNavigate={(v) => {
            navigateToView(v);
            setForceMobileView(false);
          }}
        />
      );
    }

    if (user.role === 'HR' && !allowedHrViews.includes(currentView)) {
      return <OperatorWorkflowView />;
    }

    switch (currentView) {
      case 'operator':
        return <OperatorWorkflowView />;
      case 'admin-dashboard':
        return <AdminDashboard onNavigate={(v) => navigateToView(v)} />;
      case 'admin-employee-timesheet':
        return <HrEmployeeTimesheetView onBack={handleBack} />;
      case 'admin-hr-attendance':
        return <HrAttendanceView />;
      case 'admin-regularization':
        return <HrRegularizationView />;
      case 'admin-companies':
        return <CompaniesManager onBack={handleBack} />;
      case 'admin-users':
        return <UsersManager onBack={handleBack} />;
      case 'admin-employees':
        return <EmployeesManager onBack={handleBack} />;
      case 'admin-codes':
        return <CodesManager onBack={handleBack} />;
      case 'admin-parameters':
        return <ParametersManager onBack={handleBack} />;
      case 'admin-calendar':
        return <CalendarManager onBack={handleBack} />;
      case 'admin-leave':
        return <LeaveManager onBack={handleBack} />;
      case 'admin-audit':
        return <AuditLogsViewer onBack={handleBack} />;
      case 'admin-platform':
        return <PlatformSettingsManager />;
      default:
        return <OperatorWorkflowView />;
    }
  };

  const isEssMobileOnly = (currentView.startsWith('ess-') || user.role === 'Employee') && (isMobileScreen || forceMobileView);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f8fafc',
      fontFamily: "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      {/* Hiển thị Navbar trên PC (kể cả nhân viên), chỉ ẩn khi đang hiển thị giao diện Mobile PWA hẹp */}
      {!isEssMobileOnly && (
        <Navbar
          currentView={currentView}
          onNavigate={(v) => {
            navigateToView(v);
            setForceMobileView(false);
          }}
          onOpenChangePassword={() => setShowManualChangePwd(true)}
        />
      )}

      {/* Banner hỗ trợ khi người dùng chủ động xem dạng Mobile trên PC */}
      {forceMobileView && (
        <div style={{
          backgroundColor: '#0056B3',
          color: '#ffffff',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px',
          fontWeight: 600,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          zIndex: 99
        }}>
          <div>📱 Đang xem trước giao diện Mobile (PWA). Bạn có thể quay lại giao diện Web PC bất cứ lúc nào.</div>
          <button
            onClick={() => setForceMobileView(false)}
            style={{
              backgroundColor: '#FFC72C',
              color: '#0F172A',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            💻 Trở về giao diện PC
          </button>
        </div>
      )}

      {/* Banner nhỏ hỗ trợ Admin / Quản lý khi xem thử Cổng Tự Chấm Công */}
      {currentView === 'ess-portal' && user.role !== 'Employee' && !forceMobileView && (
        <div style={{
          backgroundColor: '#0056B3',
          color: '#ffffff',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px',
          fontWeight: 600,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          zIndex: 99
        }}>
          <div>💻 Chấm công cá nhân trên PC (Xác thực MAC Address).</div>
          <button
            onClick={handleBack}
            style={{
              backgroundColor: '#FFC72C',
              color: '#0F172A',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ← Quay lại Bảng Quản Trị
          </button>
        </div>
      )}

      <main style={{ 
        flex: 1, 
        padding: isEssMobileOnly ? '0' : '24px', 
        maxWidth: isEssMobileOnly ? '100%' : '1400px', 
        width: '100%', 
        margin: '0 auto' 
      }}>
        <Suspense fallback={<ViewLoadingFallback />}>
          {renderView()}
        </Suspense>
      </main>

      {showManualChangePwd && (
        <ChangePasswordModal
          mustChange={false}
          onClose={() => setShowManualChangePwd(false)}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <PlatformProvider>
      <ToastProvider>
        <AuthProvider>
          <MainLayout />
        </AuthProvider>
      </ToastProvider>
    </PlatformProvider>
  );
}
