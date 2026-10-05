using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace ChamCong.Engine;

/// <summary>
/// Làm sạch dữ liệu file MyTime (Tính năng 2.1.2, Phụ lục A).
/// Ngày công có thể là chữ M/D/YYYY hoặc ngày thật bị hoán đổi ngày–tháng.
/// </summary>
public static class DataCleaner
{
    private static readonly Regex DateText = new(@"^\s*(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,4})", RegexOptions.Compiled);
    private static readonly string[] DateFormats = new[]
    {
        "MM/dd/yyyy", "M/d/yyyy", "MM-dd-yyyy", "M-d-yyyy",
        "MM/dd/yyyy HH:mm:ss", "M/d/yyyy HH:mm:ss", "MM/dd/yyyy h:mm:ss tt", "M/d/yyyy h:mm:ss tt",
        "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy",
        "dd/MM/yyyy HH:mm:ss", "d/M/yyyy HH:mm:ss",
        "yyyy-MM-dd", "yyyy/MM/dd", "yyyy-MM-dd HH:mm:ss"
    };

    /// <summary>Các cách đọc ngày có thể có của một ô (ưu tiên định dạng MM/dd/yyyy theo yêu cầu).</summary>
    public static List<DateTime> DateCandidates(object? raw)
    {
        var list = new List<DateTime>();
        switch (raw)
        {
            case null: break;
            case DateTime dt:
                list.Add(dt.Date);
                AddIfValid(list, dt.Year, dt.Day, dt.Month); // hoán đổi ngày–tháng dự phòng
                break;
            case double d when d > 20000 && d < 80000:
                return DateCandidates(DateTime.FromOADate(d));
            case string s:
                s = s.Trim();
                if (string.IsNullOrEmpty(s)) break;

                // Nếu là chuỗi số serial Excel (ví dụ "45620")
                if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var dVal) && dVal > 20000 && dVal < 80000)
                {
                    return DateCandidates(DateTime.FromOADate(dVal));
                }

                // Cắt bỏ phần giờ nếu có
                var dateOnlyPart = s.Split(' ')[0];
                if (DateTime.TryParseExact(dateOnlyPart, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var exactDt))
                {
                    list.Add(exactDt.Date);
                }

