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
  notificationsApi
} from '../../api/client';
import type {
  PunchState,
  UserRequestItem,
  LeaveBalanceSummary,
  PublishedTimesheetData,
  EmployeeDevice,
  AppNotification
} from '../../types';
import {
  triggerMobilePushNotification,
  requestNotificationPermission,
  getNotificationPermission,
  isPushSupported
} from '../../utils/pushNotification';
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
  RotateCcw
} from 'lucide-react';

export const EmployeePortalView: React.FC = () => {
  const { user, logout } = useAuth();
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
  const [myDevices, setMyDevices] = useState<{ mobile: EmployeeDevice | null; pc: EmployeeDevice | null }>({ mobile: null, pc: null });
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

  // Quỹ phép & Lịch sử
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceSummary | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [attendanceIssues, setAttendanceIssues] = useState<any[]>([]);
  const [publishedTimesheet, setPublishedTimesheet] = useState<PublishedTimesheetData | null>(null);

  // Khiếu nại
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeContent, setDisputeContent] = useState('');

  // Thông báo & Push Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotiCount, setUnreadNotiCount] = useState(0);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() => getNotificationPermission());

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
  const hasLocalDeviceSecret = !!localStorage.getItem('device_secret');
  
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
    const defaultName = finalType === 'PC'
      ? `PC - ${user?.fullName || 'Nhân viên'}`
      : `Mobile - ${user?.fullName || 'Nhân viên'}`;
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
        const msg = err.response?.data?.message || 'Có lỗi xảy ra khi chấm công.';
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
      await performCall(undefined, undefined, undefined, 'GEOLOCATION_NOT_SUPPORTED');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await performCall(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      async (err) => {
        console.warn('GPS Error:', err);
        await performCall(undefined, undefined, undefined, err.message || 'GPS_PERMISSION_DENIED');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
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

      const macAddress = getOrGenerateMacAddress();
      const autoDeviceName = deviceNameInput.trim() || (isPc ? `PC - ${user?.fullName || 'Nhân viên'}` : `Mobile - ${user?.fullName || 'Nhân viên'}`);

      const res = await devicesApi.register({
        deviceType: registeringDeviceType,
        deviceName: autoDeviceName,
        operatingSystem: os,
        browserInfo: browser,
        fingerprintHash: macAddress
      });

      // Lưu secret token vào localStorage
      if (res.secretToken) {
        localStorage.setItem('device_secret', res.secretToken);
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
  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('requestType', 'LEAVE');
      formData.append('leaveCode', leaveCode);
      formData.append('fromDate', leaveFromDate);
      formData.append('toDate', leaveToDate);
      formData.append('dayPart', leaveDayPart);
      formData.append('reason', leaveReason);
      leaveFiles.forEach(file => formData.append('files', file));

      await requestsApi.submit(formData);
      addToast('Gửi đơn nghỉ phép thành công. Đang chờ HCNS phê duyệt.', 'success');
      setShowLeaveModal(false);
      setLeaveReason('');
      setLeaveFiles([]);
      const reqs = await requestsApi.getMyRequests();
      setMyRequests(reqs);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi khi gửi đơn.', 'error');
    }
  };

  // Nộp giải trình
  const handleSubmitRegularization = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('requestType', 'REGULARIZATION');
      formData.append('fromDate', regulDate);
      formData.append('toDate', regulDate);
      formData.append('actualIn', regulInTime);
      formData.append('actualOut', regulOutTime);
      formData.append('reasonCode', regulReasonCode);
      formData.append('reason', regulReason);
      regulFiles.forEach(file => formData.append('files', file));

      await requestsApi.submit(formData);
      addToast('Gửi giải trình chấm công thành công. Đang chờ HCNS phê duyệt.', 'success');
      setShowRegulModal(false);
      setRegulReason('');
      setRegulFiles([]);
      const reqs = await requestsApi.getMyRequests();
      setMyRequests(reqs);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi khi gửi giải trình.', 'error');
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
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={16} color="#16A34A" />
                  Vị trí GPS sẵn sàng
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
                const isCompletedState = punchState?.currentMode === 'COMPLETED' || (punchState?.todayPunchCount !== undefined && punchState.todayPunchCount >= 2);
                const isNeedExplanation = punchState?.currentMode === 'NEED_EXPLANATION';
                const isWorkingNotCheckedIn = punchState?.currentMode === 'WORKING_NOT_CHECKED_IN';
                const isWorkingState = punchState?.currentMode === 'WORKING' || (!!punchState?.hasValidCheckin && !punchState?.canCheckout && !isCompletedState && !isNeedExplanation);
                const isCheckoutState = punchState?.currentMode === 'CHECK_OUT' || (!!punchState?.canCheckout && !isCompletedState && !isNeedExplanation);

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
                <span style={{ fontSize: 12, color: '#64748B' }}>{punchState?.todayPunchCount || 0} / 2 lượt (1 Vào, 1 Ra)</span>
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
            {/* Banner bảng công chính thức (nếu đã công bố) */}
            {publishedTimesheet?.isPublished && (
              <div style={{
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: 16,
                padding: 16,
                marginBottom: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#1E40AF' }}>
                    Bảng Chấm Công Chính Thức (v{publishedTimesheet.versionNo})
                  </div>
                  <button
                    onClick={() => setShowDisputeModal(true)}
                    style={{
                      backgroundColor: '#E31837',
                      color: '#FFF',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Khiếu nại
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center', marginTop: 12 }}>
                  <div style={{ backgroundColor: '#FFF', padding: 8, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#64748B' }}>Công làm (J)</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#16A34A' }}>{publishedTimesheet.summary?.workDays}</div>
                  </div>
                  <div style={{ backgroundColor: '#FFF', padding: 8, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#64748B' }}>Nghỉ Lễ (I)</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0056B3' }}>{publishedTimesheet.summary?.holidayDays}</div>
                  </div>
                  <div style={{ backgroundColor: '#FFF', padding: 8, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#64748B' }}>Phép năm (K)</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#CA8A04' }}>{publishedTimesheet.summary?.annualLeaveDays}</div>
                  </div>
                  <div style={{ backgroundColor: '#FFF', padding: 8, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#64748B' }}>Tổng tính lương</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#E31837' }}>{publishedTimesheet.summary?.paidDays}</div>
                  </div>
                </div>
              </div>
            )}

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <button
                onClick={() => setShowLeaveModal(true)}
                style={{
                  backgroundColor: '#0056B3',
                  color: '#FFF',
                  padding: '14px',
                  borderRadius: 12,
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer'
                }}
              >
                <Plus size={18} />
                Xin nghỉ phép
              </button>
              <button
                onClick={() => setShowRegulModal(true)}
                style={{
                  backgroundColor: '#FFC72C',
                  color: '#1E293B',
                  padding: '14px',
                  borderRadius: 12,
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer'
                }}
              >
                <Plus size={18} />
                Giải trình giờ quẹt
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
                      {req.status === 'PENDING_HR' && (
                        <div style={{ marginTop: 4, textAlign: 'right' }}>
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

            {/* Quản lý 2 khe thiết bị (Mobile / PC) */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>Thiết bị liên kết (Tối đa 2 khe)</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    Đang truy cập từ: <strong>{isCurrentClientMobile ? '📱 Điện thoại (Mobile)' : '💻 Máy tính (PC)'}</strong>
                  </div>
                </div>
                {isCurrentClientMobile ? (
                  !myDevices.mobile ? (
                    <button
                      onClick={() => openRegisterDeviceModal('MOBILE')}
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
                      📱 Đăng ký Mobile
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, backgroundColor: '#DCFCE7', padding: '4px 8px', borderRadius: 6 }}>
                      ✓ Mobile đã liên kết
                    </span>
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
                {/* Khe Điện thoại */}
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
                      {myDevices.mobile ? (
                        <span style={{ color: myDevices.mobile.approvalStatus === 'APPROVED' ? '#16A34A' : '#D97706', fontWeight: 600 }}>
                          {myDevices.mobile.deviceName}
                        </span>
                      ) : (
                        'Chưa đăng ký'
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {myDevices.mobile ? (
                      <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700 }}>✓ Đã liên kết</span>
                    ) : isCurrentClientMobile ? (
                      <button
                        onClick={() => openRegisterDeviceModal('MOBILE')}
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
                  {notifications.map((n) => (
                    <div
                      key={n.notificationId}
                      onClick={async () => {
                        if (!n.isRead) {
                          await notificationsApi.markAsRead(n.notificationId);
                          setNotifications(prev => prev.map(x => x.notificationId === n.notificationId ? { ...x, isRead: true } : x));
                          setUnreadNotiCount(prev => Math.max(0, prev - 1));
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
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{n.body}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>{n.timeLocal}</div>
                    </div>
                  ))}
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
                  📱 <strong>Đang truy cập trên Điện thoại (Mobile):</strong> Hệ thống tự động nhận diện phần cứng và <strong>chỉ cho phép đăng ký khe Mobile</strong>. Khe Máy tính (PC) chỉ hiển thị trạng thái và phải được đăng ký trực tiếp trên máy tính.
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
                  <option value="1/2P">1/2P — Nghỉ phép nửa ngày (0.5)</option>
                  <option value="B">B — Nghỉ bù sự kiện</option>
                  <option value="KL">KL — Nghỉ không lương</option>
                  <option value="Ro">Ro — Nghỉ chế độ / luật lao động</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Từ ngày</label>
                  <input
                    type="date"
                    value={leaveFromDate}
                    onChange={e => setLeaveFromDate(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Đến ngày</label>
                  <input
                    type="date"
                    value={leaveToDate}
                    onChange={e => setLeaveToDate(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              {leaveCode === '1/2P' && (
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
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Ảnh minh chứng (tùy chọn / tối đa 5 ảnh)</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={e => setLeaveFiles(Array.from(e.target.files || []))}
                  style={{ width: '100%', fontSize: 12 }}
                />
              </div>

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 8,
                  backgroundColor: '#0056B3',
                  color: '#FFF',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Gửi Đơn Xin Nghỉ
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
                <input
                  type="date"
                  value={regulDate}
                  onChange={e => setRegulDate(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #CBD5E1' }}
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
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Minh chứng (hình ảnh xác nhận)</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={e => setRegulFiles(Array.from(e.target.files || []))}
                  style={{ width: '100%', fontSize: 12 }}
                />
              </div>

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 8,
                  backgroundColor: '#FFC72C',
                  color: '#1E293B',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Gửi Giải Trình
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

      {/* MODAL: ĐỔI MẬT KHẨU TÀI KHOẢN */}
      {showChangePasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowChangePasswordModal(false)}
        />
      )}
    </div>
  );
};
