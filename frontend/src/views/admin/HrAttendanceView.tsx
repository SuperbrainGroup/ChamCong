import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  api,
  attendanceApi,
  devicesApi,
  branchSettingsApi,
  timesheetApi,
  hrDashboardApi
} from '../../api/client';
import type {
  EmployeeDevice,
  BranchLocationItem,
  BranchNetworkItem,
  HrDashboardSummary
} from '../../types';
import {
  ShieldAlert,
  Smartphone,
  MapPin,
  Wifi,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Trash2,
  RotateCcw,
  RefreshCw,
  Compass,
  ExternalLink,
  Globe,
  Navigation,
  Building2,
  Eye,
  X,
  MapPinned,
  Calendar,
  User,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  Laptop,
  Users,
  CalendarDays,
  Check,
  ClipboardCheck
} from 'lucide-react';

export interface DisplayPeriod {
  id: number | string;
  name: string;
  year: number;
  month: number;
  fromDate: string;
  toDate: string;
  isCurrent: boolean;
}

export const HrAttendanceView: React.FC = () => {
  const { selectedCompany, companies, setSelectedCompany } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'flags' | 'valid' | 'devices' | 'settings' | 'publication'>('flags');
  const [loading, setLoading] = useState(false);

  // Tab 1: Hàng đợi duyệt lượt ngoại lệ
  const [punches, setPunches] = useState<any[]>([]);
  const [selectedPunchIds, setSelectedPunchIds] = useState<number[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [flagFilter, setFlagFilter] = useState<'ALL' | 'REVIEW' | 'OUT_OF_OFFICE'>('ALL');

  // Tab 2 Mới: Chấm công hợp lệ & đã duyệt
  const [validPunches, setValidPunches] = useState<any[]>([]);
  const [loadingValid, setLoadingValid] = useState(false);
  const [periods, setPeriods] = useState<DisplayPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<DisplayPeriod | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpCode, setSelectedEmpCode] = useState<string>('');
  const [validSortMode, setValidSortMode] = useState<'date' | 'employee'>('date');
  const [validSearch, setValidSearch] = useState('');
  const [expandedEmps, setExpandedEmps] = useState<Record<string, boolean>>({});
  const [periodStartDay, setPeriodStartDay] = useState<number>(26);

  // Modal xem chi tiết vị trí GPS & Phê duyệt
  const [inspectPunch, setInspectPunch] = useState<any | null>(null);
  const [inspectNote, setInspectNote] = useState('');
  const [processingInspect, setProcessingInspect] = useState(false);

  // Tab 3: Quản lý thiết bị
  const [devices, setDevices] = useState<EmployeeDevice[]>([]);

  // Tab 4: Cấu hình Vị trí & Mạng văn phòng
  const [locations, setLocations] = useState<BranchLocationItem[]>([]);
  const [networks, setNetworks] = useState<BranchNetworkItem[]>([]);
  const [newLocName, setNewLocName] = useState('');
  const [newLocLat, setNewLocLat] = useState('');
  const [newLocLng, setNewLocLng] = useState('');
  const [newLocRadius, setNewLocRadius] = useState('50');
  const [newCidr, setNewCidr] = useState('');
  const [newCidrDesc, setNewCidrDesc] = useState('');
  const [gettingGps, setGettingGps] = useState(false);
  const [detectingIp, setDetectingIp] = useState(false);
  const [quickCoordInput, setQuickCoordInput] = useState('');

  // Tab 5: Công bố & Khiếu nại
  const [disputes, setDisputes] = useState<any[]>([]);
  const [resolvingDisputeId, setResolvingDisputeId] = useState<number | null>(null);
  const [disputeResponse, setDisputeResponse] = useState('');

  // Dashboard Summary
  const [summary, setSummary] = useState<HrDashboardSummary | null>(null);

  const branchCode = selectedCompany?.code || 'SUPERBRAIN';

  // Tính danh sách kỳ công của hội sở
  const computePeriods = (dbPeriods: any[], startDay: number) => {
    const list: DisplayPeriod[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    for (let offset = 2; offset >= -8; offset--) {
      const d = new Date(currentYear, currentMonth - 1 + offset, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;

      let fromDate = '';
      let toDate = '';
      if (startDay === 1) {
        const lastDay = new Date(y, m, 0).getDate();
        fromDate = `${y}-${String(m).padStart(2, '0')}-01`;
        toDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      } else {
        const prev = new Date(y, m - 2, 1);
        const prevY = prev.getFullYear();
        const prevM = prev.getMonth() + 1;
        fromDate = `${prevY}-${String(prevM).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
        toDate = `${y}-${String(m).padStart(2, '0')}-${String(startDay - 1).padStart(2, '0')}`;
      }

      const matchedDb = dbPeriods.find((p: any) => p.year === y && p.month === m);
      const periodId = matchedDb ? matchedDb.id : `calc_${y}_${m}`;
      const isCurrent = todayStr >= fromDate && todayStr <= toDate;

      const fromParts = fromDate.split('-');
      const toParts = toDate.split('-');
      const fromFmt = `${fromParts[2]}/${fromParts[1]}`;
      const toFmt = `${toParts[2]}/${toParts[1]}/${toParts[0]}`;

      list.push({
        id: periodId,
        name: `Kỳ Tháng ${String(m).padStart(2, '0')}/${y} (${fromFmt} – ${toFmt})`,
        year: y,
        month: m,
        fromDate,
        toDate,
        isCurrent
      });
    }

    return list;
  };

  // Nạp danh sách kỳ công và nhân sự của hội sở
  const loadPeriodAndEmpData = async () => {
    if (!selectedCompany) return;
    try {
      const [pRes, paramRes, empRes] = await Promise.all([
        api.get<any[]>(`/periods/company/${selectedCompany.id}`).catch(() => ({ data: [] })),
        api.get<any[]>(`/companies/${selectedCompany.id}/parameters`).catch(() => ({ data: [] })),
        api.get<any[]>(`/companies/${selectedCompany.id}/employees`).catch(() => ({ data: [] }))
      ]);

      let sd = 26;
      if (Array.isArray(paramRes.data)) {
        const found = paramRes.data.find((p: any) => p.code === 'PERIOD_START_DAY');
        if (found) {
          const val = parseInt(found.companyValue || found.default, 10);
          if (!isNaN(val) && val >= 1 && val <= 28) sd = val;
        }
      }
      setPeriodStartDay(sd);

      const computed = computePeriods(pRes.data || [], sd);
      setPeriods(computed);
      setEmployees(empRes.data || []);

      setSelectedPeriod(prev => {
        if (prev && computed.some(p => p.fromDate === prev.fromDate && p.toDate === prev.toDate)) {
          return prev;
        }
        return computed.find(p => p.isCurrent) || computed[0] || null;
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Nạp dữ liệu các lượt chấm công hợp lệ & được duyệt
  const loadValidPunches = async () => {
    if (!selectedPeriod) return;
    setLoadingValid(true);
    try {
      const data = await attendanceApi.getHrPunches({
        branch: branchCode,
        fromDate: selectedPeriod.fromDate,
        toDate: selectedPeriod.toDate,
        employeeCode: selectedEmpCode || undefined,
        onlyValid: true,
        limit: 1500
      });
      setValidPunches(data || []);
    } catch (err: any) {
      console.error(err);
      addToast(err.response?.data?.message || 'Không thể tải danh sách chấm công hợp lệ.', 'error');
    } finally {
      setLoadingValid(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'flags') {
        const list = await attendanceApi.getHrPunches({
          branch: branchCode,
          status: flagFilter === 'ALL' ? undefined : flagFilter,
          onlyInvalid: true
        });
        const invalidList = (list || []).filter((p: any) => p.verificationStatus !== 'VALID' || p.reviewState === 'PENDING');
        setPunches(invalidList);
      } else if (activeTab === 'devices') {
        const list = await devicesApi.getHrDevices(undefined, branchCode);
        setDevices(list);
      } else if (activeTab === 'settings') {
        const [locs, nets] = await Promise.all([
          branchSettingsApi.getLocations(branchCode),
          branchSettingsApi.getNetworks(branchCode)
        ]);
        setLocations(locs);
        setNetworks(nets);
      } else if (activeTab === 'publication') {
        const disps = await timesheetApi.getDisputes();
        setDisputes(disps);
      }

      const sum = await hrDashboardApi.getSummary(branchCode);
      setSummary(sum);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeriodAndEmpData();
  }, [selectedCompany?.id]);

  useEffect(() => {
    if (activeTab === 'valid') {
      loadValidPunches();
    } else {
      loadData();
    }
  }, [activeTab, branchCode, flagFilter, selectedPeriod?.fromDate, selectedPeriod?.toDate, selectedEmpCode]);

  // Xử lý duyệt cờ hàng loạt
  const handleBatchReview = async (action: 'ACCEPT' | 'REJECT') => {
    if (!selectedPunchIds.length) {
      addToast('Vui lòng chọn ít nhất một lượt bấm cần duyệt.', 'warning');
      return;
    }
    try {
      await attendanceApi.reviewPunches(selectedPunchIds, action, reviewNote);
      addToast(`Đã ${action === 'ACCEPT' ? 'chấp thuận' : 'từ chối'} ${selectedPunchIds.length} lượt bấm thành công!`, 'success');
      setSelectedPunchIds([]);
      setReviewNote('');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi xảy ra khi duyệt.', 'error');
    }
  };

  // Duyệt trực tiếp 1 lượt quẹt từ Modal xem vị trí
  const handleInspectReview = async (action: 'ACCEPT' | 'REJECT') => {
    if (!inspectPunch) return;
    setProcessingInspect(true);
    try {
      await attendanceApi.reviewPunches([inspectPunch.webLogId], action, inspectNote);
      addToast(`Đã ${action === 'ACCEPT' ? 'chấp thuận' : 'từ chối'} lượt bấm #${inspectPunch.webLogId} (${inspectPunch.employeeName || inspectPunch.employeeCode}) thành công!`, 'success');
      setInspectPunch(null);
      setInspectNote('');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi xảy ra khi duyệt lượt bấm.', 'error');
    } finally {
      setProcessingInspect(false);
    }
  };

  // Xóa 1 lượt quẹt chấm công (đơn lẻ)
  const handleDeletePunchSingle = async (webLogId: number, empName?: string, time?: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa lượt chấm công #${webLogId} (${empName || ''} lúc ${time || ''})? Dữ liệu ngày công sẽ được tính toán lại.`)) return;
    try {
      await attendanceApi.deletePunch(webLogId);
      addToast(`Đã xóa lượt chấm công #${webLogId} thành công!`, 'success');
      if (inspectPunch?.webLogId === webLogId) {
        setInspectPunch(null);
      }
      setSelectedPunchIds(prev => prev.filter(id => id !== webLogId));
      if (activeTab === 'valid') {
        loadValidPunches();
      } else {
        loadData();
      }
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi xảy ra khi xóa lượt chấm công.', 'error');
    }
  };

  // Xóa hàng loạt lượt quẹt được chọn
  const handleBatchDelete = async () => {
    if (!selectedPunchIds.length) {
      addToast('Vui lòng chọn ít nhất một lượt bấm cần xóa.', 'warning');
      return;
    }
    if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedPunchIds.length} lượt chấm công đã chọn? Hành động này không thể hoàn tác.`)) return;
    try {
      await attendanceApi.deletePunches(selectedPunchIds);
      addToast(`Đã xóa thành công ${selectedPunchIds.length} lượt chấm công!`, 'success');
      setSelectedPunchIds([]);
      if (activeTab === 'valid') {
        loadValidPunches();
      } else {
        loadData();
      }
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Có lỗi xảy ra khi xóa dữ liệu chấm công.', 'error');
    }
  };

  // Xóa toàn bộ dữ liệu chấm công theo tháng / kỳ được chọn
  const handleDeleteMonthAttendance = async () => {
    if (!selectedPeriod) return;
    if (!confirm(`CẢNH BÁO QUAN TRỌNG: Bạn có chắc chắn muốn xóa TOÀN BỘ dữ liệu chấm công của "${selectedPeriod.name}" (từ ${selectedPeriod.fromDate} đến ${selectedPeriod.toDate})? Thao tác này sẽ xóa tất cả các lượt quẹt chấm công web, mobile và tổng hợp ngày của hội sở trong kỳ này!`)) {
      return;
    }
    try {
      const res = await attendanceApi.deletePunchesByRange({
        fromDate: selectedPeriod.fromDate,
        toDate: selectedPeriod.toDate,
        branch: branchCode,
        companyId: selectedCompany?.id
      });
      addToast(res?.message || `Đã xóa dữ liệu chấm công ${selectedPeriod.name} thành công.`, 'success');
      loadValidPunches();
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi xóa dữ liệu chấm công theo tháng.', 'error');
    }
  };

  // Xóa trực tiếp từ Inspect Modal
  const handleInspectDelete = async () => {
    if (!inspectPunch) return;
    await handleDeletePunchSingle(
      inspectPunch.webLogId,
      inspectPunch.employeeName || inspectPunch.employeeCode,
      inspectPunch.timeLocal
    );
  };

  // Duyệt/Từ chối thiết bị
  const handleDecideDevice = async (id: number, action: 'APPROVE' | 'REJECT') => {
    try {
      await devicesApi.decideDevice(id, action);
      addToast(`Đã ${action === 'APPROVE' ? 'phê duyệt' : 'từ chối'} thiết bị.`, 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi xử lý thiết bị.', 'error');
    }
  };

  // Reset thiết bị
  const handleRevokeDevice = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn thu hồi (reset) thiết bị này? Nhân viên sẽ phải đăng ký lại máy mới.')) return;
    try {
      await devicesApi.revokeDevice(id, 'HCNS reset thiết bị');
      addToast('Đã thu hồi thiết bị thành công.', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi thu hồi.', 'error');
    }
  };

  // Cập nhật địa chỉ MAC cho thiết bị PC
  const handleUpdateDeviceMac = async (id: number, currentMac?: string) => {
    const input = prompt('Nhập địa chỉ MAC mới cho thiết bị PC này (ví dụ: 02:5A:3C:9B:44:1E):', currentMac || '');
    if (!input || !input.trim()) return;
    const clean = input.trim().toUpperCase().replace(/-/g, ':');
    try {
      await devicesApi.updateDeviceMac(id, clean);
      addToast(`Đã cập nhật địa chỉ MAC (${clean}) cho thiết bị thành công.`, 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi cập nhật MAC.', 'error');
    }
  };

  // Thêm Geofence location
  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await branchSettingsApi.addLocation(branchCode, {
        locationName: newLocName,
        latitude: parseFloat(newLocLat),
        longitude: parseFloat(newLocLng),
        radiusMeters: parseInt(newLocRadius, 10)
      });
      addToast('Đã thêm điểm Geofence thành công.', 'success');
      setNewLocName('');
      setNewLocLat('');
      setNewLocLng('');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi thêm vị trí.', 'error');
    }
  };

  // Lấy vị trí GPS hiện tại của Admin / HCNS
  const handleGetGpsCurrentLocation = () => {
    if (!navigator.geolocation) {
      addToast('Trình duyệt không hỗ trợ định vị GPS.', 'warning');
      return;
    }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setNewLocLat(lat);
        setNewLocLng(lng);
        if (!newLocName) {
          setNewLocName(`Văn phòng ${selectedCompany?.name || branchCode}`);
        }
        addToast(`Đã lấy vị trí GPS thành công: ${lat}, ${lng}`, 'success');
        setGettingGps(false);
      },
      (err) => {
        addToast(`Không thể lấy GPS: ${err.message}. Hãy cấp quyền vị trí cho trình duyệt.`, 'error');
        setGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Tự động phân tích tọa độ hoặc link Google Maps từ clipboard / dán
  const handleQuickParseCoords = (val: string) => {
    setQuickCoordInput(val);
    if (!val.trim()) return;

    // Format 1: URL Google Maps chứa @10.796123,106.685321 hoặc ?q=10.796123,106.685321
    const urlMatch = val.match(/[@?&]q?=?(-?\d+\.\d{3,}),\s*(-?\d+\.\d{3,})/);
    if (urlMatch) {
      setNewLocLat(urlMatch[1]);
      setNewLocLng(urlMatch[2]);
      if (!newLocName) setNewLocName(`Văn phòng ${selectedCompany?.name || branchCode}`);
      addToast(`Đã nhận diện tọa độ: ${urlMatch[1]}, ${urlMatch[2]}`, 'success');
      return;
    }

    // Format 2: Tọa độ dạng text thường "10.796123, 106.685321" hoặc "10.796123 106.685321"
    const coordMatch = val.match(/(-?\d+\.\d{3,})[,\s]+(-?\d+\.\d{3,})/);
    if (coordMatch) {
      setNewLocLat(coordMatch[1]);
      setNewLocLng(coordMatch[2]);
      if (!newLocName) setNewLocName(`Văn phòng ${selectedCompany?.name || branchCode}`);
      addToast(`Đã nhận diện tọa độ: ${coordMatch[1]}, ${coordMatch[2]}`, 'success');
      return;
    }
  };

  // Hàm phát hiện Public IP client-side thông qua dịch vụ uy tín (đặc biệt khi admin chạy qua proxy/localhost)
  const fetchClientPublicIp = async (): Promise<string | null> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data.ip) return data.ip;
      }
    } catch {
      try {
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), 3500);
        const res2 = await fetch('https://icanhazip.com', { signal: controller2.signal });
        clearTimeout(timer2);
        if (res2.ok) {
          const text = await res2.text();
          if (text && text.trim()) return text.trim();
        }
      } catch {
        // Fallback server detection
      }
    }
    return null;
  };

  // Nút "Dùng IP hiện tại của tôi"
  const handleUseMyIp = async () => {
    try {
      setDetectingIp(true);
      const detectedPublicIp = await fetchClientPublicIp();
      const res = await branchSettingsApi.useMyIp(branchCode, detectedPublicIp || undefined);
      addToast(res.message || 'Đã thêm IP của bạn vào cấu hình.', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi thêm IP.', 'error');
    } finally {
      setDetectingIp(false);
    }
  };

  // Thêm IP CIDR thủ công
  const handleAddNetwork = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await branchSettingsApi.addNetwork(branchCode, {
        cidr: newCidr,
        description: newCidrDesc
      });
      addToast('Đã thêm dải IP thành công.', 'success');
      setNewCidr('');
      setNewCidrDesc('');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi thêm IP.', 'error');
    }
  };

  // Giải quyết khiếu nại
  const handleResolveDispute = async (id: number, action: 'ACCEPT' | 'REJECT') => {
    if (!disputeResponse.trim()) {
      addToast('Vui lòng nhập phản hồi cho nhân viên.', 'warning');
      return;
    }
    try {
      await timesheetApi.resolveDispute(id, action, disputeResponse);
      addToast('Đã xử lý khiếu nại thành công.', 'success');
      setResolvingDisputeId(null);
      setDisputeResponse('');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi xử lý khiếu nại.', 'error');
    }
  };

  // Lọc validPunches theo validSearch
  const filteredValidPunches = useMemo(() => {
    return validPunches.filter(p => {
      if (!validSearch.trim()) return true;
      const q = validSearch.toLowerCase();
      return (
        (p.employeeName && p.employeeName.toLowerCase().includes(q)) ||
        (p.employeeCode && p.employeeCode.toLowerCase().includes(q)) ||
        (p.departmentName && p.departmentName.toLowerCase().includes(q))
      );
    });
  }, [validPunches, validSearch]);

  // Gom nhóm theo ngày cho tab valid
  const validByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of filteredValidPunches) {
      const d = p.workDate;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredValidPunches]);

  // Gom nhóm theo nhân viên cho tab valid
  const validByEmployee = useMemo(() => {
    const map = new Map<string, { employeeCode: string; employeeName: string; departmentName: string; punches: any[] }>();
    for (const p of filteredValidPunches) {
      const code = p.employeeCode;
      if (!map.has(code)) {
        map.set(code, {
          employeeCode: code,
          employeeName: p.employeeName || code,
          departmentName: p.departmentName || '',
          punches: []
        });
      }
      map.get(code)!.punches.push(p);
    }
    return Array.from(map.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [filteredValidPunches]);

  // Thống kê kỳ cho tab valid
  const validStats = useMemo(() => {
    const totalPunches = filteredValidPunches.length;
    const uniqueEmployees = new Set(filteredValidPunches.map(p => p.employeeCode)).size;
    const mobileCount = filteredValidPunches.filter(p => p.channel === 'MOBILE_PWA').length;
    const webCount = filteredValidPunches.filter(p => p.channel === 'PC_WEB').length;
    const approvedCount = filteredValidPunches.filter(p => p.reviewState === 'ACCEPTED').length;
    return { totalPunches, uniqueEmployees, mobileCount, webCount, approvedCount };
  }, [filteredValidPunches]);

  return (
    <div style={{ width: '100%' }}>
      {/* Tiêu đề chức năng — Tên hội sở */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1E293B', marginBottom: 4 }}>
            Quản Lý Chấm Công & Thiết Bị — {selectedCompany ? selectedCompany.name : 'Tất cả hội sở'}
          </h1>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            Theo dõi dữ liệu chấm công, phê duyệt ngoại lệ và quản lý vị trí làm việc tại cơ sở.
          </div>
        </div>
      </div>

      {/* 4 Thẻ Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          <div style={{ backgroundColor: '#FFF', padding: 16, borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 12, color: '#64748B' }}>Đã chấm công hôm nay</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{summary.checkedInCount} người</div>
          </div>
          <div style={{ backgroundColor: '#FFF', padding: 16, borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 12, color: '#64748B' }}>Lượt cần xác nhận</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#CA8A04', marginTop: 4 }}>{summary.reviewCount} lượt</div>
          </div>
          <div style={{ backgroundColor: '#FFF', padding: 16, borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 12, color: '#64748B' }}>Thiết bị chờ duyệt</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0056B3', marginTop: 4 }}>{summary.pendingDevices} máy</div>
          </div>
          <div style={{ backgroundColor: '#FFF', padding: 16, borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 12, color: '#64748B' }}>Đơn từ chờ duyệt</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#E31837', marginTop: 4 }}>{summary.pendingRequests} đơn</div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #E2E8F0', marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('flags')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'flags' ? '3px solid #0056B3' : '3px solid transparent',
            backgroundColor: 'transparent',
            fontWeight: 700,
            fontSize: 14,
            color: activeTab === 'flags' ? '#0056B3' : '#64748B',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <ShieldAlert size={18} />
          Lượt Cần Xác Nhận ({summary?.reviewCount || 0})
        </button>

        <button
          onClick={() => setActiveTab('valid')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'valid' ? '3px solid #16A34A' : '3px solid transparent',
            backgroundColor: 'transparent',
            fontWeight: 700,
            fontSize: 14,
            color: activeTab === 'valid' ? '#16A34A' : '#64748B',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <CheckCircle2 size={18} />
          Chấm Công Hợp Lệ & Đã Duyệt
        </button>

        <button
          onClick={() => setActiveTab('devices')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'devices' ? '3px solid #0056B3' : '3px solid transparent',
            backgroundColor: 'transparent',
            fontWeight: 700,
            fontSize: 14,
            color: activeTab === 'devices' ? '#0056B3' : '#64748B',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Smartphone size={18} />
          Quản Lý Thiết Bị ({summary?.pendingDevices || 0})
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'settings' ? '3px solid #0056B3' : '3px solid transparent',
            backgroundColor: 'transparent',
            fontWeight: 700,
            fontSize: 14,
            color: activeTab === 'settings' ? '#0056B3' : '#64748B',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Wifi size={18} />
          Vị Trí & Mạng Văn Phòng
        </button>

        <button
          onClick={() => setActiveTab('publication')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'publication' ? '3px solid #0056B3' : '3px solid transparent',
            backgroundColor: 'transparent',
            fontWeight: 700,
            fontSize: 14,
            color: activeTab === 'publication' ? '#0056B3' : '#64748B',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Send size={18} />
          Bảng Công & Phản Hồi
        </button>
      </div>

      {/* TAB 1: HÀNG ĐỢI DUYỆT CỜ */}
      {activeTab === 'flags' && (
        <div style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <select
                value={flagFilter}
                onChange={e => setFlagFilter(e.target.value as any)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
              >
                <option value="ALL">Tất cả cờ</option>
                <option value="REVIEW">🟡 Cờ vàng (REVIEW)</option>
                <option value="OUT_OF_OFFICE">🔴 Cờ đỏ (OUT_OF_OFFICE)</option>
              </select>
            </div>

            {selectedPunchIds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="text"
                  placeholder="Ghi chú duyệt..."
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, width: 220 }}
                />
                <button
                  onClick={() => handleBatchReview('ACCEPT')}
                  style={{ backgroundColor: '#16A34A', color: '#FFF', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                >
                  Chấp nhận ({selectedPunchIds.length})
                </button>
                <button
                  onClick={() => handleBatchReview('REJECT')}
                  style={{ backgroundColor: '#DC2626', color: '#FFF', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                >
                  Từ chối ({selectedPunchIds.length})
                </button>
                <button
                  onClick={handleBatchDelete}
                  style={{ backgroundColor: '#991B1B', color: '#FFF', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  title="Xóa các lượt chấm công đã chọn để làm sạch dữ liệu"
                >
                  <Trash2 size={15} />
                  <span>Xóa ({selectedPunchIds.length})</span>
                </button>
              </div>
            )}
          </div>

          {/* Bảng danh sách lượt bấm */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', width: 40 }}>
                    <input
                      type="checkbox"
                      checked={punches.length > 0 && selectedPunchIds.length === punches.length}
                      onChange={e => {
                        if (e.target.checked) setSelectedPunchIds(punches.map(p => p.webLogId));
                        else setSelectedPunchIds([]);
                      }}
                    />
                  </th>
                  <th style={{ padding: '10px 12px' }}>Nhân viên</th>
                  <th style={{ padding: '10px 12px' }}>Thời gian</th>
                  <th style={{ padding: '10px 12px' }}>Kênh</th>
                  <th style={{ padding: '10px 12px' }}>Trạng thái</th>
                  <th style={{ padding: '10px 12px' }}>Lý do cờ</th>
                  <th style={{ padding: '10px 12px' }}>Vị trí GPS / Khoảng cách</th>
                  <th style={{ padding: '10px 12px' }}>Public IP / Wi-Fi</th>
                  <th style={{ padding: '10px 12px' }}>Trạng thái duyệt</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {punches.length > 0 ? (
                  punches.map(p => (
                    <tr
                      key={p.webLogId}
                      style={{
                        borderBottom: '1px solid #E2E8F0',
                        backgroundColor: selectedPunchIds.includes(p.webLogId) ? '#F0F9FF' : 'transparent',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="checkbox"
                          checked={selectedPunchIds.includes(p.webLogId)}
                          onChange={e => {
                            if (e.target.checked) setSelectedPunchIds(prev => [...prev, p.webLogId]);
                            else setSelectedPunchIds(prev => prev.filter(id => id !== p.webLogId));
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: '#1E293B' }}>{p.employeeName || p.employeeCode}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>Mã: {p.employeeCode}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 600 }}>{p.timeLocal}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>{p.workDate}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: p.channel === 'MOBILE_PWA' ? '#F0FDF4' : '#EFF6FF',
                          color: p.channel === 'MOBILE_PWA' ? '#15803D' : '#1D4ED8'
                        }}>
                          {p.channel === 'MOBILE_PWA' ? '📱 Mobile PWA' : '💻 PC Web'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '3px 8px',
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
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#B45309' }}>{p.reasonCode || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {p.latitude && p.longitude ? (
                          <button
                            onClick={() => {
                              setInspectPunch(p);
                              setInspectNote(p.reviewNote || '');
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              backgroundColor: p.distanceMeters && p.distanceMeters <= (p.branchRadiusMeters || 50) ? '#ECFDF5' : '#FEF2F2',
                              color: p.distanceMeters && p.distanceMeters <= (p.branchRadiusMeters || 50) ? '#065F46' : '#991B1B',
                              border: `1px solid ${p.distanceMeters && p.distanceMeters <= (p.branchRadiusMeters || 50) ? '#A7F3D0' : '#FECACA'}`,
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                            title="Bấm để xem bản đồ chi tiết và vị trí chính xác"
                          >
                            <MapPin size={13} color={p.distanceMeters && p.distanceMeters <= (p.branchRadiusMeters || 50) ? '#10B981' : '#EF4444'} />
                            <span>{p.distanceMeters != null ? `${Math.round(p.distanceMeters)}m` : 'Đã có GPS'}</span>
                            <span style={{ fontSize: 10, color: '#64748B' }}>(±{p.gpsAccuracyMeters || 0}m)</span>
                          </button>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: 12 }}>
                            {p.channel === 'PC_WEB' ? 'Mạng PC Văn phòng' : `Không GPS (${p.gpsState})`}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div><code>{p.clientPublicIP}</code></div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: p.ipOk ? '#16A34A' : '#DC2626' }}>
                          {p.ipOk ? '🟢 Trùng Wi-Fi' : '🔴 Ngoài mạng'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          backgroundColor: p.reviewState === 'ACCEPTED' ? '#DCFCE7' :
                            p.reviewState === 'REJECTED' ? '#FEE2E2' :
                              p.reviewState === 'PENDING' ? '#FEF9C3' : '#F1F5F9',
                          color: p.reviewState === 'ACCEPTED' ? '#16A34A' :
                            p.reviewState === 'REJECTED' ? '#DC2626' :
                              p.reviewState === 'PENDING' ? '#D97706' : '#64748B'
                        }}>
                          {p.reviewState === 'ACCEPTED' ? 'ĐÃ DUYỆT' :
                            p.reviewState === 'REJECTED' ? 'TỪ CHỐI' :
                              p.reviewState === 'PENDING' ? 'CHỜ DUYỆT' : 'CHƯA CẦN'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            setInspectPunch(p);
                            setInspectNote(p.reviewNote || '');
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            backgroundColor: '#0056B3',
                            color: '#FFF',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,86,179,0.2)'
                          }}
                          title="Bấm để xem vị trí trên bản đồ và phê duyệt"
                        >
                          <Eye size={13} />
                          Xem vị trí & Duyệt
                        </button>
                        <button
                          onClick={() => handleDeletePunchSingle(p.webLogId, p.employeeName || p.employeeCode, p.timeLocal)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: '#FEE2E2',
                            color: '#991B1B',
                            border: '1px solid #FECACA',
                            padding: '6px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            marginLeft: 6
                          }}
                          title="Xóa lượt chấm công này để làm sạch dữ liệu"
                        >
                          <Trash2 size={13} color="#DC2626" />
                          <span>Xóa</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: '#94A3B8' }}>
                      Không có lượt bấm nào cần xử lý.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CHẤM CÔNG HỢP LỆ & ĐÃ DUYỆT */}
      {activeTab === 'valid' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Thanh Điều Khiển: Kỳ Công, Nhân Viên, Sắp Xếp, Tìm Kiếm */}
          <div style={{
            backgroundColor: '#FFF',
            borderRadius: 12,
            padding: '16px 20px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12
            }}>
              {/* Chọn kỳ công theo tháng của hội sở */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1E293B', fontWeight: 700, fontSize: 13 }}>
                  <Calendar size={16} color="#0056B3" />
                  <span>Kỳ công hội sở:</span>
                </div>
                <select
                  value={selectedPeriod?.id || ''}
                  onChange={e => {
                    const p = periods.find(item => String(item.id) === e.target.value);
                    if (p) setSelectedPeriod(p);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    fontWeight: 600,
                    backgroundColor: '#F8FAFC',
                    color: '#0F172A',
                    minWidth: 280
                  }}
                >
                  {periods.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.isCurrent ? '⭐ (Hiện tại)' : ''}
                    </option>
                  ))}
                </select>

                {/* Chọn nhân viên cụ thể */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, color: '#1E293B', fontWeight: 700, fontSize: 13 }}>
                  <User size={16} color="#0056B3" />
                  <span>Nhân viên:</span>
                </div>
                <select
                  value={selectedEmpCode}
                  onChange={e => setSelectedEmpCode(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    backgroundColor: '#F8FAFC',
                    minWidth: 220
                  }}
                >
                  <option value="">Tất cả nhân viên ({employees.length})</option>
                  {employees.map(emp => (
                    <option key={emp.employeeCode} value={emp.employeeCode}>
                      {emp.employeeCode} — {emp.fullName} {emp.departmentName ? `(${emp.departmentName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selectedPeriod && (
                  <button
                    onClick={handleDeleteMonthAttendance}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #FECACA',
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title={`Xóa toàn bộ lượt quẹt chấm công của ${selectedPeriod.name}`}
                  >
                    <Trash2 size={14} color="#DC2626" />
                    <span>Xóa dữ liệu tháng này</span>
                  </button>
                )}

                {/* Nút Làm mới */}
                <button
                  onClick={loadValidPunches}
                  disabled={loadingValid}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFF',
                    color: '#475569',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: loadingValid ? 'wait' : 'pointer'
                  }}
                  title="Tải lại dữ liệu"
                >
                  <RefreshCw size={14} className={loadingValid ? 'animate-spin' : ''} />
                  <span>Làm mới</span>
                </button>
              </div>
            </div>

            {/* Hàng 2: Tìm kiếm & Chế độ sắp xếp */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              paddingTop: 12,
              borderTop: '1px dashed #E2E8F0'
            }}>
              {/* Ô tìm kiếm */}
              <div style={{ position: 'relative', width: 280 }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="text"
                  placeholder="Tìm theo tên, mã NV, phòng ban..."
                  value={validSearch}
                  onChange={e => setValidSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 12px 7px 32px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Toggle Sắp xếp theo ngày hoặc theo người */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#F1F5F9', padding: 4, borderRadius: 8 }}>
                <button
                  type="button"
                  onClick={() => setValidSortMode('date')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    backgroundColor: validSortMode === 'date' ? '#FFF' : 'transparent',
                    color: validSortMode === 'date' ? '#0056B3' : '#64748B',
                    boxShadow: validSortMode === 'date' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <CalendarDays size={15} />
                  Sắp xếp theo ngày
                </button>

                <button
                  type="button"
                  onClick={() => setValidSortMode('employee')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    backgroundColor: validSortMode === 'employee' ? '#FFF' : 'transparent',
                    color: validSortMode === 'employee' ? '#0056B3' : '#64748B',
                    boxShadow: validSortMode === 'employee' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Users size={15} />
                  Sắp xếp theo người
                </button>
              </div>
            </div>
          </div>

          {/* 4 Thẻ thống kê của kỳ công */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <div style={{ backgroundColor: '#FFF', padding: 16, borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: '#64748B' }}>Tổng lượt chấm công hợp lệ</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{validStats.totalPunches} lượt</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Trong kỳ công đang chọn</div>
            </div>
            <div style={{ backgroundColor: '#FFF', padding: 16, borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: '#64748B' }}>Số nhân sự có mặt</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0056B3', marginTop: 4 }}>{validStats.uniqueEmployees} người</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Đã phát sinh lượt bấm</div>
            </div>
            <div style={{ backgroundColor: '#FFF', padding: 16, borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: '#64748B' }}>Chấm qua điện thoại</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0284C7', marginTop: 4 }}>{validStats.mobileCount} lượt</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Thiết bị di động của nhân viên</div>
            </div>
            <div style={{ backgroundColor: '#FFF', padding: 16, borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: '#64748B' }}>Chấp thuận từ quản lý</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>{validStats.approvedCount} lượt</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Được phê duyệt ngoại lệ</div>
            </div>
          </div>

          {/* Dữ liệu hiển thị */}
          {loadingValid ? (
            <div style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 48, textAlign: 'center', color: '#64748B', border: '1px solid #E2E8F0' }}>
              <div style={{ width: 32, height: 32, border: '3px solid #E2E8F0', borderTopColor: '#0056B3', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div>Đang nạp dữ liệu chấm công hợp lệ trong kỳ...</div>
            </div>
          ) : filteredValidPunches.length === 0 ? (
            <div style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 48, textAlign: 'center', color: '#64748B', border: '1px solid #E2E8F0' }}>
              <CheckCircle2 size={42} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>
                Chưa có dữ liệu chấm công hợp lệ
              </div>
              <div style={{ fontSize: 13, color: '#94A3B8' }}>
                Không tìm thấy lượt chấm công hợp lệ hoặc đã duyệt nào trong khoảng thời gian {selectedPeriod?.fromDate} đến {selectedPeriod?.toDate}.
              </div>
            </div>
          ) : validSortMode === 'date' ? (
            /* CHẾ ĐỘ 1: SẮP XẾP THEO NGÀY */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {validByDate.map(([dateStr, dayPunches]) => {
                const empMap = new Map<string, any[]>();
                for (const p of dayPunches) {
                  if (!empMap.has(p.employeeCode)) empMap.set(p.employeeCode, []);
                  empMap.get(p.employeeCode)!.push(p);
                }
                const dayEmps = Array.from(empMap.entries());

                const d = new Date(dateStr);
                const dayOfWeekNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                const dayName = !isNaN(d.getDay()) ? dayOfWeekNames[d.getDay()] : '';
                const dateParts = dateStr.split('-');
                const displayDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

                return (
                  <div
                    key={dateStr}
                    style={{
                      backgroundColor: '#FFF',
                      borderRadius: 12,
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Header Ngày */}
                    <div style={{
                      backgroundColor: '#F8FAFC',
                      padding: '12px 18px',
                      borderBottom: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          backgroundColor: '#0056B3',
                          color: '#FFF',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 800
                        }}>
                          {dayName}
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#1E293B' }}>
                          {displayDate}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#64748B' }}>
                        <span>Có mặt: <strong style={{ color: '#0056B3' }}>{dayEmps.length}</strong> nhân viên</span>
                        <span>•</span>
                        <span>Tổng: <strong style={{ color: '#16A34A' }}>{dayPunches.length}</strong> lượt chấm công</span>
                      </div>
                    </div>

                    {/* Bảng nhân viên trong ngày */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ backgroundColor: '#FAFBFD', borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                            <th style={{ padding: '10px 14px' }}>Nhân viên</th>
                            <th style={{ padding: '10px 14px' }}>Phòng ban</th>
                            <th style={{ padding: '10px 14px', width: 90 }}>Giờ vào</th>
                            <th style={{ padding: '10px 14px', width: 90 }}>Giờ ra</th>
                            <th style={{ padding: '10px 14px', width: 70, textAlign: 'center' }}>Số lượt</th>
                            <th style={{ padding: '10px 14px' }}>Chi tiết các lượt bấm</th>
                            <th style={{ padding: '10px 14px' }}>Cơ sở</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dayEmps.map(([empCode, empPunches]) => {
                            const first = empPunches[0];
                            const empName = first?.employeeName || empCode;
                            const deptName = first?.departmentName || '—';
                            const inTime = first?.dailyInTime || empPunches[0]?.timeLocal || '—';
                            const outTime = first?.dailyOutTime || (empPunches.length > 1 ? empPunches[empPunches.length - 1]?.timeLocal : '—');

                            return (
                              <tr
                                key={empCode}
                                style={{ borderBottom: '1px solid #F1F5F9', transition: 'background-color 0.15s ease' }}
                              >
                                <td style={{ padding: '10px 14px' }}>
                                  <div style={{ fontWeight: 700, color: '#1E293B' }}>{empName}</div>
                                  <div style={{ fontSize: 11, color: '#64748B' }}>Mã: {empCode}</div>
                                </td>

                                <td style={{ padding: '10px 14px', color: '#475569' }}>
                                  {deptName}
                                </td>

                                <td style={{ padding: '10px 14px' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    backgroundColor: inTime !== '—' ? '#DCFCE7' : '#F1F5F9',
                                    color: inTime !== '—' ? '#16A34A' : '#94A3B8'
                                  }}>
                                    {inTime}
                                  </span>
                                </td>

                                <td style={{ padding: '10px 14px' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    backgroundColor: outTime !== '—' && outTime !== inTime ? '#E0F2FE' : '#F1F5F9',
                                    color: outTime !== '—' && outTime !== inTime ? '#0284C7' : '#94A3B8'
                                  }}>
                                    {outTime}
                                  </span>
                                </td>

                                <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#0F172A' }}>
                                  {empPunches.length}
                                </td>

                                <td style={{ padding: '10px 14px' }}>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {empPunches.map((punch: any) => {
                                      const isApprove = punch.reviewState === 'ACCEPTED';
                                      return (
                                        <div
                                          key={punch.webLogId}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '3px 8px',
                                            borderRadius: 6,
                                            fontSize: 11,
                                            fontWeight: 600,
                                            backgroundColor: isApprove ? '#EFF6FF' : '#F0FDF4',
                                            border: `1px solid ${isApprove ? '#BFDBFE' : '#BBF7D0'}`,
                                            color: isApprove ? '#1E40AF' : '#166534'
                                          }}
                                          title={`Lượt chấm công hợp lệ: ${punch.timeLocal} (${punch.channel === 'MOBILE_PWA' ? 'Điện thoại' : 'Máy tính'})`}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {punch.channel === 'MOBILE_PWA' ? <Smartphone size={11} /> : <Laptop size={11} />}
                                            <span>{punch.timeLocal}</span>
                                            {isApprove && (
                                              <span style={{ fontSize: 9, padding: '1px 3px', borderRadius: 4, backgroundColor: '#DBEAFE', color: '#1E40AF' }}>
                                                Duyệt
                                              </span>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeletePunchSingle(punch.webLogId, punch.employeeName || punch.employeeCode, punch.timeLocal);
                                            }}
                                            style={{
                                              border: 'none',
                                              background: 'transparent',
                                              padding: '0 0 0 4px',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              opacity: 0.7
                                            }}
                                            title="Xóa lượt chấm công này"
                                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                                          >
                                            <Trash2 size={12} color="#DC2626" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>

                                <td style={{ padding: '10px 14px', color: '#64748B', fontSize: 12 }}>
                                  <div>{first?.branchName || first?.detectedBranchCode || 'Trụ sở'}</div>
                                  {first?.clientPublicIP && (
                                    <div style={{ fontSize: 10, color: '#94A3B8' }}>{first.clientPublicIP}</div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* CHẾ ĐỘ 2: SẮP XẾP THEO NGƯỜI */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {validByEmployee.map(empGroup => {
                const isExpanded = !!expandedEmps[empGroup.employeeCode];
                const datesWorked = Array.from(new Set(empGroup.punches.map(p => p.workDate))).sort((a, b) => b.localeCompare(a));

                return (
                  <div
                    key={empGroup.employeeCode}
                    style={{
                      backgroundColor: '#FFF',
                      borderRadius: 12,
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Header thông tin nhân viên */}
                    <div
                      onClick={() => setExpandedEmps(prev => ({ ...prev, [empGroup.employeeCode]: !prev[empGroup.employeeCode] }))}
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                        cursor: 'pointer',
                        backgroundColor: isExpanded ? '#F8FAFC' : '#FFF',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          backgroundColor: '#EFF6FF',
                          color: '#0056B3',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14
                        }}>
                          {empGroup.employeeName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#1E293B' }}>{empGroup.employeeName}</span>
                            <span style={{ fontSize: 12, color: '#64748B', backgroundColor: '#F1F5F9', padding: '1px 6px', borderRadius: 4 }}>
                              Mã: {empGroup.employeeCode}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                            Phòng ban: <strong>{empGroup.departmentName || 'Chung'}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, color: '#16A34A', fontWeight: 700 }}>
                            {datesWorked.length} ngày đi làm
                          </div>
                          <div style={{ fontSize: 11, color: '#64748B' }}>
                            {empGroup.punches.length} lượt chấm công hợp lệ
                          </div>
                        </div>

                        <div style={{ color: '#0056B3', display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                      </div>
                    </div>

                    {/* Chi tiết lịch sử chấm công theo ngày của nhân viên */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #E2E8F0', padding: '12px 18px', backgroundColor: '#FAFBFD' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
                          LỊCH SỬ CHẤM CÔNG CHI TIẾT TRONG {selectedPeriod?.name?.toUpperCase()}
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, backgroundColor: '#FFF', borderRadius: 8, overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#F1F5F9', textAlign: 'left', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                              <th style={{ padding: '8px 12px' }}>Ngày làm việc</th>
                              <th style={{ padding: '8px 12px', width: 90 }}>Giờ vào</th>
                              <th style={{ padding: '8px 12px', width: 90 }}>Giờ ra</th>
                              <th style={{ padding: '8px 12px', width: 70, textAlign: 'center' }}>Số lượt</th>
                              <th style={{ padding: '8px 12px' }}>Chi tiết các lượt quẹt</th>
                              <th style={{ padding: '8px 12px' }}>Cơ sở</th>
                            </tr>
                          </thead>
                          <tbody>
                            {datesWorked.map(wDate => {
                              const dayPunches = empGroup.punches.filter(p => p.workDate === wDate);
                              const first = dayPunches[0];
                              const inTime = first?.dailyInTime || dayPunches[0]?.timeLocal || '—';
                              const outTime = first?.dailyOutTime || (dayPunches.length > 1 ? dayPunches[dayPunches.length - 1]?.timeLocal : '—');

                              const d = new Date(wDate);
                              const dayOfWeekNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                              const dayName = !isNaN(d.getDay()) ? dayOfWeekNames[d.getDay()] : '';
                              const dateParts = wDate.split('-');
                              const displayDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

                              return (
                                <tr key={wDate} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                                    <span style={{ color: '#0056B3', marginRight: 6 }}>{dayName}</span>
                                    <span>{displayDate}</span>
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span style={{
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                      backgroundColor: inTime !== '—' ? '#DCFCE7' : '#F1F5F9',
                                      color: inTime !== '—' ? '#16A34A' : '#94A3B8'
                                    }}>
                                      {inTime}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span style={{
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                      backgroundColor: outTime !== '—' && outTime !== inTime ? '#E0F2FE' : '#F1F5F9',
                                      color: outTime !== '—' && outTime !== inTime ? '#0284C7' : '#94A3B8'
                                    }}>
                                      {outTime}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>
                                    {dayPunches.length}
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                      {dayPunches.map((punch: any) => {
                                        const isApprove = punch.reviewState === 'ACCEPTED';
                                        return (
                                          <div
                                            key={punch.webLogId}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 4,
                                              padding: '2px 6px',
                                              borderRadius: 4,
                                              fontSize: 11,
                                              fontWeight: 600,
                                              backgroundColor: isApprove ? '#EFF6FF' : '#F0FDF4',
                                              border: `1px solid ${isApprove ? '#BFDBFE' : '#BBF7D0'}`,
                                              color: isApprove ? '#1E40AF' : '#166534',
                                            }}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                              {punch.channel === 'MOBILE_PWA' ? <Smartphone size={10} /> : <Laptop size={10} />}
                                              <span>{punch.timeLocal}</span>
                                              {isApprove && <span style={{ fontSize: 9 }}>Duyệt</span>}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeletePunchSingle(punch.webLogId, punch.employeeName || punch.employeeCode, punch.timeLocal);
                                              }}
                                              style={{
                                                border: 'none',
                                                background: 'transparent',
                                                padding: '0 0 0 3px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                opacity: 0.7
                                              }}
                                              title="Xóa lượt chấm công này"
                                              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                                            >
                                              <Trash2 size={11} color="#DC2626" />
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td style={{ padding: '8px 12px', color: '#64748B' }}>
                                    {first?.branchName || first?.detectedBranchCode || 'Trụ sở'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: QUẢN LÝ THIẾT BỊ */}
      {activeTab === 'devices' && (
        <div style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1E293B', marginBottom: 14 }}>
            Danh Sách Thiết Bị Của Nhân Viên
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Mã NV</th>
                  <th style={{ padding: '10px 12px' }}>Loại</th>
                  <th style={{ padding: '10px 12px' }}>Tên thiết bị</th>
                  <th style={{ padding: '10px 12px' }}>Địa chỉ MAC</th>
                  <th style={{ padding: '10px 12px' }}>Hệ điều hành / Trình duyệt</th>
                  <th style={{ padding: '10px 12px' }}>Trạng thái</th>
                  <th style={{ padding: '10px 12px' }}>Ngày yêu cầu</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Thao tác HCNS</th>
                </tr>
              </thead>
              <tbody>
                {devices.length > 0 ? (
                  devices.map(d => (
                    <tr key={d.deviceBindingId} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0056B3' }}>{d.employeeCode}</td>
                      <td style={{ padding: '10px 12px' }}>{d.deviceType === 'MOBILE' ? '📱 Mobile' : '💻 PC'}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{d.deviceName || '—'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#0056B3', fontSize: 12 }}>
                        {d.fingerprintHash || '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{d.operatingSystem} · {d.browserInfo}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: d.approvalStatus === 'APPROVED' ? '#DCFCE7' :
                            d.approvalStatus === 'PENDING' ? '#FEF9C3' : '#FEE2E2',
                          color: d.approvalStatus === 'APPROVED' ? '#166534' :
                            d.approvalStatus === 'PENDING' ? '#854D0E' : '#991B1B'
                        }}>
                          {d.approvalStatus}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{new Date(d.requestedAtUtc).toLocaleDateString('vi-VN')}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {d.deviceType === 'PC' && (
                            <button
                              onClick={() => handleUpdateDeviceMac(d.deviceBindingId, d.fingerprintHash)}
                              style={{ backgroundColor: '#EFF6FF', color: '#0056B3', border: '1px solid #BFDBFE', padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                              title="Chỉnh sửa hoặc gán địa chỉ MAC cho máy tính"
                            >
                              Sửa MAC
                            </button>
                          )}
                          {d.approvalStatus === 'PENDING' ? (
                            <>
                              <button
                                onClick={() => handleDecideDevice(d.deviceBindingId, 'APPROVE')}
                                style={{ backgroundColor: '#16A34A', color: '#FFF', border: 'none', padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                              >
                                Duyệt
                              </button>
                              <button
                                onClick={() => handleDecideDevice(d.deviceBindingId, 'REJECT')}
                                style={{ backgroundColor: '#DC2626', color: '#FFF', border: 'none', padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                              >
                                Từ chối
                              </button>
                            </>
                          ) : d.approvalStatus === 'APPROVED' ? (
                            <button
                              onClick={() => handleRevokeDevice(d.deviceBindingId)}
                              style={{ backgroundColor: '#F1F5F9', color: '#DC2626', border: '1px solid #CBD5E1', padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              Thu hồi (Reset)
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#94A3B8' }}>
                      Không có thiết bị nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CẤU HÌNH VỊ TRÍ & MẠNG VĂN PHÒNG */}
      {activeTab === 'settings' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Cột 1: Cấu hình Mạng Internet Văn Phòng */}
            <div style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Wifi size={18} color="#0056B3" />
                  Mạng Internet Văn Phòng (Wifi / Mạng LAN)
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={handleUseMyIp}
                    disabled={detectingIp}
                    title="Hệ thống sẽ tự nhận diện IP Internet hiện tại của văn phòng bạn đang ngồi"
                    style={{
                      backgroundColor: detectingIp ? '#94A3B8' : '#0056B3',
                      color: '#FFF',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: detectingIp ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Plus size={14} /> {detectingIp ? 'Đang nhận diện IP...' : 'Dùng IP hiện tại của tôi'}
                  </button>
                  <a
                    href="https://whatismyipaddress.com/"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                      border: '1px solid #CBD5E1',
                      padding: '6px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Globe size={14} /> Tra cứu IP <ExternalLink size={12} />
                  </a>
                </div>
              </div>
              <form onSubmit={handleAddNetwork} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  type="text"
                  placeholder="Ví dụ: 113.161.45.10 hoặc 113.161.45.10/32"
                  value={newCidr}
                  onChange={e => setNewCidr(e.target.value)}
                  required
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                />
                <input
                  type="text"
                  placeholder="Ghi chú (Wifi Tầng 1...)"
                  value={newCidrDesc}
                  onChange={e => setNewCidrDesc(e.target.value)}
                  style={{ width: 140, padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                />
                <button
                  type="submit"
                  style={{ backgroundColor: '#FFC72C', color: '#1E293B', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
                >
                  Thêm
                </button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {networks.length > 0 ? (
                  networks.map(n => (
                    <div key={n.networkId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div>
                        <code style={{ fontWeight: 700, color: '#0056B3' }}>{n.cidr}</code>
                        {n.description && <span style={{ fontSize: 12, color: '#64748B', marginLeft: 8 }}>({n.description})</span>}
                      </div>
                      <button
                        onClick={async () => {
                          if (confirm('Xóa dải IP này?')) {
                            await branchSettingsApi.deleteNetwork(branchCode, n.networkId);
                            loadData();
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: 4 }}
                        title="Xóa IP"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: 20, color: '#94A3B8', fontSize: 13 }}>
                    Chưa có Public IP nào được đăng ký cho cơ sở này.
                  </div>
                )}
              </div>
            </div>

            {/* Cột 2: Cấu hình Geofence Locations */}
            <div style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={18} color="#16A34A" />
                  Tọa Độ Vị Trí Văn Phòng (GPS)
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={handleGetGpsCurrentLocation}
                    disabled={gettingGps}
                    title="Bật GPS thiết bị để tự động lấy tọa độ Lat, Lng cơ sở"
                    style={{
                      backgroundColor: gettingGps ? '#94A3B8' : '#16A34A',
                      color: '#FFF',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: gettingGps ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Navigation size={14} /> {gettingGps ? 'Đang đọc GPS...' : '📍 Bật GPS lấy vị trí'}
                  </button>
                  <a
                    href="https://www.google.com/maps"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                      border: '1px solid #CBD5E1',
                      padding: '6px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Compass size={14} /> Mở Google Maps <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              <form onSubmit={handleAddLocation} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                <input
                  type="text"
                  placeholder="Tên điểm (Ví dụ: Cổng chính, Tòa nhà Superbrain)"
                  value={newLocName}
                  onChange={e => setNewLocName(e.target.value)}
                  required
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748B', fontWeight: 600, display: 'block', marginBottom: 2 }}>Vĩ độ (Latitude)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="vd: 10.796123"
                      value={newLocLat}
                      onChange={e => setNewLocLat(e.target.value)}
                      required
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748B', fontWeight: 600, display: 'block', marginBottom: 2 }}>Kinh độ (Longitude)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="vd: 106.685321"
                      value={newLocLng}
                      onChange={e => setNewLocLng(e.target.value)}
                      required
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748B', fontWeight: 600, display: 'block', marginBottom: 2 }}>Bán kính (m)</label>
                    <input
                      type="number"
                      placeholder="vd: 50"
                      value={newLocRadius}
                      onChange={e => setNewLocRadius(e.target.value)}
                      required
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  style={{ backgroundColor: '#16A34A', color: '#FFF', border: 'none', padding: '9px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}
                >
                  + Thêm Điểm Geofence Này
                </button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {locations.length > 0 ? (
                  locations.map(l => (
                    <div key={l.locationId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{l.locationName}</span>
                          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 700 }}>
                            Bán kính: {l.radiusMeters}m
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                          Tọa độ: <code>{l.latitude}, {l.longitude}</code>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (confirm('Xóa điểm Geofence này?')) {
                            await branchSettingsApi.deleteLocation(branchCode, l.locationId);
                            loadData();
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: 4 }}
                        title="Xóa điểm Geofence"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: 20, color: '#94A3B8', fontSize: 13 }}>
                    Chưa có điểm Geofence nào được đăng ký cho cơ sở này.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CÔNG BỐ BẢNG CÔNG & KHIẾU NẠI */}
      {activeTab === 'publication' && (
        <div style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#1E293B' }}>Khiếu Nại Bảng Công Từ Nhân Viên</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>Nhân viên có quyền khiếu nại trong 3 ngày sau khi công bố bảng công chính thức.</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {disputes.length > 0 ? (
              disputes.map(d => (
                <div key={d.disputeId} style={{ padding: 14, borderRadius: 10, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#0056B3' }}>Mã NV: {d.employeeCode}</span>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      backgroundColor: d.status === 'ACCEPTED' ? '#DCFCE7' :
                        d.status === 'OPEN' ? '#FEF9C3' : '#FEE2E2',
                      color: d.status === 'ACCEPTED' ? '#166534' :
                        d.status === 'OPEN' ? '#854D0E' : '#991B1B'
                    }}>
                      {d.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>
                    Nội dung: <strong>{d.content}</strong>
                  </div>
                  {d.hrResponse && (
                    <div style={{ fontSize: 12, color: '#166534', backgroundColor: '#F0FDF4', padding: '6px 10px', borderRadius: 6, marginTop: 6 }}>
                      Phản hồi HCNS: {d.hrResponse}
                    </div>
                  )}
                  {d.status === 'OPEN' && (
                    <div style={{ marginTop: 8 }}>
                      {resolvingDisputeId === d.disputeId ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Nhập phản hồi cho nhân viên..."
                            value={disputeResponse}
                            onChange={e => setDisputeResponse(e.target.value)}
                            style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                          />
                          <button
                            onClick={() => handleResolveDispute(d.disputeId, 'ACCEPT')}
                            style={{ backgroundColor: '#16A34A', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
                          >
                            Chấp thuận
                          </button>
                          <button
                            onClick={() => handleResolveDispute(d.disputeId, 'REJECT')}
                            style={{ backgroundColor: '#DC2626', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
                          >
                            Từ chối
                          </button>
                          <button
                            onClick={() => setResolvingDisputeId(null)}
                            style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setResolvingDisputeId(d.disputeId)}
                          style={{ backgroundColor: '#0056B3', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Xử lý khiếu nại
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94A3B8' }}>Không có khiếu nại nào.</div>
            )}
          </div>
        </div>
      )}

      {/* MODAL XEM CHI TIẾT VỊ TRÍ CHẤM CÔNG & PHÊ DUYỆT TRỰC TIẾP */}
      {inspectPunch && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            width: '100%',
            maxWidth: 720,
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #E2E8F0'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#FEE2E2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#E31837'
                }}>
                  <MapPinned size={22} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: '#1E293B' }}>
                    Vị Trí Chấm Công & Phê Duyệt Lượt Quẹt
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    Mã lượt: #{inspectPunch.webLogId} • {inspectPunch.employeeName} ({inspectPunch.employeeCode})
                  </div>
                </div>
              </div>
              <button
                onClick={() => setInspectPunch(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Body */}
            <div style={{ padding: 20 }}>
              {/* Thẻ tóm tắt thông tin */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 10,
                marginBottom: 16,
                backgroundColor: '#F1F5F9',
                padding: 12,
                borderRadius: 10
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>THỜI GIAN</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>
                    {inspectPunch.timeLocal} ({inspectPunch.workDate})
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>KÊNH THỰC HIỆN</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0056B3' }}>
                    {inspectPunch.channel === 'MOBILE_PWA' ? '📱 Mobile PWA' : '💻 PC Web'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>ĐÁNH GIÁ HỆ THỐNG</div>
                  <div>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      backgroundColor: inspectPunch.verificationStatus === 'VALID' ? '#DCFCE7' :
                        inspectPunch.verificationStatus === 'REVIEW' ? '#FEF9C3' : '#FEE2E2',
                      color: inspectPunch.verificationStatus === 'VALID' ? '#166534' :
                        inspectPunch.verificationStatus === 'REVIEW' ? '#854D0E' : '#991B1B'
                    }}>
                      {inspectPunch.verificationStatus}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>CỜ CẢNH BÁO</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309' }}>
                    {inspectPunch.reasonCode || 'Không có cờ'}
                  </div>
                </div>
              </div>

              {/* Bản đồ trực quan */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Compass size={16} color="#0056B3" />
                    Bản Đồ Vị Trí Thực Tế (Google Maps)
                  </div>
                  {inspectPunch.latitude && inspectPunch.longitude && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          const url = `https://www.google.com/maps?q=${inspectPunch.latitude},${inspectPunch.longitude}`;
                          window.open(url, '_blank');
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: '#EFF6FF',
                          color: '#1D4ED8',
                          border: '1px solid #BFDBFE',
                          padding: '4px 8px',
                          borderRadius: 6,
                          cursor: 'pointer'
                        }}
                      >
                        <ExternalLink size={12} />
                        Mở Google Maps Vệ Tinh
                      </button>
                      {inspectPunch.branchLatitude && inspectPunch.branchLongitude && (
                        <button
                          onClick={() => {
                            const url = `https://www.google.com/maps/dir/${inspectPunch.branchLatitude},${inspectPunch.branchLongitude}/${inspectPunch.latitude},${inspectPunch.longitude}`;
                            window.open(url, '_blank');
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: '#F0FDF4',
                            color: '#15803D',
                            border: '1px solid #BBF7D0',
                            padding: '4px 8px',
                            borderRadius: 6,
                            cursor: 'pointer'
                          }}
                        >
                          <Navigation size={12} />
                          Chỉ Đường Từ Cơ Sở
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {inspectPunch.latitude && inspectPunch.longitude ? (
                  <div>
                    <iframe
                      title="Vị trí chấm công của nhân viên trên Google Maps"
                      width="100%"
                      height="280"
                      frameBorder="0"
                      scrolling="no"
                      marginHeight={0}
                      marginWidth={0}
                      src={`https://maps.google.com/maps?q=${inspectPunch.latitude},${inspectPunch.longitude}&hl=vi&z=16&output=embed`}
                      style={{ borderRadius: 10, border: '1px solid #CBD5E1', display: 'block' }}
                      loading="lazy"
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 11, color: '#64748B' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={12} color="#E31837" />
                        <span>Marker đỏ trên bản đồ thể hiện vị trí nhân viên lúc bấm chấm công</span>
                      </div>
                      <div
                        onClick={() => {
                          navigator.clipboard.writeText(`${inspectPunch.latitude}, ${inspectPunch.longitude}`);
                          addToast('Đã sao chép tọa độ vào clipboard!', 'success');
                        }}
                        style={{ cursor: 'pointer', color: '#0056B3', textDecoration: 'underline', fontWeight: 600 }}
                        title="Bấm để sao chép"
                      >
                        Sao chép tọa độ ({Number(inspectPunch.latitude).toFixed(6)}, {Number(inspectPunch.longitude).toFixed(6)})
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: 24,
                    textAlign: 'center',
                    backgroundColor: '#F8FAFC',
                    border: '1px dashed #CBD5E1',
                    borderRadius: 10
                  }}>
                    <Building2 size={32} color="#0056B3" style={{ margin: '0 auto 8px auto' }} />
                    <div style={{ fontWeight: 700, color: '#1E293B', fontSize: 14 }}>
                      Chấm Công Qua Máy Tính PC Văn Phòng
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                      Lượt bấm này không sử dụng GPS vệ tinh mà được xác thực qua Mạng Public IP và Địa chỉ Thiết bị.
                    </div>
                  </div>
                )}
              </div>

              {/* Thông số kỹ thuật chi tiết */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginBottom: 16
              }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, backgroundColor: '#FAFAFA' }}>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>TỌA ĐỘ GPS CHÍNH XÁC</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                    {inspectPunch.latitude ? `${Number(inspectPunch.latitude).toFixed(6)}, ${Number(inspectPunch.longitude).toFixed(6)}` : 'Không có GPS'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    Độ lệch GPS: <strong>±{inspectPunch.gpsAccuracyMeters || 0}m</strong>
                  </div>
                </div>

                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, backgroundColor: '#FAFAFA' }}>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>CƠ SỞ & KHOẢNG CÁCH</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                    {inspectPunch.branchName || inspectPunch.detectedBranchCode || 'Hội sở'}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Cách tâm: <strong>{inspectPunch.distanceMeters != null ? `${Math.round(inspectPunch.distanceMeters)}m` : '—'}</strong></span>
                    {inspectPunch.distanceMeters != null && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 4,
                        backgroundColor: inspectPunch.distanceMeters <= (inspectPunch.branchRadiusMeters || 50) ? '#DCFCE7' : '#FEE2E2',
                        color: inspectPunch.distanceMeters <= (inspectPunch.branchRadiusMeters || 50) ? '#166534' : '#991B1B'
                      }}>
                        {inspectPunch.distanceMeters <= (inspectPunch.branchRadiusMeters || 50) ? 'Trong vùng' : 'Ngoài vùng'}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, backgroundColor: '#FAFAFA' }}>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>MẠNG PUBLIC IP</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                    <code>{inspectPunch.clientPublicIP}</code>
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: inspectPunch.ipOk ? '#16A34A' : '#DC2626' }}>
                    {inspectPunch.ipOk ? '🟢 Khớp Wi-Fi văn phòng' : '🔴 Ngoài mạng văn phòng'}
                  </div>
                </div>

                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, backgroundColor: '#FAFAFA' }}>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>THIẾT BỊ SỬ DỤNG</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginTop: 2, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={inspectPunch.deviceInfo}>
                    {inspectPunch.deviceInfo || inspectPunch.channel}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    Trạng thái cờ: <strong>{inspectPunch.reviewState}</strong>
                  </div>
                </div>
              </div>

              {/* Khu vực phê duyệt của HCNS */}
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: 10,
                padding: 14
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>
                    Phê Duyệt Lượt Quẹt Này
                  </div>
                  <div style={{ fontSize: 12 }}>
                    Trạng thái hiện tại:{' '}
                    <span style={{
                      fontWeight: 800,
                      color: inspectPunch.reviewState === 'ACCEPTED' ? '#16A34A' :
                        inspectPunch.reviewState === 'REJECTED' ? '#DC2626' : '#D97706'
                    }}>
                      {inspectPunch.reviewState === 'ACCEPTED' ? 'ĐÃ CHẤP THUẬN' :
                        inspectPunch.reviewState === 'REJECTED' ? 'ĐÃ TỪ CHỐI' : 'CHỜ DUYỆT'}
                    </span>
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <input
                    type="text"
                    placeholder="Nhập ghi chú / lý do phê duyệt (ví dụ: Nhân viên đi công tác/họp phụ huynh bên ngoài)..."
                    value={inspectNote}
                    onChange={e => setInspectNote(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      fontSize: 13,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    disabled={processingInspect}
                    onClick={handleInspectDelete}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: '#FEE2E2',
                      color: '#991B1B',
                      border: '1px solid #FECACA',
                      padding: '9px 18px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: processingInspect ? 'wait' : 'pointer',
                      opacity: processingInspect ? 0.7 : 1
                    }}
                    title="Xóa vĩnh viễn lượt chấm công này khỏi cơ sở dữ liệu"
                  >
                    <Trash2 size={15} color="#DC2626" />
                    Xóa Dữ Liệu
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      disabled={processingInspect}
                      onClick={() => handleInspectReview('REJECT')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#DC2626',
                        color: '#FFF',
                        border: 'none',
                        padding: '9px 18px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: processingInspect ? 'wait' : 'pointer',
                        opacity: processingInspect ? 0.7 : 1
                      }}
                    >
                      <XCircle size={15} />
                      Từ Chối Lượt Bấm
                    </button>

                    <button
                      disabled={processingInspect}
                      onClick={() => handleInspectReview('ACCEPT')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#16A34A',
                        color: '#FFF',
                        border: 'none',
                        padding: '9px 18px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: processingInspect ? 'wait' : 'pointer',
                        opacity: processingInspect ? 0.7 : 1
                      }}
                    >
                      <CheckCircle2 size={15} />
                      Chấp Thuận Hợp Lệ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
