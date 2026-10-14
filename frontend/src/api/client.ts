import axios from 'axios';
import type {
  PunchState,
  PunchItem,
  UserRequestItem,
  LeaveBalanceSummary,
  PublishedTimesheetData,
  BranchLocationItem,
  BranchNetworkItem,
  HrDashboardSummary,
  AppNotification,
  EmployeeDevice
} from '../types';

const envApiUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
export const API_BASE = `${envApiUrl}/api`;

export const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Inject Device Secret từ kho lưu trữ thiết bị
    const deviceSecret = localStorage.getItem('device_secret');
    if (deviceSecret && config.headers) {
      config.headers['X-Device-Secret'] = deviceSecret;
    }

    // Inject Device MAC từ kho lưu trữ thiết bị
    const deviceMac = localStorage.getItem('device_mac_address');
    if (deviceMac && config.headers) {
      config.headers['X-Device-Mac'] = deviceMac;
    }

    // Sinh X-Request-Id (GUID) cho các lệnh ghi để chống bấm trùng
    const method = config.method?.toUpperCase();
    if ((method === 'POST' || method === 'PUT' || method === 'DELETE') && config.headers && !config.headers['X-Request-Id']) {
      try {
        config.headers['X-Request-Id'] = crypto.randomUUID();
      } catch {
        // Fallback cho trình duyệt cũ
        config.headers['X-Request-Id'] = 'req-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      }
    }

    if (config.data instanceof FormData) {
      if (config.headers) {
        delete config.headers['Content-Type'];
      }
    } else {
      if (config.headers && !config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const errorData = error.response?.data;
    console.warn(`[API Response] ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url} (${error.response?.status})`, errorData);

    const isAuthEndpoint = originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return api(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
          const newAccessToken = res.data.accessToken || res.data.token;
          const newRefreshToken = res.data.refreshToken;

          localStorage.setItem('token', newAccessToken);
          if (newRefreshToken) {
            localStorage.setItem('refreshToken', newRefreshToken);
          }

          api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }

          processQueue(null, newAccessToken);
          return api(originalRequest);
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.reload();
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.reload();
      }
    }

    return Promise.reject(error);
  }
);

// --- 1. CHẤM CÔNG DI ĐỘNG (ATTENDANCE API) ---
export const attendanceApi = {
  getState: async (): Promise<PunchState> => {
    const res = await api.get('/v1/attendance/state');
    return res.data;
  },

  punch: async (payload: {
    clientRequestId?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    gpsError?: string;
    channel: 'MOBILE_PWA' | 'PC_WEB';
    macAddress?: string;
  }) => {
    const res = await api.post('/v1/attendance/punch', payload);
    return res.data;
  },

  getHistory: async (from?: string, to?: string) => {
    const res = await api.get('/v1/attendance/history', { params: { from, to } });
    return res.data;
  },

  getIssues: async (periodId?: number) => {
    const res = await api.get('/v1/attendance/issues', { params: { periodId } });
    return res.data;
  },

  // Dành cho HCNS
  getHrPunches: async (params?: {
    date?: string;
    fromDate?: string;
    toDate?: string;
    branch?: string;
    status?: string;
    reviewState?: string;
    employeeCode?: string;
    onlyValid?: boolean;
    limit?: number;
  }) => {
    const res = await api.get('/v1/hr/punches', { params });
    return res.data;
  },

  reviewPunches: async (ids: number[], action: 'ACCEPT' | 'REJECT', note?: string) => {
    const res = await api.post('/v1/hr/punches/review', { ids, action, note });
    return res.data;
  },

  deletePunches: async (ids: number[]) => {
    const res = await api.delete('/v1/hr/punches', { data: { ids } });
    return res.data;
  },

  deletePunch: async (id: number) => {
    const res = await api.delete(`/v1/hr/punches/${id}`);
    return res.data;
  }
};

