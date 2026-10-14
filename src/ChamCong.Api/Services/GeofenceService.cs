using System.Net;
using ChamCong.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace ChamCong.Api.Services;

public interface IGeofenceService
{
    double CalculateDistance(double lat1, double lon1, double lat2, double lon2);
    bool IsIpInCidr(string clientIp, string cidr);
    bool CheckIpInBranchNetworks(string clientIp, IEnumerable<BranchNetwork> networks);
    string ResolveClientIp(HttpContext httpContext);
    Task<BranchPresenceResult> EvaluatePresenceAsync(
        string employeeCode,
        string clientIp,
        string channel,
        decimal? latitude,
        decimal? longitude,
        decimal? accuracy,
        string? gpsError,
        string policy,
        CancellationToken ct = default);
}

public class BranchPresenceResult
{
    public string? DetectedBranchCode { get; set; }
    public bool? IpOk { get; set; }
    public string GpsState { get; set; } = "NA"; // OK | OUT | LOW_ACC | MISSING | NA
    public double? DistanceMeters { get; set; }
    public string VerificationStatus { get; set; } = "VALID"; // VALID | REVIEW | OUT_OF_OFFICE
    public string? ReasonCode { get; set; } // GPS_DRIFT | OFF_NETWORK | OUTSIDE | WRONG_BRANCH | PC_NOT_IN_OFFICE
    public string ReviewState { get; set; } = "NONE"; // NONE | PENDING | ACCEPTED | REJECTED
    public string Message { get; set; } = "Hợp lệ";
}

public class GeofenceService : IGeofenceService
{
    private readonly AppDbContext _db;

    public GeofenceService(AppDbContext db)
    {
        _db = db;
    }

