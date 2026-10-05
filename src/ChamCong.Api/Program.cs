using System.Text;
using System.Text.Json;
using ChamCong.Api.Data;
using ChamCong.Api.Infrastructure;
using ChamCong.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

// ==============================================================================
// 0. Nạp file .env nếu có (dành cho Windows Server / local dev không hardcode)
// ==============================================================================
var candidatePaths = new[]
{
    Path.Combine(Directory.GetCurrentDirectory(), ".env"),
    Path.Combine(Directory.GetCurrentDirectory(), "..", ".env"),
    Path.Combine(Directory.GetCurrentDirectory(), "..", "..", ".env")
};
foreach (var envPath in candidatePaths)
{
    if (File.Exists(envPath))
    {
        foreach (var line in File.ReadAllLines(envPath))
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith("#")) continue;
            var parts = trimmed.Split('=', 2);
            if (parts.Length == 2)
            {
                var k = parts[0].Trim();
                var v = parts[1].Trim().Trim('"', '\'');
                if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(k)))
                {
                    Environment.SetEnvironmentVariable(k, v);
                }
            }
        }
        break;
    }
}

var builder = WebApplication.CreateBuilder(args);

// ==============================================================================
// 1. Database Connection & EF Core SQL Server 2008 Compatibility
// Ưu tiên: Biến môi trường -> appsettings.json (Không hardcode)
// ==============================================================================
var connectionString = Environment.GetEnvironmentVariable("DATABASE_CONNECTION_STRING")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Server=.\\SQLEXPRESS;Database=ChamCong;Trusted_Connection=True;TrustServerCertificate=True;";

builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString, sqlOptions =>
    {
        sqlOptions.UseCompatibilityLevel(100); // SQL Server 2008 / 2008 R2 (DbCompatibilityLevel = 100)
        sqlOptions.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null);
    });
});

// ==============================================================================
// 2. Services Registration
// ==============================================================================
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IPasswordService, PasswordService>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<AccessService>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<IImportService, ImportService>();
builder.Services.AddScoped<ICalculationService, CalculationService>();
builder.Services.AddScoped<IExcelExportService, ExcelExportService>();

// ==============================================================================
// 3. Authentication & Authorization (Deny-by-default)
// ==============================================================================
var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
    ?? builder.Configuration["Jwt:Secret"]
    ?? "Superbrain_ChamCong_Secret_Key_For_Jwt_Token_2026_Secure_Key_Long_Enough_256bits!";
var jwtIssuer = Environment.GetEnvironmentVariable("JWT_ISSUER")
    ?? builder.Configuration["Jwt:Issuer"]
    ?? "ChamCongApp";
var jwtAudience = Environment.GetEnvironmentVariable("JWT_AUDIENCE")
    ?? builder.Configuration["Jwt:Audience"]
    ?? "ChamCongUsers";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtIssuer,
        ValidAudience = jwtAudience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddControllers(options =>
{
    // Global Deny-by-Default Policy (Mọi API mặc định đều yêu cầu xác thực trừ AllowAnonymous)
    var defaultPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
    options.Filters.Add(new AuthorizeFilter(defaultPolicy));
})
.AddJsonOptions(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

// ==============================================================================
// 4. CORS - Hỗ trợ đầy đủ tất cả các phương thức (GET, POST, PUT, DELETE, OPTIONS, PATCH)
// ==============================================================================
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()
              .WithExposedHeaders("Content-Disposition"); // Cho phép Client đọc tên file tải về
    });
});

var app = builder.Build();

// ==============================================================================
// 5. Security Headers (Chuẩn bảo mật OWASP)
// ==============================================================================
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "SAMEORIGIN");
    context.Response.Headers.Append("X-XSS-Protection", "1; mode=block");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
});

// ==============================================================================
// 6. Global Exception Handler Middleware
// ==============================================================================
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (AppException ex)
    {
        context.Response.StatusCode = ex.Status;
        context.Response.ContentType = "application/json; charset=utf-8";
        var payload = JsonSerializer.Serialize(new { message = ex.Message, data = ex.Data2 });
        await context.Response.WriteAsync(payload);
    }
    catch (Exception ex)
    {
        var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "Lỗi không xác định: {Message}", ex.Message);

        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json; charset=utf-8";
        var payload = JsonSerializer.Serialize(new { message = "Đã xảy ra lỗi trên máy chủ. Vui lòng thử lại sau hoặc liên hệ quản trị viên." });
        await context.Response.WriteAsync(payload);
    }
});

// ==============================================================================
// 7. CORS Middleware & OPTIONS Preflight short-circuit
// ==============================================================================
app.UseCors("AllowAll");

app.Use(async (context, next) =>
{
    if (HttpMethods.IsOptions(context.Request.Method))
    {
        context.Response.StatusCode = StatusCodes.Status204NoContent;
        return;
    }
    await next();
});

// ==============================================================================
// 8. Authentication & Authorization
// ==============================================================================
app.UseAuthentication();
app.UseAuthorization();

// ==============================================================================
// 9. Static files & SPA fallback (chạy frontend React TS chung trên IIS)
// ==============================================================================
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapControllers();

// SPA Fallback cho React Router
app.MapFallbackToFile("index.html");

// ==============================================================================
// 10. Seed Database Data
// ==============================================================================
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var db = services.GetRequiredService<AppDbContext>();
    var pwd = services.GetRequiredService<IPasswordService>();
    var config = services.GetRequiredService<IConfiguration>();
    var logger = services.GetRequiredService<ILogger<Program>>();

    try
    {
        await DbSeeder.EnsureDatabaseAndSchemaAsync(db, config, pwd, logger);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Lỗi khởi tạo CSDL và dữ liệu mặc định: {Message}", ex.Message);
    }
}

app.Run();
