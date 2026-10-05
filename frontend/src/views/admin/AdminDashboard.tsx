import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Building2, Users, UserCheck, Calendar, Sliders, FileText, History, Shield, ArrowRight } from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState({
    companiesCount: 0,
    usersCount: 0,
    employeesCount: 0,
    periodsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [compRes, userRes] = await Promise.all([
          api.get('/companies'),
          api.get('/users'),
        ]);
        setStats({
          companiesCount: compRes.data.length,
          usersCount: userRes.data.length,
          employeesCount: 0,
          periodsCount: 0,
        });
      } catch (err) {
        console.error('Lỗi khi tải thống kê:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const adminModules = [
    { id: 'admin-companies', title: 'Hội sở / Công ty', desc: 'Quản lý danh sách các hội sở đa đơn vị, tải logo thương hiệu riêng.', icon: Building2, color: '#2563eb' },
    { id: 'admin-users', title: 'Tài khoản & Phân quyền', desc: 'Quản lý tài khoản đăng nhập, gán vai trò Admin / Nhân viên chấm công và hội sở phụ trách.', icon: Users, color: '#0f766e' },
    { id: 'admin-employees', title: 'Danh mục Nhân sự', desc: 'Bộ phận, Khối nhân viên (Chuẩn, Part-time, Remote), hồ sơ nhân sự, mã máy chấm công.', icon: UserCheck, color: '#16a34a' },
    { id: 'admin-codes', title: 'Bảng mã ký hiệu chấm công', desc: '14 mã quy chuẩn (1, 0.5, L, P, P/2, BL...), giá trị quy đổi công và màu hiển thị.', icon: FileText, color: '#d97706' },
    { id: 'admin-parameters', title: 'Bảng cấu hình tham số', desc: '11 tham số quản trị: Ca chuẩn, Nghỉ trưa, Flexitime bù giờ đối xứng, Ân hạn, Ngưỡng công.', icon: Sliders, color: '#7c3aed' },
    { id: 'admin-calendar', title: 'Lịch làm việc & Ngày lễ', desc: 'Lịch làm việc từng ngày, tạo nhanh lịch năm với ngày Lễ quốc gia và chế độ Thứ 7.', icon: Calendar, color: '#ea580c' },
    { id: 'admin-leave', title: 'Quỹ phép & Ngoại lệ nghỉ', desc: 'Đơn nghỉ phép năm/bù đã duyệt, khởi tạo số dư đầu kỳ quỹ phép năm và phép tồn.', icon: History, color: '#0284c7' },
    { id: 'admin-audit', title: 'Nhật ký thao tác hệ thống', desc: 'Kiểm toán toàn bộ hoạt động nạp file, tính công, sửa tay, đổi tham số (chỉ ghi thêm).', icon: Shield, color: '#475569' },
  ];

  return (
    <div style={{ padding: '28px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Welcome Banner */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid var(--neutral-200)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 28px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--neutral-900)', marginBottom: '6px' }}>
            BẢNG ĐIỀU KHIỂN QUẢN TRỊ HỆ THỐNG
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--neutral-600)' }}>
            Hệ thống quản lý dữ liệu nhân sự, lịch làm việc, quỹ phép và tính công nội bộ Superbrain.
          </p>
        </div>
      </div>

      {/* Grid of Admin Modules */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '20px'
      }}>
        {adminModules.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.id}
              className="card"
              style={{
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
              onClick={() => onNavigate(m.id)}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-sm)')}
            >
              <div className="card-body">
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  backgroundColor: `${m.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <Icon size={24} color={m.color} />
                </div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--neutral-900)', marginBottom: '6px' }}>
                  {m.title}
                </div>
                <p style={{ fontSize: '13px', color: 'var(--neutral-600)', lineHeight: 1.5 }}>
                  {m.desc}
                </p>
              </div>

              <div style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--neutral-100)',
                backgroundColor: 'var(--neutral-50)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px',
                fontWeight: 600,
                color: m.color
              }}>
                <span>Truy cập quản lý</span>
                <ArrowRight size={14} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
