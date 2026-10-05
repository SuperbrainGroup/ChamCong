import React, { useState, useEffect } from 'react';
import { Period, PeriodGridData, GridEmployeeRow, GridDayCell } from '../../types';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Calculator, RefreshCw, ArrowRight, Search, Edit3, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Step3CalculateGridProps {
  period: Period;
  onNextStep: () => void;
  onCalculated: () => void;
}

export const Step3CalculateGrid: React.FC<Step3CalculateGridProps> = ({ period, onNextStep, onCalculated }) => {
  const toast = useToast();
  const [data, setData] = useState<PeriodGridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedCell, setSelectedCell] = useState<{ emp: GridEmployeeRow['employee']; cell: GridDayCell } | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editReason, setEditReason] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Ghi chú nhân viên
  const [editingNoteEmp, setEditingNoteEmp] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');

  const fetchGrid = async () => {
    setLoading(true);
    try {
      const res = await api.get<PeriodGridData>(`/periods/${period.id}/grid`);
      setData(res.data);
    } catch (err) {
      console.error('Lỗi khi tải bảng chấm công:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrid();
  }, [period.id]);

  const handleCalculate = async (resetManual = false) => {
    setCalculating(true);
    try {
      await api.post(`/periods/${period.id}/calculate?resetManual=${resetManual}`);
      toast.success(resetManual ? 'Đã tính lại công và khôi phục các ô sửa tay thành công!' : 'Đã chạy tính công toàn bộ kỳ công thành công!');
      onCalculated();
      await fetchGrid();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi tính công.');
    } finally {
      setCalculating(false);
    }
  };

  const handleOpenCell = (emp: GridEmployeeRow['employee'], cell: GridDayCell) => {
    setSelectedCell({ emp, cell });
    setEditCode(cell.code || '');
    setEditReason(cell.manualReason || '');
    setEditError(null);
  };

  const handleSaveCellOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell) return;
    if (!editReason.trim()) {
      setEditError('Vui lòng nhập lý do chỉnh sửa.');
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      await api.post(`/periods/${period.id}/override`, {
        employeeId: selectedCell.emp.id,
        date: selectedCell.cell.date,
        code: editCode || null,
        reason: editReason.trim(),
      });
      setSelectedCell(null);
      await fetchGrid();
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Lỗi khi lưu.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveNote = async (employeeId: number) => {
    try {
      await api.post(`/periods/${period.id}/save-note`, {
        employeeId,
        note: noteText.trim(),
      });
      setEditingNoteEmp(null);
      toast.success('Đã lưu ghi chú nhân sự thành công!');
      await fetchGrid();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi lưu ghi chú.');
    }
  };

  // Departments list from grid
  const departments = React.useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.grid.forEach((g) => {
      if (g.employee.departmentName) set.add(g.employee.departmentName);
    });
    return Array.from(set).sort();
  }, [data]);

  // Filtered employees
  const filteredGrid = React.useMemo(() => {
    if (!data) return [];
    return data.grid.filter((g) => {
      if (selectedDept !== 'ALL' && g.employee.departmentName !== selectedDept) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const matchName = g.employee.fullName.toLowerCase().includes(s);
        const matchCode = g.employee.employeeCode.toLowerCase().includes(s);
        return matchName || matchCode;
      }
      return true;
    });
  }, [data, selectedDept, search]);

  const isClosed = period.status === 'Closed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Action Bar */}
      <div className="card">
        <div className="card-body" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="btn btn-primary"
              onClick={() => handleCalculate(false)}
              disabled={calculating || isClosed}
            >
              <Calculator size={16} />
              <span>{calculating ? 'Đang chạy engine tính công...' : 'Tính công toàn bộ'}</span>
            </button>

            <button
              className="btn btn-secondary"
              onClick={async () => {
                const confirmed = await toast.confirm({
                  title: 'Xác nhận tính lại công',
                  message: 'Bạn có chắc muốn tính lại và hủy tất cả các ô đã chỉnh sửa tay không?',
                  confirmText: 'Tính lại toàn bộ',
                  type: 'danger'
                });
                if (confirmed) {
                  handleCalculate(true);
                }
              }}
              disabled={calculating || isClosed}
              title="Tính lại từ đầu và xóa toàn bộ các ô đã sửa tay"
            >
              <RefreshCw size={16} />
              <span>Tính lại</span>
            </button>

            {period.calculatedAt && (
              <span style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '6px' }}>
                Lần tính gần nhất: {new Date(period.calculatedAt).toLocaleString('vi-VN')}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Filter by Department */}
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: '160px' }}
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            >
              <option value="ALL">Tất cả bộ phận</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
              <input
                type="text"
                className="form-control"
                style={{ width: '220px', paddingLeft: '32px' }}
                placeholder="Tìm mã NV, tên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button className="btn btn-success" onClick={onNextStep}>
              <span>Bước tiếp theo: Xuất file & Chốt kỳ</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Grid Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--neutral-500)' }}>
              Đang tải lưới bảng chấm công...
            </div>
          ) : !data || data.grid.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--neutral-500)' }}>
              Chưa có dữ liệu bảng chấm công. Vui lòng bấm <strong>"Tính công toàn bộ"</strong> để engine chạy.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '72vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  {/* Row 1: Group Headers */}
                  <tr style={{ backgroundColor: 'var(--neutral-100)', borderBottom: '1px solid var(--neutral-300)' }}>
                    <th style={{ padding: '6px 8px', borderRight: '1px solid var(--neutral-200)', position: 'sticky', left: 0, backgroundColor: 'var(--neutral-100)', zIndex: 11, minWidth: '40px' }}>STT</th>
                    <th style={{ padding: '6px 8px', borderRight: '1px solid var(--neutral-200)', position: 'sticky', left: '40px', backgroundColor: 'var(--neutral-100)', zIndex: 11, minWidth: '70px' }}>Mã NV</th>
                    <th style={{ padding: '6px 8px', borderRight: '1px solid var(--neutral-300)', position: 'sticky', left: '110px', backgroundColor: 'var(--neutral-100)', zIndex: 11, minWidth: '160px', textAlign: 'left' }}>Họ và tên</th>
                    <th style={{ padding: '6px 8px', borderRight: '1px solid var(--neutral-200)', minWidth: '80px' }}>BP</th>

                    {/* Summary columns */}
                    <th style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-200)', minWidth: '50px' }} title="Số ngày làm ca 1, HC (H)">Làm</th>
                    <th style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-200)', minWidth: '50px' }} title="Ngày lễ hưởng lương (I)">Lễ</th>
                    <th style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-200)', minWidth: '50px' }} title="Nghỉ phép năm (K)">Phép</th>
                    <th style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-200)', minWidth: '50px' }} title="Nghỉ hưởng lương (L)">Hưởng L</th>
                    <th style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-200)', minWidth: '50px' }} title="Nghỉ trừ lương (M)">Trừ L</th>
                    <th style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-300)', minWidth: '60px', backgroundColor: '#e2efda' }} title="Số ngày công tính lương (N)">Tổng công</th>
                    <th style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-300)', minWidth: '65px' }} title="Tổng phút đi trễ về sớm">Trễ/Sớm</th>

                    {/* Date columns */}
                    {data.dates.map((d) => (
                      <th
                        key={d.date}
                        style={{
                          padding: '4px 6px',
                          minWidth: '42px',
                          borderRight: '1px solid var(--neutral-200)',
                          backgroundColor: d.dayOfWeek === 'Sunday' ? '#fce4d6' : (d.dayOfWeek === 'Saturday' ? '#fff2cc' : 'var(--neutral-100)')
                        }}
                      >
                        <div style={{ fontSize: '11px', fontWeight: 700 }}>{d.dayName}</div>
                        <div style={{ fontSize: '10px', color: 'var(--neutral-600)' }}>
                          {d.dayOfWeek === 'Sunday' ? 'CN' : d.dayOfWeek.replace('Monday', 'T2').replace('Tuesday', 'T3').replace('Wednesday', 'T4').replace('Thursday', 'T5').replace('Friday', 'T6').replace('Saturday', 'T7')}
                        </div>
                      </th>
                    ))}

                    <th style={{ padding: '6px 12px', minWidth: '180px', textAlign: 'left' }}>Ghi chú</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredGrid.map((row, idx) => (
                    <tr key={row.employee.id} style={{ borderBottom: '1px solid var(--neutral-200)' }}>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid var(--neutral-200)', position: 'sticky', left: 0, backgroundColor: '#ffffff', zIndex: 5 }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid var(--neutral-200)', position: 'sticky', left: '40px', backgroundColor: '#ffffff', zIndex: 5, fontWeight: 700 }}>
                        {row.employee.employeeCode}
                      </td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid var(--neutral-300)', position: 'sticky', left: '110px', backgroundColor: '#ffffff', zIndex: 5, textAlign: 'left', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: 'var(--neutral-900)' }}>{row.employee.fullName}</div>
                        {row.employee.exemptPunch && <span className="badge badge-neutral" style={{ fontSize: '9px', padding: '0 4px' }}>Miễn quẹt</span>}
                      </td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid var(--neutral-200)', color: 'var(--neutral-600)', whiteSpace: 'nowrap' }}>
                        {row.employee.departmentName}
                      </td>

                      {/* Summaries */}
                      <td style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-200)', fontWeight: 600 }}>{row.summary.workDays.toFixed(1)}</td>
                      <td style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-200)' }}>{row.summary.holidayDays.toFixed(1)}</td>
                      <td style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-200)' }}>{row.summary.annualLeaveDays.toFixed(1)}</td>
                      <td style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-200)' }}>{row.summary.paidLeaveDays.toFixed(1)}</td>
                      <td style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-200)', color: row.summary.unpaidDays > 0 ? 'var(--danger-text)' : undefined, fontWeight: row.summary.unpaidDays > 0 ? 700 : 400 }}>
                        {row.summary.unpaidDays.toFixed(1)}
                      </td>
                      <td style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-300)', fontWeight: 800, backgroundColor: '#e2efda', color: '#276a3c' }}>
                        {row.summary.paidDays.toFixed(1)}
                      </td>
                      <td style={{ padding: '6px 6px', borderRight: '1px solid var(--neutral-300)', textAlign: 'right', fontWeight: 600, color: row.summary.lateEarlyMinutes > 0 ? 'var(--warning-text)' : undefined }}>
                        {row.summary.lateEarlyMinutes > 0 ? `${row.summary.lateEarlyMinutes}p` : '-'}
                      </td>

                      {/* Day Cells */}
                      {row.days.map((cell) => {
                        const codeDef = cell.code ? data.codes[cell.code] : null;
                        const cellBg = codeDef?.color ? `#${codeDef.color.replace('#', '')}` : (cell.code === '?' ? '#fef3c7' : (cell.code === 'V' ? '#fee2e2' : undefined));

                        return (
                          <td
                            key={cell.date}
                            onClick={() => handleOpenCell(row.employee, cell)}
                            style={{
                              padding: '5px 2px',
                              borderRight: '1px solid var(--neutral-200)',
                              backgroundColor: cellBg,
                              cursor: 'pointer',
                              position: 'relative',
                              transition: 'all 0.1s ease',
                              fontWeight: cell.code ? 700 : 400,
                              color: cell.code === '?' ? '#92400e' : (cell.code === 'V' ? '#991b1b' : 'var(--neutral-900)')
                            }}
                            title={`Nhấp để xem chi tiết / chỉnh sửa ngày ${new Date(cell.date).toLocaleDateString('vi-VN')}`}
                          >
                            {cell.code || ''}
                            {cell.isManual && (
                              <span style={{
                                position: 'absolute',
                                top: '2px',
                                right: '2px',
                                width: '5px',
                                height: '5px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--primary)'
                              }} />
                            )}
                          </td>
                        );
                      })}

                      {/* Note */}
                      <td style={{ padding: '6px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {editingNoteEmp === row.employee.id ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type="text"
                              className="form-control"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              autoFocus
                            />
                            <button className="btn btn-primary btn-sm" onClick={() => handleSaveNote(row.employee.id)}>Lưu</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditingNoteEmp(null)}>Hủy</button>
                          </div>
                        ) : (
                          <div
                            style={{ cursor: 'pointer', color: row.note ? 'var(--neutral-900)' : 'var(--neutral-400)', fontSize: '12px' }}
                            onClick={() => {
                              setEditingNoteEmp(row.employee.id);
                              setNoteText(row.note);
                            }}
                            title="Nhấp để sửa ghi chú"
                          >
                            {row.note || '(Nhấp để thêm ghi chú)'}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Slide-over / Modal Chi tiết ngày công & Sửa tay có lý do (Tính năng 4.2.1, 4.2.2) */}
      {selectedCell && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div className="card-title">Chi tiết ngày công</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedCell(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveCellOverride}>
              <div className="modal-body">
                {editError && (
                  <div style={{
                    padding: '10px 14px',
                    backgroundColor: 'var(--danger-light)',
                    color: 'var(--danger-text)',
                    borderRadius: 'var(--radius)',
                    fontSize: '13px',
                    marginBottom: '16px'
                  }}>
                    {editError}
                  </div>
                )}

                <div style={{
                  padding: '14px',
                  backgroundColor: 'var(--neutral-50)',
                  borderRadius: 'var(--radius)',
                  marginBottom: '16px',
                  fontSize: '13px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px'
                }}>
                  <div><strong>Nhân viên:</strong> {selectedCell.emp.fullName}</div>
                  <div><strong>Mã NV:</strong> {selectedCell.emp.employeeCode}</div>
                  <div><strong>Ngày:</strong> {new Date(selectedCell.cell.date).toLocaleDateString('vi-VN')}</div>
                  <div><strong>Bộ phận:</strong> {selectedCell.emp.departmentName || '-'}</div>

                  <div style={{ gridColumn: 'span 2', borderTop: '1px solid var(--neutral-200)', paddingTop: '8px', marginTop: '4px' }}>
                    <strong>Giờ quẹt máy:</strong> {selectedCell.cell.inTime || '--:--:--'} → {selectedCell.cell.outTime || '--:--:--'}
                  </div>

                  <div><strong>Giờ làm hữu dụng:</strong> {selectedCell.cell.workedMinutes ? `${(selectedCell.cell.workedMinutes / 60).toFixed(2)}h` : '-'}</div>
                  <div><strong>Đi trễ:</strong> {selectedCell.cell.lateMinutes} phút</div>
                  <div><strong>Về sớm:</strong> {selectedCell.cell.earlyMinutes} phút</div>
                  <div><strong>Làm thêm (OT):</strong> {selectedCell.cell.otMinutes} phút</div>
                  <div><strong>Mã tự động tính:</strong> {selectedCell.cell.autoCode || 'Trống'}</div>
                  <div><strong>Công hưởng lương:</strong> {selectedCell.cell.paidValue} công</div>

                  {selectedCell.cell.warnings && (
                    <div style={{ gridColumn: 'span 2', color: 'var(--warning-text)', marginTop: '4px' }}>
                      <strong>Cảnh báo:</strong> {selectedCell.cell.warnings}
                    </div>
                  )}

                  {selectedCell.cell.isManual && (
                    <div style={{ gridColumn: 'span 2', backgroundColor: 'var(--primary-light)', padding: '6px 10px', borderRadius: '4px', color: 'var(--primary-text)', marginTop: '4px' }}>
                      <strong>Đã sửa tay:</strong> {selectedCell.cell.manualReason}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Điều chỉnh mã ký hiệu công</label>
                  <select
                    className="form-control"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    disabled={isClosed}
                  >
                    <option value="">(Để trống — Không tính công)</option>
                    {data && Object.values(data.codes).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name} ({c.workValue + c.holidayValue + c.annualLeaveValue + c.paidLeaveValue} công)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Lý do điều chỉnh (Bắt buộc ghi nhật ký thao tác)</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Nhập lý do cụ thể..."
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    disabled={isClosed}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedCell(null)} disabled={savingEdit}>
                  Đóng
                </button>
                {!isClosed && (
                  <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                    {savingEdit ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
