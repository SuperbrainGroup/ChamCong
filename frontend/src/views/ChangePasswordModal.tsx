import React, { useState } from 'react';
import { api } from '../api/client';
import { X, KeyRound, AlertCircle, CheckCircle } from 'lucide-react';

interface ChangePasswordModalProps {
  onClose: () => void;
  mustChange?: boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose, mustChange }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không trùng khớp.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword });
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thể đổi mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <KeyRound size={20} color="var(--primary)" />
            <div className="card-title">Đổi mật khẩu</div>
          </div>
          {!mustChange && (
            <button className="btn btn-secondary btn-sm" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {mustChange && (
              <div style={{
                padding: '10px 14px',
                backgroundColor: 'var(--warning-light)',
                color: 'var(--warning-text)',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                Đây là lần đăng nhập đầu tiên hoặc mật khẩu đã được đặt lại. Vui lòng đổi mật khẩu để bảo đảm an toàn.
              </div>
            )}

            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                backgroundColor: 'var(--danger-light)',
                color: 'var(--danger-text)',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                <AlertCircle size={16} />
                <div>{error}</div>
              </div>
            )}

            {success && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                backgroundColor: 'var(--success-light)',
                color: 'var(--success-text)',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                <CheckCircle size={16} />
                <div>Đổi mật khẩu thành công!</div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Mật khẩu hiện tại</label>
              <input
                type="password"
                className="form-control"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Mật khẩu mới (tối thiểu 8 ký tự)</label>
              <input
                type="password"
                className="form-control"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            {!mustChange && (
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                Hủy
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
