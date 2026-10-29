import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Employee, Department, EmployeeGroup, LeaveFund, LeaveLedgerItem, LeaveRequest } from '../../types';
import { api } from '../../api/client';
import { DateInput } from '../../components/DateInput';
import {
  UserCheck,
  Plus,
  Edit2,
  Trash2,
  Upload,
  Download,
  Search,
  Layers,
  FolderTree,
  FileSpreadsheet,
  History,
  Wallet,
  Calendar,
  X,
  CheckCircle2,
  AlertCircle,
  UserMinus,
  EyeOff,
  Eye,
  UserX
} from 'lucide-react';

interface EmployeesManagerProps {
  onBack?: () => void;
}

export const EmployeesManager: React.FC<EmployeesManagerProps> = ({ onBack }) => {
  const { selectedCompany, user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const toast = useToast();
  const currentYear = new Date().getFullYear();
  const [activeTab, setActiveTab] = useState<'employees' | 'departments' | 'groups'>('employees');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [funds, setFunds] = useState<Record<number, LeaveFund>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal Employee
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<number | null>(null);
  const [empCode, setEmpCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [deptId, setDeptId] = useState<number | undefined>(undefined);
  const [groupId, setGroupId] = useState<number>(0);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [exemptPunch, setExemptPunch] = useState(false);
  const [defaultNote, setDefaultNote] = useState('');
  const [employeeType, setEmployeeType] = useState<'STANDARD' | 'REMOTE' | 'PARTTIME'>('STANDARD');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState(0);
  const [createUserAccount, setCreateUserAccount] = useState(true);
  const [accountPassword, setAccountPassword] = useState('123456');
  const [savingEmp, setSavingEmp] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);

  // Modal Department
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptSort, setDeptSort] = useState(0);

  // Modal Import Excel
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ importedCount: number; errors: string[] } | null>(null);

  // Modal Sổ Cái & Lịch Sử Phép
  const [viewingLeaveEmp, setViewingLeaveEmp] = useState<Employee | null>(null);
  const [empLedger, setEmpLedger] = useState<LeaveLedgerItem[]>([]);
  const [empRequests, setEmpRequests] = useState<LeaveRequest[]>([]);
  const [loadingLeave, setLoadingLeave] = useState(false);
  const [showEditFund, setShowEditFund] = useState(false);
  const [annualOpen, setAnnualOpen] = useState<number>(12);
  const [carryOpen, setCarryOpen] = useState<number>(0);
  const [compOpen, setCompOpen] = useState<number>(0);
  const [savingFund, setSavingFund] = useState(false);
  const [fundMessage, setFundMessage] = useState<string | null>(null);

  // Modal Terminate (Cho nghỉ việc)
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [terminatingEmp, setTerminatingEmp] = useState<Employee | null>(null);
  const [terminateDate, setTerminateDate] = useState(new Date().toISOString().split('T')[0]);
  const [terminateReason, setTerminateReason] = useState('');
  const [savingTerminate, setSavingTerminate] = useState(false);

  // Bộ lọc hiện/ẩn nhân viên nghỉ việc
  const [showTerminated, setShowTerminated] = useState(false);

  const fetchData = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [eRes, dRes, gRes, fRes] = await Promise.all([
        api.get<Employee[]>(`/companies/${selectedCompany.id}/employees`),
        api.get<Department[]>(`/companies/${selectedCompany.id}/departments`),
        api.get<EmployeeGroup[]>(`/companies/${selectedCompany.id}/groups`),
        api.get<LeaveFund[]>(`/companies/${selectedCompany.id}/leave/funds?year=${currentYear}`).catch(() => ({ data: [] as LeaveFund[] }))
      ]);
      setEmployees(eRes.data);
      setDepartments(dRes.data);
      setGroups(gRes.data);

      const fMap: Record<number, LeaveFund> = {};
      if (fRes?.data) {
        fRes.data.forEach(f => {
          fMap[f.employeeId] = f;
        });
      }
      setFunds(fMap);

      if (gRes.data.length > 0 && groupId === 0) {
        setGroupId(gRes.data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCompany?.id]);

  const handleOpenCreateEmp = () => {
    setEditingEmpId(null);
    setEmpCode('');
    setFullName('');
    setDeptId(departments.length > 0 ? departments[0].id : undefined);
    setGroupId(groups.length > 0 ? groups[0].id : 0);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setExemptPunch(false);
    setEmployeeType('STANDARD');
    setDefaultNote('');
    setSortOrder(employees.length + 1);
    setEmpError(null);
    setShowEmpModal(true);
  };

  const handleOpenEditEmp = (e: Employee) => {
    setEditingEmpId(e.id);
    setEmpCode(e.employeeCode);
    setFullName(e.fullName);
    setDeptId(e.departmentId);
    setGroupId(e.groupId);
    setStartDate(e.startDate ? e.startDate.split('T')[0] : '');
    setEndDate(e.endDate ? e.endDate.split('T')[0] : '');
    setExemptPunch(e.exemptPunch);
    setEmployeeType((e.employeeType as any) || 'STANDARD');
    setDefaultNote(e.defaultNote || '');
    setSortOrder(e.sortOrder);
    setEmpError(null);
    setShowEmpModal(true);
  };

  const handleSaveEmp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    setSavingEmp(true);
    setEmpError(null);

    const compPrefix = (selectedCompany.code || `c${selectedCompany.id}`).trim().toLowerCase();
    const autoUsername = `${compPrefix}_${empCode.trim().toLowerCase()}`;

    const payload = {
      employeeCode: empCode.trim(),
      fullName: fullName.trim(),
      departmentId: deptId,
      groupId: groupId,
      startDate: startDate,
      endDate: endDate || null,
      exemptPunch: exemptPunch,
      employeeType: employeeType,
      defaultNote: defaultNote.trim() || null,
      sortOrder: sortOrder,
      createUserAccount: !editingEmpId ? createUserAccount : false,
      username: autoUsername,
      password: accountPassword
    };

    try {
      if (editingEmpId) {
        await api.put(`/companies/${selectedCompany.id}/employees/${editingEmpId}`, payload);
      } else {
        await api.post(`/companies/${selectedCompany.id}/employees`, payload);
      }
      setShowEmpModal(false);
      fetchData();
      toast.success(editingEmpId ? 'Đã cập nhật thông tin nhân viên.' : 'Đã thêm nhân viên và cấp tài khoản thành công!');
    } catch (err: any) {
      setEmpError(err.response?.data?.message || 'Có lỗi xảy ra khi lưu nhân viên');
    } finally {
      setSavingEmp(false);
    }
  };

  const handleQuickCreateAccount = async (emp: Employee) => {
    if (!selectedCompany) return;
    const confirmed = await toast.confirm({
      title: emp.hasAccount ? 'Đặt lại mật khẩu tài khoản' : 'Cấp tài khoản đăng nhập ESS',
      message: emp.hasAccount
        ? `Đặt lại mật khẩu cho tài khoản @${emp.username} (${emp.fullName}) về mặc định "123456"?`
        : `Cấp mới tài khoản đăng nhập tự phục vụ cho nhân viên ${emp.fullName} (Mã: ${emp.employeeCode}) với mật khẩu mặc định "123456"?`,
      confirmText: emp.hasAccount ? 'Đặt lại (123456)' : 'Cấp tài khoản',
      type: 'primary'
    });
    if (!confirmed) return;

    try {
      const res = await api.post(`/companies/${selectedCompany.id}/employees/${emp.id}/create-account`, {
        password: '123456'
      });
      toast.success(res.data.message || 'Thao tác tài khoản thành công!');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi cấp tài khoản.');
    }
  };

  const handleDeleteEmp = async (e: Employee) => {
    if (!selectedCompany) return;

    // BƯỚC 1: Toast confirm xác nhận xóa nhân sự
    const confirmedStep1 = await toast.confirm({
      title: 'Xác nhận xóa nhân sự (Bước 1/2)',
      message: `Bạn có chắc chắn muốn xóa nhân sự ${e.fullName} (Mã: ${e.employeeCode}) khỏi hội sở ${selectedCompany.name}?`,
      confirmText: 'Tiếp tục xóa',
      cancelText: 'Hủy bỏ',
      type: 'warning'
    });
    if (!confirmedStep1) return;

    try {
      // Thử xóa thông thường
      const res = await api.delete(`/companies/${selectedCompany.id}/employees/${e.id}`);
      toast.success(res.data?.message || `Đã xóa nhân viên ${e.fullName} thành công.`);
      fetchData();
    } catch (err: any) {
      const errMsg: string = err.response?.data?.message || '';
      const hasAttendanceData: boolean = err.response?.data?.hasAttendanceData || errMsg.includes('dữ liệu chấm công') || errMsg.includes('Ngày nghỉ việc');

      // Nếu nhân sự đã có dữ liệu chấm công:
      if (hasAttendanceData) {
        if (!isAdmin) {
          toast.error(errMsg || 'Nhân viên đã có dữ liệu chấm công trong hệ thống. Chỉ Quản trị viên (Admin) mới có quyền xóa vĩnh viễn nhân sự này, hoặc bạn hãy thiết lập Ngày nghỉ việc.');
          return;
        }

        // BƯỚC 2: Toast confirm nguy hiểm cấp cao cho Admin
        const confirmedStep2 = await toast.confirm({
          title: '⚠️ CẢNH BÁO NGUY HIỂM: Xóa vĩnh viễn (Bước 2/2)',
          message: `Nhân viên ${e.fullName} (${e.employeeCode}) ĐÃ CÓ DỮ LIỆU CHẤM CÔNG trong hệ thống. Thao tác này sẽ xóa VĨNH VIỄN nhân sự cùng TOÀN BỘ dữ liệu: lịch sử quẹt thẻ, kết quả công các tháng, quỹ phép, đơn giải trình và thiết bị chấm công. Dữ liệu KHÔNG THỂ KHÔI PHỤC! Bạn có chắc chắn 100% muốn xóa sạch không?`,
          confirmText: 'XÓA VĨNH VIỄN TẤT CẢ',
          cancelText: 'Hủy bỏ',
          type: 'danger'
        });
        if (!confirmedStep2) return;

        try {
          const forceRes = await api.delete(`/companies/${selectedCompany.id}/employees/${e.id}/force`);
          toast.success(forceRes.data?.message || `Đã xóa vĩnh viễn nhân viên ${e.fullName} và toàn bộ dữ liệu chấm công liên quan.`);
          fetchData();
        } catch (err2: any) {
          toast.error(err2.response?.data?.message || 'Xóa cưỡng bức thất bại.');
        }
      } else {
        toast.error(errMsg || 'Không thể xóa nhân viên.');
      }
    }
  };

  const handleOpenTerminate = (e: Employee) => {
    setTerminatingEmp(e);
    setTerminateDate(new Date().toISOString().split('T')[0]);
    setTerminateReason('');
    setShowTerminateModal(true);
  };

  const handleTerminateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !terminatingEmp) return;
    setSavingTerminate(true);
    try {
      const res = await api.post(`/companies/${selectedCompany.id}/employees/${terminatingEmp.id}/terminate`, {
        endDate: terminateDate,
        reason: terminateReason
      });
      toast.success(res.data?.message || `Đã thiết lập ngày nghỉ việc thành công.`);
      setShowTerminateModal(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi thiết lập ngày nghỉ việc.');
    } finally {
      setSavingTerminate(false);
    }
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    try {
      if (editingDeptId) {
        await api.put(`/companies/${selectedCompany.id}/departments/${editingDeptId}`, {
          name: deptName.trim(),
          sortOrder: deptSort,
        });
      } else {
        await api.post(`/companies/${selectedCompany.id}/departments`, {
          name: deptName.trim(),
          sortOrder: deptSort,
        });
      }
      setShowDeptModal(false);
      toast.success(editingDeptId ? 'Đã cập nhật bộ phận thành công.' : 'Đã thêm bộ phận mới thành công.');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi lưu bộ phận');
    }
  };

  const handleDeleteDept = async (d: Department) => {
    if (!selectedCompany) return;
    const confirmed = await toast.confirm({
      title: 'Xác nhận xóa bộ phận',
      message: `Bạn có chắc muốn xóa bộ phận "${d.name}" không?`,
      confirmText: 'Xóa bộ phận',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.delete(`/companies/${selectedCompany.id}/departments/${d.id}`);
      toast.success(`Đã xóa bộ phận "${d.name}" thành công.`);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa bộ phận');
    }
  };

  const handleDownloadTemplate = () => {
    if (!selectedCompany) return;
    const token = localStorage.getItem('token');
    fetch(`/api/companies/${selectedCompany.id}/employees/template-excel`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Mau_Danh_Sach_Nhan_Vien_Superbrain.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => {
        console.error(err);
        toast.error('Không thể tải file mẫu Excel.');
      });
  };

  const handleImportExcelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !importFile) return;

    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', importFile);

    try {
      const res = await api.post(`/companies/${selectedCompany.id}/employees/import-excel`, formData);
      setImportResult(res.data);
      toast.success(res.data.message || 'Import danh sách nhân sự thành công!');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi nạp file Excel.');
    } finally {
      setImporting(false);
    }
  };

  // Mở modal Sổ Cái & Lịch sử Nghỉ Phép
  const handleOpenLeaveLedger = async (emp: Employee) => {
    if (!selectedCompany) return;
    setViewingLeaveEmp(emp);
    setLoadingLeave(true);
    setShowEditFund(false);
    setFundMessage(null);

    const f = funds[emp.id];
    setAnnualOpen(f ? f.annualOpening : 12);
    setCarryOpen(f ? f.carryOpening : 0);
    setCompOpen(f ? f.compOpening : 0);

    try {
      const [lRes, rRes] = await Promise.all([
        api.get<LeaveLedgerItem[]>(`/companies/${selectedCompany.id}/leave/ledger/${emp.id}?year=${currentYear}`).catch(() => ({ data: [] })),
        api.get<LeaveRequest[]>(`/companies/${selectedCompany.id}/leave/requests?from=${currentYear}-01-01&to=${currentYear}-12-31`).catch(() => ({ data: [] }))
      ]);
      setEmpLedger(lRes.data || []);
      setEmpRequests((rRes.data || []).filter(r => r.employeeId === emp.id));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLeave(false);
    }
  };

  // Lưu điều chỉnh quỹ phép
  const handleSaveLeaveFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !viewingLeaveEmp) return;
    setSavingFund(true);
    setFundMessage(null);
    try {
      await api.post(`/companies/${selectedCompany.id}/leave/funds`, {
        employeeId: viewingLeaveEmp.id,
        year: currentYear,
        annualOpening: annualOpen,
        carryOpening: carryOpen,
        compOpening: compOpen
      });
      setFundMessage('Đã cập nhật số dư quỹ phép thành công!');
      toast.success(`Đã cập nhật số ngày nghỉ phép năm ${currentYear} thành công!`);
      setShowEditFund(false);
      fetchData();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Lỗi khi lưu quỹ phép.';
      setFundMessage(errMsg);
      toast.error(errMsg);
    } finally {
      setSavingFund(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const filteredEmployees = employees.filter((e) => {
    const isTerminated = e.endDate && e.endDate.split('T')[0] <= today;
    if (!showTerminated && isTerminated) return false;
    if (filterType !== 'ALL' && (e.employeeType || 'STANDARD') !== filterType) return false;
    return (
      e.employeeCode.toLowerCase().includes(search.toLowerCase()) ||
      e.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (e.departmentName && e.departmentName.toLowerCase().includes(search.toLowerCase()))
    );
  });
  const terminatedCount = employees.filter(e => e.endDate && e.endDate.split('T')[0] <= today).length;

  if (!selectedCompany) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>
        Vui lòng chọn một Hội sở làm việc trên thanh Navbar để quản lý danh mục nhân sự và sơ đồ bộ phận.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header */}
      <div className="card">
        <div
          className="card-body"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
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
              <UserCheck size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Danh mục Nhân sự — {selectedCompany ? selectedCompany.name : 'Tất cả hội sở'}
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                Hồ sơ nhân viên, ngày nghỉ phép, sơ đồ bộ phận và khối nhân viên
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadTemplate}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Tải file Excel mẫu gồm 7 cột chuẩn"
            >
              <Download size={14} />
              <span>Tải file mẫu Excel</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setImportResult(null); setImportFile(null); setShowImportModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={14} />
              <span>Nạp từ Excel</span>
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={handleOpenCreateEmp}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={15} />
              <span>Thêm nhân viên</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--neutral-200)', paddingBottom: '4px' }}>
        <button
          className={`btn btn-sm ${activeTab === 'employees' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('employees')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <UserCheck size={15} />
          <span>Danh sách Nhân viên ({employees.length})</span>
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'departments' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('departments')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <FolderTree size={15} />
          <span>Danh mục Bộ phận ({departments.length})</span>
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'groups' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('groups')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Layers size={15} />
          <span>Khối nhân viên ({groups.length})</span>
        </button>
      </div>

      {/* Tab 1: Employees */}
      {activeTab === 'employees' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ position: 'relative', minWidth: '280px' }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="form-control form-control-sm"
                style={{ paddingLeft: '32px', paddingRight: '12px' }}
                placeholder="Tìm mã NV, họ tên, bộ phận..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                className="form-control form-control-sm"
                style={{ width: '160px' }}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="ALL">Tất cả hình thức</option>
                <option value="STANDARD">Nhân sự Chuẩn</option>
                <option value="REMOTE">Nhân sự Remote</option>
                <option value="PARTTIME">Nhân sự Part-time</option>
              </select>

              <button
                type="button"
                className={`btn btn-sm ${showTerminated ? 'btn-primary' : 'btn-secondary'}`}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setShowTerminated(!showTerminated)}
                title={showTerminated ? "Bấm để ẩn nhân sự đã nghỉ việc" : "Bấm để hiện nhân sự đã nghỉ việc"}
              >
                {showTerminated ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{showTerminated ? 'Ẩn NV đã nghỉ việc' : `Hiện NV đã nghỉ việc (${terminatedCount})`}</span>
              </button>

              <span className="badge badge-neutral">Tổng cộng: {filteredEmployees.length} nhân viên</span>
            </div>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>Đang tải danh sách nhân sự...</div>
            ) : (
              <div className="table-container" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                      <th style={{ width: '100px' }}>Mã NV</th>
                      <th>Họ và tên</th>
                      <th>Bộ phận</th>
                      <th>Khối nhân viên</th>
                      <th style={{ textAlign: 'center', width: '130px' }}>Phép năm còn</th>
                      <th style={{ textAlign: 'center', width: '150px' }}>Tài khoản ESS</th>
                      <th style={{ textAlign: 'center' }}>Ngày bắt đầu</th>
                      <th style={{ textAlign: 'center' }}>Nghỉ việc</th>
                      <th style={{ textAlign: 'center' }}>Miễn quẹt</th>
                      <th style={{ textAlign: 'center', width: '110px' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((e, idx) => {
                      const fund = funds[e.id];
                      const remaining = fund ? (fund.availableBalance ?? fund.totalRemaining ?? 0) : 0;
                      return (
                        <tr key={e.id}>
                          <td style={{ textAlign: 'center' }}>{e.sortOrder || idx + 1}</td>
                          <td style={{ fontWeight: 800, color: '#0056B3', fontFamily: 'monospace' }}>{e.employeeCode}</td>
                          <td style={{ fontWeight: 600 }}>
                            {e.fullName}
                            {e.employeeType === 'REMOTE' && (
                              <span className="badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '10px', marginLeft: '6px' }}>
                                Remote
                              </span>
                            )}
                            {e.employeeType === 'PARTTIME' && (
                              <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '10px', marginLeft: '6px' }}>
                                Part-time
                              </span>
                            )}
                          </td>
                          <td>{e.departmentName || '-'}</td>
                          <td>
                            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>{e.groupName}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenLeaveLedger(e)}
                              className={`badge ${remaining > 0 ? 'badge-success' : 'badge-neutral'}`}
                              style={{
                                cursor: 'pointer',
                                border: 'none',
                                fontWeight: 700,
                                padding: '3px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Nhấn để xem chi tiết Sổ cái và Lịch sử phép"
                            >
                              <Wallet size={12} />
                              <span>{remaining.toFixed(1)} ngày</span>
                            </button>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {e.hasAccount ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <span className="badge badge-success" style={{ fontSize: '11px', fontWeight: 700 }}>
                                  @{e.username}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '2px 6px', fontSize: '10px' }}
                                  title="Đặt lại mật khẩu về 123456"
                                  onClick={() => handleQuickCreateAccount(e)}
                                >
                                  Reset
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  backgroundColor: '#0056B3',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px'
                                }}
                                title="Cấp tài khoản đăng nhập cho nhân viên này"
                                onClick={() => handleQuickCreateAccount(e)}
                              >
                                + Cấp TK
                              </button>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '12px' }}>
                            {new Date(e.startDate).toLocaleDateString('vi-VN')}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {e.endDate ? (
                              <span className="badge badge-danger">{new Date(e.endDate).toLocaleDateString('vi-VN')}</span>
                            ) : (
                              <span style={{ color: 'var(--neutral-400)' }}>-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {e.exemptPunch && <span className="badge badge-primary">Miễn quẹt</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '4px 6px', color: '#ea580c' }}
                                title={e.endDate ? `Đã nghỉ việc từ ${new Date(e.endDate).toLocaleDateString('vi-VN')} - Bấm để cập nhật` : "Cho nhân viên nghỉ việc"}
                                onClick={() => handleOpenTerminate(e)}
                              >
                                <UserMinus size={13} />
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '4px 6px', color: '#d97706' }}
                                title="Xem Sổ Cái & Lịch sử nghỉ phép"
                                onClick={() => handleOpenLeaveLedger(e)}
                              >
                                <History size={13} />
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '4px 6px' }}
                                onClick={() => handleOpenEditEmp(e)}
                                title="Chỉnh sửa nhân viên"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '4px 6px', color: 'var(--danger)' }}
                                onClick={() => handleDeleteEmp(e)}
                                title="Xóa nhân viên (Có thể xóa cưỡng bức nếu có dữ liệu)"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Departments */}
      {activeTab === 'departments' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Danh mục Bộ phận</div>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditingDeptId(null); setDeptName(''); setDeptSort(departments.length + 1); setShowDeptModal(true); }}>
              <Plus size={15} />
              <span>Thêm bộ phận</span>
            </button>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '80px', textAlign: 'center' }}>Thứ tự</th>
                    <th>Tên bộ phận</th>
                    <th style={{ textAlign: 'center', width: '120px' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => (
                    <tr key={d.id}>
                      <td style={{ textAlign: 'center' }}>{d.sortOrder}</td>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setEditingDeptId(d.id); setDeptName(d.name); setDeptSort(d.sortOrder); setShowDeptModal(true); }}>
                            <Edit2 size={13} />
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleDeleteDept(d)}>
                            <Trash2 size={13} color="var(--danger)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Groups */}
      {activeTab === 'groups' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Danh mục Khối nhân viên</div>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '120px' }}>Mã khối</th>
                    <th>Tên khối nhân viên</th>
                    <th style={{ width: '160px', textAlign: 'center' }}>Đặc tính</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 700 }}>{g.code}</td>
                      <td style={{ fontWeight: 600 }}>{g.name}</td>
                      <td style={{ textAlign: 'center' }}>
                        {g.isDefault ? (
                          <span className="badge badge-primary">Khối mặc định</span>
                        ) : (
                          <span className="badge badge-neutral">Khối tùy biến</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Thêm/Sửa Employee (Tối ưu scroll hoàn toàn) */}
      {showEmpModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px', maxHeight: '90vh' }}>
            <div className="modal-header">
              <div className="card-title">{editingEmpId ? 'Chỉnh sửa Nhân viên' : 'Thêm Nhân viên mới'}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowEmpModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveEmp}>
              <div className="modal-body">
                {empError && (
                  <div style={{ padding: '10px 14px', backgroundColor: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius)', fontSize: '13px', marginBottom: '16px' }}>
                    {empError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Mã nhân viên (*)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={empCode}
                      onChange={(e) => setEmpCode(e.target.value)}
                      placeholder="Ví dụ: SB001, QL01..."
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Họ và tên (*)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Bộ phận / Vị trí</label>
                    <select
                      className="form-control"
                      value={deptId || ''}
                      onChange={(e) => setDeptId(e.target.value ? parseInt(e.target.value) : undefined)}
                    >
                      <option value="">(Không chọn)</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Khối nhân viên (*)</label>
                    <select
                      className="form-control"
                      value={groupId}
                      onChange={(e) => setGroupId(parseInt(e.target.value))}
                      required
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Hình thức nhân sự (*)</label>
                    <select
                      className="form-control"
                      value={employeeType}
                      onChange={(e) => setEmployeeType(e.target.value as any)}
                    >
                      <option value="STANDARD">Nhân sự Chuẩn (Toàn thời gian tại cơ sở)</option>
                      <option value="REMOTE">Nhân sự Remote (Từ xa / Tại nhà)</option>
                      <option value="PARTTIME">Nhân sự Part-time (Bán thời gian)</option>
                    </select>
                    <small style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                      {employeeType === 'REMOTE' && 'Check-in tại nhà, tính đủ công tháng (ví dụ 25/25 ngày). Đăng ký lịch làm việc trước.'}
                      {employeeType === 'PARTTIME' && 'Đăng ký lịch làm việc trước. Ngày ngoài lịch không cần giải trình. Làm thêm ngày vẫn tính đủ công.'}
                      {employeeType === 'STANDARD' && 'Chấm công tại cơ sở theo ca và quy chế chấm công chuẩn.'}
                    </small>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Ngày bắt đầu làm việc (*)</label>
                    <DateInput
                      value={startDate}
                      onChange={(val) => setStartDate(val)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Ngày nghỉ việc (Nếu có)</label>
                    <DateInput
                      value={endDate}
                      onChange={(val) => setEndDate(val)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Thứ tự hiển thị (STT)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginTop: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={exemptPunch}
                        onChange={(e) => setExemptPunch(e.target.checked)}
                      />
                      <span>Miễn quẹt thẻ (Ban Giám Đốc)</span>
                    </label>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label className="form-label">Ghi chú mặc định trên Báo cáo</label>
                  <input
                    type="text"
                    className="form-control"
                    value={defaultNote}
                    onChange={(e) => setDefaultNote(e.target.value)}
                    placeholder="Ví dụ: Giáo viên Toán trí tuệ, làm thêm T7..."
                  />
                </div>

                {/* Tùy chọn cấp tài khoản đăng nhập khi tạo mới */}
                {!editingEmpId && (
                  <div style={{
                    marginTop: '16px',
                    padding: '14px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '8px'
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, color: '#0056B3', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={createUserAccount}
                        onChange={(e) => setCreateUserAccount(e.target.checked)}
                      />
                      <span>Cấp tài khoản đăng nhập tự phục vụ (Mobile ESS)</span>
                    </label>
                    {createUserAccount && (
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label className="form-label" style={{ fontSize: '11px', color: '#475569' }}>
                              Tên đăng nhập (Mã hội sở + Mã NV)
                            </label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={
                                empCode.trim()
                                  ? `${(selectedCompany?.code || `c${selectedCompany?.id || ''}`).toLowerCase()}_${empCode.trim().toLowerCase()}`
                                  : `${(selectedCompany?.code || 'hộisở').toLowerCase()}_[mã_nv]`
                              }
                              disabled
                              style={{ backgroundColor: '#F1F5F9', fontWeight: 700, color: '#0056B3' }}
                            />
                          </div>
                          <div>
                            <label className="form-label" style={{ fontSize: '11px', color: '#475569' }}>Mật khẩu ban đầu</label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={accountPassword}
                              onChange={(e) => setAccountPassword(e.target.value)}
                              placeholder="123456"
                            />
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: '#2563EB', marginTop: '6px' }}>
                          💡 Tài khoản tự động kết hợp mã hội sở (<code>{(selectedCompany?.code || '').toLowerCase()}</code>) để không bị trùng khi các hội sở dùng chung mã NV.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEmpModal(false)} disabled={savingEmp}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingEmp}>
                  {savingEmp ? 'Đang lưu...' : 'Lưu nhân viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Thêm/Sửa Department */}
      {showDeptModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div className="card-title">{editingDeptId ? 'Sửa bộ phận' : 'Thêm bộ phận'}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDeptModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveDept}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Tên bộ phận (*)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    placeholder="Ví dụ: Đào tạo, Hành chính..."
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Thứ tự sắp xếp</label>
                  <input
                    type="number"
                    className="form-control"
                    value={deptSort}
                    onChange={(e) => setDeptSort(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowDeptModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu bộ phận</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Nạp Excel hàng loạt */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div className="card-title">Nạp danh sách nhân viên từ Excel</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowImportModal(false)}>✕</button>
            </div>

            <form onSubmit={handleImportExcelSubmit}>
              <div className="modal-body">
                <div style={{
                  padding: '12px 14px',
                  backgroundColor: 'var(--primary-light)',
                  border: '1px solid #bfdbfe',
                  borderRadius: 'var(--radius)',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-text)' }}>
                      Chưa có file mẫu chuẩn?
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
                      Tải file Excel mẫu gồm 7 cột chuẩn không cần mã máy quẹt
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleDownloadTemplate}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    <Download size={14} />
                    <span>Tải file mẫu (.xlsx)</span>
                  </button>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--neutral-600)', marginBottom: '14px', lineHeight: 1.6 }}>
                  <strong>Quy chuẩn 7 cột file Excel (không cần mã máy chấm công):</strong>
                  <ul style={{ paddingLeft: '18px', marginTop: '4px' }}>
                    <li><strong>Cột 1:</strong> Mã nhân viên (*)</li>
                    <li><strong>Cột 2:</strong> Họ và tên (*)</li>
                    <li><strong>Cột 3:</strong> Phòng ban / Vị trí</li>
                    <li><strong>Cột 4:</strong> Khối làm việc (STANDARD / PARTTIME / REMOTE)</li>
                    <li><strong>Cột 5:</strong> Ngày vào làm (DD/MM/YYYY)</li>
                    <li><strong>Cột 6:</strong> Miễn quẹt thẻ (CÓ / KHÔNG)</li>
                    <li><strong>Cột 7:</strong> Ghi chú mặc định</li>
                  </ul>
                </div>

                <div className="form-group">
                  <label className="form-label">Chọn file Excel để tải lên</label>
                  <input
                    type="file"
                    className="form-control"
                    accept=".xlsx, .xls"
                    onChange={(e) => e.target.files && setImportFile(e.target.files[0])}
                    required
                  />
                </div>

                {importResult && (
                  <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'var(--neutral-50)', borderRadius: 'var(--radius)', fontSize: '13px' }}>
                    <div style={{ color: 'var(--success-text)', fontWeight: 700, marginBottom: '6px' }}>
                      Đã thêm thành công {importResult.importedCount} nhân viên!
                    </div>
                    {importResult.errors.length > 0 && (
                      <div style={{ color: 'var(--danger-text)' }}>
                        <div>Lỗi ({importResult.errors.length}):</div>
                        <ul style={{ paddingLeft: '20px' }}>
                          {importResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(false)} disabled={importing}>Đóng</button>
                <button type="submit" className="btn btn-primary" disabled={!importFile || importing}>
                  {importing ? 'Đang nạp...' : 'Tiến hành nạp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: LỊCH SỬ NGHỈ PHÉP NHÂN SỰ */}
      {viewingLeaveEmp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '850px', maxHeight: '90vh' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Wallet size={20} color="#2563eb" />
                <div>
                  <div className="card-title" style={{ fontSize: '16px', fontWeight: 800 }}>
                    Lịch Sử Nghỉ Phép: {viewingLeaveEmp.employeeCode} - {viewingLeaveEmp.fullName}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Bộ phận: {viewingLeaveEmp.departmentName || 'Hội sở'} • Khối: {viewingLeaveEmp.groupName}
                  </div>
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setViewingLeaveEmp(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {fundMessage && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  backgroundColor: '#f0fdf4',
                  color: '#166534',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid #bbf7d0'
                }}>
                  {fundMessage}
                </div>
              )}

              {/* Thẻ tóm tắt Quỹ phép */}
              {funds[viewingLeaveEmp.id] ? (
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                      Tổng hợp ngày nghỉ phép năm {currentYear}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '12px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                      onClick={() => setShowEditFund(!showEditFund)}
                    >
                      <Edit2 size={13} />
                      <span>{showEditFund ? 'Đóng thiết lập' : 'Cài đặt số ngày nghỉ phép'}</span>
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', textAlign: 'center' }}>
                    <div style={{ backgroundColor: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Phép năm cấp mới</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>
                        {funds[viewingLeaveEmp.id].annualOpening}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Phép chuyển (Cộng dồn)</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>
                        {funds[viewingLeaveEmp.id].carryOpening}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Nghỉ bù đầu kỳ</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
                        {funds[viewingLeaveEmp.id].compOpening || 0}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: 700 }}>Tổng Phép Còn Lại</div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e3a8a', marginTop: '4px' }}>
                        {(funds[viewingLeaveEmp.id]?.availableBalance ?? funds[viewingLeaveEmp.id]?.totalRemaining ?? 0).toFixed(1)} ngày
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '8px', textAlign: 'center', fontSize: '13px', color: '#64748b', border: '1px solid #e2e8f0' }}>
                  Chưa cài đặt số ngày nghỉ phép năm {currentYear} cho nhân viên này.{' '}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '12px', marginLeft: '8px' }}
                    onClick={() => setShowEditFund(true)}
                  >
                    Cài đặt ngay
                  </button>
                </div>
              )}

              {/* Form Cài đặt số ngày nghỉ phép (Refresh / Cộng dồn) */}
              {showEditFund && (
                <form
                  onSubmit={handleSaveLeaveFund}
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1.5px solid #2563eb',
                    borderRadius: '10px',
                    padding: '16px',
                    display: 'block',
                    width: '100%',
                    minHeight: 'auto',
                    overflow: 'visible',
                    flexShrink: 0
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e40af' }}>
                      Cài đặt số ngày nghỉ phép năm {currentYear}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Thiết lập số ngày phép năm cấp mới, phép tồn chuyển sang và ngày nghỉ bù
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                    <div style={{ backgroundColor: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                      <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e3a8a', display: 'block', marginBottom: '6px' }}>
                        Phép năm cấp mới
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="form-control"
                        style={{ fontSize: '16px', fontWeight: 700, textAlign: 'center' }}
                        value={annualOpen}
                        onChange={(e) => setAnnualOpen(parseFloat(e.target.value) || 0)}
                        required
                      />
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', textAlign: 'center' }}>
                        Tiêu chuẩn: 12 ngày / năm
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                      <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 700, color: '#b45309', display: 'block', marginBottom: '6px' }}>
                        Phép chuyển (Cộng dồn)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="form-control"
                        style={{ fontSize: '16px', fontWeight: 700, textAlign: 'center' }}
                        value={carryOpen}
                        onChange={(e) => setCarryOpen(parseFloat(e.target.value) || 0)}
                        required
                      />
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', textAlign: 'center' }}>
                        Tồn từ năm trước chuyển tiếp
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                      <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 700, color: '#047857', display: 'block', marginBottom: '6px' }}>
                        Nghỉ bù đầu kỳ
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="form-control"
                        style={{ fontSize: '16px', fontWeight: 700, textAlign: 'center' }}
                        value={compOpen}
                        onChange={(e) => setCompOpen(parseFloat(e.target.value) || 0)}
                        required
                      />
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', textAlign: 'center' }}>
                        Số ngày công bù tích lũy
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowEditFund(false)}>
                      Hủy
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={savingFund} style={{ minWidth: '130px' }}>
                      {savingFund ? 'Đang lưu...' : 'Lưu cài đặt ngày phép'}
                    </button>
                  </div>
                </form>
              )}

              {/* Bảng chi tiết Lịch sử Sổ cái khấu trừ */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                  Lịch sử khấu trừ ngày nghỉ phép ({empLedger.length} lượt)
                </div>
                {loadingLeave ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Đang tải lịch sử...</div>
                ) : empLedger.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '13px' }}>
                    Chưa có giao dịch khấu trừ phép nào trong năm {currentYear}.
                  </div>
                ) : (
                  <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: '100px' }}>Ngày</th>
                          <th style={{ width: '110px' }}>Loại quỹ trừ</th>
                          <th style={{ width: '80px', textAlign: 'right' }}>Số lượng</th>
                          <th style={{ width: '90px', textAlign: 'right' }}>Dư sau trừ</th>
                          <th>Lý do</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empLedger.map((item) => (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 600 }}>{new Date(item.date).toLocaleDateString('vi-VN')}</td>
                            <td>
                              <span className={`badge ${item.fund === 'ANNUAL' ? 'badge-primary' : (item.fund === 'CARRY' ? 'badge-warning' : 'badge-neutral')}`}>
                                {item.fund === 'ANNUAL' ? 'Phép năm' : (item.fund === 'CARRY' ? 'Phép chuyển' : 'Nghỉ bù')}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: item.amount < 0 ? '#e11d48' : '#16a34a' }}>
                              {item.amount > 0 ? `+${item.amount}` : item.amount}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800 }}>{item.balanceAfter}</td>
                            <td style={{ fontSize: '12px', color: '#64748b' }}>{item.reason || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Bảng đơn nghỉ phép đã nạp */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                  Đơn Xin Nghỉ Phép Đã Duyệt Trong Năm ({empRequests.length} đơn)
                </div>
                {empRequests.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '13px' }}>
                    Không có đơn nghỉ phép nào trong năm {currentYear}.
                  </div>
                ) : (
                  <div className="table-container" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: '100px' }}>Ngày nghỉ</th>
                          <th style={{ width: '80px' }}>Mã phép</th>
                          <th>Lý do</th>
                          <th style={{ width: '120px' }}>Người tạo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empRequests.map((r) => (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 600 }}>{new Date(r.date).toLocaleDateString('vi-VN')}</td>
                            <td><span className="badge badge-warning">{r.code}</span></td>
                            <td style={{ color: '#475569' }}>{r.reason || '-'}</td>
                            <td style={{ fontSize: '12px', color: '#64748b' }}>{r.createdBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewingLeaveEmp(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cho nghỉ việc */}
      {showTerminateModal && terminatingEmp && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserMinus size={20} color="#ea580c" />
                <h3 className="modal-title" style={{ margin: 0, fontWeight: 700 }}>Thiết lập Nghỉ việc Nhân sự</h3>
              </div>
              <button className="btn-close" onClick={() => setShowTerminateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleTerminateSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>{terminatingEmp.fullName}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                    Mã NV: <strong>{terminatingEmp.employeeCode}</strong> — Bộ phận: {terminatingEmp.departmentName || 'Chưa phân bộ phận'}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>
                    Ngày chính thức nghỉ việc <span style={{ color: 'red' }}>*</span>
                  </label>
                  <DateInput
                    required
                    value={terminateDate}
                    onChange={(val) => setTerminateDate(val)}
                  />
                  <small style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    Nhân viên nghỉ việc sẽ được tự động ẩn khỏi Bảng chấm công các kỳ sau, giúp BCC luôn gọn gàng và không còn nhân sự đã nghỉ việc.
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Lý do nghỉ việc / Ghi chú</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Ví dụ: Hết hạn hợp đồng, chuyển công tác, theo nguyện vọng cá nhân..."
                    value={terminateReason}
                    onChange={(e) => setTerminateReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowTerminateModal(false)}
                  disabled={savingTerminate}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{ backgroundColor: '#ea580c', borderColor: '#ea580c', color: '#fff', fontWeight: 700 }}
                  disabled={savingTerminate}
                >
                  {savingTerminate ? 'Đang lưu...' : 'Xác nhận Nghỉ việc'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
