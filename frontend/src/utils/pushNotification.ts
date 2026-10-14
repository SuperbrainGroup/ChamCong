/**
 * Quản lý Web Push Notification & Mobile Vibration cho Superbrain ESS PWA
 */

export const isPushSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
};

export const getNotificationPermission = (): NotificationPermission => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!isPushSupported()) return false;

  try {
    const perm = await Notification.requestPermission();
    localStorage.setItem('sb_push_enabled', perm === 'granted' ? 'true' : 'false');
    return perm === 'granted';
  } catch (err) {
    console.error('Lỗi khi xin quyền Push Notification:', err);
    return false;
  }
};

export interface AlertNotificationOptions {
  title: string;
  body: string;
  type?: 'success' | 'warning' | 'error' | 'info';
  tag?: string;
  data?: any;
}

export const triggerMobilePushNotification = async (options: AlertNotificationOptions): Promise<void> => {
  // 1. Rung điện thoại (Mobile Vibrate API)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    if (options.type === 'error' || options.type === 'warning') {
      navigator.vibrate([150, 80, 150, 80, 300]);
    } else {
      navigator.vibrate([100, 50, 100]);
    }
  }

  // 2. Nếu đã cấp quyền Notification
  if (getNotificationPermission() === 'granted') {
    try {
      // Ưu tiên hiển thị qua Service Worker registration (Hỗ trợ tốt nhất trên Android / iOS PWA)
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(options.title, {
            body: options.body,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            tag: options.tag || 'platform-alert',
            vibrate: options.type === 'warning' || options.type === 'error' ? [200, 100, 200] : [100],
            data: options.data || '/'
          } as any);
          return;
        }
      }

      // Fallback Standard Notification
      new Notification(options.title, {
        body: options.body,
        icon: '/favicon.svg',
        tag: options.tag || 'platform-alert'
      });
    } catch (e) {
      console.warn('Không thể hiển thị thông báo native:', e);
    }
  }
};
