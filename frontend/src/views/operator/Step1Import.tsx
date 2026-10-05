import React, { useState } from 'react';
import { Period, InspectionReport } from '../../types';
import { api } from '../../api/client';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, AlertCircle, ArrowRight, UserX, Clock } from 'lucide-react';

interface Step1ImportProps {
  period: Period;
  onImportSuccess: () => void;
  onNextStep: () => void;
}

export const Step1Import: React.FC<Step1ImportProps> = ({ period, onImportSuccess, onNextStep }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setReport(null);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
        setFile(droppedFile);
        setReport(null);
        setError(null);
      } else {
        setError('Vui lòng chọn file định dạng Excel (.xlsx hoặc .xls).');
      }
    }
  };

  const handleInspect = async () => {
    if (!file) return;
    setInspecting(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // commit = false: chỉ kiểm tra và đối chiếu
      const res = await api.post<InspectionReport>(`/periods/${period.id}/import-punches?commit=false`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setReport(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi đọc file chấm công.');
    } finally {
      setInspecting(false);
    }
  };

  const handleCommit = async () => {
    if (!file) return;
    setCommitting(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // commit = true: lưu dữ liệu thô vào hệ thống
      await api.post(`/periods/${period.id}/import-punches?commit=true`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onImportSuccess();
      onNextStep();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi nạp dữ liệu vào kỳ công.');
    } finally {
      setCommitting(false);
    }
  };

  const isClosed = period.status === 'Closed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Upload Zone */}
      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={18} color="var(--primary)" />
            <span>Nạp file Excel máy chấm công (MyTime)</span>
          </div>
          <span className="badge badge-neutral">Kỳ: {String(period.month).padStart(2, '0')}/{period.year} ({new Date(period.fromDate).toLocaleDateString('vi-VN')} - {new Date(period.toDate).toLocaleDateString('vi-VN')})</span>
        </div>

        <div className="card-body">
          {isClosed ? (
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--neutral-100)',
              borderRadius: 'var(--radius)',
              color: 'var(--neutral-600)',
              textAlign: 'center'
            }}>
              Kỳ công đã chốt. Để nạp lại file, Quản trị viên cần thực hiện mở chốt kỳ công.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  border: isDragging ? '2px dashed var(--primary)' : '2px dashed var(--neutral-300)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '36px 20px',
                  textAlign: 'center',
                  backgroundColor: isDragging ? '#eff6ff' : (file ? 'var(--primary-light)' : 'var(--neutral-50)'),
                  cursor: 'pointer',
                  transform: isDragging ? 'scale(1.01)' : 'none',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => document.getElementById('punchFileInput')?.click()}
              >
                <input
                  id="punchFileInput"
                  type="file"
                  accept=".xlsx, .xls"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <Upload size={36} color={isDragging || file ? 'var(--primary)' : 'var(--neutral-400)'} style={{ margin: '0 auto 12px' }} />
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--neutral-800)', marginBottom: '4px' }}>
                  {file ? file.name : (isDragging ? 'Thả file Excel vào đây...' : 'Kéo thả hoặc nhấp để chọn file Excel chấm công (.xlsx, .xls)')}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>
                  {file ? `Dung lượng: ${(file.size / 1024).toFixed(1)} KB` : 'Định dạng file xuất từ phần mềm chấm công (các cột: Mã NV, Tên NV, Ngày công MM/dd/yyyy, Vào, Ra...)'}
                </div>
              </div>

              {error && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  backgroundColor: 'var(--danger-light)',
                  color: 'var(--danger-text)',
                  borderRadius: 'var(--radius)',
                  fontSize: '13px'
                }}>
                  <AlertCircle size={18} />
                  <div>{error}</div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleInspect}
                  disabled={!file || inspecting || committing}
                >
                  {inspecting ? 'Đang đọc & kiểm tra...' : 'Kiểm tra & đối chiếu'}
                </button>

                <button
                  className="btn btn-primary"
                  onClick={handleCommit}
                  disabled={!file || committing || inspecting}
                >
                  <CheckCircle2 size={16} />
                  <span>{committing ? 'Đang lưu vào kỳ công...' : 'Xác nhận Nạp dữ liệu'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Báo cáo kiểm tra sau khi đọc file (Tính năng 2.1.4) */}
      {report && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Báo cáo kết quả kiểm tra file</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className="badge badge-success">Hợp lệ: {report.validRows} dòng</span>
              {report.errorRows > 0 && <span className="badge badge-danger">Lỗi: {report.errorRows} dòng</span>}
              {report.warningRows > 0 && <span className="badge badge-warning">Cảnh báo: {report.warningRows} dòng</span>}
            </div>
          </div>

          <div className="card-body">
            {/* Thẻ thống kê nhanh */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ padding: '16px', backgroundColor: 'var(--neutral-50)', borderRadius: 'var(--radius)', border: '1px solid var(--neutral-200)' }}>
                <div style={{ fontSize: '12px', color: 'var(--neutral-500)', fontWeight: 600 }}>TỔNG SỐ DÒNG ĐỌC ĐƯỢC</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--neutral-900)' }}>{report.totalRows}</div>
              </div>

              <div style={{ padding: '16px', backgroundColor: 'var(--success-light)', borderRadius: 'var(--radius)', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '12px', color: 'var(--success-text)', fontWeight: 600 }}>NHÂN VIÊN KHỚP THÀNH CÔNG</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--success-text)' }}>{report.matchedEmployees}</div>
              </div>

              <div style={{ padding: '16px', backgroundColor: report.unmatchedEmployees > 0 ? 'var(--warning-light)' : 'var(--neutral-50)', borderRadius: 'var(--radius)', border: '1px solid var(--neutral-200)' }}>
                <div style={{ fontSize: '12px', color: report.unmatchedEmployees > 0 ? 'var(--warning-text)' : 'var(--neutral-500)', fontWeight: 600 }}>MÃ MÁY CHƯA KHỚP</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: report.unmatchedEmployees > 0 ? 'var(--warning-text)' : 'var(--neutral-900)' }}>{report.unmatchedEmployees}</div>
              </div>

              <div style={{ padding: '16px', backgroundColor: 'var(--neutral-50)', borderRadius: 'var(--radius)', border: '1px solid var(--neutral-200)' }}>
                <div style={{ fontSize: '12px', color: 'var(--neutral-500)', fontWeight: 600 }}>NV KHÔNG CÓ DỮ LIỆU MÁY</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--neutral-900)' }}>{report.missingPunchEmployees.length}</div>
              </div>
            </div>

            {/* Cảnh báo mã máy chưa khớp */}
            {report.unmatchedMachineCodes.length > 0 && (
              <div style={{
                padding: '14px 18px',
                backgroundColor: 'var(--warning-light)',
                border: '1px solid #fde68a',
                borderRadius: 'var(--radius)',
                color: 'var(--warning-text)',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px' }}>
                  <UserX size={18} />
                  <span>Các mã máy chấm công chưa được gán cho nhân viên:</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {report.unmatchedMachineCodes.map((code) => (
                    <span key={code} className="badge badge-warning" style={{ fontSize: '12px' }}>
                      Mã: {code}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--neutral-600)' }}>
                  * Gợi ý: Bạn có thể vào "Danh mục nhân sự" để bổ sung mã máy này cho nhân viên tương ứng.
                </div>
              </div>
            )}

            {/* Cảnh báo nhân viên trong danh mục nhưng không quẹt */}
            {report.missingPunchEmployees.length > 0 && (
              <div style={{
                padding: '14px 18px',
                backgroundColor: 'var(--neutral-100)',
                border: '1px solid var(--neutral-300)',
                borderRadius: 'var(--radius)',
                color: 'var(--neutral-700)',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px' }}>
                  <Clock size={18} />
                  <span>Nhân viên có trong danh mục nhưng không có lần quẹt nào trong file:</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {report.missingPunchEmployees.map((name) => (
                    <span key={name} className="badge badge-neutral" style={{ fontSize: '11px' }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Danh sách lỗi dòng nếu có */}
            {report.errors.length > 0 && (
              <div style={{
                padding: '14px 18px',
                backgroundColor: 'var(--danger-light)',
                border: '1px solid #fecaca',
                borderRadius: 'var(--radius)',
                color: 'var(--danger-text)',
                fontSize: '13px'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>Chi tiết các dòng bị lỗi không thể xác định ngày công:</div>
                <ul style={{ paddingLeft: '20px' }}>
                  {report.errors.slice(0, 10).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                  {report.errors.length > 10 && <li>...và {report.errors.length - 10} dòng khác</li>}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