// --- 2. QUẢN LÝ THIẾT BỊ (DEVICES API) ---
export const devicesApi = {
  register: async (payload: {
    deviceType: 'MOBILE' | 'PC';
    deviceName?: string;
    operatingSystem?: string;
    browserInfo?: string;
    fingerprintHash?: string;
  }) => {
    const res = await api.post('/v1/devices/register', payload);
    return res.data;
  },

  getMyDevices: async (): Promise<{ mobile: EmployeeDevice | null; pc: EmployeeDevice | null }> => {
    const res = await api.get('/v1/devices/mine');
    return res.data;
  },

  registerMacAddress: async (payload: { macAddress: string; deviceName?: string }) => {
    const res = await api.post('/v1/devices/register-mac', payload);
    return res.data;
  },

  // Dành cho HCNS
  getHrDevices: async (status?: string, branch?: string): Promise<EmployeeDevice[]> => {
    const res = await api.get('/v1/hr/devices', { params: { status, branch } });
    return res.data;
  },

  decideDevice: async (id: number, action: 'APPROVE' | 'REJECT', note?: string) => {
    const res = await api.post(`/v1/hr/devices/${id}/decision`, { action, note });
    return res.data;
  },

  revokeDevice: async (id: number, note?: string) => {
    const res = await api.post(`/v1/hr/devices/${id}/revoke`, { note });
    return res.data;
  },

  updateDeviceMac: async (id: number, macAddress: string) => {
    const res = await api.put(`/v1/hr/devices/${id}/mac`, { macAddress });
    return res.data;
  }
};

// --- 3. ĐƠN TỪ & NGHỈ PHÉP (REQUESTS API) ---
export const requestsApi = {
  submit: async (formData: FormData) => {
    const res = await api.post('/v1/requests', formData);
    return res.data;
  },

  getMyRequests: async (status?: string): Promise<UserRequestItem[]> => {
    const res = await api.get('/v1/requests/mine', { params: { status } });
    return res.data;
  },

  getById: async (id: number) => {
    const res = await api.get(`/v1/requests/${id}`);
    return res.data;
  },

  cancel: async (id: number) => {
    const res = await api.post(`/v1/requests/${id}/cancel`);
    return res.data;
  },

  // Dành cho HCNS
  getHrRequests: async (status?: string, branch?: string): Promise<UserRequestItem[]> => {
    const res = await api.get('/v1/hr/requests', { params: { status, branch } });
    return res.data;
  },

  decideRequest: async (id: number, action: 'APPROVE' | 'REJECT', note?: string) => {
    const res = await api.post(`/v1/hr/requests/${id}/decision`, { action, note });
    return res.data;
  },

  getAttachmentUrl: (id: number) => `${API_BASE}/v1/attachments/${id}`
};

// --- 4. HỒ SƠ & QUỸ PHÉP (PROFILE API) ---
export const profileApi = {
  getMe: async () => {
    const res = await api.get('/v1/profile/me');
    return res.data;
  },

  getLeaveBalance: async (): Promise<LeaveBalanceSummary> => {
    const res = await api.get('/v1/profile/leave/balance');
    return res.data;
  }
};

// --- 5. BẢNG CÔNG & KHIẾU NẠI (TIMESHEET API) ---
export const timesheetApi = {
  getMyTimesheet: async (periodId: number): Promise<PublishedTimesheetData> => {
    const res = await api.get('/v1/timesheet/mine', { params: { periodId } });
    return res.data;
  },

  submitDispute: async (publicationId: number, content: string, workDate?: string) => {
    const res = await api.post('/v1/timesheet/disputes', { publicationId, content, workDate });
    return res.data;
  },

  // Dành cho HCNS
  publish: async (periodId: number, branchCode: string, note?: string) => {
    const res = await api.post('/v1/hr/timesheet/publish', { periodId, branchCode, note });
    return res.data;
  },

  retract: async (publicationId: number, note?: string) => {
    const res = await api.post('/v1/hr/timesheet/retract', { publicationId, note });
    return res.data;
  },

  getDisputes: async (publicationId?: number, status?: string) => {
    const res = await api.get('/v1/hr/timesheet/disputes', { params: { publicationId, status } });
    return res.data;
  },

  resolveDispute: async (id: number, action: 'ACCEPT' | 'REJECT', response: string) => {
    const res = await api.post(`/v1/hr/timesheet/disputes/${id}/resolve`, { action, response });
    return res.data;
  }
};

