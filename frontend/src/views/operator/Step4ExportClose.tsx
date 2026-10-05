import React, { useState } from 'react';
import { Period } from '../../types';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Download, Lock, Unlock, CheckCircle, AlertCircle, FileSpreadsheet, ShieldCheck } from 'lucide-react';

interface Step4ExportCloseProps {
  period: Period;
  onPeriodUpdated: () => void;
}

export const Step4ExportClose: React.FC<Step4ExportCloseProps> = ({ period, onPeriodUpdated }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClosed = period.status === 'Closed';

  const handleDownloadBcc = async () => {
    try {
      toast.info('Đang xuất file Bảng Chấm Công Excel...');
      const res = await api.get(`/periods/${period.id}/export-excel`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `BCC_${period.year}_${String(period.month).padStart(2, '0')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Đã tải xuống Bảng Chấm Công thành công!');
    } catch (err: any) {
      toast.error('Lỗi khi xuất file Bảng Chấm Công.');
    }
  };

  const handleDownloadWarnings = async () => {
    try {
      toast.info('Đang xuất file Báo Cáo Cảnh Báo Excel...');
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
      toast.success('Đã tải xuống Báo Cáo Cảnh Báo thành công!');
    } catch (err: any) {
      toast.error('Lỗi khi xuất file cảnh báo.');
    }
  };

  const handleClosePeriod = async () => {
    const confirmed = await toast.confirm({
      title: 'Xác nhận chốt kỳ công',
      message: 'Bạn có chắc chắn muốn chốt kỳ công này không? Sau khi chốt, dữ liệu sẽ được khóa an toàn và các kết quả, sổ cái phép không thể thay đổi.',
      confirmText: 'Chốt kỳ công',
      type: 'danger'
    });
    if (!confirmed) return;

    setClosing(true);
    setError(null);
    try {
      await api.post(`/periods/${period.id}/close`);
      toast.success('Đã chốt kỳ công thành công!');
      onPeriodUpdated();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể chốt kỳ công.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setClosing(false);
    }
  };

  const handleReopenPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      setError('Vui lòng nhập lý do mở chốt kỳ công.');
      return;
    }

    setReopening(true);
    setError(null);
    try {
      await api.post(`/periods/${period.id}/reopen`, { reason: reopenReason.trim() });
      setShowReopenModal(false);
      setReopenReason('');
      toast.success('Đã mở chốt kỳ công thành công!');
      onPeriodUpdated();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể mở chốt kỳ công.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setReopening(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Export Card */}
      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={20} color="var(--primary)" />
            <span>Xuất file Bảng Chấm Công (BCC) Excel</span>
          </div>
          <span className={`badge ${isClosed ? 'badge-success' : 'badge-warning'}`}>
            {isClosed ? 'KỲ ĐÃ CHỐT' : 'BẢN NHÁP'}
          </span>
        </div>

        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ fontSize: '14px', color: 'var(--neutral-600)', lineHeight: 1.6 }}>
            File Excel xuất ra gồm <strong>2 sheet riêng biệt</strong> (Sheet 1: <strong>Chấm công</strong>; Sheet 2: <strong>Đi trễ về sớm</strong>), đầy đủ <strong>công thức Excel tự động</strong>, font chữ <strong>Times New Roman</strong> và định dạng chuẩn hóa.
          </p>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleDownloadBcc}
            >
              <Download size={18} />
              <span>Tải file Bảng Chấm Công (.xlsx)</span>
            </button>

            <button
              className="btn btn-secondary btn-lg"
              onClick={handleDownloadWarnings}
            >
              <Download size={18} />
              <span>Tải file Danh sách Cảnh báo & Giải trình (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Lock / Close Card */}
      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isClosed ? <Lock size={20} color="var(--success)" /> : <ShieldCheck size={20} color="var(--primary)" />}
            <span>Quy trình Chốt kỳ công</span>
          </div>
        </div>

        <div className="card-body">
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '14px 16px',
              backgroundColor: 'var(--danger-light)',
              color: 'var(--danger-text)',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              marginBottom: '20px'
            }}>
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <div>{error}</div>
            </div>
          )}

          {isClosed ? (
            <div style={{
              padding: '24px',
              backgroundColor: 'var(--success-light)',
              border: '1px solid #bbf7d0',
              borderRadius: 'var(--radius)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success-text)', fontWeight: 800, fontSize: '16px' }}>
                <CheckCircle size={24} />
                <span>KỲ CÔNG NÀY ĐÃ ĐƯỢC CHỐT VÀ KHÓA AN TOÀN!</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--neutral-700)' }}>
                Chốt bởi: <strong>{period.closedBy}</strong> vào lúc{' '}
                <strong>{period.closedAt ? new Date(period.closedAt).toLocaleString('vi-VN') : '-'}</strong>.
                Mọi thao tác nạp lại file, tính công lại hoặc chỉnh sửa đã bị khóa để bảo đảm số liệu lương.
              </div>

              {user?.role === 'Admin' && (
                <div style={{ marginTop: '8px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowReopenModal(true)}
                  >
                    <Unlock size={14} color="var(--danger)" />
                    <span style={{ color: 'var(--danger)' }}>Quản trị viên: Mở chốt kỳ công</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '14px', color: 'var(--neutral-700)', lineHeight: 1.6 }}>
                Khi bạn hoàn tất việc kiểm tra, giải trình và tính công, hãy bấm <strong>"Chốt kỳ công"</strong> để khóa dữ liệu.
              </div>

              <div style={{
                padding: '16px',
                backgroundColor: 'var(--neutral-50)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--neutral-200)',
                fontSize: '13px'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--neutral-800)' }}>
                  Điều kiện để được chốt kỳ:
                </div>
                <ul style={{ paddingLeft: '20px', color: 'var(--neutral-600)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li>Không còn ngày mang mã nghi vấn thiếu quẹt <code>?</code> hoặc vắng <code>V</code> chưa giải trình.</li>
                  <li>Tất cả mã máy chấm công trong file đã được ghép với nhân viên trong danh mục.</li>
                  <li>Đã chạy tính công ít nhất một lần.</li>
                </ul>
              </div>

              <div>
                <button
                  className="btn btn-success btn-lg"
                  onClick={handleClosePeriod}
                  disabled={closing || period.status === 'Draft'}
                >
                  <Lock size={18} />
                  <span>{closing ? 'Đang kiểm tra & chốt kỳ...' : 'Xác nhận Chốt kỳ công'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Mở chốt kỳ cho Admin */}
      {showReopenModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Unlock size={18} color="var(--danger)" />
                <span>Mở chốt kỳ công</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowReopenModal(false)}>✕</button>
            </div>

            <form onSubmit={handleReopenPeriod}>
              <div className="modal-body">
                <p style={{ fontSize: '13px', color: 'var(--neutral-600)', marginBottom: '16px' }}>
                  Mở chốt sẽ cho phép nhân viên chấm công tính lại hoặc chỉnh sửa kết quả. Hành động này sẽ được ghi vào nhật ký kiểm toán hệ thống.
                </p>

                <div className="form-group">
                  <label className="form-label">Lý do mở chốt kỳ (Bắt buộc ghi nhật ký)</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Ví dụ: Bổ sung nhân viên mới chuyển vào chi nhánh, duyệt bổ sung đơn nghỉ phép..."
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowReopenModal(false)} disabled={reopening}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-danger" disabled={reopening}>
                  {reopening ? 'Đang mở chốt...' : 'Xác nhận Mở chốt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
