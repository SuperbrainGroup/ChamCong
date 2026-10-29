import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePlatform } from '../../context/PlatformContext';
import { ChangePasswordModal } from '../ChangePasswordModal';
import {
  attendanceApi,
  devicesApi,
  requestsApi,
  profileApi,
  timesheetApi,
  notificationsApi,
  schedulesApi
} from '../../api/client';
import type {
  PunchState,
  UserRequestItem,
  LeaveBalanceSummary,
  PublishedTimesheetData,
  EmployeeDevice,
  AppNotification,
  WorkSchedule
} from '../../types';
import {
  triggerMobilePushNotification,
  requestNotificationPermission,
  getNotificationPermission,
  isPushSupported
} from '../../utils/pushNotification';
import { convertMultipleImagesToWebP } from '../../utils/imageToWebp';
import { DateInput } from '../../components/DateInput';
import { PersonalTimesheetView } from './PersonalTimesheetView';
import { EmployeeScheduleView } from './EmployeeScheduleView';
import {
  Clock,
  Lock,
  MapPin,
  Wifi,
  Calendar,
  FileText,
  User,
  ShieldCheck,
  Smartphone,
  Monitor,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  RefreshCw,
  Bell,
  Upload,
  X,
  Download,
  Share2,
  Sparkles,
  HelpCircle,
  KeyRound,
  RotateCcw,
  Paperclip,
  Eye,
  Trash2,
  Edit3
} from 'lucide-react';

interface EmployeePortalViewProps {
  onNavigate?: (view: string) => void;
}