// --- 6. CẤU HÌNH VỊ TRÍ & MẠNG HỘI SỞ (BRANCH SETTINGS API) ---
export const branchSettingsApi = {
  getLocations: async (branchCode: string): Promise<BranchLocationItem[]> => {
    const res = await api.get(`/v1/hr/branches/${branchCode}/locations`);
    return res.data;
  },

  addLocation: async (branchCode: string, payload: { locationName: string; latitude: number; longitude: number; radiusMeters?: number }) => {
    const res = await api.post(`/v1/hr/branches/${branchCode}/locations`, payload);
    return res.data;
  },

  deleteLocation: async (branchCode: string, id: number) => {
    const res = await api.delete(`/v1/hr/branches/${branchCode}/locations/${id}`);
    return res.data;
  },

  getNetworks: async (branchCode: string): Promise<BranchNetworkItem[]> => {
    const res = await api.get(`/v1/hr/branches/${branchCode}/networks`);
    return res.data;
  },

  addNetwork: async (branchCode: string, payload: { cidr: string; description?: string; validFrom?: string; validTo?: string }) => {
    const res = await api.post(`/v1/hr/branches/${branchCode}/networks`, payload);
    return res.data;
  },

  useMyIp: async (branchCode: string, clientPublicIp?: string) => {
    const res = await api.post(`/v1/hr/branches/${branchCode}/networks/use-my-ip`, { clientPublicIp });
    return res.data;
  },

  deleteNetwork: async (branchCode: string, id: number) => {
    const res = await api.delete(`/v1/hr/branches/${branchCode}/networks/${id}`);
    return res.data;
  }
};

// --- 7. HCNS DASHBOARD & CẢNH BÁO ---
export const hrDashboardApi = {
  getSummary: async (branch?: string): Promise<HrDashboardSummary> => {
    const res = await api.get('/v1/hr/dashboard/summary', { params: { branch } });
    return res.data;
  },

  getAlerts: async () => {
    const res = await api.get('/v1/hr/dashboard/alerts');
    return res.data;
  },

  ackAlert: async (id: number) => {
    const res = await api.post(`/v1/hr/dashboard/alerts/${id}/ack`);
    return res.data;
  }
};

// --- 8. THÔNG BÁO (NOTIFICATIONS API) ---
export const notificationsApi = {
  getMyNotifications: async (): Promise<{ unreadCount: number; notifications: AppNotification[] }> => {
    const res = await api.get('/v1/notifications');
    return res.data;
  },

  markAsRead: async (id: number) => {
    const res = await api.post(`/v1/notifications/${id}/read`);
    return res.data;
  },

  markAllAsRead: async () => {
    const res = await api.post('/v1/notifications/read-all');
    return res.data;
  }
};

// --- 9. CẤU HÌNH NỀN TẢNG (PLATFORM SETTINGS API) ---
export interface PlatformSettings {
  siteTitle: string;
  siteSubtitle: string;
  logoUrl: string;
  faviconUrl: string;
  copyrightText: string;
  brandColor: string;
}

export const platformApi = {
  getSettings: async (): Promise<PlatformSettings> => {
    const res = await api.get('/platform/settings');
    return res.data;
  },

  updateSettings: async (payload: PlatformSettings): Promise<PlatformSettings> => {
    const res = await api.put('/platform/settings', payload);
    return res.data;
  },

  uploadLogo: async (file: File): Promise<{ logoUrl: string; message: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/platform/logo', formData);
    return res.data;
  },

  uploadFavicon: async (file: File): Promise<{ faviconUrl: string; message: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/platform/favicon', formData);
    return res.data;
  }
};
