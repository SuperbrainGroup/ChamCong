import React, { useState, useEffect } from 'react';
import { Period, WarningItem, AttendanceCode } from '../../types';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { AlertTriangle, CheckCircle, Edit, Download, Filter, HelpCircle, ArrowRight } from 'lucide-react';

interface Step2WarningsProps {
  period: Period;
  onNextStep: () => void;
}

export const Step2Warnings: React.FC<Step2WarningsProps> = ({ period, onNextStep }) => {
  const toast = useToast();
  const [items, setItems] = useState<WarningItem[]>([]);
  const [codes, setCodes] = useState<AttendanceCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'unresolved' | 'resolved'>('all');
  const [search, setSearch] = useState('');

  // Modal giải trình / sửa mã
  const [selectedItem, setSelectedItem] = useState<WarningItem | null>(null);
  const [overrideCode, setOverrideCode] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [warnRes, codeRes] = await Promise.all([
        api.get<WarningItem[]>(`/periods/${period.id}/warnings`),
        api.get<AttendanceCode[]>(`/companies/${period.companyId}/codes`),
      ]);
      setItems(warnRes.data);
      setCodes(codeRes.data);
    } catch (err) {
      console.error('Lỗi khi tải danh sách cảnh báo:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period.id]);

  const handleOpenModal = (item: WarningItem) => {
    setSelectedItem(item);
    setOverrideCode(item.code || '1');
    setOverrideReason(item.manualReason || '');
    setModalError(null);
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!overrideReason.trim()) {
      setModalError('Vui lòng nhập lý do giải trình / chỉnh sửa mã.');
      return;
    }

    setSaving(true);
    setModalError(null);

    try {
      await api.post(`/periods/${period.id}/override`, {
        employeeId: selectedItem.employeeId,
        date: selectedItem.date,
        code: overrideCode,
        reason: overrideReason.trim(),
      });
      setSelectedItem(null);
      await fetchData();
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Lỗi khi lưu giải trình.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportWarnings = async () => {
    try {
      toast.info('Đang tạo và tải file Excel giải trình cảnh báo...');
      const res = await api.get(`/periods/${period.id}/export-warnings`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CanhBao_${period.year}_${String(period.month).padStart(2, '0')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Đã tải xuống file giải trình cảnh báo thành công!');
    } catch (err: any) {
      toast.error('Lỗi khi tải file cảnh báo.');
    }
  };

  const filteredItems = items.filter((item) => {
    const isUnresolved = (item.code === '?' || item.code === 'V') && !item.isManual;
    if (filterType === 'unresolved' && !isUnresolved) return false;
    if (filterType === 'resolved' && isUnresolved) return false;

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      const matchEmp = item.fullName.toLowerCase().includes(s) || item.employeeCode.toLowerCase().includes(s);
      const matchWarn = item.warnings?.toLowerCase().includes(s) || false;
      return matchEmp || matchWarn;
    }
    return true;
  });

  const unresolvedCount = items.filter((i) => (i.code === '?' || i.code === 'V') && !i.isManual).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header card with summary & actions */}
      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} color="var(--warning)" />
            <span>Danh sách cảnh báo & giải trình công bất thường</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={handleExportWarnings}>
              <Download size={16} />
              <span>Xuất Excel giải trình</span>
            </button>

            <button className="btn btn-primary" onClick={onNextStep}>
              <span>Tiếp tục: Bảng tính công</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <div className="card-body">
          {/* Summary Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            backgroundColor: unresolvedCount > 0 ? 'var(--warning-light)' : 'var(--success-light)',
            border: `1px solid ${unresolvedCount > 0 ? '#fde68a' : '#bbf7d0'}`,
            borderRadius: 'var(--radius)',
            marginBottom: '20px'
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: unresolvedCount > 0 ? 'var(--warning-text)' : 'var(--success-text)' }}>
                {unresolvedCount > 0
                  ? `Còn ${unresolvedCount} trường hợp nghi vấn thiếu quẹt (?) hoặc vắng (V) chưa được chọn mã giải trình`
                  : 'Toàn bộ trường hợp nghi vấn đã được xử lý và giải trình đầy đủ!'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--neutral-600)', marginTop: '2px' }}>
                * Quy định bảo đảm chất lượng: Kỳ công không thể chốt nếu còn tồn tại mã ? hoặc V chưa được chọn mã chính thức kèm lý do.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <span className={`badge ${unresolvedCount > 0 ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '13px', padding: '4px 12px' }}>
                Chưa xử lý: {unresolvedCount}
              </span>
              <span className="badge badge-neutral" style={{ fontSize: '13px', padding: '4px 12px' }}>
                Tổng số cảnh báo: {items.length}
              </span>
            </div>
          </div>

          {/* Filter Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className={`btn btn-sm ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterType('all')}
              >
                Tất cả ({items.length})
              </button>
              <button
                className={`btn btn-sm ${filterType === 'unresolved' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterType('unresolved')}
              >
                Chưa giải trình ({unresolvedCount})
              </button>
              <button
                className={`btn btn-sm ${filterType === 'resolved' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterType('resolved')}
              >
                Đã xử lý ({items.length - unresolvedCount})
              </button>
            </div>

            <input
              type="text"
              className="form-control form-control-sm"
              style={{ width: '280px' }}
              placeholder="Tìm theo nhân viên, cảnh báo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>
              Đang tải danh sách cảnh báo...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>
              Không có trường hợp cảnh báo nào phù hợp với bộ lọc.
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                    <th>Nhân viên</th>
                    <th style={{ textAlign: 'center' }}>Ngày công</th>
                    <th style={{ textAlign: 'center' }}>Giờ vào - ra</th>
                    <th style={{ textAlign: 'center' }}>Mã hiện tại</th>
                    <th>Nội dung cảnh báo</th>
                    <th>Giải trình / Chỉnh sửa</th>
                    <th style={{ textAlign: 'center', width: '100px' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const isUnres = (item.code === '?' || item.code === 'V') && !item.isManual;
                    return (
                      <tr key={item.id} style={{ backgroundColor: isUnres ? '#fffbeb' : undefined }}>
                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--neutral-900)' }}>{item.fullName}</div>
                          <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>
                            Mã: {item.employeeCode} {item.machineCode ? `· Máy: ${item.machineCode}` : ''}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>
                          {new Date(item.date).toLocaleDateString('vi-VN')}
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span style={{ color: item.inTime ? 'var(--neutral-900)' : 'var(--danger)', fontWeight: 600 }}>
                            {item.inTime || '--:--:--'}
                          </span>
                          {' → '}
                          <span style={{ color: item.outTime ? 'var(--neutral-900)' : 'var(--danger)', fontWeight: 600 }}>
                            {item.outTime || '--:--:--'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: item.code === '?' ? '#fef3c7' : (item.code === 'V' ? '#fee2e2' : 'var(--neutral-100)'),
                              color: item.code === '?' ? '#92400e' : (item.code === 'V' ? '#991b1b' : 'var(--neutral-800)'),
                              fontWeight: 800,
                              fontSize: '13px'
                            }}
                          >
                            {item.code || '-'}
                          </span>
                        </td>
                        <td style={{ maxWidth: '280px' }}>
                          <div style={{ color: isUnres ? 'var(--danger-text)' : 'var(--neutral-700)', fontSize: '12px' }}>
                            {item.warnings || (item.code === '?' ? 'Nghi vấn thiếu lượt quẹt' : 'Không có dữ liệu quẹt trong ngày')}
                          </div>
                        </td>
                        <td style={{ maxWidth: '240px' }}>
                          {item.isManual ? (
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--success-text)' }}>
                                {item.manualReason}
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--neutral-500)' }}>
                                Bởi {item.manualBy}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--neutral-400)', fontStyle: 'italic' }}>
                              Chưa có giải trình
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className={`btn btn-sm ${isUnres ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => handleOpenModal(item)}
                          >
                            <Edit size={14} />
                            <span>{isUnres ? 'Xử lý' : 'Sửa'}</span>
                          </button>
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

      {/* Modal Xử lý / Sửa mã thủ công có lý do (Tính năng 4.2.2 & 4.2.3) */}
      {selectedItem && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <div className="card-title">Xử lý & Giải trình ngày công</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedItem(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveOverride}>
              <div className="modal-body">
                {modalError && (
                  <div style={{
                    padding: '10px 14px',
                    backgroundColor: 'var(--danger-light)',
                    color: 'var(--danger-text)',
                    borderRadius: 'var(--radius)',
                    fontSize: '13px',
                    marginBottom: '16px'
                  }}>
                    {modalError}
                  </div>
                )}

                <div style={{
                  padding: '12px 14px',
                  backgroundColor: 'var(--neutral-50)',
                  borderRadius: 'var(--radius)',
                  marginBottom: '16px',
                  fontSize: '13px'
                }}>
                  <div><strong>Nhân viên:</strong> {selectedItem.fullName} ({selectedItem.employeeCode})</div>
                  <div><strong>Ngày:</strong> {new Date(selectedItem.date).toLocaleDateString('vi-VN')}</div>
                  <div><strong>Giờ vào - ra:</strong> {selectedItem.inTime || '--:--:--'} → {selectedItem.outTime || '--:--:--'}</div>
                  {selectedItem.warnings && (
                    <div style={{ color: 'var(--warning-text)', marginTop: '4px' }}>
                      <strong>Cảnh báo:</strong> {selectedItem.warnings}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Chọn mã ký hiệu chính thức</label>
                  <select
                    className="form-control"
                    value={overrideCode}
                    onChange={(e) => setOverrideCode(e.target.value)}
                    required
                  >
                    {codes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name} ({c.workValue + c.holidayValue + c.annualLeaveValue + c.paidLeaveValue} công)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Lý do giải trình / chỉnh sửa (Bắt buộc ghi nhật ký)</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Ví dụ: Quên quẹt thẻ ra, quản lý xác nhận làm đủ giờ; hoặc Có đơn xin nghỉ phép năm..."
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedItem(null)} disabled={saving}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Xác nhận giải trình'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
