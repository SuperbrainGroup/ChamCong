using ClosedXML.Excel;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Engine;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace ChamCong.Api.Services;

public class ImportInspectionReport
{
    public int TotalRows { get; set; }
    public int ValidRows { get; set; }
    public int ErrorRows { get; set; }
    public int WarningRows { get; set; }
    public int MatchedEmployees { get; set; }
    public int UnmatchedEmployees { get; set; }
    public List<string> UnmatchedMachineCodes { get; set; } = new();
    public List<string> MissingPunchEmployees { get; set; } = new();
    public List<string> Errors { get; set; } = new();
    public List<string> Warnings { get; set; } = new();
}

public interface IImportService
{
    Task<ImportInspectionReport> InspectAndImportPunchesAsync(
        int periodId,
        Stream fileStream,
        string fileName,
        bool commit,
        CancellationToken ct = default);
}

public class ImportService : IImportService
{
    private readonly AppDbContext _db;
    private readonly AccessService _access;
    private readonly AuditService _audit;

    public ImportService(AppDbContext db, AccessService access, AuditService audit)
    {
        _db = db;
        _access = access;
        _audit = audit;
    }

    public async Task<ImportInspectionReport> InspectAndImportPunchesAsync(
        int periodId,
        Stream fileStream,
        string fileName,
        bool commit,
        CancellationToken ct = default)
    {
        var period = await _access.GetPeriodAsync(periodId, tracking: true, ct);
        if (period.Status == PeriodStatus.Closed)
        {
            throw AppException.Bad("Kỳ công đã chốt, không thể nạp lại dữ liệu.");
        }

        var employees = await _db.Employees
            .AsNoTracking()
            .Where(e => e.CompanyId == period.CompanyId)
            .ToListAsync(ct);

        var empByCode = employees
            .ToDictionary(e => e.EmployeeCode.Trim(), StringComparer.OrdinalIgnoreCase);

        // Lưu stream vào MemoryStream để tính hash và đọc
        using var ms = new MemoryStream();
        await fileStream.CopyToAsync(ms, ct);
        ms.Position = 0;

        string fileHash;
        using (var sha = SHA256.Create())
        {
            fileHash = Convert.ToHexString(sha.ComputeHash(ms.ToArray()));
        }
        ms.Position = 0;

        using var workbook = new XLWorkbook(ms);
        // Ưu tiên sheet tên "Input", nếu không thì lấy sheet đầu tiên
        var ws = workbook.Worksheets.FirstOrDefault(w => w.Name.Equals("Input", StringComparison.OrdinalIgnoreCase))
                 ?? workbook.Worksheets.First();

        var report = new ImportInspectionReport();

        // 1. Tìm dòng tiêu đề chính xác (quét từng dòng để tìm dòng chứa đồng thời Mã NV và Ngày công)
        int headerRow = -1;
        int colCode = -1, colName = -1, colDate = -1, colIn = -1, colOut = -1;
        int colHours = -1, colLeaveType = -1, colLeaveStatus = -1, colLeaveHours = -1, colInOutStatus = -1, colReason = -1, colShift = -1;

        for (int r = 1; r <= Math.Min(20, ws.LastRowUsed()?.RowNumber() ?? 1); r++)
        {
            int cCode = -1, cName = -1, cDate = -1, cIn = -1, cOut = -1;
            int cHours = -1, cLeaveType = -1, cLeaveStatus = -1, cLeaveHours = -1, cInOutStatus = -1, cReason = -1, cShift = -1;

            var rowCells = ws.Row(r).CellsUsed().ToList();
            foreach (var cell in rowCells)
            {
                var rawStr = cell.GetString().Trim();
                var h = DataCleaner.NormalizeHeader(rawStr);
                if (string.IsNullOrEmpty(h)) continue;

                // Cột Mã nhân viên
                if (cCode == -1 && (h == "manv" || h == "manhanvien" || h == "ma" || h == "macc" || h == "machamcong" || h == "code" || h == "empcode" || (h.Contains("ma") && (h.Contains("nv") || h.Contains("chamcong") || h.Contains("nhanvien")))))
                {
                    cCode = cell.Address.ColumnNumber;
                }
                // Cột Tên nhân viên
                else if (cName == -1 && (h == "tennv" || h == "tennhanvien" || h == "hoten" || h == "hovaten" || h == "ten" || h == "fullname" || (h.Contains("ten") && !h.Contains("ca"))))
                {
                    cName = cell.Address.ColumnNumber;
                }
                // Cột Ngày công (hỗ trợ "Ngày công MM/dd/yyyy", "Ngày công", "Ngày", "Date", "WorkDate")
                else if (cDate == -1 && (h.Contains("ngaycong") || h.Contains("ngaychamcong") || h.Contains("ngaylam") || h == "ngay" || h == "date" || h == "workdate"))
                {
                    cDate = cell.Address.ColumnNumber;
                }
                // Cột Vào (hỗ trợ "Vào", "Giờ vào", "TG vào", "Vào 1", "Check in", "In", "Quẹt vào", "Bắt đầu")
                else if (cIn == -1 && (h == "vao" || h == "giovao" || h == "tgvao" || h == "thoigianvao" || h == "vao1" || h == "checkin" || h == "in" || h == "timein" || h == "quetvao" || h == "batdau"))
                {
                    cIn = cell.Address.ColumnNumber;
                }
                // Cột Ra (hỗ trợ "Ra", "Giờ ra", "TG ra", "Ra 1", "Check out", "Out", "Quẹt ra", "Kết thúc")
                else if (cOut == -1 && (h == "ra" || h == "giora" || h == "tgra" || h == "thoigianra" || h == "ra1" || h == "checkout" || h == "out" || h == "timeout" || h == "quetra" || h == "ketthuc"))
                {
                    cOut = cell.Address.ColumnNumber;
                }
                else if (h.Contains("sogiocong") || h.Contains("giocong")) cHours = cell.Address.ColumnNumber;
                else if (h.Contains("loainghiphep")) cLeaveType = cell.Address.ColumnNumber;
                else if (h.Contains("trangthainghiphep")) cLeaveStatus = cell.Address.ColumnNumber;
                else if (h.Contains("sogionghiphep")) cLeaveHours = cell.Address.ColumnNumber;
                else if (h.Contains("trangthaigiovaora")) cInOutStatus = cell.Address.ColumnNumber;
                else if (h.Contains("lydo")) cReason = cell.Address.ColumnNumber;
                else if (h.Contains("duyetcalamviec")) cShift = cell.Address.ColumnNumber;
            }

            // Nếu hàng này chứa cả mã NV và ngày công thì xác nhận là dòng tiêu đề
            if (cCode > 0 && cDate > 0)
            {
                headerRow = r;
                colCode = cCode;
                colName = cName;
                colDate = cDate;
                colIn = cIn;
                colOut = cOut;
                colHours = cHours;
                colLeaveType = cLeaveType;
                colLeaveStatus = cLeaveStatus;
                colLeaveHours = cLeaveHours;
                colInOutStatus = cInOutStatus;
                colReason = cReason;
                colShift = cShift;
                break;
            }
        }

        if (headerRow == -1 || colCode == -1 || colDate == -1)
        {
            throw AppException.Bad("File Excel không đúng định dạng mẫu chấm công (thiếu cột 'Mã NV' hoặc 'Ngày công').");
        }

        // 2. Đọc thô các dòng
        int lastRow = ws.LastRowUsed()?.RowNumber() ?? headerRow;
        var rawRows = new List<(int RowNum, string MachineCode, string MachineName, List<DateTime> Dates, int? InMin, int? OutMin, string? InTime, string? OutTime, string? Hours, string? LeaveType, string? LeaveStatus, string? LeaveHours, string? InOutStatus, string? Reason, string? Shift)>();

        for (int r = headerRow + 1; r <= lastRow; r++)
        {
            var codeVal = ws.Cell(r, colCode).GetString().Trim();
            if (string.IsNullOrEmpty(codeVal)) continue;

            report.TotalRows++;

            var nameVal = colName > 0 ? ws.Cell(r, colName).GetString().Trim() : "";

            // Xử lý ngày công MM/dd/yyyy hoặc số serial Excel
            var cellDate = ws.Cell(r, colDate);
            List<DateTime> candidates;
            if (cellDate.DataType == XLDataType.DateTime || cellDate.Value.IsDateTime)
            {
                candidates = new List<DateTime> { cellDate.GetDateTime().Date };
            }
            else if (cellDate.DataType == XLDataType.Number || cellDate.Value.IsNumber)
            {
                double num = cellDate.Value.GetNumber();
                if (num > 20000 && num < 80000)
                {
                    candidates = new List<DateTime> { DateTime.FromOADate(num).Date };
                }
                else
                {
                    candidates = DataCleaner.DateCandidates(cellDate.GetString());
                }
            }
            else
            {
                candidates = DataCleaner.DateCandidates(cellDate.GetString());
            }

            // Xử lý giờ vào (trả về cả phút chuẩn theo HH:mm và chuỗi HH:mm:ss hiển thị)
            int? inMin = null;
            string? inTime = null;
            if (colIn > 0)
            {
                var cellIn = ws.Cell(r, colIn);
                (inMin, inTime) = cellIn.DataType switch
                {
                    XLDataType.TimeSpan => DataCleaner.ParseTimeDetails(cellIn.GetTimeSpan()),
                    XLDataType.DateTime => DataCleaner.ParseTimeDetails(cellIn.GetDateTime()),
                    XLDataType.Number => DataCleaner.ParseTimeDetails(cellIn.Value.GetNumber()),
                    _ => cellIn.Value.IsTimeSpan ? DataCleaner.ParseTimeDetails(cellIn.GetTimeSpan())
                       : cellIn.Value.IsDateTime ? DataCleaner.ParseTimeDetails(cellIn.GetDateTime())
                       : cellIn.Value.IsNumber ? DataCleaner.ParseTimeDetails(cellIn.Value.GetNumber())
                       : DataCleaner.ParseTimeDetails(cellIn.GetString())
                };
            }

            // Xử lý giờ ra (trả về cả phút chuẩn theo HH:mm và chuỗi HH:mm:ss hiển thị)
            int? outMin = null;
            string? outTime = null;
            if (colOut > 0)
            {
                var cellOut = ws.Cell(r, colOut);
                (outMin, outTime) = cellOut.DataType switch
                {
                    XLDataType.TimeSpan => DataCleaner.ParseTimeDetails(cellOut.GetTimeSpan()),
                    XLDataType.DateTime => DataCleaner.ParseTimeDetails(cellOut.GetDateTime()),
                    XLDataType.Number => DataCleaner.ParseTimeDetails(cellOut.Value.GetNumber()),
                    _ => cellOut.Value.IsTimeSpan ? DataCleaner.ParseTimeDetails(cellOut.GetTimeSpan())
                       : cellOut.Value.IsDateTime ? DataCleaner.ParseTimeDetails(cellOut.GetDateTime())
                       : cellOut.Value.IsNumber ? DataCleaner.ParseTimeDetails(cellOut.Value.GetNumber())
                       : DataCleaner.ParseTimeDetails(cellOut.GetString())
                };
            }

            string? hours = colHours > 0 ? ws.Cell(r, colHours).GetString().Trim() : null;
            string? lType = colLeaveType > 0 ? ws.Cell(r, colLeaveType).GetString().Trim() : null;
            string? lStatus = colLeaveStatus > 0 ? ws.Cell(r, colLeaveStatus).GetString().Trim() : null;
            string? lHours = colLeaveHours > 0 ? ws.Cell(r, colLeaveHours).GetString().Trim() : null;
            string? ioStatus = colInOutStatus > 0 ? ws.Cell(r, colInOutStatus).GetString().Trim() : null;
            string? reason = colReason > 0 ? ws.Cell(r, colReason).GetString().Trim() : null;
            string? shift = colShift > 0 ? ws.Cell(r, colShift).GetString().Trim() : null;

            rawRows.Add((r, codeVal, nameVal, candidates, inMin, outMin, inTime, outTime, hours, lType, lStatus, lHours, ioStatus, reason, shift));
        }

        // 3. Phân giải ngày bằng DataCleaner.ResolveDates
        var rowCandidates = rawRows.Select(x => ($"{x.MachineCode}", x.Dates)).ToList();
        var resolvedDates = DataCleaner.ResolveDates(rowCandidates, period.FromDate, period.ToDate);

        var unmatchedCodeSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var matchedCodeSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var punchesToSave = new List<RawPunch>();

        // Hàm tra cứu nhân viên đa tầng (chính xác, bỏ .0, số nguyên, bỏ 0 đầu, họ tên)
        Employee? FindEmployee(string rawCode, string rawName)
        {
            var cleanCode = rawCode.Trim();
            if (empByCode.TryGetValue(cleanCode, out var eExact)) return eExact;

            if (cleanCode.EndsWith(".0"))
            {
                var strippedDot = cleanCode.Substring(0, cleanCode.Length - 2);
                if (empByCode.TryGetValue(strippedDot, out var eDot)) return eDot;
            }

            if (long.TryParse(cleanCode, out var num))
            {
                var matchedByNum = employees.FirstOrDefault(e => long.TryParse(e.EmployeeCode, out var eNum) && eNum == num);
                if (matchedByNum != null) return matchedByNum;
            }

            var noLeadingZeros = cleanCode.TrimStart('0');
            if (!string.IsNullOrEmpty(noLeadingZeros))
            {
                var matchedNoZero = employees.FirstOrDefault(e => e.EmployeeCode.Trim().TrimStart('0') == noLeadingZeros);
                if (matchedNoZero != null) return matchedNoZero;
            }

            if (!string.IsNullOrWhiteSpace(rawName))
            {
                var normRaw = DataCleaner.NormalizeName(rawName);
                var matchedByName = employees.FirstOrDefault(e => DataCleaner.NormalizeName(e.FullName).Equals(normRaw, StringComparison.OrdinalIgnoreCase));
                if (matchedByName != null) return matchedByName;
            }

            return null;
        }

        for (int i = 0; i < rawRows.Count; i++)
        {
            var raw = rawRows[i];
            var date = resolvedDates[i];

            if (!date.HasValue)
            {
                report.ErrorRows++;
                report.Errors.Add($"Dòng {raw.RowNum}: Không thể xác định ngày công hợp lệ trong khoảng kỳ ({period.FromDate:dd/MM} - {period.ToDate:dd/MM}).");
                continue;
            }

            var emp = FindEmployee(raw.MachineCode, raw.MachineName);
            if (emp != null)
            {
                matchedCodeSet.Add(emp.EmployeeCode);
            }
            else
            {
                unmatchedCodeSet.Add(raw.MachineCode);
            }

            if ((raw.InMin.HasValue && !raw.OutMin.HasValue) || (!raw.InMin.HasValue && raw.OutMin.HasValue))
            {
                report.WarningRows++;
            }

            report.ValidRows++;

            punchesToSave.Add(new RawPunch
            {
                PeriodId = period.Id,
                EmployeeId = emp?.Id,
                MachineCode = raw.MachineCode,
                MachineName = raw.MachineName,
                WorkDate = date.Value,
                InMin = raw.InMin.HasValue ? (short)raw.InMin.Value : null,
                OutMin = raw.OutMin.HasValue ? (short)raw.OutMin.Value : null,
                InTime = raw.InTime,
                OutTime = raw.OutTime,
                MyTimeHours = raw.Hours,
                LeaveType = raw.LeaveType,
                LeaveStatus = raw.LeaveStatus,
                LeaveHours = raw.LeaveHours,
                InOutStatus = raw.InOutStatus,
                Reason = raw.Reason,
                ShiftApproval = raw.Shift,
                SourceRow = raw.RowNum
            });
        }

        report.MatchedEmployees = matchedCodeSet.Count;
        report.UnmatchedEmployees = unmatchedCodeSet.Count;
        report.UnmatchedMachineCodes = unmatchedCodeSet.ToList();

        // Kiểm tra các nhân viên trong danh mục nhưng không xuất hiện trong file chấm công
        foreach (var emp in employees.Where(e => !e.ExemptPunch))
        {
            if (!matchedCodeSet.Contains(emp.EmployeeCode.Trim()))
            {
                report.MissingPunchEmployees.Add($"{emp.EmployeeCode} - {emp.FullName}");
            }
        }

        if (commit)
        {
            // Xóa dữ liệu quẹt thô cũ của kỳ này (thay thế toàn bộ)
            var oldBatches = await _db.ImportBatches.Where(b => b.PeriodId == period.Id).ToListAsync(ct);
            foreach (var b in oldBatches) b.IsCurrent = false;

            var oldPunches = await _db.RawPunches.Where(p => p.PeriodId == period.Id).ToListAsync(ct);
            _db.RawPunches.RemoveRange(oldPunches);

            var batch = new ImportBatch
            {
                PeriodId = period.Id,
                FileName = fileName,
                FileHash = fileHash,
                ImportedBy = _access.Username,
                ImportedAt = DateTime.Now,
                TotalRows = report.TotalRows,
                ErrorRows = report.ErrorRows,
                WarningRows = report.WarningRows,
                MatchedEmployees = report.MatchedEmployees,
                UnmatchedCodes = report.UnmatchedEmployees,
                IsCurrent = true
            };
            _db.ImportBatches.Add(batch);
            await _db.SaveChangesAsync(ct);

            foreach (var p in punchesToSave)
            {
                p.BatchId = batch.Id;
            }
            _db.RawPunches.AddRange(punchesToSave);

            period.Status = PeriodStatus.Imported;
            _audit.Log("Period", period.Id, "ImportPunches",
                new { fileName, total = report.TotalRows, valid = report.ValidRows, errors = report.ErrorRows, matched = report.MatchedEmployees },
                companyId: period.CompanyId, periodId: period.Id);

            await _db.SaveChangesAsync(ct);
        }

        return report;
    }
}
