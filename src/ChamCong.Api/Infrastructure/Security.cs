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
    private const int Iterations = 100_000;

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

        var iterations = int.Parse(parts[0]);
        var salt = Convert.FromBase64String(parts[1]);
        var expectedKey = Convert.FromBase64String(parts[2]);

        using var pbkdf2 = new Rfc2898DeriveBytes(password, salt, iterations, HashAlgorithmName.SHA256);
        var actualKey = pbkdf2.GetBytes(KeySize);

        return CryptographicOperations.FixedTimeEquals(actualKey, expectedKey);
    }
}

public interface ITokenService
{
    string GenerateToken(User user, IEnumerable<int> companyIds);
}

public class TokenService : ITokenService
{
    private readonly IConfiguration _config;

    public TokenService(IConfiguration config)
    {
        _config = config;
    }

    public string GenerateToken(User user, IEnumerable<int> companyIds)
    {
        var secret = Environment.GetEnvironmentVariable("JWT_SECRET")
            ?? _config["Jwt:Secret"]
            ?? "Superbrain_ChamCong_Secret_Key_For_Jwt_Token_2026_Secure_Key_Long_Enough_256bits!";
        var issuer = Environment.GetEnvironmentVariable("JWT_ISSUER")
            ?? _config["Jwt:Issuer"]
            ?? "ChamCongApp";
        var audience = Environment.GetEnvironmentVariable("JWT_AUDIENCE")
            ?? _config["Jwt:Audience"]
            ?? "ChamCongUsers";
        var expiryHoursStr = Environment.GetEnvironmentVariable("JWT_EXPIRY_HOURS")
            ?? _config["Jwt:ExpiryHours"]
            ?? "24";
        int.TryParse(expiryHoursStr, out var expiryHours);
        if (expiryHours <= 0) expiryHours = 24;

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.GivenName, user.FullName),
            new(ClaimTypes.Role, user.Role),
            new("MustChangePassword", user.MustChangePassword.ToString().ToLower())
        };

        foreach (var cId in companyIds)
        {
            claims.Add(new Claim("CompanyId", cId.ToString()));
        }

        var expires = DateTime.UtcNow.AddHours(expiryHours);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: expires,
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
