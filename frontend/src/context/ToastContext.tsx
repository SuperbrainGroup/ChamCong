import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  HelpCircle
} from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'primary';
}

interface ConfirmState extends ConfirmOptions {
  id: string;
  resolve: (value: boolean) => void;
}

export interface ToastContextType {
  success: (message: string, title?: string, duration?: number) => void;
  error: (message: string, title?: string, duration?: number) => void;
  warning: (message: string, title?: string, duration?: number) => void;
  info: (message: string, title?: string, duration?: number) => void;
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Global reference for access outside React tree if needed
export let globalToast: ToastContextType | null = null;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: 'success' | 'error' | 'warning' | 'info', message: string, title?: string, duration = 3500) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((message: string, title?: string, duration?: number) => {
    addToast('success', message, title, duration);
  }, [addToast]);

  const error = useCallback((message: string, title?: string, duration?: number) => {
    addToast('error', message, title || 'Lỗi', duration || 4500);
  }, [addToast]);

  const warning = useCallback((message: string, title?: string, duration?: number) => {
    addToast('warning', message, title || 'Cảnh báo', duration || 4000);
  }, [addToast]);

  const info = useCallback((message: string, title?: string, duration?: number) => {
    addToast('info', message, title, duration);
  }, [addToast]);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const parsedOptions: ConfirmOptions =
        typeof options === 'string'
          ? {
              title: 'Xác nhận thao tác',
              message: options,
              confirmText: 'Xác nhận',
              cancelText: 'Hủy',
              type: 'primary'
            }
          : {
              title: options.title || 'Xác nhận thao tác',
              message: options.message,
              confirmText: options.confirmText || 'Xác nhận',
              cancelText: options.cancelText || 'Hủy',
              type: options.type || 'primary'
            };

      const id = `${Date.now()}`;
      confirmResolveRef.current = resolve;
      setConfirmState({
        ...parsedOptions,
        id,
        resolve
      });
    });
  }, []);

  const handleConfirmAction = (result: boolean) => {
    if (confirmResolveRef.current) {
      confirmResolveRef.current(result);
      confirmResolveRef.current = null;
    }
    setConfirmState(null);
  };

  const contextValue: ToastContextType = {
    success,
    error,
    warning,
    info,
    confirm
  };

  globalToast = contextValue;

  // Polyfill window.alert to automatically show toast
  useEffect(() => {
    const originalAlert = window.alert;
    (window as any).alert = (msg: any) => {
      const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
      if (text.toLowerCase().includes('lỗi') || text.toLowerCase().includes('error')) {
        error(text);
      } else if (text.toLowerCase().includes('thành công') || text.toLowerCase().includes('success')) {
        success(text);
      } else {
        info(text);
      }
    };

    return () => {
      window.alert = originalAlert;
    };
  }, [error, success, info]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* FIXED TOP-RIGHT TOAST & CONFIRM CONTAINER */}
      <div className="toast-container" role="region" aria-label="Thông báo hệ thống">
        {/* 1. TOAST CONFIRM CARD (IF ACTIVE) */}
        {confirmState && (
          <div
            className="toast-confirm-card"
            style={{
              borderColor:
                confirmState.type === 'danger'
                  ? '#dc2626'
                  : confirmState.type === 'warning'
                  ? '#d97706'
                  : 'var(--primary)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              {confirmState.type === 'danger' ? (
                <AlertCircle size={22} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              ) : confirmState.type === 'warning' ? (
                <AlertTriangle size={22} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
              ) : (
                <HelpCircle size={22} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
                  {confirmState.title}
                </div>
                <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px', lineHeight: 1.5 }}>
                  {confirmState.message}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '6px 12px', fontSize: '12.5px' }}
                onClick={() => handleConfirmAction(false)}
              >
                {confirmState.cancelText}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${confirmState.type === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                style={{
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  backgroundColor: confirmState.type === 'danger' ? '#dc2626' : undefined
                }}
                onClick={() => handleConfirmAction(true)}
                autoFocus
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        )}

        {/* 2. REGULAR TOAST ITEMS */}
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item toast-${t.type}`}>
            {t.type === 'success' && <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0, marginTop: '1px' }} />}
            {t.type === 'error' && <AlertCircle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />}
            {t.type === 'warning' && <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />}
            {t.type === 'info' && <Info size={20} color="#2563eb" style={{ flexShrink: 0, marginTop: '1px' }} />}

            <div style={{ flex: 1, minWidth: 0 }}>
              {t.title && (
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', marginBottom: '2px' }}>
                  {t.title}
                </div>
              )}
              <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.45, wordBreak: 'break-word' }}>
                {t.message}
              </div>
            </div>

            <button
              type="button"
              onClick={() => removeToast(t.id)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'color 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              title="Đóng thông báo"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    if (globalToast) return globalToast;
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
