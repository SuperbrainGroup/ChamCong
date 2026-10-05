import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AuditLogItem, AuditLogPaged } from '../../types';
import { api } from '../../api/client';
import {
  ShieldAlert,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  User,
  X
} from 'lucide-react';

interface AuditLogsViewerProps {
  onBack?: () => void;
}

export const AuditLogsViewer: React.FC<AuditLogsViewerProps> = () => {
  const { selectedCompany, companies } = useAuth();
  const [filterCompanyId, setFilterCompanyId] = useState<number | ''>(selectedCompany?.id || '');
  const [keyword, setKeyword] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [data, setData] = useState<AuditLogPaged | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<AuditLogItem | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let url = `/audit-logs?pageIndex=${pageIndex}&pageSize=${pageSize}`;
      if (filterCompanyId !== '') {
        url += `&companyId=${filterCompanyId}`;
      }
      if (searchDebounce.trim()) {
        url += `&keyword=${encodeURIComponent(searchDebounce.trim())}`;
      }

      const res = await api.get<AuditLogPaged>(url);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchDebounce(keyword);
      setPageIndex(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [keyword]);

  useEffect(() => {
    fetchLogs();
  }, [filterCompanyId, searchDebounce, pageIndex, pageSize]);

  const totalPages = data ? Math.ceil(data.totalCount / data.pageSize) : 1;

  const formatDetail = (detail?: string) => {
    if (!detail) return '-';
    try {
      const parsed = JSON.parse(detail);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return detail;
    }
  };

  const getActionBadgeClass = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('DELETE') || act.includes('REMOVE')) return 'badge-danger';
    if (act.includes('CLOSE') || act.includes('LOCK')) return 'badge-neutral';
    if (act.includes('REOPEN') || act.includes('EDIT') || act.includes('UPDATE')) return 'badge-warning';
    if (act.includes('CALCULATE') || act.includes('SYNC')) return 'badge-primary';
    if (act.includes('IMPORT') || act.includes('CREATE') || act.includes('SAVE')) return 'badge-success';
    return 'badge-neutral';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header Card */}
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
              <ShieldAlert size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Nhật Ký Thao Tác (Audit Logs)
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                Lưu vết tự động các thao tác quản trị: tính công, chốt kỳ, chỉnh sửa dữ liệu, phân quyền
              </p>
            </div>
          </div>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            title="Làm mới"
            style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
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
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Chi nhánh:</span>
              <select
                value={filterCompanyId}
                onChange={e => {
                  setFilterCompanyId(e.target.value === '' ? '' : Number(e.target.value));
                  setPageIndex(1);
                }}
                className="form-control"
                style={{ width: '220px', padding: '6px 10px', fontSize: '13px' }}
              >
                <option value="">-- Tất cả chi nhánh --</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ position: 'relative', minWidth: '280px' }}>
              <Search
                size={16}
                color="#94a3b8"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="Tìm thao tác, đối tượng, người thực hiện..."
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                className="form-control"
                style={{ paddingLeft: '34px', paddingRight: '12px', height: '34px', fontSize: '13px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Hiển thị:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPageIndex(1);
              }}
              className="form-control"
              style={{ width: '110px', padding: '6px 10px', fontSize: '13px' }}
            >
              <option value={20}>20 dòng</option>
              <option value={50}>50 dòng</option>
              <option value={100}>100 dòng</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '160px' }}>Thời gian</th>
              <th style={{ width: '140px' }}>Tài khoản</th>
              <th style={{ width: '140px' }}>Thực thể</th>
              <th style={{ width: '110px' }}>Khóa đối tượng</th>
              <th style={{ width: '140px' }}>Hành động</th>
              <th>Nội dung thay đổi</th>
              <th style={{ width: '70px', textAlign: 'right' }}>Xem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#2563eb' }} />
                  Đang tải nhật ký kiểm toán...
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                  Không tìm thấy bản ghi kiểm toán nào phù hợp.
                </td>
              </tr>
            ) : (
              data.items.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: '12px', fontFamily: 'monospace', color: '#475569', whiteSpace: 'nowrap' }}>
                    {new Date(log.at).toLocaleString('vi-VN')}
                  </td>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <User size={13} color="#94a3b8" />
                      <span>{log.username}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: '#334155' }}>{log.entity}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#64748b' }}>
                    {log.entityId || '-'}
                  </td>
                  <td>
                    <span className={`badge ${getActionBadgeClass(log.action)}`} style={{ fontWeight: 700 }}>
                      {log.action}
                    </span>
                  </td>
                  <td
                    style={{
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      color: '#475569',
                      maxWidth: '380px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                    title={log.detail || ''}
                  >
                    {log.detail || '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {log.detail && (
                      <button
                        onClick={() => setSelectedDetail(log)}
                        className="btn btn-sm btn-secondary"
                        style={{ padding: '4px 6px', color: '#2563eb' }}
                        title="Xem chi tiết đầy đủ"
                      >
                        <Eye size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {data && data.totalCount > 0 && (
        <div
          className="card"
          style={{
            padding: '10px 16px',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            Hiển thị {(pageIndex - 1) * pageSize + 1} -{' '}
            {Math.min(pageIndex * pageSize, data.totalCount)} trong tổng số{' '}
            <strong style={{ color: '#0f172a' }}>{data.totalCount}</strong> sự kiện
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              disabled={pageIndex <= 1}
              onClick={() => setPageIndex(p => Math.max(1, p - 1))}
              className="btn btn-sm btn-secondary"
              style={{ padding: '5px 8px' }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', padding: '0 4px' }}>
              Trang {pageIndex} / {totalPages}
            </span>
            <button
              disabled={pageIndex >= totalPages}
              onClick={() => setPageIndex(p => Math.min(totalPages, p + 1))}
              className="btn btn-sm btn-secondary"
              style={{ padding: '5px 8px' }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Detail Viewer Modal */}
      {selectedDetail && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px', maxHeight: '80vh' }}>
            <div className="modal-header">
              <div>
                <h2 className="card-title" style={{ margin: 0, fontSize: '15px' }}>
                  Chi Tiết Sự Kiện #{selectedDetail.id}
                </h2>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  {new Date(selectedDetail.at).toLocaleString('vi-VN')} • {selectedDetail.username} • {selectedDetail.action}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="btn btn-sm btn-secondary"
                style={{ padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              className="modal-body"
              style={{
                backgroundColor: '#090d16',
                color: '#38bdf8',
                padding: '16px',
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: '1.5'
              }}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {formatDetail(selectedDetail.detail)}
              </pre>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
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
