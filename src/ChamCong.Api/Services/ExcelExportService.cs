using ClosedXML.Excel;
using ChamCong.Api.Data;
using ChamCong.Engine;
using System.Globalization;

namespace ChamCong.Api.Services;

public interface IExcelExportService
{
    byte[] ExportAttendanceSheet(
        Company company,
        Period period,
        List<Employee> employees,
        Dictionary<int, Department> departments,
        List<DayResult> dayResults,
        Dictionary<int, string> periodNotes,
        Dictionary<string, CodeDef> codes,
        bool isDraft,
        Dictionary<int, Dictionary<int, decimal>>? yearlyLeaveByMonth = null,
        Dictionary<int, LeaveBalanceDetailDto>? leaveBalances = null);

    byte[] ExportWarningsSheet(
        Company company,
        Period period,
        List<Employee> employees,
        List<DayResult> dayResults,
        List<RawPunch> unmatchedPunches);
}

public class ExcelExportService : IExcelExportService
{
    private const string FontName = "Times New Roman";

    public byte[] ExportAttendanceSheet(
        Company company,
        Period period,
        List<Employee> employees,
        Dictionary<int, Department> departments,
        List<DayResult> dayResults,
        Dictionary<int, string> periodNotes,
        Dictionary<string, CodeDef> codes,
        bool isDraft,
        Dictionary<int, Dictionary<int, decimal>>? yearlyLeaveByMonth = null,
        Dictionary<int, LeaveBalanceDetailDto>? leaveBalances = null)
    {
        using var workbook = new XLWorkbook();
        var ws1 = workbook.Worksheets.Add("Chấm công");

        ws1.Style.Font.FontName = FontName;
        ws1.Style.Font.FontSize = 10;

        // Ngày bắt đầu và kết thúc của kỳ
        var daysCount = (period.ToDate.Date - period.FromDate.Date).Days + 1;
        var periodDates = Enumerable.Range(0, daysCount)
            .Select(offset => period.FromDate.Date.AddDays(offset))
            .ToList();

        // Map kết quả theo (EmployeeId, Date)
        var resultMap = dayResults
            .ToDictionary(r => (r.EmployeeId, r.Date.Date));

        // -------------------------------------------------------------
        // KHỐI 1: BẢNG CHẤM CÔNG
        // -------------------------------------------------------------
        int row = 1;

        // Dòng 1: Tên hội sở (viết hoa, đậm, size 12)
        ws1.Cell(row, 1).Value = company.Name.ToUpper();
        ws1.Cell(row, 1).Style.Font.Bold = true;
        ws1.Cell(row, 1).Style.Font.FontSize = 12;

        if (isDraft)
        {
            ws1.Cell(row, 10).Value = "[ BẢN NHÁP - CHƯA CHỐT KỲ ]";
            ws1.Cell(row, 10).Style.Font.Bold = true;
            ws1.Cell(row, 10).Style.Font.FontColor = XLColor.Red;
        }
        row++;

        // Dòng 2: Tiêu đề bảng + Số ngày làm việc tháng
        ws1.Cell(row, 1).Value = $"BẢNG CHẤM CÔNG THÁNG {period.Month:00}/{period.Year}";
        ws1.Cell(row, 1).Style.Font.Bold = true;
        ws1.Cell(row, 1).Style.Font.FontSize = 14;

        // Ô Số ngày làm việc tháng ở góc phải (cột 14 & 15)
        ws1.Cell(row, 14).Value = "Số ngày làm việc tháng:";
        ws1.Cell(row, 14).Style.Font.Bold = true;
        ws1.Cell(row, 15).Value = period.StandardDays;
        ws1.Cell(row, 15).Style.Font.Bold = true;
        ws1.Cell(row, 15).Style.NumberFormat.Format = "0.##";
        string stdDaysCell = $"O{row}"; // Cột O dòng 2
        row++;

        // 3 dòng tiêu đề:
        // Hàng 1 (row): Tên cột nhóm
        // Hàng 2 (row+1): Thứ / Tên chi tiết
        // Hàng 3 (row+2): Số thứ tự cột
        int headerRow1 = row;
        int headerRow2 = row + 1;
        int headerRow3 = row + 2;

        void SetStaticHeader(int col, string title1, string title2, int colNum)
        {
            ws1.Cell(headerRow1, col).Value = title1;
            ws1.Cell(headerRow2, col).Value = title2;
            ws1.Cell(headerRow3, col).Value = colNum;
        }

        SetStaticHeader(1, "STT", "", 1);
        SetStaticHeader(2, "Mã NV", "", 2);
        SetStaticHeader(3, "Họ và tên", "", 3);
        SetStaticHeader(4, "BP", "", 4);
        SetStaticHeader(5, "Ca đêm CN", "C", 5);
        SetStaticHeader(6, "Số ngày làm ca 3", "D", 6);
        SetStaticHeader(7, "Số ngày làm ca 2", "II", 7);
        SetStaticHeader(8, "Số ngày làm ca 1, HC", "", 8);
        SetStaticHeader(9, "Ngày lễ", "", 9);
        SetStaticHeader(10, "Số ngày công làm việc", "", 10);
        SetStaticHeader(11, "Nghỉ phép năm", "", 11);
        SetStaticHeader(12, "Phép năm còn lại", "", 12);
        SetStaticHeader(13, "Nghỉ hưởng lương", "", 13);
        SetStaticHeader(14, "Nghỉ không lương", "", 14);
        SetStaticHeader(15, "Số ngày công tính lương", "", 15);

        int curCol = 16;
        int colNumCounter = 16;
        int firstDateCol = curCol;

        // Các cột ngày
        foreach (var d in periodDates)
        {
            ws1.Cell(headerRow1, curCol).Value = d.ToString("dd/MM");
            ws1.Cell(headerRow2, curCol).Value = GetVietnameseDayOfWeek(d.DayOfWeek);
            ws1.Cell(headerRow3, curCol).Value = colNumCounter++;

            // Tô màu nhẹ cho Thứ 7, Chủ Nhật
            if (d.DayOfWeek == DayOfWeek.Sunday)
            {
                ws1.Cell(headerRow2, curCol).Style.Fill.BackgroundColor = XLColor.FromHtml("#FCE4D6");
            }
            else if (d.DayOfWeek == DayOfWeek.Saturday)
            {
                ws1.Cell(headerRow2, curCol).Style.Fill.BackgroundColor = XLColor.FromHtml("#FFF2CC");
            }
            curCol++;
        }
        int lastDateCol = curCol - 1;

        // Cột Ghi chú
        int noteCol = curCol;
        SetStaticHeader(noteCol, "Ghi chú", "", colNumCounter);

        // Định dạng header khối 1
        var headerRange1 = ws1.Range(headerRow1, 1, headerRow3, noteCol);
        headerRange1.Style.Font.Bold = true;
        headerRange1.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        headerRange1.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        headerRange1.Style.Fill.BackgroundColor = XLColor.FromHtml("#D9E1F2");
        headerRange1.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        headerRange1.Style.Border.InsideBorder = XLBorderStyleValues.Thin;

        row = headerRow3 + 1;
        int dataStartRow1 = row;
        int stt = 1;

        // Xuất từng dòng nhân viên
        foreach (var emp in employees.OrderBy(e => e.SortOrder).ThenBy(e => e.Id))
        {
            ws1.Cell(row, 1).Value = stt++;
            ws1.Cell(row, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            ws1.Cell(row, 2).Value = emp.EmployeeCode;
            ws1.Cell(row, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            ws1.Cell(row, 3).Value = emp.FullName;
            ws1.Cell(row, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

            var deptName = emp.DepartmentId.HasValue && departments.TryGetValue(emp.DepartmentId.Value, out var dp) ? dp.Name : "";
            ws1.Cell(row, 4).Value = deptName;
            ws1.Cell(row, 4).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // Ca đêm, Ca 3, Ca 2 = 0
            ws1.Cell(row, 5).Value = 0;
            ws1.Cell(row, 6).Value = 0;
            ws1.Cell(row, 7).Value = 0;

            // Cột ngày
            int c = firstDateCol;
            string dateRangeStr = $"{ws1.Cell(row, firstDateCol).Address}:{ws1.Cell(row, lastDateCol).Address}";

            foreach (var d in periodDates)
            {
                var cell = ws1.Cell(row, c);
                if (resultMap.TryGetValue((emp.Id, d), out var res) && !res.OutOfEmployment && !string.IsNullOrEmpty(res.Code))
                {
                    // Nếu là số 1 hoặc 0.5
                    if (decimal.TryParse(res.Code, NumberStyles.Number, CultureInfo.InvariantCulture, out var numVal))
                    {
                        cell.Value = numVal;
                        cell.Style.NumberFormat.Format = "0.00";
                    }
                    else
                    {
                        cell.Value = res.Code;
                    }

                    // Tô màu mã ký hiệu theo định nghĩa
                    if (codes.TryGetValue(res.Code, out var cDef) && !string.IsNullOrEmpty(cDef.Color))
                    {
                        try
                        {
                            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#" + cDef.Color.TrimStart('#'));
                        }
                        catch { }
                    }
                }
                else
                {
                    cell.Value = Blank.Value;
                }
                cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                c++;
            }

            // Công thức cho các cột tổng (Module 6.1.3):
            // H (col 8) = COUNTIF(dateRange, 1) + 0.5 * (COUNTIF(dateRange, 0.5) + COUNTIF(dateRange, "P/2") + COUNTIF(dateRange, "L/2") + COUNTIF(dateRange, "BL/2"))
            ws1.Cell(row, 8).FormulaA1 = $"COUNTIF({dateRangeStr}, 1) + 0.5 * (COUNTIF({dateRangeStr}, 0.5) + COUNTIF({dateRangeStr}, \"P/2\") + COUNTIF({dateRangeStr}, \"L/2\") + COUNTIF({dateRangeStr}, \"BL/2\"))";
            ws1.Cell(row, 8).Style.NumberFormat.Format = "0.0";

            // I (col 9) Ngày lễ = COUNTIF(dateRange, "L") + 0.5 * COUNTIF(dateRange, "L/2")
            ws1.Cell(row, 9).FormulaA1 = $"COUNTIF({dateRangeStr}, \"L\") + 0.5 * COUNTIF({dateRangeStr}, \"L/2\")";
            ws1.Cell(row, 9).Style.NumberFormat.Format = "0.0";

            // J (col 10) Số ngày công làm việc = H
            ws1.Cell(row, 10).FormulaA1 = $"H{row}";
            ws1.Cell(row, 10).Style.NumberFormat.Format = "0.0";

            // K (col 11) Nghỉ phép năm = COUNTIF(P) + COUNTIF(BL) + 0.5 * (COUNTIF(P/2) + COUNTIF(P/2K) + COUNTIF(BL/2))
            ws1.Cell(row, 11).FormulaA1 = $"COUNTIF({dateRangeStr}, \"P\") + COUNTIF({dateRangeStr}, \"BL\") + 0.5 * (COUNTIF({dateRangeStr}, \"P/2\") + COUNTIF({dateRangeStr}, \"P/2K\") + COUNTIF({dateRangeStr}, \"BL/2\"))";
            ws1.Cell(row, 11).Style.NumberFormat.Format = "0.0";

            // L (col 12) Phép năm còn lại = liên kết tới cột Y (Tồn phép tại T{period.Month}) trong Sheet "Phép năm"
            int row3InSheet3 = 7 + (row - dataStartRow1);
            ws1.Cell(row, 12).FormulaA1 = $"'Phép năm'!Y{row3InSheet3}";
            ws1.Cell(row, 12).Style.NumberFormat.Format = "0.#";
            ws1.Cell(row, 12).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // M (col 13) Nghỉ hưởng lương = COUNTIF(K)
            ws1.Cell(row, 13).FormulaA1 = $"COUNTIF({dateRangeStr}, \"K\")";
            ws1.Cell(row, 13).Style.NumberFormat.Format = "0.0";

            // O (col 15) Số ngày công tính lương = H + I + K + M
            ws1.Cell(row, 15).FormulaA1 = $"H{row}+I{row}+K{row}+M{row}";
            ws1.Cell(row, 15).Style.NumberFormat.Format = "0.0";
            ws1.Cell(row, 15).Style.Font.Bold = true;

            // N (col 14) Nghỉ không lương = MAX(0, StandardDays - O)
            ws1.Cell(row, 14).FormulaA1 = $"MAX(0, {stdDaysCell}-O{row})";
            ws1.Cell(row, 14).Style.NumberFormat.Format = "0.0";

            // Ghi chú mặc định là để trống
            var note = periodNotes.TryGetValue(emp.Id, out var pn) && !string.IsNullOrWhiteSpace(pn)
                ? pn
                : "";
            ws1.Cell(row, noteCol).Value = note;

            row++;
        }
        int dataEndRow1 = row - 1;

        // Dòng Tổng Cộng Khối 1
        ws1.Cell(row, 1).Value = "Tổng Cộng";
        ws1.Range(row, 1, row, 4).Merge();
        ws1.Cell(row, 1).Style.Font.Bold = true;
        ws1.Cell(row, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        for (int col = 5; col <= 15; col++)
        {
            var colLetter = XLHelper.GetColumnLetterFromNumber(col);
            ws1.Cell(row, col).FormulaA1 = $"SUM({colLetter}{dataStartRow1}:{colLetter}{dataEndRow1})";
            ws1.Cell(row, col).Style.Font.Bold = true;
            ws1.Cell(row, col).Style.NumberFormat.Format = col == 12 ? "0.#" : "0.0";
        }

        var dataRange1 = ws1.Range(dataStartRow1, 1, row, noteCol);
        dataRange1.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        dataRange1.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws1.Range(row, 1, row, noteCol).Style.Fill.BackgroundColor = XLColor.FromHtml("#E2EFDA");

        // Tối ưu độ rộng cột Sheet 1
        ws1.Columns(1, 4).AdjustToContents(15, 35);
        ws1.Columns(5, 7).Width = 7;
        ws1.Columns(8, 15).Width = 11;
        ws1.Columns(16, noteCol - 1).Width = 6.5;
        ws1.Column(noteCol).Width = 25;

        // -------------------------------------------------------------
        // KHỐI 2: BẢNG CHẤM ĐI TRỄ VỀ SỚM (Sheet: "Đi trễ về sớm")
        // -------------------------------------------------------------
        var ws2 = workbook.Worksheets.Add("Đi trễ về sớm");
        ws2.Style.Font.FontName = FontName;
        ws2.Style.Font.FontSize = 10;

        int row2 = 1;

        // Dòng tiêu đề Khối 2
        ws2.Cell(row2, 1).Value = company.Name.ToUpper();
        ws2.Cell(row2, 1).Style.Font.Bold = true;
        ws2.Cell(row2, 1).Style.Font.FontSize = 12;
        row2++;

        ws2.Cell(row2, 1).Value = $"BẢNG CHẤM ĐI TRỄ VỀ SỚM THÁNG {period.Month:00}/{period.Year}";
        ws2.Cell(row2, 1).Style.Font.Bold = true;
        ws2.Cell(row2, 1).Style.Font.FontSize = 14;
        row2++;

        int header2Row1 = row2;
        int header2Row2 = row2 + 1;
        int header2Row3 = row2 + 2;

        // Các cột Khối 2:
        // 1: STT
        // 2: Mã NV
        // 3: Họ và tên
        // 4: Bộ phận
        // 5: Tổng trừ
        // 6: Phạt khác
        // 7: Trừ đi trễ về sớm
        // 8: Tổng thu nhập
        // 9: Tổng cộng (giờ)
        // 10: Tổng số phút đi trễ về sớm
        // 11+: các ngày
        void SetStaticHeader2(int col, string title1, string title2, int colNum)
        {
            ws2.Cell(header2Row1, col).Value = title1;
            ws2.Cell(header2Row2, col).Value = title2;
            ws2.Cell(header2Row3, col).Value = colNum;
        }

        SetStaticHeader2(1, "STT", "", 1);
        SetStaticHeader2(2, "Mã NV", "", 2);
        SetStaticHeader2(3, "Họ và tên", "", 3);
        SetStaticHeader2(4, "Bộ phận", "", 4);
        SetStaticHeader2(5, "Tổng trừ", "", 5);
        SetStaticHeader2(6, "Phạt khác", "", 6);
        SetStaticHeader2(7, "Trừ đi trễ về sớm", "", 7);
        SetStaticHeader2(8, "Tổng thu nhập", "", 8);
        SetStaticHeader2(9, "Tổng cộng (giờ)", "", 9);
        SetStaticHeader2(10, "Tổng số phút đi trễ về sớm", "", 10);

        int curCol2 = 11;
        int colNumCounter2 = 11;
        int firstDateCol2 = curCol2;

        foreach (var d in periodDates)
        {
            ws2.Cell(header2Row1, curCol2).Value = d.ToString("dd/MM");
            ws2.Cell(header2Row2, curCol2).Value = GetVietnameseDayOfWeek(d.DayOfWeek);
            ws2.Cell(header2Row3, curCol2).Value = colNumCounter2++;

            if (d.DayOfWeek == DayOfWeek.Sunday)
            {
                ws2.Cell(header2Row2, curCol2).Style.Fill.BackgroundColor = XLColor.FromHtml("#FCE4D6");
            }
            else if (d.DayOfWeek == DayOfWeek.Saturday)
            {
                ws2.Cell(header2Row2, curCol2).Style.Fill.BackgroundColor = XLColor.FromHtml("#FFF2CC");
            }
            curCol2++;
        }
        int lastDateCol2 = curCol2 - 1;

        var headerRange2 = ws2.Range(header2Row1, 1, header2Row3, lastDateCol2);
        headerRange2.Style.Font.Bold = true;
        headerRange2.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        headerRange2.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        headerRange2.Style.Fill.BackgroundColor = XLColor.FromHtml("#FFF2CC"); // Tiêu đề tô vàng nhẹ
        headerRange2.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        headerRange2.Style.Border.InsideBorder = XLBorderStyleValues.Thin;

        row2 = header2Row3 + 1;
        int dataStartRow2 = row2;
        int stt2 = 1;

        foreach (var emp in employees.OrderBy(e => e.SortOrder).ThenBy(e => e.Id))
        {
            ws2.Cell(row2, 1).Value = stt2++;
            ws2.Cell(row2, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            ws2.Cell(row2, 2).Value = emp.EmployeeCode;
            ws2.Cell(row2, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            ws2.Cell(row2, 3).Value = emp.FullName;
            ws2.Cell(row2, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

            var deptName = emp.DepartmentId.HasValue && departments.TryGetValue(emp.DepartmentId.Value, out var dp) ? dp.Name : "";
            ws2.Cell(row2, 4).Value = deptName;
            ws2.Cell(row2, 4).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 4 cột tiền để trống theo Q10
            ws2.Cell(row2, 5).Value = Blank.Value;
            ws2.Cell(row2, 6).Value = Blank.Value;
            ws2.Cell(row2, 7).Value = Blank.Value;
            ws2.Cell(row2, 8).Value = Blank.Value;

            int c2 = firstDateCol2;
            string dateRangeStr2 = $"{ws2.Cell(row2, firstDateCol2).Address}:{ws2.Cell(row2, lastDateCol2).Address}";

            foreach (var d in periodDates)
            {
                var cell = ws2.Cell(row2, c2);
                if (resultMap.TryGetValue((emp.Id, d), out var res) && !res.OutOfEmployment)
                {
                    int totalPenalty = res.LateMinutes + res.EarlyMinutes;
                    if (totalPenalty > 0)
                    {
                        cell.Value = totalPenalty;
                        cell.Style.NumberFormat.Format = "#,##0";
                    }
                    else
                    {
                        cell.Value = Blank.Value;
                    }
                }
                else
                {
                    cell.Value = Blank.Value;
                }
                cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                c2++;
            }

            // Cột 10: Tổng số phút = SUM(các ngày)
            ws2.Cell(row2, 10).FormulaA1 = $"SUM({dateRangeStr2})";
            ws2.Cell(row2, 10).Style.NumberFormat.Format = "#,##0";
            ws2.Cell(row2, 10).Style.Font.Bold = true;

            // Cột 9: Tổng cộng (giờ) = ROUND(J / 60, 1)
            ws2.Cell(row2, 9).FormulaA1 = $"ROUND(J{row2}/60, 1)";
            ws2.Cell(row2, 9).Style.NumberFormat.Format = "0.0";
            ws2.Cell(row2, 9).Style.Font.Bold = true;

            row2++;
        }
        int dataEndRow2 = row2 - 1;

        // Dòng Tổng Cộng Khối 2
        ws2.Cell(row2, 1).Value = "Tổng Cộng";
        ws2.Range(row2, 1, row2, 4).Merge();
        ws2.Cell(row2, 1).Style.Font.Bold = true;
        ws2.Cell(row2, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        // Tổng cộng giờ và phút
        ws2.Cell(row2, 9).FormulaA1 = $"ROUND(SUM(J{dataStartRow2}:J{dataEndRow2})/60, 1)";
        ws2.Cell(row2, 9).Style.Font.Bold = true;
        ws2.Cell(row2, 9).Style.NumberFormat.Format = "0.0";

        ws2.Cell(row2, 10).FormulaA1 = $"SUM(J{dataStartRow2}:J{dataEndRow2})";
        ws2.Cell(row2, 10).Style.Font.Bold = true;
        ws2.Cell(row2, 10).Style.NumberFormat.Format = "#,##0";

        // Tổng theo từng cột ngày
        for (int c2 = firstDateCol2; c2 <= lastDateCol2; c2++)
        {
            var colLetter = XLHelper.GetColumnLetterFromNumber(c2);
            ws2.Cell(row2, c2).FormulaA1 = $"SUM({colLetter}{dataStartRow2}:{colLetter}{dataEndRow2})";
            ws2.Cell(row2, c2).Style.Font.Bold = true;
            ws2.Cell(row2, c2).Style.NumberFormat.Format = "#,##0";
        }

        var dataRange2 = ws2.Range(dataStartRow2, 1, row2, lastDateCol2);
        dataRange2.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        dataRange2.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws2.Range(row2, 1, row2, lastDateCol2).Style.Fill.BackgroundColor = XLColor.FromHtml("#BDD7EE");

        // Tối ưu độ rộng cột Sheet 2
        ws2.Columns(1, 4).AdjustToContents(15, 35);
        ws2.Columns(5, 8).Width = 10;
        ws2.Columns(9, 10).Width = 12;
        ws2.Columns(firstDateCol2, lastDateCol2).Width = 6.5;

        // -------------------------------------------------------------
        // KHỐI 3: BẢNG THEO DÕI PHÉP NĂM (Sheet: "Phép năm")
        // -------------------------------------------------------------
        var ws3 = workbook.Worksheets.Add("Phép năm");
        ws3.Style.Font.FontName = FontName;
        ws3.Style.Font.FontSize = 10;

        // Dòng 1: Tên công ty
        ws3.Cell(1, 1).Value = company.Name.ToUpper();
        ws3.Cell(1, 1).Style.Font.Bold = true;
        ws3.Cell(1, 1).Style.Font.FontSize = 12;

        // Dòng 2: Tiêu đề bảng & Ô W2 chứa số tháng còn lại trong năm (12 - period.Month)
        ws3.Cell(2, 1).Value = $"BẢNG THEO DÕI PHÉP NĂM {period.Year}";
        ws3.Cell(2, 1).Style.Font.Bold = true;
        ws3.Cell(2, 1).Style.Font.FontSize = 14;

        int remainingMonths = Math.Max(0, 12 - period.Month);
        ws3.Cell(2, 23).Value = remainingMonths; // Cột W dòng 2 ($W$2)
        ws3.Cell(2, 23).Style.Font.Bold = true;
        ws3.Cell(2, 23).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws3.Cell(2, 22).Value = "Số tháng còn lại:";
        ws3.Cell(2, 22).Style.Font.Italic = true;
        ws3.Cell(2, 22).Style.Font.FontSize = 9;
        ws3.Cell(2, 22).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

        // Merge Header hàng 4 và hàng 5
        ws3.Range(4, 1, 5, 1).Merge().Value = "TT";
        ws3.Range(4, 2, 5, 2).Merge().Value = "Mã";
        ws3.Range(4, 3, 5, 3).Merge().Value = "Họ tên";
        ws3.Range(4, 4, 5, 4).Merge().Value = "BP";
        ws3.Range(4, 5, 5, 5).Merge().Value = "Ngày vào";
        ws3.Range(4, 6, 5, 6).Merge().Value = "Ngày tính";
        ws3.Range(4, 7, 5, 7).Merge().Value = "Thâm niên";
        ws3.Range(4, 8, 5, 8).Merge().Value = "Phép năm (Đầu kỳ)";
        ws3.Range(4, 9, 5, 9).Merge().Value = $"Tích lũy (Đến T{period.Month})";
        ws3.Range(4, 10, 5, 10).Merge().Value = "Tổng phép hưởng";

        // Merge 12 cột tháng (K đến V, tức cột 11 đến 22)
        ws3.Range(4, 11, 4, 22).Merge().Value = $"Số ngày nghỉ phép trong năm-{period.Year}";
        for (int m = 1; m <= 12; m++)
        {
            var cellMonth = ws3.Cell(5, 10 + m);
            cellMonth.Value = $"T{m}";
            if (m == period.Month)
            {
                cellMonth.Style.Fill.BackgroundColor = XLColor.FromHtml("#FEF3C7");
                cellMonth.Style.Font.Bold = true;
            }
        }

        ws3.Range(4, 23, 5, 23).Merge().Value = $"Đã dùng trong T{period.Month}";
        ws3.Range(4, 24, 5, 24).Merge().Value = $"Dùng lũy kế (T1-T{period.Month})";
        ws3.Range(4, 25, 5, 25).Merge().Value = $"Tồn phép (Tại T{period.Month})";
        ws3.Range(4, 26, 5, 26).Merge().Value = "Mức lương tính phép năm";
        ws3.Range(4, 27, 5, 27).Merge().Value = "Lương phép năm";

        // Dòng 6: Đánh số thứ tự cột
        ws3.Cell(6, 2).Value = 1;   // Mã
        ws3.Cell(6, 3).Value = 2;   // Họ tên
        ws3.Cell(6, 5).Value = 3;   // Ngày vào
        ws3.Cell(6, 6).Value = 4;   // Ngày tính
        ws3.Cell(6, 7).Value = 5;   // Thâm niên
        ws3.Cell(6, 8).Value = 6;   // Phép năm (Đầu kỳ)
        ws3.Cell(6, 9).Value = 7;   // Tích lũy (Đến T...)
        ws3.Cell(6, 10).Value = 8;  // Tổng phép hưởng
        for (int colNum = 9; colNum <= 20; colNum++)
        {
            ws3.Cell(6, 2 + colNum).Value = colNum; // K6 (9) .. V6 (20)
        }
        ws3.Cell(6, 23).Value = 21; // W6: Đã dùng trong T...
        ws3.Cell(6, 24).Value = 22; // X6: Dùng lũy kế
        ws3.Cell(6, 25).Value = 23; // Y6: Tồn phép (Tại T...)

        // Style toàn bộ Header (Row 4..6, Col 1..27)
        var headerRange3 = ws3.Range(4, 1, 5, 27);
        headerRange3.Style.Font.Bold = true;
        headerRange3.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        headerRange3.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        headerRange3.Style.Alignment.WrapText = true;
        headerRange3.Style.Fill.BackgroundColor = XLColor.FromHtml("#FFF2CC");
        headerRange3.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        headerRange3.Style.Border.InsideBorder = XLBorderStyleValues.Thin;

        var row6Range = ws3.Range(6, 1, 6, 27);
        row6Range.Style.Font.Bold = true;
        row6Range.Style.Font.FontSize = 9;
        row6Range.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        row6Range.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        row6Range.Style.Fill.BackgroundColor = XLColor.FromHtml("#F2F2F2");
        row6Range.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        row6Range.Style.Border.InsideBorder = XLBorderStyleValues.Thin;

        int row3 = 7;
        int dataStartRow3 = row3;
        int stt3 = 1;
        DateTime calcDate = period.ToDate; // Ngày tính thâm niên

        foreach (var emp in employees.OrderBy(e => e.SortOrder).ThenBy(e => e.Id))
        {
            // A: STT
            ws3.Cell(row3, 1).Value = stt3++;
            ws3.Cell(row3, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // B: Mã
            ws3.Cell(row3, 2).Value = emp.EmployeeCode;
            ws3.Cell(row3, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // C: Họ tên
            ws3.Cell(row3, 3).Value = emp.FullName;
            ws3.Cell(row3, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

            // D: BP
            var deptName = emp.DepartmentId.HasValue && departments.TryGetValue(emp.DepartmentId.Value, out var dp) ? dp.Name : "";
            ws3.Cell(row3, 4).Value = deptName;
            ws3.Cell(row3, 4).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // E: Ngày vào (StartDate)
            if (emp.StartDate != default)
            {
                ws3.Cell(row3, 5).Value = emp.StartDate.Date;
                ws3.Cell(row3, 5).Style.DateFormat.Format = "dd/MM/yyyy";
            }
            else
            {
                ws3.Cell(row3, 5).Value = Blank.Value;
            }
            ws3.Cell(row3, 5).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // F: Ngày tính (calcDate)
            ws3.Cell(row3, 6).Value = calcDate.Date;
            ws3.Cell(row3, 6).Style.DateFormat.Format = "dd/MM/yyyy";
            ws3.Cell(row3, 6).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // G: Thâm niên = ROUND((F7-E7)/365,0)
            ws3.Cell(row3, 7).FormulaA1 = $"ROUND((F{row3}-E{row3})/365,0)";
            ws3.Cell(row3, 7).Style.NumberFormat.Format = "0";
            ws3.Cell(row3, 7).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // Lấy thông tin số dư phép năm thực tế từ DB
            LeaveBalanceDetailDto? bal = null;
            leaveBalances?.TryGetValue(emp.Id, out bal);

            decimal openVal = bal != null ? (bal.AnnualOpening + bal.CarryOpening) : 0m;
            decimal accruedVal = bal != null ? bal.Accrued : period.Month;

            // H: Phép năm (Đầu kỳ)
            ws3.Cell(row3, 8).Value = openVal;
            ws3.Cell(row3, 8).Style.NumberFormat.Format = "0.#";
            ws3.Cell(row3, 8).Style.Font.Bold = true;
            ws3.Cell(row3, 8).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // I: Tích lũy (Đến T{period.Month})
            ws3.Cell(row3, 9).Value = accruedVal;
            ws3.Cell(row3, 9).Style.NumberFormat.Format = "0.#";
            ws3.Cell(row3, 9).Style.Font.Bold = true;
            ws3.Cell(row3, 9).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws3.Cell(row3, 9).Style.Fill.BackgroundColor = XLColor.FromHtml("#F0FDF4");

            // J: Tổng phép hưởng = H + I
            ws3.Cell(row3, 10).FormulaA1 = $"H{row3}+I{row3}";
            ws3.Cell(row3, 10).Style.NumberFormat.Format = "0.#";
            ws3.Cell(row3, 10).Style.Font.Bold = true;
            ws3.Cell(row3, 10).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // K..V: 12 tháng từ T1 đến T12 (cột 11 đến 22)
            Dictionary<int, decimal>? monthsMap = null;
            yearlyLeaveByMonth?.TryGetValue(emp.Id, out monthsMap);

            for (int m = 1; m <= 12; m++)
            {
                int colIdx = 10 + m; // 11..22
                decimal leaveDaysInMonth = 0m;
                if (m <= period.Month && monthsMap != null && monthsMap.TryGetValue(m, out var val))
                {
                    leaveDaysInMonth = val;
                }

                if (m <= period.Month && leaveDaysInMonth > 0)
                {
                    ws3.Cell(row3, colIdx).Value = leaveDaysInMonth;
                    ws3.Cell(row3, colIdx).Style.NumberFormat.Format = "0.#";
                }
                else
                {
                    ws3.Cell(row3, colIdx).Value = Blank.Value;
                }

                if (m == period.Month)
                {
                    ws3.Cell(row3, colIdx).Style.Fill.BackgroundColor = XLColor.FromHtml("#FEF3C7");
                }
                ws3.Cell(row3, colIdx).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            }

            // W: Đã dùng trong T{period.Month} = Cột tương ứng của tháng hiện tại
            string curMonthColLetter = XLHelper.GetColumnLetterFromNumber(10 + period.Month);
            ws3.Cell(row3, 23).FormulaA1 = $"{curMonthColLetter}{row3}";
            ws3.Cell(row3, 23).Style.NumberFormat.Format = "0.#";
            ws3.Cell(row3, 23).Style.Font.Bold = true;
            ws3.Cell(row3, 23).Style.Fill.BackgroundColor = XLColor.FromHtml("#FEF3C7");
            ws3.Cell(row3, 23).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // X: Dùng lũy kế (T1-T{period.Month}) = SUM(K..{curMonthColLetter})
            ws3.Cell(row3, 24).FormulaA1 = $"SUM(K{row3}:{curMonthColLetter}{row3})";
            ws3.Cell(row3, 24).Style.NumberFormat.Format = "0.#";
            ws3.Cell(row3, 24).Style.Font.Bold = true;
            ws3.Cell(row3, 24).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // Y: Tồn phép (Tại T{period.Month}) = IF((J - X) < 0, 0, J - X)
            ws3.Cell(row3, 25).FormulaA1 = $"IF((J{row3}-X{row3})<0, 0, J{row3}-X{row3})";
            ws3.Cell(row3, 25).Style.NumberFormat.Format = "0.#";
            ws3.Cell(row3, 25).Style.Font.Bold = true;
            ws3.Cell(row3, 25).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // Z: Mức lương tính phép năm
            ws3.Cell(row3, 26).Value = Blank.Value;

            // AA: Lương phép năm
            ws3.Cell(row3, 27).Value = Blank.Value;

            row3++;
        }

        int dataEndRow3 = row3 - 1;

        // Dòng CỘNG
        ws3.Cell(row3, 1).Value = "CỘNG";
        ws3.Range(row3, 1, row3, 4).Merge();
        ws3.Cell(row3, 1).Style.Font.Bold = true;
        ws3.Cell(row3, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        // Tổng H (Phép năm Đầu kỳ)
        ws3.Cell(row3, 8).FormulaA1 = $"SUM(H{dataStartRow3}:H{dataEndRow3})";
        ws3.Cell(row3, 8).Style.Font.Bold = true;
        ws3.Cell(row3, 8).Style.NumberFormat.Format = "0.#";
        ws3.Cell(row3, 8).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        // Tổng I (Tích lũy)
        ws3.Cell(row3, 9).FormulaA1 = $"SUM(I{dataStartRow3}:I{dataEndRow3})";
        ws3.Cell(row3, 9).Style.Font.Bold = true;
        ws3.Cell(row3, 9).Style.NumberFormat.Format = "0.#";
        ws3.Cell(row3, 9).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        // Tổng J (Tổng phép hưởng)
        ws3.Cell(row3, 10).FormulaA1 = $"SUM(J{dataStartRow3}:J{dataEndRow3})";
        ws3.Cell(row3, 10).Style.Font.Bold = true;
        ws3.Cell(row3, 10).Style.NumberFormat.Format = "0.#";
        ws3.Cell(row3, 10).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        // Tổng K..V: Chỉ hiển thị tổng cho các tháng tới kỳ công hiện tại (m <= period.Month)
        for (int m = 1; m <= 12; m++)
        {
            int colIdx = 10 + m;
            if (m <= period.Month)
            {
                var colL = XLHelper.GetColumnLetterFromNumber(colIdx);
                ws3.Cell(row3, colIdx).FormulaA1 = $"SUM({colL}{dataStartRow3}:{colL}{dataEndRow3})";
                ws3.Cell(row3, colIdx).Style.Font.Bold = true;
                ws3.Cell(row3, colIdx).Style.NumberFormat.Format = "0.#";
            }
            else
            {
                ws3.Cell(row3, colIdx).Value = Blank.Value;
            }
            ws3.Cell(row3, colIdx).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        }

        // Tổng W (Đã dùng trong T...)
        ws3.Cell(row3, 23).FormulaA1 = $"SUM(W{dataStartRow3}:W{dataEndRow3})";
        ws3.Cell(row3, 23).Style.Font.Bold = true;
        ws3.Cell(row3, 23).Style.NumberFormat.Format = "0.#";
        ws3.Cell(row3, 23).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        // Tổng X (Dùng lũy kế)
        ws3.Cell(row3, 24).FormulaA1 = $"SUM(X{dataStartRow3}:X{dataEndRow3})";
        ws3.Cell(row3, 24).Style.Font.Bold = true;
        ws3.Cell(row3, 24).Style.NumberFormat.Format = "0.#";
        ws3.Cell(row3, 24).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        // Tổng Y (Tồn phép Tại T...)
        ws3.Cell(row3, 25).FormulaA1 = $"SUM(Y{dataStartRow3}:Y{dataEndRow3})";
        ws3.Cell(row3, 25).Style.Font.Bold = true;
        ws3.Cell(row3, 25).Style.NumberFormat.Format = "0.#";
        ws3.Cell(row3, 25).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        var dataRange3 = ws3.Range(dataStartRow3, 1, row3, 27);
        dataRange3.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        dataRange3.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws3.Range(row3, 1, row3, 27).Style.Fill.BackgroundColor = XLColor.FromHtml("#E2EFDA");

        // Độ rộng cột Sheet 3
        ws3.Column(1).Width = 5;
        ws3.Column(2).Width = 10;
        ws3.Column(3).Width = 24;
        ws3.Column(4).Width = 16;
        ws3.Column(5).Width = 13;
        ws3.Column(6).Width = 13;
        ws3.Column(7).Width = 11;
        ws3.Column(8).Width = 15; // Phép năm (Đầu kỳ)
        ws3.Column(9).Width = 16; // Tích lũy (Đến T...)
        ws3.Column(10).Width = 16; // Tổng phép hưởng
        ws3.Columns(11, 22).Width = 7; // T1..T12
        ws3.Column(23).Width = 16; // Đã dùng trong T...
        ws3.Column(24).Width = 16; // Dùng lũy kế
        ws3.Column(25).Width = 16; // Tồn phép (Tại T...)
        ws3.Column(26).Width = 12;
        ws3.Column(27).Width = 12;

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }

    public byte[] ExportWarningsSheet(
        Company company,
        Period period,
        List<Employee> employees,
        List<DayResult> dayResults,
        List<RawPunch> unmatchedPunches)
    {
        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("CanhBao_GiaiTrinh");
        ws.Style.Font.FontName = FontName;
        ws.Style.Font.FontSize = 10;

        int row = 1;
        ws.Cell(row, 1).Value = $"DANH SÁCH CẢNH BÁO & GIẢI TRÌNH - {company.Name.ToUpper()}";
        ws.Cell(row, 1).Style.Font.Bold = true;
        ws.Cell(row, 1).Style.Font.FontSize = 13;
        row++;

        ws.Cell(row, 1).Value = $"Kỳ công: Tháng {period.Month:00}/{period.Year} ({period.FromDate:dd/MM/yyyy} - {period.ToDate:dd/MM/yyyy})";
        row += 2;

        // Headers
        var headers = new[] { "STT", "Mã NV", "Họ và tên", "Ngày", "Mã công", "Giờ vào", "Giờ ra", "Nội dung cảnh báo", "Ý kiến giải trình", "Xác nhận duyệt" };
        for (int i = 0; i < headers.Length; i++)
        {
            ws.Cell(row, i + 1).Value = headers[i];
            ws.Cell(row, i + 1).Style.Font.Bold = true;
            ws.Cell(row, i + 1).Style.Fill.BackgroundColor = XLColor.FromHtml("#F2F2F2");
            ws.Cell(row, i + 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        }
        row++;

        var empMap = employees.ToDictionary(e => e.Id);
        int stt = 1;

        // 1. Các ngày có cảnh báo hoặc mã ?/V
        var warningResults = dayResults
            .Where(r => !r.OutOfEmployment && (!string.IsNullOrEmpty(r.Warnings) || r.Code == Codes.Missing || r.Code == Codes.Vacant))
            .OrderBy(r => r.Date)
            .ThenBy(r => r.EmployeeId);

        foreach (var r in warningResults)
        {
            empMap.TryGetValue(r.EmployeeId, out var emp);
            ws.Cell(row, 1).Value = stt++;
            ws.Cell(row, 2).Value = emp?.EmployeeCode ?? "";
            ws.Cell(row, 3).Value = emp?.FullName ?? "";
            ws.Cell(row, 4).Value = r.Date.ToString("dd/MM/yyyy");
            ws.Cell(row, 5).Value = r.Code ?? "";
            ws.Cell(row, 6).Value = !string.IsNullOrEmpty(r.InTime) ? r.InTime : TimeUtil.Format(r.InMin);
            ws.Cell(row, 7).Value = !string.IsNullOrEmpty(r.OutTime) ? r.OutTime : TimeUtil.Format(r.OutMin);
            ws.Cell(row, 8).Value = r.Warnings ?? (r.Code == Codes.Missing ? "Thiếu quẹt / nghi vấn" : "Vắng");
            ws.Cell(row, 9).Value = r.ManualReason ?? "";
            ws.Cell(row, 10).Value = r.IsManual ? $"Đã sửa bởi {r.ManualBy}" : "";

            ws.Cell(row, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(row, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(row, 4).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(row, 5).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(row, 6).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(row, 7).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            row++;
        }

        // 2. Dòng quẹt chưa khớp nhân viên nào
        foreach (var un in unmatchedPunches)
        {
            ws.Cell(row, 1).Value = stt++;
            ws.Cell(row, 2).Value = un.MachineCode;
            ws.Cell(row, 3).Value = un.MachineName ?? "(Không rõ tên)";
            ws.Cell(row, 4).Value = un.WorkDate.ToString("dd/MM/yyyy");
            ws.Cell(row, 5).Value = "?";
            ws.Cell(row, 6).Value = !string.IsNullOrEmpty(un.InTime) ? un.InTime : TimeUtil.Format(un.InMin);
            ws.Cell(row, 7).Value = !string.IsNullOrEmpty(un.OutTime) ? un.OutTime : TimeUtil.Format(un.OutMin);
            ws.Cell(row, 8).Value = "Mã máy chấm công chưa được gán cho nhân viên nào trong danh mục";
            ws.Cell(row, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(row, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(row, 4).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            row++;
        }

        ws.Columns(1, 10).AdjustToContents(10, 45);

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }

    private static string GetVietnameseDayOfWeek(DayOfWeek d) => d switch
    {
        DayOfWeek.Monday => "T2",
        DayOfWeek.Tuesday => "T3",
        DayOfWeek.Wednesday => "T4",
        DayOfWeek.Thursday => "T5",
        DayOfWeek.Friday => "T6",
        DayOfWeek.Saturday => "T7",
        DayOfWeek.Sunday => "CN",
        _ => ""
    };
}
