import React, { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { platformApi } from '../../api/client';
import { 
  Building2, 
  Upload, 
  Image as ImageIcon, 
  CheckCircle, 
  AlertCircle, 
  Save, 
  RotateCcw,
  Palette,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

export const PlatformSettingsManager: React.FC = () => {
  const { settings, updateSettings, refreshSettings } = usePlatform();

  const [siteTitle, setSiteTitle] = useState(settings.siteTitle);
  const [siteSubtitle, setSiteSubtitle] = useState(settings.siteSubtitle);
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState(settings.faviconUrl);
  const [copyrightText, setCopyrightText] = useState(settings.copyrightText);
  const [brandColor, setBrandColor] = useState(settings.brandColor || '#3B82F6');

  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setSiteTitle(settings.siteTitle);
    setSiteSubtitle(settings.siteSubtitle);
    setLogoUrl(settings.logoUrl);
    setFaviconUrl(settings.faviconUrl);
    setCopyrightText(settings.copyrightText);
    setBrandColor(settings.brandColor || '#3B82F6');
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await updateSettings({
        siteTitle: siteTitle.trim() || 'Hệ Thống Chấm Công Thông Minh',
        siteSubtitle: siteSubtitle.trim(),
        logoUrl: logoUrl.trim(),
        faviconUrl: faviconUrl.trim(),
        copyrightText: copyrightText.trim() || '© 2026 Bản quyền thuộc về Nền tảng Chấm công.',
        brandColor: brandColor.trim() || '#3B82F6'
      });
      setMessage({ type: 'success', text: 'Đã lưu cấu hình nhận diện nền tảng thành công!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Không thể lưu cài đặt. Vui lòng thử lại.' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setMessage(null);
    try {
      const res = await platformApi.uploadLogo(file);
      setLogoUrl(res.logoUrl);
      setMessage({ type: 'success', text: 'Tải lên logo thành công! Nhấn "Lưu cấu hình" để áp dụng toàn hệ thống.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Lỗi khi tải logo.' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFavicon(true);
    setMessage(null);
    try {
      const res = await platformApi.uploadFavicon(file);
      setFaviconUrl(res.faviconUrl);
      setMessage({ type: 'success', text: 'Tải lên favicon thành công! Nhấn "Lưu cấu hình" để áp dụng toàn hệ thống.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Lỗi khi tải favicon.' });
    } finally {
      setUploadingFavicon(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Bạn có chắc muốn đặt lại thông tin nhận diện mặc định không?')) {
      setSiteTitle('Hệ Thống Chấm Công Thông Minh');
      setSiteSubtitle('Nền tảng Quản trị Chấm công & Nhân sự Doanh nghiệp');
      setLogoUrl('');
      setFaviconUrl('');
      setCopyrightText('© 2026 Bản quyền thuộc về Nền tảng Chấm công Doanh nghiệp.');
      setBrandColor('#3B82F6');
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={28} color="#0056B3" />
            Cấu hình Nền tảng (Platform Identity)
          </h1>
          <p style={{ fontSize: 14, color: '#64748B', marginTop: 4 }}>
            Tùy biến thương hiệu White-label: Tiêu đề hệ thống, Logo, Favicon, Bản quyền chân trang
          </p>
        </div>

        <button
          type="button"
          onClick={handleResetDefaults}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            backgroundColor: '#F1F5F9',
            color: '#475569',
            border: '1px solid #CBD5E1',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <RotateCcw size={15} />
          Mặc định
        </button>
      </div>

      {message && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 20,
          backgroundColor: message.type === 'success' ? '#DCFCE7' : '#FEE2E2',
          color: message.type === 'success' ? '#166534' : '#991B1B',
          border: `1px solid ${message.type === 'success' ? '#BBF7D0' : '#FECACA'}`
        }}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontSize: 14, fontWeight: 500 }}>{message.text}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 24 }}>
        {/* Form thiết lập */}
        <form onSubmit={handleSave} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={20} color="#0056B3" />
            Thông tin Nhận diện Hệ thống
          </h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Tên Nền tảng / Thương hiệu (Site Title) *
            </label>
            <input
              type="text"
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              placeholder="Ví dụ: Nền Tảng Chấm Công Thông Minh"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: 14,
                outline: 'none'
              }}
            />
            <span style={{ fontSize: 12, color: '#64748B', marginTop: 4, display: 'block' }}>
              Hiển thị trên thanh tiêu đề trình duyệt, thanh Menu điều hướng và màn hình đăng nhập.
            </span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Khẩu hiệu / Mô tả phụ (Site Subtitle)
            </label>
            <input
              type="text"
              value={siteSubtitle}
              onChange={(e) => setSiteSubtitle(e.target.value)}
              placeholder="Ví dụ: Nền tảng Quản trị Chấm công & Nhân sự Doanh nghiệp"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: 14,
                outline: 'none'
              }}
            />
          </div>

          {/* Logo Upload & URL */}
          <div style={{ marginBottom: 16, padding: 14, backgroundColor: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Logo Nền tảng (Brand Logo)
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="Đường dẫn ảnh hoặc tải lên file bên phải"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: 13
                }}
              />
              <label style={{
                padding: '8px 14px',
                borderRadius: 6,
                backgroundColor: '#0056B3',
                color: '#FFF',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <Upload size={14} />
                {uploadingLogo ? 'Đang tải...' : 'Tải file logo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingLogo}
                />
              </label>
            </div>
            <span style={{ fontSize: 11, color: '#64748B' }}>
              Hỗ trợ PNG, SVG, JPG, WEBP dung lượng tối đa 2MB. Khuyến nghị ảnh nền trong suốt (transparent).
            </span>
          </div>

          {/* Favicon Upload & URL */}
          <div style={{ marginBottom: 16, padding: 14, backgroundColor: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Biểu tượng trình duyệt (Favicon)
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <input
                type="text"
                value={faviconUrl}
                onChange={(e) => setFaviconUrl(e.target.value)}
                placeholder="Đường dẫn icon hoặc tải file bên phải"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: 13
                }}
              />
              <label style={{
                padding: '8px 14px',
                borderRadius: 6,
                backgroundColor: '#475569',
                color: '#FFF',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <Upload size={14} />
                {uploadingFavicon ? 'Đang tải...' : 'Tải icon'}
                <input
                  type="file"
                  accept="image/png,image/x-icon,image/svg+xml"
                  onChange={handleFaviconUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingFavicon}
                />
              </label>
            </div>
          </div>

          {/* Copyright & Brand Color */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Thông tin bản quyền chân trang (Copyright Text)
            </label>
            <input
              type="text"
              value={copyrightText}
              onChange={(e) => setCopyrightText(e.target.value)}
              placeholder="© 2026 Bản quyền thuộc về..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: 14,
                outline: 'none'
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Màu sắc chủ đạo thương hiệu (Brand Accent Color)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                style={{
                  width: 44,
                  height: 40,
                  border: '1px solid #CBD5E1',
                  borderRadius: 8,
                  cursor: 'pointer',
                  padding: 2
                }}
              />
              <input
                type="text"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                style={{
                  width: 120,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: 13,
                  fontFamily: 'monospace'
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                {['#0056B3', '#3B82F6', '#0284C7', '#0D9488', '#4F46E5', '#16A34A'].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setBrandColor(col)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      backgroundColor: col,
                      border: brandColor === col ? '2px solid #000' : '1px solid #CBD5E1',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%',
              padding: '12px 18px',
              borderRadius: 8,
              backgroundColor: '#0056B3',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 2px 6px rgba(0, 86, 179, 0.25)'
            }}
          >
            <Save size={18} />
            {saving ? 'Đang lưu cấu hình...' : 'Lưu Thay Đổi Nền Tảng'}
          </button>
        </form>

        {/* Live Preview Panel */}
        <div>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', position: 'sticky', top: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Palette size={20} color="#0056B3" />
              Xem trước Trực quan (Live Preview)
            </h2>

            {/* Preview Navbar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Xem trước Thanh Menu (Desktop Header):</div>
              <div style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" style={{ maxHeight: 32, maxWidth: 100, objectFit: 'contain' }} />
                ) : (
                  <div style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: brandColor, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                    {siteTitle ? siteTitle.charAt(0).toUpperCase() : 'P'}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#1E293B' }}>{siteTitle || 'Tên Nền Tảng'}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>{siteSubtitle || 'Mô tả phụ'}</div>
                </div>
              </div>
            </div>

            {/* Preview Mobile Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Xem trước Mobile Header:</div>
              <div style={{
                maxWidth: 320,
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" style={{ maxHeight: 28, maxWidth: 60, objectFit: 'contain' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: brandColor, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
                      {siteTitle ? siteTitle.charAt(0).toUpperCase() : 'P'}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>{siteTitle || 'Tên Ứng Dụng'}</div>
                    <div style={{ fontSize: 10, color: '#64748B' }}>Chấm công & Tự phục vụ</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Login Screen Box */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Xem trước Hộp Đăng Nhập:</div>
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                padding: 16,
                textAlign: 'center'
              }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" style={{ maxHeight: 44, maxWidth: 140, objectFit: 'contain', margin: '0 auto 8px auto' }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: brandColor, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, margin: '0 auto 8px auto' }}>
                    {siteTitle ? siteTitle.charAt(0).toUpperCase() : 'P'}
                  </div>
                )}
                <div style={{ fontWeight: 800, fontSize: 16, color: '#1E293B' }}>{siteTitle || 'Hệ Thống Chấm Công'}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{siteSubtitle || 'Đăng nhập vào tài khoản'}</div>
              </div>
            </div>

            {/* Preview Footer */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Xem trước Chân trang (Footer):</div>
              <div style={{
                backgroundColor: '#F1F5F9',
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 11,
                color: '#64748B',
                textAlign: 'center'
              }}>
                {copyrightText || '© 2026 Bản quyền thuộc về Nền tảng Chấm công.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
