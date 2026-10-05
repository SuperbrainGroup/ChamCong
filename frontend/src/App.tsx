import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
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

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<string>(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        return u.role === 'Admin' ? 'admin-dashboard' : 'operator';
      } catch {}
    }
    return 'operator';
  });
  const [showManualChangePwd, setShowManualChangePwd] = useState<boolean>(false);

  const allowedOperatorViews = [
    'operator',
    'admin-employees',
    'admin-calendar',
    'admin-leave',
    'admin-codes'
  ];

  React.useEffect(() => {
    if (user) {
      if (user.role === 'Operator' && !allowedOperatorViews.includes(currentView)) {
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
    setCurrentView(user.role === 'Admin' ? 'admin-dashboard' : 'operator');
  };

  const renderView = () => {
    if (user.role === 'Operator' && !allowedOperatorViews.includes(currentView)) {
      return <OperatorWorkflowView />;
    }

    switch (currentView) {
      case 'operator':
        return <OperatorWorkflowView />;
      case 'admin-dashboard':
        return <AdminDashboard onNavigate={(v) => setCurrentView(v)} />;
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
      default:
        return <OperatorWorkflowView />;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f8fafc',
      fontFamily: "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      <Navbar
        currentView={currentView}
        onNavigate={(v) => setCurrentView(v)}
        onOpenChangePassword={() => setShowManualChangePwd(true)}
      />

      <main style={{ flex: 1, padding: currentView === 'operator' ? '0' : '24px', maxWidth: currentView === 'operator' ? '100%' : '1400px', width: '100%', margin: '0 auto' }}>
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
    <ToastProvider>
      <AuthProvider>
        <MainLayout />
      </AuthProvider>
    </ToastProvider>
  );
}
