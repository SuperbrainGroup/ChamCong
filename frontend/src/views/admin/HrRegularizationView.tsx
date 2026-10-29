import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { requestsApi } from '../../api/client';
import { UserRequestItem } from '../../types';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Eye,
  FileText,
  Paperclip,
  Calendar,
  Building2,
  User,
  AlertCircle,
  Check,
  X,
  Download,
  ExternalLink,
  Trash2
} from 'lucide-react';

const REASON_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  FORGOT_PUNCH: { label: 'Quên quẹt thẻ', color: '#b45309', bg: '#fef3c7' },
  DEVICE_ERROR: { label: 'Lỗi thiết bị / Mạng', color: '#b91c1c', bg: '#fee2e2' },
  BUSINESS_TRIP: { label: 'Công tác / Việc ngoài', color: '#1d4ed8', bg: '#dbeafe' },
  LATE_EARLY: { label: 'Đi trễ / Về sớm có lý do', color: '#6d28d9', bg: '#ede9fe' },
  OTHER: { label: 'Lý do khác', color: '#374151', bg: '#f3f4f6' }
};

export const HrRegularizationView: React.FC = () => {
  const { selectedCompany } = useAuth();
  const toast = useToast();

  const [requests, setRequests] = useState<UserRequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Bộ lọc
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_HR' | 'APPROVED' | 'REJECTED'>('PENDING_HR');
  const [reasonFilter, setReasonFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Selection cho batch actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Modal quyết định (Duyệt / Từ chối đơn lẻ)
  const [decisionModalReq, setDecisionModalReq] = useState<UserRequestItem | null>(null);
  const [decisionAction, setDecisionAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);

  // Modal xem minh chứng / chi tiết
  const [viewDetailReq, setViewDetailReq] = useState<UserRequestItem | null>(null);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<number | null>(null);

  const handleOpenDetail = async (r: UserRequestItem) => {
    setViewDetailReq(r);
    try {
      const detail = await requestsApi.getById(r.requestId);
      if (detail) {
        setViewDetailReq(detail);
      }
    } catch (err) {
      console.error('Lỗi khi nạp chi tiết đơn:', err);
    }
  };

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // Nạp toàn bộ đơn (không truyền status) để 4 Card KPI luôn hiển thị số lượng chuẩn xác ngay từ đầu
      const data = await requestsApi.getHrRequests(
        undefined,
        selectedCompany?.code,
        'REGULARIZATION'
      );
      setRequests(data);
      setSelectedIds([]);
    } catch (err: any) {
      console.error('Lỗi khi tải danh sách giải trình:', err);
      toast.error('Không thể tải danh sách giải trình chấm công.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [selectedCompany?.code]);

  // Thống kê nhanh (luôn phản ánh chính xác toàn bộ số đơn)
  const stats = useMemo(() => {
    const pending = requests.filter(r => r.status === 'PENDING_HR').length;
    const approved = requests.filter(r => r.status === 'APPROVED').length;
    const rejected = requests.filter(r => r.status === 'REJECTED').length;
    return { pending, approved, rejected, total: requests.length };
  }, [requests]);

  // Lọc dữ liệu client-side (status, search, reason, date)
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      // 0. Trạng thái theo Card / Tab
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;

      // 1. Lý do
      if (reasonFilter !== 'ALL' && r.reasonCode !== reasonFilter) return false;

      // 2. Tìm kiếm (Tên, Mã NV, Lý do)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (r.fullName || '').toLowerCase().includes(q);
        const matchCode = (r.employeeCode || '').toLowerCase().includes(q);
        const matchReason = (r.reason || '').toLowerCase().includes(q);
        const matchDept = (r.departmentName || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchReason && !matchDept) return false;
      }

      // 3. Khoảng ngày
      if (dateFrom && r.fromDate < dateFrom) return false;
      if (dateTo && r.fromDate > dateTo) return false;

      return true;
    });
  }, [requests, statusFilter, reasonFilter, searchQuery, dateFrom, dateTo]);

  // Xử lý Checkbox chọn tất cả đơn chờ duyệt
  const pendingRequestsInView = useMemo(() => {
    return filteredRequests.filter(r => r.status === 'PENDING_HR');
  }, [filteredRequests]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      if (statusFilter === 'PENDING_HR') {
        setSelectedIds(pendingRequestsInView.map(r => r.requestId));
      } else {
        setSelectedIds(filteredRequests.map(r => r.requestId));
      }
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Mở modal duyệt / từ chối
  const handleOpenDecision = (req: UserRequestItem, action: 'APPROVE' | 'REJECT') => {
    setDecisionModalReq(req);
    setDecisionAction(action);
    setDecisionNote(action === 'APPROVE' ? 'Đã duyệt giải trình chấm công' : '');
  };

  // Xác nhận Duyệt / Từ chối đơn lẻ
  const handleConfirmDecision = async () => {
    if (!decisionModalReq) return;
    if (decisionAction === 'REJECT' && !decisionNote.trim()) {
      toast.error('Vui lòng nhập lý do từ chối để nhân viên nắm thông tin.');
      return;
    }

    setDecisionSubmitting(true);
    try {
      await requestsApi.decideRequest(decisionModalReq.requestId, decisionAction, decisionNote.trim());
      toast.success(
        decisionAction === 'APPROVE'
          ? `Đã phê duyệt giải trình cho nhân sự ${decisionModalReq.fullName || decisionModalReq.employeeCode}.`
          : `Đã từ chối giải trình của ${decisionModalReq.fullName || decisionModalReq.employeeCode}.`
      );
      setDecisionModalReq(null);
      await fetchRequests();
      window.dispatchEvent(new CustomEvent('notification-updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi khi xử lý đơn giải trình.');
    } finally {
      setDecisionSubmitting(false);
    }
  };

  // Phê duyệt hàng loạt các đơn đã chọn
  const handleBatchDecision = async (action: 'APPROVE' | 'REJECT') => {
    if (selectedIds.length === 0) return;

    const actionText = action === 'APPROVE' ? 'phê duyệt' : 'từ chối';
    const confirmed = await toast.confirm({
      title: `Xác nhận ${actionText} hàng loạt`,
      message: `Bạn có chắc chắn muốn ${actionText} đồng loạt ${selectedIds.length} đơn giải trình đã chọn?`,
      confirmText: action === 'APPROVE' ? 'Duyệt tất cả' : 'Từ chối tất cả',
      type: action === 'APPROVE' ? 'primary' : 'danger'
    });
    if (!confirmed) return;

    setBatchProcessing(true);
    try {
      const note = action === 'APPROVE' ? 'HCNS duyệt hàng loạt' : 'HCNS từ chối hàng loạt';
      const res = await requestsApi.batchDecideRequests(selectedIds, action, note);
      toast.success(res.message || `Đã xử lý xong ${selectedIds.length} đơn giải trình.`);
      setSelectedIds([]);
      await fetchRequests();
      window.dispatchEvent(new CustomEvent('notification-updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi xử lý hàng loạt.');
    } finally {
      setBatchProcessing(false);
    }
  };

  // Xóa giải trình (kể cả giải trình đã duyệt)
  const handleDeleteRequest = async (r: UserRequestItem) => {
    const isAppr = r.status === 'APPROVED';
    const confirmed = await toast.confirm({
      title: isAppr ? 'Xóa giải trình đã duyệt' : 'Xóa đơn giải trình',
      message: isAppr
        ? `Bạn có chắc muốn xóa giải trình ngày ${r.fromDate} của nhân sự ${r.fullName || r.employeeCode}?\n\nDo đơn này đã được duyệt trước đó, hệ thống sẽ tự động thu hồi giờ vào/ra điều chỉnh và tính toán lại công cho ngày này.`
        : `Bạn có chắc muốn xóa đơn giải trình ngày ${r.fromDate} của nhân sự ${r.fullName || r.employeeCode}?`,
      confirmText: 'Xác nhận xóa',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      await requestsApi.deleteHrRequest(r.requestId);
      toast.success(isAppr ? 'Đã xóa giải trình và tính lại công thành công!' : 'Đã xóa đơn giải trình thành công!');
      setSelectedIds(prev => prev.filter(id => id !== r.requestId));
      await fetchRequests();
      window.dispatchEvent(new CustomEvent('notification-updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi xóa giải trình.');
    }
  };

  // Xóa hàng loạt giải trình đã chọn
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmed = await toast.confirm({
      title: 'Xóa hàng loạt giải trình',
      message: `Bạn có chắc chắn muốn xóa đồng loạt ${selectedIds.length} đơn giải trình đã chọn?\n\nĐối với các đơn đã duyệt, hệ thống sẽ thu hồi giờ điều chỉnh và tính toán lại dữ liệu công của các ngày đó.`,
      confirmText: 'Xác nhận xóa tất cả',
      type: 'danger'
    });
    if (!confirmed) return;

    setBatchProcessing(true);
    try {
      const res = await requestsApi.batchDeleteHrRequests(selectedIds);
      toast.success(res.message || `Đã xóa thành công ${selectedIds.length} đơn giải trình.`);
      setSelectedIds([]);
      await fetchRequests();
      window.dispatchEvent(new CustomEvent('notification-updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi xóa hàng loạt.');
    } finally {
      setBatchProcessing(false);
    }
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP HEADER & KPI CARDS */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--neutral-900)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ClipboardCheck size={24} color="var(--primary)" />
            <span>Quản Lý & Duyệt Giải Trình Chấm Công</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>
            Xem xét và phê duyệt các yêu cầu bổ sung giờ vào/ra, quên quẹt thẻ, công tác ngoài của nhân sự — {selectedCompany ? selectedCompany.name : 'Tất cả đơn vị'}
          </div>
        </div>

        <button className="btn btn-secondary" onClick={fetchRequests} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* KPI STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div
          onClick={() => { setStatusFilter('PENDING_HR'); setSelectedIds([]); }}
          style={{
            backgroundColor: '#ffffff',
            border: `2px solid ${statusFilter === 'PENDING_HR' ? '#f59e0b' : 'var(--neutral-200)'}`,
            borderRadius: '12px',
            padding: '14px 18px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: statusFilter === 'PENDING_HR' ? '0 4px 12px rgba(245, 158, 11, 0.15)' : 'none'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={15} />
            <span>Chờ HR Duyệt</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#d97706', marginTop: '6px' }}>
            {stats.pending}
          </div>
        </div>

        <div
          onClick={() => { setStatusFilter('APPROVED'); setSelectedIds([]); }}
          style={{
            backgroundColor: '#ffffff',
            border: `2px solid ${statusFilter === 'APPROVED' ? '#10b981' : 'var(--neutral-200)'}`,
            borderRadius: '12px',
            padding: '14px 18px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: statusFilter === 'APPROVED' ? '0 4px 12px rgba(16, 185, 129, 0.15)' : 'none'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#047857', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={15} />
            <span>Đã Phê Duyệt</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#059669', marginTop: '6px' }}>
            {stats.approved}
          </div>
        </div>

        <div
          onClick={() => { setStatusFilter('REJECTED'); setSelectedIds([]); }}
          style={{
            backgroundColor: '#ffffff',
            border: `2px solid ${statusFilter === 'REJECTED' ? '#ef4444' : 'var(--neutral-200)'}`,
            borderRadius: '12px',
            padding: '14px 18px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: statusFilter === 'REJECTED' ? '0 4px 12px rgba(239, 68, 68, 0.15)' : 'none'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <XCircle size={15} />
            <span>Đã Từ Chối</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#dc2626', marginTop: '6px' }}>
            {stats.rejected}
          </div>
        </div>

        <div
          onClick={() => { setStatusFilter('ALL'); setSelectedIds([]); }}
          style={{
            backgroundColor: '#ffffff',
            border: `2px solid ${statusFilter === 'ALL' ? 'var(--primary)' : 'var(--neutral-200)'}`,
            borderRadius: '12px',
            padding: '14px 18px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: statusFilter === 'ALL' ? '0 4px 12px rgba(0, 86, 179, 0.15)' : 'none'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--neutral-600)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={15} />
            <span>Tất Cả Đơn</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--neutral-800)', marginTop: '6px' }}>
            {stats.total}
          </div>
        </div>
      </div>

      {/* 2. FILTERS & SEARCH TOOLBAR */}
      <div className="card">
        <div className="card-body" style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
          {/* Trạng thái Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--neutral-100)', padding: '4px', borderRadius: '10px' }}>
            {(['PENDING_HR', 'APPROVED', 'REJECTED', 'ALL'] as const).map(st => {
              const active = statusFilter === st;
              const labels = {
                PENDING_HR: `Chờ duyệt (${stats.pending})`,
                APPROVED: `Đã duyệt (${stats.approved})`,
                REJECTED: `Từ chối (${stats.rejected})`,
                ALL: `Tất cả (${stats.total})`
              };
              return (
                <button
                  key={st}
                  onClick={() => { setStatusFilter(st); setSelectedIds([]); }}
                  style={{
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: active ? 700 : 500,
                    backgroundColor: active ? '#ffffff' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--neutral-600)',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {labels[st]}
                </button>
              );
            })}
          </div>

          {/* Lọc & Search Controls */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            {/* Lọc lý do */}
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: '170px', fontSize: '13px' }}
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
            >
              <option value="ALL">-- Tất cả lý do --</option>
              <option value="FORGOT_PUNCH">Quên quẹt thẻ</option>
              <option value="DEVICE_ERROR">Lỗi thiết bị / Mạng</option>
              <option value="BUSINESS_TRIP">Công tác / Việc ngoài</option>
              <option value="LATE_EARLY">Đi trễ / Về sớm có lý do</option>
              <option value="OTHER">Lý do khác</option>
            </select>

            {/* Tìm kiếm */}
            <div style={{ position: 'relative', width: '230px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '32px', fontSize: '13px' }}
                placeholder="Tìm mã NV, tên, lý do..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. BATCH ACTIONS BAR (KHI CÓ CHECKBOX ĐƯỢC CHỌN) */}
      {selectedIds.length > 0 && (
        <div
          style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '10px',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            animation: 'fadeIn 0.2s ease'
          }}
        >
          <div style={{ fontSize: '14px', color: '#1e40af', fontWeight: 600 }}>
            Đang chọn: <strong>{selectedIds.length}</strong> đơn giải trình
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedIds([])}
              disabled={batchProcessing}
            >
              Bỏ chọn
            </button>

            {statusFilter === 'PENDING_HR' && (
              <>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleBatchDecision('REJECT')}
                  disabled={batchProcessing}
                >
                  <X size={14} />
                  <span>Từ chối tất cả ({selectedIds.length})</span>
                </button>

                <button
                  className="btn btn-primary btn-sm"
                  style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                  onClick={() => handleBatchDecision('APPROVE')}
                  disabled={batchProcessing}
                >
                  <Check size={14} />
                  <span>Duyệt tất cả ({selectedIds.length})</span>
                </button>
              </>
            )}

            <button
              className="btn btn-sm"
              onClick={handleBatchDelete}
              disabled={batchProcessing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Trash2 size={13} />
              <span>Xóa {selectedIds.length} đơn đã chọn</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. DATA TABLE */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--neutral-500)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <div>Đang tải danh sách giải trình chấm công...</div>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--neutral-500)' }}>
              <ClipboardCheck size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div style={{ fontWeight: 600, fontSize: '15px' }}>Không có đơn giải trình nào phù hợp.</div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>
                {statusFilter === 'PENDING_HR' ? 'Tuyệt vời! Hiện không có đơn nào đang chờ duyệt.' : 'Thử điều chỉnh lại bộ lọc để xem các đơn khác.'}
              </div>
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table" style={{ verticalAlign: 'middle' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.length > 0 && selectedIds.length === (statusFilter === 'PENDING_HR' ? pendingRequestsInView.length : filteredRequests.length)}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        title="Chọn tất cả đơn"
                      />
                    </th>
                    <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                    <th style={{ width: '220px' }}>Nhân sự</th>
                    <th style={{ width: '130px' }}>Ngày công</th>
                    <th style={{ width: '180px' }}>Giờ đề xuất</th>
                    <th style={{ width: '180px' }}>Loại lý do</th>
                    <th>Nội dung giải trình</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Minh chứng</th>
                    <th style={{ width: '130px', textAlign: 'center' }}>Trạng thái</th>
                    <th style={{ width: '160px', textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r, idx) => {
                    const isPending = r.status === 'PENDING_HR';
                    const isSelected = selectedIds.includes(r.requestId);
                    const reasonMeta = (r.reasonCode && REASON_LABELS[r.reasonCode]) || REASON_LABELS.OTHER;

                    return (
                      <tr key={r.requestId} style={{ backgroundColor: isSelected ? '#f0f9ff' : undefined }}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(r.requestId)}
                          />
                        </td>

                        <td style={{ textAlign: 'center', fontSize: '12px', color: 'var(--neutral-500)' }}>
                          {idx + 1}
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--primary-light, #e0f2fe)',
                                color: 'var(--primary, #0284c7)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '12px'
                              }}
                            >
                              {(r.fullName || r.employeeCode || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--neutral-900)' }}>
                                {r.fullName || r.employeeCode}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--neutral-500)', display: 'flex', gap: '6px' }}>
                                <span style={{ fontWeight: 600 }}>{r.employeeCode}</span>
                                {r.departmentName && <span>• {r.departmentName}</span>}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 700, fontSize: '13px' }}>
                            {r.fromDate}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--neutral-400)' }}>
                            Gửi lúc {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {r.actualTimeIn && (
                              <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '10px', padding: '1px 4px', backgroundColor: '#dcfce7', color: '#15803d', borderRadius: '4px', fontWeight: 700 }}>VÀO</span>
                                <strong>{r.actualTimeIn}</strong>
                              </div>
                            )}
                            {r.actualTimeOut && (
                              <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '10px', padding: '1px 4px', backgroundColor: '#fef3c7', color: '#b45309', borderRadius: '4px', fontWeight: 700 }}>RA</span>
                                <strong>{r.actualTimeOut}</strong>
                              </div>
                            )}
                            {!r.actualTimeIn && !r.actualTimeOut && (
                              <span style={{ fontSize: '12px', color: 'var(--neutral-400)', fontStyle: 'italic' }}>Không kèm giờ</span>
                            )}
                          </div>
                        </td>

                        <td>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              backgroundColor: reasonMeta.bg,
                              color: reasonMeta.color,
                              display: 'inline-block'
                            }}
                          >
                            {reasonMeta.label}
                          </span>
                        </td>

                        <td>
                          <div
                            style={{
                              fontSize: '13px',
                              lineHeight: 1.4,
                              color: 'var(--neutral-800)',
                              maxWidth: '300px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={r.reason}
                          >
                            {r.reason || '—'}
                          </div>
                          {r.hrNote && (
                            <div style={{ fontSize: '11px', color: 'var(--neutral-500)', marginTop: '2px', fontStyle: 'italic' }}>
                              Phản hồi: {r.hrNote}
                            </div>
                          )}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          {r.attachmentCount > 0 ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--primary)' }}
                              onClick={() => handleOpenDetail(r)}
                              title="Xem tệp minh chứng đính kèm"
                            >
                              <Paperclip size={12} />
                              <span>{r.attachmentCount}</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--neutral-300)' }}>—</span>
                          )}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          {r.status === 'PENDING_HR' && (
                            <span className="badge badge-warning" style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                              Chờ duyệt
                            </span>
                          )}
                          {r.status === 'APPROVED' && (
                            <span className="badge badge-success" style={{ backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>
                              Đã duyệt
                            </span>
                          )}
                          {r.status === 'REJECTED' && (
                            <span className="badge badge-danger" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                              Từ chối
                            </span>
                          )}
                          {r.status === 'CANCELLED' && (
                            <span className="badge badge-neutral">Đã hủy</span>
                          )}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleOpenDetail(r)}
                              title="Xem chi tiết đơn"
                              style={{ padding: '4px 8px' }}
                            >
                              <Eye size={13} />
                            </button>

                            {isPending && (
                              <>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ color: '#15803d', borderColor: 'rgba(34, 197, 94, 0.4)', padding: '4px 8px' }}
                                  onClick={() => handleOpenDecision(r, 'APPROVE')}
                                  title="Phê duyệt giải trình này"
                                >
                                  <Check size={13} />
                                  <span>Duyệt</span>
                                </button>

                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ color: '#b91c1c', borderColor: 'rgba(239, 68, 68, 0.4)', padding: '4px 8px' }}
                                  onClick={() => handleOpenDecision(r, 'REJECT')}
                                  title="Từ chối giải trình này"
                                >
                                  <X size={13} />
                                  <span>Từ chối</span>
                                </button>
                              </>
                            )}

                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ color: '#dc2626', borderColor: 'rgba(239, 68, 68, 0.4)', padding: '4px 8px', backgroundColor: '#fef2f2' }}
                              onClick={() => handleDeleteRequest(r)}
                              title={r.status === 'APPROVED' ? 'Xóa giải trình đã duyệt (Thu hồi điều chỉnh giờ và tính lại công)' : 'Xóa giải trình này'}
                            >
                              <Trash2 size={13} />
                              <span>Xóa</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 5. MODAL QUYẾT ĐỊNH (PHÊ DUYỆT / TỪ CHỐI ĐƠN LẺ) */}
      {decisionModalReq && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
                {decisionAction === 'APPROVE' ? (
                  <>
                    <CheckCircle2 size={18} color="#15803d" />
                    <span style={{ color: '#15803d' }}>Phê Duyệt Giải Trình Chấm Công</span>
                  </>
                ) : (
                  <>
                    <XCircle size={18} color="#b91c1c" />
                    <span style={{ color: '#b91c1c' }}>Từ Chối Giải Trình Chấm Công</span>
                  </>
                )}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setDecisionModalReq(null)} disabled={decisionSubmitting}>✕</button>
            </div>

            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Tóm tắt đơn */}
              <div style={{ backgroundColor: 'var(--neutral-50)', padding: '12px 14px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.6 }}>
                <div><strong>Nhân sự:</strong> {decisionModalReq.fullName} ({decisionModalReq.employeeCode})</div>
                <div><strong>Ngày công giải trình:</strong> {decisionModalReq.fromDate}</div>
                <div>
                  <strong>Giờ đề xuất:</strong>{' '}
                  {decisionModalReq.actualTimeIn && <span style={{ color: '#15803d', fontWeight: 700 }}>Vào: {decisionModalReq.actualTimeIn} </span>}
                  {decisionModalReq.actualTimeOut && <span style={{ color: '#b45309', fontWeight: 700 }}>Ra: {decisionModalReq.actualTimeOut}</span>}
                </div>
                <div><strong>Lý do:</strong> {decisionModalReq.reason}</div>
              </div>

              {decisionAction === 'APPROVE' ? (
                <div style={{ fontSize: '13px', color: '#15803d', backgroundColor: '#f0fdf4', padding: '10px 12px', borderRadius: '6px' }}>
                  💡 Khi duyệt, hệ thống sẽ tự động cập nhật giờ vào/ra được đề xuất vào bảng tổng hợp công của nhân sự cho ngày {decisionModalReq.fromDate}.
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: '#b91c1c', backgroundColor: '#fef2f2', padding: '10px 12px', borderRadius: '6px' }}>
                  ⚠️ Vui lòng ghi rõ lý do từ chối để nhân sự nắm được thông tin qua thông báo.
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Ghi chú phản hồi của HCNS {decisionAction === 'REJECT' && <span style={{ color: 'var(--danger)' }}>*</span>}:
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder={decisionAction === 'APPROVE' ? 'Ghi chú phê duyệt...' : 'Nhập lý do từ chối giải trình...'}
                  autoFocus
                />
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--neutral-200)', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDecisionModalReq(null)}
                disabled={decisionSubmitting}
              >
                Hủy
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{
                  backgroundColor: decisionAction === 'APPROVE' ? '#10b981' : '#ef4444',
                  borderColor: decisionAction === 'APPROVE' ? '#10b981' : '#ef4444'
                }}
                onClick={handleConfirmDecision}
                disabled={decisionSubmitting}
              >
                {decisionSubmitting ? 'Đang xử lý...' : decisionAction === 'APPROVE' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL XEM CHI TIẾT ĐƠN & MINH CHỨNG */}
      {viewDetailReq && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
                <FileText size={18} color="var(--primary)" />
                <span>Chi Tiết Đơn Giải Trình #{viewDetailReq.requestId}</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setViewDetailReq(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                <div>
                  <span style={{ color: 'var(--neutral-500)' }}>Nhân viên:</span>
                  <div style={{ fontWeight: 700, marginTop: '2px' }}>{viewDetailReq.fullName} ({viewDetailReq.employeeCode})</div>
                </div>
                <div>
                  <span style={{ color: 'var(--neutral-500)' }}>Phòng ban:</span>
                  <div style={{ fontWeight: 700, marginTop: '2px' }}>{viewDetailReq.departmentName || '—'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--neutral-500)' }}>Ngày công:</span>
                  <div style={{ fontWeight: 700, marginTop: '2px' }}>{viewDetailReq.fromDate}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--neutral-500)' }}>Thời gian gửi:</span>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{new Date(viewDetailReq.createdAt).toLocaleString('vi-VN')}</div>
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--neutral-50)', padding: '12px 14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--neutral-500)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Giờ đề xuất điều chỉnh:
                </div>
                <div style={{ display: 'flex', gap: '20px', marginTop: '6px', fontSize: '14px' }}>
                  <div>
                    Giờ vào:{' '}
                    <strong style={{ color: '#15803d' }}>
                      {viewDetailReq.actualTimeIn || 'Không yêu cầu'}
                    </strong>
                  </div>
                  <div>
                    Giờ ra:{' '}
                    <strong style={{ color: '#b45309' }}>
                      {viewDetailReq.actualTimeOut || 'Không yêu cầu'}
                    </strong>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', color: 'var(--neutral-500)', fontWeight: 600 }}>LÝ DO CHI TIẾT:</div>
                <div style={{ fontSize: '14px', lineHeight: 1.5, marginTop: '4px', padding: '10px', backgroundColor: 'var(--neutral-50)', borderRadius: '6px' }}>
                  {viewDetailReq.reason || '—'}
                </div>
              </div>

              {/* TỆP MINH CHỨNG */}
              <div>
                <div style={{ fontSize: '12px', color: 'var(--neutral-500)', fontWeight: 600, marginBottom: '8px' }}>
                  TỆP MINH CHỨNG ({viewDetailReq.attachments?.length || viewDetailReq.attachmentCount || 0}):
                </div>
                {viewDetailReq.attachments && viewDetailReq.attachments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {viewDetailReq.attachments.map((att) => {
                      const downloadUrl = requestsApi.getAttachmentUrl(att.attachmentId, true);
                      const isImage = att.mimeType.startsWith('image/');
                      const isWebp = att.mimeType === 'image/webp' || att.originalFileName.toLowerCase().endsWith('.webp');

                      return (
                        <div
                          key={att.attachmentId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            border: '1px solid var(--neutral-200)',
                            borderRadius: '8px',
                            fontSize: '13px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                            <Paperclip size={15} color="var(--primary)" />
                            <span style={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '320px' }}>
                              {att.originalFileName}
                            </span>
                            {isWebp && (
                              <span style={{
                                backgroundColor: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #a7f3d0',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700
                              }}>
                                WebP
                              </span>
                            )}
                            <span style={{ fontSize: '11px', color: 'var(--neutral-400)' }}>
                              ({Math.round(att.fileSizeBytes / 1024)} KB)
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isImage && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setPreviewAttachmentId(att.attachmentId)}
                                title="Xem ảnh trực tiếp"
                              >
                                <Eye size={13} />
                                <span>Xem</span>
                              </button>
                            )}

                            <a
                              href={downloadUrl}
                              download={att.originalFileName}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary btn-sm"
                              title="Tải về máy"
                            >
                              <Download size={13} />
                              <span>Tải về</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--neutral-400)', fontStyle: 'italic' }}>
                    Không có tệp minh chứng đính kèm.
                  </div>
                )}
              </div>

              {/* GHI CHÚ PHẢN HỒI HCNS (NẾU ĐÃ DUYỆT HOẶC TỪ CHỐI) */}
              {viewDetailReq.hrNote && (
                <div style={{ backgroundColor: '#fefce8', border: '1px solid #fef08a', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>
                  <div style={{ fontWeight: 700, color: '#854d0e', marginBottom: '2px' }}>Phản hồi từ HCNS:</div>
                  <div style={{ color: '#713f12' }}>{viewDetailReq.hrNote}</div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--neutral-200)', justifyContent: 'space-between' }}>
              <div>
                {viewDetailReq.status === 'PENDING_HR' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                      onClick={() => {
                        const target = viewDetailReq;
                        setViewDetailReq(null);
                        handleOpenDecision(target, 'APPROVE');
                      }}
                    >
                      <Check size={14} />
                      <span>Duyệt đơn này</span>
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        const target = viewDetailReq;
                        setViewDetailReq(null);
                        handleOpenDecision(target, 'REJECT');
                      }}
                    >
                      <X size={14} />
                      <span>Từ chối đơn này</span>
                    </button>
                  </div>
                )}
              </div>

              <button className="btn btn-secondary" onClick={() => setViewDetailReq(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL PREVIEW ẢNH PHÓNG TO */}
      {previewAttachmentId && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setPreviewAttachmentId(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: '85vw', maxHeight: '90vh', padding: '10px', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ alignSelf: 'flex-end', marginBottom: '8px' }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ backgroundColor: '#ffffff', color: '#000000' }}
                onClick={() => setPreviewAttachmentId(null)}
              >
                ✕ Đóng
              </button>
            </div>
            <img
              src={requestsApi.getAttachmentUrl(previewAttachmentId)}
              alt="Ảnh minh chứng"
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '8px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
