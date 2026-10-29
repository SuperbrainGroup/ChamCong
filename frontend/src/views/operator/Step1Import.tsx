import React, { useState } from 'react';
import { Period, InspectionReport } from '../../types';
import { api } from '../../api/client';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight, UserX, Clock, Smartphone, Zap, RefreshCw } from 'lucide-react';

interface Step1ImportProps {
  period: Period;
  onImportSuccess: () => void;
  onNextStep: () => void;
  onGoToStep?: (step: number) => void;
}

export const Step1Import: React.FC<Step1ImportProps> = ({ period, onImportSuccess, onNextStep, onGoToStep }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncingSelf, setSyncingSelf] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    message: string;
    syncedCount: number;
    employeesWithPunches: number;
    totalEmployees: number;
  } | null>(null);

  const handleSyncSelfAttendance = async () => {
    setSyncingSelf(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await api.post(`/periods/${period.id}/sync-self-attendance`);
      setSyncResult(res.data);
      onImportSuccess();
      // Tự động chuyển thẳng sang Bước 3 (Bảng tính công) để HR thấy ngay dữ liệu đã tính mà không cần thao tác thêm
      setTimeout(() => {
        if (onGoToStep) {
          onGoToStep(3);
        } else {
          onNextStep();
        }
      }, 700);
    } catch (err: any) {
      console.error('❌ [Sync Self Attendance] Error:', err);
      const data = err.response?.data;
      setError(data?.message || 'Có lỗi xảy ra khi đồng bộ dữ liệu tự chấm công.');
    } finally {
      setSyncingSelf(false);
    }
  };

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
      const res = await api.post<InspectionReport>(`/periods/${period.id}/import-punches?commit=false`, formData);
      setReport(res.data);
    } catch (err: any) {
      console.error('❌ [Upload Chấm Công] Lỗi Inspect:', err);
      const data = err.response?.data;
      const detailMsg = data?.error ? `${data.message || 'Lỗi server'}: ${data.error}` : (data?.message || 'Lỗi khi đọc file chấm công.');
      setError(detailMsg);
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
      await api.post(`/periods/${period.id}/import-punches?commit=true`, formData);
      onImportSuccess();
      onNextStep();
    } catch (err: any) {
      console.error('❌ [Upload Chấm Công] Lỗi Commit:', err);
      const data = err.response?.data;
      const detailMsg = data?.error ? `${data.message || 'Lỗi server'}: ${data.error}` : (data?.message || 'Lỗi khi nạp dữ liệu vào kỳ công.');
      setError(detailMsg);
    } finally {
      setCommitting(false);
    }
  };

  const isClosed = period.status === 'Closed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* KHỐI 1: TỔNG HỢP & TÍNH CÔNG DỮ LIỆU TỰ ĐỘNG */}
      <div className="card" style={{ border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div className="card-header" style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ backgroundColor: '#0056B3', color: '#FFF', padding: '6px', borderRadius: '8px', display: 'flex' }}>
              <Smartphone size={18} />
            </div>
            <div>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Dữ liệu Chấm công Kỳ {String(period.month).padStart(2, '0')}/{period.year}</span>
              <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>
                Khoảng thời gian: {new Date(period.fromDate).toLocaleDateString('vi-VN')} — {new Date(period.toDate).toLocaleDateString('vi-VN')}
              </div>
            </div>
          </div>
          <span className="badge badge-neutral" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
            {isClosed ? (
              <></>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <button
                    type="button"
                    onClick={handleSyncSelfAttendance}
                    disabled={syncingSelf || committing || inspecting}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 22px',
                      borderRadius: '8px',
                      backgroundColor: syncingSelf ? '#93C5FD' : '#0056B3',
                      color: '#FFFFFF',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: syncingSelf ? 'wait' : 'pointer',
                      boxShadow: '0 2px 6px rgba(0, 86, 179, 0.25)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {syncingSelf ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span style={{ whiteSpace: 'nowrap' }}>Đang tổng hợp & tính công...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={16} />
                        <span style={{ whiteSpace: 'nowrap' }}>Tổng hợp & Tính công ngay</span>
                      </>
                    )}
                  </button>
                </div>

                {syncResult && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '14px 18px',
                    backgroundColor: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    borderRadius: '8px',
                    color: '#065F46',
                    fontSize: '13px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <CheckCircle2 size={18} color="#059669" />
                      <div>
                        <strong>Đã tổng hợp & tính công thành công! </strong>
                        {syncResult.message}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => onGoToStep ? onGoToStep(3) : onNextStep()}
                        className="btn btn-sm btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                        title="Mở trực tiếp lưới Bảng tính công đã tính toán"
                      >
                        <span>Mở ngay Bảng Chấm Công (Bước 3)</span>
                        <ArrowRight size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={onNextStep}
                        className="btn btn-sm btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                      >
                        <span>Rà soát cảnh báo (Bước 2)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </span>
        </div>


      </div>

      {/* KHỐI 2: NẠP BỔ SUNG FILE MÁY CHẤM CÔNG (TÙY CHỌN GỘP DỮ LIỆU) */}
      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={18} color="var(--primary)" />
            <span>Nạp bổ sung từ file máy chấm công (Tùy chọn)</span>
          </div>
          <span className="badge badge-neutral" style={{ whiteSpace: 'nowrap' }}>Tự động gộp dữ liệu</span>
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
                  padding: '28px 20px',
                  textAlign: 'center',
                  backgroundColor: isDragging ? '#eff6ff' : (file ? 'var(--primary-light)' : 'var(--neutral-50)'),
                  cursor: 'pointer',
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
                <Upload size={32} color={isDragging || file ? 'var(--primary)' : 'var(--neutral-400)'} style={{ margin: '0 auto 10px' }} />
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--neutral-800)', marginBottom: '4px', whiteSpace: 'nowrap' }}>
                  {file ? file.name : (isDragging ? 'Thả file Excel vào đây...' : 'Kéo thả hoặc nhấp để chọn file Excel chấm công (.xlsx, .xls)')}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>
                  {file ? `Dung lượng: ${(file.size / 1024).toFixed(1)} KB` : 'Dành cho bổ sung lượt quẹt từ máy chấm công. Hệ thống sẽ tự động gộp chung với dữ liệu từ thiết bị.'}
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
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleInspect}
                  disabled={!file || inspecting || committing}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {inspecting ? 'Đang đọc & kiểm tra...' : 'Kiểm tra & đối chiếu'}
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCommit}
                  disabled={!file || committing || inspecting}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <CheckCircle2 size={16} />
                  <span style={{ whiteSpace: 'nowrap' }}>{committing ? 'Đang lưu vào kỳ công...' : 'Xác nhận Nạp & Gộp dữ liệu'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Báo cáo kiểm tra sau khi đọc file */}
      {report && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Kết quả kiểm tra file</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className="badge badge-success" style={{ whiteSpace: 'nowrap' }}>Hợp lệ: {report.validRows} dòng</span>
              {report.errorRows > 0 && <span className="badge badge-danger" style={{ whiteSpace: 'nowrap' }}>Lỗi: {report.errorRows} dòng</span>}
              {report.warningRows > 0 && <span className="badge badge-warning" style={{ whiteSpace: 'nowrap' }}>Cảnh báo: {report.warningRows} dòng</span>}
            </div>
          </div>

          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div style={{ padding: '14px 16px', backgroundColor: 'var(--neutral-50)', borderRadius: 'var(--radius)', border: '1px solid var(--neutral-200)' }}>
                <div style={{ fontSize: '11px', color: 'var(--neutral-500)', fontWeight: 700, textTransform: 'uppercase' }}>Tổng dòng đọc được</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--neutral-900)', marginTop: '2px' }}>{report.totalRows}</div>
              </div>

              <div style={{ padding: '14px 16px', backgroundColor: 'var(--success-light)', borderRadius: 'var(--radius)', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '11px', color: 'var(--success-text)', fontWeight: 700, textTransform: 'uppercase' }}>Nhân viên khớp</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--success-text)', marginTop: '2px' }}>{report.matchedEmployees}</div>
              </div>

              <div style={{ padding: '14px 16px', backgroundColor: report.unmatchedEmployees > 0 ? 'var(--warning-light)' : 'var(--neutral-50)', borderRadius: 'var(--radius)', border: '1px solid var(--neutral-200)' }}>
                <div style={{ fontSize: '11px', color: report.unmatchedEmployees > 0 ? 'var(--warning-text)' : 'var(--neutral-500)', fontWeight: 700, textTransform: 'uppercase' }}>Mã máy chưa khớp</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: report.unmatchedEmployees > 0 ? 'var(--warning-text)' : 'var(--neutral-900)', marginTop: '2px' }}>{report.unmatchedEmployees}</div>
              </div>

              <div style={{ padding: '14px 16px', backgroundColor: 'var(--neutral-50)', borderRadius: 'var(--radius)', border: '1px solid var(--neutral-200)' }}>
                <div style={{ fontSize: '11px', color: 'var(--neutral-500)', fontWeight: 700, textTransform: 'uppercase' }}>NV không có trong file</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--neutral-900)', marginTop: '2px' }}>{report.missingPunchEmployees.length}</div>
              </div>
            </div>

            {report.unmatchedMachineCodes.length > 0 && (
              <div style={{
                padding: '12px 16px',
                backgroundColor: 'var(--warning-light)',
                border: '1px solid #fde68a',
                borderRadius: 'var(--radius)',
                color: 'var(--warning-text)',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px' }}>
                  <UserX size={16} />
                  <span>Các mã máy chấm công chưa được gán cho nhân viên:</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {report.unmatchedMachineCodes.map((code) => (
                    <span key={code} className="badge badge-warning" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                      Mã: {code}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {report.missingPunchEmployees.length > 0 && (
              <div style={{
                padding: '12px 16px',
                backgroundColor: 'var(--neutral-100)',
                border: '1px solid var(--neutral-300)',
                borderRadius: 'var(--radius)',
                color: 'var(--neutral-700)',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px' }}>
                  <Clock size={16} />
                  <span>Nhân viên có trong danh mục nhưng không xuất hiện trong file:</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {report.missingPunchEmployees.map((name) => (
                    <span key={name} className="badge badge-neutral" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {report.errors.length > 0 && (
              <div style={{
                padding: '12px 16px',
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
