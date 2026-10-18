import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ParameterMatrix } from '../../types';
import { api, shiftHoursApi, ShiftHoursData } from '../../api/client';
import { Sliders, ArrowLeft, Edit2, CheckCircle2, AlertCircle, Info, Clock, Check, Sparkles, Building2 } from 'lucide-react';

interface ParametersManagerProps {
  onBack?: () => void;
}

export const ParametersManager: React.FC<ParametersManagerProps> = ({ onBack }) => {
  const { selectedCompany } = useAuth();
  const [data, setData] = useState<ParameterMatrix | null>(null);
  const [loading, setLoading] = useState(true);

  // Cấu hình ca làm việc của hội sở
  const [shiftHours, setShiftHours] = useState<{
    shiftStart: string;
    shiftEnd: string;
    lunchStart: string;
    lunchMinutes: number;
    checkoutPrepareMinutes: number;
    checkoutStartTime: string;
  }>({
    shiftStart: '08:00',
    shiftEnd: '17:00',
    lunchStart: '12:00',
    lunchMinutes: 60,
    checkoutPrepareMinutes: 30,
    checkoutStartTime: '16:30'
  });
  const [savingShift, setSavingShift] = useState(false);
  const [shiftSuccessMsg, setShiftSuccessMsg] = useState<string | null>(null);

  // Modal Sửa tham số
  const [editingParam, setEditingParam] = useState<{
    code: string;
    name: string;
    groupId?: number;
    groupName?: string;
    currentValue: string;
    defaultValue: string;
    type: string;
    description: string;
  } | null>(null);
  const [paramValue, setParamValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShiftHours = async () => {
    if (!selectedCompany) return;
    try {
      const res = await shiftHoursApi.get(selectedCompany.id);
      setShiftHours({
        shiftStart: res.shiftStart,
        shiftEnd: res.shiftEnd,
        lunchStart: res.lunchStart,
        lunchMinutes: res.lunchMinutes,
        checkoutPrepareMinutes: res.checkoutPrepareMinutes,
        checkoutStartTime: res.checkoutStartTime
      });
    } catch (err) {
      console.error('Lỗi tải ca làm việc:', err);
    }
  };

  const fetchParams = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const res = await api.get<ParameterMatrix>(`/companies/${selectedCompany.id}/parameters`);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParams();
    fetchShiftHours();
  }, [selectedCompany?.id]);

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setSavingShift(true);
    setShiftSuccessMsg(null);
    try {
      const res = await shiftHoursApi.save(selectedCompany.id, {
        shiftStart: shiftHours.shiftStart,
        shiftEnd: shiftHours.shiftEnd,
        lunchStart: shiftHours.lunchStart,
        lunchMinutes: Number(shiftHours.lunchMinutes),
        checkoutPrepareMinutes: Number(shiftHours.checkoutPrepareMinutes)
      });
      setShiftSuccessMsg(res.message);
      await fetchParams();
      await fetchShiftHours();
      setTimeout(() => setShiftSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi lưu ca làm việc.');
    } finally {
      setSavingShift(false);
    }
  };

  const applyPreset = (start: string, end: string, lunch: string = '12:00') => {
    const [eh, em] = end.split(':').map(Number);
    const endTotal = eh * 60 + em;
    const prepStartTotal = Math.max(0, endTotal - 30);
    const prepStart = `${String(Math.floor(prepStartTotal / 60)).padStart(2, '0')}:${String(prepStartTotal % 60).padStart(2, '0')}`;
    setShiftHours(prev => ({
      ...prev,
      shiftStart: start,
      shiftEnd: end,
      lunchStart: lunch,
      checkoutStartTime: prepStart
    }));
  };

  const handleOpenEdit = (
    row: ParameterMatrix['rows'][0],
    groupId?: number,
    groupName?: string
  ) => {
    const val = groupId ? (row.groupValues[groupId] ?? '') : (row.companyValue ?? '');
    setEditingParam({
      code: row.code,
      name: row.name,
      groupId,
      groupName,
      currentValue: val,
      defaultValue: row.default,
      type: row.type,
      description: row.description,
    });
    setParamValue(val);
    setError(null);
  };

  const handleSaveParam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !editingParam) return;

    setSaving(true);
    setError(null);

    try {
      await api.post(`/companies/${selectedCompany.id}/parameters`, {
        code: editingParam.code,
        groupId: editingParam.groupId || null,
        value: paramValue.trim(),
        effectiveFrom: new Date().toISOString().split('T')[0],
      });
      setEditingParam(null);
      await fetchParams();
      await fetchShiftHours();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi lưu tham số.');
    } finally {
      setSaving(false);
    }
  };

  if (!selectedCompany) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>
        Vui lòng chọn một Hội sở làm việc trên thanh Navbar để tra cứu hoặc thiết lập bảng tham số quản trị.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--neutral-900)' }}>
          Cấu Hình Ca Làm Việc & Tham Số Quản Trị — {selectedCompany ? selectedCompany.name : 'Tất cả hội sở'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '2px' }}>
          Mỗi hội sở có thể tùy biến giờ vào ca, giờ tan ca và khung nhận diện chuẩn bị ra về thông minh
        </div>
      </div>

      {/* THẺ THIẾT LẬP CA LÀM VIỆC DÀNH CHO HỘI SỞ */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #BFDBFE',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 12px rgba(0, 86, 179, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: '#EFF6FF',
              color: '#0056B3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Clock size={22} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                Thiết Lập Ca Làm Việc Hội Sở — {selectedCompany.name} ({selectedCompany.code})
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                Tự động nhận diện lúc vào làm, đang làm việc và khung giờ chuẩn bị ra về / giải trình khi chấm công
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Mẫu nhanh:</span>
            <button
              type="button"
              onClick={() => applyPreset('08:00', '17:00')}
              style={{
                backgroundColor: shiftHours.shiftStart === '08:00' && shiftHours.shiftEnd === '17:00' ? '#0056B3' : '#F1F5F9',
                color: shiftHours.shiftStart === '08:00' && shiftHours.shiftEnd === '17:00' ? '#FFFFFF' : '#334155',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              08:00 - 17:00
            </button>
            <button
              type="button"
              onClick={() => applyPreset('08:30', '17:30')}
              style={{
                backgroundColor: shiftHours.shiftStart === '08:30' && shiftHours.shiftEnd === '17:30' ? '#0056B3' : '#F1F5F9',
                color: shiftHours.shiftStart === '08:30' && shiftHours.shiftEnd === '17:30' ? '#FFFFFF' : '#334155',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              08:30 - 17:30
            </button>
            <button
              type="button"
              onClick={() => applyPreset('07:30', '16:30')}
              style={{
                backgroundColor: shiftHours.shiftStart === '07:30' && shiftHours.shiftEnd === '16:30' ? '#0056B3' : '#F1F5F9',
                color: shiftHours.shiftStart === '07:30' && shiftHours.shiftEnd === '16:30' ? '#FFFFFF' : '#334155',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              07:30 - 16:30
            </button>
            <button
              type="button"
              onClick={() => applyPreset('09:00', '18:00')}
              style={{
                backgroundColor: shiftHours.shiftStart === '09:00' && shiftHours.shiftEnd === '18:00' ? '#0056B3' : '#F1F5F9',
                color: shiftHours.shiftStart === '09:00' && shiftHours.shiftEnd === '18:00' ? '#FFFFFF' : '#334155',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              09:00 - 18:00
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveShift} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Giờ vào làm (Shift Start)
              </label>
              <input
                type="time"
                value={shiftHours.shiftStart}
                onChange={(e) => setShiftHours({ ...shiftHours, shiftStart: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#0F172A'
                }}
              />
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                Bắt đầu tính giờ vào ca
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Giờ tan ca (Shift End)
              </label>
              <input
                type="time"
                value={shiftHours.shiftEnd}
                onChange={(e) => {
                  const end = e.target.value;
                  const [eh, em] = end.split(':').map(Number);
                  const endTotal = (eh || 0) * 60 + (em || 0);
                  const prepStartTotal = Math.max(0, endTotal - 30);
                  const prepStart = `${String(Math.floor(prepStartTotal / 60)).padStart(2, '0')}:${String(prepStartTotal % 60).padStart(2, '0')}`;
                  setShiftHours({ ...shiftHours, shiftEnd: end, checkoutStartTime: prepStart });
                }}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#0F172A'
                }}
              />
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                Mốc kết thúc ngày làm việc
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Khung nhận diện chuẩn bị ra về
              </label>
              <div style={{
                padding: '9px 12px',
                borderRadius: '8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                fontSize: '14px',
                fontWeight: 700,
                color: '#16A34A'
              }}>
                Từ {shiftHours.checkoutStartTime || '16:30'} (Trước tan ca 30p)
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                Tự động nhận diện lúc chuẩn bị ra về & mở Check-out
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Nghỉ trưa (Giờ bắt đầu & Số phút)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="time"
                  value={shiftHours.lunchStart}
                  onChange={(e) => setShiftHours({ ...shiftHours, lunchStart: e.target.value })}
                  style={{
                    width: '60%',
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                />
                <input
                  type="number"
                  min="0"
                  max="240"
                  value={shiftHours.lunchMinutes}
                  onChange={(e) => setShiftHours({ ...shiftHours, lunchMinutes: Number(e.target.value) })}
                  title="Thời lượng nghỉ trưa (phút)"
                  placeholder="Phút"
                  style={{
                    width: '40%',
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                />
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                Ví dụ: 12:00, 60 phút nghỉ trưa
              </div>
            </div>
          </div>

          {/* DÒNG TÓM TẮT CƠ CHẾ NHẬN DIỆN THỜI GIAN THỰC */}
          <div style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #DBEAFE',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '12px',
            color: '#1E40AF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="#0056B3" />
              <span>
                <strong>Cơ chế tự động nhận diện:</strong> Từ <strong>{shiftHours.checkoutStartTime}</strong>, nhân viên đã check-in sẽ hiển thị nút <strong>Check-out</strong>. Nhân viên <strong>chưa check-in</strong> lúc sáng sẽ hiển thị trạng thái <strong>Chưa check-in — Cần giải trình</strong> kèm nút gửi giải trình bổ sung công.
              </span>
            </div>

            <button
              type="submit"
              disabled={savingShift}
              style={{
                backgroundColor: '#0056B3',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: savingShift ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(0, 86, 179, 0.25)'
              }}
            >
              {savingShift ? 'Đang lưu...' : (
                <>
                  <Check size={16} />
                  Lưu Ca Làm Việc ({selectedCompany.code})
                </>
              )}
            </button>
          </div>

          {shiftSuccessMsg && (
            <div style={{
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#166534',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle2 size={16} />
              {shiftSuccessMsg}
            </div>
          )}
        </form>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={16} color="var(--primary)" />
          <span style={{ fontSize: '13px', color: 'var(--neutral-600)' }}>
            Thứ tự ưu tiên áp dụng: <strong>Khối nhân viên → Hội sở đang chọn → Mặc định toàn hệ thống</strong>. Nếu ô để trống, hệ thống sẽ tự động áp dụng giá trị mặc định chung.
          </span>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>Đang tải bảng tham số...</div>
          ) : !data ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>Chưa có tham số.</div>
          ) : (
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                    <th style={{ width: '220px' }}>Tham số</th>
                    <th style={{ width: '140px' }}>Nhóm</th>
                    <th style={{ width: '150px' }}>Mặc định (Global)</th>
                    <th style={{ width: '180px', backgroundColor: '#eff6ff' }}>Hội sở ({selectedCompany?.code})</th>
                    {data.groups.map((g) => (
                      <th key={g.id} style={{ width: '180px' }}>{g.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, idx) => (
                    <tr key={row.code}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--neutral-900)' }}>{row.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{row.code}</div>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '11px' }}>{row.group}</span>
                      </td>
                      <td style={{ color: 'var(--neutral-700)', fontWeight: 600 }}>
                        {row.default}
                      </td>

                      {/* Hội sở override */}
                      <td
                        style={{ backgroundColor: '#f8fafc', cursor: 'pointer' }}
                        onClick={() => handleOpenEdit(row)}
                        title="Nhấp để sửa giá trị ở mức Hội sở"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{
                            fontWeight: row.companyValue ? 700 : 400,
                            color: row.companyValue ? 'var(--primary-text)' : 'var(--neutral-400)',
                            fontStyle: row.companyValue ? 'normal' : 'italic'
                          }}>
                            {row.companyValue || `(Mặc định: ${row.default})`}
                          </span>
                          <Edit2 size={12} color="var(--neutral-400)" />
                        </div>
                      </td>

                      {/* Từng khối override */}
                      {data.groups.map((g) => {
                        const gVal = row.groupValues[g.id];
                        const inherited = row.companyValue || row.default;
                        if (row.companyOnly) {
                          return (
                            <td key={g.id} style={{ color: 'var(--neutral-300)', fontSize: '11px', textAlign: 'center' }}>
                              (Áp dụng toàn hội sở)
                            </td>
                          );
                        }

                        return (
                          <td
                            key={g.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleOpenEdit(row, g.id, g.name)}
                            title={`Nhấp để sửa cho khối ${g.name}`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{
                                fontWeight: gVal ? 700 : 400,
                                color: gVal ? 'var(--neutral-900)' : 'var(--neutral-400)',
                                fontStyle: gVal ? 'normal' : 'italic'
                              }}>
                                {gVal || `(Theo hội sở: ${inherited})`}
                              </span>
                              <Edit2 size={12} color="var(--neutral-400)" />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Sửa tham số */}
      {editingParam && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div className="card-title">Cấu hình tham số</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingParam(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveParam}>
              <div className="modal-body">
                {error && (
                  <div style={{ padding: '10px 14px', backgroundColor: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius)', fontSize: '13px', marginBottom: '16px' }}>
                    {error}
                  </div>
                )}

                <div style={{ padding: '12px 14px', backgroundColor: 'var(--neutral-50)', borderRadius: 'var(--radius)', fontSize: '13px', marginBottom: '16px' }}>
                  <div><strong>Tham số:</strong> {editingParam.name} ({editingParam.code})</div>
                  <div><strong>Phạm vi áp dụng:</strong> {editingParam.groupName ? `Khối: ${editingParam.groupName}` : `Toàn hội sở: ${selectedCompany?.name}`}</div>
                  <div><strong>Mặc định hệ thống:</strong> {editingParam.defaultValue}</div>
                  {editingParam.description && (
                    <div style={{ color: 'var(--neutral-600)', marginTop: '4px', fontStyle: 'italic' }}>
                      {editingParam.description}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Giá trị cấu hình mới</label>
                  <input
                    type="text"
                    className="form-control"
                    value={paramValue}
                    onChange={(e) => setParamValue(e.target.value)}
                    placeholder="Để trống = Áp dụng mặc định"
                    autoFocus
                  />
                  <div style={{ fontSize: '11px', color: 'var(--neutral-500)', marginTop: '4px' }}>
                    Kiểu dữ liệu: {editingParam.type}.
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingParam(null)} disabled={saving}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
