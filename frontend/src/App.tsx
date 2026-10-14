import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { PlatformProvider } from './context/PlatformContext';
import { Navbar } from './components/Navbar';
import { LoginView } from './views/LoginView';
import { ChangePasswordModal } from './views/ChangePasswordModal';
import { OperatorWorkflowView } from './views/operator/OperatorWorkflowView';
import { AdminDashboard } from './views/admin/AdminDashboard';
import { CompaniesManager } from './views/admin/CompaniesManager';
import { UsersManager } from './views/admin/UsersManager';
import { EmployeesManager } from './views/admin/EmployeesManager';
import { CodesManager } from './views/admin/CodesManager';
import { ParametersManager } from './views/admin/ParametersManager';
import { CalendarManager } from './views/admin/CalendarManager';
import { LeaveManager } from './views/admin/LeaveManager';
import { AuditLogsViewer } from './views/admin/AuditLogsViewer';
import { HrAttendanceView } from './views/admin/HrAttendanceView';
import { PlatformSettingsManager } from './views/admin/PlatformSettingsManager';
import { EmployeePortalView } from './views/ess/EmployeePortalView';
import { PcCheckinView } from './views/ess/PcCheckinView';

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<string>(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u.role === 'Employee') return 'ess-portal';
        return u.role === 'Admin' ? 'admin-dashboard' : 'operator';
      } catch {}
    }
    return 'operator';
  });
  const [showManualChangePwd, setShowManualChangePwd] = useState<boolean>(false);
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => window.innerWidth <= 768);
  const [forceMobileView, setForceMobileView] = useState<boolean>(false);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const allowedHrViews = [
    'admin-dashboard',
    'operator',
    'admin-hr-attendance',
    'admin-users',
    'admin-employees',
    'admin-calendar',
    'admin-leave',
    'admin-codes',
    'admin-parameters',
    'ess-portal',
    'ess-history',
    'ess-requests',
    'ess-devices'
  ];

  React.useEffect(() => {
    if (user) {
      if (user.role === 'Employee') {
        const allowedEss = ['ess-portal', 'ess-history', 'ess-requests', 'ess-devices'];
        if (!allowedEss.includes(currentView)) {
          setCurrentView('ess-portal');
        }
      } else if (user.role === 'HR' && !allowedHrViews.includes(currentView)) {
        setCurrentView('operator');
      }
    }
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
    setCurrentView(user.role === 'Admin' ? 'admin-dashboard' : user.role === 'Employee' ? 'ess-portal' : 'operator');
  };

  const renderView = () => {
    const isMobileMode = (isMobileScreen || forceMobileView);

    // Xử lý các màn hình tự chấm công của nhân viên (hoặc xem thử)
    if (currentView.startsWith('ess-') || user.role === 'Employee') {
      if (!isMobileMode) {
        const tabMap: Record<string, 'checkin' | 'history' | 'requests' | 'device'> = {
          'ess-portal': 'checkin',
          'ess-history': 'history',
          'ess-requests': 'requests',
          'ess-devices': 'device'
        };
        return (
          <PcCheckinView
            initialTab={tabMap[currentView] || 'checkin'}
            onSwitchToMobile={() => setForceMobileView(true)}
            onNavigate={(v) => {
              setCurrentView(v);
              setForceMobileView(false);
            }}
          />
        );
      }
      return <EmployeePortalView />;
    }

    if (user.role === 'HR' && !allowedHrViews.includes(currentView)) {
      return <OperatorWorkflowView />;
    }

    switch (currentView) {
      case 'operator':
        return <OperatorWorkflowView />;
      case 'admin-dashboard':
        return <AdminDashboard onNavigate={(v) => setCurrentView(v)} />;
      case 'admin-hr-attendance':
        return <HrAttendanceView />;
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
            setCurrentView(v);
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
        {renderView()}
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
