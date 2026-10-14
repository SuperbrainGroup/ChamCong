import React, { createContext, useContext, useState, useEffect } from 'react';
import { platformApi, PlatformSettings } from '../api/client';

interface PlatformContextType {
  settings: PlatformSettings;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  updateSettings: (newSettings: PlatformSettings) => Promise<void>;
}

const defaultSettings: PlatformSettings = {
  siteTitle: 'Hệ Thống Chấm Công Thông Minh',
  siteSubtitle: 'Nền tảng Quản trị Chấm công & Nhân sự Doanh nghiệp',
  logoUrl: '',
  faviconUrl: '',
  copyrightText: '© 2026 Bản quyền thuộc về Nền tảng Chấm công Doanh nghiệp.',
  brandColor: '#3B82F6'
};

const PlatformContext = createContext<PlatformContextType>({
  settings: defaultSettings,
  loading: true,
  refreshSettings: async () => {},
  updateSettings: async () => {}
});

export const PlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PlatformSettings>(() => {
    try {
      const cached = localStorage.getItem('platform_settings');
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return defaultSettings;
  });
  const [loading, setLoading] = useState<boolean>(true);

  const applyPlatformMeta = (data: PlatformSettings) => {
    if (data.siteTitle) {
      document.title = data.siteTitle;
    }
    if (data.faviconUrl) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = data.faviconUrl;
    }
    if (data.brandColor) {
      document.documentElement.style.setProperty('--primary-brand', data.brandColor);
    }
  };

  const refreshSettings = async () => {
    try {
      const data = await platformApi.getSettings();
      setSettings(data);
      localStorage.setItem('platform_settings', JSON.stringify(data));
      applyPlatformMeta(data);
    } catch (err) {
      console.warn('Không thể tải platform settings từ server, dùng cache hoặc mặc định:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings: PlatformSettings) => {
    const updated = await platformApi.updateSettings(newSettings);
    setSettings(updated);
    localStorage.setItem('platform_settings', JSON.stringify(updated));
    applyPlatformMeta(updated);
  };

  useEffect(() => {
    applyPlatformMeta(settings);
    refreshSettings();
  }, []);

  return (
    <PlatformContext.Provider value={{ settings, loading, refreshSettings, updateSettings }}>
      {children}
    </PlatformContext.Provider>
  );
};

export const usePlatform = () => useContext(PlatformContext);
