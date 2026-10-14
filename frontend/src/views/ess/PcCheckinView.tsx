import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePlatform } from '../../context/PlatformContext';
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
  EmployeeDevice
} from '../../types';
import {
  Clock,
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
  Copy,
  Edit3,
  Check,
  Send,
  HelpCircle,
  ChevronRight,
  Info
} from 'lucide-react';

interface PcCheckinViewProps {
  initialTab?: 'checkin' | 'history' | 'requests' | 'device';
  onSwitchToMobile?: () => void;
  onNavigate?: (view: string) => void;
}

export const PcCheckinView: React.FC<PcCheckinViewProps> = ({
  initialTab = 'checkin',
  onSwitchToMobile,
  onNavigate
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { settings } = usePlatform();

  const [activeTab, setActiveTab] = useState<'checkin' | 'history' | 'requests' | 'device'>(initialTab);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync activeTab khi Navbar trên thay đổi initialTab (điều hướng từ ngoài)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Trạng thái Chấm công
  const [punchState, setPunchState] = useState<PunchState | null>(null);
  const [punching, setPunching] = useState(false);
  const [punchCooldownSeconds, setPunchCooldownSeconds] = useState<number>(0);
  const [forceEnableCheckout, setForceEnableCheckout] = useState(false);

  // Đồng hồ thời gian thực
  const [currentTime, setCurrentTime] = useState(new Date());

  // Thiết bị & MAC Address (chỉ đọc - không cho phép chỉnh sửa để tránh gian lận)
  const [myDevices, setMyDevices] = useState<{ mobile: EmployeeDevice | null; pc: EmployeeDevice | null }>({ mobile: null, pc: null });
  const [macAddress, setMacAddress] = useState<string>('');
  const [copiedMac, setCopiedMac] = useState(false);
  const [registeringMac, setRegisteringMac] = useState(false);

  // Lịch sử & Thống kê
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceSummary | null>(null);
  const [publishedTimesheet, setPublishedTimesheet] = useState<PublishedTimesheetData | null>(null);

  // Đơn từ & Giải trình
  const [myRequests, setMyRequests] = useState<UserRequestItem[]>([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showRegulModal, setShowRegulModal] = useState(false);
  const [leaveCode, setLeaveCode] = useState('P');
  const [leaveFromDate, setLeaveFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveToDate, setLeaveToDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveDayPart, setLeaveDayPart] = useState<'FULL' | 'MORNING' | 'AFTERNOON'>('FULL');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveFiles, setLeaveFiles] = useState<File[]>([]);

  const [regulDate, setRegulDate] = useState(new Date().toISOString().split('T')[0]);
  const [regulInTime, setRegulInTime] = useState('08:00');
  const [regulOutTime, setRegulOutTime] = useState('17:00');
  const [regulReasonCode, setRegulReasonCode] = useState('Quên bấm');
  const [regulReason, setRegulReason] = useState('');
  const [regulFiles, setRegulFiles] = useState<File[]>([]);

  // 1. Đồng hồ thời gian thực
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Lấy hoặc sinh MAC Address cho máy tính PC
  const getOrInitMacAddress = (): string => {
    let mac = localStorage.getItem('device_mac_address');
    if (!mac) {
      const hex = '0123456789ABCDEF';
      const randomByte = () => hex[Math.floor(Math.random() * 16)] + hex[Math.floor(Math.random() * 16)];
      mac = `02:${randomByte()}:${randomByte()}:${randomByte()}:${randomByte()}:${randomByte()}`;
      localStorage.setItem('device_mac_address', mac);
    }
    return mac;
  };

  useEffect(() => {
    const mac = getOrInitMacAddress();
    setMacAddress(mac);
    const loginWarn = sessionStorage.getItem('device_login_warning');
    if (loginWarn) {
      addToast(loginWarn, 'warning');
      sessionStorage.removeItem('device_login_warning');
    }
  }, []);

  // 3. Tải dữ liệu ban đầu
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [stateRes, devRes, balRes] = await Promise.allSettled([
        attendanceApi.getState(),
        devicesApi.getMyDevices(),
        profileApi.getLeaveBalance()
      ]);

      if (stateRes.status === 'fulfilled') setPunchState(stateRes.value);
      if (devRes.status === 'fulfilled') {
        setMyDevices(devRes.value);
        if (devRes.value.pc?.fingerprintHash) {
          setMacAddress(devRes.value.pc.fingerprintHash);
          localStorage.setItem('device_mac_address', devRes.value.pc.fingerprintHash);
        }
      }
      if (balRes.status === 'fulfilled') setLeaveBalance(balRes.value);
    } catch (err) {
      console.error('Lỗi tải dữ liệu PC Checkin:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadInitialData();
      if (activeTab === 'history') {
        const hist = await attendanceApi.getHistory();
        setAttendanceHistory(hist);
      } else if (activeTab === 'requests') {
        const reqs = await requestsApi.getMyRequests();
        setMyRequests(reqs);
      }
      addToast('Đã làm mới dữ liệu thành công!', 'success');
    } catch {
      addToast('Không thể làm mới dữ liệu.', 'warning');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      attendanceApi.getHistory().then(setAttendanceHistory).catch(() => { });
      timesheetApi.getMyTimesheet(0).then(setPublishedTimesheet).catch(() => { });
    } else if (activeTab === 'requests') {
      requestsApi.getMyRequests().then(setMyRequests).catch(() => { });
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

  // Thông tin MAC và trạng thái ràng buộc
  const registeredMac = myDevices.pc?.fingerprintHash;
  const isMacRegistered = !!registeredMac;
  const currentMac = macAddress || getOrInitMacAddress();
  const isMacMatch = isMacRegistered && registeredMac.toUpperCase() === currentMac.toUpperCase();
  const isMacMismatch = isMacRegistered && !isMacMatch;

  // Đăng ký MAC Address cho máy tính PC này
  const handleRegisterMac = async () => {
    const targetMac = macAddress || getOrInitMacAddress();
    setRegisteringMac(true);
    try {
      const res = await devicesApi.registerMacAddress({
        macAddress: targetMac,
        deviceName: `PC - ${user?.fullName || 'Máy tính'}`
      });
      addToast(res.message || 'Đăng ký địa chỉ MAC cho máy tính thành công!', 'success');
      const devs = await devicesApi.getMyDevices();
      setMyDevices(devs);
      if (devs.pc?.fingerprintHash) {
        setMacAddress(devs.pc.fingerprintHash);
        localStorage.setItem('device_mac_address', devs.pc.fingerprintHash);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Không thể đăng ký MAC Address. Vui lòng kiểm tra lại!';
      addToast(msg, 'error');
    } finally {
      setRegisteringMac(false);
    }
  };

  // Thao tác sao chép MAC (chỉ đọc - không cho chỉnh sửa)
  const handleCopyMac = () => {
    if (macAddress) {
      navigator.clipboard.writeText(macAddress);
      setCopiedMac(true);
      addToast('Đã sao chép địa chỉ MAC vào bộ nhớ tạm!', 'success');
      setTimeout(() => setCopiedMac(false), 2000);
    }
  };

  // THỰC HIỆN ĐIỂM DANH CHECK-IN / CHECK-OUT TRÊN PC
  const handlePcPunch = async () => {
    if (punchState?.currentMode === 'COMPLETED') {
      addToast('Hôm nay bạn đã hoàn thành đủ 1 lượt Check-in và 1 lượt Check-out. Hệ thống không cho phép chấm công thêm để tránh dữ liệu trùng lặp.', 'info');
      return;
    }

    if (punchCooldownSeconds > 0) {
      addToast(`Thao tác quá nhanh. Vui lòng đợi ${punchCooldownSeconds} giây nữa.`, 'warning');
      return;
    }

    if (!navigator.onLine) {
      addToast('Không có kết nối mạng Internet. Vui lòng kiểm tra kết nối mạng của bạn.', 'error');
      return;
    }

    // 1. Kiểm tra tài khoản đã đăng ký MAC chưa
    if (!isMacRegistered) {
      addToast('Tài khoản của bạn chưa đăng ký MAC Address cho máy tính. Vui lòng vào tab "Thiết Bị & Địa Chỉ MAC" và bấm "Đăng ký MAC Address" trước khi chấm công!', 'error');
      setActiveTab('device');
      return;
    }

    // 2. Kiểm tra MAC có khớp với máy đã đăng ký không
    if (isMacMismatch) {
      addToast(`Địa chỉ MAC của máy tính này (${currentMac}) không khớp với thiết bị đã đăng ký (${registeredMac}). Hệ thống chặn chấm công từ máy lạ để tránh gian lận!`, 'error');
      return;
    }

    setPunching(true);

    try {
      const result = await attendanceApi.punch({
        channel: 'PC_WEB',
        macAddress: currentMac
      });

      setPunchCooldownSeconds(60);
      setForceEnableCheckout(false);

      const state = await attendanceApi.getState();
      setPunchState(state);

      const devs = await devicesApi.getMyDevices();
      setMyDevices(devs);

      const timeStr = result.checkTimeLocal ? (result.checkTimeLocal.split(' ')[1] || result.checkTimeLocal) : '';
      const isCheckoutAction = punchState?.currentMode === 'CHECK_OUT' || forceEnableCheckout;
      const modeLabel = isCheckoutAction ? 'Ra về (Check-out)' : 'Vào làm (Check-in)';

      addToast(`✅ Điểm danh ${modeLabel} thành công! Giờ ghi nhận: ${timeStr} (MAC: ${currentMac})`, 'success');

      // Tải lại lịch sử nếu tab history mở
      if (activeTab === 'history') {
        const hist = await attendanceApi.getHistory();
        setAttendanceHistory(hist);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Có lỗi xảy ra khi chấm công.';
      if (msg.includes('Thao tác quá nhanh') || msg.includes('60 giây')) {
        setPunchCooldownSeconds(60);
        addToast(msg, 'warning');
      } else {
        addToast(msg, 'error');
      }
    } finally {
      setPunching(false);
    }
  };

  // Nộp đơn nghỉ phép
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

  // Nộp giải trình chấm công
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
      addToast('Gửi giải trình chấm công thành công. Đang chờ HCNS xem xét.', 'success');
      setShowRegulModal(false);
      setRegulReason('');
      setRegulFiles([]);
      const reqs = await requestsApi.getMyRequests();
      setMyRequests(reqs);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi khi gửi giải trình.', 'error');
    }
  };

  // Tính trạng thái chấm công (mỗi ngày 1 lần Check-in, 1 lần Check-out)
  const isCompleted = punchState?.currentMode === 'COMPLETED';
  const isWorking = punchState?.currentMode === 'CHECKED_IN' && !forceEnableCheckout && !isCompleted;
  const isCheckout = (punchState?.currentMode === 'CHECK_OUT' || forceEnableCheckout) && !isCompleted;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 2. THẺ TỔNG QUAN & ĐỒNG HỒ THỜI GIAN THỰC (4 STAT CARDS) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px'
      }}>
        {/* Card 1: Đồng hồ & Ngày hiện tại */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0056B3', marginTop: '4px' }}>
            {currentTime.toLocaleTimeString('vi-VN')}
          </div>
          <div style={{ fontSize: '12px', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#16A34A', display: 'inline-block' }} />
            Hệ thống chấm công trực tuyến
          </div>
        </div>

        {/* Card 2: Trạng thái ca làm việc */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Trạng thái hôm nay
          </div>
          <div style={{
            fontSize: '18px',
            fontWeight: 800,
            marginTop: '6px',
            color: isCompleted ? '#16A34A' : isWorking ? '#0056B3' : '#D97706'
          }}>
            {isCompleted ? '✅ Đã hoàn thành ca' : isWorking ? '⚡ Đang trong ca làm' : '🕒 Chưa bấm Check-in'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
            {punchState?.firstPunchTime ? `Vào: ${punchState.firstPunchTime}` : 'Chưa có giờ vào'}
            {punchState?.lastPunchTime ? ` · Ra: ${punchState.lastPunchTime}` : ''}
          </div>
        </div>

        {/* Card 3: Số lượt bấm trong ngày */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Lượt điểm danh hôm nay
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
            {punchState?.todayPunchCount || 0} / 2 <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748B' }}>lượt</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
            Quy định: 1 lượt Check-in & 1 lượt Check-out
          </div>
        </div>

        {/* Card 4: Quỹ phép năm */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Quỹ phép năm còn lại
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F766E', marginTop: '4px' }}>
            {leaveBalance?.available ?? 0} <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748B' }}>ngày</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
            Đã dùng: {leaveBalance?.used ?? 0} ngày · Tồn năm trước: {leaveBalance?.carryOpening ?? 0}
          </div>
        </div>
      </div>

      {/* 3. TABS NỘI BỘ (chỉ hiện khi không có onNavigate - tức là dùng standalone không qua Navbar trên) */}
      {!onNavigate && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '6px 8px',
          display: 'flex',
          gap: '6px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('checkin')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: activeTab === 'checkin' ? '#0056B3' : 'transparent',
              color: activeTab === 'checkin' ? '#FFFFFF' : '#475569',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <Clock size={16} />
            Điểm Danh (Check-in / Out)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: activeTab === 'history' ? '#0056B3' : 'transparent',
              color: activeTab === 'history' ? '#FFFFFF' : '#475569',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <Calendar size={16} />
            Lịch Sử Điểm Danh
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: activeTab === 'requests' ? '#0056B3' : 'transparent',
              color: activeTab === 'requests' ? '#FFFFFF' : '#475569',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <FileText size={16} />
            Đơn Nghỉ Phép & Giải Trình
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('device')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: activeTab === 'device' ? '#0056B3' : 'transparent',
              color: activeTab === 'device' ? '#FFFFFF' : '#475569',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <Monitor size={16} />
            Thông Tin Máy Tính & MAC
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1: ĐIỂM DANH CHECK-IN / CHECK-OUT TRÊN PC                  */}
      {/* ============================================================== */}
      {activeTab === 'checkin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* THẺ THÔNG TIN XÁC THỰC MÁY TÍNH & ĐỊA CHỈ MAC */}
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: '#EFF6FF',
                color: '#0056B3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Monitor size={26} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    ĐỊA CHỈ MAC XÁC THỰC CỦA MÁY TÍNH
                  </div>
                  {isMacRegistered ? (
                    isMacMatch ? (
                      <span style={{
                        backgroundColor: '#DCFCE7',
                        color: '#166534',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <CheckCircle2 size={12} />
                        Khớp MAC chính chủ
                      </span>
                    ) : (
                      <span style={{
                        backgroundColor: '#FEE2E2',
                        color: '#991B1B',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <XCircle size={12} />
                        Sai máy tính (Không khớp)
                      </span>
                    )
                  ) : (
                    <span style={{
                      backgroundColor: '#FEF3C7',
                      color: '#92400E',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <AlertTriangle size={12} />
                      Chưa đăng ký MAC
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <span style={{
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '18px',
                    fontWeight: 800,
                    color: isMacMismatch ? '#DC2626' : '#0056B3',
                    backgroundColor: isMacMismatch ? '#FEF2F2' : '#F1F5F9',
                    padding: '4px 12px',
                    borderRadius: '6px',
                    letterSpacing: '1px'
                  }}>
                    {currentMac || 'Đang nhận diện...'}
                  </span>

                  <button
                    type="button"
                    onClick={handleCopyMac}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      padding: '5px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Sao chép địa chỉ MAC"
                  >
                    {copiedMac ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
                    {copiedMac ? 'Đã chép' : 'Sao chép'}
                  </button>
                </div>

                {/* Banner cảnh báo chưa đăng ký hoặc sai MAC */}


                {isMacMismatch && (
                  <div style={{
                    marginTop: '10px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: '#991B1B',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <XCircle size={15} color="#DC2626" />
                    <span>Máy này ({currentMac}) không khớp với MAC đã đăng ký ({registeredMac}). Hệ thống chặn check-in từ máy lạ!</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1px dashed #CBD5E1',
              borderRadius: '10px',
              padding: '10px 16px',
              fontSize: '12px',
              color: '#475569',
              maxWidth: '360px'
            }}>
              {!isMacRegistered && (
                <div style={{
                  marginTop: '10px',
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  color: '#92400E',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={15} color="#D97706" />
                    Tài khoản <strong>chưa đăng ký MAC</strong> cho máy tính này. Vui lòng đăng ký trước khi chấm công.
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('device')}
                    style={{
                      backgroundColor: '#0056B3',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Đến Tab Đăng Ký
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* KHUNG THAO TÁC CHẤM CÔNG LỚN (ACTION PUNCH PANEL) */}
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '32px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            textAlign: 'center'
          }}>
            <div style={{ maxWidth: '520px', margin: '0 auto' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 }}>
                THAO TÁC ĐIỂM DANH MÁY TÍNH
              </div>

              <div style={{
                fontSize: '40px',
                fontWeight: 800,
                color: '#0056B3',
                marginTop: '6px',
                marginBottom: '16px'
              }}>
                {currentTime.toLocaleTimeString('vi-VN')}
              </div>

              {/* Hướng dẫn trạng thái hiện tại */}
              <div style={{
                padding: '14px 18px',
                borderRadius: '10px',
                backgroundColor: isCompleted ? '#F0FDF4' : isWorking ? '#EFF6FF' : '#FFFBEB',
                border: `1px solid ${isCompleted ? '#BBF7D0' : isWorking ? '#BFDBFE' : '#FDE68A'}`,
                color: isCompleted ? '#166534' : isWorking ? '#1E40AF' : '#92400E',
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '24px',
                lineHeight: 1.5
              }}>
                {isCompleted ? (
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803D', marginBottom: '4px' }}>
                      🎉 Đã hoàn tất chấm công hôm nay!
                    </div>
                    <div>
                      Bạn đã thực hiện đủ <b>1 lượt Check-in</b> (Vào: <b>{punchState?.firstPunchTime}</b>) và <b>1 lượt Check-out</b> (Ra: <b>{punchState?.lastPunchTime}</b>).
                    </div>
                    <div style={{ fontSize: '12px', color: '#166534', marginTop: '4px' }}>
                      Hệ thống đã khóa điểm danh trong ngày để tránh dữ liệu rác và bảo đảm tính chính xác của bảng công.
                    </div>
                  </div>
                ) : isWorking ? (
                  <div>
                    ⚡ Bạn đã check-in lúc <b>{punchState?.firstPunchTime}</b>. Bạn có thể bấm Check-out sau 30 phút làm việc.
                  </div>
                ) : (
                  <div>
                    👋 Chào ngày mới, {user?.fullName}! Bấm nút bên dưới để ghi nhận giờ bắt đầu làm việc.
                  </div>
                )}
              </div>

              {/* NÚT BẤM CHẤM CÔNG LỚN (CHUẨN WEB ADMIN ACTION BUTTON) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                <button
                  type="button"
                  onClick={handlePcPunch}
                  disabled={punching || punchCooldownSeconds > 0 || isCompleted}
                  style={{
                    width: '100%',
                    maxWidth: isCompleted ? '460px' : '380px',
                    height: '58px',
                    backgroundColor: isCompleted ? '#0D9488' : punchCooldownSeconds > 0 ? '#64748B' : isCheckout ? '#16A34A' : '#0056B3',
                    color: '#FFFFFF',
                    border: isCompleted ? '2px solid #5EEAD4' : 'none',
                    borderRadius: '12px',
                    fontSize: isCompleted ? '15px' : '16px',
                    fontWeight: 800,
                    cursor: (punching || punchCooldownSeconds > 0 || isCompleted) ? 'not-allowed' : 'pointer',
                    boxShadow: (punchCooldownSeconds > 0 || isCompleted) ? 'none' : '0 4px 14px rgba(0, 86, 179, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    transition: 'all 0.2s ease',
                    opacity: isCompleted ? 0.95 : 1
                  }}
                >
                  {punching ? (
                    <>
                      <RefreshCw size={20} style={{ animation: 'spin 0.8s linear infinite' }} />
                      Đang xử lý điểm danh...
                    </>
                  ) : punchCooldownSeconds > 0 ? (
                    <>
                      <Clock size={20} />
                      Đợi giãn cách {punchCooldownSeconds}s
                    </>
                  ) : isCompleted ? (
                    <>
                      <CheckCircle2 size={22} />
                      ĐÃ HOÀN TẤT CHẤM CÔNG (1/1 IN, 1/1 OUT)
                    </>
                  ) : isCheckout ? (
                    <>
                      <CheckCircle2 size={22} />
                      CHẤM CÔNG RA VỀ (CHECK-OUT)
                    </>
                  ) : (
                    <>
                      <Clock size={22} />
                      CHẤM CÔNG VÀO LÀM (CHECK-IN)
                    </>
                  )}
                </button>

                {/* Nút mở Check-out sớm nếu nhân viên cần về trước 30 phút */}
                {isWorking && !forceEnableCheckout && !isCompleted && (
                  <button
                    type="button"
                    onClick={() => setForceEnableCheckout(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#D97706',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    Cần ra về sớm hơn 30 phút? Bấm vào đây để mở nút Check-out
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* BẢNG LƯỢT QUẸT TRONG NGÀY (TODAY'S PUNCH TABLE - CHUẨN ADMIN) */}
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                NHẬT KÝ ĐIỂM DANH HÔM NAY ({punchState?.punches?.length || 0} lượt)
              </div>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                Ngày: {punchState?.workDate || currentTime.toISOString().split('T')[0]}
              </span>
            </div>

            {(!punchState?.punches || punchState.punches.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '30px 16px', color: '#94A3B8', fontSize: '13px' }}>
                Chưa có lượt điểm danh nào được ghi nhận hôm nay.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                      <th style={{ padding: '10px 14px' }}>STT</th>
                      <th style={{ padding: '10px 14px' }}>Thời gian ghi nhận</th>
                      <th style={{ padding: '10px 14px' }}>Kênh chấm công</th>
                      <th style={{ padding: '10px 14px' }}>Địa chỉ MAC</th>
                      <th style={{ padding: '10px 14px' }}>Trạng thái xác thực</th>
                      <th style={{ padding: '10px 14px' }}>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {punchState.punches.map((p, idx) => (
                      <tr key={p.webLogId || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#64748B' }}>#{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0056B3' }}>
                          {p.checkTimeLocal || p.time || '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            backgroundColor: p.channel === 'PC_WEB' ? '#EFF6FF' : '#F0FDF4',
                            color: p.channel === 'PC_WEB' ? '#0056B3' : '#166534',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            {p.channel === 'PC_WEB' ? '💻 PC Web' : '📱 Mobile PWA'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                          {macAddress || '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            backgroundColor: p.verificationStatus === 'VALID' ? '#DCFCE7' : '#FEF3C7',
                            color: p.verificationStatus === 'VALID' ? '#166534' : '#92400E',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            {p.verificationStatus === 'VALID' ? 'Hợp lệ' : p.verificationStatus}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#64748B', fontSize: '12px' }}>
                          {p.channel === 'PC_WEB' ? 'Xác thực qua MAC máy tính' : 'Vị trí văn phòng'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: LỊCH SỬ CHẤM CÔNG DẠNG BẢNG WEB ADMIN                    */}
      {/* ============================================================== */}
      {activeTab === 'history' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                LỊCH SỬ ĐIỂM DANH TRONG THÁNG
              </h2>
              <p style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', marginBottom: 0 }}>
                Bảng tổng hợp giờ vào, giờ ra và các lượt quẹt hợp lệ của bạn.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Tổng số ngày có công:</span>
              <span style={{
                backgroundColor: '#EFF6FF',
                color: '#0056B3',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 800
              }}>
                {attendanceHistory.length} ngày
              </span>
            </div>
          </div>

          {attendanceHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: '#94A3B8', fontSize: '13px' }}>
              Chưa có dữ liệu chấm công nào trong khoảng thời gian này.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '12px 14px' }}>Ngày làm việc</th>
                    <th style={{ padding: '12px 14px' }}>Giờ vào (Check-in)</th>
                    <th style={{ padding: '12px 14px' }}>Giờ ra (Check-out)</th>
                    <th style={{ padding: '12px 14px' }}>Hình thức</th>
                    <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Chi tiết lượt bấm</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceHistory.map((item, idx) => (
                    <tr key={item.workDate || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>
                        {item.workDate}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: item.inTime ? '#16A34A' : '#94A3B8' }}>
                        {item.inTime || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: item.outTime ? '#0056B3' : '#94A3B8' }}>
                        {item.outTime || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          backgroundColor: '#F1F5F9',
                          color: '#475569',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          {item.source || 'PC / APP'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          backgroundColor: item.hasPendingReview ? '#FEF3C7' : '#DCFCE7',
                          color: item.hasPendingReview ? '#92400E' : '#166534',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          {item.hasPendingReview ? 'Chờ duyệt' : 'Hợp lệ'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#64748B', fontSize: '12px' }}>
                        {item.punches?.length || 0} lượt quẹt
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: ĐƠN NGHỈ PHÉP & GIẢI TRÌNH CHẤM CÔNG                      */}
      {/* ============================================================== */}
      {activeTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* THANH THAO TÁC TẠO ĐƠN */}
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                QUẢN LÝ ĐƠN TỪ & NGHỈ PHÉP
              </h2>
              <p style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', marginBottom: 0 }}>
                Tạo đơn xin nghỉ phép năm/bù hoặc nộp đơn giải trình quên bấm công.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowLeaveModal(true)}
                style={{
                  backgroundColor: '#0056B3',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Plus size={16} />
                + Tạo đơn nghỉ phép
              </button>

              <button
                type="button"
                onClick={() => setShowRegulModal(true)}
                style={{
                  backgroundColor: '#0F766E',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FileText size={16} />
                + Giải trình chấm công
              </button>
            </div>
          </div>

          {/* BẢNG DANH SÁCH ĐƠN ĐÃ GỬI */}
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>
              DANH SÁCH ĐƠN ĐÃ GỬI ({myRequests.length})
            </div>

            {myRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#94A3B8', fontSize: '13px' }}>
                Bạn chưa gửi đơn xin nghỉ phép hoặc giải trình nào.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '10px 14px' }}>Mã đơn</th>
                      <th style={{ padding: '10px 14px' }}>Loại đơn</th>
                      <th style={{ padding: '10px 14px' }}>Thời gian</th>
                      <th style={{ padding: '10px 14px' }}>Số ngày / Giờ</th>
                      <th style={{ padding: '10px 14px' }}>Lý do</th>
                      <th style={{ padding: '10px 14px' }}>Trạng thái</th>
                      <th style={{ padding: '10px 14px' }}>Phản hồi HCNS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRequests.map((req) => (
                      <tr key={req.requestId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0056B3' }}>
                          #{req.requestId}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            backgroundColor: req.requestType === 'LEAVE' ? '#EFF6FF' : '#F0FDF4',
                            color: req.requestType === 'LEAVE' ? '#0056B3' : '#166534',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            {req.requestType === 'LEAVE' ? 'Nghỉ phép' : 'Giải trình công'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {req.fromDate} {req.toDate && req.toDate !== req.fromDate ? `→ ${req.toDate}` : ''}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#D97706' }}>
                          {req.daysRequested ? `${req.daysRequested} ngày` : `${req.actualTimeIn || ''} - ${req.actualTimeOut || ''}`}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#475569', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.reason}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            backgroundColor: req.status === 'APPROVED' ? '#DCFCE7' : req.status === 'PENDING_HR' ? '#FEF3C7' : '#FEE2E2',
                            color: req.status === 'APPROVED' ? '#166534' : req.status === 'PENDING_HR' ? '#92400E' : '#991B1B',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            {req.status === 'APPROVED' ? 'Đã duyệt' : req.status === 'PENDING_HR' ? 'Chờ duyệt' : 'Từ chối'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#64748B', fontSize: '12px' }}>
                          {req.hrNote || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: THÔNG TIN MÁY TÍNH & QUẢN LÝ ĐỊA CHỈ MAC                  */}
      {/* ============================================================== */}
      {activeTab === 'device' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
              THÔNG TIN THIẾT BỊ MÁY TÍNH (PC)
            </h2>
            <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>
              Hệ thống Superbrain sử dụng địa chỉ MAC Address để định danh máy tính của nhân viên. Khi điểm danh trên PC, bạn chỉ cần mở trình duyệt và bấm nút điểm danh.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {/* Thẻ PC */}
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '18px 20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14px', color: '#0056B3' }}>
                    <Monitor size={18} />
                    KHE THIẾT BỊ 1: MÁY TÍNH (PC)
                  </div>
                  {isMacRegistered ? (
                    isMacMatch ? (
                      <span style={{
                        backgroundColor: '#DCFCE7',
                        color: '#166534',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700
                      }}>
                        Đang hoạt động (Khớp máy)
                      </span>
                    ) : (
                      <span style={{
                        backgroundColor: '#FEE2E2',
                        color: '#991B1B',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700
                      }}>
                        Không khớp MAC
                      </span>
                    )
                  ) : (
                    <span style={{
                      backgroundColor: '#FEF3C7',
                      color: '#92400E',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      Chưa đăng ký
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Địa chỉ MAC máy này:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0056B3' }}>{currentMac || '—'}</span>
                  </div>
                  {isMacRegistered && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748B' }}>MAC đã đăng ký:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: isMacMatch ? '#16A34A' : '#DC2626' }}>
                        {registeredMac} {isMacMatch ? '(Trùng khớp)' : '(Không khớp)'}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Tên thiết bị:</span>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{myDevices.pc?.deviceName || `PC - ${user?.fullName}`}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Hệ điều hành:</span>
                    <span style={{ color: '#475569' }}>{myDevices.pc?.operatingSystem || 'Windows'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Trạng thái xác thực:</span>
                    <span style={{ fontWeight: 700, color: isMacRegistered ? (isMacMatch ? '#16A34A' : '#DC2626') : '#D97706' }}>
                      {isMacRegistered ? (isMacMatch ? 'Hợp lệ để chấm công' : 'Bị chặn chấm công (Sai máy)') : 'Chưa đăng ký máy'}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {!isMacRegistered ? (
                    <button
                      type="button"
                      onClick={handleRegisterMac}
                      disabled={registeringMac}
                      style={{
                        backgroundColor: '#0056B3',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '12px 18px',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: registeringMac ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 6px rgba(0, 86, 179, 0.25)'
                      }}
                    >
                      {registeringMac ? <RefreshCw size={16} className="spin" /> : <ShieldCheck size={16} />}
                      {registeringMac ? 'Đang lưu MAC Address...' : '👉 Đăng Ký MAC Address Cho Máy Tính Này'}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{
                        backgroundColor: isMacMatch ? '#DCFCE7' : '#FEE2E2',
                        color: isMacMatch ? '#166534' : '#991B1B',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        border: isMacMatch ? '1px solid #BBF7D0' : '1px solid #FECACA',
                        flex: 1,
                        textAlign: 'center'
                      }}>
                        {isMacMatch ? '🔒 Đã đăng ký máy chính chủ — Cho phép chấm công' : '⚠️ Sai máy tính — Vui lòng dùng máy đã đăng ký'}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyMac}
                        style={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#475569',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        {copiedMac ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
                        Sao chép
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Thẻ Mobile */}
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '18px 20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14px', color: '#475569' }}>
                    <Smartphone size={18} />
                    KHE THIẾT BỊ 2: DI ĐỘNG (MOBILE)
                  </div>
                  <span style={{
                    backgroundColor: myDevices.mobile ? '#DCFCE7' : '#F1F5F9',
                    color: myDevices.mobile ? '#166534' : '#64748B',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700
                  }}>
                    {myDevices.mobile ? 'Đã liên kết' : 'Chưa liên kết'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Tên điện thoại:</span>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{myDevices.mobile?.deviceName || 'Chưa đăng ký'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Hệ điều hành:</span>
                    <span style={{ color: '#475569' }}>{myDevices.mobile?.operatingSystem || 'iOS / Android'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Cơ chế kiểm tra:</span>
                    <span style={{ fontWeight: 700, color: '#0056B3' }}>Kiểm tra Mạng Wi-Fi & GPS</span>
                  </div>
                </div>

                {onSwitchToMobile && (
                  <div style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      onClick={onSwitchToMobile}
                      style={{
                        width: '100%',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#475569',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Smartphone size={14} />
                      Mở giao diện Mobile
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Hướng dẫn xem địa chỉ MAC trên máy tính */}
            <div style={{
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '12px',
              padding: '16px 20px',
              fontSize: '13px',
              color: '#1E3A8A'
            }}>
              <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HelpCircle size={16} />
                Hướng dẫn tra cứu địa chỉ MAC trên máy tính Windows / Mac:
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.6 }}>
                <li><b>Trên Windows:</b> Bấm phím <code>Windows + R</code>, gõ <code>cmd</code> rồi Enter. Trong cửa sổ đen, gõ lệnh <code>getmac</code> hoặc <code>ipconfig /all</code> để xem <b>Physical Address</b> (dạng: <code>00-15-5D-...</code> hoặc <code>00:15:5D:...</code>).</li>
                <li><b>Trên macOS:</b> Mở <b>System Settings</b> → <b>Network</b> → chọn Wi-Fi hoặc Ethernet → bấm <b>Details</b> → <b>Hardware</b> → xem <b>MAC Address</b>.</li>
                <li>Nếu công ty quản lý MAC cố định theo danh sách IT, bạn bấm nút <b>"Chỉnh sửa / Nhập MAC"</b> ở trên để nhập đúng địa chỉ MAC vật lý của máy.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: TẠO ĐƠN NGHỈ PHÉP (CHUẨN FORM ADMIN 2 CỘT)              */}
      {/* ============================================================== */}
      {showLeaveModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#0F172A' }}>
                Tạo Đơn Xin Nghỉ Phép
              </div>
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitLeave}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Loại nghỉ phép
                </label>
                <select
                  value={leaveCode}
                  onChange={(e) => setLeaveCode(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                >
                  <option value="P">Nghỉ phép năm (P) — Hưởng 100% lương</option>
                  <option value="RO">Nghỉ bù (RO) — Trừ quỹ nghỉ bù</option>
                  <option value="TS">Nghỉ thai sản (TS) — Chế độ BHXH</option>
                  <option value="O">Nghỉ ốm (O) — Hưởng chế độ ốm đau</option>
                  <option value="KL">Nghỉ không lương (KL)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                    Từ ngày
                  </label>
                  <input
                    type="date"
                    value={leaveFromDate}
                    onChange={(e) => setLeaveFromDate(e.target.value)}
                    required
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                    Đến ngày
                  </label>
                  <input
                    type="date"
                    value={leaveToDate}
                    onChange={(e) => setLeaveToDate(e.target.value)}
                    required
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Buổi nghỉ
                </label>
                <select
                  value={leaveDayPart}
                  onChange={(e: any) => setLeaveDayPart(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                >
                  <option value="FULL">Cả ngày (1.0 công)</option>
                  <option value="MORNING">Buổi sáng (0.5 công)</option>
                  <option value="AFTERNOON">Buổi chiều (0.5 công)</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Lý do xin nghỉ
                </label>
                <textarea
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  rows={3}
                  required
                  placeholder="Ghi rõ lý do xin nghỉ để cấp trên và HCNS phê duyệt..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  style={{ backgroundColor: '#F1F5F9', color: '#475569', border: 'none', padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: '#0056B3', color: '#FFFFFF', border: 'none', padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Gửi Đơn Nghỉ Phép
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: GIẢI TRÌNH CHẤM CÔNG                                    */}
      {/* ============================================================== */}
      {showRegulModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#0F172A' }}>
                Giải Trình Chấm Công (Quên Quẹt Thẻ)
              </div>
              <button
                type="button"
                onClick={() => setShowRegulModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitRegularization}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Ngày cần giải trình
                </label>
                <input
                  type="date"
                  value={regulDate}
                  onChange={(e) => setRegulDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                    Giờ vào thực tế
                  </label>
                  <input
                    type="time"
                    value={regulInTime}
                    onChange={(e) => setRegulInTime(e.target.value)}
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
                    value={regulOutTime}
                    onChange={(e) => setRegulOutTime(e.target.value)}
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
                  value={regulReasonCode}
                  onChange={(e) => setRegulReasonCode(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                >
                  <option value="Quên bấm">Quên bấm chấm công</option>
                  <option value="Công tác ngoài">Đi công tác ngoài văn phòng</option>
                  <option value="Sự cố kỹ thuật">Sự cố máy tính / mất điện / mất mạng</option>
                  <option value="Lý do khác">Lý do khác</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Chi tiết lý do
                </label>
                <textarea
                  value={regulReason}
                  onChange={(e) => setRegulReason(e.target.value)}
                  rows={3}
                  required
                  placeholder="Ghi rõ lý do tại sao không bấm công đúng giờ..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowRegulModal(false)}
                  style={{ backgroundColor: '#F1F5F9', color: '#475569', border: 'none', padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: '#0F766E', color: '#FFFFFF', border: 'none', padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Gửi Giải Trình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
