import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ParameterMatrix } from '../../types';
import { api } from '../../api/client';
import { Sliders, ArrowLeft, Edit2, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface ParametersManagerProps {
  onBack?: () => void;
}

export const ParametersManager: React.FC<ParametersManagerProps> = ({ onBack }) => {
  const { selectedCompany } = useAuth();
  const [data, setData] = useState<ParameterMatrix | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, [selectedCompany?.id]);

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
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi lưu tham số.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--neutral-900)' }}>
          Bảng cấu hình tham số quản trị — {selectedCompany?.name}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '2px' }}>
          Thiết lập ca làm việc, thời gian ăn trưa, bù giờ đối xứng, ân hạn và ngưỡng tính công
        </div>
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