    public double CalculateDistance(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6371000.0; // Bán kính trái đất (mét)
        double dLat = ToRadians(lat2 - lat1);
        double dLon = ToRadians(lon2 - lon1);
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                   Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) *
                   Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        double c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return R * c;
    }

    private static double ToRadians(double degrees) => degrees * Math.PI / 180.0;

    public bool IsIpInCidr(string clientIpStr, string cidrStr)
    {
        if (string.IsNullOrWhiteSpace(clientIpStr) || string.IsNullOrWhiteSpace(cidrStr)) return false;
        clientIpStr = clientIpStr.Trim();
        cidrStr = cidrStr.Trim();

        if (!IPAddress.TryParse(clientIpStr, out var clientIp)) return false;

        // Xử lý IPv4-mapped IPv6 (::ffff:192.168.1.1)
        if (clientIp.IsIPv4MappedToIPv6)
        {
            clientIp = clientIp.MapToIPv4();
        }

        // Nếu client là Loopback (localhost) và CIDR khai báo loopback thì khớp ngay
        if (IPAddress.IsLoopback(clientIp) && (cidrStr.StartsWith("127.") || cidrStr.StartsWith("::1")))
        {
            return true;
        }

        var parts = cidrStr.Split('/');
        if (parts.Length == 1)
        {
            return IPAddress.TryParse(parts[0], out var matchIp) &&
                   (matchIp.IsIPv4MappedToIPv6 ? matchIp.MapToIPv4() : matchIp).Equals(clientIp);
        }

        if (parts.Length != 2 || !int.TryParse(parts[1], out var prefixLength)) return false;
        if (!IPAddress.TryParse(parts[0], out var networkIp)) return false;
        if (networkIp.IsIPv4MappedToIPv6) networkIp = networkIp.MapToIPv4();

        if (clientIp.AddressFamily != networkIp.AddressFamily) return false;

        var clientBytes = clientIp.GetAddressBytes();
        var networkBytes = networkIp.GetAddressBytes();
        int fullBytes = prefixLength / 8;
        int remBits = prefixLength % 8;

        for (int i = 0; i < fullBytes && i < clientBytes.Length; i++)
        {
            if (clientBytes[i] != networkBytes[i]) return false;
        }

        if (remBits > 0 && fullBytes < clientBytes.Length)
        {
            byte mask = (byte)(0xFF << (8 - remBits));
            if ((clientBytes[fullBytes] & mask) != (networkBytes[fullBytes] & mask)) return false;
        }

        return true;
    }

    public bool CheckIpInBranchNetworks(string clientIp, IEnumerable<BranchNetwork> networks)
    {
        var today = DateTime.Today;
        foreach (var net in networks)
        {
            if (!net.IsActive) continue;
            if (net.ValidFrom > today) continue;
            if (net.ValidTo != null && net.ValidTo < today) continue;

            if (IsIpInCidr(clientIp, net.Cidr)) return true;
        }
        return false;
    }

    public string ResolveClientIp(HttpContext httpContext)
    {
        // 1. Cloudflare header
        var cfIp = httpContext.Request.Headers["CF-Connecting-IP"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(cfIp)) return cfIp.Trim();

        // 2. X-Forwarded-For
        var xff = httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(xff))
        {
            var firstIp = xff.Split(',')[0].Trim();
            if (!string.IsNullOrWhiteSpace(firstIp)) return firstIp;
        }

        // 3. Direct connection
        var remoteIp = httpContext.Connection.RemoteIpAddress;
        if (remoteIp != null)
        {
            if (remoteIp.IsIPv4MappedToIPv6) remoteIp = remoteIp.MapToIPv4();
            return remoteIp.ToString();
        }

        return "127.0.0.1";
    }

    public async Task<BranchPresenceResult> EvaluatePresenceAsync(
        string employeeCode,
        string clientIp,
        string channel,
        decimal? latitude,
        decimal? longitude,
        decimal? accuracy,
        string? gpsError,
        string policy,
        CancellationToken ct = default)
    {
        var result = new BranchPresenceResult();

        // 1. Tìm các hội sở nhân viên được phân công (hội sở chính trước)
        var assignments = await _db.EmployeeBranchAssignments
            .AsNoTracking()
            .Where(x => x.EmployeeCode == employeeCode && (x.ToDate == null || x.ToDate >= DateTime.Today))
            .OrderByDescending(x => x.IsPrimary)
            .ToListAsync(ct);

        var assignedBranchCodes = assignments.Select(x => x.BranchCode).Distinct().ToList();

        // Nếu chưa có phân công trong bảng, lấy hội sở từ hồ sơ nhân viên Phase 1
        if (!assignedBranchCodes.Any())
        {
            var emp = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(x => x.EmployeeCode == employeeCode, ct);
            if (emp != null)
            {
                var comp = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(x => x.Id == emp.CompanyId, ct);
                if (comp != null) assignedBranchCodes.Add(comp.Code);
            }
        }

        // 2. Tải danh sách Networks và Locations của tất cả hội sở
        var allNetworks = await _db.BranchNetworks.AsNoTracking().Where(x => x.IsActive).ToListAsync(ct);
        var allLocations = await _db.BranchLocations.AsNoTracking().Where(x => x.IsActive).ToListAsync(ct);

        // 3. Xác định hội sở: ưu tiên khớp theo IP trước, sau đó theo GPS
        string? detectedBranch = null;
        bool isIpMatch = false;

        // Thử các hội sở được phân công
        foreach (var bCode in assignedBranchCodes)
        {
            var branchNets = allNetworks.Where(n => n.BranchCode == bCode);
            if (CheckIpInBranchNetworks(clientIp, branchNets))
            {
                detectedBranch = bCode;
                isIpMatch = true;
                break;
            }
        }

        // Nếu IP chưa khớp, thử định vị GPS với các hội sở được phân công
        double? bestDistance = null;
        int? bestRadius = null;
        if (latitude.HasValue && longitude.HasValue)
        {
            foreach (var bCode in assignedBranchCodes)
            {
                var locs = allLocations.Where(l => l.BranchCode == bCode).ToList();
                foreach (var loc in locs)
                {
                    var dist = CalculateDistance((double)latitude.Value, (double)longitude.Value, (double)loc.Latitude, (double)loc.Longitude);
                    if (bestDistance == null || dist < bestDistance.Value)
                    {
                        bestDistance = dist;
                        bestRadius = loc.RadiusMeters;
                        if (detectedBranch == null) detectedBranch = bCode;
                    }
                }
            }
        }

        // Nếu vẫn chưa nhận diện được
        if (detectedBranch == null)
        {
            var assignedNets = allNetworks.Where(n => assignedBranchCodes.Contains(n.BranchCode)).ToList();
            if (channel == "PC_WEB" && !assignedNets.Any())
            {
                // Cơ sở được phân công chưa có bất kỳ cấu hình Public IP nào
                detectedBranch = assignedBranchCodes.FirstOrDefault();
                result.ReasonCode = "BRANCH_NO_PUBLIC_IP";
            }
            else
            {
                var otherNet = allNetworks.FirstOrDefault(n => IsIpInCidr(clientIp, n.Cidr));
                if (otherNet != null && !assignedBranchCodes.Contains(otherNet.BranchCode))
                {
                    detectedBranch = otherNet.BranchCode;
                    result.ReasonCode = "WRONG_BRANCH";
                }
                else
                {
                    detectedBranch = assignedBranchCodes.FirstOrDefault();
                }
            }
        }

        result.DetectedBranchCode = detectedBranch;

        // 4. Đánh giá IpOk
        if (policy == "LOCATION_NOT_REQUIRED")
        {
            result.IpOk = null;
        }
        else
        {
            var branchNets = allNetworks.Where(n => n.BranchCode == detectedBranch).ToList();
            if (branchNets.Any())
            {
                result.IpOk = isIpMatch || CheckIpInBranchNetworks(clientIp, branchNets);
            }
            else
            {
                // Hội sở chưa cấu hình IP
                result.IpOk = null;
            }
        }

        // 5. Đánh giá GpsState
        if (channel == "PC_WEB" || policy == "LOCATION_NOT_REQUIRED")
        {
            result.GpsState = "NA";
        }
        else if (!latitude.HasValue || !longitude.HasValue || !string.IsNullOrEmpty(gpsError))
        {
            result.GpsState = "MISSING";
        }
        else
        {
            const double geoAccuracyMaxM = 100.0;
            const double geoAccCreditM = 30.0;
            double acc = (double)(accuracy ?? 0);

            if (acc > geoAccuracyMaxM)
            {
                result.GpsState = "LOW_ACC";
            }
            else
            {
                double dist = bestDistance ?? 999999;
                result.DistanceMeters = dist;
                double effectiveDistance = Math.Max(0, dist - Math.Min(acc, geoAccCreditM));
                int radius = bestRadius ?? 50;

                result.GpsState = effectiveDistance <= radius ? "OK" : "OUT";
            }
        }

        // 6. Áp dụng Bảng quyết định (mục 4.5)
        if (channel == "PC_WEB")
        {
            // Đối với thiết bị checkin là PC: KHÔNG kiểm tra mạng (IP) và KHÔNG kiểm tra location (GPS)
            // Chỉ cần lấy địa chỉ MAC Address của user để kiểm tra checkin
            result.DetectedBranchCode = detectedBranch ?? assignedBranchCodes.FirstOrDefault();
            result.IpOk = true;
            result.GpsState = "NA";
            result.DistanceMeters = null;
            result.VerificationStatus = "VALID";
            result.ReviewState = "NONE";
            result.ReasonCode = null;
            result.Message = "Hợp lệ (PC - Xác thực địa chỉ MAC)";
            return result;
        }

        if (policy == "LOCATION_NOT_REQUIRED")
        {
            result.VerificationStatus = "VALID";
            result.ReviewState = "NONE";
            result.Message = "Hợp lệ (Remote / Không yêu cầu vị trí)";
            return result;
        }

        if (policy == "OFFICE_GPS_ONLY")
        {
            if (result.GpsState == "OK")
            {
                result.VerificationStatus = "VALID";
                result.ReviewState = "NONE";
                result.Message = "Hợp lệ (GPS trong bán kính)";
            }
            else if (result.GpsState == "OUT")
            {
                result.VerificationStatus = "OUT_OF_OFFICE";
                result.ReasonCode = "OUTSIDE";
                result.ReviewState = "PENDING";
                result.Message = "Ngoài phạm vi: GPS ngoài bán kính hội sở.";
            }
            else
            {
                result.VerificationStatus = "REVIEW";
                result.ReasonCode = "GPS_DRIFT";
                result.ReviewState = "PENDING";
                result.Message = "Cần HCNS xem xét: Không xác định được tọa độ chính xác.";
            }
            return result;
        }

        // OFFICE_STRICT (Mặc định: Cả IP + GPS)
        bool ipOk = result.IpOk == true;
        if (ipOk && result.GpsState == "OK")
        {
            result.VerificationStatus = "VALID";
            result.ReviewState = "NONE";
            result.Message = "Hợp lệ (Mạng & Vị trí văn phòng)";
        }
        else if (ipOk && (result.GpsState == "OUT" || result.GpsState == "LOW_ACC" || result.GpsState == "MISSING"))
        {
            result.VerificationStatus = "REVIEW";
            result.ReasonCode = "GPS_DRIFT";
            result.ReviewState = "PENDING";
            result.Message = "Cần xem xét: Đang ở mạng văn phòng nhưng GPS trôi hoặc không có tọa độ.";
        }
        else if (!ipOk && result.GpsState == "OK")
        {
            result.VerificationStatus = "REVIEW";
            result.ReasonCode = "OFF_NETWORK";
            result.ReviewState = "PENDING";
            result.Message = "Cần xem xét: GPS đúng vị trí nhưng không dùng Wi-Fi văn phòng (đang dùng 4G/mạng ngoài).";
        }
        else
        {
            result.VerificationStatus = "OUT_OF_OFFICE";
            result.ReasonCode = result.ReasonCode ?? "OUTSIDE";
            result.ReviewState = "PENDING";
            result.Message = "Ngoài văn phòng: Không thuộc mạng và không trong bán kính hội sở.";
        }

        return result;
    }
}
