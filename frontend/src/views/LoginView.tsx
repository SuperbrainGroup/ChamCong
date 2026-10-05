import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Lock, User, AlertCircle, Clock } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username, password });
      login(res.data.token, res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f1f5f9',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--neutral-200)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: 'var(--primary)',
          color: '#ffffff',
          padding: '32px 24px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(4px)',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <Clock size={32} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>
            HỆ THỐNG TÍNH CHẤM CÔNG
          </h1>
          <p style={{ fontSize: '13px', opacity: 0.9 }}>
            Hệ thống tính công và quản lý ngày làm việc nội bộ
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '32px 28px' }}>
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              backgroundColor: 'var(--danger-light)',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius)',
              color: 'var(--danger-text)',
              fontSize: '13px',
              marginBottom: '20px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{error}</div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Tên đăng nhập</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '38px' }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên đăng nhập..."
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
              <input
                type="password"
                className="form-control"
                style={{ paddingLeft: '38px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập vào hệ thống'}
          </button>

          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--neutral-500)' }}>
            Phiên bản 1.0 — Bản quyền thuộc Hệ thống Superbrain
          </div>
        </form>
      </div>
    </div>
  );
};
