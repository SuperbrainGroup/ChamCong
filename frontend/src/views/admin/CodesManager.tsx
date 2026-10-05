import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AttendanceCode } from '../../types';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { FileText, Edit2, ArrowLeft, Check, AlertCircle } from 'lucide-react';

interface CodesManagerProps {
  onBack?: () => void;
}

export const CodesManager: React.FC<CodesManagerProps> = ({ onBack }) => {
  const { selectedCompany, user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const toast = useToast();
  const [codes, setCodes] = useState<AttendanceCode[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingCode, setEditingCode] = useState<AttendanceCode | null>(null);
  const [name, setName] = useState('');
  const [workVal, setWorkVal] = useState(0);
  const [holidayVal, setHolidayVal] = useState(0);
  const [annualVal, setAnnualVal] = useState(0);
  const [paidVal, setPaidVal] = useState(0);
  const [fundType, setFundType] = useState(0);
  const [fundDeduct, setFundDeduct] = useState(0);
  const [isHalfLeave, setIsHalfLeave] = useState(false);
  const [color, setColor] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [condition, setCondition] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCodes = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const res = await api.get<AttendanceCode[]>(`/companies/${selectedCompany.id}/codes`);
      setCodes(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, [selectedCompany?.id]);

  const handleOpenEdit = (c: AttendanceCode) => {
    if (!isAdmin) return;
    setEditingCode(c);
    setName(c.name);
    setWorkVal(c.workValue);
    setHolidayVal(c.holidayValue);
    setAnnualVal(c.annualLeaveValue);
    setPaidVal(c.paidLeaveValue);
    setFundType(c.fundType);
    setFundDeduct(c.fundDeduct);
    setIsHalfLeave(c.isHalfLeave);
    setColor(c.color || '');
    setSortOrder(c.sortOrder);
    setCondition(c.condition || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.warning('Bạn chỉ có quyền xem bảng mã ký hiệu chấm công.');
      return;
    }
    if (!selectedCompany || !editingCode) return;

    setSaving(true);
    try {
      await api.put(`/companies/${selectedCompany.id}/codes/${editingCode.id}`, {
        name,
        workValue: workVal,
        holidayValue: holidayVal,
        annualLeaveValue: annualVal,
        paidLeaveValue: paidVal,
        fundType,
        fundDeduct,
        isHalfLeave,
        color: color.replace('#', '').trim() || null,
        sortOrder,
        condition,
      });
      setEditingCode(null);
      toast.success('Đã lưu cấu hình mã ký hiệu chấm công thành công!');
      await fetchCodes();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi lưu mã ký hiệu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--neutral-900)' }}>
          Bảng quy chuẩn mã ký hiệu chấm công & quy đổi công
        </div>
        <div style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '2px' }}>
          14 mã quy chuẩn xác định giá trị công, ngày phép và màu sắc hiển thị
        </div>
        {!isAdmin && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#eff6ff',
            color: '#1e40af',
            border: '1px solid #bfdbfe',
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            marginTop: '8px'
          }}>
            <AlertCircle size={15} color="#2563eb" />
            <span>Chế độ chỉ xem: Nhân viên chấm công được quyền tra cứu bảng mã ký hiệu quy chuẩn. Quyền điều chỉnh cấu hình thuộc về Admin.</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>Đang tải...</div>
          ) : (
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>Mã</th>
                    <th>Tên mã ký hiệu</th>
                    <th style={{ textAlign: 'center', width: '80px' }}>Màu nền</th>
                    <th style={{ textAlign: 'center', width: '90px' }}>Công hưởng</th>
                    <th style={{ textAlign: 'center', width: '100px' }}>Tác động phép</th>
                    <th>Điều kiện ghi nhận</th>
                    {isAdmin && <th style={{ textAlign: 'center', width: '80px' }}>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => {
                    const totalPaid = c.workValue + c.holidayValue + c.annualLeaveValue + c.paidLeaveValue;
                    return (
                      <tr key={c.id}>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: c.color ? `#${c.color}` : 'var(--neutral-100)',
                              color: 'var(--neutral-900)',
                              fontWeight: 800,
                              fontSize: '13px',
                              border: '1px solid var(--neutral-300)'
                            }}
                          >
                            {c.code}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td style={{ textAlign: 'center' }}>
                          {c.color ? (
                            <span style={{ display: 'inline-block', width: '22px', height: '22px', backgroundColor: `#${c.color}`, borderRadius: '4px', border: '1px solid var(--neutral-300)' }} />
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--neutral-400)' }}>Mặc định</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: totalPaid > 0 ? 'var(--success-text)' : 'var(--neutral-500)' }}>
                          {totalPaid.toFixed(1)} công
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '12px' }}>
                          {c.fundDeduct > 0 ? (
                            <span className="badge badge-warning">Trừ {c.fundDeduct} {c.fundType === 2 ? 'Quỹ bù' : 'Phép năm'}</span>
                          ) : (
                            <span style={{ color: 'var(--neutral-400)' }}>Không trừ</span>
                          )}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>{c.condition || '-'}</td>
                        {isAdmin && (
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(c)}>
                              <Edit2 size={13} />
                              <span>Sửa</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Sửa mã ký hiệu (chỉ hiển thị khi là Admin) */}
      {isAdmin && editingCode && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <div className="card-title">Chỉnh sửa Mã ký hiệu: {editingCode.code}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingCode(null)}>✕</button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tên hiển thị</label>
                  <input
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Làm HC (H)</label>
                    <input type="number" step="0.5" min="0" max="1" className="form-control" value={workVal} onChange={(e) => setWorkVal(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Ngày lễ (I)</label>
                    <input type="number" step="0.5" min="0" max="1" className="form-control" value={holidayVal} onChange={(e) => setHolidayVal(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Phép năm (K)</label>
                    <input type="number" step="0.5" min="0" max="1" className="form-control" value={annualVal} onChange={(e) => setAnnualVal(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Hưởng L (L)</label>
                    <input type="number" step="0.5" min="0" max="1" className="form-control" value={paidVal} onChange={(e) => setPaidVal(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Loại quỹ phép khấu trừ</label>
                    <select className="form-control" value={fundType} onChange={(e) => setFundType(parseInt(e.target.value))}>
                      <option value="0">Không tác động quỹ</option>
                      <option value="1">Quỹ phép năm (Annual)</option>
                      <option value="2">Quỹ bù (Comp)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Số ngày trừ</label>
                    <input type="number" step="0.5" min="0" max="1" className="form-control" value={fundDeduct} onChange={(e) => setFundDeduct(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Mã màu hex (Ví dụ: EF949F, F4B7BE...)</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-control"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        placeholder="EF949F"
                      />
                      {color && (
                        <span style={{ width: '28px', height: '28px', backgroundColor: `#${color.replace('#', '')}`, borderRadius: '4px', border: '1px solid var(--neutral-300)', flexShrink: 0 }} />
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Thứ tự hiển thị</label>
                    <input type="number" className="form-control" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Điều kiện ghi nhận</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingCode(null)} disabled={saving}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu mã ký hiệu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