                var m = DateText.Match(s);
                if (m.Success)
                {
                    int a = int.Parse(m.Groups[1].Value), b = int.Parse(m.Groups[2].Value), c = int.Parse(m.Groups[3].Value);
                    if (m.Groups[1].Value.Length == 4)
                    {
                        AddIfValid(list, a, b, c);
                        AddIfValid(list, a, c, b);
                    }
                    else
                    {
                        if (c < 100) c += 2000;
                        AddIfValid(list, c, a, b); // MM/dd/yyyy (M/D/YYYY)
                        AddIfValid(list, c, b, a); // dd/MM/yyyy (D/M/YYYY)
                    }
                }
                break;
        }
        return list.Distinct().ToList();
    }

    private static void AddIfValid(List<DateTime> l, int y, int m, int d)
    {
        if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > DateTime.DaysInMonth(y, m)) return;
        var date = new DateTime(y, m, d);
        if (!l.Contains(date)) l.Add(date);
    }

    /// <summary>
    /// Đọc giờ trả về (Phút trong ngày, Định dạng chuỗi HH:mm:ss).
    /// Tính phút thuần túy theo Giờ * 60 + Phút (bỏ qua giây), để số phút đi trễ về sớm không bị sai lệch theo giây.
    /// Chuỗi hiển thị giữ trọn vẹn giây (ví dụ: 07:52:58, 17:58:37).
    /// </summary>
    public static (int? Minutes, string? FormattedTime) ParseTimeDetails(object? raw)
    {
        switch (raw)
        {
            case null:
                return (null, null);

            case DateTime dt:
            {
                int h = dt.Hour, m = dt.Minute, s = dt.Second;
                return (h * 60 + m, $"{h:D2}:{m:D2}:{s:D2}");
            }

            case TimeSpan ts:
            {
                // ClosedXML có thể trả về TimeSpan với TotalHours chứa cả số ngày từ Excel serial date (ví dụ: 1110536:31:51)
                // ts.Hours tự động lấy modulo 24 trong ngày (0..23).
                int h = ts.Hours >= 0 && ts.Hours < 24 ? ts.Hours : (int)Math.Abs(ts.TotalHours % 24);
                int m = Math.Abs(ts.Minutes);
                int s = Math.Abs(ts.Seconds);
                return (h * 60 + m, $"{h:D2}:{m:D2}:{s:D2}");
            }

            case double d:
            {
                if (d < 0) return (null, null);
                // Phân số trong ngày (fraction of day)
                double frac = d >= 1 ? (d - Math.Floor(d)) : d;
                double totalSec = frac * 86400.0;
                int roundedSec = (int)Math.Round(totalSec);
                if (roundedSec >= 86400) roundedSec = 86399;
                if (roundedSec < 0) roundedSec = 0;

                int h = roundedSec / 3600;
                int m = (roundedSec % 3600) / 60;
                int s = roundedSec % 60;

                return (h * 60 + m, $"{h:D2}:{m:D2}:{s:D2}");
            }

            case string s:
            {
                s = s.Trim();
                if (s.Length == 0 || s == "-" || s == "--:--") return (null, null);

                // Nếu là chuỗi số thực fraction của ngày (ví dụ "0.333333")
                if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var num) && num >= 0)
                {
                    return ParseTimeDetails(num);
                }

                // 12-giờ AM / PM (ví dụ "07:52:58 AM", "05:05:12 PM", "5:00 CH", "8:00 SA")
                var match12 = Regex.Match(s, @"^(\d{1,2})[:hH](\d{2})(?::(\d{2}))?\s*(AM|PM|SA|CH)", RegexOptions.IgnoreCase);
                if (match12.Success)
                {
                    int h = int.Parse(match12.Groups[1].Value);
                    int mi = int.Parse(match12.Groups[2].Value);
                    int sec = match12.Groups[3].Success ? int.Parse(match12.Groups[3].Value) : 0;
                    var period = match12.Groups[4].Value.ToUpperInvariant();
                    if ((period == "PM" || period == "CH") && h < 12) h += 12;
                    if ((period == "AM" || period == "SA") && h == 12) h = 0;
                    if (h < 24 && mi < 60)
                    {
                        return (h * 60 + mi, $"{h:D2}:{mi:D2}:{sec:D2}");
                    }
                }

                // 24-giờ có giây (ví dụ "07:52:58", "17:58:37", "8:05:12")
                var match24s = Regex.Match(s, @"^(\d{1,2})[:hH](\d{2}):(\d{2})");
                if (match24s.Success)
                {
                    int h = int.Parse(match24s.Groups[1].Value);
                    int mi = int.Parse(match24s.Groups[2].Value);
                    int sec = int.Parse(match24s.Groups[3].Value);
                    if (h < 24 && mi < 60 && sec < 60)
                    {
                        return (h * 60 + mi, $"{h:D2}:{mi:D2}:{sec:D2}");
                    }
                }

                // 24-giờ thông thường không có giây (ví dụ "08:00", "17:30", "8h30")
                var match24 = Regex.Match(s, @"^(\d{1,2})[:hH](\d{2})");
                if (match24.Success)
                {
                    int h = int.Parse(match24.Groups[1].Value);
                    int mi = int.Parse(match24.Groups[2].Value);
                    if (h < 24 && mi < 60)
                    {
                        return (h * 60 + mi, $"{h:D2}:{mi:D2}:00");
                    }
                }

                if (DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDt))
                {
                    int h = parsedDt.Hour, mi = parsedDt.Minute, sec = parsedDt.Second;
                    return (h * 60 + mi, $"{h:D2}:{mi:D2}:{sec:D2}");
                }

                return (null, null);
            }
        }
        return (null, null);
    }

    /// <summary>Đọc giờ trả về phút trong ngày (bỏ qua giây, thuần túy theo phút). Ô trống/không đọc được → null.</summary>
    public static int? ParseTime(object? raw) => ParseTimeDetails(raw).Minutes;

    public static string NormalizeName(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "";
        return Regex.Replace(s.Normalize(NormalizationForm.FormC).Trim(), @"\s+", " ");
    }

    /// <summary>Chuẩn hóa tiêu đề cột để so khớp: bỏ dấu, chữ thường, bỏ ký tự thừa.</summary>
    public static string NormalizeHeader(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "";
        var formD = s.Trim().ToLowerInvariant().Replace('đ', 'd').Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var ch in formD)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsLetterOrDigit(ch)) sb.Append(ch);
        }
        return sb.ToString();
    }

    /// <summary>
    /// Chọn ngày đúng cho mỗi dòng: chỉ nhận cách đọc nằm trong kỳ; nếu cả 2 đều nằm trong kỳ thì ưu tiên ngày
    /// chưa có của cùng nhân viên (kiểm tra chuỗi liên tục). Không phân giải được → null (lỗi dòng, không đoán).
    /// </summary>
    public static DateTime?[] ResolveDates(IReadOnlyList<(string Key, List<DateTime> Candidates)> rows, DateTime from, DateTime to)
    {
        var result = new DateTime?[rows.Count];
        var used = new Dictionary<string, HashSet<DateTime>>();
        var pending = new List<int>();
        for (int i = 0; i < rows.Count; i++)
        {
            var inRange = rows[i].Candidates.Where(d => d >= from.Date && d <= to.Date).Distinct().ToList();
            if (inRange.Count == 1)
            {
                result[i] = inRange[0];
                if (!used.TryGetValue(rows[i].Key, out var set)) used[rows[i].Key] = set = new HashSet<DateTime>();
                set.Add(inRange[0]);
            }
            else if (inRange.Count > 1) pending.Add(i);
        }
        foreach (var i in pending)
        {
            used.TryGetValue(rows[i].Key, out var set);
            var free = rows[i].Candidates.Where(d => d >= from.Date && d <= to.Date && (set == null || !set.Contains(d))).Distinct().ToList();
            if (free.Count == 1)
            {
                result[i] = free[0];
                if (set == null) used[rows[i].Key] = set = new HashSet<DateTime>();
                set.Add(free[0]);
            }
            else if (free.Count > 1)
            {
                result[i] = free[0];
            }
        }

        // Fallback: nếu chưa gán nhưng dòng có candidate, lấy ngày hợp lý nhất
        for (int i = 0; i < rows.Count; i++)
        {
            if (!result[i].HasValue && rows[i].Candidates.Count > 0)
            {
                var inRange = rows[i].Candidates.Where(d => d >= from.Date && d <= to.Date).ToList();
                result[i] = inRange.Count > 0 ? inRange[0] : rows[i].Candidates[0];
            }
        }

        return result;
    }
}