export const EmployeePortalView: React.FC<EmployeePortalViewProps> = ({ onNavigate }) => {
  const { user, companies, selectedCompany, setSelectedCompany, logout } = useAuth();
  const { addToast } = useToast();
  const { settings } = usePlatform();

  const [activeTab, setActiveTab] = useState<'home' | 'attendance' | 'requests' | 'profile'>('home');
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  // Trạng thái Chấm công
  const [punchState, setPunchState] = useState<PunchState | null>(null);
  const [punching, setPunching] = useState(false);
  const [punchStatusMessage, setPunchStatusMessage] = useState<string>('');
  const [lastPunchResult, setLastPunchResult] = useState<any>(null);

  // Đồng hồ thời gian thực
  const [currentTime, setCurrentTime] = useState(new Date());

  // Thiết bị
  const [myDevices, setMyDevices] = useState<{ mobile: EmployeeDevice | null; pc: EmployeeDevice | null; mobileDevices?: EmployeeDevice[] }>({ mobile: null, pc: null, mobileDevices: [] });
  const [hasLocalSecret, setHasLocalSecret] = useState<boolean>(() => {
    return typeof window !== 'undefined' && !!localStorage.getItem('device_secret');
  });
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registeringDeviceType, setRegisteringDeviceType] = useState<'MOBILE' | 'PC'>('MOBILE');
  const [deviceNameInput, setDeviceNameInput] = useState('');

  // Đếm ngược giãn cách 60 giây giữa 2 lần bấm chấm công
  const [punchCooldownSeconds, setPunchCooldownSeconds] = useState<number>(0);

  // Đơn từ
  const [myRequests, setMyRequests] = useState<UserRequestItem[]>([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showRegulModal, setShowRegulModal] = useState(false);
  const [leaveCode, setLeaveCode] = useState('P');
  const [leaveFromDate, setLeaveFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveToDate, setLeaveToDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveDayPart, setLeaveDayPart] = useState<'FULL' | 'MORNING' | 'AFTERNOON'>('FULL');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveFiles, setLeaveFiles] = useState<File[]>([]);

  // Giải trình
  const [regulDate, setRegulDate] = useState(new Date().toISOString().split('T')[0]);
  const [regulInTime, setRegulInTime] = useState('08:00');
  const [regulOutTime, setRegulOutTime] = useState('17:00');
  const [regulReasonCode, setRegulReasonCode] = useState('Quên bấm');
  const [regulReason, setRegulReason] = useState('');
  const [regulFiles, setRegulFiles] = useState<File[]>([]);

  // Xem minh chứng và Sửa đơn
  const [viewingAttachmentReq, setViewingAttachmentReq] = useState<UserRequestItem | null>(null);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<number | null>(null);

  const handleOpenAttachments = async (req: UserRequestItem) => {
    setViewingAttachmentReq(req);
    try {
      const detail = await requestsApi.getById(req.requestId);
      if (detail) {
        setViewingAttachmentReq(detail);
      }
    } catch (err) {
      console.error('Lỗi khi nạp chi tiết đơn:', err);
    }
  };
  const [editingRequest, setEditingRequest] = useState<UserRequestItem | null>(null);
  const [editRequestType, setEditRequestType] = useState<'LEAVE' | 'REGULARIZATION'>('LEAVE');
  const [editLeaveCode, setEditLeaveCode] = useState('P');
  const [editFromDate, setEditFromDate] = useState('');
  const [editToDate, setEditToDate] = useState('');
  const [editDayPart, setEditDayPart] = useState<'FULL' | 'MORNING' | 'AFTERNOON'>('FULL');
  const [editInTime, setEditInTime] = useState('08:00');
  const [editOutTime, setEditOutTime] = useState('17:00');
  const [editReasonCode, setEditReasonCode] = useState('Quên bấm');
  const [editReason, setEditReason] = useState('');
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Quỹ phép & Lịch sử
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceSummary | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [attendanceIssues, setAttendanceIssues] = useState<any[]>([]);
  const [publishedTimesheet, setPublishedTimesheet] = useState<PublishedTimesheetData | null>(null);
  const [selectedPeriodFromNoti, setSelectedPeriodFromNoti] = useState<number>(0);

  // Khiếu nại
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeContent, setDisputeContent] = useState('');

  // Lịch làm việc (Remote / Part-time / Chuẩn)
  const [mySchedules, setMySchedules] = useState<WorkSchedule[]>([]);
  const [myEmployeeInfo, setMyEmployeeInfo] = useState<{ employeeType?: string; fullName?: string; employeeCode?: string } | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleWorkDate, setScheduleWorkDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [scheduleShift, setScheduleShift] = useState<'FULL' | 'MORNING' | 'AFTERNOON'>('FULL');
  const [scheduleNote, setScheduleNote] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [mobileScheduleTab, setMobileScheduleTab] = useState<'REGISTER' | 'LIST'>('REGISTER');
  const [desktopScheduleMode, setDesktopScheduleMode] = useState<'QUICK' | 'CALENDAR'>('QUICK');

  const formatScheduleVnDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length < 3) return dateStr;
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = days[d.getDay()];
    return `${dayName}, ${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const getQuickScheduleDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const loadSchedules = async () => {
    try {
      const res = await schedulesApi.getMySchedules();
      if (res) {
        if (res.employee) setMyEmployeeInfo(res.employee);
        if (res.schedules) setMySchedules(res.schedules);
      }
    } catch (err) {
      console.error('Lỗi khi nạp lịch làm việc:', err);
    }
  };

  const handleRegisterSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const todayStr = new Date().toISOString().split('T')[0];
    if (scheduleWorkDate < todayStr) {
      addToast('Quy định: Phải đăng ký trước lịch làm việc. Không được đăng ký lùi ngày đã qua.', 'error');
      return;
    }
    setSavingSchedule(true);
    try {
      await schedulesApi.register({
        dates: [scheduleWorkDate],
        shiftCode: scheduleShift,
        note: scheduleNote.trim() || undefined
      });
      addToast('Đăng ký lịch làm việc thành công!', 'success');
      setScheduleNote('');
      await loadSchedules();
      setMobileScheduleTab('LIST');
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi đăng ký lịch làm việc.', 'error');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleCancelSchedule = async (scheduleId: number) => {
    if (!window.confirm('Bạn có chắc muốn hủy lịch làm việc ngày này?')) return;
    try {
      await schedulesApi.cancel(scheduleId);
      addToast('Đã hủy lịch làm việc thành công.', 'success');
      loadSchedules();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Không thể hủy lịch làm việc.', 'error');
    }
  };

  // Thông báo & Push Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotiCount, setUnreadNotiCount] = useState(0);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() => getNotificationPermission());

  // Trạng thái quyền GPS & Vị trí
  type GpsPermissionStatus = 'granted' | 'prompt' | 'denied' | 'unknown';
  const [gpsPermission, setGpsPermission] = useState<GpsPermissionStatus>('prompt');
  const [showGpsModal, setShowGpsModal] = useState<boolean>(false);
  const [pendingPunchType, setPendingPunchType] = useState<'AUTO' | 'CHECK_IN' | 'CHECK_OUT' | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [checkingGps, setCheckingGps] = useState<boolean>(false);
  const [gpsErrorDetail, setGpsErrorDetail] = useState<{ code?: number; message?: string } | null>(null);

  const isDeviceIos = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  // Truy vấn trạng thái quyền GPS từ Permissions API của trình duyệt
  const queryGpsPermission = async (): Promise<GpsPermissionStatus> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return 'denied';
    }
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const res = await navigator.permissions.query({ name: 'geolocation' });
        return (res.state as GpsPermissionStatus) || 'unknown';
      } catch {
        return 'unknown';
      }
    }
    return 'unknown';
  };

  // Lấy vị trí GPS siêu tốc và bền bỉ (Tối ưu đặc biệt cho iOS Safari / WebKit bug và Android PWA)
  const getFastGpsPosition = (): Promise<{ latitude: number; longitude: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        const err = new Error('Trình duyệt hoặc thiết bị này không hỗ trợ định vị GPS.');
        setGpsErrorDetail({ message: err.message });
        reject(err);
        return;
      }

      let isFinished = false;
      let watchId: number | null = null;
      let hardTimeoutId: any = null;

      const cleanup = () => {
        if (watchId !== null) {
          try {
            navigator.geolocation.clearWatch(watchId);
          } catch {}
          watchId = null;
        }
        if (hardTimeoutId !== null) {
          clearTimeout(hardTimeoutId);
          hardTimeoutId = null;
        }
      };

      const finishSuccess = (pos: GeolocationPosition) => {
        if (isFinished) return;
        isFinished = true;
        cleanup();
        setGpsPermission('granted');
        setGpsErrorDetail(null);
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        setCurrentCoords(coords);
        resolve(coords);
      };

      const finishError = (err: any) => {
        if (isFinished) return;
        isFinished = true;
        cleanup();
        if (err?.code === 1) {
          setGpsPermission('denied');
        }
        setGpsErrorDetail({ code: err?.code, message: err?.message });
        reject(err);
      };

      // 1. WATCH POSITION: Giải pháp vàng trị dứt điểm lỗi Safari WebKit trên iOS
      // Safari thường bị nghẽn (hang/freeze) khi gọi getCurrentPosition lúc chip GPS đang "ngủ",
      // nhưng watchPosition giữ luồng phần cứng mở, giúp CoreLocation nhanh chóng cấp tọa độ
      try {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            finishSuccess(pos);
          },
          (err) => {
            // Nếu người dùng hoặc hệ thống iOS từ chối quyền (code 1: PERMISSION_DENIED) -> Dừng ngay
            if (err.code === 1) {
              finishError(err);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
          }
        );
      } catch (e) {
        console.warn('watchPosition exception:', e);
      }

      // 2. SONG SONG: getCurrentPosition với độ chính xác mạng/Wi-Fi (cực nhanh trong nhà, ~100-300ms)
      navigator.geolocation.getCurrentPosition(
        finishSuccess,
        (err) => {
          if (err.code === 1) {
            finishError(err);
          }
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
      );

      // 3. Fallback lần 3 sau 4 giây: Thử lại getCurrentPosition độ chính xác cao nếu cả 2 nhánh trên chưa xong
      setTimeout(() => {
        if (!isFinished) {
          navigator.geolocation.getCurrentPosition(
            finishSuccess,
            (err) => {
              if (err.code === 1) finishError(err);
            },
            { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
          );
        }
      }, 4000);

      // 4. Hard timeout an toàn sau 12 giây
      hardTimeoutId = setTimeout(() => {
        if (!isFinished) {
          navigator.geolocation.getCurrentPosition(
            finishSuccess,
            (finalErr) => {
              finishError(finalErr || { code: 3, message: 'Quá thời gian chờ lấy tọa độ GPS (Timeout).' });
            },
            { enableHighAccuracy: false, timeout: 2000, maximumAge: Infinity }
          );
        }
      }, 12000);
    });
  };

  // Khởi tạo và lắng nghe thay đổi quyền GPS (hoặc khi người dùng quay lại tab từ Cài đặt)
  useEffect(() => {
    let permStatus: PermissionStatus | null = null;
    const initPerm = async () => {
      if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
        try {
          permStatus = await navigator.permissions.query({ name: 'geolocation' });
          setGpsPermission(permStatus.state as GpsPermissionStatus);
          permStatus.onchange = () => {
            if (permStatus) {
              setGpsPermission(permStatus.state as GpsPermissionStatus);
            }
          };
        } catch {
          // Safari fallback
        }
      }
    };
    initPerm();

    const handleFocus = async () => {
      const status = await queryGpsPermission();
      if (status !== 'unknown') {
        setGpsPermission(status);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      if (permStatus) {
        permStatus.onchange = null;
      }
    };
  }, []);

  // Cài đặt ứng dụng lên màn hình chính (PWA Add to Home Screen)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  });
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  // Lắng nghe sự kiện trước khi cài đặt của trình duyệt (Chrome/Edge/Android)
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        addToast('Đã thêm ứng dụng vào màn hình chính!', 'success');
        setDeferredPrompt(null);
        setIsStandalone(true);
      }
    } else {
      setShowInstallGuideModal(true);
    }
  };

  // 1. Tự động cập nhật đồng hồ mỗi giây
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Tải dữ liệu ban đầu
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [stateRes, devRes, balRes, notiRes] = await Promise.allSettled([
        attendanceApi.getState(),
        devicesApi.getMyDevices(),
        profileApi.getLeaveBalance(),
        notificationsApi.getMyNotifications()
      ]);

      if (stateRes.status === 'fulfilled') setPunchState(stateRes.value);
      if (devRes.status === 'fulfilled') setMyDevices(devRes.value);
      if (balRes.status === 'fulfilled') setLeaveBalance(balRes.value);
      if (notiRes.status === 'fulfilled') {
        setNotifications(notiRes.value.notifications);
        setUnreadNotiCount(notiRes.value.unreadCount);
      }
      await loadSchedules();
    } catch (err: any) {
      console.error('Lỗi tải dữ liệu ESS:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadInitialData();
      await loadSchedules();
      if (activeTab === 'attendance') {
        await Promise.allSettled([
          attendanceApi.getHistory().then(setAttendanceHistory),
          attendanceApi.getIssues().then(setAttendanceIssues),
          timesheetApi.getMyTimesheet(0).then(setPublishedTimesheet)
        ]);
      } else if (activeTab === 'requests') {
        await Promise.allSettled([
          requestsApi.getMyRequests().then(setMyRequests),
          profileApi.getLeaveBalance().then(setLeaveBalance)
        ]);
      }
      addToast('Đã làm mới dữ liệu thành công!', 'success');
    } catch {
      addToast('Không thể làm mới một số dữ liệu.', 'warning');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // 3. Tải theo từng Tab
  useEffect(() => {
    if (activeTab === 'attendance') {
      attendanceApi.getHistory().then(setAttendanceHistory).catch(() => { });
      attendanceApi.getIssues().then(setAttendanceIssues).catch(() => { });
      timesheetApi.getMyTimesheet(0).then(setPublishedTimesheet).catch(() => { });
    } else if (activeTab === 'requests') {
      requestsApi.getMyRequests().then(setMyRequests).catch(() => { });
      profileApi.getLeaveBalance().then(setLeaveBalance).catch(() => { });
    }
  }, [activeTab]);

  // Đếm ngược 60s cooldown
  useEffect(() => {
    if (punchCooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setPunchCooldownSeconds(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [punchCooldownSeconds]);

  // Tự động kiểm tra cập nhật trạng thái mở nút Check-out khi đang trong ca
  useEffect(() => {
    if (!punchState?.hasValidCheckin || punchState?.canCheckout || punchState?.currentMode === 'COMPLETED') return;
    const interval = setInterval(async () => {
      try {
        const state = await attendanceApi.getState();
        setPunchState(state);
      } catch {}
    }, 20000);
    return () => clearInterval(interval);
  }, [punchState?.hasValidCheckin, punchState?.canCheckout, punchState?.currentMode]);

  // Kiểm tra xem máy hiện tại đã có mã secret chưa
  const hasLocalDeviceSecret = hasLocalSecret || (typeof window !== 'undefined' && !!localStorage.getItem('device_secret'));

  // Kiểm tra môi trường PWA Standalone (iOS WebClip hoặc Chrome PWA)
  const isStandalonePwa = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  };
  
  // Tự động nhận diện thiết bị truy cập (Mobile vs PC)
  const checkIsMobileClient = (): boolean => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
    return isMobileUA || window.innerWidth <= 768;
  };
  const [isCurrentClientMobile, setIsCurrentClientMobile] = useState<boolean>(() => checkIsMobileClient());

  useEffect(() => {
    const handleResize = () => setIsCurrentClientMobile(checkIsMobileClient());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = isCurrentClientMobile;

  // Lấy hoặc tự sinh MAC Address surrogate duy nhất cho thiết bị (PC / Mobile)
  const getOrGenerateMacAddress = (): string => {
    let mac = localStorage.getItem('device_mac_address');
    if (!mac) {
      const hex = '0123456789ABCDEF';
      const randomByte = () => hex[Math.floor(Math.random() * 16)] + hex[Math.floor(Math.random() * 16)];
      // Định dạng Locally Administered Unicast MAC: 02:XX:XX:XX:XX:XX
      mac = `02:${randomByte()}:${randomByte()}:${randomByte()}:${randomByte()}:${randomByte()}`;
      localStorage.setItem('device_mac_address', mac);
    }
    return mac;
  };

  // Mở modal đăng ký thiết bị: tự động nhận diện PC/Mobile và gán tên theo tên nhân viên
  const openRegisterDeviceModal = (targetType?: unknown) => {
    // Trên điện thoại: CHỈ được đăng ký Mobile; Trên PC: CHỈ được đăng ký PC
    const allowedType: 'MOBILE' | 'PC' = isCurrentClientMobile ? 'MOBILE' : 'PC';
    const finalType = (targetType === 'MOBILE' || targetType === 'PC') ? targetType : allowedType;
    setRegisteringDeviceType(finalType);
    const isPwa = isStandalonePwa();
    const defaultMobileLabel = isPwa ? 'Mobile (PWA)' : (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') ? 'Mobile (Safari)' : 'Mobile');
    const defaultName = finalType === 'PC'
      ? `PC - ${user?.fullName || 'Nhân viên'}`
      : `${defaultMobileLabel} - ${user?.fullName || 'Nhân viên'}`;
    setDeviceNameInput(defaultName);
    setShowRegisterModal(true);
  };

  // Mở nhanh modal giải trình công đã điền sẵn giờ vào ca sáng
  const handleOpenQuickRegularization = () => {
    const todayStr = punchState?.workDate || new Date().toISOString().split('T')[0];
    const shiftStart = punchState?.shift?.shiftStart || '08:00';
    const nowTimeStr = currentTime.toTimeString().substring(0, 5);
    setRegulDate(todayStr);
    setRegulInTime(shiftStart);
    setRegulOutTime(nowTimeStr);
    setRegulReasonCode('Quên bấm');
    setRegulReason('Quên điểm danh vào ca khi đến giờ chuẩn bị ra về');
    setShowRegulModal(true);
  };

  // Thực hiện quẹt thẻ (Check-in / Check-out)
  const handlePunch = async (specificType?: 'AUTO' | 'CHECK_IN' | 'CHECK_OUT') => {
    // 1. Kiểm tra giãn cách tối thiểu 60 giây giữa 2 lần bấm
    if (punchState?.currentMode === 'COMPLETED') {
      addToast('Hôm nay bạn đã thực hiện đủ 1 lượt Check-in và 1 lượt Check-out. Hệ thống không cho phép chấm công thêm để tránh dữ liệu trùng lặp.', 'info');
      return;
    }

    if (punchState?.hasValidCheckin && !punchState?.canCheckout) {
      addToast(`Bạn vừa Check-in lúc ${punchState?.firstPunchTime || ''}. Để tránh bấm nhầm Check-out khi vừa vào làm, ca làm việc cần tối thiểu 30 phút trước khi Check-out (còn lại ${punchState?.remainingMinutesToCheckout ?? 30} phút).`, 'warning');
      return;
    }

    if (punchCooldownSeconds > 0) {
      addToast(`Thao tác quá nhanh. Vui lòng đợi ít nhất ${punchCooldownSeconds} giây giữa 2 lần bấm.`, 'warning');
      return;
    }

    if (!hasLocalDeviceSecret) {
      if (isMobile) {
        addToast(`Ứng dụng ${isStandalonePwa() ? 'PWA' : 'trình duyệt'} này chưa được liên kết mã chấm công. Vui lòng bấm "Kích hoạt máy này" trước khi chấm công.`, 'warning');
        openRegisterDeviceModal('MOBILE');
        return;
      }
      addToast('Thiết bị này chưa đăng ký mã bí mật. Vui lòng bấm Đăng ký thiết bị trước.', 'warning');
      openRegisterDeviceModal();
      return;
    }

    if (!navigator.onLine) {
      addToast('Không có kết nối mạng Internet. Vui lòng kiểm tra Wi-Fi / 4G.', 'error');
      return;
    }

    setPunching(true);
    setPunchStatusMessage('Đang lấy vị trí GPS...');

    const channel = isMobile ? 'MOBILE_PWA' : 'PC_WEB';
    const targetPunchType = specificType || (punchState?.canCheckout ? 'CHECK_OUT' : (punchState?.currentMode === 'NEED_EXPLANATION' ? 'CHECK_OUT' : 'AUTO'));

    const performCall = async (lat?: number, lng?: number, accuracy?: number, gpsError?: string) => {
      setPunchStatusMessage('Đang gửi dữ liệu xác thực...');
      try {
        const result = await attendanceApi.punch({
          latitude: lat,
          longitude: lng,
          accuracy: accuracy,
          gpsError: gpsError,
          channel: channel,
          macAddress: getOrGenerateMacAddress(),
          punchType: targetPunchType
        });

        setLastPunchResult(result);
        const state = await attendanceApi.getState();
        setPunchState(state);

        // Kích hoạt bộ đếm 60 giây giãn cách sau lượt bấm thành công
        setPunchCooldownSeconds(60);

        const timeStr = result.checkTimeLocal ? (result.checkTimeLocal.split(' ')[1] || result.checkTimeLocal) : '';
        const isCheckoutAction = targetPunchType === 'CHECK_OUT' || punchState?.canCheckout || punchState?.currentMode === 'NEED_EXPLANATION';
        const modeLabel = isCheckoutAction ? 'Ra về (Check-out)' : 'Vào làm (Check-in)';

        if (result.needsExplanation) {
          addToast(`Đã ghi nhận ${modeLabel} lúc ${timeStr}. Do chưa có lượt Check-in buổi sáng, bạn vui lòng nộp Đơn giải trình bổ sung công.`, 'warning');
        } else if (result.verificationStatus === 'VALID') {
          addToast(`Điểm danh ${modeLabel} thành công! Giờ ghi nhận: ${timeStr}`, 'success');
          triggerMobilePushNotification({
            title: `✅ ${settings.siteTitle || 'Hệ Thống'}: Điểm danh ${modeLabel} thành công`,
            body: `Giờ ghi nhận: ${timeStr}. Chúc bạn làm việc hiệu quả!`,
            type: 'success'
          });
        } else if (result.verificationStatus === 'REVIEW') {
          addToast(`Đã ghi nhận ${modeLabel} (${result.reasonCode}). Cần HCNS duyệt do vị trí chưa khớp hoàn toàn.`, 'warning');
          triggerMobilePushNotification({
            title: '⚠️ Cảnh báo vị trí chấm công',
            body: `Lượt quẹt có cờ (${result.reasonCode}). Vị trí GPS hoặc Wi-Fi chưa khớp hoàn toàn hội sở.`,
            type: 'warning'
          });
        } else {
          addToast(`Ngoài văn phòng (${result.reasonCode}). Vui lòng nộp giải trình nếu cần thiết.`, 'warning');
          triggerMobilePushNotification({
            title: '🚨 Cảnh báo ngoài vùng hội sở',
            body: `Bạn đang ở ngoài phạm vi (${result.reasonCode}). Vui lòng nộp đơn giải trình trong ngày.`,
            type: 'error'
          });
        }
      } catch (err: any) {
        const serverError = err.response?.data?.error || err.response?.data?.inner;
        const baseMsg = err.response?.data?.message || 'Có lỗi xảy ra khi chấm công.';
        const msg = serverError ? `${baseMsg} (${serverError})` : baseMsg;
        if (msg.includes('Thao tác quá nhanh') || msg.includes('60 giây')) {
          setPunchCooldownSeconds(60);
          addToast(msg, 'warning');
        } else {
          addToast(msg, 'error');
        }
        triggerMobilePushNotification({
          title: '❌ Chấm công không thành công',
          body: msg,
          type: 'error'
        });
      } finally {
        setPunching(false);
        setPunchStatusMessage('');
      }
    };

    if (channel === 'PC_WEB') {
      // PC không cần lấy GPS
      await performCall();
      return;
    }

    if (!navigator.geolocation) {
      setPunching(false);
      setPunchStatusMessage('');
      addToast('Thiết bị này không hỗ trợ định vị GPS.', 'error');
      return;
    }

    // Tự động kết nối và lấy GPS siêu tốc 1 chạm (Tự động fallback Wi-Fi/4G khi ở trong phòng)
    setPunching(true);
    setPunchStatusMessage('Đang kết nối GPS và xác thực vị trí...');

    try {
      const coords = await getFastGpsPosition();
      setGpsPermission('granted');
      await performCall(coords.latitude, coords.longitude, coords.accuracy);
    } catch (err: any) {
      console.warn('GPS Error during checkin/checkout:', err);
      setPunching(false);
      setPunchStatusMessage('');
      setPendingPunchType(targetPunchType);
      setShowGpsModal(true);
    }
  };

  // Đăng ký thiết bị (PC tự động lấy MAC address và tên nhân viên, submit 1 chạm)
  const handleRegisterDevice = async () => {
    try {
      const isTargetMobile = registeringDeviceType === 'MOBILE';
      if (isCurrentClientMobile && !isTargetMobile) {
        addToast('Trên điện thoại di động chỉ được đăng ký thiết bị Mobile. Máy tính (PC) phải đăng ký trực tiếp trên máy tính.', 'warning');
        return;
      }
      if (!isCurrentClientMobile && isTargetMobile) {
        addToast('Trên máy tính chỉ được đăng ký thiết bị PC. Vui lòng mở điện thoại để đăng ký Mobile.', 'warning');
        return;
      }

      const isPc = registeringDeviceType === 'PC';
      const os = navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad') ? 'iOS' :
        navigator.userAgent.includes('Android') ? 'Android' :
          navigator.userAgent.includes('Windows') ? 'Windows' :
            navigator.userAgent.includes('Mac') ? 'macOS' : 'Linux';

      const browser = navigator.userAgent.includes('Chrome') ? 'Chrome' :
        navigator.userAgent.includes('Safari') ? 'Safari' :
          navigator.userAgent.includes('Edge') ? 'Edge' :
            navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Browser';

      const isPwa = isStandalonePwa();
      const defaultMobileLabel = isPwa ? 'Mobile (PWA)' : (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') ? 'Mobile (Safari)' : 'Mobile');
      const macAddress = getOrGenerateMacAddress();
      const autoDeviceName = deviceNameInput.trim() || (isPc ? `PC - ${user?.fullName || 'Nhân viên'}` : `${defaultMobileLabel} - ${user?.fullName || 'Nhân viên'}`);

      const res = await devicesApi.register({
        deviceType: registeringDeviceType,
        deviceName: autoDeviceName,
        operatingSystem: os,
        browserInfo: isPwa ? `${browser} (PWA)` : browser,
        fingerprintHash: macAddress
      });

      // Lưu secret token vào localStorage và cập nhật state
      if (res.secretToken) {
        localStorage.setItem('device_secret', res.secretToken);
        setHasLocalSecret(true);
      }

      addToast(`Đã kích hoạt thiết bị (${autoDeviceName}) thành công! Bạn có thể bắt đầu chấm công ngay lập tức.`, 'success');
      setShowRegisterModal(false);
      setDeviceNameInput('');
      const devs = await devicesApi.getMyDevices();
      setMyDevices(devs);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Không thể đăng ký thiết bị.', 'error');
    }
  };

  // Nộp đơn xin nghỉ
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLeave(true);
    try {
      // Tự động chuyển đổi toàn bộ ảnh minh chứng sang WebP trước khi gửi lên máy chủ
      const converted = await convertMultipleImagesToWebP(leaveFiles, 0.82);
      const webpFiles = converted.map(c => c.file);

      const formData = new FormData();
      formData.append('requestType', 'LEAVE');
      formData.append('leaveCode', leaveCode === '1/2P' ? 'P/2' : leaveCode);
      formData.append('fromDate', leaveFromDate);
      formData.append('toDate', leaveToDate);
      formData.append('dayPart', leaveDayPart);
      formData.append('reason', leaveReason);
      webpFiles.forEach(file => formData.append('files', file));

      await requestsApi.submit(formData);
      addToast('Gửi đơn nghỉ phép thành công. Đang chờ HCNS phê duyệt.', 'success');
      setShowLeaveModal(false);
      setLeaveReason('');
      setLeaveFiles([]);
      const reqs = await requestsApi.getMyRequests();
      setMyRequests(reqs);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi khi gửi đơn.', 'error');
    } finally {
      setSubmittingLeave(false);
    }
  };

  // Nộp giải trình
  const [submittingRegul, setSubmittingRegul] = useState(false);
  const handleSubmitRegularization = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingRegul(true);
    try {
      // Tự động chuyển đổi toàn bộ ảnh sang WebP
      const converted = await convertMultipleImagesToWebP(regulFiles, 0.82);
      const webpFiles = converted.map(c => c.file);

      const formData = new FormData();
      formData.append('requestType', 'REGULARIZATION');
      formData.append('fromDate', regulDate);
      formData.append('toDate', regulDate);
      formData.append('actualIn', regulInTime);
      formData.append('actualOut', regulOutTime);
      formData.append('reasonCode', regulReasonCode);
      formData.append('reason', regulReason);
      webpFiles.forEach(file => formData.append('files', file));

      await requestsApi.submit(formData);
      addToast('Gửi giải trình chấm công thành công. Đang chờ HCNS phê duyệt.', 'success');
      setShowRegulModal(false);
      setRegulReason('');
      setRegulFiles([]);
      const reqs = await requestsApi.getMyRequests();
      setMyRequests(reqs);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi khi gửi giải trình.', 'error');
    } finally {
      setSubmittingRegul(false);
    }
  };

  // Mở modal sửa đơn
  const handleOpenEditRequest = (req: UserRequestItem) => {
    setEditingRequest(req);
    setEditRequestType(req.requestType);
    setEditFromDate(req.fromDate);
    setEditToDate(req.toDate || req.fromDate);
    setEditReason(req.reason || '');
    setEditNewFiles([]);

    if (req.requestType === 'LEAVE') {
      setEditLeaveCode(req.leaveCode || 'P');
      setEditDayPart((req.dayPart as 'FULL' | 'MORNING' | 'AFTERNOON') || 'FULL');
    } else {
      setEditInTime(req.actualTimeIn || req.actualIn || '08:00');
      setEditOutTime(req.actualTimeOut || req.actualOut || '17:00');
      setEditReasonCode(req.reasonCode || 'Quên bấm');
    }
  };

  // Lưu cập nhật đơn
  const handleSaveEditRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;
    setSubmittingEdit(true);

    try {
      const converted = await convertMultipleImagesToWebP(editNewFiles, 0.82);
      const webpFiles = converted.map(c => c.file);

      const formData = new FormData();
      formData.append('requestType', editRequestType);
      formData.append('fromDate', editFromDate);
      formData.append('reason', editReason);

      if (editRequestType === 'LEAVE') {
        formData.append('toDate', editToDate);
        formData.append('leaveCode', editLeaveCode === '1/2P' ? 'P/2' : editLeaveCode);
        formData.append('dayPart', editDayPart);
      } else {
        formData.append('toDate', editFromDate);
        formData.append('actualIn', editInTime);
        formData.append('actualOut', editOutTime);
        formData.append('reasonCode', editReasonCode);
      }

      webpFiles.forEach(f => formData.append('files', f));

      await requestsApi.update(editingRequest.requestId, formData);
      addToast('Cập nhật đơn thành công!', 'success');
      setEditingRequest(null);
      setEditNewFiles([]);

      const updatedList = await requestsApi.getMyRequests();
      setMyRequests(updatedList);
      window.dispatchEvent(new CustomEvent('notification-updated'));
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi khi cập nhật đơn.', 'error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Xóa tệp minh chứng khi đang chỉnh sửa đơn
  const handleDeleteExistingAttachment = async (attachmentId: number) => {
    if (!confirm('Bạn có chắc muốn xóa tệp minh chứng này?')) return;
    try {
      await requestsApi.deleteAttachment(attachmentId);
      addToast('Đã xóa tệp minh chứng.', 'success');
      if (editingRequest) {
        setEditingRequest(prev => prev ? {
          ...prev,
          attachments: prev.attachments?.filter(a => a.attachmentId !== attachmentId),
          attachmentCount: Math.max(0, (prev.attachmentCount || 1) - 1)
        } : null);
      }
      const updatedList = await requestsApi.getMyRequests();
      setMyRequests(updatedList);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi xóa tệp minh chứng.', 'error');
    }
  };

  // Gửi khiếu nại
  const handleSubmitDispute = async () => {
    if (!publishedTimesheet?.publicationId || !disputeContent.trim()) return;
    try {
      await timesheetApi.submitDispute(publishedTimesheet.publicationId, disputeContent);
      addToast('Đã gửi khiếu nại thành công.', 'success');
      setShowDisputeModal(false);
      setDisputeContent('');
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi khi gửi khiếu nại.', 'error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header Bar */}
      <header style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        padding: '10px 14px',
        paddingTop: 'max(10px, env(safe-area-inset-top))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          {settings.logoUrl ? (
            <img
              src={settings.logoUrl}
              alt={settings.siteTitle}
              style={{ maxHeight: 34, maxWidth: 90, objectFit: 'contain', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: 10,
              backgroundColor: settings.brandColor || '#0056B3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              color: '#FFFFFF'
            }}>
              {settings.siteTitle ? settings.siteTitle.charAt(0).toUpperCase() : 'P'}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {settings.siteTitle || 'Cổng Tự Chấm Công'}
            </div>
            {settings.siteSubtitle && (
              <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {settings.siteSubtitle}
              </div>
            )}
          </div>
        </div>

        {/* Nút làm mới dữ liệu (Refresh mobile / PWA) */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Làm mới dữ liệu"
          aria-label="Làm mới dữ liệu"
          style={{
            width: 38,
            height: 38,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            backgroundColor: isRefreshing ? '#E2E8F0' : '#F1F5F9',
            border: '1px solid #E2E8F0',
            color: settings.brandColor || '#0056B3',
            cursor: isRefreshing ? 'default' : 'pointer',
            transition: 'background-color 0.15s ease'
          }}
        >
          <RefreshCw
            size={18}
            style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }}
          />
        </button>
      </header>

      {/* Main Body Content Container */}
      <main style={{ flex: 1, padding: isMobile ? '16px 12px 90px 12px' : '24px 20px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
        {/* TAB 1: TRANG CHỦ (CHẤM CÔNG NHANH) */}
        {activeTab === 'home' && (
          <div>
            {/* Cảnh báo thiết bị chưa đăng ký */}
            {!hasLocalDeviceSecret && (
              <div style={{
                backgroundColor: '#FEF3C7',
                border: '1px solid #F59E0B',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AlertTriangle color="#B45309" size={24} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#92400E' }}>Chưa đăng ký thiết bị này</div>
                    <div style={{ fontSize: 12, color: '#B45309' }}>Vui lòng đăng ký để được HCNS duyệt chấm công.</div>
                  </div>
                </div>
                <button
                  onClick={openRegisterDeviceModal}
                  style={{
                    backgroundColor: '#B45309',
                    color: '#FFF',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  Đăng ký ngay
                </button>
              </div>
            )}

            {/* Banner Thông tin Nhân sự Remote / Part-time & Lịch làm việc */}
            {(myEmployeeInfo?.employeeType === 'REMOTE' || myEmployeeInfo?.employeeType === 'PARTTIME') && (
              <div style={{
                backgroundColor: myEmployeeInfo.employeeType === 'REMOTE' ? '#EFF6FF' : '#FEF3C7',
                border: `1.5px solid ${myEmployeeInfo.employeeType === 'REMOTE' ? '#93C5FD' : '#FDE68A'}`,
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
                  <Calendar size={22} color={myEmployeeInfo.employeeType === 'REMOTE' ? '#2563EB' : '#D97706'} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: myEmployeeInfo.employeeType === 'REMOTE' ? '#1E40AF' : '#92400E' }}>
                      {myEmployeeInfo.employeeType === 'REMOTE' ? 'Nhân sự Remote (Từ xa / Tại nhà)' : 'Nhân sự Part-time (Bán thời gian)'}
                    </div>
                    <div style={{ fontSize: 12, color: myEmployeeInfo.employeeType === 'REMOTE' ? '#3B82F6' : '#B45309', marginTop: 2 }}>
                      {myEmployeeInfo.employeeType === 'REMOTE'
                        ? 'Được chấm công tại nhà và tính đủ công tháng. Đăng ký trước lịch làm việc.'
                        : 'Tính công theo ngày làm thực tế. Ngày ngoài lịch không cần giải trình.'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    loadSchedules();
                    setMobileScheduleTab('REGISTER');
                    setShowScheduleModal(true);
                  }}
                  style={{
                    backgroundColor: myEmployeeInfo.employeeType === 'REMOTE' ? '#2563EB' : '#D97706',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Calendar size={14} />
                  <span>Đăng ký lịch ({mySchedules.filter(s => s.status === 'REGISTERED').length} ngày)</span>
                </button>
              </div>
            )}

            {/* Thẻ đồng hồ và Thông tin hiện diện */}
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              textAlign: 'center',
              marginBottom: 20
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 }}>
                {currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
              <div style={{
                fontSize: 48,
                fontWeight: 800,
                color: '#0056B3',
                fontFamily: 'Nunito Sans, sans-serif',
                marginTop: 4,
                marginBottom: 8
              }}>
                {currentTime.toLocaleTimeString('vi-VN')}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 13, color: '#64748B', marginBottom: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Wifi size={16} color="#0056B3" />
                  IP: {punchState?.clientPublicIp || 'Đang nhận diện...'}
                </span>
                <span
                  onClick={async () => {
                    try {
                      setCheckingGps(true);
                      const coords = await getFastGpsPosition();
                      setCheckingGps(false);
                      addToast(`✅ Vị trí GPS sẵn sàng! Sai số ~${Math.round(coords.accuracy)}m`, 'success');
                    } catch {
                      setCheckingGps(false);
                      setShowGpsModal(true);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  title="Bấm để kiểm tra hoặc kích hoạt GPS"
                >
                  <MapPin
                    size={16}
                    color={gpsPermission === 'granted' ? '#16A34A' : (gpsPermission === 'denied' ? '#DC2626' : '#D97706')}
                  />
                  <span style={{
                    color: gpsPermission === 'granted' ? '#16A34A' : (gpsPermission === 'denied' ? '#DC2626' : '#D97706'),
                    fontWeight: gpsPermission === 'granted' ? 600 : 700
                  }}>
                    {gpsPermission === 'granted' ? 'GPS sẵn sàng' : (gpsPermission === 'denied' ? 'GPS: Bấm để bật' : 'GPS: Chờ cấp quyền')}
                  </span>
                </span>
              </div>

              {/* Badge Ca làm việc của Hội sở */}
              {punchState?.shift && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  color: '#475569',
                  marginBottom: 18,
                  fontWeight: 600
                }}>
                  <Clock size={14} color="#0056B3" />
                  <span>Ca hội sở: <strong style={{ color: '#0F172A' }}>{punchState.shift.shiftStart} - {punchState.shift.shiftEnd}</strong></span>
                  <span style={{ color: '#CBD5E1' }}>•</span>
                  <span>Mở tan ca: <strong style={{ color: '#0056B3' }}>{punchState.shift.checkoutStartTime}</strong></span>
                </div>
              )}

              {/* NÚT TRÒN LỚN CHẤM CÔNG (RADAR EFFECT) HOẶC NÚT GIẢI TRÌNH KHI CHƯA CHECKIN GIỜ TAN CA */}
              {(() => {
                const isCompletedState = punchState?.currentMode === 'COMPLETED' || (!!punchState?.firstPunchTime && !!punchState?.lastPunchTime);
                const isNeedExplanation = punchState?.currentMode === 'NEED_EXPLANATION';
                const isWorkingNotCheckedIn = punchState?.currentMode === 'WORKING_NOT_CHECKED_IN';
                const isCheckoutState = (punchState?.currentMode === 'CHECK_OUT' || (!!punchState?.canCheckout && !!punchState?.hasValidCheckin)) && !isCompletedState && !isNeedExplanation;
                const isWorkingState = (punchState?.currentMode === 'CHECKED_IN' || (!punchState?.canCheckout && !!punchState?.hasValidCheckin)) && !isCompletedState && !isNeedExplanation && !isCheckoutState;

                // Trường hợp ĐẶC BIỆT: Đến giờ chuẩn bị tan ca nhưng sáng chưa quẹt Check-in
                if (isNeedExplanation) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '16px 0', width: '100%' }}>
                      <div style={{
                        padding: '14px 16px',
                        backgroundColor: '#FFFBEB',
                        border: '1.5px solid #F59E0B',
                        borderRadius: 14,
                        marginBottom: 18,
                        maxWidth: 420,
                        width: '100%',
                        textAlign: 'left',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.12)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: '#B45309', marginBottom: 4 }}>
                          <AlertTriangle size={20} color="#D97706" />
                          <span>CHƯA CHECK-IN — ĐÃ ĐẾN GIỜ TAN CA!</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                          {punchState?.explanationPrompt?.reason || 'Hiện tại đã đến giờ chuẩn bị ra về nhưng hệ thống ghi nhận bạn chưa điểm danh vào sáng nay. Vui lòng bấm gửi đơn giải trình để được bổ sung công.'}
                        </div>
                      </div>

                      {/* NÚT CHÍNH: Gửi đơn giải trình bổ sung công */}
                      <button
                        onClick={handleOpenQuickRegularization}
                        style={{
                          width: '100%',
                          maxWidth: 360,
                          padding: '16px 20px',
                          borderRadius: 16,
                          backgroundColor: '#D97706',
                          color: '#FFFFFF',
                          border: 'none',
                          cursor: 'pointer',
                          boxShadow: '0 8px 20px rgba(217, 119, 6, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          fontSize: 15,
                          fontWeight: 800,
                          transition: 'all 0.2s ease',
                          marginBottom: 12
                        }}
                      >
                        <FileText size={22} />
                        <span>GỬI ĐƠN GIẢI TRÌNH CÔNG (1 CHẠM)</span>
                      </button>

                      {/* Nút phụ: Điểm danh ra về kèm giải trình */}
                      <button
                        onClick={() => handlePunch('CHECK_OUT')}
                        disabled={punching}
                        style={{
                          backgroundColor: 'transparent',
                          color: '#B45309',
                          border: '1px dashed #D97706',
                          borderRadius: 10,
                          padding: '10px 16px',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: punching ? 'wait' : 'pointer'
                        }}
                      >
                        {punching ? 'Đang gửi...' : 'Điểm danh ra về (Check-out) kèm cờ giải trình'}
                      </button>
                    </div>
                  );
                }

                let btnBg = '#0056B3';
                let btnBorder = '6px solid #FFC72C';
                let btnShadow = '0 8px 24px rgba(0, 86, 179, 0.35)';
                let btnIcon = <Clock size={36} style={{ marginBottom: 6 }} />;
                let btnMainText = 'CHECK-IN';
                let btnSubText = 'Bấm để vào làm';

                if (punchCooldownSeconds > 0) {
                  btnBg = '#475569';
                  btnBorder = '6px solid #94A3B8';
                  btnShadow = '0 6px 18px rgba(71, 85, 105, 0.35)';
                  btnMainText = `ĐỢI ${punchCooldownSeconds}S`;
                  btnSubText = 'Cách 60s giữa 2 lần bấm';
                } else if (isCompletedState) {
                  btnBg = '#0D9488';
                  btnBorder = '6px solid #5EEAD4';
                  btnShadow = '0 8px 24px rgba(13, 148, 136, 0.35)';
                  btnIcon = <CheckCircle2 size={36} style={{ marginBottom: 6 }} />;
                  btnMainText = 'ĐÃ HOÀN TẤT';
                  btnSubText = '1 lượt Vào & 1 lượt Ra';
                } else if (isWorkingState) {
                  btnBg = '#F1F5F9';
                  btnBorder = '6px solid #CBD5E1';
                  btnShadow = 'none';
                  btnIcon = <Lock size={36} color="#64748B" style={{ marginBottom: 6 }} />;
                  btnMainText = 'ĐANG LÀM';
                  btnSubText = punchState?.remainingMinutesToCheckout ? `Mở sau ${punchState.remainingMinutesToCheckout}p` : 'Trong ca làm';
                } else if (isCheckoutState) {
                  btnBg = '#16A34A';
                  btnBorder = '6px solid #86EFAC';
                  btnShadow = '0 8px 24px rgba(22, 163, 74, 0.35)';
                  btnIcon = <Clock size={36} style={{ marginBottom: 6 }} />;
                  btnMainText = 'CHECK-OUT';
                  btnSubText = 'Bấm để ra về';
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '20px 0' }}>
                    {isWorkingNotCheckedIn && (
                      <div style={{
                        marginBottom: 16,
                        padding: '10px 14px',
                        backgroundColor: '#FEF3C7',
                        border: '1px solid #F59E0B',
                        borderRadius: 10,
                        fontSize: 12,
                        color: '#92400E',
                        maxWidth: 360,
                        textAlign: 'center'
                      }}>
                        ⚠️ Đã qua giờ bắt đầu ca ({punchState?.shift?.shiftStart || '08:00'}), bạn chưa Check-in hôm nay. Vui lòng Check-in ngay!
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (isCompletedState) {
                          addToast('Bạn đã hoàn thành đủ 1 lượt Check-in và 1 lượt Check-out hôm nay. Hệ thống không cho phép chấm công thêm để tránh dữ liệu trùng lặp.', 'info');
                          return;
                        }
                        if (isWorkingState) {
                          addToast(`Bạn vừa Check-in lúc ${punchState?.firstPunchTime}. Để tránh bấm nhầm Check-out khi vừa vào làm, ca làm việc cần tối thiểu 30 phút trước khi Check-out (còn lại ${punchState?.remainingMinutesToCheckout ?? 30} phút).`, 'warning');
                          return;
                        }
                        handlePunch(isCheckoutState ? 'CHECK_OUT' : 'CHECK_IN');
                      }}
                      disabled={punching || isCompletedState || isWorkingState}
                      style={{
                        width: 170,
                        height: 170,
                        borderRadius: '50%',
                        backgroundColor: btnBg,
                        color: isWorkingState ? '#64748B' : '#FFFFFF',
                        border: btnBorder,
                        cursor: punching ? 'wait' : (isWorkingState || isCompletedState ? 'not-allowed' : 'pointer'),
                        boxShadow: btnShadow,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.25s ease',
                        outline: 'none',
                        opacity: isCompletedState ? 0.95 : 1
                      }}
                    >
                      {btnIcon}
                      <span style={{ fontSize: punchCooldownSeconds > 0 ? 17 : (btnMainText.length > 8 ? 17 : 20), fontWeight: 800 }}>
                        {punching ? 'ĐANG GỬI...' : btnMainText}
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.9, marginTop: 4, padding: '0 8px', textAlign: 'center' }}>
                        {punching ? 'Vui lòng đợi' : btnSubText}
                      </span>
                    </button>

                    {/* Khung hướng dẫn khi đang trong ca */}
                    {isWorkingState && (
                      <div style={{
                        marginTop: 14,
                        padding: '12px 18px',
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: 10,
                        fontSize: 12,
                        color: '#1E40AF',
                        maxWidth: 320,
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <div>
                          <strong>Đang trong ca làm việc</strong> (Vào: {punchState?.firstPunchTime})
                          <span style={{ display: 'block', color: '#1D4ED8', marginTop: 4 }}>
                            Để tránh quẹt nhầm Check-out khi vừa vào làm, nút Check-out sẽ tự động mở sau <b>{punchState?.remainingMinutesToCheckout ?? 30} phút</b> nữa.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Thông báo hoàn tất khi đã có đủ vào/ra trong ngày */}
                    {isCompletedState && (
                      <div style={{
                        marginTop: 14,
                        padding: '12px 18px',
                        backgroundColor: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        borderRadius: 12,
                        fontSize: 12,
                        color: '#166534',
                        maxWidth: 340,
                        textAlign: 'center',
                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.1)'
                      }}>
                        <div style={{ fontWeight: 800, fontSize: 13, color: '#15803D', marginBottom: 3 }}>
                          🎉 ĐÃ HOÀN TẤT CHẤM CÔNG HÔM NAY
                        </div>
                        <div>
                          Vào: <strong>{punchState?.firstPunchTime}</strong> · Ra: <strong>{punchState?.lastPunchTime}</strong>
                        </div>
                        <div style={{ fontSize: 11, color: '#15803D', marginTop: 4 }}>
                          Mỗi ngày chỉ ghi nhận 1 lần Check-in và 1 lần Check-out.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {punchStatusMessage && (
                <div style={{ fontSize: 13, color: '#0056B3', fontWeight: 600, marginTop: 8 }}>
                  <RefreshCw size={14} className="spin" style={{ display: 'inline', marginRight: 4 }} />
                  {punchStatusMessage}
                </div>
              )}

              {/* Thẻ kết quả lượt quẹt gần nhất */}
              {lastPunchResult && (
                <div style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: lastPunchResult.verificationStatus === 'VALID' ? '#F0FDF4' :
                    lastPunchResult.verificationStatus === 'REVIEW' ? '#FEFCE8' : '#FEF2F2',
                  border: `1px solid ${lastPunchResult.verificationStatus === 'VALID' ? '#86EFAC' :
                      lastPunchResult.verificationStatus === 'REVIEW' ? '#FDE047' : '#FCA5A5'
                    }`,
                  fontSize: 13,
                  color: '#1E293B',
                  textAlign: 'left'
                }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {lastPunchResult.verificationStatus === 'VALID' && <CheckCircle2 size={18} color="#16A34A" />}
                    {lastPunchResult.verificationStatus === 'REVIEW' && <AlertTriangle size={18} color="#CA8A04" />}
                    {lastPunchResult.verificationStatus === 'OUT_OF_OFFICE' && <XCircle size={18} color="#DC2626" />}
                    Trạng thái: {lastPunchResult.verificationStatus} {lastPunchResult.reasonCode ? `(${lastPunchResult.reasonCode})` : ''}
                  </div>
                  <div style={{ marginTop: 4, color: '#475569' }}>{lastPunchResult.message}</div>
                </div>
              )}
            </div>

            {/* Thẻ lượt bấm trong ngày */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>Lượt bấm hôm nay</span>
                <span style={{ fontSize: 12, color: '#64748B' }}>{punchState?.validPunchCount ?? punchState?.todayPunchCount ?? 0} / 2 lượt (1 Vào, 1 Ra)</span>
              </div>

              {punchState?.punches && punchState.punches.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {punchState.punches.map((p, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      backgroundColor: '#F8FAFC',
                      borderRadius: 10,
                      border: '1px solid #E2E8F0'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#0056B3' }}>{p.checkTimeLocal}</span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: p.verificationStatus === 'VALID' ? '#DCFCE7' :
                            p.verificationStatus === 'REVIEW' ? '#FEF9C3' : '#FEE2E2',
                          color: p.verificationStatus === 'VALID' ? '#166534' :
                            p.verificationStatus === 'REVIEW' ? '#854D0E' : '#991B1B'
                        }}>
                          {p.verificationStatus}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>
                        {p.reasonCode || (p.channel === 'MOBILE_PWA' ? 'Di động' : 'Máy tính')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: 14 }}>
                  Chưa có lượt chấm công nào hôm nay.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CHẤM CÔNG & LỊCH SỬ */}
        {activeTab === 'attendance' && (
          <div>
            {/* BẢNG CHẤM CÔNG CÁ NHÂN CHI TIẾT (NGÀY PHÉP, NGÀY TRỄ, CÒN LẠI PHÉP NĂM) */}
            <div style={{ marginBottom: 16 }}>
              <PersonalTimesheetView
                isMobile={true}
                initialPeriodId={selectedPeriodFromNoti}
                onOpenDisputeModal={(pubId, dt) => {
                  setDisputeContent('');
                  setShowDisputeModal(true);
                }}
              />
            </div>

            {/* Các ngày cần giải trình */}
            {attendanceIssues.length > 0 && (
              <div style={{
                backgroundColor: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: 16,
                padding: 16,
                marginBottom: 16
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#92400E', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={18} color="#D97706" />
                  Ngày cần giải trình ({attendanceIssues.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {attendanceIssues.map((iss, idx) => (
                    <div key={idx} style={{
                      backgroundColor: '#FFFFFF',
                      padding: '10px 12px',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: '1px solid #FEF3C7'
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>{iss.workDate}</div>
                        <div style={{ fontSize: 11, color: '#D97706' }}>{iss.description}</div>
                      </div>
                      <button
                        onClick={() => {
                          setRegulDate(iss.workDate);
                          setShowRegulModal(true);
                        }}
                        style={{
                          backgroundColor: '#0056B3',
                          color: '#FFF',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Giải trình
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lịch sử theo ngày */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#1E293B', marginBottom: 14 }}>
                Lịch sử quẹt chấm công (30 ngày gần nhất)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {attendanceHistory.map((h, idx) => (
                  <div key={idx} style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>{h.workDate}</div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                        Vào: <strong style={{ color: '#16A34A' }}>{h.inTime || '--:--'}</strong> ·
                        Ra: <strong style={{ color: '#E31837' }}>{h.outTime || '--:--'}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 6,
                        backgroundColor: h.source === 'REGULARIZED' ? '#EDE9FE' : '#E0F2FE',
                        color: h.source === 'REGULARIZED' ? '#6D28D9' : '#0369A1',
                        fontWeight: 700
                      }}>
                        {h.source}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ĐƠN TỪ & NGHỈ PHÉP */}
        {activeTab === 'requests' && (
          <div>
            {/* Quick Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
              <button
                onClick={() => setShowLeaveModal(true)}
                style={{
                  backgroundColor: '#0056B3',
                  color: '#FFF',
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} />
                Xin nghỉ phép
              </button>
              <button
                onClick={() => setShowRegulModal(true)}
                style={{
                  backgroundColor: '#FFC72C',
                  color: '#1E293B',
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} />
                Giải trình giờ
              </button>
              <button
                onClick={() => {
                  loadSchedules();
                  setMobileScheduleTab('REGISTER');
                  setShowScheduleModal(true);
                }}
                style={{
                  backgroundColor: myEmployeeInfo?.employeeType === 'REMOTE' || myEmployeeInfo?.employeeType === 'PARTTIME' ? '#059669' : '#334155',
                  color: '#FFF',
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
                title="Đăng ký trước ngày làm việc (bắt buộc với Remote & Part-time)"
              >
                <Calendar size={16} />
                Đăng ký lịch làm
              </button>
            </div>

            {/* Thẻ Quỹ phép nhanh */}
            {leaveBalance && (
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748B' }}>Quỹ phép năm {leaveBalance.year}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#0056B3' }}>
                      {leaveBalance.available} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>ngày khả dụng</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, textAlign: 'right', color: '#64748B' }}>
                    <div>Đã dùng: <strong>{leaveBalance.used}</strong></div>
                    <div>Đang giữ chỗ: <strong>{leaveBalance.held}</strong></div>
                  </div>
                </div>
              </div>
            )}

            {/* Danh sách đơn của tôi */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#1E293B', marginBottom: 14 }}>
                Đơn từ của tôi
              </div>

              {myRequests.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myRequests.map((req) => (
                    <div key={req.requestId} style={{
                      padding: 14,
                      borderRadius: 10,
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#0056B3' }}>
                          {req.requestType === 'LEAVE' ? `Nghỉ phép (${req.leaveCode})` : 'Giải trình chấm công'}
                        </span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: req.status === 'APPROVED' ? '#DCFCE7' :
                            req.status === 'PENDING_HR' ? '#FEF9C3' : '#FEE2E2',
                          color: req.status === 'APPROVED' ? '#166534' :
                            req.status === 'PENDING_HR' ? '#854D0E' : '#991B1B'
                        }}>
                          {req.status === 'PENDING_HR' ? 'Chờ HCNS duyệt' :
                            req.status === 'APPROVED' ? 'Đã duyệt' :
                              req.status === 'REJECTED' ? 'Bị từ chối' : 'Đã hủy'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>
                        Thời gian: <strong>{req.fromDate}</strong> {req.toDate !== req.fromDate ? `đến ${req.toDate}` : ''} ({req.daysRequested} ngày)
                      </div>
                      <div style={{ fontSize: 12, color: '#475569' }}>
                        Lý do: {req.reason}
                      </div>
                      {req.hrNote && (
                        <div style={{ fontSize: 11, color: '#E31837', backgroundColor: '#FFF5F5', padding: '4px 8px', borderRadius: 4 }}>
                          Phản hồi HCNS: {req.hrNote}
                        </div>
                      )}
                      {((req.attachments && req.attachments.length > 0) || (req.attachmentCount && req.attachmentCount > 0)) && (
                        <div style={{ marginTop: 2 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenAttachments(req)}
                            style={{
                              backgroundColor: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              color: '#1D4ED8',
                              borderRadius: 6,
                              padding: '3px 8px',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <Paperclip size={12} />
                            <span>Minh chứng ({req.attachments?.length || req.attachmentCount || 0})</span>
                          </button>
                        </div>
                      )}
                      {req.status === 'PENDING_HR' && (
                        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                          {(user?.role === 'HR' || user?.role === 'Admin') && (
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = window.confirm('Bạn là HR/Admin, bạn có muốn duyệt đơn này cho chính mình không?');
                                if (!ok) return;
                                try {
                                  await requestsApi.decideRequest(req.requestId, 'APPROVE', 'Tự phê duyệt bởi HR');
                                  addToast('Đã tự phê duyệt đơn thành công!', 'success');
                                  const list = await requestsApi.getMyRequests();
                                  setMyRequests(list);
                                  await loadInitialData();
                                } catch (err: any) {
                                  addToast(err.response?.data?.message || 'Lỗi khi duyệt đơn.', 'error');
                                }
                              }}
                              style={{
                                backgroundColor: '#16A34A',
                                border: 'none',
                                color: '#FFFFFF',
                                fontSize: 12,
                                fontWeight: 700,
                                padding: '4px 10px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              ✓ Tự duyệt đơn (HR)
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditRequest(req)}
                            style={{
                              backgroundColor: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              color: '#0056B3',
                              fontSize: 12,
                              fontWeight: 700,
                              padding: '4px 10px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <Edit3 size={13} />
                            <span>Sửa đơn</span>
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm('Bạn có chắc chắn muốn hủy đơn này?')) {
                                await requestsApi.cancel(req.requestId);
                                addToast('Đã hủy đơn thành công.', 'success');
                                const list = await requestsApi.getMyRequests();
                                setMyRequests(list);
                              }
                            }}
                            style={{
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#E31837',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Hủy đơn
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: 14 }}>
                  Chưa có đơn nào.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: HỒ SƠ & TÀI KHOẢN */}
        {activeTab === 'profile' && (
          <div>
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#0056B3', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>
                  {user?.fullName?.charAt(0) || 'U'}
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1E293B' }}>{user?.fullName}</div>
                  <div style={{ fontSize: 13, color: '#64748B' }}>Mã NV: <strong>{user?.employeeCode || 'Chưa liên kết'}</strong></div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tên đăng nhập</span>
                  <span style={{ fontWeight: 600, color: '#1E293B' }}>{user?.username}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Vai trò hệ thống</span>
                  <span style={{ fontWeight: 600, color: '#0056B3' }}>{user?.role}</span>
                </div>
              </div>
            </div>

            {/* Quản lý thiết bị liên kết (Hỗ trợ nhiều MAC Mobile: Safari, PWA) */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>Thiết bị liên kết</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    Đang truy cập từ: <strong>{isCurrentClientMobile ? (isStandalonePwa() ? '📱 PWA Standalone (Mobile)' : '📱 Trình duyệt Mobile (Safari/Chrome)') : '💻 Máy tính (PC)'}</strong>
                  </div>
                </div>
                {isCurrentClientMobile ? (
                  !hasLocalDeviceSecret ? (
                    <button
                      onClick={() => openRegisterDeviceModal('MOBILE')}
                      style={{
                        backgroundColor: '#16A34A',
                        color: '#FFF',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      📱 Kích hoạt {isStandalonePwa() ? 'PWA' : 'máy này'}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, backgroundColor: '#DCFCE7', padding: '4px 8px', borderRadius: 6 }}>
                        ✓ Máy này đã kích hoạt
                      </span>
                      <button
                        onClick={() => openRegisterDeviceModal('MOBILE')}
                        style={{
                          backgroundColor: '#F1F5F9',
                          color: '#0056B3',
                          border: '1px solid #CBD5E1',
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        + Thêm máy
                      </button>
                    </div>
                  )
                ) : (
                  !myDevices.pc ? (
                    <button
                      onClick={() => openRegisterDeviceModal('PC')}
                      style={{
                        backgroundColor: '#0056B3',
                        color: '#FFF',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0, 86, 179, 0.2)'
                      }}
                    >
                      💻 Đăng ký PC
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, backgroundColor: '#DCFCE7', padding: '4px 8px', borderRadius: 6 }}>
                      ✓ PC đã liên kết
                    </span>
                  )
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Khe Điện thoại (Hỗ trợ nhiều MAC: Safari, PWA...) */}
                <div style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: isCurrentClientMobile ? '#EFF6FF' : '#F8FAFC',
                  border: isCurrentClientMobile ? '1.5px solid #BFDBFE' : '1px solid #E2E8F0',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <Smartphone size={24} color="#0056B3" style={{ margin: '0 auto 6px auto' }} />
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>Điện thoại (Mobile)</div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      {(() => {
                        const mobileList = myDevices.mobileDevices && myDevices.mobileDevices.length > 0
                          ? myDevices.mobileDevices
                          : (myDevices.mobile ? [myDevices.mobile] : []);
                        if (mobileList.length === 0) return 'Chưa đăng ký thiết bị nào';
                        return (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ color: '#16A34A', fontWeight: 700, fontSize: 11, marginBottom: 4 }}>
                              Đã liên kết {mobileList.length} thiết bị (Safari, PWA...)
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 85, overflowY: 'auto' }}>
                              {mobileList.map((m, idx) => (
                                <div key={m.deviceBindingId || idx} style={{ fontSize: 10, color: '#334155', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 4, padding: '3px 4px', textAlign: 'left', lineHeight: 1.2 }} title={`${m.deviceName || 'Mobile'} - MAC: ${m.fingerprintHash || ''}`}>
                                  <div style={{ fontWeight: 600, color: '#0056B3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    📱 {m.deviceName || 'Mobile'}
                                  </div>
                                  <div style={{ color: '#64748B', fontSize: 9 }}>
                                    MAC: {m.fingerprintHash || 'N/A'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {isCurrentClientMobile && !hasLocalDeviceSecret ? (
                      <button
                        onClick={() => openRegisterDeviceModal('MOBILE')}
                        style={{
                          backgroundColor: '#16A34A',
                          color: '#FFF',
                          border: 'none',
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        ⚡ Kích hoạt máy này
                      </button>
                    ) : isCurrentClientMobile ? (
                      <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700 }}>
                        ✓ Máy này sẵn sàng
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#94A3B8' }}>🔒 Đăng ký trên điện thoại</span>
                    )}
                  </div>
                </div>

                {/* Khe Máy tính (PC) */}
                <div style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: !isCurrentClientMobile ? '#EFF6FF' : '#F8FAFC',
                  border: !isCurrentClientMobile ? '1.5px solid #BFDBFE' : '1px solid #E2E8F0',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <Monitor size={24} color="#0056B3" style={{ margin: '0 auto 6px auto' }} />
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>Máy tính (PC)</div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      {myDevices.pc ? (
                        <span style={{ color: myDevices.pc.approvalStatus === 'APPROVED' ? '#16A34A' : '#D97706', fontWeight: 600 }}>
                          {myDevices.pc.deviceName}
                        </span>
                      ) : (
                        'Chưa đăng ký'
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {myDevices.pc ? (
                      <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700 }}>✓ Đã liên kết</span>
                    ) : isCurrentClientMobile ? (
                      <span style={{ fontSize: 10, color: '#64748B', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>
                        🔒 Chỉ xem trạng thái
                      </span>
                    ) : (
                      <button
                        onClick={() => openRegisterDeviceModal('PC')}
                        style={{
                          backgroundColor: '#0056B3',
                          color: '#FFF',
                          border: 'none',
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Đăng ký máy này
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* TIỆN ÍCH ỨNG DỤNG (GOM CHUNG PWA & PUSH NOTIFICATION GỌN ĐẸP) */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: '16px 18px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 16, border: '1px solid #E2E8F0' }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>Tiện ích ứng dụng</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Tối ưu trải nghiệm sử dụng trên thiết bị di động</div>
              </div>

              {/* Mục 1: Cài đặt Màn hình chính */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: '1px solid #F1F5F9',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Download size={18} color="#0056B3" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Màn hình chính (PWA)
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {isStandalone ? 'Đã cài trên điện thoại' : 'Mở nhanh không cần duyệt web'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: isStandalone ? '#DCFCE7' : '#F1F5F9',
                    color: isStandalone ? '#15803D' : '#64748B',
                    whiteSpace: 'nowrap'
                  }}>
                    {isStandalone ? 'Đã cài' : 'Chưa cài'}
                  </span>

                  <button
                    type="button"
                    onClick={handleInstallApp}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      backgroundColor: isStandalone ? '#F1F5F9' : '#0056B3',
                      color: isStandalone ? '#334155' : '#FFFFFF',
                      border: isStandalone ? '1px solid #CBD5E1' : 'none',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isStandalone ? 'Hướng dẫn' : 'Cài đặt'}
                  </button>
                </div>
              </div>

              {/* Mục 2: Thông báo đẩy Mobile */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0 2px 0',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bell size={18} color="#0056B3" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Thông báo đẩy (Push)
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Cảnh báo chấm công & duyệt đơn
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: pushPermission === 'granted' ? '#DCFCE7' : '#FEF3C7',
                    color: pushPermission === 'granted' ? '#15803D' : '#B45309',
                    whiteSpace: 'nowrap'
                  }}>
                    {pushPermission === 'granted' ? 'Đã bật' : 'Chưa bật'}
                  </span>

                  {pushPermission !== 'granted' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const granted = await requestNotificationPermission();
                        setPushPermission(granted ? 'granted' : 'denied');
                        if (granted) {
                          addToast('Đã kích hoạt thông báo đẩy trên thiết bị thành công!', 'success');
                          triggerMobilePushNotification({
                            title: `🎉 ${settings.siteTitle || 'Hệ Thống Chấm Công'}`,
                            body: 'Thông báo đẩy đã được kích hoạt thành công trên thiết bị của bạn.',
                            type: 'success'
                          });
                        } else {
                          addToast('Trình duyệt chưa cho phép thông báo. Vui lòng bật quyền Notification trong cài đặt.', 'warning');
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        backgroundColor: '#0056B3',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Bật ngay
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        triggerMobilePushNotification({
                          title: `⚠️ Kiểm tra ${settings.siteTitle || 'Chấm Công'}`,
                          body: 'Hệ thống đã kết nối thành công với tính năng Push Notification & Rung cảnh báo!',
                          type: 'warning'
                        });
                        addToast('Đã gửi thông báo kiểm tra đến thiết bị của bạn.', 'info');
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        backgroundColor: '#EFF6FF',
                        color: '#0056B3',
                        border: '1px solid #BFDBFE',
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Thử nghiệm
                    </button>
                  )}
                </div>
              </div>

              {/* Mục 3: Định vị vị trí & GPS */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 0 2px 0',
                borderTop: '1px solid #F1F5F9',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    backgroundColor: gpsPermission === 'granted' ? '#EFF6FF' : '#FEF2F2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <MapPin size={18} color={gpsPermission === 'granted' ? '#0056B3' : '#DC2626'} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Định vị vị trí (GPS)
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {gpsPermission === 'granted'
                        ? (currentCoords ? `Chính xác ~${Math.round(currentCoords.accuracy)}m • Sẵn sàng chấm công` : 'Đã cấp quyền • Sẵn sàng chấm công')
                        : (gpsPermission === 'denied' ? 'Bị chặn • Bắt buộc để chấm công' : 'Chưa cấp quyền • Bắt buộc để chấm công')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: gpsPermission === 'granted' ? '#DCFCE7' : (gpsPermission === 'denied' ? '#FEE2E2' : '#FEF3C7'),
                    color: gpsPermission === 'granted' ? '#15803D' : (gpsPermission === 'denied' ? '#B91C1C' : '#B45309'),
                    whiteSpace: 'nowrap'
                  }}>
                    {gpsPermission === 'granted' ? 'Đã bật' : (gpsPermission === 'denied' ? 'Đã chặn' : 'Chưa bật')}
                  </span>

                  <button
                    type="button"
                    onClick={async () => {
                      setCheckingGps(true);
                      try {
                        const coords = await getFastGpsPosition();
                        setCheckingGps(false);
                        addToast(`✅ Đã kết nối vị trí GPS thành công! (Sai số ~${Math.round(coords.accuracy)}m)`, 'success');
                      } catch {
                        setCheckingGps(false);
                        setShowGpsModal(true);
                      }
                    }}
                    disabled={checkingGps}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      backgroundColor: gpsPermission === 'granted' ? '#EFF6FF' : '#0056B3',
                      color: gpsPermission === 'granted' ? '#0056B3' : '#FFFFFF',
                      border: gpsPermission === 'granted' ? '1px solid #BFDBFE' : 'none',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: checkingGps ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                      boxShadow: gpsPermission === 'granted' ? 'none' : '0 2px 6px rgba(0, 86, 179, 0.25)'
                    }}
                  >
                    {checkingGps ? 'Đang định vị...' : (gpsPermission === 'granted' ? 'Kiểm tra GPS' : 'Kích hoạt GPS')}
                  </button>
                </div>
              </div>
            </div>

            {/* BẢO MẬT & TÀI KHOẢN (ĐỔI MẬT KHẨU) */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: '16px 18px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 16, border: '1px solid #E2E8F0' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <KeyRound size={18} color="#475569" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Đổi mật khẩu tài khoản
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Cập nhật mật khẩu định kỳ để bảo đảm an toàn
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(true)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 6,
                    backgroundColor: '#F8FAFC',
                    color: '#1E293B',
                    border: '1px solid #CBD5E1',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}
                >
                  <KeyRound size={14} color="#0056B3" />
                  Đổi mật khẩu
                </button>
              </div>
            </div>

            {/* Thông báo trong ứng dụng */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>Thông báo ({notifications.length})</div>
                {unreadNotiCount > 0 && (
                  <button
                    onClick={async () => {
                      await notificationsApi.markAllAsRead();
                      setUnreadNotiCount(0);
                    }}
                    style={{ background: 'none', border: 'none', color: '#0056B3', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Đọc tất cả
                  </button>
                )}
              </div>

              {notifications.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notifications.map((n) => {
                    const linkType = (n.linkType || '').toUpperCase();
                    const title = (n.title || '').toLowerCase();
                    const body = (n.body || '').toLowerCase();
                    const isHrOrAdmin = user?.role === 'Admin' || user?.role === 'HR';
                    const targetLabel = isHrOrAdmin && (linkType === 'LEAVE' || linkType === 'REGULARIZATION' || linkType === 'REQUEST' || title.includes('nghỉ phép') || title.includes('đơn') || title.includes('giải trình'))
                      ? 'Quản lý nghỉ phép'
                      : linkType === 'TIMESHEET' || linkType === 'DISPUTE' || title.includes('bảng chấm công') || title.includes('kỳ công')
                      ? 'Bảng chấm công'
                      : 'Đơn từ của tôi';

                    return (
                      <div
                        key={n.notificationId}
                        onClick={async () => {
                          if (!n.isRead) {
                            await notificationsApi.markAsRead(n.notificationId);
                            setNotifications(prev => prev.map(x => x.notificationId === n.notificationId ? { ...x, isRead: true } : x));
                            setUnreadNotiCount(prev => Math.max(0, prev - 1));
                          }

                          // Tự động chuyển hội sở làm việc nếu thông báo thuộc cơ sở khác
                          if (n.companyId && selectedCompany && selectedCompany.id !== n.companyId) {
                            const targetComp = companies.find(c => c.id === n.companyId || (n.companyCode && c.code.toLowerCase() === n.companyCode.toLowerCase()));
                            if (targetComp && setSelectedCompany) {
                              setSelectedCompany(targetComp);
                              addToast(`Đã tự động chuyển sang cơ sở ${targetComp.name} (${targetComp.code}) để xem nội dung.`, 'info');
                            }
                          } else if (!n.companyId && n.companyCode && selectedCompany && selectedCompany.code.toLowerCase() !== n.companyCode.toLowerCase()) {
                            const targetComp = companies.find(c => c.code.toLowerCase() === n.companyCode!.toLowerCase());
                            if (targetComp && setSelectedCompany) {
                              setSelectedCompany(targetComp);
                              addToast(`Đã tự động chuyển sang cơ sở ${targetComp.name} (${targetComp.code}) để xem nội dung.`, 'info');
                            }
                          }

                          if (isHrOrAdmin && onNavigate) {
                            if (linkType === 'REGULARIZATION' || title.includes('giải trình')) {
                              onNavigate('admin-regularization');
                              return;
                            }
                            if (linkType === 'LEAVE' || linkType === 'REQUEST' || title.includes('nghỉ phép') || title.includes('đơn')) {
                              onNavigate('admin-leave');
                              return;
                            }
                          }

                          if (linkType === 'TIMESHEET' || linkType === 'DISPUTE' || title.includes('bảng chấm công') || title.includes('kỳ công')) {
                            if (n.linkId) setSelectedPeriodFromNoti(n.linkId);
                            setActiveTab('attendance');
                          } else if (linkType === 'DEVICE' || title.includes('thiết bị') || title.includes('mac')) {
                            setActiveTab('profile');
                          } else {
                            setActiveTab('requests');
                          }
                        }}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          backgroundColor: n.isRead ? '#F8FAFC' : '#EFF6FF',
                          border: `1px solid ${n.isRead ? '#E2E8F0' : '#BFDBFE'}`,
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span>{n.title}</span>
                          {!n.isRead && (
                            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#2563EB', flexShrink: 0 }} />
                          )}
                        </div>
                        {(n.companyName || n.branchCode || n.companyCode) && (
                          <div style={{ marginTop: 3 }}>
                            <span style={{
                              display: 'inline-block',
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              color: (!n.companyId || (selectedCompany && n.companyId === selectedCompany.id)) ? '#15803D' : '#B45309',
                              backgroundColor: (!n.companyId || (selectedCompany && n.companyId === selectedCompany.id)) ? '#DCFCE7' : '#FEF3C7'
                            }}>
                              🏢 {n.companyName ? `${n.companyCode ? n.companyCode + ' - ' : ''}${n.companyName}` : (n.branchCode || n.companyCode)}
                            </span>
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>{n.body}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: 10 }}>
                          <span style={{ color: '#94A3B8' }}>{n.timeLocal}</span>
                          <span style={{ color: '#0056B3', fontWeight: 700, backgroundColor: '#E0F2FE', padding: '2px 6px', borderRadius: 4 }}>
                            {targetLabel} →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>Không có thông báo mới.</div>
              )}
            </div>

            {/* Đăng xuất */}
            <button
              onClick={logout}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 12,
                backgroundColor: '#FEE2E2',
                color: '#DC2626',
                border: 'none',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              Đăng xuất
            </button>
          </div>
        )}
      </main>

      {/* THANH ĐIỀU HƯỚNG ĐÁY (4 TABS CHO MOBILE & DESKTOP) */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid #E2E8F0',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        height: 64,
        zIndex: 40,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
      }}>
        <button
          onClick={() => setActiveTab('home')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'home' ? '#0056B3' : '#64748B',
            cursor: 'pointer',
            fontWeight: activeTab === 'home' ? 700 : 500
          }}
        >
          <Clock size={20} />
          <span style={{ fontSize: 11, marginTop: 4 }}>Trang chủ</span>
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'attendance' ? '#0056B3' : '#64748B',
            cursor: 'pointer',
            fontWeight: activeTab === 'attendance' ? 700 : 500
          }}
        >
          <Calendar size={20} />
          <span style={{ fontSize: 11, marginTop: 4 }}>Chấm công</span>
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'requests' ? '#0056B3' : '#64748B',
            cursor: 'pointer',
            fontWeight: activeTab === 'requests' ? 700 : 500
          }}
        >
          <FileText size={20} />
          <span style={{ fontSize: 11, marginTop: 4 }}>Đơn từ</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'profile' ? '#0056B3' : '#64748B',
            cursor: 'pointer',
            fontWeight: activeTab === 'profile' ? 700 : 500
          }}
        >
          <User size={20} />
          <span style={{ fontSize: 11, marginTop: 4 }}>Tài khoản</span>
        </button>
      </nav>

      {/* MODAL: ĐĂNG KÝ THIẾT BỊ */}
      {showRegisterModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 16
        }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#1E293B' }}>Đăng Ký Thiết Bị Chấm Công</div>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowRegisterModal(false)} />
            </div>

            {/* Banner tự động nhận diện thiết bị */}
            <div style={{
              backgroundColor: isCurrentClientMobile ? '#EFF6FF' : '#F0FDF4',
              border: `1px solid ${isCurrentClientMobile ? '#BFDBFE' : '#BBF7D0'}`,
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              color: isCurrentClientMobile ? '#1E40AF' : '#166534',
              marginBottom: 14,
              lineHeight: 1.4
            }}>
              {isCurrentClientMobile ? (
                <div>
                  📱 <strong>Đang truy cập trên Điện thoại (Mobile):</strong> Hệ thống tự động nhận diện phần cứng và <strong>hỗ trợ đăng ký nhiều địa chỉ MAC trên Mobile</strong> (Safari, PWA, máy phụ...). Mỗi thiết bị sẽ được cấp mã định danh bảo mật riêng để chấm công.
                </div>
              ) : (
                <div>
                  💻 <strong>Đang truy cập trên Máy tính (PC):</strong> Hệ thống tự động nhận diện phần cứng và <strong>chỉ cho phép đăng ký khe PC</strong>. Đã khóa đăng ký khe Mobile để tránh gán nhầm thiết bị.
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Loại thiết bị đăng ký</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  type="button"
                  disabled={!isCurrentClientMobile}
                  onClick={() => {
                    if (isCurrentClientMobile) {
                      setRegisteringDeviceType('MOBILE');
                      setDeviceNameInput(`Mobile - ${user?.fullName || 'Nhân viên'}`);
                    }
                  }}
                  title={!isCurrentClientMobile ? 'Đã khóa trên PC. Vui lòng mở điện thoại để đăng ký.' : ''}
                  style={{
                    padding: '10px',
                    borderRadius: 8,
                    border: registeringDeviceType === 'MOBILE' ? '2px solid #0056B3' : '1px solid #CBD5E1',
                    backgroundColor: registeringDeviceType === 'MOBILE' ? '#EFF6FF' : '#FFF',
                    fontWeight: 700,
                    cursor: !isCurrentClientMobile ? 'not-allowed' : 'pointer',
                    opacity: !isCurrentClientMobile ? 0.45 : 1
                  }}
                >
                  📱 Mobile {!isCurrentClientMobile && '(Khóa)'}
                </button>
                <button
                  type="button"
                  disabled={isCurrentClientMobile}
                  onClick={() => {
                    if (!isCurrentClientMobile) {
                      setRegisteringDeviceType('PC');
                      setDeviceNameInput(`PC - ${user?.fullName || 'Nhân viên'}`);
                    }
                  }}
                  title={isCurrentClientMobile ? 'Đã khóa trên Điện thoại. Chỉ hiển thị trạng thái, cần đăng ký trên PC.' : ''}
                  style={{
                    padding: '10px',
                    borderRadius: 8,
                    border: registeringDeviceType === 'PC' ? '2px solid #0056B3' : '1px solid #CBD5E1',
                    backgroundColor: registeringDeviceType === 'PC' ? '#EFF6FF' : '#FFF',
                    fontWeight: 700,
                    cursor: isCurrentClientMobile ? 'not-allowed' : 'pointer',
                    opacity: isCurrentClientMobile ? 0.45 : 1
                  }}
                >
                  💻 Máy tính (PC) {isCurrentClientMobile && '(Khóa)'}
                </button>
              </div>
            </div>

            {/* Thông tin phần cứng & tên thiết bị tự động */}
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 10,
              padding: '12px 14px',
              border: '1px solid #E2E8F0',
              marginBottom: 16,
              fontSize: 13
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Tên thiết bị tự động:</span>
                <strong style={{ color: '#0056B3' }}>{deviceNameInput || (registeringDeviceType === 'PC' ? `PC - ${user?.fullName || 'Nhân viên'}` : `Mobile - ${user?.fullName || 'Nhân viên'}`)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#64748B' }}>Mã nhận diện (MAC):</span>
                <code style={{ fontWeight: 700, color: '#0F172A', backgroundColor: '#E2E8F0', padding: '2px 6px', borderRadius: 4 }}>
                  {getOrGenerateMacAddress()}
                </code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Nhân viên sở hữu:</span>
                <strong style={{ color: '#1E293B' }}>{user?.fullName || 'Nhân viên'} ({user?.employeeCode || user?.username})</strong>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>
                Tên gợi nhớ thiết bị (Đã tự động điền, không cần gõ):
              </label>
              <input
                type="text"
                placeholder={registeringDeviceType === 'PC' ? `PC - ${user?.fullName || 'Nhân viên'}` : `Mobile - ${user?.fullName || 'Nhân viên'}`}
                value={deviceNameInput}
                onChange={e => setDeviceNameInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  fontSize: 13,
                  backgroundColor: '#FFFFFF',
                  color: '#1E293B'
                }}
              />
            </div>

            <button
              onClick={handleRegisterDevice}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                backgroundColor: '#0056B3',
                color: '#FFF',
                border: 'none',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0, 86, 179, 0.25)'
              }}
            >
              ✓ Xác nhận Đăng ký thiết bị
            </button>
          </div>
        </div>
      )}

      {/* MODAL: ĐĂNG KÝ LỊCH LÀM VIỆC (GIAO DIỆN DI ĐỘNG TIỆN LỢI & DỄ THAO TÁC) */}
      {showScheduleModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: isMobile ? '12px' : '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: isMobile ? 20 : 16,
            padding: isMobile ? '18px 16px' : '22px 24px',
            width: '100%',
            maxWidth: isMobile ? 480 : (desktopScheduleMode === 'CALENDAR' ? 960 : 540),
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#EFF6FF',
                  color: '#0056B3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Đăng Ký Lịch Làm Việc
                  </h3>
                  <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>
                    {myEmployeeInfo?.employeeType === 'REMOTE' ? 'Nhân sự Remote (Tại nhà)' : myEmployeeInfo?.employeeType === 'PARTTIME' ? 'Nhân sự Part-time' : 'Nhân sự Superbrain'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {!isMobile && (
                  <button
                    type="button"
                    onClick={() => setDesktopScheduleMode(m => m === 'QUICK' ? 'CALENDAR' : 'QUICK')}
                    style={{
                      background: '#F1F5F9',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    {desktopScheduleMode === 'CALENDAR' ? 'Giao diện nhanh' : 'Xem dạng Lịch tháng'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduleModal(false);
                    loadSchedules();
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: '#F1F5F9',
                    color: '#64748B',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Đóng"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* If desktop and CALENDAR mode, show full EmployeeScheduleView */}
            {!isMobile && desktopScheduleMode === 'CALENDAR' ? (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <EmployeeScheduleView onBack={() => {
                  setShowScheduleModal(false);
                  loadSchedules();
                }} />
              </div>
            ) : (
              <>
                {/* Segmented Control Tabs */}
                <div style={{
                  display: 'flex',
                  backgroundColor: '#F1F5F9',
                  padding: 4,
                  borderRadius: 12,
                  marginBottom: 14,
                  flexShrink: 0
                }}>
                  <button
                    type="button"
                    onClick={() => setMobileScheduleTab('REGISTER')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 9,
                      border: 'none',
                      backgroundColor: mobileScheduleTab === 'REGISTER' ? '#FFFFFF' : 'transparent',
                      color: mobileScheduleTab === 'REGISTER' ? '#0056B3' : '#64748B',
                      fontWeight: mobileScheduleTab === 'REGISTER' ? 700 : 500,
                      fontSize: 13,
                      boxShadow: mobileScheduleTab === 'REGISTER' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    📝 Đăng ký ca làm
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileScheduleTab('LIST')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 9,
                      border: 'none',
                      backgroundColor: mobileScheduleTab === 'LIST' ? '#FFFFFF' : 'transparent',
                      color: mobileScheduleTab === 'LIST' ? '#0056B3' : '#64748B',
                      fontWeight: mobileScheduleTab === 'LIST' ? 700 : 500,
                      fontSize: 13,
                      boxShadow: mobileScheduleTab === 'LIST' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    📋 Lịch đã đăng ký ({mySchedules.length})
                  </button>
                </div>

                {/* Modal Tab Body */}
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
                  {mobileScheduleTab === 'REGISTER' ? (
                    <form onSubmit={handleRegisterSchedule} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {/* Chọn ngày làm việc */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>
                          1. Chọn ngày làm việc <span style={{ color: '#EF4444' }}>*</span>
                        </label>

                        {/* Quick date chips */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                          {[
                            { label: 'Hôm nay', offset: 0 },
                            { label: 'Ngày mai', offset: 1 },
                            { label: 'Ngày kia', offset: 2 }
                          ].map((chip) => {
                            const dateVal = getQuickScheduleDate(chip.offset);
                            const isSelected = scheduleWorkDate === dateVal;
                            return (
                              <button
                                key={chip.label}
                                type="button"
                                onClick={() => setScheduleWorkDate(dateVal)}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  border: isSelected ? '1.5px solid #0056B3' : '1px solid #CBD5E1',
                                  backgroundColor: isSelected ? '#EFF6FF' : '#F8FAFC',
                                  color: isSelected ? '#0056B3' : '#475569',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {chip.label} ({dateVal.slice(5).replace('-', '/')})
                              </button>
                            );
                          })}
                        </div>

                        <input
                          type="date"
                          min={getQuickScheduleDate(0)}
                          value={scheduleWorkDate}
                          onChange={(e) => setScheduleWorkDate(e.target.value)}
                          required
                          style={{
                            width: '100%',
                            padding: '11px 13px',
                            borderRadius: 10,
                            border: '1.5px solid #CBD5E1',
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#0F172A',
                            backgroundColor: '#F8FAFC',
                            boxSizing: 'border-box'
                          }}
                        />
                        <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>
                          {formatScheduleVnDate(scheduleWorkDate)}
                        </div>
                      </div>

                      {/* Chọn ca làm việc */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>
                          2. Chọn ca làm việc <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {[
                            { id: 'FULL', label: 'Cả ngày', hours: '08:00 - 17:30 (8 tiếng)', icon: '🏢' },
                            { id: 'MORNING', label: 'Ca sáng', hours: '08:00 - 12:00 (4 tiếng)', icon: '☀️' },
                            { id: 'AFTERNOON', label: 'Ca chiều', hours: '13:30 - 17:30 (4 tiếng)', icon: '⛅' }
                          ].map((shift) => {
                            const isSelected = scheduleShift === shift.id;
                            return (
                              <div
                                key={shift.id}
                                onClick={() => setScheduleShift(shift.id as any)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '11px 14px',
                                  borderRadius: 12,
                                  border: isSelected ? '2px solid #0056B3' : '1px solid #E2E8F0',
                                  backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontSize: 20 }}>{shift.icon}</span>
                                  <div>
                                    <div style={{ fontSize: 13.5, fontWeight: 700, color: isSelected ? '#0056B3' : '#1E293B' }}>
                                      {shift.label}
                                    </div>
                                    <div style={{ fontSize: 11.5, color: '#64748B' }}>
                                      {shift.hours}
                                    </div>
                                  </div>
                                </div>
                                <div style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: '50%',
                                  border: isSelected ? '6px solid #0056B3' : '2px solid #CBD5E1',
                                  backgroundColor: '#FFF'
                                }} />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Ghi chú */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>
                          3. Ghi chú công việc (không bắt buộc)
                        </label>
                        <input
                          type="text"
                          placeholder="VD: Làm tại nhà, Hỗ trợ sự kiện cơ sở..."
                          value={scheduleNote}
                          onChange={(e) => setScheduleNote(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '11px 13px',
                            borderRadius: 10,
                            border: '1.5px solid #CBD5E1',
                            fontSize: 13.5,
                            backgroundColor: '#F8FAFC',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Lưu ý nghiệp vụ */}
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        backgroundColor: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        fontSize: 11.5,
                        color: '#166534',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 6
                      }}>
                        <Sparkles size={15} style={{ flexShrink: 0, marginTop: 1, color: '#16A34A' }} />
                        <span>Đăng ký trước lịch làm việc giúp hệ thống đối soát chấm công hợp lệ đúng ca và tính đủ công lương.</span>
                      </div>

                      {/* Nút gửi */}
                      <button
                        type="submit"
                        disabled={savingSchedule}
                        style={{
                          width: '100%',
                          padding: '13px',
                          borderRadius: 12,
                          border: 'none',
                          backgroundColor: '#0056B3',
                          color: '#FFFFFF',
                          fontSize: 14.5,
                          fontWeight: 700,
                          cursor: savingSchedule ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          boxShadow: '0 4px 12px rgba(0, 86, 179, 0.25)',
                          marginTop: 4
                        }}
                      >
                        {savingSchedule ? (
                          <>
                            <RefreshCw size={16} className="spin" />
                            <span>Đang gửi đăng ký...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={17} />
                            <span>Xác Nhận Đăng Ký Lịch Làm</span>
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    /* TAB: DANH SÁCH LỊCH ĐÃ ĐĂNG KÝ */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {mySchedules.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748B' }}>
                          <Calendar size={38} color="#CBD5E1" style={{ margin: '0 auto 10px' }} />
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>
                            Chưa có lịch làm việc nào
                          </div>
                          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, marginBottom: 14 }}>
                            Bạn chưa đăng ký lịch làm việc nào trong hệ thống.
                          </div>
                          <button
                            type="button"
                            onClick={() => setMobileScheduleTab('REGISTER')}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 10,
                              border: 'none',
                              backgroundColor: '#0056B3',
                              color: '#FFF',
                              fontSize: 12.5,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            + Đăng ký ngay
                          </button>
                        </div>
                      ) : (
                        [...mySchedules]
                          .sort((a, b) => a.workDate.localeCompare(b.workDate))
                          .map((s) => {
                            const todayStr = getQuickScheduleDate(0);
                            const isToday = s.workDate.split('T')[0] === todayStr;
                            const isPast = s.workDate.split('T')[0] < todayStr;
                            const shiftInfo = s.shiftCode === 'MORNING'
                              ? { label: 'Ca sáng (4h)', bg: '#FEF3C7', color: '#B45309' }
                              : s.shiftCode === 'AFTERNOON'
                              ? { label: 'Ca chiều (4h)', bg: '#F3E8FF', color: '#7E22CE' }
                              : { label: 'Cả ngày (8h)', bg: '#EFF6FF', color: '#1D4ED8' };

                            return (
                              <div
                                key={s.scheduleId || s.id}
                                style={{
                                  backgroundColor: '#FFFFFF',
                                  border: isToday ? '1.5px solid #0056B3' : '1px solid #E2E8F0',
                                  borderRadius: 12,
                                  padding: '12px 14px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10
                                }}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                                      {formatScheduleVnDate(s.workDate)}
                                    </span>
                                    {isToday && (
                                      <span style={{ fontSize: 10.5, fontWeight: 700, backgroundColor: '#DCFCE7', color: '#166534', padding: '1px 6px', borderRadius: 4 }}>
                                        Hôm nay
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      backgroundColor: shiftInfo.bg,
                                      color: shiftInfo.color,
                                      padding: '2px 8px',
                                      borderRadius: 6
                                    }}>
                                      {shiftInfo.label}
                                    </span>
                                    <span style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      backgroundColor: s.status === 'APPROVED' ? '#DEF7EC' : '#F1F5F9',
                                      color: s.status === 'APPROVED' ? '#03543F' : '#475569',
                                      padding: '2px 8px',
                                      borderRadius: 6
                                    }}>
                                      {s.status === 'APPROVED' ? 'Đã duyệt' : 'Đã đăng ký'}
                                    </span>
                                  </div>
                                  {s.note && (
                                    <div style={{ fontSize: 11.5, color: '#64748B', fontStyle: 'italic' }}>
                                      Ghi chú: {s.note}
                                    </div>
                                  )}
                                </div>

                                {!isPast && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelSchedule(s.scheduleId || s.id || 0)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      padding: '6px 10px',
                                      borderRadius: 8,
                                      border: '1px solid #FECACA',
                                      backgroundColor: '#FEF2F2',
                                      color: '#DC2626',
                                      fontSize: 11.5,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      flexShrink: 0
                                    }}
                                    title="Hủy lịch làm này"
                                  >
                                    <Trash2 size={13} />
                                    <span>Hủy</span>
                                  </button>
                                )}
                              </div>
                            );
                          })
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: TẠO ĐƠN NGHỈ PHÉP */}
      {showLeaveModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 16
        }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#1E293B' }}>Tạo Đơn Nghỉ Phép</div>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowLeaveModal(false)} />
            </div>

            <form onSubmit={handleSubmitLeave}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Loại nghỉ phép</label>
                <select
                  value={leaveCode}
                  onChange={e => setLeaveCode(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                >
                  <option value="P">P — Nghỉ phép năm (hưởng lương)</option>
                  <option value="P/2">P/2 — Nghỉ phép nửa ngày (0.5)</option>
                  <option value="KL">KL — Nghỉ không hưởng lương (hết phép năm / việc riêng)</option>
                  <option value="B">B — Nghỉ bù sự kiện</option>
                  <option value="Ro">Ro — Nghỉ chế độ / luật lao động</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Từ ngày</label>
                  <DateInput
                    value={leaveFromDate}
                    onChange={val => setLeaveFromDate(val)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Đến ngày</label>
                  <DateInput
                    value={leaveToDate}
                    onChange={val => setLeaveToDate(val)}
                  />
                </div>
              </div>

              {(leaveCode === 'P/2' || leaveCode === '1/2P') && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Buổi nghỉ</label>
                  <select
                    value={leaveDayPart}
                    onChange={e => setLeaveDayPart(e.target.value as any)}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  >
                    <option value="MORNING">Buổi Sáng</option>
                    <option value="AFTERNOON">Buổi Chiều</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Lý do nghỉ</label>
                <textarea
                  rows={3}
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  placeholder="Nhập lý do cụ thể..."
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Ảnh minh chứng (tùy chọn / tự động đổi sang định dạng WebP)
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={e => setLeaveFiles(Array.from(e.target.files || []))}
                  style={{ width: '100%', fontSize: 12 }}
                />
                {leaveFiles.length > 0 && (
                  <div style={{ fontSize: 12, color: '#0284c7', marginTop: 4, fontWeight: 600 }}>
                    ✓ Đã chọn {leaveFiles.length} ảnh (sẽ tối ưu sang WebP khi lưu)
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submittingLeave}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 8,
                  backgroundColor: submittingLeave ? '#94A3B8' : '#0056B3',
                  color: '#FFF',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: submittingLeave ? 'not-allowed' : 'pointer'
                }}
              >
                {submittingLeave ? 'Đang nén WebP & Gửi đơn...' : 'Gửi Đơn Xin Nghỉ'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TẠO GIẢI TRÌNH CHẤM CÔNG */}
      {showRegulModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 16
        }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#1E293B' }}>Giải Trình Chấm Công</div>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowRegulModal(false)} />
            </div>

            <form onSubmit={handleSubmitRegularization}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Ngày cần giải trình</label>
                <DateInput
                  value={regulDate}
                  onChange={val => setRegulDate(val)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Giờ vào thực tế</label>
                  <input
                    type="time"
                    value={regulInTime}
                    onChange={e => setRegulInTime(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Giờ ra thực tế</label>
                  <input
                    type="time"
                    value={regulOutTime}
                    onChange={e => setRegulOutTime(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Lý do giải trình</label>
                <select
                  value={regulReasonCode}
                  onChange={e => setRegulReasonCode(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #CBD5E1', marginBottom: 8 }}
                >
                  <option value="Quên bấm">Quên bấm máy / ứng dụng</option>
                  <option value="Lỗi mạng/thiết bị">Lỗi kết nối mạng / điện thoại hết pin</option>
                  <option value="Công tác ngoài">Đi công tác ngoài văn phòng</option>
                  <option value="Họp khách hàng">Họp khách hàng / đối tác</option>
                  <option value="Khác">Lý do khác</option>
                </select>
                <textarea
                  rows={2}
                  value={regulReason}
                  onChange={e => setRegulReason(e.target.value)}
                  placeholder="Giải trình chi tiết..."
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Minh chứng (hình ảnh xác nhận / tự động đổi WebP)
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={e => setRegulFiles(Array.from(e.target.files || []))}
                  style={{ width: '100%', fontSize: 12 }}
                />
                {regulFiles.length > 0 && (
                  <div style={{ fontSize: 12, color: '#0284c7', marginTop: 4, fontWeight: 600 }}>
                    ✓ Đã chọn {regulFiles.length} ảnh (sẽ tối ưu sang WebP khi lưu)
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submittingRegul}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 8,
                  backgroundColor: submittingRegul ? '#94A3B8' : '#FFC72C',
                  color: '#1E293B',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: submittingRegul ? 'not-allowed' : 'pointer'
                }}
              >
                {submittingRegul ? 'Đang nén WebP & Gửi...' : 'Gửi Giải Trình'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: KHIẾU NẠI BẢNG CÔNG */}
      {showDisputeModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 16
        }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#1E293B' }}>Gửi Khiếu Nại Bảng Công</div>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowDisputeModal(false)} />
            </div>

            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>
              Bạn có quyền gửi khiếu nại trong vòng 3 ngày sau khi HCNS công bố bảng công chính thức.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Nội dung khiếu nại</label>
              <textarea
                rows={4}
                value={disputeContent}
                onChange={e => setDisputeContent(e.target.value)}
                placeholder="Nêu rõ ngày và số liệu bạn thấy chưa chính xác..."
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
              />
            </div>

            <button
              onClick={handleSubmitDispute}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                backgroundColor: '#E31837',
                color: '#FFF',
                border: 'none',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              Gửi Khiếu Nại
            </button>
          </div>
        </div>
      )}

      {/* MODAL: HƯỚNG DẪN CÀI ĐẶT LÊN MÀN HÌNH CHÍNH (PWA MOBILE) */}
      {showInstallGuideModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: 16
        }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Download size={20} color="#0056B3" />
                <span>Cài Đặt Lên Màn Hình Chính</span>
              </div>
              <X size={20} style={{ cursor: 'pointer', color: '#64748B' }} onClick={() => setShowInstallGuideModal(false)} />
            </div>

            <div style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.5 }}>
              Cài đặt ứng dụng Superbrain Chấm Công để mở nhanh trực tiếp từ màn hình điện thoại mà không cần gõ địa chỉ web.
            </div>

            {/* Tab hướng dẫn theo hệ điều hành */}
            <div style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, border: '1px solid #E2E8F0', marginBottom: 20 }}>
              {isIos ? (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0056B3', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🍏 Hướng dẫn dành cho iPhone / iPad (Safari):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#334155' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ backgroundColor: '#0056B3', color: '#FFF', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</span>
                      <span>Nhấn vào nút <strong>Chia sẻ (Share)</strong> 📤 ở thanh công cụ dưới cùng của trình duyệt Safari.</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ backgroundColor: '#0056B3', color: '#FFF', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</span>
                      <span>Cuộn xuống danh sách tùy chọn và chọn <strong>"Thêm vào MH chính"</strong> (Add to Home Screen ➕).</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ backgroundColor: '#0056B3', color: '#FFF', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>3</span>
                      <span>Nhấn nút <strong>"Thêm" (Add)</strong> ở góc trên bên phải để hoàn tất. Biểu tượng ứng dụng sẽ xuất hiện trên màn hình chính!</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0056B3', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🤖 Hướng dẫn dành cho Android (Google Chrome):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#334155' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ backgroundColor: '#0056B3', color: '#FFF', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</span>
                      <span>Nhấn vào biểu tượng <strong>Menu 3 chấm (⋮)</strong> ở góc trên bên phải màn hình.</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ backgroundColor: '#0056B3', color: '#FFF', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</span>
                      <span>Chọn mục <strong>"Cài đặt ứng dụng"</strong> (hoặc <strong>"Thêm vào Màn hình chính"</strong>).</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ backgroundColor: '#0056B3', color: '#FFF', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>3</span>
                      <span>Nhấn xác nhận <strong>"Cài đặt"</strong>. Biểu tượng ứng dụng sẽ được ghim vào màn hình điện thoại của bạn.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowInstallGuideModal(false)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                backgroundColor: '#0056B3',
                color: '#FFF',
                border: 'none',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              Đã hiểu, đóng hướng dẫn
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CHỈNH SỬA ĐƠN (ĐANG CHỜ DUYỆT)                          */}
      {/* ============================================================== */}
      {editingRequest && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '520px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '16px', color: '#0F172A' }}>
                  Chỉnh Sửa Đơn #{editingRequest.requestId}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  {editingRequest.requestType === 'LEAVE' ? 'Đơn xin nghỉ phép' : 'Đơn giải trình chấm công'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRequest(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEditRequest}>
              {editRequestType === 'LEAVE' ? (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                      Loại nghỉ phép
                    </label>
                    <select
                      value={editLeaveCode}
                      onChange={(e) => setEditLeaveCode(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                    >
                      <option value="P">P - Nghỉ phép năm (hưởng 100% lương)</option>
                      <option value="1/2P">P/2 - Nghỉ nửa ngày phép năm (hưởng 50% lương)</option>
                      <option value="KL">KL - Nghỉ không hưởng lương (hết phép năm / việc riêng)</option>
                      <option value="KP">KP - Nghỉ không lương</option>
                      <option value="CD">CD - Nghỉ chế độ (thai sản / cưới / tang...)</option>
                      <option value="BL">BL - Nghỉ bù Lễ Tết / Sự kiện</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                        Từ ngày
                      </label>
                      <DateInput
                        value={editFromDate}
                        onChange={(val) => setEditFromDate(val)}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                        Đến ngày
                      </label>
                      <DateInput
                        value={editToDate}
                        onChange={(val) => setEditToDate(val)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                      Buổi nghỉ
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      {(['FULL', 'MORNING', 'AFTERNOON'] as const).map((part) => (
                        <button
                          key={part}
                          type="button"
                          onClick={() => setEditDayPart(part)}
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            border: editDayPart === part ? '2px solid #0056B3' : '1px solid #CBD5E1',
                            backgroundColor: editDayPart === part ? '#EFF6FF' : '#FFFFFF',
                            color: editDayPart === part ? '#0056B3' : '#475569',
                            fontWeight: editDayPart === part ? 700 : 500,
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          {part === 'FULL' ? 'Cả ngày (1.0)' : part === 'MORNING' ? 'Sáng (0.5)' : 'Chiều (0.5)'}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                      Ngày giải trình
                    </label>
                    <DateInput
                      value={editFromDate}
                      onChange={(val) => setEditFromDate(val)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                        Giờ vào thực tế
                      </label>
                      <input
                        type="time"
                        value={editInTime}
                        onChange={(e) => setEditInTime(e.target.value)}
                        required
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                        Giờ ra thực tế
                      </label>
                      <input
                        type="time"
                        value={editOutTime}
                        onChange={(e) => setEditOutTime(e.target.value)}
                        required
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                      Lý do giải trình
                    </label>
                    <select
                      value={editReasonCode}
                      onChange={(e) => setEditReasonCode(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                    >
                      <option value="Quên bấm">Quên bấm chấm công</option>
                      <option value="Công tác ngoài">Đi công tác ngoài văn phòng</option>
                      <option value="Sự cố kỹ thuật">Sự cố máy tính / mất điện / mất mạng</option>
                      <option value="Lý do khác">Lý do khác</option>
                    </select>
                  </div>
                </>
              )}

              {/* DANH SÁCH TỆP MINH CHỨNG ĐÃ CÓ */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Tệp minh chứng hiện tại ({editingRequest.attachments?.length || 0})
                </label>
                {editingRequest.attachments && editingRequest.attachments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                    {editingRequest.attachments.map((att) => (
                      <div
                        key={att.attachmentId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                          <Paperclip size={13} color="#0056B3" />
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                            {att.originalFileName}
                          </span>
                          <span style={{ color: '#94A3B8', fontSize: '11px' }}>
                            ({Math.round(att.fileSizeBytes / 1024)} KB)
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setPreviewAttachmentId(att.attachmentId)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0056B3', padding: '2px' }}
                            title="Xem ảnh"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExistingAttachment(att.attachmentId)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '2px' }}
                            title="Xóa tệp này"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', marginBottom: '8px' }}>
                    Chưa có tệp minh chứng đính kèm.
                  </div>
                )}

                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Tải thêm ảnh minh chứng mới:
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setEditNewFiles(Array.from(e.target.files || []))}
                  style={{ width: '100%', fontSize: '12px' }}
                />
                {editNewFiles.length > 0 && (
                  <div style={{ fontSize: '12px', color: '#0284C7', marginTop: '4px', fontWeight: 600 }}>
                    ✓ Sẽ tải thêm {editNewFiles.length} ảnh mới (tự động nén WebP)
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Lý do chi tiết
                </label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  rows={3}
                  required
                  placeholder="Ghi rõ lý do cần điều chỉnh..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingRequest(null)}
                  style={{ backgroundColor: '#F1F5F9', color: '#475569', border: 'none', padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  style={{
                    backgroundColor: submittingEdit ? '#94A3B8' : '#0056B3',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '9px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: submittingEdit ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submittingEdit ? 'Đang lưu...' : 'Lưu Cập Nhật'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: XEM TỆP MINH CHỨNG CỦA ĐƠN                              */}
      {/* ============================================================== */}
      {viewingAttachmentReq && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '85vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '16px', color: '#0F172A' }}>
                  Tệp Minh Chứng Đơn #{viewingAttachmentReq.requestId}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  {viewingAttachmentReq.requestType === 'LEAVE' ? 'Đơn nghỉ phép' : 'Đơn giải trình chấm công'} — {viewingAttachmentReq.fromDate}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingAttachmentReq(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            {viewingAttachmentReq.attachments && viewingAttachmentReq.attachments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {viewingAttachmentReq.attachments.map((att) => {
                  const downloadUrl = requestsApi.getAttachmentUrl(att.attachmentId, true);
                  const isImage = att.mimeType.startsWith('image/');
                  const isWebp = att.mimeType === 'image/webp' || att.originalFileName.toLowerCase().endsWith('.webp');

                  return (
                    <div
                      key={att.attachmentId}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <Paperclip size={16} color="#0056B3" />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                              {att.originalFileName}
                            </span>
                            {isWebp && (
                              <span style={{
                                backgroundColor: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #a7f3d0',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700
                              }}>
                                WebP
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {Math.round(att.fileSizeBytes / 1024)} KB
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isImage && (
                          <button
                            type="button"
                            onClick={() => setPreviewAttachmentId(att.attachmentId)}
                            style={{
                              backgroundColor: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              color: '#1D4ED8',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
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
                          style={{
                            backgroundColor: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            color: '#334155',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none'
                          }}
                        >
                          Tải về
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 16px', color: '#94A3B8', fontSize: '13px', fontStyle: 'italic' }}>
                Không có tệp minh chứng đính kèm cho đơn này.
              </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setViewingAttachmentReq(null)}
                style={{ backgroundColor: '#F1F5F9', color: '#475569', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: XEM PHÓNG TO ẢNH MINH CHỨNG                             */}
      {/* ============================================================== */}
      {previewAttachmentId && (
        <div
          onClick={() => setPreviewAttachmentId(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            cursor: 'zoom-out'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
            }}
          >
            <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Minh chứng đính kèm</span>
              <button
                type="button"
                onClick={() => setPreviewAttachmentId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={requestsApi.getAttachmentUrl(previewAttachmentId)}
              alt="Ảnh minh chứng"
              style={{
                maxWidth: '85vw',
                maxHeight: '80vh',
                display: 'block',
                objectFit: 'contain'
              }}
            />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CÀI ĐẶT & YÊU CẦU CẤP QUYỀN TRUY CẬP VỊ TRÍ GPS           */}
      {/* ============================================================== */}
      {/* ============================================================== */}
      {/* MODAL: KÍCH HOẠT VỊ TRÍ GPS (TINH GỌN, 1 CHẠM CHO MOBILE/PWA)   */}
      {/* ============================================================== */}
      {showGpsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: 16
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: '24px 20px',
            width: '100%',
            maxWidth: 420,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            textAlign: 'center'
          }}>
            {/* Icon */}
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: '#EFF6FF',
              border: '2px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px auto'
            }}>
              <MapPin size={28} color="#0056B3" />
            </div>

            <div style={{ fontWeight: 800, fontSize: 17, color: '#0F172A', marginBottom: 6 }}>
              {pendingPunchType ? 'Yêu Cầu Vị Trí Để Chấm Công' : 'Kiểm Tra Vị Trí (GPS)'}
            </div>

            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 16 }}>
              Hệ thống cần xác định bạn đang có mặt tại cơ sở Superbrain để ghi nhận lượt chấm công.
            </div>

            {/* Hướng dẫn nhận diện thông minh theo thiết bị (iOS iPhone vs Android) */}
            {isDeviceIos ? (
              <div style={{
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: 14,
                padding: '14px 16px',
                fontSize: 12.5,
                color: '#1E3A8A',
                textAlign: 'left',
                marginBottom: 16,
                lineHeight: 1.55
              }}>
                <div style={{ fontWeight: 700, color: '#1D4ED8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <span>🍎 Hướng dẫn cho iPhone (iOS):</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#475569', marginBottom: 8, lineHeight: 1.4 }}>
                  <em>(Dù trên Safari đã bật "Cho phép", nếu Cài đặt chung của iPhone đang tắt thì Safari vẫn bị chặn)</em>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', fontWeight: 800, width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>1</span>
                  <span>Mở <strong>Cài đặt (Settings)</strong> trên màn hình chính iPhone ➔ <strong>Quyền riêng tư & Bảo mật</strong> ➔ <strong>Dịch vụ định vị</strong> ➔ Gạt sang <strong>BẬT (Màu xanh)</strong>.</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', fontWeight: 800, width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>2</span>
                  <span>Trong danh sách đó, bấm <strong>Trang web Safari</strong> ➔ Chọn <strong>"Khi dùng Ứng dụng"</strong> và bật <strong>"Vị trí chính xác"</strong>.</span>
                </div>
              </div>
            ) : (
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                padding: '12px 14px',
                fontSize: 12.5,
                color: '#334155',
                textAlign: 'left',
                marginBottom: 16,
                lineHeight: 1.5
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ color: '#0056B3', fontWeight: 700 }}>1.</span>
                  <span>Vuốt thanh thông báo từ đỉnh màn hình xuống và đảm bảo biểu tượng <strong>Vị trí (GPS)</strong> đang bật.</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: '#0056B3', fontWeight: 700 }}>2.</span>
                  <span>Nhấn nút bên dưới, chọn <strong>"Cho phép"</strong> nếu thiết bị hiển thị hộp thoại xác nhận.</span>
                </div>
              </div>
            )}

            {/* Nút 1 chạm kích hoạt */}
            <button
              type="button"
              disabled={checkingGps}
              onClick={async () => {
                setCheckingGps(true);
                try {
                  const coords = await getFastGpsPosition();
                  setCheckingGps(false);
                  setShowGpsModal(false);
                  if (pendingPunchType) {
                    const typeToRun = pendingPunchType;
                    setPendingPunchType(null);
                    addToast('Đã lấy vị trí GPS thành công! Đang hoàn tất chấm công...', 'success');
                    await handlePunch(typeToRun);
                  } else {
                    addToast(`✅ Vị trí GPS sẵn sàng! Sai số ~${Math.round(coords.accuracy)}m`, 'success');
                  }
                } catch (err: any) {
                  setCheckingGps(false);
                  let errorMsg = 'Chưa thể lấy vị trí GPS.';
                  if (err?.code === 1) {
                    errorMsg = isDeviceIos
                      ? 'iPhone chưa bật Dịch vụ định vị trong Cài đặt hoặc Safari chưa được cấp quyền. Vui lòng làm theo 2 bước bên dưới.'
                      : 'Quyền vị trí bị chặn. Vui lòng bật lại Vị trí trên thiết bị.';
                  } else if (err?.code === 2) {
                    errorMsg = 'Tín hiệu GPS không khả dụng. Hãy bật Wi-Fi hoặc 4G để hỗ trợ định vị.';
                  } else if (err?.code === 3) {
                    errorMsg = 'Quá thời gian chờ lấy GPS. Vui lòng bấm thử lại.';
                  } else if (err?.message) {
                    errorMsg = err.message;
                  }
                  addToast(errorMsg, 'warning');
                }
              }}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 12,
                backgroundColor: '#0056B3',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 800,
                fontSize: 14,
                cursor: checkingGps ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(0, 86, 179, 0.35)',
                marginBottom: 10
              }}
            >
              <CheckCircle2 size={18} />
              <span>{checkingGps ? 'Đang kích hoạt GPS...' : (pendingPunchType ? 'BẤM ĐỂ LẤY GPS & CHẤM CÔNG NGAY' : 'LẤY VỊ TRÍ GPS NGAY')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowGpsModal(false);
                setPendingPunchType(null);
              }}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 10,
                backgroundColor: '#F1F5F9',
                color: '#64748B',
                border: 'none',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* MODAL: ĐỔI MẬT KHẨU TÀI KHOẢN */}
      {showChangePasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowChangePasswordModal(false)}
        />
      )}
    </div>
  );
};
