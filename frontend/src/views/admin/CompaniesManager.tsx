import React, { useState, useEffect } from 'react';
import { Company } from '../../types';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Building2, Plus, Edit2, Upload, Trash2, ArrowLeft, Check, AlertCircle } from 'lucide-react';

interface CompaniesManagerProps {
  onBack?: () => void;
}

export const CompaniesManager: React.FC<CompaniesManagerProps> = ({ onBack }) => {
  const { refreshCompanies } = useAuth();
  const toast = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal thêm / sửa
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload Logo
  const [uploadingLogoComp, setUploadingLogoComp] = useState<Company | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await api.get<Company[]>('/companies');
      setCompanies(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setCode('');
    setName('');
    setIsActive(true);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (c: Company) => {
    setEditingId(c.id);
    setCode(c.code);
    setName(c.name);
    setIsActive(c.isActive);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        await api.put(`/companies/${editingId}`, { name, isActive });
      } else {
        await api.post('/companies', { code, name });
      }
      setShowModal(false);
      await fetchCompanies();
      await refreshCompanies();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi lưu hội sở.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadLogoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadingLogoComp || !logoFile) return;

    setUploadingLogo(true);
    const formData = new FormData();
    formData.append('file', logoFile);

    try {
      await api.post(`/companies/${uploadingLogoComp.id}/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadingLogoComp(null);
      setLogoFile(null);
      toast.success('Đã tải logo lên thành công!');
      await fetchCompanies();
      await refreshCompanies();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi tải logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async (c: Company) => {
    const confirmed = await toast.confirm({
      title: 'Xác nhận xóa logo',
      message: `Bạn có chắc muốn xóa logo của hội sở "${c.name}" không?`,
      confirmText: 'Xóa logo',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.delete(`/companies/${c.id}/logo`);
      toast.success(`Đã xóa logo của hội sở "${c.name}" thành công.`);
      await fetchCompanies();
      await refreshCompanies();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi xóa logo.');
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Quản lý Hội sở / Đơn vị
          </div>
          <div style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '2px' }}>
            Danh sách các đơn vị thành viên, hội sở trong hệ thống Superbrain
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleOpenCreate}>
          <Plus size={16} />
          <span>Thêm hội sở mới</span>
        </button>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>
              Đang tải danh sách hội sở...
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '60px', textAlign: 'center' }}>STT</th>
                    <th style={{ width: '100px' }}>Logo</th>
                    <th style={{ width: '120px' }}>Mã hội sở</th>
                    <th>Tên hiển thị trên Báo cáo</th>
                    <th style={{ width: '140px', textAlign: 'center' }}>Trạng thái</th>
                    <th style={{ width: '220px', textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c, idx) => (
                    <tr key={c.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>
                        {c.hasLogo ? (
                          <img
                            src={`/api/companies/${c.id}/logo?t=${Date.now()}`}
                            alt={c.name}
                            style={{ height: '32px', maxWidth: '90px', objectFit: 'contain' }}
                          />
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--neutral-400)', fontStyle: 'italic' }}>Chưa có</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700 }}>{c.code}</td>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${c.isActive ? 'badge-success' : 'badge-neutral'}`}>
                          {c.isActive ? 'Đang hoạt động' : 'Ngưng sử dụng'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(c)}>
                            <Edit2 size={13} />
                            <span>Sửa</span>
                          </button>

                          <button className="btn btn-secondary btn-sm" onClick={() => setUploadingLogoComp(c)}>
                            <Upload size={13} />
                            <span>Logo</span>
                          </button>

                          {c.hasLogo && (
                            <button className="btn btn-secondary btn-sm" onClick={() => handleDeleteLogo(c)} title="Xóa logo">
                              <Trash2 size={13} color="var(--danger)" />
                            </button>
                          )}
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

      {/* Modal Thêm/Sửa Hội sở */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div className="card-title">{editingId ? 'Chỉnh sửa Hội sở' : 'Thêm Hội sở mới'}</div>
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
                  <label className="form-label">Mã hội sở (Viết hoa, duy nhất)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    disabled={!!editingId}
                    placeholder="Ví dụ: SPB_HO, SPB_HUE..."
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tên đầy đủ (Hiển thị tiêu đề Báo cáo)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ví dụ: CÔNG TY CỔ PHẦN SUPERBRAIN GROUP"
                    required
                  />
                </div>

                {editingId && (
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                      />
                      <span>Đang hoạt động</span>
                    </label>
                  </div>
                )}

                {!editingId && (
                  <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '8px' }}>
                    * Khi tạo mới, hệ thống tự động khởi tạo sẵn 3 khối nhân viên (Chuẩn, Part-time, Remote), sao chép 14 mã ký hiệu quy chuẩn và bảng tham số quản trị.
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu hội sở'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Upload Logo */}
      {uploadingLogoComp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div className="card-title">Cập nhật Logo: {uploadingLogoComp.name}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setUploadingLogoComp(null)}>✕</button>
            </div>

            <form onSubmit={handleUploadLogoSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '13px', color: 'var(--neutral-600)', marginBottom: '16px' }}>
                  Logo được hiển thị trên thanh điều hướng khi chọn hội sở này. Chấp nhận file ảnh PNG, JPG hoặc SVG dung lượng dưới 1MB.
                </p>

                <input
                  type="file"
                  accept="image/png, image/jpeg, image/svg+xml"
                  onChange={(e) => e.target.files && setLogoFile(e.target.files[0])}
                  required
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setUploadingLogoComp(null)} disabled={uploadingLogo}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={!logoFile || uploadingLogo}>
                  {uploadingLogo ? 'Đang tải lên...' : 'Tải lên logo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
