using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ChamCong.Api.Data;
using Microsoft.IdentityModel.Tokens;

namespace ChamCong.Api.Infrastructure;

public interface IPasswordService
{
    string HashPassword(string password);
    bool VerifyPassword(string password, string hash);
}

public class PasswordService : IPasswordService
{
    private const int SaltSize = 16; // 128 bit
    private const int KeySize = 32;  // 256 bit
    private const int Iterations = 210_000; // Phase 2: >= 210,000 rounds

    public string HashPassword(string password)
    {
        using var rng = RandomNumberGenerator.Create();
        var salt = new byte[SaltSize];
        rng.GetBytes(salt);

        using var pbkdf2 = new Rfc2898DeriveBytes(password, salt, Iterations, HashAlgorithmName.SHA256);
        var key = pbkdf2.GetBytes(KeySize);

        return $"{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
    }

    public bool VerifyPassword(string password, string hash)
    {
        var parts = hash.Split('.');
        if (parts.Length != 3) return false;

        if (!int.TryParse(parts[0], out var iterations)) return false;
        var salt = Convert.FromBase64String(parts[1]);
        var expectedKey = Convert.FromBase64String(parts[2]);

        using var pbkdf2 = new Rfc2898DeriveBytes(password, salt, iterations, HashAlgorithmName.SHA256);
        var actualKey = pbkdf2.GetBytes(KeySize);

        return CryptographicOperations.FixedTimeEquals(actualKey, expectedKey);
    }
}

public static class CryptoUtil
{
    /// <summary>Băm chuỗi sang SHA-256 dạng Hex 64 ký tự viết thường.</summary>
    public static string Sha256Hex(string input)
    {
        if (string.IsNullOrEmpty(input)) return "";
        var bytes = Encoding.UTF8.GetBytes(input);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    /// <summary>Băm mảng byte sang SHA-256 dạng Hex 64 ký tự viết thường.</summary>
    public static string Sha256Hex(byte[] bytes)
    {
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    /// <summary>Sinh chuỗi ngẫu nhiên cryptographically secure độ dài 256-bit (Hex 64 ký tự).</summary>
    public static string GenerateRandomSecret(int byteCount = 32)
    {
        var bytes = new byte[byteCount];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}

public interface ITokenService
{
    string GenerateToken(User user, IEnumerable<int> companyIds);
    string GenerateAccessToken(User user, IEnumerable<string> roles, IEnumerable<int> companyIds, TimeSpan? lifetime = null);
    (string RawToken, string TokenHash) GenerateRefreshToken();
    ClaimsPrincipal? ValidateToken(string token);
}

public class TokenService : ITokenService
{
    private readonly IConfiguration _config;

    public TokenService(IConfiguration config)
    {
        _config = config;
    }

    private SymmetricSecurityKey GetSecurityKey()
    {
        var secret = Environment.GetEnvironmentVariable("JWT_SECRET")
            ?? _config["Jwt:Secret"]
            ?? "Superbrain_ChamCong_Secret_Key_For_Jwt_Token_2026_Secure_Key_Long_Enough_256bits!";
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
    }

    public string GenerateToken(User user, IEnumerable<int> companyIds)
    {
        var expiryHoursStr = Environment.GetEnvironmentVariable("JWT_EXPIRY_HOURS")
            ?? _config["Jwt:ExpiryHours"]
            ?? "24";
        int.TryParse(expiryHoursStr, out var expiryHours);
        if (expiryHours <= 0) expiryHours = 24;

        return GenerateAccessToken(user, new[] { user.Role }, companyIds, TimeSpan.FromHours(expiryHours));
    }

    public string GenerateAccessToken(User user, IEnumerable<string> roles, IEnumerable<int> companyIds, TimeSpan? lifetime = null)
    {
        var issuer = Environment.GetEnvironmentVariable("JWT_ISSUER")
            ?? _config["Jwt:Issuer"]
            ?? "ChamCongApp";
        var audience = Environment.GetEnvironmentVariable("JWT_AUDIENCE")
            ?? _config["Jwt:Audience"]
            ?? "ChamCongUsers";

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.GivenName, user.FullName),
            new("MustChangePassword", user.MustChangePassword.ToString().ToLower()),
            new("Consent", (user.PrivacyConsentAtUtc != null).ToString().ToLower())
        };

        if (!string.IsNullOrEmpty(user.EmployeeCode))
        {
            claims.Add(new Claim("EmployeeCode", user.EmployeeCode));
        }

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        foreach (var cId in companyIds)
        {
            claims.Add(new Claim("CompanyId", cId.ToString()));
        }

        var expires = DateTime.UtcNow.Add(lifetime ?? TimeSpan.FromMinutes(15)); // Phase 2: 15-minute access token

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: expires,
            signingCredentials: new SigningCredentials(GetSecurityKey(), SecurityAlgorithms.HmacSha256)
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public (string RawToken, string TokenHash) GenerateRefreshToken()
    {
        var raw = CryptoUtil.GenerateRandomSecret(32);
        var hash = CryptoUtil.Sha256Hex(raw);
        return (raw, hash);
    }

    public ClaimsPrincipal? ValidateToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = GetSecurityKey();
            var issuer = Environment.GetEnvironmentVariable("JWT_ISSUER") ?? _config["Jwt:Issuer"] ?? "ChamCongApp";
            var audience = Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? _config["Jwt:Audience"] ?? "ChamCongUsers";

            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = key,
                ValidateIssuer = true,
                ValidIssuer = issuer,
                ValidateAudience = true,
                ValidAudience = audience,
                ClockSkew = TimeSpan.FromMinutes(5)
            };

            var principal = tokenHandler.ValidateToken(token, validationParameters, out _);
            return principal;
        }
        catch
        {
            return null;
        }
    }
}
