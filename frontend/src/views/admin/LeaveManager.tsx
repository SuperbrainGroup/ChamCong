import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { LeaveRequest, LeaveFund, LeaveLedgerItem, Employee, AttendanceCode, UserRequestItem } from '../../types';
import { api, requestsApi } from '../../api/client';
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
  X,
  Check,
  XCircle,
  Clock,
  User,
  Paperclip,
  Eye,
  Download
} from 'lucide-react';
import { DateInput } from '../../components/DateInput';

interface LeaveManagerProps {
  onBack?: () => void;
}

export const LeaveManager: React.FC<LeaveManagerProps> = () => {
  const { selectedCompany } = useAuth();
  const toast = useToast();
  const today = new Date();

  // Active tab: 'approvals' | 'requests' | 'funds'
  const [activeTab, setActiveTab] = useState<'approvals' | 'requests' | 'funds'>('approvals');

  // Common lookups
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [codes, setCodes] = useState<AttendanceCode[]>([]);

  // 0. APPROVALS STATE (Đơn xin nghỉ phép nhân viên gửi lên từ Cổng ESS / App)
  const [approvalRequests, setApprovalRequests] = useState<UserRequestItem[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'ALL' | 'PENDING_HR' | 'APPROVED' | 'REJECTED'>('PENDING_HR');
  const [approvalSearch, setApprovalSearch] = useState('');
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Decision Modal
  const [selectedRequestForDecision, setSelectedRequestForDecision] = useState<UserRequestItem | null>(null);
  const [decisionAction, setDecisionAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [processingDecision, setProcessingDecision] = useState(false);

  // Evidence Viewer
  const [viewingEvidenceReq, setViewingEvidenceReq] = useState<UserRequestItem | null>(null);
  const [evidenceAttachments, setEvidenceAttachments] = useState<{ id: number; name: string; url: string; size: number }[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);

  // Lắng nghe phím ESC để đóng popup modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImage) {
          setLightboxImage(null);
        } else if (viewingEvidenceReq) {
          setViewingEvidenceReq(null);
        } else if (selectedRequestForDecision) {
          setSelectedRequestForDecision(null);
          setDecisionAction(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage, viewingEvidenceReq, selectedRequestForDecision]);

  // 1. LEAVE REQUESTS STATE (Dữ liệu ngoại lệ ngày nghỉ đã lưu / nhập tay)
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
  const [fundMonth, setFundMonth] = useState<number | 'ALL'>(today.getMonth() + 1);
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

  // Fetch Approvals (Đơn nhân viên nộp từ Cổng ESS / App)
  const fetchApprovals = async () => {
    setLoadingApprovals(true);
    try {
      const statusParam = approvalStatusFilter === 'ALL' ? undefined : approvalStatusFilter;
      const data = await requestsApi.getHrRequests(statusParam, selectedCompany?.code, 'LEAVE');
      const leaveOnly = data.filter(r => r.requestType === 'LEAVE');
      setApprovalRequests(leaveOnly);

      // Cập nhật số lượng đơn PENDING_HR
      const allPendingData = await requestsApi.getHrRequests('PENDING_HR', selectedCompany?.code, 'LEAVE');
      const pendingLeaves = allPendingData.filter(r => r.requestType === 'LEAVE').length;
      setPendingCount(pendingLeaves);
    } catch (err: any) {
      console.error('Lỗi tải danh sách duyệt đơn:', err);
      toast.error('Không thể tải danh sách đơn nghỉ phép của nhân viên.');
    } finally {
      setLoadingApprovals(false);
    }
  };

  const handleOpenDecisionModal = (req: UserRequestItem, action: 'APPROVE' | 'REJECT') => {
    setSelectedRequestForDecision(req);
    setDecisionAction(action);
    setDecisionNote(action === 'APPROVE' ? 'Đã duyệt nghỉ phép' : 'Từ chối đơn');
  };

  const handleConfirmDecision = async () => {
    if (!selectedRequestForDecision || !decisionAction) return;
    setProcessingDecision(true);
    try {
      await requestsApi.decideRequest(selectedRequestForDecision.requestId, decisionAction, decisionNote);
      toast.success(decisionAction === 'APPROVE' ? 'Đã phê duyệt đơn nghỉ phép thành công!' : 'Đã từ chối đơn nghỉ phép.');
      setSelectedRequestForDecision(null);
      setDecisionAction(null);
      setDecisionNote('');
      fetchApprovals();
      fetchRequests();
      fetchFunds();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi xử lý đơn.');
    } finally {
      setProcessingDecision(false);
    }
  };

  const handleDeleteApprovalRequest = async (req: UserRequestItem) => {
    const isAppr = req.status === 'APPROVED';
    const confirmed = await toast.confirm({
      title: isAppr ? 'Xóa đơn nghỉ phép đã duyệt' : 'Xóa đơn xin nghỉ phép',
      message: isAppr
        ? `Bạn có chắc muốn xóa đơn nghỉ phép của nhân viên ${req.fullName || req.employeeCode} (${req.fromDate}${req.fromDate !== req.toDate ? ' đến ' + req.toDate : ''})?\n\nDo đơn này đã được duyệt trước đó, hệ thống sẽ tự động thu hồi ngày nghỉ và hoàn trả lại ${req.daysRequested} ngày vào quỹ phép năm cho nhân viên.`
        : `Bạn có chắc chắn muốn xóa đơn xin nghỉ phép này của nhân viên ${req.fullName || req.employeeCode}?`,
      confirmText: 'Xác nhận xóa',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      await requestsApi.deleteHrRequest(req.requestId);
      toast.success(isAppr ? 'Đã xóa đơn và hoàn trả quỹ phép thành công!' : 'Đã xóa đơn nghỉ phép thành công!');
      fetchApprovals();
      if (activeTab === 'requests') {
        fetchRequests();
      }
      if (activeTab === 'funds') {
        fetchFunds();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi xóa đơn.');
    }
  };

  const handleOpenEvidence = async (req: UserRequestItem) => {
    setViewingEvidenceReq(req);
    setLoadingEvidence(true);
    setEvidenceAttachments([]);
    try {
      const res = await api.get<{ attachments: { attachmentId: number; originalFileName: string; fileSizeBytes: number; mimeType: string }[] }>(`/requests/${req.requestId}`);
      const atts = res.data.attachments || [];
      const loaded = await Promise.all(
        atts.map(async (a) => {
          try {
            const imgRes = await api.get(`/attachments/${a.attachmentId}`, { responseType: 'blob' });
            const url = URL.createObjectURL(imgRes.data);
            return { id: a.attachmentId, name: a.originalFileName, url, size: a.fileSizeBytes };
          } catch {
            return { id: a.attachmentId, name: a.originalFileName, url: '', size: a.fileSizeBytes };
          }
        })
      );
      setEvidenceAttachments(loaded.filter(x => x.url));
    } catch {
      toast.error('Không thể tải tệp minh chứng.');
    } finally {
      setLoadingEvidence(false);
    }
  };

  // Fetch Funds
  const fetchFunds = async () => {
    if (!selectedCompany) return;
    setLoadingFunds(true);
    try {
      const monthParam = fundMonth === 'ALL' ? '' : `&month=${fundMonth}`;
      const res = await api.get<LeaveFund[]>(
        `/companies/${selectedCompany.id}/leave/funds?year=${fundYear}${monthParam}`
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
    if (activeTab === 'approvals') {
      fetchApprovals();
    } else if (activeTab === 'requests') {
      fetchRequests();
    } else {
      fetchFunds();
    }
  }, [selectedCompany?.id, activeTab, reqFrom, reqTo, fundYear, fundMonth, approvalStatusFilter]);

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
      const res = await api.post(`/companies/${selectedCompany.id}/leave/requests/import-excel`, formData);
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

  if (!selectedCompany) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>
        Vui lòng chọn một Hội sở làm việc trên thanh Navbar để quản lý đơn nghỉ phép và quỹ phép.
      </div>
    );
  }

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
                Quản Lý Nghỉ Phép — {selectedCompany ? selectedCompany.name : 'Tất cả hội sở'}
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
              gap: '6px',
              backgroundColor: '#f1f5f9',
              padding: '4px',
              borderRadius: '8px'
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('approvals')}
              className={`btn btn-sm ${activeTab === 'approvals' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CheckCircle2 size={15} />
              <span>Duyệt Đơn Nghỉ Phép</span>
              {pendingCount > 0 && (
                <span style={{
                  backgroundColor: activeTab === 'approvals' ? '#FEF08A' : '#EF4444',
                  color: activeTab === 'approvals' ? '#854D0E' : '#FFFFFF',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 800
                }}>
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`btn btn-sm ${activeTab === 'requests' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Danh sách toàn bộ ngày nghỉ phép đã lưu vào hệ thống từ nhập tay trực tiếp hoặc import file Excel"
            >
              <Calendar size={15} />
              <span>Danh Sách Nghỉ Đã Ghi Nhận</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('funds')}
              className={`btn btn-sm ${activeTab === 'funds' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Wallet size={15} />
              <span>Sổ Dư & Quỹ Phép</span>
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

      {/* ============================================================== */}
      {/* TAB 0: DUYỆT ĐƠN NGHỈ PHÉP NHÂN VIÊN GỬI LÊN                    */}
      {/* ============================================================== */}
      {activeTab === 'approvals' && (
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
              {/* Lọc trạng thái đơn */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginRight: '4px' }}>
                  Trạng thái:
                </span>
                {(['PENDING_HR', 'ALL', 'APPROVED', 'REJECTED'] as const).map((st) => {
                  const isCurrent = approvalStatusFilter === st;
                  const label = st === 'PENDING_HR' ? 'Chờ HCNS duyệt' : st === 'ALL' ? 'Tất cả' : st === 'APPROVED' ? 'Đã duyệt' : 'Đã từ chối';
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setApprovalStatusFilter(st)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: isCurrent ? '1px solid #0056B3' : '1px solid #CBD5E1',
                        backgroundColor: isCurrent ? '#EFF6FF' : '#FFFFFF',
                        color: isCurrent ? '#0056B3' : '#475569',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {label}
                      {st === 'PENDING_HR' && pendingCount > 0 && (
                        <span style={{
                          marginLeft: '6px',
                          backgroundColor: '#EF4444',
                          color: '#FFFFFF',
                          padding: '1px 5px',
                          borderRadius: '8px',
                          fontSize: '10px'
                        }}>
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tìm kiếm & nút làm mới */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative', minWidth: '240px' }}>
                  <Search
                    size={15}
                    color="#94a3b8"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="text"
                    placeholder="Tìm theo Mã NV, họ tên, lý do..."
                    value={approvalSearch}
                    onChange={e => setApprovalSearch(e.target.value)}
                    className="form-control form-control-sm"
                    style={{ paddingLeft: '32px', paddingRight: '12px' }}
                  />
                </div>

                <button
                  type="button"
                  onClick={fetchApprovals}
                  disabled={loadingApprovals}
                  className="btn btn-secondary btn-sm"
                  title="Tải lại danh sách đơn"
                  style={{ width: '32px', height: '32px', padding: 0 }}
                >
                  <RefreshCw size={14} className={loadingApprovals ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          </div>

          {/* Bảng danh sách đơn nghỉ phép */}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: '95px', whiteSpace: 'nowrap' }}>Mã NV</th>
                  <th style={{ minWidth: '180px', whiteSpace: 'nowrap' }}>Nhân viên</th>
                  <th style={{ minWidth: '95px', whiteSpace: 'nowrap' }}>Loại phép</th>
                  <th style={{ minWidth: '170px', whiteSpace: 'nowrap' }}>Thời gian nghỉ</th>
                  <th style={{ minWidth: '90px', textAlign: 'center', whiteSpace: 'nowrap' }}>Số ngày</th>
                  <th style={{ minWidth: '220px', whiteSpace: 'nowrap' }}>Lý do xin nghỉ</th>
                  <th style={{ minWidth: '100px', textAlign: 'center', whiteSpace: 'nowrap' }}>Minh chứng</th>
                  <th style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>Trạng thái</th>
                  <th style={{ minWidth: '170px', whiteSpace: 'nowrap' }}>Ghi chú / Ngày gửi</th>
                  <th style={{ minWidth: '175px', textAlign: 'center', whiteSpace: 'nowrap' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loadingApprovals ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                      Đang tải danh sách đơn nghỉ phép...
                    </td>
                  </tr>
                ) : approvalRequests.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                      Không có đơn xin nghỉ phép nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  approvalRequests
                    .filter(r => {
                      if (!approvalSearch.trim()) return true;
                      const term = approvalSearch.toLowerCase();
                      return (
                        (r.employeeCode && r.employeeCode.toLowerCase().includes(term)) ||
                        (r.fullName && r.fullName.toLowerCase().includes(term)) ||
                        (r.reason && r.reason.toLowerCase().includes(term))
                      );
                    })
                    .map(req => {
                      const isPending = req.status === 'PENDING_HR';
                      const isApproved = req.status === 'APPROVED';
                      const isRejected = req.status === 'REJECTED';

                      const dayPartText = req.dayPart === 'MORNING'
                        ? ' (Buổi sáng)'
                        : req.dayPart === 'AFTERNOON'
                          ? ' (Buổi chiều)'
                          : '';

                      return (
                        <tr key={req.requestId} style={{ backgroundColor: isPending ? '#FEFCE8' : undefined }}>
                          <td style={{ fontWeight: 700, color: '#0056B3', whiteSpace: 'nowrap' }}>
                            {req.employeeCode}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 700, color: '#0F172A' }}>{req.fullName || req.employeeCode}</div>
                            {req.departmentName && (
                              <div style={{ fontSize: '11px', color: '#64748B' }}>{req.departmentName}</div>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className="badge badge-primary" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {req.leaveCode || 'P'}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px', color: '#334155', whiteSpace: 'nowrap' }}>
                            <div>
                              <strong>{req.fromDate}</strong>
                              {req.fromDate !== req.toDate && <span> → <strong>{req.toDate}</strong></span>}
                            </div>
                            {dayPartText && <div style={{ color: '#D97706', fontSize: '11px', fontWeight: 600 }}>{dayPartText}</div>}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>
                            {req.daysRequested} d
                          </td>
                          <td style={{ fontSize: '13px', color: '#334155', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {req.reason || '—'}
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {req.attachmentCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleOpenEvidence(req)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: '#EFF6FF',
                                  color: '#1D4ED8',
                                  border: '1px solid #BFDBFE',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                                title="Nhấp để xem hình ảnh minh chứng"
                              >
                                <Paperclip size={12} /> {req.attachmentCount} ảnh
                              </button>
                            ) : (
                              <span style={{ color: '#94A3B8', fontSize: '12px' }}>—</span>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              backgroundColor: isApproved ? '#DCFCE7' : isRejected ? '#FEE2E2' : isPending ? '#FEF3C7' : '#F1F5F9',
                              color: isApproved ? '#166534' : isRejected ? '#991B1B' : isPending ? '#92400E' : '#475569',
                              whiteSpace: 'nowrap'
                            }}>
                              {isApproved ? <Check size={12} /> : isRejected ? <X size={12} /> : <Clock size={12} />}
                              {isApproved ? 'Đã duyệt' : isRejected ? 'Từ chối' : isPending ? 'Chờ duyệt' : 'Đã hủy'}
                            </span>
                          </td>
                          <td style={{ fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap' }}>
                            {req.hrNote && (
                              <div style={{ color: '#0F172A', fontWeight: 600, marginBottom: '2px' }}>
                                HCNS: {req.hrNote}
                              </div>
                            )}
                            <div>{new Date(req.createdAt).toLocaleDateString('vi-VN')} {new Date(req.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {isPending ? (
                              <div style={{ display: 'inline-flex', gap: '6px', whiteSpace: 'nowrap' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDecisionModal(req, 'APPROVE')}
                                  style={{
                                    backgroundColor: '#16A34A',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '5px 12px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title="Phê duyệt đơn này"
                                >
                                  <Check size={13} />
                                  <span>Duyệt</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDecisionModal(req, 'REJECT')}
                                  style={{
                                    backgroundColor: '#DC2626',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '5px 10px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title="Từ chối đơn này"
                                >
                                  <X size={13} />
                                  <span>Từ chối</span>
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteApprovalRequest(req)}
                                  style={{
                                    backgroundColor: '#FEF2F2',
                                    color: '#DC2626',
                                    border: '1px solid #FECACA',
                                    borderRadius: '6px',
                                    padding: '5px 10px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={isApproved ? "Xóa đơn đã duyệt (Thu hồi ngày nghỉ và hoàn trả quỹ phép năm)" : "Xóa đơn này"}
                                >
                                  <Trash2 size={13} />
                                  <span>Xóa</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 1: LEAVE REQUESTS - DANH SÁCH NGHỈ ĐÃ GHI NHẬN */}
      {activeTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Hướng dẫn giải thích danh mục */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#475569' }}>
            <span><strong>Dữ liệu ngày nghỉ:</strong> Tổng hợp toàn bộ các ngày nghỉ phép của nhân viên đã ghi nhận vào hệ thống (từ nhập tay trực tiếp, nạp file Excel hoặc đã duyệt từ đơn ESS) để phục vụ tính công kỳ này.</span>
          </div>

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
                  <div style={{ width: '155px' }}>
                    <DateInput
                      value={reqFrom}
                      onChange={val => setReqFrom(val)}
                      className="form-control form-control-sm"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Đến ngày:</span>
                  <div style={{ width: '155px' }}>
                    <DateInput
                      value={reqTo}
                      onChange={val => setReqTo(val)}
                      className="form-control form-control-sm"
                    />
                  </div>
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
                    max={today.getFullYear()}
                    value={fundYear}
                    onChange={e => {
                      const y = Number(e.target.value);
                      setFundYear(y);
                      const curYear = today.getFullYear();
                      const curMonth = today.getMonth() + 1;
                      if (y >= curYear && fundMonth !== 'ALL' && fundMonth > curMonth) {
                        setFundMonth(curMonth);
                      }
                    }}
                    className="form-control"
                    style={{ width: '85px', padding: '6px 10px', fontSize: '13px', fontWeight: 600 }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Lọc theo tháng:</span>
                  <select
                    value={fundMonth}
                    onChange={e => setFundMonth(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                    className="form-control"
                    style={{ minWidth: '150px', padding: '6px 10px', fontSize: '13px', fontWeight: 600 }}
                  >
                    <option value="ALL">-- Cả năm {fundYear} --</option>
                    {Array.from(
                      { length: fundYear >= today.getFullYear() ? today.getMonth() + 1 : 12 },
                      (_, i) => i + 1
                    ).map(m => (
                      <option key={m} value={m}>Tháng {m}/{fundYear}</option>
                    ))}
                  </select>
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

            {fundMonth !== 'ALL' && (
              <div
                style={{
                  borderTop: '1px solid #E2E8F0',
                  padding: '10px 1.25rem',
                  backgroundColor: '#F0FDF4',
                  fontSize: '12.5px',
                  color: '#166534',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 500
                }}
              >
                <Calendar size={15} color="#16A34A" />
                <span>
                  Đang xem số dư quỹ phép tính đến <strong>Tháng {fundMonth}/{fundYear}</strong>: Phép năm đầu kỳ Tháng {fundMonth} bằng <strong>số phép tồn của Tháng {Number(fundMonth) > 1 ? Number(fundMonth) - 1 : 12} chuyển sang</strong>.
                </span>
              </div>
            )}
          </div>

          {/* Table of Funds */}
          <div className="table-container">
            <table className="table">
              <thead>
                {fundMonth !== 'ALL' ? (
                  <tr>
                    <th style={{ width: '100px' }}>Mã NV</th>
                    <th>Họ và tên</th>
                    <th style={{ textAlign: 'center', width: '115px' }}>Phép năm (Đầu kỳ T{fundMonth})</th>
                    <th style={{ textAlign: 'center', width: '115px', backgroundColor: '#F0FDF4' }}>Tích lũy (Trong T{fundMonth})</th>
                    <th style={{ textAlign: 'center', width: '110px' }}>Tổng phép hưởng</th>
                    <th style={{ textAlign: 'center', width: '125px', backgroundColor: '#FEF3C7', color: '#92400E' }}>Đã dùng trong T{fundMonth}</th>
                    <th style={{ textAlign: 'center', width: '120px' }}>Dùng lũy kế (T1-T{fundMonth})</th>
                    <th style={{ textAlign: 'center', width: '135px' }}>Tồn phép (Tại T{fundMonth})</th>
                    <th style={{ textAlign: 'right', width: '90px' }}>Thao tác</th>
                  </tr>
                ) : (
                  <tr>
                    <th style={{ width: '100px' }}>Mã NV</th>
                    <th>Họ và tên</th>
                    <th style={{ textAlign: 'center', width: '100px' }}>Phép năm (Đầu kỳ)</th>
                    <th style={{ textAlign: 'center', width: '110px', backgroundColor: '#F0FDF4' }}>Tích lũy (+1/tháng)</th>
                    <th style={{ textAlign: 'center', width: '100px' }}>Tổng phép năm</th>
                    <th style={{ textAlign: 'center', width: '90px' }}>Phép chuyển</th>
                    <th style={{ textAlign: 'center', width: '90px' }}>Nghỉ bù</th>
                    <th style={{ textAlign: 'center', width: '120px' }}>Đã sử dụng cả năm</th>
                    <th style={{ textAlign: 'center', width: '130px' }}>Khả dụng (Còn lại)</th>
                    <th style={{ textAlign: 'right', width: '90px' }}>Thao tác</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {loadingFunds ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#2563eb' }} />
                      Đang tải số dư quỹ phép...
                    </td>
                  </tr>
                ) : filteredFunds.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                      Chưa có dữ liệu quỹ phép cho {fundMonth !== 'ALL' ? `Tháng ${fundMonth}/${fundYear}` : `năm ${fundYear}`}.
                    </td>
                  </tr>
                ) : (
                  filteredFunds.map(f => {
                    const opening = f.annualOpening + (f.carryOpening || 0);
                    const accrued = f.accrued ?? 0;
                    const totalAnnual = f.totalAnnualEarned ?? (opening + accrued);
                    const available = f.availableBalance ?? f.totalRemaining ?? 0;
                    const isExhausted = f.isExhausted ?? (available <= 0);

                    if (fundMonth !== 'ALL') {
                      const isAfterFirstMonth = Number(fundMonth) > 1;
                      const displayOpening = isAfterFirstMonth ? f.annualOpening : opening;

                      return (
                        <tr key={f.employeeId} style={{ backgroundColor: isExhausted ? '#FEF2F2' : undefined }}>
                          <td style={{ fontWeight: 700, color: '#1e40af', fontFamily: 'monospace' }}>
                            {f.employeeCode}
                          </td>
                          <td style={{ fontWeight: 600 }}>{f.fullName}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>
                            <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{displayOpening}</div>
                            {isAfterFirstMonth ? (
                              <div style={{ fontSize: '10.5px', color: '#0369A1', fontWeight: 600 }}>
                                (Tồn T{Number(fundMonth) - 1})
                              </div>
                            ) : (
                              f.carryOpening > 0 && (
                                <div style={{ fontSize: '10px', color: '#64748b' }}>
                                  ({f.annualOpening} + {f.carryOpening} chuyển)
                                </div>
                              )
                            )}
                          </td>
                          <td style={{ textAlign: 'center', backgroundColor: '#F0FDF4' }}>
                            <span
                              className="badge badge-success"
                              style={{ fontSize: '12px', padding: '2px 8px', fontWeight: 700 }}
                              title={`Tích lũy tính đến hết Tháng ${fundMonth}/${fundYear}`}
                            >
                              +{accrued}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#0369A1' }}>
                            {totalAnnual}
                          </td>
                          <td style={{ textAlign: 'center', backgroundColor: '#FFFBEB' }}>
                            {f.monthUsed != null && f.monthUsed > 0 ? (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: '#FEF3C7',
                                  color: '#B45309',
                                  border: '1px solid #FCD34D',
                                  fontWeight: 700,
                                  fontSize: '12px',
                                  padding: '2px 8px'
                                }}
                                title={`Đã sử dụng ${f.monthUsed} ngày phép trong Tháng ${fundMonth}/${fundYear}`}
                              >
                                {f.monthUsed} ngày
                              </span>
                            ) : (
                              <span style={{ color: '#94A3B8', fontSize: '12px' }}>0</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#e11d48', fontWeight: 700, fontFamily: 'monospace' }}>
                            -{f.totalUsed}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isExhausted ? (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: '#FEE2E2',
                                  color: '#991B1B',
                                  border: '1px solid #F87171',
                                  fontSize: '12px',
                                  padding: '3px 8px',
                                  fontWeight: 700
                                }}
                                title={`Tại thời điểm Tháng ${fundMonth}/${fundYear}, nhân viên đã dùng hết phép`}
                              >
                                ⚠️ Hết phép (0)
                              </span>
                            ) : (
                              <span
                                className="badge badge-success"
                                style={{ fontSize: '12px', padding: '3px 8px', fontWeight: 700 }}
                                title={`Số ngày phép năm còn tồn tính đến hết Tháng ${fundMonth}/${fundYear}`}
                              >
                                {available.toFixed(1)} ngày
                              </span>
                            )}
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
                      );
                    }

                    return (
                      <tr key={f.employeeId} style={{ backgroundColor: isExhausted ? '#FEF2F2' : undefined }}>
                        <td style={{ fontWeight: 700, color: '#1e40af', fontFamily: 'monospace' }}>
                          {f.employeeCode}
                        </td>
                        <td style={{ fontWeight: 600 }}>{f.fullName}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{f.annualOpening}</td>
                        <td style={{ textAlign: 'center', backgroundColor: '#F0FDF4' }}>
                          <span
                            className="badge badge-success"
                            style={{ fontSize: '12px', padding: '2px 8px', fontWeight: 700 }}
                            title="Tích lũy +1 ngày mỗi tháng đạt đủ 14 công khi chốt kỳ"
                          >
                            +{accrued}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#0369A1' }}>
                          {totalAnnual}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{f.carryOpening}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{f.compOpening}</td>
                        <td style={{ textAlign: 'center', fontSize: '12px', color: '#e11d48', fontWeight: 700, fontFamily: 'monospace' }}>
                          -{f.totalUsed}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isExhausted ? (
                            <span
                              className="badge"
                              style={{
                                backgroundColor: '#FEE2E2',
                                color: '#991B1B',
                                border: '1px solid #F87171',
                                fontSize: '12px',
                                padding: '3px 8px',
                                fontWeight: 700
                              }}
                              title="Nhân viên đã dùng hết phép năm, không thể nghỉ phép năm nữa"
                            >
                              ⚠️ Hết phép (0)
                            </span>
                          ) : (
                            <span
                              className="badge badge-success"
                              style={{ fontSize: '12px', padding: '3px 8px', fontWeight: 700 }}
                            >
                              {available.toFixed(1)} ngày
                            </span>
                          )}
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
                    );
                  })
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
                  <DateInput
                    required
                    value={reqDate}
                    onChange={val => setReqDate(val)}
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
                              className={`badge ${item.amount > 0
                                ? 'badge-success'
                                : item.fund === 'ANNUAL'
                                  ? 'badge-primary'
                                  : item.fund === 'CARRY'
                                    ? 'badge-warning'
                                    : 'badge-neutral'
                                }`}
                            >
                              {item.amount > 0
                                ? '★ Tích lũy (+1)'
                                : item.fund === 'ANNUAL'
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
                          <td style={{ fontSize: '12px', color: '#475569' }}>
                            {item.note || item.reason || (item.code === 'ACCRUAL' ? 'Cộng 1 ngày phép năm do làm việc đủ >= 14 ngày công' : '-')}
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

      {/* MODAL: XÁC NHẬN PHÊ DUYỆT HOẶC TỪ CHỐI ĐƠN (POPUP MODAL) */}
      {selectedRequestForDecision && decisionAction && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1050 }}
          onClick={() => {
            setSelectedRequestForDecision(null);
            setDecisionAction(null);
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: '520px', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{
                backgroundColor: decisionAction === 'APPROVE' ? '#F0FDF4' : '#FEF2F2',
                borderBottom: `1px solid ${decisionAction === 'APPROVE' ? '#BBF7D0' : '#FECACA'}`,
                padding: '16px 20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {decisionAction === 'APPROVE' ? (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={22} color="#16A34A" />
                  </div>
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <XCircle size={22} color="#DC2626" />
                  </div>
                )}
                <div>
                  <h3
                    className="modal-title"
                    style={{
                      color: decisionAction === 'APPROVE' ? '#166534' : '#991B1B',
                      fontSize: '16px',
                      fontWeight: 800,
                      margin: 0
                    }}
                  >
                    {decisionAction === 'APPROVE' ? 'Xác Nhận Phê Duyệt Đơn Nghỉ Phép' : 'Từ Chối Đơn Nghỉ Phép'}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    Mã đơn: #{selectedRequestForDecision.requestId} • {selectedRequestForDecision.fullName || selectedRequestForDecision.employeeCode}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedRequestForDecision(null);
                  setDecisionAction(null);
                }}
                className="btn-close"
                title="Đóng (ESC)"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  fontSize: '13px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748B', fontSize: '12px' }}>Nhân viên:</span>
                  <strong style={{ color: '#0F172A', fontSize: '13px' }}>
                    {selectedRequestForDecision.fullName || selectedRequestForDecision.employeeCode}{' '}
                    <span style={{ color: '#0056B3', fontFamily: 'monospace' }}>({selectedRequestForDecision.employeeCode})</span>
                  </strong>
                </div>

                {selectedRequestForDecision.departmentName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748B', fontSize: '12px' }}>Phòng ban:</span>
                    <span style={{ color: '#334155', fontWeight: 600 }}>{selectedRequestForDecision.departmentName}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748B', fontSize: '12px' }}>Thời gian xin nghỉ:</span>
                  <span style={{ fontWeight: 700, color: '#0056B3' }}>
                    {selectedRequestForDecision.fromDate}{selectedRequestForDecision.fromDate !== selectedRequestForDecision.toDate ? ` → ${selectedRequestForDecision.toDate}` : ''}
                    <span style={{ color: '#16A34A', marginLeft: '6px' }}>({selectedRequestForDecision.daysRequested} ngày)</span>
                  </span>
                </div>

                {selectedRequestForDecision.dayPart && selectedRequestForDecision.dayPart !== 'FULL' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748B', fontSize: '12px' }}>Buổi nghỉ:</span>
                    <span style={{ color: '#D97706', fontWeight: 700 }}>
                      {selectedRequestForDecision.dayPart === 'MORNING' ? 'Buổi sáng' : 'Buổi chiều'}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ color: '#64748B', fontSize: '12px', whiteSpace: 'nowrap' }}>Lý do xin nghỉ:</span>
                  <span style={{ color: '#334155', fontStyle: 'italic', textAlign: 'right' }}>
                    "{selectedRequestForDecision.reason || 'Không ghi chú'}"
                  </span>
                </div>

                {selectedRequestForDecision.attachmentCount > 0 && (
                  <div
                    style={{
                      marginTop: '4px',
                      paddingTop: '10px',
                      borderTop: '1px dashed #CBD5E1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ color: '#1D4ED8', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Paperclip size={14} /> Có {selectedRequestForDecision.attachmentCount} ảnh minh chứng đính kèm
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenEvidence(selectedRequestForDecision)}
                      style={{
                        backgroundColor: '#EFF6FF',
                        color: '#1D4ED8',
                        border: '1px solid #BFDBFE',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Eye size={12} /> Xem ảnh minh chứng
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px', display: 'block' }}>
                  Ghi chú phản hồi của HCNS:
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={decisionNote}
                  onChange={e => setDecisionNote(e.target.value)}
                  placeholder={decisionAction === 'APPROVE' ? 'Ghi chú duyệt (mặc định: Đã duyệt)...' : 'Nhập lý do từ chối để nhân viên nắm rõ...'}
                  style={{
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    padding: '8px 12px',
                    fontSize: '13px',
                    width: '100%',
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div
              className="modal-footer"
              style={{
                backgroundColor: '#F8FAFC',
                borderTop: '1px solid #E2E8F0',
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px'
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedRequestForDecision(null);
                  setDecisionAction(null);
                }}
                disabled={processingDecision}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '8px' }}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDecision}
                disabled={processingDecision}
                style={{
                  backgroundColor: decisionAction === 'APPROVE' ? '#16A34A' : '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: processingDecision ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                {processingDecision ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : decisionAction === 'APPROVE' ? (
                  <Check size={14} />
                ) : (
                  <X size={14} />
                )}
                <span>
                  {processingDecision
                    ? 'Đang xử lý...'
                    : decisionAction === 'APPROVE'
                      ? 'Xác nhận Phê Duyệt'
                      : 'Xác nhận Từ Chối'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XEM ẢNH MINH CHỨNG (POPUP MODAL) */}
      {viewingEvidenceReq && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1100 }}
          onClick={() => setViewingEvidenceReq(null)}
        >
          <div
            className="modal-content"
            style={{ maxWidth: '680px', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{
                backgroundColor: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                padding: '16px 20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Paperclip size={18} color="#0056B3" />
                </div>
                <div>
                  <h3 className="modal-title" style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B', margin: 0 }}>
                    Ảnh Minh Chứng Nghỉ Phép
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    {viewingEvidenceReq.fullName || viewingEvidenceReq.employeeCode} ({viewingEvidenceReq.employeeCode}) • Ngày nghỉ: {viewingEvidenceReq.fromDate}{viewingEvidenceReq.toDate !== viewingEvidenceReq.fromDate ? ` → ${viewingEvidenceReq.toDate}` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingEvidenceReq(null)}
                className="btn-close"
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px', maxHeight: '72vh', overflowY: 'auto' }}>
              <div
                style={{
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '12px',
                  color: '#1E40AF',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Eye size={15} />
                <span>Nhấp trực tiếp vào hình ảnh hoặc nút <strong>Phóng to</strong> để xem chi tiết ảnh ở chế độ toàn màn hình.</span>
              </div>

              {loadingEvidence ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#0056B3' }} />
                  Đang tải hình ảnh minh chứng WebP...
                </div>
              ) : evidenceAttachments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
                  Không tìm thấy hình ảnh minh chứng nào cho đơn này.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {evidenceAttachments.map((att, idx) => (
                    <div
                      key={att.id}
                      style={{
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        backgroundColor: '#F8FAFC',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div
                        style={{
                          padding: '10px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: '#F1F5F9',
                          borderBottom: '1px solid #E2E8F0',
                          fontSize: '12px'
                        }}
                      >
                        <span style={{ fontWeight: 700, color: '#334155' }}>
                          Ảnh #{idx + 1}: {att.name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button
                            type="button"
                            onClick={() => setLightboxImage({ url: att.url, name: att.name })}
                            style={{
                              backgroundColor: '#EFF6FF',
                              color: '#0056B3',
                              border: '1px solid #BFDBFE',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="Xem ảnh phóng to toàn màn hình"
                          >
                            <Eye size={12} /> Phóng to
                          </button>
                          <a
                            href={att.url}
                            download={att.name}
                            style={{
                              color: '#475569',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              textDecoration: 'none',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                            title="Tải ảnh gốc về máy"
                          >
                            <Download size={12} /> Tải về
                          </a>
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '14px',
                          textAlign: 'center',
                          cursor: 'zoom-in',
                          backgroundColor: '#FFFFFF'
                        }}
                        onClick={() => setLightboxImage({ url: att.url, name: att.name })}
                        title="Bấm để xem ảnh phóng to"
                      >
                        <img
                          src={att.url}
                          alt={att.name}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '380px',
                            objectFit: 'contain',
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                            transition: 'transform 0.15s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className="modal-footer"
              style={{
                backgroundColor: '#F8FAFC',
                borderTop: '1px solid #E2E8F0',
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'flex-end'
              }}
            >
              <button
                type="button"
                onClick={() => setViewingEvidenceReq(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '8px' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XEM ẢNH PHÓNG TO (LIGHTBOX POPUP MODAL TOÀN MÀN HÌNH) */}
      {lightboxImage && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 1200,
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(5px)',
            padding: '20px'
          }}
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="modal-content"
            style={{
              maxWidth: '92vw',
              maxHeight: '94vh',
              backgroundColor: '#0F172A',
              color: '#FFF',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Lightbox */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: '#1E293B'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Eye size={18} color="#60A5FA" />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '14px',
                    color: '#F8FAFC',
                    maxWidth: '60vw',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {lightboxImage.name}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <a
                  href={lightboxImage.url}
                  download={lightboxImage.name}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#0284C7',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    cursor: 'pointer'
                  }}
                  title="Tải ảnh về máy"
                >
                  <Download size={14} /> Tải ảnh
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#F8FAFC',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  title="Đóng (ESC)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body Lightbox */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                overflow: 'auto',
                backgroundColor: '#020617'
              }}
            >
              <img
                src={lightboxImage.url}
                alt={lightboxImage.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '80vh',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
