import React, { useState, useEffect } from 'react';
import { User, Company } from '../../types';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Users, Plus, Edit2, Lock, Unlock, KeyRound, ArrowLeft, Shield, AlertCircle } from 'lucide-react';

interface UsersManagerProps {
  onBack?: () => void;
}

export const UsersManager: React.FC<UsersManagerProps> = ({ onBack }) => {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal thêm/sửa
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Admin' | 'Operator'>('Operator');
  const [isActive, setIsActive] = useState(true);
  const [assignedCompanies, setAssignedCompanies] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal đặt lại mật khẩu
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, cRes] = await Promise.all([
        api.get<User[]>('/users'),
        api.get<Company[]>('/companies'),
      ]);
      setUsers(uRes.data);
      setCompanies(cRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setUsername('');
    setFullName('');
    setPassword('');
    setRole('Operator');
    setIsActive(true);
    setAssignedCompanies(companies.length > 0 ? [companies[0].id] : []);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingId(u.id);
    setUsername(u.username);
    setFullName(u.fullName);
    setRole(u.role);
    setIsActive(u.isActive);
    setAssignedCompanies(u.assignedCompanyIds || []);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, {
          fullName,
          role,
          isActive,
          assignedCompanyIds: assignedCompanies,
        });
      } else {
        await api.post('/users', {
          username,
          fullName,
          password,
          role,
          assignedCompanyIds: assignedCompanies,
        });
      }
      setShowModal(false);
      toast.success(editingId ? 'Cập nhật tài khoản thành công!' : 'Thêm tài khoản mới thành công!');
      await fetchData();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Lỗi khi lưu tài khoản.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLock = async (u: User) => {
    const confirmed = await toast.confirm({
      title: u.isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản',
      message: u.isLocked
        ? `Bạn có chắc muốn mở khóa cho tài khoản @${u.username}?`
        : `Bạn có chắc muốn khóa tài khoản @${u.username}? Tài khoản sẽ không thể đăng nhập.`,
      confirmText: u.isLocked ? 'Mở khóa' : 'Khóa tài khoản',
      type: u.isLocked ? 'primary' : 'warning'
    });
    if (!confirmed) return;

    try {
      await api.post(`/users/${u.id}/toggle-lock`);
      toast.success(u.isLocked ? `Đã mở khóa tài khoản @${u.username}` : `Đã khóa tài khoản @${u.username}`);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi thay đổi trạng thái khóa.');
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;
    setResetting(true);
    try {
      await api.post(`/users/${resettingUser.id}/reset-password`, { newPassword });
      setResettingUser(null);
      setNewPassword('');
      toast.success('Đã đặt lại mật khẩu thành công. Người dùng sẽ phải đổi mật khẩu khi đăng nhập.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi đặt lại mật khẩu.');
    } finally {
      setResetting(false);
    }
  };

  const compMap = React.useMemo(() => {
    return new Map(companies.map(c => [c.id, c]));
  }, [companies]);

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Quản trị Tài khoản & Phân quyền
          </div>
          <div style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '2px' }}>
            Quản lý tài khoản đăng nhập, gán vai trò Quản trị viên và Hội sở phụ trách
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleOpenCreate}>
          <Plus size={16} />
          <span>Tạo tài khoản mới</span>
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>
              Đang tải danh sách tài khoản...
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                    <th>Tên đăng nhập</th>
                    <th>Họ và tên</th>
                    <th style={{ textAlign: 'center' }}>Vai trò</th>
                    <th>Hội sở được gán</th>
                    <th style={{ textAlign: 'center' }}>Trạng thái</th>
                    <th style={{ textAlign: 'center' }}>Đăng nhập cuối</th>
                    <th style={{ textAlign: 'center', width: '220px' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, idx) => (
                    <tr key={u.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 700 }}>{u.username}</td>
                      <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${u.role === 'Admin' ? 'badge-primary' : 'badge-neutral'}`}>
                          {u.role === 'Admin' ? 'Quản trị viên' : 'NV Chấm công'}
                        </span>
                      </td>
                      <td>
                        {u.role === 'Admin' ? (
                          <span style={{ fontSize: '12px', color: 'var(--primary-text)', fontWeight: 600 }}>
                            Toàn quyền tất cả hội sở
                          </span>
                        ) : u.assignedCompanyIds && u.assignedCompanyIds.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {u.assignedCompanyIds.map((cid) => {
                              const c = compMap.get(cid);
                              return c ? (
                                <span key={cid} className="badge badge-neutral" style={{ fontSize: '11px' }}>
                                  {c.code}
                                </span>
                              ) : null;
                            })}
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--danger-text)' }}>Chưa gán hội sở</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {u.isLocked ? (
                          <span className="badge badge-danger">Bị khóa (sai pass)</span>
                        ) : !u.isActive ? (
                          <span className="badge badge-neutral">Vô hiệu hóa</span>
                        ) : (
                          <span className="badge badge-success">Đang hoạt động</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '12px', color: 'var(--neutral-500)' }}>
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('vi-VN') : 'Chưa đăng nhập'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(u)} title="Sửa thông tin">
                            <Edit2 size={13} />
                          </button>

                          <button className="btn btn-secondary btn-sm" onClick={() => { setResettingUser(u); setNewPassword('Admin@123'); }} title="Đặt lại mật khẩu">
                            <KeyRound size={13} />
                          </button>

                          <button
                            className={`btn btn-sm ${u.isLocked ? 'btn-danger' : 'btn-secondary'}`}
                            onClick={() => handleToggleLock(u)}
                            title={u.isLocked ? 'Mở khóa' : 'Khóa tài khoản'}
                          >
                            {u.isLocked ? <Unlock size={13} /> : <Lock size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Thêm/Sửa Tài khoản */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <div className="card-title">{editingId ? 'Chỉnh sửa Tài khoản' : 'Tạo Tài khoản mới'}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                {error && (
                  <div style={{
                    padding: '10px 14px',
                    backgroundColor: 'var(--danger-light)',
                    color: 'var(--danger-text)',
                    borderRadius: 'var(--radius)',
                    fontSize: '13px',
                    marginBottom: '16px'
                  }}>
                    {error}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Tên đăng nhập</label>
                  <input
                    type="text"
                    className="form-control"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    disabled={!!editingId}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Họ và tên</label>
                  <input
                    type="text"
                    className="form-control"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>

                {!editingId && (
                  <div className="form-group">
                    <label className="form-label">Mật khẩu khởi tạo (tối thiểu 8 ký tự)</label>
                    <input
                      type="password"
                      className="form-control"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Vai trò</label>
                  <select
                    className="form-control"
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                  >
                    <option value="Operator">Nhân viên chấm công (Operator)</option>
                    <option value="Admin">Quản trị viên (Admin)</option>
                  </select>
                </div>

                {role === 'Operator' && (
                  <div className="form-group">
                    <label className="form-label">Gán các Hội sở phụ trách</label>
                    <div style={{
                      maxHeight: '160px',
                      overflowY: 'auto',
                      border: '1px solid var(--neutral-300)',
                      borderRadius: 'var(--radius)',
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      {companies.map((c) => (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={assignedCompanies.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) setAssignedCompanies([...assignedCompanies, c.id]);
                              else setAssignedCompanies(assignedCompanies.filter(x => x !== c.id));
                            }}
                          />
                          <span>{c.code} - {c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {editingId && (
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                      />
                      <span>Tài khoản đang hoạt động</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Đặt lại mật khẩu */}
      {resettingUser && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div className="card-title">Đặt lại mật khẩu: {resettingUser.username}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setResettingUser(null)}>✕</button>
            </div>

            <form onSubmit={handleResetPasswordSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '13px', color: 'var(--neutral-600)', marginBottom: '16px' }}>
                  Người dùng sẽ nhận mật khẩu mới này và bị buộc phải đổi mật khẩu ở lần đăng nhập tiếp theo.
                </p>

                <div className="form-group">
                  <label className="form-label">Mật khẩu mới (tối thiểu 8 ký tự)</label>
                  <input
                    type="password"
                    className="form-control"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setResettingUser(null)} disabled={resetting}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={resetting}>
                  {resetting ? 'Đang lưu...' : 'Xác nhận đặt lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
