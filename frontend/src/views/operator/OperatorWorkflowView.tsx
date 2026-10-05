import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Period } from '../../types';
import { api } from '../../api/client';
import { Step1Import } from './Step1Import';
import { Step2Warnings } from './Step2Warnings';
import { Step3CalculateGrid } from './Step3CalculateGrid';
import { Step4ExportClose } from './Step4ExportClose';
import { Plus, Calendar, FileText, AlertTriangle, Table, Download, Lock, Check } from 'lucide-react';

export const OperatorWorkflowView: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState(true);

  // Modal tạo kỳ mới
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchPeriods = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const res = await api.get<Period[]>(`/periods/company/${selectedCompany.id}`);
      setPeriods(res.data);
      if (res.data.length > 0) {
        if (!selectedPeriod || !res.data.some(p => p.id === selectedPeriod.id)) {
          setSelectedPeriod(res.data[0]);
        } else {
          // Update selected period with fresh data
          const updated = res.data.find(p => p.id === selectedPeriod.id);
          if (updated) setSelectedPeriod(updated);
        }
      } else {
        setSelectedPeriod(null);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách kỳ công:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeriods();
  }, [selectedCompany?.id]);

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setCreatingPeriod(true);
    setCreateError(null);

    try {
      const res = await api.post<Period>('/periods', {
        companyId: selectedCompany.id,
        month: newMonth,
        year: newYear,
      });
      setShowCreateModal(false);
      await fetchPeriods();
      setSelectedPeriod(res.data);
      setCurrentStep(1);
    } catch (err: any) {
      setCreateError(err.response?.data?.message || 'Lỗi khi tạo kỳ công.');
    } finally {
      setCreatingPeriod(false);
    }
  };

  if (!selectedCompany) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>
        Vui lòng chọn hoặc gán một Hội sở để bắt đầu thao tác chấm công.
      </div>
    );
  }

  const steps = [
    { num: 1, title: '1. Nạp file máy', icon: FileText },
    { num: 2, title: '2. Kiểm tra & Giải trình', icon: AlertTriangle, badge: selectedPeriod?.unresolvedCount },
    { num: 3, title: '3. Bảng tính công', icon: Table },
    { num: 4, title: '4. Xuất file & Chốt kỳ', icon: Download },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header: Period Selector & Actions */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={20} color="var(--primary)" />
              <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--neutral-800)' }}>Kỳ công:</span>
            </div>

            {periods.length > 0 ? (
              <select
                className="form-control"
                style={{ width: 'auto', minWidth: '220px', fontWeight: 700, fontSize: '14px' }}
                value={selectedPeriod?.id ?? ''}
                onChange={(e) => {
                  const p = periods.find(x => x.id === parseInt(e.target.value));
                  setSelectedPeriod(p ?? null);
                }}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    Tháng {String(p.month).padStart(2, '0')}/{p.year} ({new Date(p.fromDate).toLocaleDateString('vi-VN')} - {new Date(p.toDate).toLocaleDateString('vi-VN')})
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>Chưa có kỳ công nào</span>
            )}

            {selectedPeriod && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`badge ${selectedPeriod.status === 'Closed' ? 'badge-success' :
                    selectedPeriod.status === 'Calculated' ? 'badge-primary' :
                      selectedPeriod.status === 'Imported' ? 'badge-warning' : 'badge-neutral'
                  }`} style={{ fontSize: '12px', padding: '3px 10px' }}>
                  {selectedPeriod.status === 'Closed' ? 'ĐÃ CHỐT' :
                    selectedPeriod.status === 'Calculated' ? 'ĐÃ TÍNH CÔNG' :
                      selectedPeriod.status === 'Imported' ? 'ĐÃ NẠP FILE' : 'NHÁP'}
                </span>

                <span style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>
                  Chuẩn: <strong>{selectedPeriod.standardDays} ngày</strong>
                </span>
              </div>
            )}
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => {
              setNewMonth(new Date().getMonth() + 1);
              setNewYear(new Date().getFullYear());
              setShowCreateModal(true);
            }}
          >
            <Plus size={16} />
            <span>Tạo kỳ chấm công mới</span>
          </button>
        </div>
      </div>

      {/* 4-Step Navigation Tabs */}
      {selectedPeriod && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          backgroundColor: '#ffffff',
          padding: '8px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--neutral-200)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          {steps.map((st) => {
            const Icon = st.icon;
            const isActive = currentStep === st.num;
            return (
              <button
                key={st.num}
                onClick={() => setCurrentStep(st.num)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--neutral-700)',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={16} color={isActive ? '#ffffff' : 'var(--neutral-500)'} />
                <span>{st.title}</span>
                {st.badge !== undefined && st.badge > 0 && (
                  <span style={{
                    backgroundColor: isActive ? '#ffffff' : 'var(--danger)',
                    color: isActive ? 'var(--danger)' : '#ffffff',
                    fontSize: '11px',
                    fontWeight: 800,
                    borderRadius: '9999px',
                    padding: '1px 6px'
                  }}>
                    {st.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Active Step Content */}
      {selectedPeriod ? (
        <div>
          {currentStep === 1 && (
            <Step1Import
              period={selectedPeriod}
              onImportSuccess={fetchPeriods}
              onNextStep={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 2 && (
            <Step2Warnings
              period={selectedPeriod}
              onNextStep={() => setCurrentStep(3)}
            />
          )}

          {currentStep === 3 && (
            <Step3CalculateGrid
              period={selectedPeriod}
              onNextStep={() => setCurrentStep(4)}
              onCalculated={fetchPeriods}
            />
          )}

          {currentStep === 4 && (
            <Step4ExportClose
              period={selectedPeriod}
              onPeriodUpdated={fetchPeriods}
            />
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', color: 'var(--neutral-600)', marginBottom: '16px' }}>
            Hội sở này hiện chưa có kỳ công nào.
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            <span>Tạo kỳ công đầu tiên</span>
          </button>
        </div>
      )}

      {/* Modal Tạo kỳ công mới */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div className="card-title">Tạo kỳ công mới</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreatePeriod}>
              <div className="modal-body">
                {createError && (
                  <div style={{
                    padding: '10px 14px',
                    backgroundColor: 'var(--danger-light)',
                    color: 'var(--danger-text)',
                    borderRadius: 'var(--radius)',
                    fontSize: '13px',
                    marginBottom: '16px'
                  }}>
                    {createError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Tháng</label>
                    <select
                      className="form-control"
                      value={newMonth}
                      onChange={(e) => setNewMonth(parseInt(e.target.value))}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>Tháng {String(m).padStart(2, '0')}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Năm</label>
                    <input
                      type="number"
                      className="form-control"
                      value={newYear}
                      onChange={(e) => setNewYear(parseInt(e.target.value))}
                      min={2020}
                      max={2040}
                      required
                    />
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '8px' }}>
                  * Hệ thống sẽ tự động tính khoảng ngày của kỳ (theo cấu hình ngày bắt đầu 26 → 25) và đếm số ngày làm việc chuẩn từ lịch.
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)} disabled={creatingPeriod}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={creatingPeriod}>
                  {creatingPeriod ? 'Đang tạo...' : 'Tạo kỳ công'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
