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
  const { refreshCompanies, selectedCompany } = useAuth();
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

  // Xóa Hội sở (Modal xác nhận 2 bước)
  const [deletingComp, setDeletingComp] = useState<Company | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteDepInfo, setDeleteDepInfo] = useState<{ employeeCount?: number; periodCount?: number; message?: string } | null>(null);

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
      await api.post(`/companies/${uploadingLogoComp.id}/logo`, formData);
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

  // Bắt đầu quy trình xóa hội sở (Bước 1)
  const handleStartDelete = (c: Company) => {
    setDeletingComp(c);
    setDeleteStep(1);
    setDeleteConfirmInput('');
    setDeleteDepInfo(null);
  };

  // Bước 1: Thử xóa thông thường, nếu có dữ liệu thì chuyển sang Bước 2
  const handleProceedDeleteStep1 = async () => {
    if (!deletingComp) return;
    setDeleteLoading(true);

    try {
      const res = await api.delete(`/companies/${deletingComp.id}`);
      toast.success(res.data?.message || `Đã xóa hội sở "${deletingComp.name}" thành công.`);
      setDeletingComp(null);
      await fetchCompanies();
      await refreshCompanies();
    } catch (err: any) {
      const resData = err.response?.data;
      if (resData?.hasDependencies) {
        // Có nhân sự hoặc kỳ công -> Chuyển sang Bước 2 xác thực nguy hiểm
        setDeleteDepInfo({
          employeeCount: resData.employeeCount,
          periodCount: resData.periodCount,
          message: resData.message
        });
        setDeleteStep(2);
      } else {
        toast.error(resData?.message || 'Không thể xóa hội sở này.');
        setDeletingComp(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // Bước 2: Xóa vĩnh viễn (Force delete) sau khi người dùng gõ đúng mã hội sở
  const handleConfirmForceDelete = async () => {
    if (!deletingComp || deleteConfirmInput !== deletingComp.code) return;
    setDeleteLoading(true);

    try {
      const res = await api.delete(`/companies/${deletingComp.id}/force`);
      toast.success(res.data?.message || `Đã xóa vĩnh viễn hội sở "${deletingComp.name}" và toàn bộ dữ liệu thành công.`);
      setDeletingComp(null);
      await fetchCompanies();
      await refreshCompanies();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi xóa cưỡng bức hội sở.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Quản lý Hội sở / Đơn vị — {selectedCompany ? selectedCompany.name : 'Tất cả hội sở'}
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
                    <th style={{ width: '250px', textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c, idx) => {
                    const isSystemComp = c.code === 'SUPERBRAIN' || c.id === 1;

                    return (
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

                            {isSystemComp ? (
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ opacity: 0.45, cursor: 'not-allowed', color: 'var(--neutral-400)' }}
                                disabled
                                title="Hội sở gốc 'SUPERBRAIN' là đơn vị mặc định của hệ thống, không thể xóa"
                              >
                                <Trash2 size={13} />
                                <span>Xóa</span>
                              </button>
                            ) : (
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                                onClick={() => handleStartDelete(c)}
                                title={`Xóa hội sở ${c.name}`}
                              >
                                <Trash2 size={13} />
                                <span>Xóa</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
      {/* Modal Xóa Hội sở 2 bước */}
      {deletingComp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--neutral-200)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontWeight: 700, fontSize: '16px' }}>
                <AlertCircle size={20} />
                <span>
                  {deleteStep === 1
                    ? 'Xác nhận xóa hội sở (Bước 1/2)'
                    : '⚠️ CẢNH BÁO NGUY HIỂM: Xóa vĩnh viễn (Bước 2/2)'}
                </span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setDeletingComp(null); setDeleteStep(1); setDeleteConfirmInput(''); }}
                disabled={deleteLoading}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {deleteStep === 1 ? (
                <>
                  <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--neutral-800)' }}>
                    Bạn có chắc chắn muốn xóa hội sở <strong>{deletingComp.name}</strong> (Mã: <code>{deletingComp.code}</code>) khỏi hệ thống không?
                  </div>

                  <div style={{
                    padding: '12px 14px',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fef3c7',
                    borderRadius: 'var(--radius)',
                    fontSize: '13px',
                    color: '#92400e',
                    lineHeight: 1.5
                  }}>
                    💡 <strong>Lưu ý:</strong> Nếu hội sở này chưa có nhân viên và kỳ công nào phát sinh, hệ thống sẽ tiến hành xóa ngay các cấu hình mặc định.
                    Nếu hội sở đã có dữ liệu chấm công / nhân sự thực tế, hệ thống sẽ chuyển sang bước xác nhận an toàn cấp cao (Bước 2).
                  </div>
                </>
              ) : (
                <>
                  <div style={{
                    padding: '14px 16px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fee2e2',
                    borderRadius: 'var(--radius)',
                    color: '#991b1b',
                    fontSize: '13px',
                    lineHeight: 1.6
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={16} />
                      <span>HỘI SỞ ĐÃ PHÁT SINH DỮ LIỆU THỰC TẾ!</span>
                    </div>
                    <div>
                      Hội sở <strong>{deletingComp.name}</strong> đang có dữ liệu trong hệ thống:
                      <ul style={{ margin: '6px 0 6px 20px', padding: 0 }}>
                        {deleteDepInfo?.employeeCount ? <li><strong>{deleteDepInfo.employeeCount}</strong> nhân sự trực thuộc</li> : null}
                        {deleteDepInfo?.periodCount ? <li><strong>{deleteDepInfo.periodCount}</strong> kỳ công và bảng chấm công</li> : null}
                      </ul>
                      Thao tác xóa vĩnh viễn (Force Delete) sẽ <strong>XÓA SẠCH VĨNH VIỄN</strong> toàn bộ dữ liệu quẹt thẻ, kết quả công các tháng, quỹ phép, đơn từ, bảng mã và phân quyền liên quan.
                      <div style={{ marginTop: '6px', fontWeight: 700, color: '#dc2626' }}>
                        Hành động này KHÔNG THỂ HOÀN TÁC!
                      </div>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '8px' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                      Để xác nhận, vui lòng nhập chính xác mã hội sở <span style={{ color: 'var(--danger)', fontWeight: 800 }}>{deletingComp.code}</span> vào ô bên dưới:
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={deleteConfirmInput}
                      onChange={(e) => setDeleteConfirmInput(e.target.value.toUpperCase().trim())}
                      placeholder={`Nhập ${deletingComp.code} để xác nhận`}
                      autoFocus
                    />
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--neutral-200)', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setDeletingComp(null); setDeleteStep(1); setDeleteConfirmInput(''); }}
                disabled={deleteLoading}
              >
                Hủy bỏ
              </button>

              {deleteStep === 1 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={handleProceedDeleteStep1}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? 'Đang kiểm tra...' : 'Tiếp tục xóa'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    backgroundColor: deleteConfirmInput === deletingComp.code ? 'var(--danger)' : '#fca5a5',
                    borderColor: deleteConfirmInput === deletingComp.code ? 'var(--danger)' : '#fca5a5',
                    cursor: deleteConfirmInput === deletingComp.code ? 'pointer' : 'not-allowed'
                  }}
                  onClick={handleConfirmForceDelete}
                  disabled={deleteConfirmInput !== deletingComp.code || deleteLoading}
                >
                  {deleteLoading ? 'Đang xóa toàn bộ dữ liệu...' : 'XÁC NHẬN XÓA VĨNH VIỄN'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
