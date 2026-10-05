import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { LeaveRequest, LeaveFund, LeaveLedgerItem, Employee, AttendanceCode } from '../../types';
import { api } from '../../api/client';
import {
  FileText,
  Plus,
  Upload,
  RefreshCw,
  Trash2,
  Edit2,
  History,
  CheckCircle2,
  AlertCircle,
  Search,
  Wallet,
  Calendar,
  X
} from 'lucide-react';

interface LeaveManagerProps {
  onBack?: () => void;
}

export const LeaveManager: React.FC<LeaveManagerProps> = () => {
  const { selectedCompany } = useAuth();
  const toast = useToast();
  const today = new Date();

  // Active tab: 'requests' | 'funds'
  const [activeTab, setActiveTab] = useState<'requests' | 'funds'>('requests');

  // Common lookups
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [codes, setCodes] = useState<AttendanceCode[]>([]);

  // 1. LEAVE REQUESTS STATE
  const [reqFrom, setReqFrom] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  );
  const [reqTo, setReqTo] = useState<string>(
    new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().substring(0, 10)
  );
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [reqSearch, setReqSearch] = useState('');

  // Add request modal
  const [showAddReqModal, setShowAddReqModal] = useState(false);
  const [reqEmpId, setReqEmpId] = useState<number | ''>('');
  const [reqDate, setReqDate] = useState<string>(today.toISOString().substring(0, 10));
  const [reqCode, setReqCode] = useState<string>('P');
  const [reqReason, setReqReason] = useState<string>('');
  const [savingReq, setSavingReq] = useState(false);

  // Import Excel modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ importedCount: number; errors: string[] } | null>(null);

  // 2. LEAVE FUNDS STATE
  const [fundYear, setFundYear] = useState<number>(today.getFullYear());
  const [funds, setFunds] = useState<LeaveFund[]>([]);
  const [loadingFunds, setLoadingFunds] = useState(false);
  const [fundSearch, setFundSearch] = useState('');

  // Edit fund modal
  const [editingFund, setEditingFund] = useState<LeaveFund | null>(null);
  const [annualOpening, setAnnualOpening] = useState<number>(0);
  const [carryOpening, setCarryOpening] = useState<number>(0);
  const [compOpening, setCompOpening] = useState<number>(0);
  const [savingFund, setSavingFund] = useState(false);

  // Ledger Modal
  const [viewingLedgerEmp, setViewingLedgerEmp] = useState<{ id: number; name: string; code: string } | null>(null);
  const [ledgerItems, setLedgerItems] = useState<LeaveLedgerItem[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load employees & codes for dropdowns
  useEffect(() => {
    if (!selectedCompany) return;
    api.get<Employee[]>(`/companies/${selectedCompany.id}/employees`).then(r => setEmployees(r.data));
    api.get<AttendanceCode[]>(`/companies/${selectedCompany.id}/codes`).then(r => setCodes(r.data));
  }, [selectedCompany?.id]);

  // Fetch Requests
  const fetchRequests = async () => {
    if (!selectedCompany) return;
    setLoadingRequests(true);
    try {
      const res = await api.get<LeaveRequest[]>(
        `/companies/${selectedCompany.id}/leave/requests?from=${reqFrom}&to=${reqTo}`
      );
      setRequests(res.data);
    } catch (err: any) {
      console.error(err);
      setMessage({ text: err.response?.data?.message || 'Không thể tải đơn nghỉ phép.', type: 'error' });
    } finally {
      setLoadingRequests(false);
    }
  };

  // Fetch Funds
  const fetchFunds = async () => {
    if (!selectedCompany) return;
    setLoadingFunds(true);
    try {
      const res = await api.get<LeaveFund[]>(
        `/companies/${selectedCompany.id}/leave/funds?year=${fundYear}`
      );
      setFunds(res.data);
    } catch (err: any) {
      console.error(err);
      setMessage({ text: err.response?.data?.message || 'Không thể tải quỹ phép.', type: 'error' });
    } finally {
      setLoadingFunds(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'requests') {
      fetchRequests();
    } else {
      fetchFunds();
    }
  }, [selectedCompany?.id, activeTab, reqFrom, reqTo, fundYear]);

  // Handle Save Request
  const handleSaveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !reqEmpId) return;
    setSavingReq(true);
    setMessage(null);
    try {
      await api.post(`/companies/${selectedCompany.id}/leave/requests`, {
        employeeId: Number(reqEmpId),
        date: reqDate,
        code: reqCode,
        reason: reqReason.trim() || null
      });
      setMessage({ text: 'Đã lưu đơn nghỉ phép thành công!', type: 'success' });
      setShowAddReqModal(false);
      setReqReason('');
      fetchRequests();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || 'Lỗi khi lưu đơn.', type: 'error' });
    } finally {
      setSavingReq(false);
    }
  };

  // Handle Delete Request
  const handleDeleteRequest = async (id: number) => {
    if (!selectedCompany) return;
    const confirmed = await toast.confirm({
      title: 'Xác nhận xóa đơn',
      message: 'Bạn có chắc chắn muốn xóa đơn nghỉ phép này không?',
      confirmText: 'Xóa đơn',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.delete(`/companies/${selectedCompany.id}/leave/requests/${id}`);
      setMessage({ text: 'Đã xóa đơn nghỉ phép.', type: 'success' });
      toast.success('Đã xóa đơn nghỉ phép thành công.');
      fetchRequests();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Lỗi khi xóa đơn.';
      setMessage({ text: errMsg, type: 'error' });
      toast.error(errMsg);
    }
  };

  // Handle Import Excel
  const handleImportExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await api.post(`/companies/${selectedCompany.id}/leave/requests/import-excel`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(res.data);
      fetchRequests();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || 'Lỗi khi import file Excel.', type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  // Handle Save Fund
  const handleSaveFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !editingFund) return;
    setSavingFund(true);
    setMessage(null);
    try {
      await api.post(`/companies/${selectedCompany.id}/leave/funds`, {
        employeeId: editingFund.employeeId,
        year: fundYear,
        annualOpening,
        carryOpening,
        compOpening
      });
      setMessage({ text: `Đã lưu quỹ phép cho ${editingFund.fullName}`, type: 'success' });
      setEditingFund(null);
      fetchFunds();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || 'Lỗi khi lưu quỹ phép.', type: 'error' });
    } finally {
      setSavingFund(false);
    }
  };

  // Handle View Ledger
  const handleViewLedger = async (fund: LeaveFund) => {
    if (!selectedCompany) return;
    setViewingLedgerEmp({ id: fund.employeeId, name: fund.fullName, code: fund.employeeCode });
    setLoadingLedger(true);
    try {
      const res = await api.get<LeaveLedgerItem[]>(
        `/companies/${selectedCompany.id}/leave/ledger/${fund.employeeId}?year=${fundYear}`
      );
      setLedgerItems(res.data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const filteredRequests = requests.filter(
    r =>
      r.employeeCode.toLowerCase().includes(reqSearch.toLowerCase()) ||
      r.fullName.toLowerCase().includes(reqSearch.toLowerCase()) ||
      r.code.toLowerCase().includes(reqSearch.toLowerCase())
  );

  const filteredFunds = funds.filter(
    f =>
      f.employeeCode.toLowerCase().includes(fundSearch.toLowerCase()) ||
      f.fullName.toLowerCase().includes(fundSearch.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Card */}
      <div className="card">
        <div
          className="card-body"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1.25rem 1.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '10px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <FileText size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Quản Lý Nghỉ Phép
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                Theo dõi đơn nghỉ phép đã duyệt, số dư quỹ phép năm và chi tiết lịch sử khấu trừ
              </p>
            </div>
          </div>

          {/* Tab switcher */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              backgroundColor: '#f1f5f9',
              padding: '4px',
              borderRadius: '8px'
            }}
          >
            <button
              onClick={() => setActiveTab('requests')}
              className={`btn btn-sm ${activeTab === 'requests' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Calendar size={15} />
              <span>Đơn Nghỉ Phép</span>
            </button>
            <button
              onClick={() => setActiveTab('funds')}
              className={`btn btn-sm ${activeTab === 'funds' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Wallet size={15} />
              <span>Sổ dư Phép</span>
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            backgroundColor: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`
          }}
        >
          {message.type === 'success' ? (
            <CheckCircle2 size={18} color="#16a34a" />
          ) : (
            <AlertCircle size={18} color="#dc2626" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* TAB 1: LEAVE REQUESTS */}
      {activeTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Controls Bar */}
          <div className="card">
            <div
              className="card-body"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '1rem 1.25rem'
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Từ ngày:</span>
                  <input
                    type="date"
                    value={reqFrom}
                    onChange={e => setReqFrom(e.target.value)}
                    className="form-control form-control-sm"
                    style={{ width: '145px' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Đến ngày:</span>
                  <input
                    type="date"
                    value={reqTo}
                    onChange={e => setReqTo(e.target.value)}
                    className="form-control form-control-sm"
                    style={{ width: '145px' }}
                  />
                </div>
                <div style={{ position: 'relative', minWidth: '220px' }}>
                  <Search
                    size={15}
                    color="#94a3b8"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="text"
                    placeholder="Tìm nhân viên, mã phép..."
                    value={reqSearch}
                    onChange={e => setReqSearch(e.target.value)}
                    className="form-control form-control-sm"
                    style={{ paddingLeft: '32px', paddingRight: '12px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => {
                    setImportResult(null);
                    setImportFile(null);
                    setShowImportModal(true);
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Upload size={14} />
                  <span>Import Excel</span>
                </button>
                <button
                  onClick={() => setShowAddReqModal(true)}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={14} />
                  <span>Thêm đơn nghỉ</span>
                </button>
                <button
                  onClick={fetchRequests}
                  disabled={loadingRequests}
                  className="btn btn-secondary btn-sm"
                  title="Làm mới"
                  style={{ width: '32px', height: '32px', padding: 0 }}
                >
                  <RefreshCw size={14} className={loadingRequests ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          </div>

          {/* Table of Requests */}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>Mã NV</th>
                  <th>Họ và tên</th>
                  <th style={{ width: '120px' }}>Ngày nghỉ</th>
                  <th style={{ width: '90px' }}>Mã phép</th>
                  <th>Lý do</th>
                  <th style={{ width: '100px' }}>Nguồn</th>
                  <th style={{ width: '120px' }}>Người tạo</th>
                  <th style={{ width: '70px', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loadingRequests ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#2563eb' }} />
                      Đang tải đơn nghỉ phép...
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                      Không có đơn nghỉ phép nào trong khoảng thời gian này.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 700, color: '#1e40af', fontFamily: 'monospace' }}>
                        {r.employeeCode}
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.fullName}</td>
                      <td style={{ fontWeight: 600, color: '#334155' }}>
                        {new Date(r.date).toLocaleDateString('vi-VN')}
                      </td>
                      <td>
                        <span className="badge badge-warning" style={{ fontWeight: 700 }}>
                          {r.code}
                        </span>
                      </td>
                      <td style={{ color: '#475569' }}>
                        {r.reason || '-'}
                      </td>
                      <td>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b', textTransform: 'uppercase' }}>
                          {r.source}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>{r.createdBy}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteRequest(r.id)}
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '4px 8px', color: '#e11d48' }}
                          title="Xóa đơn nghỉ"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: LEAVE FUNDS */}
      {activeTab === 'funds' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Controls Bar */}
          <div className="card">
            <div
              className="card-body"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '1rem 1.25rem'
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Năm quỹ:</span>
                  <input
                    type="number"
                    min={2020}
                    max={2040}
                    value={fundYear}
                    onChange={e => setFundYear(Number(e.target.value))}
                    className="form-control"
                    style={{ width: '90px', padding: '6px 10px', fontSize: '13px', fontWeight: 600 }}
                  />
                </div>
                <div style={{ position: 'relative', minWidth: '220px' }}>
                  <Search
                    size={15}
                    color="#94a3b8"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="text"
                    placeholder="Tìm mã hoặc tên nhân viên..."
                    value={fundSearch}
                    onChange={e => setFundSearch(e.target.value)}
                    className="form-control form-control-sm"
                    style={{ paddingLeft: '32px', paddingRight: '12px' }}
                  />
                </div>
              </div>

              <div>
                <button
                  onClick={fetchFunds}
                  disabled={loadingFunds}
                  className="btn btn-secondary btn-sm"
                  title="Làm mới"
                  style={{ width: '32px', height: '32px', padding: 0 }}
                >
                  <RefreshCw size={14} className={loadingFunds ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          </div>

          {/* Table of Funds */}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>Mã NV</th>
                  <th>Họ và tên</th>
                  <th style={{ textAlign: 'center', width: '120px' }}>Phép năm (Đầu kỳ)</th>
                  <th style={{ textAlign: 'center', width: '120px' }}>Phép chuyển (Đầu kỳ)</th>
                  <th style={{ textAlign: 'center', width: '110px' }}>Nghỉ bù (Đầu kỳ)</th>
                  <th style={{ textAlign: 'center', width: '150px' }}>Đã trừ (Năm / Chuyển / Bù)</th>
                  <th style={{ textAlign: 'center', width: '130px' }}>Tổng Còn lại</th>
                  <th style={{ textAlign: 'right', width: '100px' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loadingFunds ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#2563eb' }} />
                      Đang tải số dư quỹ phép...
                    </td>
                  </tr>
                ) : filteredFunds.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                      Chưa có dữ liệu quỹ phép cho năm {fundYear}.
                    </td>
                  </tr>
                ) : (
                  filteredFunds.map(f => (
                    <tr key={f.employeeId}>
                      <td style={{ fontWeight: 700, color: '#1e40af', fontFamily: 'monospace' }}>
                        {f.employeeCode}
                      </td>
                      <td style={{ fontWeight: 600 }}>{f.fullName}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{f.annualOpening}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{f.carryOpening}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{f.compOpening}</td>
                      <td style={{ textAlign: 'center', fontSize: '12px', color: '#e11d48', fontFamily: 'monospace' }}>
                        -{f.annualUsed} / -{f.carryUsed} / -{f.compUsed}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`badge ${f.totalRemaining > 0 ? 'badge-success' : 'badge-neutral'}`}
                          style={{ fontSize: '12px', padding: '3px 8px' }}
                        >
                          {f.totalRemaining.toFixed(1)} ngày
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            onClick={() => {
                              setEditingFund(f);
                              setAnnualOpening(f.annualOpening);
                              setCarryOpening(f.carryOpening);
                              setCompOpening(f.compOpening);
                            }}
                            className="btn btn-sm btn-secondary"
                            style={{ padding: '4px 6px' }}
                            title="Hiệu chỉnh số dư đầu kỳ"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleViewLedger(f)}
                            className="btn btn-sm btn-secondary"
                            style={{ padding: '4px 6px', color: '#d97706' }}
                            title="Xem sổ cái chi tiết"
                          >
                            <History size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD LEAVE REQUEST */}
      {showAddReqModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="card-title" style={{ margin: 0 }}>Thêm Đơn Nghỉ Phép</h2>
              <button
                type="button"
                onClick={() => setShowAddReqModal(false)}
                className="btn btn-sm btn-secondary"
                style={{ padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveRequest}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                    Nhân viên <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  <select
                    required
                    value={reqEmpId}
                    onChange={e => setReqEmpId(Number(e.target.value))}
                    className="form-control"
                  >
                    <option value="">-- Chọn nhân viên --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.employeeCode} - {e.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                    Ngày nghỉ <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={reqDate}
                    onChange={e => setReqDate(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                    Mã nghỉ phép <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  <select
                    required
                    value={reqCode}
                    onChange={e => setReqCode(e.target.value)}
                    className="form-control"
                  >
                    {codes.map(c => (
                      <option key={c.id} value={c.code}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>Lý do nghỉ</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Nghỉ việc riêng, ốm đau..."
                    value={reqReason}
                    onChange={e => setReqReason(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowAddReqModal(false)}
                  className="btn btn-secondary"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingReq}
                  className="btn btn-primary"
                >
                  {savingReq ? 'Đang lưu...' : 'Lưu đơn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: IMPORT EXCEL */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={18} color="#2563eb" />
                <h2 className="card-title" style={{ margin: 0 }}>Import Đơn Nghỉ Phép từ Excel</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="btn btn-sm btn-secondary"
                style={{ padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleImportExcel}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    fontSize: '12px',
                    color: '#475569',
                    backgroundColor: '#f8fafc',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    lineHeight: '1.6'
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: '4px', color: '#1e293b' }}>
                    Quy chuẩn các cột file Excel:
                  </strong>
                  <div>• Cột 1: Mã nhân viên (ví dụ: SB001)</div>
                  <div>• Cột 2: Ngày nghỉ (YYYY-MM-DD hoặc DD/MM/YYYY)</div>
                  <div>• Cột 3: Mã phép (P, BL, RO, TS, ...)</div>
                  <div>• Cột 4: Lý do (tùy chọn)</div>
                </div>

                <div className="form-group">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    required
                    onChange={e => setImportFile(e.target.files?.[0] || null)}
                    className="form-control"
                    style={{ padding: '6px' }}
                  />
                </div>

                {importResult && (
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 600, fontSize: '13px' }}>
                      <CheckCircle2 size={16} />
                      <span>Đã nạp thành công {importResult.importedCount} đơn nghỉ phép.</span>
                    </div>
                    {importResult.errors.length > 0 && (
                      <div style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '12px', color: '#e11d48' }}>
                        {importResult.errors.map((err, i) => (
                          <div key={i}>• {err}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="btn btn-secondary"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={importing || !importFile}
                  className="btn btn-primary"
                >
                  {importing ? 'Đang nạp...' : 'Tải lên & Xử lý'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT LEAVE FUND */}
      {editingFund && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <div>
                <h2 className="card-title" style={{ margin: 0 }}>Hiệu Chỉnh Quỹ Phép Năm {fundYear}</h2>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  {editingFund.employeeCode} - {editingFund.fullName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingFund(null)}
                className="btn btn-sm btn-secondary"
                style={{ padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveFund}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                    Phép năm được hưởng đầu kỳ (Ngày)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={annualOpening}
                    onChange={e => setAnnualOpening(Number(e.target.value))}
                    className="form-control"
                    style={{ fontWeight: 600 }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                    Phép chuyển từ năm trước sang (Ngày)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={carryOpening}
                    onChange={e => setCarryOpening(Number(e.target.value))}
                    className="form-control"
                    style={{ fontWeight: 600 }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                    Nghỉ bù tồn đầu kỳ (Ngày)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={compOpening}
                    onChange={e => setCompOpening(Number(e.target.value))}
                    className="form-control"
                    style={{ fontWeight: 600 }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setEditingFund(null)}
                  className="btn btn-secondary"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingFund}
                  className="btn btn-primary"
                >
                  {savingFund ? 'Đang lưu...' : 'Lưu quỹ phép'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: LEDGER DRILL-DOWN */}
      {viewingLedgerEmp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px', maxHeight: '85vh' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <History size={20} color="#d97706" />
                <div>
                  <h2 className="card-title" style={{ margin: 0, fontSize: '15px' }}>
                    Sổ Cái Phép Năm {fundYear}: {viewingLedgerEmp.code} - {viewingLedgerEmp.name}
                  </h2>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Chi tiết các giao dịch khấu trừ quỹ phép tự động trong các kỳ công
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingLedgerEmp(null)}
                className="btn btn-sm btn-secondary"
                style={{ padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '16px' }}>
              {loadingLedger ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#2563eb' }} />
                  Đang tải sổ cái...
                </div>
              ) : ledgerItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                  Chưa có giao dịch khấu trừ nào được ghi nhận trong năm {fundYear}.
                </div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: '100px' }}>Ngày</th>
                        <th style={{ width: '110px' }}>Loại Quỹ</th>
                        <th style={{ textAlign: 'right', width: '90px' }}>Số lượng</th>
                        <th style={{ textAlign: 'right', width: '100px' }}>Dư sau trừ</th>
                        <th>Lý do</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerItems.map(item => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 600, color: '#334155' }}>
                            {new Date(item.date).toLocaleDateString('vi-VN')}
                          </td>
                          <td>
                            <span
                              className={`badge ${item.fund === 'ANNUAL'
                                ? 'badge-primary'
                                : item.fund === 'CARRY'
                                  ? 'badge-warning'
                                  : 'badge-neutral'
                                }`}
                            >
                              {item.fund === 'ANNUAL'
                                ? 'Phép năm'
                                : item.fund === 'CARRY'
                                  ? 'Phép chuyển'
                                  : 'Nghỉ bù'}
                            </span>
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              color: item.amount < 0 ? '#e11d48' : '#16a34a'
                            }}
                          >
                            {item.amount > 0 ? `+${item.amount}` : item.amount}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                            {item.balanceAfter}
                          </td>
                          <td style={{ fontSize: '12px', color: '#64748b' }}>
                            {item.reason || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setViewingLedgerEmp(null)}
                className="btn btn-secondary"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
