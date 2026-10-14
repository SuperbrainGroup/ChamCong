# PHASE 2 — HỆ THỐNG EMPLOYEE SELF-SERVICE (ESS) & CHẤM CÔNG DI ĐỘNG PWA — Kế hoạch triển khai v2.2

> **Mã dự án:** PRJ-TIME-PHASE2-2026 · **Phiên bản:** 2.2 (cập nhật từ v2.1 theo quyết định ngày 2026-10-11) · **Ngày:** 2026-10-11
> **Phụ thuộc:** kế hoạch Phase 1 `tinh-cham-cong-ke-hoach.md` (engine tính công, kỳ công, quỹ phép, tham số, lịch làm việc).
> File này là bản nguồn (source of truth), đủ chi tiết để một AI/dev khác đọc và code theo.
> Trạng thái: **Đã chốt** (theo yêu cầu chủ dự án) · **Mặc định đề xuất** (có thể đổi bằng tham số, cần xác nhận ở mục "Điểm cần chốt") · **Chưa bắt đầu**.

---

## 0. Thay đổi

### 0.1. Quyết định của chủ dự án ngày 2026-10-11 (v2.2)
| # | Quyết định | Tác động lên kế hoạch |
|---|---|---|
| 1 | Hạ tầng **giữ nguyên** (Windows Server 2012 R2 + SQL Server 2008) | Chấp nhận rủi ro; thêm bộ biện pháp bù đắp bắt buộc (2.1) |
| 2 | Mỗi hội sở có **1 HCNS phụ trách** (tài khoản đang xử lý file chấm công) tự cài đặt Public IP và Locations | HCNS hội sở được quyền khai báo IP/vị trí của hội sở mình (4.8); thêm bảng phạm vi hội sở của HCNS; thêm lớp kiểm soát vì HCNS giữ chốt chặn bảo mật |
| 3 | **Chỉ HCNS duyệt**, không phân quyền nhiều cấp quản lý | Bỏ vai trò quản lý, bỏ bước duyệt quản lý, bỏ tham số chuỗi duyệt, bỏ bảng quản lý–nhân viên; thêm quy tắc HCNS không tự duyệt cho mình |

### 0.2. Thay đổi so với v2.0 (đã có từ v2.1)

| # | Thay đổi | Lý do |
|---|---|---|
| 1 | Bỏ hoàn toàn tầng "Local LAN Probe" và mọi địa chỉ IP nội bộ; bỏ mọi nội dung liên quan máy chấm công. Phase 2 là một nguồn dữ liệu chấm công độc lập qua ứng dụng | Theo yêu cầu; probe cũng không chạy được trên trình duyệt (HTTPS gọi HTTP, giao thức riêng) |
| 2 | Chốt chặn chính để xác nhận "đang ở văn phòng" là **Public IP do server tự đọc**; GPS chỉ là tín hiệu phụ | Dữ liệu client (GPS) giả được, IP phía server thì không |
| 3 | Bảng quyết định cờ đầy đủ mọi tổ hợp; lưu từng cờ riêng + mã lý do | Ma trận cũ thiếu tổ hợp và mâu thuẫn với UAT |
| 4 | Token thiết bị do **server cấp** sau khi HCNS duyệt; fingerprint chỉ là tín hiệu phụ | Fingerprint không duy nhất, không ổn định |
| 5 | Chính sách check-in theo khối nhân viên (văn phòng nghiêm ngặt / chỉ GPS / không yêu cầu vị trí) | Remote, part-time, giáo viên đa hội sở không áp dụng được cơ chế IP |
| 6 | Bổ sung nhân sự kiêm nhiệm nhiều hội sở (bảng phân công), đơn nghỉ nhiều ngày/nửa buổi, nhiều ảnh, giữ chỗ phép, hủy đơn | v2.0 thiếu |
| 7 | Bổ sung khâu gộp lượt bấm → dữ liệu ngày cho engine Phase 1, job tính nháp hằng đêm | v2.0 chưa nói dữ liệu vào engine thế nào |
| 8 | Công bố bảng công có phiên bản, snapshot bất biến, khiếu nại | v2.0 chỉ có cờ công bố |
| 9 | Bổ sung đầy đủ API còn thiếu, DDL mới, an ninh, quyền riêng tư | v2.0 thiếu duyệt cờ, reset thiết bị, mật khẩu... |
| 10 | Lộ trình chia 3 đợt phát hành, pilot song song ít nhất 1 kỳ; UAT chuyển về "Chưa chạy" | 4 tuần không khả thi; UAT cũ ghi Pass dù chưa xây |

---

## 1. TỔNG QUAN

### 1.1. Mục tiêu
Cho nhân viên **tự chấm công, xin nghỉ, giải trình và xem bảng công** trên điện thoại (PWA) và máy tính, thay cho thao tác thủ công của HCNS. Dữ liệu lượt bấm là nguồn đầu vào cho engine tính công của Phase 1; kết quả tính công vẫn do Phase 1 quyết định.

### 1.2. Phạm vi
**Trong phạm vi:** đăng nhập và quản lý thiết bị; check-in/check-out (mobile + PC); xác nhận hiện diện bằng Public IP + GPS + thiết bị; duyệt cờ; hồ sơ, quỹ phép, đa hội sở; đơn nghỉ phép; giải trình bất thường; công bố bảng công và khiếu nại; dashboard HCNS; cấu hình geofence/IP; thông báo trong ứng dụng.

**Ngoài phạm vi (không làm ở Phase 2):** chụp ảnh selfie; chấm công offline; địa chỉ IP nội bộ hay dò mạng nội bộ; ca đêm; tính lương; push notification ngoài ứng dụng (xem Q-P2-7).

### 1.3. Vai trò
| Vai trò | Quyền chính | Ánh xạ Phase 1 |
|---|---|---|
| Nhân viên (EMPLOYEE) | Check-in/out, xem lịch sử, nộp/hủy đơn, xem quỹ phép, xem bảng công đã công bố, khiếu nại | — (mới) |
| HCNS hội sở (HR) | Mỗi hội sở có **1 HCNS phụ trách** (chính là tài khoản đang xử lý file chấm công ở Phase 1). Trong phạm vi hội sở của mình: **khai báo Public IP và vị trí**, tạo/quản lý tài khoản nhân viên, duyệt thiết bị, duyệt cờ, duyệt đơn, công bố/thu hồi bảng công, xử lý khiếu nại, xem dashboard | Nhân viên chấm công |
| Quản trị (ADMIN) | Mọi quyền HCNS ở **mọi hội sở** + tạo hội sở, tạo tài khoản HCNS, vai trò, tham số, mở chốt, xem nhật ký; duyệt thay khi HCNS vắng hoặc khi việc duyệt liên quan chính HCNS | Admin |


**Quy tắc phân quyền (đã chốt 2026-10-11):**
- **Chỉ một cấp duyệt.** Không có vai trò quản lý trung gian, không phân quyền nhiều cấp.
- **Hội sở nào duyệt:** thiết bị, đơn, giải trình, khiếu nại → HCNS của **hội sở chính** của nhân viên; lượt bấm bị gắn cờ → HCNS của hội sở hệ thống nhận diện (không nhận diện được thì hội sở chính).
- **HCNS không tự duyệt cho chính mình:** thiết bị, lượt bấm bị gắn cờ, đơn, giải trình, khiếu nại của HCNS do Admin duyệt.
- **Dự phòng:** mặc định 1 HCNS/hội sở; Admin có thể gán thêm người dự phòng nhưng không bắt buộc; khi HCNS vắng, Admin xử lý.
- Một tài khoản có thể có nhiều vai trò (HCNS cũng là nhân viên và dùng thiết bị của mình). Tài khoản HCNS do Admin tạo; tài khoản nhân viên do HCNS hội sở đó tạo. HCNS quên mật khẩu thì Admin cấp lại.

### 1.4. Quan hệ với Phase 1
| Phase 2 cung cấp | Phase 1 tiếp nhận |
|---|---|
| Dữ liệu ngày (giờ Vào/Ra đã xác nhận) | Dữ liệu quẹt thô, `Nguồn = APP` (mục 6) |
| Đơn nghỉ phép đã duyệt | Ngoại lệ nghỉ phép (Phase 1, tính năng 2.2.1 — chọn phương án nhập qua ứng dụng) |
| Giải trình đã duyệt | Điều chỉnh giờ có lý do (Phase 1, tính năng 4.2.2), `Nguồn = REGULARIZED` |
| **Phase 2 cần từ Phase 1** | Danh mục nhân viên/hội sở/khối, lịch làm việc, tham số, kỳ công, **sổ cái phép (Module 5)**, kết quả tính công |

**Điều kiện bắt đầu (cổng vào Phase 2):** Phase 1 đã chốt tối thiểu Q1–Q8 (giờ hữu dụng, cách phạt trễ, lịch Thứ 7, nguồn nghỉ phép, quỹ phép) và Module 5 (quỹ phép) đã có thiết kế dữ liệu.

**Nhân viên dùng nguồn dữ liệu nào:** mỗi nhân viên có cờ `Nguồn dữ liệu chấm công` = `APP` hoặc `FILE` (file import Phase 1). Nhân viên `APP` chỉ lấy lượt bấm từ Phase 2; nhân viên `FILE` không dùng lượt bấm Phase 2 (ứng dụng vẫn dùng được cho đơn từ, xem bảng công). Không có ngày nào lấy từ hai nguồn cùng lúc.

---

## 2. MÔI TRƯỜNG & CÔNG NGHỆ

### 2.1. Hạ tầng
- **Hạ tầng (đã chốt 2026-10-11): giữ nguyên Windows Server 2012 R2 + SQL Server 2008**, web server IIS 8.5. Đây là nền tảng đã hết hỗ trợ (Windows Server 2012 R2 từ 10/2023, SQL Server 2008 từ 7/2019) trong khi hệ thống mở ra Internet và chứa vị trí, ảnh minh chứng của nhân viên; **chủ dự án chấp nhận rủi ro này**. Mã SQL viết tương thích compat level 100 nên chạy được cả trên đời mới nếu sau này nâng cấp.
- **Biện pháp bù đắp bắt buộc khi giữ hạ tầng cũ:**
  1. Chỉ mở cổng 80/443 ra Internet; CSDL chỉ nhận kết nối từ chính máy ứng dụng (ưu tiên cùng một máy, cổng SQL đóng trên tường lửa).
  2. Nên đặt sau Cloudflare (SSL chế độ Full) và cho IIS chỉ nhận kết nối từ dải IP Cloudflare.
  3. Tắt SSL 3.0/TLS 1.0/TLS 1.1, bật TLS 1.2.
  4. Cài đủ các bản cập nhật cuối cùng cho Windows, IIS, .NET Framework 4.8; bật antivirus.
  5. RDP không mở ra Internet (chỉ VPN hoặc danh sách IP cho phép), mật khẩu mạnh, tách tài khoản quản trị.
  6. Tài khoản SQL của ứng dụng chỉ có quyền tối thiểu, không dùng `sa`.
  7. Sao lưu mỗi đêm ra nơi ngoài máy chủ; theo dõi log và cảnh báo đăng nhập bất thường.
  8. Ghi nhận bằng văn bản việc chủ dự án chấp nhận rủi ro.
- **HTTPS bắt buộc** (Service Worker và Geolocation chỉ chạy trên HTTPS) — **làm ngay từ tuần đầu** để phát triển và thử trên thiết bị thật. Chứng chỉ: Let's Encrypt (win-acme) hoặc Cloudflare. Bật HSTS.
- **Lấy Public IP của client:** nếu đặt sau Cloudflare, đọc `CF-Connecting-IP` và **chỉ tin khi kết nối đến từ dải IP của Cloudflare** (chặn các kết nối khác vào IIS). Nếu không dùng Cloudflare, lấy địa chỉ kết nối trực tiếp; chỉ tin `X-Forwarded-For` từ máy chủ proxy tin cậy đã khai báo.
- **MIME types trên IIS:** `.json` → `application/json`; `.webmanifest` → `application/manifest+json`; `.woff2` → `font/woff2`.
- **Múi giờ:** máy chủ đặt `SE Asia Standard Time` (GMT+7), thời gian lưu UTC.

### 2.2. Công nghệ (chốt một stack)
- **Backend:** ASP.NET Web API, .NET Framework 4.8 (chạy được trên Server 2012 R2 và đời mới hơn), truy cập dữ liệu bằng Dapper/ADO.NET.
- **Frontend:** Vue 3 (build ra tệp tĩnh), Service Worker (Workbox) chỉ để cài PWA và cache tệp giao diện — **không cache API, không xếp hàng lượt bấm offline**.
- **Xác thực:** access token JWT sống ngắn (15 phút) + refresh token xoay vòng lưu băm trong CSDL (thu hồi được khi reset thiết bị/khóa tài khoản).
- **Ảnh minh chứng:** lưu ngoài thư mục web, truy cập qua API có kiểm tra quyền (mục 9.3).
- **Mật khẩu:** PBKDF2-SHA256 (≥ 210.000 vòng, salt ngẫu nhiên, lưu kèm tham số).

### 2.3. Quy tắc SQL tương thích SQL Server 2008
Dùng `CASE WHEN`, không `IIF`; nối chuỗi bằng `+` với `ISNULL`, không `CONCAT`; không dùng `DATEFROMPARTS`, `TRY_PARSE`, `TRY_CONVERT`, `FORMAT`, `STRING_AGG`, `LAG/LEAD`, `OFFSET…FETCH`, hàm JSON; phân trang bằng `ROW_NUMBER()`. Được dùng: `DATE`, `TIME`, `DATETIME2`, `SYSUTCDATETIME()`, filtered index.

---

## 3. QUY CHUẨN GIAO DIỆN (đồng bộ Phase 1)

- **Một font duy nhất: Nunito Sans** cho mọi chữ và **mọi con số**; nhúng tệp font (woff2, 400/600/700, đủ tiếng Việt) trong ứng dụng, đưa vào cache PWA; ép `font-family` cho cả `input/select/textarea/button`. Không dùng font monospace, không dùng emoji làm biểu tượng điều hướng (emoji dùng font hệ thống) — dùng bộ biểu tượng SVG.
- Màu đơn giản, dễ nhìn: nền sáng, một màu nhấn, ba màu trạng thái nhẹ (xanh hợp lệ, vàng xem xét, đỏ vi phạm); trạng thái luôn kèm chữ và biểu tượng, không chỉ dựa vào màu.
- **Không logo mặc định.** Logo là tuỳ chọn do Admin tải cho từng hội sở (Phase 1, tính năng 1.2.2); chưa có thì chỉ hiện tên.
- Ngày `dd/MM/yyyy`, giờ `HH:mm`; toàn bộ chữ tiếng Việt; thông báo lỗi nói rõ cách xử lý.
- Nút bấm tối thiểu 44×44 px; chữ nội dung tối thiểu 16 px trên điện thoại.

---

## 4. ĐỊNH DANH THIẾT BỊ & XÁC NHẬN HIỆN DIỆN

### 4.1. Nguyên tắc tin cậy
| Loại dữ liệu | Độ tin cậy | Dùng làm gì |
|---|---|---|
| Thời gian server, Public IP do server đọc, token thiết bị do server cấp | **Tin cậy** | Căn cứ chính |
| Tọa độ GPS, độ chính xác, thông báo lỗi định vị do client gửi lên | **Không tin tuyệt đối** (client sửa được) | Tín hiệu phụ, chỉ để gắn cờ |
| Fingerprint trình duyệt | Tham khảo | Chỉ để phát hiện thay đổi bất thường, **không** dùng để cho phép |

Hệ thống xác nhận **thiết bị đã duyệt đang ở mạng văn phòng**, không chứng minh được người cầm máy là ai. Muốn xác nhận đúng người, dùng tuỳ chọn WebAuthn (4.2, Q-P2-6).

### 4.2. Hai khe thiết bị (Dual-Device Binding)
Mỗi nhân viên có tối đa **1 điện thoại** và **1 máy tính** được kích hoạt.

**Đăng ký thiết bị**
1. Nhân viên đăng nhập trên thiết bị. **iPhone:** phải cài PWA ra Màn hình chính trước rồi mở từ biểu tượng và đăng ký tại đó (kho lưu trữ của PWA tách riêng với Safari); nếu đang mở trong tab Safari, ứng dụng chặn và hướng dẫn cài.
2. Bấm "Đăng ký thiết bị này" → server tạo yêu cầu `PENDING` và cấp **mã bí mật ngẫu nhiên 256-bit** (trả về một lần). Client lưu vào IndexedDB (mobile) hoặc cookie HttpOnly + IndexedDB (PC). Server chỉ lưu **băm SHA-256** của mã.
3. HCNS thấy: tên máy, hệ điều hành, trình duyệt, **Public IP lúc đăng ký**, thời gian, nhân viên → Duyệt/Từ chối.
4. Sau khi duyệt, mọi lệnh gọi chấm công/đơn từ gửi kèm mã bí mật; server so băm. Thiết bị chưa duyệt chỉ xem được hồ sơ.

**Ràng buộc nghiệp vụ**
- Một nhân viên chỉ có tối đa 1 thiết bị mobile và 1 thiết bị PC ở trạng thái chờ duyệt hoặc đã duyệt.
- Một mã bí mật chỉ gắn với 1 nhân viên: nhân viên khác đăng nhập trên máy này thì bị từ chối ("Thiết bị này đã đăng ký cho tài khoản khác").
- Đổi điện thoại/máy tính: HCNS bấm **Thu hồi (Reset thiết bị)** → thiết bị cũ chuyển `REVOKED`, toàn bộ refresh token của thiết bị bị thu hồi; nhân viên đăng ký lại. Lịch sử thiết bị được giữ.
- Máy tính cá nhân ở nhà không được duyệt cho chấm công khi chính sách là `OFFICE_STRICT`.
- Xoá dữ liệu trình duyệt/gỡ PWA làm mất mã bí mật → phải xin reset (cảnh báo rõ trên màn hình đăng ký).
- Fingerprint (độ phân giải, số nhân CPU, nền tảng…) lưu dạng băm kèm thiết bị; thay đổi lớn giữa các lần dùng → ghi sự kiện bảo mật, không tự chặn.
- **Tuỳ chọn WebAuthn** (Face ID/vân tay của máy): thay mã bí mật bằng khóa mật mã gắn thiết bị và yêu cầu xác thực sinh trắc khi chấm công, vẫn không cần selfie. Làm ở đợt A+ nếu thư viện chạy ổn trên .NET 4.8 (Q-P2-6).

### 4.3. Chính sách check-in theo khối nhân viên
Tham số `CHECKIN_POLICY` (đặt trong bảng tham số Phase 1 theo hội sở và khối):

| Chính sách | Dùng cho | Điều kiện coi là hiện diện |
|---|---|---|
| `OFFICE_STRICT` (mặc định khối Chuẩn) | Nhân viên làm tại văn phòng, hội sở có IP cố định | Thiết bị đã duyệt **và** Public IP thuộc hội sở **và** GPS trong bán kính |
| `OFFICE_GPS_ONLY` | Hội sở chưa có IP cố định; giáo viên luân phiên | Thiết bị đã duyệt **và** GPS trong bán kính |
| `LOCATION_NOT_REQUIRED` | Remote/Online | Thiết bị đã duyệt; vẫn ghi vị trí và IP để tham khảo, không gắn cờ vì vị trí |

### 4.4. Quy trình xử lý một lượt bấm (server)
1. Xác thực token, kiểm tra thiết bị `APPROVED` và mã bí mật. Sai → **từ chối**, không ghi lượt bấm, ghi nhật ký bảo mật.
2. Kiểm tra chống trùng: `ClientRequestId` đã có → trả lại kết quả cũ (không ghi lần 2); khoảng cách tới lượt bấm trước < `PUNCH_MIN_INTERVAL_SEC` (60 giây) → từ chối nhẹ; quá `PUNCH_MAX_PER_DAY` (10) → từ chối.
3. Lấy **thời gian server** (UTC) và ngày công theo GMT+7. Bỏ qua mọi giờ client gửi.
4. Lấy **Public IP** (mục 2.1). Xác định hội sở: thử lần lượt các hội sở nhân viên được phân công (hội sở chính trước); khớp theo mạng (IP thuộc `tbl_BranchNetworks` còn hiệu lực) hoặc theo GPS. Không khớp hội sở nào được phân công nhưng khớp hội sở khác → `ReasonCode = WRONG_BRANCH`.
5. Tính `IpOk` (IP nằm trong CIDR của hội sở; hỗ trợ IPv4 và tiền tố IPv6).
6. Tính GPS (Haversine): `khoảng_cách_hiệu_dụng = max(0, khoảng_cách − min(độ_chính_xác, GEO_ACC_CREDIT_M))`. Trạng thái:
   - `OK`: có tọa độ, độ chính xác ≤ `GEO_ACCURACY_MAX_M`, khoảng cách hiệu dụng ≤ bán kính.
   - `OUT`: có tọa độ, độ chính xác chấp nhận được, nhưng ngoài bán kính.
   - `LOW_ACC`: độ chính xác kém hơn `GEO_ACCURACY_MAX_M` (không kết luận được).
   - `MISSING`: từ chối quyền định vị hoặc lỗi định vị. `NA`: kênh/chính sách không dùng GPS.
7. Áp bảng quyết định (4.5) → `VerificationStatus`, `ReasonCode`, `ReviewState`.
8. Ghi lượt bấm (bất biến, không sửa), tạo thông báo cho HCNS nếu cần duyệt.

### 4.5. Bảng quyết định (đầy đủ cho `OFFICE_STRICT`, Mobile)
| Thiết bị | IpOk | GPS | Trạng thái | Mã lý do | Hành vi |
|---|---|---|---|---|---|
| Đã duyệt | Đúng | OK | 🟢 `VALID` | — | Tính công tự động |
| Đã duyệt | Đúng | OUT / LOW_ACC / MISSING | 🟡 `REVIEW` | `GPS_DRIFT` | Ghi nhận, chờ HCNS duyệt (IP là bằng chứng mạnh) |
| Đã duyệt | Sai | OK | 🟡 `REVIEW` | `OFF_NETWORK` | Chờ duyệt. **Không phân biệt được** "ở công ty bật 4G" và "giả GPS ở nhà" → HCNS xem thêm lịch sử; lặp lại ≥ `FLAG_REPEAT_ALERT` lần/kỳ thì có cảnh báo |
| Đã duyệt | Sai | OUT / LOW_ACC / MISSING | 🔴 `OUT_OF_OFFICE` | `OUTSIDE` | Ghi nhận nhưng **chưa tính công**; nhân viên phải giải trình hoặc HCNS xem xét |
| Chưa duyệt / sai mã | — | — | Từ chối | `DEVICE_REJECTED` | Không ghi lượt bấm |

- Một lượt bấm **được engine dùng** khi `VerificationStatus = VALID` hoặc `ReviewState = ACCEPTED`. `REJECTED` hoặc đang `PENDING` thì chưa dùng.
- `OFFICE_GPS_ONLY`: bỏ cột IpOk (IP chỉ lưu tham khảo): GPS OK → `VALID`; còn lại → `REVIEW`/`OUT_OF_OFFICE` tương tự.
- `LOCATION_NOT_REQUIRED`: luôn `VALID`.
- **PC (Web):** không dùng GPS. `OFFICE_STRICT` + `IpOk = Sai` → **từ chối thao tác** (`PC_NOT_IN_OFFICE`), không ghi lượt bấm; `IpOk = Đúng` → `VALID`.

### 4.6. Cảnh báo cho HCNS
- **IP văn phòng có thể đã đổi:** ≥ `IP_DRIFT_ALERT_COUNT` (5) lượt bấm trong 30 phút tại một hội sở có GPS `OK` nhưng IP sai và cùng một IP mới → cảnh báo cho HCNS hội sở đó, kèm nút "Thêm IP này vào hội sở" (HCNS xác nhận; ghi nhật ký và báo Admin).
- **Lặp lại bất thường:** nhân viên có ≥ 3 lượt 🟡 `OFF_NETWORK` hoặc 🔴 trong một kỳ.
- **Thiết bị bất thường:** fingerprint đổi lớn; nhiều lần thử đăng nhập từ thiết bị chưa đăng ký.

### 4.7. Giới hạn đã biết
Không phát hiện được ứng dụng giả vị trí từ phía trình duyệt; không chứng minh được người cầm máy (mượn điện thoại của đồng nghiệp) nếu không dùng WebAuthn; điện thoại dùng 4G tại văn phòng bị gắn cờ vàng. Các giới hạn này được bù bằng IP phía server, duyệt cờ của HCNS và cảnh báo lặp lại.

### 4.8. Khai báo Public IP và vị trí hội sở (do HCNS hội sở)
- **Ai làm:** HCNS phụ trách hội sở (đã chốt 2026-10-11) tự khai báo trong màn hình "Cấu hình hội sở"; Admin xem và sửa được mọi hội sở. HCNS chỉ sửa được hội sở được gán.
- **Vị trí (Locations):** nhập tên điểm, toạ độ và bán kính (20–500 m, mặc định 50 m). Hỗ trợ nhập bằng cách chọn trên bản đồ hoặc bấm "Lấy vị trí hiện tại" khi HCNS đang đứng trong văn phòng. Một hội sở có thể có nhiều điểm (nhiều cổng/tầng).
- **Public IP (Networks):** nhập IP hoặc dải CIDR (IPv4 và IPv6), ngày hiệu lực từ–đến, ghi chú. Có nút **"Dùng IP hiện tại của tôi"**: server đọc Public IP của chính HCNS đang đăng nhập từ máy trong văn phòng, giúp tránh gõ sai.
- **Quy tắc và kiểm soát (vì HCNS giữ chốt chặn bảo mật):**
  1. Dải IP phải đủ hẹp: IPv4 tiền tố từ /24 trở lên (hẹp hơn), IPv6 từ /56 trở lên; từ chối dải rộng hơn.
  2. Cảnh báo khi IP đã thuộc hội sở khác (vẫn cho lưu nếu HCNS xác nhận, vì hai hội sở có thể dùng chung đường truyền).
  3. Không xoá cứng: "xoá" là đặt ngày hết hiệu lực.
  4. **Mọi thay đổi** IP/vị trí ghi nhật ký (người, thời điểm, giá trị trước/sau, IP người thao tác) và **gửi thông báo cho Admin**; Admin có báo cáo thay đổi theo tháng.
  5. Khi nhận cảnh báo IP đổi (4.6), HCNS bấm "Thêm IP này" và xác nhận; IP được đề xuất chỉ lấy từ chính các lượt bấm trong cảnh báo.
- **Hội sở chưa cấu hình xong:** chưa có IP hiệu lực → chính sách `OFFICE_STRICT` tạm chạy như `OFFICE_GPS_ONLY` và HCNS/Admin thấy cảnh báo thường trực "Hội sở chưa cấu hình IP" (mặc định đề xuất); chưa có vị trí → mọi lượt bấm của hội sở bị gắn cờ `GPS_DRIFT` kèm cảnh báo.
- **Trạng thái:** Đã chốt.

---

## 5. ĐẶC TẢ PHÂN HỆ NGHIỆP VỤ

### 5.1. Tài khoản & đăng nhập
- **Mô tả:** mỗi nhân viên có 1 tài khoản gắn mã nhân viên. HCNS hội sở tạo hàng loạt từ danh mục nhân viên của hội sở mình (Admin tạo tài khoản HCNS); mật khẩu tạm ngẫu nhiên, **bắt buộc đổi ở lần đăng nhập đầu**; lần đầu hiện màn hình **đồng ý xử lý dữ liệu cá nhân** (vị trí, IP, ảnh), lưu phiên bản và thời điểm đồng ý.
- **Quên mật khẩu:** không có email tự phục hồi; nhân viên liên hệ HCNS để cấp mật khẩu tạm mới (đánh dấu bắt buộc đổi). (Q-P2-11)
- **Ràng buộc:** tên đăng nhập duy nhất; mật khẩu tối thiểu 8 ký tự; khóa `LOCK_MINUTES` (15 phút) sau `LOGIN_MAX_FAILS` (5) lần sai liên tiếp; tài khoản nghỉ việc tự khóa theo ngày nghỉ việc trong hồ sơ nhân viên; luôn còn ít nhất 1 Admin hoạt động.
- **Trạng thái:** Đã chốt.

### 5.2. Hồ sơ nhân viên & đa hội sở
- **Hiển thị:** mã NV, họ tên, bộ phận, chức vụ, ngày vào làm, thâm niên, loại hợp đồng, hội sở chính và hội sở phụ, hai khe thiết bị và trạng thái từng khe.
- **Kiêm nhiệm nhiều hội sở:** mỗi nhân viên có **đúng 1 hội sở chính** và 0 hay nhiều hội sở phụ, mỗi phân công có ngày bắt đầu/kết thúc (bảng phân công, mục 8). Công của lượt bấm được tính cho hội sở hệ thống nhận diện (4.4 bước 4), phải nằm trong số hội sở nhân viên được phân công.
- **Thẻ quỹ phép:** phép năm được cấp · phép thâm niên · phép tồn năm trước (hạn dùng 31/03) · phép bù sự kiện · đã dùng · **đang giữ chỗ cho đơn chờ duyệt** · **còn lại có thể xin**. Số liệu lấy từ sổ cái phép Phase 1 (Module 5).
- **Trạng thái:** Đã chốt; cần cập nhật Phase 1 để cho phép hội sở phụ (mục 14.1).

### 5.3. Check-in / Check-out
- **Luồng:** màn hình chủ có một nút tròn lớn. Chưa có lượt nào hợp lệ hôm nay → nút "Check-in"; đã có → nút "Check-out" (kèm giờ check-in đã ghi). Mỗi lần bấm là một lượt bấm trung tính; **không lưu "loại"**. Giờ Vào/Ra được suy ra khi gộp (mục 6): Vào = lượt được dùng sớm nhất trong ngày, Ra = lượt được dùng muộn nhất cách Vào ≥ `MIN_WORK_SPAN_MIN` (30 phút).
- **Trải nghiệm:** bấm → hiện trạng thái từng bước ("Đang xác định vị trí…") → kết quả có màu và lý do. Định vị có thể mất 5–15 giây, tối đa chờ 20 giây rồi báo "Chưa lấy được vị trí" kèm lựa chọn gửi không có tọa độ (sẽ bị gắn cờ). Nút Check-out yêu cầu **bấm xác nhận 1 lần** để tránh bấm nhầm.
- **Ràng buộc:** quy tắc chống trùng/giới hạn lượt ở 4.4 bước 2; mỗi lượt bấm bất biến; lượt không đạt không bị xoá mà mang trạng thái duyệt.
- **Lịch sử cá nhân:** từng ngày hiển thị các lượt bấm (giờ, trạng thái, lý do), đơn đang xử lý. **Chưa công bố bảng công thì không hiển thị mã công, phút trễ/sớm, tổng**; chỉ hiển thị danh sách **"Ngày cần giải trình"** (thiếu lượt bấm, vắng chưa có đơn, vào/ra lệch chuẩn không đủ bù) — không kèm số phút phạt.
- **Trạng thái:** Đã chốt.

### 5.4. Duyệt cờ (HCNS)
- **Mô tả:** hàng đợi lượt bấm 🟡/🔴 lọc theo ngày, hội sở, nhân viên, mã lý do; xem tọa độ trên bản đồ, khoảng cách, độ chính xác, IP, thiết bị, lịch sử 30 ngày; duyệt **hàng loạt** (Chấp nhận/Từ chối + ghi chú).
- **Luồng:** `REVIEW`/`OUT_OF_OFFICE` → `ReviewState = PENDING` → HCNS `ACCEPTED` hoặc `REJECTED`. Từ chối thì lượt bấm không được tính; ngày đó vào "Ngày cần giải trình" của nhân viên; nhân viên được thông báo.
- **Ràng buộc:** không duyệt lượt bấm thuộc kỳ đã chốt; ghi nhật ký người duyệt; HCNS chỉ duyệt lượt bấm của hội sở được gán và không duyệt lượt bấm của chính mình (Admin duyệt).
- **Trạng thái:** Đã chốt.

### 5.5. Đơn nghỉ phép
- **Loại đơn nhân viên được nộp:** `P`, `P/2` (chọn sáng hoặc chiều), `BL`, `BL/2`, `NL`/nghỉ không lương, `K` (nghỉ có lương theo luật — cần minh chứng). Khi vượt số dư, ứng dụng đề xuất `P/2K` (nếu còn đúng 0.5) hoặc nghỉ không lương. Cách ánh xạ mã nghỉ không lương phụ thuộc Phase 1 Q12 (`N` hay `NL`). (Q-P2-5)
- **Form:** từ ngày – đến ngày (nhiều ngày), buổi, lý do, tệp đính kèm.
- **Kiểm tra khi nộp:** (1) ngày nằm trong kỳ chưa chốt hoặc tương lai không quá `LEAVE_ADVANCE_MAX_DAYS` (90), quá khứ không quá `REQUEST_BACKDATE_MAX_DAYS` (10); (2) không trùng ngày với đơn khác đang chờ/đã duyệt; (3) không rơi vào ngày nghỉ tuần/Lễ theo lịch (ngày đó không tính vào số ngày xin); (4) đủ phép khả dụng = số dư sổ cái − số ngày đang giữ chỗ của đơn chờ duyệt. Việc kiểm tra và giữ chỗ chạy **trong một giao dịch có khóa trên nhân viên** để hai đơn gửi cùng lúc không cùng vượt số dư.
- **Minh chứng (mặc định theo yêu cầu gốc):** bắt buộc tải ≥ 1 ảnh (tối đa 5 ảnh) để gửi đơn. Tham số `REQUEST_EVIDENCE_POLICY` cho Admin đổi theo loại đơn: `REQUIRED` / `OPTIONAL`. (Q-P2-4)
- **Chuỗi duyệt (đã chốt 2026-10-11):** chỉ một cấp — HCNS phụ trách hội sở chính của nhân viên; không có quản lý trung gian. Đơn của chính HCNS do Admin duyệt.
- **Trạng thái đơn:** `PENDING_HR` → `APPROVED` / `REJECTED`; nhân viên có thể `CANCELLED` khi đơn chưa duyệt, hoặc xin hủy đơn đã duyệt (cần HCNS đồng ý nếu ngày chưa qua).
- **Sau khi duyệt:** tạo ngoại lệ nghỉ phép cho từng ngày trong Phase 1 và ghi dòng trừ vào sổ cái phép; hủy/từ chối thì hoàn lại phần giữ chỗ/đã trừ. Đơn thuộc kỳ đã chốt không được duyệt (báo Admin mở chốt).
- **Trạng thái:** Đã chốt luồng; Đang brainstorm (Q-P2-4, Q-P2-5).

### 5.6. Giải trình bất thường
- **Danh sách ngày nghi vấn** do job tính nháp hằng đêm (mục 6.3): thiếu lượt Vào hoặc Ra (`?`), vắng chưa có đơn (`V`), vào/ra lệch chuẩn không đủ bù, lượt bấm bị từ chối.
- **Lý do:** Quên bấm · Lỗi ứng dụng/thiết bị/mạng · Đi công tác ngoài văn phòng · Họp khách hàng · Khác (nhập chữ).
- **Form:** chọn ngày → lý do → **giờ Vào/Ra thực tế** → ảnh bằng chứng (theo `REQUEST_EVIDENCE_POLICY`, mặc định bắt buộc, gồm xác nhận của cấp trên) → gửi.
- **Ràng buộc:** mỗi ngày tối đa 1 giải trình đang xử lý; chỉ cho ngày thuộc kỳ chưa chốt và trong `REQUEST_BACKDATE_MAX_DAYS`; giờ ra phải sau giờ vào.
- **Sau khi duyệt:** giờ thực tế được ghi thành **điều chỉnh có lý do** (không xoá lượt bấm gốc) và engine Phase 1 **tính lại** ngày đó — kết quả có thể là `1`, `0.5`... tuỳ giờ làm thực tế, không tự động bằng `1`; phút trễ/sớm được tính lại theo quy tắc Phase 1.
- **Trạng thái:** Đã chốt.

### 5.7. Xem bảng chấm công & khiếu nại
- **Trước công bố:** chỉ lịch sử lượt bấm và danh sách "Ngày cần giải trình" (5.3).
- **Công bố:** HCNS bấm "Công bố bảng chấm công" cho một hội sở và một kỳ (thường vào khoảng ngày `PUBLISH_DEFAULT_DAY` = 28, chỉ là mốc gợi ý, không cứng). Điều kiện: kỳ ở trạng thái **Đã chốt** ở Phase 1. Hệ thống **chụp lại bản bất biến** (snapshot) từng nhân viên và gắn số phiên bản.
- **Nhân viên thấy:** số ngày công làm việc (cột J), ngày lễ (I), nghỉ phép năm (K), nghỉ hưởng lương (L), nghỉ trừ lương (M), tổng ngày công tính lương (N), tổng phút đi trễ/về sớm, mã công từng ngày, số phép còn lại chuyển sang kỳ sau.
- **Khiếu nại:** trong `DISPUTE_WINDOW_DAYS` (3) ngày sau công bố, nhân viên gửi khiếu nại (chọn ngày + nội dung). HCNS chấp nhận/từ chối kèm phản hồi. Nếu cần sửa số liệu: Admin mở chốt kỳ (có lý do), HCNS tính lại, **công bố phiên bản mới** (bản cũ chuyển thành "đã thay thế", nhân viên được thông báo).
- **Thu hồi công bố:** HCNS thu hồi khi phát hiện sai; nhân viên thấy lại thông báo "đang đối soát".
- **Trạng thái:** Đã chốt.

### 5.8. Dashboard HCNS & quản trị
- **Thẻ số liệu hôm nay:** số đã check-in / chưa / 🟡 / 🔴; hàng đợi duyệt cờ; thiết bị chờ duyệt; đơn chờ duyệt (theo hội sở); số ngày chưa giải trình trong kỳ; cảnh báo (4.6).
- **HCNS hội sở (trong phạm vi hội sở mình):** khai báo vị trí geofence và Public IP/CIDR (4.8), tạo tài khoản và phân công hội sở phụ cho nhân viên, xem nhật ký thay đổi của hội sở.
- **Quản trị (Admin):** hội sở, tài khoản HCNS và vai trò, người dùng, xem nhật ký bảo mật và mọi thay đổi IP/vị trí, duyệt thay HCNS.
- **Trạng thái:** Đã chốt.

### 5.9. Thông báo trong ứng dụng
Chuông thông báo: đơn được duyệt/từ chối, lượt bấm bị từ chối, nhắc ngày cần giải trình, bảng công đã công bố, phản hồi khiếu nại. Không push ngoài ứng dụng ở Phase 2 (Q-P2-7).

---

## 6. TÍCH HỢP VỚI ENGINE PHASE 1

### 6.1. Gộp lượt bấm thành dữ liệu ngày
Với nhân viên `Nguồn = APP`, mỗi ngày công (GMT+7) tạo một dòng `tbl_DailyPunchSummary`:
1. Lấy các lượt bấm **được dùng** (4.5) của ngày, sắp theo giờ.
2. Nếu có **điều chỉnh đã duyệt** (giải trình) → dùng giờ điều chỉnh thay cho giờ gộp, `Adjusted = 1`.
3. Ngược lại: `Vào` = lượt sớm nhất; `Ra` = lượt muộn nhất cách `Vào` ≥ `MIN_WORK_SPAN_MIN`; nếu không có lượt thỏa → chỉ có Vào (engine ra `?`).
4. Ghi `HasPendingReview = 1` nếu còn lượt chờ duyệt cờ trong ngày (để HCNS không chốt kỳ khi còn).
5. Dòng này chính là "dữ liệu quẹt thô" mà engine Phase 1 đọc (Vào 1, Ra 1), thêm cột `Nguồn`.

### 6.2. Đơn nghỉ và điều chỉnh vào engine
- Đơn nghỉ được duyệt → Ngoại lệ nghỉ phép (một dòng/ngày: nhân viên, ngày, mã, buổi, lý do, liên kết đơn).
- Giải trình được duyệt → điều chỉnh giờ (`tbl_TimeAdjustments`) → bước 2 ở 6.1.
- Chỉ ngày thuộc kỳ chưa chốt mới được ghi.

### 6.3. Job nền hằng đêm
Lúc `NIGHTLY_PREVIEW_TIME` (22:00), chạy gộp (6.1) và engine ở **chế độ nháp** cho kỳ đang mở của mọi hội sở. Kết quả nháp chỉ dùng để sinh "Ngày cần giải trình", cảnh báo HCNS và tiến độ; **không phải kết quả chính thức** và không ghi đè sửa tay. HCNS có thể bấm "Tính lại ngay" cho một nhân viên. Job dùng Windows Task Scheduler gọi một lệnh nội bộ có khóa chống chạy trùng.

### 6.4. Tham số mới thêm vào bảng tham số Phase 1
Mỗi tham số có giá trị mặc định hệ thống, ghi đè theo hội sở/khối, và được chụp lại khi tạo kỳ công như các tham số Phase 1.

| Mã biến | Ý nghĩa | Mặc định |
|---|---|---|
| `CHECKIN_POLICY` | Chính sách check-in (4.3) | `OFFICE_STRICT` (Chuẩn); `LOCATION_NOT_REQUIRED` (Remote) |
| `GEO_ACCURACY_MAX_M` | Độ chính xác GPS tối đa chấp nhận | 100 |
| `GEO_ACC_CREDIT_M` | Phần sai số GPS được trừ vào khoảng cách | 30 |
| `PUNCH_MIN_INTERVAL_SEC` / `PUNCH_MAX_PER_DAY` | Chống bấm dồn | 60 / 10 |
| `MIN_WORK_SPAN_MIN` | Khoảng tối thiểu Vào → Ra | 30 |
| `REQUEST_EVIDENCE_POLICY` | Bắt buộc ảnh theo loại đơn | `REQUIRED` cho mọi loại |
| `REQUEST_BACKDATE_MAX_DAYS` / `LEAVE_ADVANCE_MAX_DAYS` | Cửa sổ nộp đơn | 10 / 90 |
| `PUBLISH_DEFAULT_DAY` / `DISPUTE_WINDOW_DAYS` | Mốc công bố gợi ý / thời hạn khiếu nại | 28 / 3 |
| `NIGHTLY_PREVIEW_TIME` | Giờ chạy tính nháp | 22:00 |
| `LOGIN_MAX_FAILS` / `LOCK_MINUTES` | Khóa tài khoản | 5 / 15 |
| `IP_DRIFT_ALERT_COUNT` / `FLAG_REPEAT_ALERT` | Ngưỡng cảnh báo | 5 / 3 |
| `LOCATION_RETENTION_MONTHS` / `EVIDENCE_RETENTION_MONTHS` | Thời hạn lưu tọa độ / ảnh | 12 / 24 (chờ pháp chế) |

### 6.5. Cập nhật cần làm trong kế hoạch Phase 1
Xem mục 14.1.

---

## 7. THIẾT KẾ GIAO DIỆN

### 7.1. Mobile PWA
Thanh điều hướng đáy 4 tab (biểu tượng SVG, không emoji), áp dụng quy chuẩn mục 3:
1. **Trang chủ:** giờ hiện tại, ca hôm nay, hội sở nhận diện, nút tròn Check-in/Check-out, trạng thái định vị ("Sai số 12 m") và mạng; sau khi bấm hiển thị kết quả có màu + lý do.
2. **Chấm công:** lịch tháng, các lượt bấm theo ngày, "Ngày cần giải trình", sau công bố có nút xem bảng công chính thức.
3. **Đơn từ:** tạo đơn nghỉ/giải trình, danh sách và trạng thái, hủy đơn.
4. **Tài khoản:** hồ sơ, thẻ quỹ phép, hai thiết bị liên kết, thông báo, đổi mật khẩu.

Trạng thái đặc biệt cần thiết kế: chưa đăng ký thiết bị (hướng dẫn cài PWA/đăng ký), thiết bị chờ duyệt, mất mạng (nút Check-in bị khóa, báo "Cần có mạng để chấm công"), từ chối quyền định vị (hướng dẫn bật), tài khoản bị khóa, phiên hết hạn.

### 7.2. PC Web Portal
Màn hình lớn tự chuyển sang bố cục dashboard: thanh bên trái (điều hướng, trạng thái máy đã duyệt hay chưa); trung tâm: banner Check-in PC (chỉ kích hoạt khi máy đã duyệt và đang ở mạng văn phòng theo chính sách), tiến độ công trong tháng, thẻ quỹ phép. Không có logo mặc định.

### 7.3. Giao diện HCNS/Admin
Dashboard (5.8) trên PC: hàng đợi duyệt cờ có bản đồ và duyệt hàng loạt; hộp thư đơn với xem trước ảnh; danh sách thiết bị chờ duyệt; trang công bố bảng công kèm kiểm tra điều kiện (kỳ đã chốt, còn ngày chưa giải trình, còn cờ chờ duyệt).

---

## 8. THIẾT KẾ CƠ SỞ DỮ LIỆU (DDL tương thích SQL Server 2008, compat level 100)

**Giả định có sẵn từ Phase 1** (tên bảng cần đối chiếu khi viết DDL Phase 1): `tbl_Employees(EmployeeCode)`, `tbl_Branches(BranchCode)` (hội sở), `tbl_Periods(PeriodID)` (kỳ công). Mọi cột người thao tác lưu `UserID` (không lưu tên chữ) để truy vết. Cột thời gian hệ thống lưu UTC.

```sql
-- =========================================================================
-- PHASE 2 (ESS) — TimekeepingDB — SQL Server 2008 compliant
-- =========================================================================

-- 1. TÀI KHOẢN & VAI TRÒ
CREATE TABLE tbl_UserAccounts (
    UserID              INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeCode        VARCHAR(20)  NOT NULL UNIQUE,
    Username            VARCHAR(50)  NOT NULL UNIQUE,
    PasswordHash        VARCHAR(250) NOT NULL,       -- 'PBKDF2$SHA256$iterations$salt$hash'
    MustChangePassword  BIT          NOT NULL DEFAULT 1,
    FailedLoginCount    INT          NOT NULL DEFAULT 0,
    LockedUntilUtc      DATETIME2(0) NULL,
    IsActive            BIT          NOT NULL DEFAULT 1,
    PrivacyConsentAtUtc DATETIME2(0) NULL,
    PrivacyConsentVer   VARCHAR(20)  NULL,
    LastLoginAtUtc      DATETIME2(0) NULL,
    CreatedAtUtc        DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_User_Emp FOREIGN KEY (EmployeeCode) REFERENCES tbl_Employees(EmployeeCode)
);

CREATE TABLE tbl_UserRoles (
    UserID   INT         NOT NULL,
    RoleCode VARCHAR(20) NOT NULL,
    CONSTRAINT PK_UserRoles PRIMARY KEY (UserID, RoleCode),
    CONSTRAINT CK_UserRoles CHECK (RoleCode IN ('EMPLOYEE','HR','ADMIN')),
    CONSTRAINT FK_UserRoles_User FOREIGN KEY (UserID) REFERENCES tbl_UserAccounts(UserID)
);

CREATE TABLE tbl_HrBranchScopes (                 -- hội sở mà tài khoản HCNS phụ trách (ADMIN thấy tất cả)
    UserID     INT         NOT NULL,
    BranchCode VARCHAR(20) NOT NULL,
    FromDate   DATE        NOT NULL,
    ToDate     DATE        NULL,
    CONSTRAINT PK_HrScope PRIMARY KEY (UserID, BranchCode, FromDate),
    CONSTRAINT FK_HrScope_User   FOREIGN KEY (UserID)     REFERENCES tbl_UserAccounts(UserID),
    CONSTRAINT FK_HrScope_Branch FOREIGN KEY (BranchCode) REFERENCES tbl_Branches(BranchCode)
);

-- 2. THIẾT BỊ (HAI KHE: MOBILE / PC)
CREATE TABLE tbl_EmployeeDevices (
    DeviceBindingID   INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeCode      VARCHAR(20)  NOT NULL,
    DeviceType        VARCHAR(10)  NOT NULL,       -- 'MOBILE' | 'PC'
    SecretHash        CHAR(64)     NOT NULL,       -- SHA-256 của mã bí mật do server cấp
    FingerprintHash   CHAR(64)     NULL,           -- tham khảo, KHÔNG dùng để cho phép
    DeviceName        NVARCHAR(100) NULL,
    OperatingSystem   VARCHAR(50)  NULL,
    BrowserInfo       VARCHAR(100) NULL,
    RegisteredPublicIP VARCHAR(45) NULL,
    ApprovalStatus    VARCHAR(10)  NOT NULL DEFAULT 'PENDING',
    IsActiveSlot      BIT          NOT NULL DEFAULT 1,   -- 1 khi PENDING/APPROVED (do ứng dụng cập nhật)
    RequestedAtUtc    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    DecidedByUserID   INT          NULL,
    DecidedAtUtc      DATETIME2(0) NULL,
    DecisionNote      NVARCHAR(255) NULL,
    LastUsedAtUtc     DATETIME2(0) NULL,
    LastUsedPublicIP  VARCHAR(45)  NULL,
    CONSTRAINT CK_Dev_Type   CHECK (DeviceType IN ('MOBILE','PC')),
    CONSTRAINT CK_Dev_Status CHECK (ApprovalStatus IN ('PENDING','APPROVED','REJECTED','REVOKED')),
    CONSTRAINT CK_Dev_Slot   CHECK ((ApprovalStatus IN ('PENDING','APPROVED') AND IsActiveSlot = 1)
                                 OR (ApprovalStatus IN ('REJECTED','REVOKED')  AND IsActiveSlot = 0)),
    CONSTRAINT FK_Dev_Emp  FOREIGN KEY (EmployeeCode)    REFERENCES tbl_Employees(EmployeeCode),
    CONSTRAINT FK_Dev_User FOREIGN KEY (DecidedByUserID) REFERENCES tbl_UserAccounts(UserID)
);
-- mỗi nhân viên tối đa 1 khe đang hoạt động cho mỗi loại thiết bị
CREATE UNIQUE INDEX UX_Dev_ActiveSlot  ON tbl_EmployeeDevices(EmployeeCode, DeviceType) WHERE IsActiveSlot = 1;
-- một mã bí mật chỉ thuộc về một nhân viên
CREATE UNIQUE INDEX UX_Dev_ActiveSecret ON tbl_EmployeeDevices(SecretHash) WHERE IsActiveSlot = 1;

CREATE TABLE tbl_RefreshTokens (
    TokenID         BIGINT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT          NOT NULL,
    DeviceBindingID INT          NULL,
    TokenHash       CHAR(64)     NOT NULL UNIQUE,
    ExpiresAtUtc    DATETIME2(0) NOT NULL,
    RevokedAtUtc    DATETIME2(0) NULL,
    CreatedAtUtc    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CreatedPublicIP VARCHAR(45)  NULL,
    CONSTRAINT FK_RT_User FOREIGN KEY (UserID) REFERENCES tbl_UserAccounts(UserID),
    CONSTRAINT FK_RT_Dev  FOREIGN KEY (DeviceBindingID) REFERENCES tbl_EmployeeDevices(DeviceBindingID)
);

-- 3. HỘI SỞ PHỤ, GEOFENCE, MẠNG (PUBLIC IP)
CREATE TABLE tbl_EmployeeBranchAssignments (
    AssignmentID INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeCode VARCHAR(20) NOT NULL,
    BranchCode   VARCHAR(20) NOT NULL,
    IsPrimary    BIT         NOT NULL DEFAULT 0,
    FromDate     DATE        NOT NULL,
    ToDate       DATE        NULL,
    CONSTRAINT FK_EBA_Emp    FOREIGN KEY (EmployeeCode) REFERENCES tbl_Employees(EmployeeCode),
    CONSTRAINT FK_EBA_Branch FOREIGN KEY (BranchCode)   REFERENCES tbl_Branches(BranchCode)
);
-- mỗi nhân viên đúng 1 hội sở chính đang hiệu lực
CREATE UNIQUE INDEX UX_EBA_Primary ON tbl_EmployeeBranchAssignments(EmployeeCode) WHERE IsPrimary = 1 AND ToDate IS NULL;

CREATE TABLE tbl_BranchLocations (
    LocationID   INT IDENTITY(1,1) PRIMARY KEY,
    BranchCode   VARCHAR(20)   NOT NULL,
    LocationName NVARCHAR(100) NOT NULL,
    Latitude     DECIMAL(10,7) NOT NULL,
    Longitude    DECIMAL(10,7) NOT NULL,
    RadiusMeters INT           NOT NULL DEFAULT 50,   -- hiệu chỉnh khi pilot
    IsActive     BIT           NOT NULL DEFAULT 1,
    CONSTRAINT CK_Loc_Radius CHECK (RadiusMeters BETWEEN 20 AND 500),
    CONSTRAINT FK_Loc_Branch FOREIGN KEY (BranchCode) REFERENCES tbl_Branches(BranchCode)
);

CREATE TABLE tbl_BranchNetworks (                  -- Public IP / dải IP của hội sở (IPv4 hoặc tiền tố IPv6)
    NetworkID       INT IDENTITY(1,1) PRIMARY KEY,
    BranchCode      VARCHAR(20)   NOT NULL,
    Cidr            VARCHAR(50)   NOT NULL,        -- '203.0.113.25/32' | '2001:db8:1234::/64'
    Description     NVARCHAR(100) NULL,
    IsActive        BIT           NOT NULL DEFAULT 1,
    ValidFrom       DATE          NOT NULL,
    ValidTo         DATE          NULL,
    CreatedByUserID INT           NULL,
    CreatedAtUtc    DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Net_Branch_Cidr UNIQUE (BranchCode, Cidr),
    CONSTRAINT FK_Net_Branch FOREIGN KEY (BranchCode) REFERENCES tbl_Branches(BranchCode)
);

-- 4. LƯỢT BẤM (BẤT BIẾN — KHÔNG UPDATE NGOẠI TRỪ CỘT DUYỆT)
CREATE TABLE tbl_WebAttendanceLogs (
    WebLogID           BIGINT IDENTITY(1,1) PRIMARY KEY,
    ClientRequestId    UNIQUEIDENTIFIER NOT NULL UNIQUE,   -- chống ghi trùng khi mạng chập chờn
    EmployeeCode       VARCHAR(20)   NOT NULL,
    DeviceBindingID    INT           NOT NULL,
    Channel            VARCHAR(10)   NOT NULL,             -- 'MOBILE_PWA' | 'PC_WEB'
    CheckTimeUtc       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),   -- giờ SERVER
    WorkDate           DATE          NOT NULL,             -- ngày công theo GMT+7
    DetectedBranchCode VARCHAR(20)   NULL,
    CheckinPolicy      VARCHAR(25)   NOT NULL,
    Latitude           DECIMAL(10,7) NULL,
    Longitude          DECIMAL(10,7) NULL,
    GpsAccuracyMeters  DECIMAL(7,2)  NULL,
    DistanceMeters     DECIMAL(9,2)  NULL,                 -- server tính
    ClientPublicIP     VARCHAR(45)   NOT NULL,             -- server đọc
    IpOk               BIT           NULL,                 -- NULL: chính sách không dùng IP
    GpsState           VARCHAR(8)    NOT NULL,             -- OK | OUT | LOW_ACC | MISSING | NA
    VerificationStatus VARCHAR(15)   NOT NULL,             -- VALID | REVIEW | OUT_OF_OFFICE
    ReasonCode         VARCHAR(30)   NULL,                 -- GPS_DRIFT | OFF_NETWORK | OUTSIDE | WRONG_BRANCH
    ReviewState        VARCHAR(10)   NOT NULL DEFAULT 'NONE', -- NONE | PENDING | ACCEPTED | REJECTED
    ReviewedByUserID   INT           NULL,
    ReviewedAtUtc      DATETIME2(0)  NULL,
    ReviewNote         NVARCHAR(255) NULL,
    UserAgent          NVARCHAR(300) NULL,
    CONSTRAINT CK_Log_Channel CHECK (Channel IN ('MOBILE_PWA','PC_WEB')),
    CONSTRAINT CK_Log_Gps     CHECK (GpsState IN ('OK','OUT','LOW_ACC','MISSING','NA')),
    CONSTRAINT CK_Log_Verif   CHECK (VerificationStatus IN ('VALID','REVIEW','OUT_OF_OFFICE')),
    CONSTRAINT CK_Log_Review  CHECK (ReviewState IN ('NONE','PENDING','ACCEPTED','REJECTED')),
    CONSTRAINT FK_Log_Emp FOREIGN KEY (EmployeeCode)    REFERENCES tbl_Employees(EmployeeCode),
    CONSTRAINT FK_Log_Dev FOREIGN KEY (DeviceBindingID) REFERENCES tbl_EmployeeDevices(DeviceBindingID)
);
CREATE INDEX IX_Log_Emp_Date    ON tbl_WebAttendanceLogs(EmployeeCode, WorkDate, CheckTimeUtc);
CREATE INDEX IX_Log_Review      ON tbl_WebAttendanceLogs(ReviewState, WorkDate);
-- Lượt bấm "được dùng" = VerificationStatus='VALID' hoặc ReviewState='ACCEPTED'

-- 5. DỮ LIỆU NGÀY CHO ENGINE PHASE 1 (kết quả gộp, dựng lại được)
CREATE TABLE tbl_DailyPunchSummary (
    EmployeeCode     VARCHAR(20)  NOT NULL,
    WorkDate         DATE         NOT NULL,
    InTime           TIME(0)      NULL,
    OutTime          TIME(0)      NULL,
    Source           VARCHAR(12)  NOT NULL DEFAULT 'APP',   -- APP | REGULARIZED
    InLogID          BIGINT       NULL,
    OutLogID         BIGINT       NULL,
    UsedPunchCount   INT          NOT NULL DEFAULT 0,
    HasPendingReview BIT          NOT NULL DEFAULT 0,
    BuiltAtUtc       DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_DailyPunch PRIMARY KEY (EmployeeCode, WorkDate),
    CONSTRAINT FK_DP_Emp FOREIGN KEY (EmployeeCode) REFERENCES tbl_Employees(EmployeeCode)
);

CREATE TABLE tbl_TimeAdjustments (                -- giờ thực tế đã được duyệt từ giải trình
    AdjustmentID    INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeCode    VARCHAR(20)  NOT NULL,
    WorkDate        DATE         NOT NULL,
    AdjInTime       TIME(0)      NULL,
    AdjOutTime      TIME(0)      NULL,
    SourceRequestID INT          NOT NULL,
    IsActive        BIT          NOT NULL DEFAULT 1,
    CreatedAtUtc    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Adj_Emp FOREIGN KEY (EmployeeCode) REFERENCES tbl_Employees(EmployeeCode)
);
CREATE UNIQUE INDEX UX_Adj_Active ON tbl_TimeAdjustments(EmployeeCode, WorkDate) WHERE IsActive = 1;

-- 6. ĐƠN TỪ
CREATE TABLE tbl_EmployeeRequests (
    RequestID        INT IDENTITY(1,1) PRIMARY KEY,
    RequestType      VARCHAR(15)   NOT NULL,        -- 'LEAVE' | 'REGULARIZATION'
    EmployeeCode     VARCHAR(20)   NOT NULL,
    LeaveCode        VARCHAR(10)   NULL,            -- P, P/2, P/2K, BL, BL/2, NL, K ...
    FromDate         DATE          NOT NULL,
    ToDate           DATE          NOT NULL,
    DayPart          VARCHAR(10)   NULL,            -- FULL | MORNING | AFTERNOON
    DaysRequested    DECIMAL(4,1)  NOT NULL,        -- số ngày tính sau khi loại ngày nghỉ tuần/Lễ
    ReasonCode       VARCHAR(30)   NULL,
    Reason           NVARCHAR(500) NOT NULL,
    ActualTimeIn     TIME(0)       NULL,            -- giải trình
    ActualTimeOut    TIME(0)       NULL,
    Status           VARCHAR(16)   NOT NULL DEFAULT 'PENDING_HR',
    HRUserID         INT           NULL,
    HRDecidedAtUtc   DATETIME2(0)  NULL,
    HRNote           NVARCHAR(255) NULL,
    CancelledAtUtc   DATETIME2(0)  NULL,
    CreatedAtUtc     DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc     DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Req_Type   CHECK (RequestType IN ('LEAVE','REGULARIZATION')),
    CONSTRAINT CK_Req_Status CHECK (Status IN ('PENDING_HR','APPROVED','REJECTED','CANCELLED')),
    CONSTRAINT CK_Req_Dates  CHECK (FromDate <= ToDate),
    CONSTRAINT CK_Req_Leave  CHECK (RequestType <> 'LEAVE' OR LeaveCode IS NOT NULL),
    CONSTRAINT CK_Req_Regul  CHECK (RequestType <> 'REGULARIZATION'
                                    OR (FromDate = ToDate AND (ActualTimeIn IS NOT NULL OR ActualTimeOut IS NOT NULL))),
    CONSTRAINT FK_Req_Emp FOREIGN KEY (EmployeeCode) REFERENCES tbl_Employees(EmployeeCode)
);
CREATE INDEX IX_Req_Status ON tbl_EmployeeRequests(Status, FromDate);
CREATE INDEX IX_Req_Emp    ON tbl_EmployeeRequests(EmployeeCode, FromDate, ToDate);
-- Chống trùng ngày giữa các đơn của cùng nhân viên: kiểm tra trong giao dịch có khóa (mục 5.5)

CREATE TABLE tbl_RequestAttachments (
    AttachmentID     INT IDENTITY(1,1) PRIMARY KEY,
    RequestID        INT          NOT NULL,
    OriginalFileName NVARCHAR(200) NOT NULL,
    StoredFileName   VARCHAR(100) NOT NULL,         -- tên ngẫu nhiên, không dùng tên gốc
    MimeType         VARCHAR(50)  NOT NULL,
    FileSizeBytes    INT          NOT NULL,
    Sha256           CHAR(64)     NOT NULL,
    UploadedAtUtc    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Att_Req FOREIGN KEY (RequestID) REFERENCES tbl_EmployeeRequests(RequestID)
);

-- 7. CÔNG BỐ BẢNG CÔNG (CÓ PHIÊN BẢN, BẤT BIẾN) & KHIẾU NẠI
CREATE TABLE tbl_TimesheetPublications (
    PublicationID    INT IDENTITY(1,1) PRIMARY KEY,
    PeriodID         INT          NOT NULL,         -- kỳ công Phase 1
    BranchCode       VARCHAR(20)  NOT NULL,
    VersionNo        INT          NOT NULL DEFAULT 1,
    IsCurrent        BIT          NOT NULL DEFAULT 1,
    PublishedByUserID INT         NOT NULL,
    PublishedAtUtc   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    RetractedAtUtc   DATETIME2(0) NULL,
    Note             NVARCHAR(255) NULL,
    CONSTRAINT UQ_Pub_Version UNIQUE (PeriodID, BranchCode, VersionNo),
    CONSTRAINT FK_Pub_Period FOREIGN KEY (PeriodID)   REFERENCES tbl_Periods(PeriodID),
    CONSTRAINT FK_Pub_Branch FOREIGN KEY (BranchCode) REFERENCES tbl_Branches(BranchCode)
);
CREATE UNIQUE INDEX UX_Pub_Current ON tbl_TimesheetPublications(PeriodID, BranchCode) WHERE IsCurrent = 1;

CREATE TABLE tbl_TimesheetPublishedLines (        -- snapshot từng nhân viên tại thời điểm công bố
    LineID            INT IDENTITY(1,1) PRIMARY KEY,
    PublicationID     INT          NOT NULL,
    EmployeeCode      VARCHAR(20)  NOT NULL,
    DailyCodes        VARCHAR(400) NOT NULL,        -- mã công từng ngày, ngăn cách bằng '|'
    WorkDays          DECIMAL(5,1) NOT NULL,        -- cột J
    HolidayDays       DECIMAL(5,1) NOT NULL,        -- cột I
    AnnualLeaveDays   DECIMAL(5,1) NOT NULL,        -- cột K
    PaidLeaveDays     DECIMAL(5,1) NOT NULL,        -- cột L
    UnpaidLeaveDays   DECIMAL(5,1) NOT NULL,        -- cột M
    PaidDays          DECIMAL(5,1) NOT NULL,        -- cột N
    LateEarlyMinutes  INT          NOT NULL,
    LeaveBalanceAfter DECIMAL(5,1) NULL,
    Note              NVARCHAR(500) NULL,
    CONSTRAINT UQ_PubLine UNIQUE (PublicationID, EmployeeCode),
    CONSTRAINT FK_PubLine_Pub FOREIGN KEY (PublicationID) REFERENCES tbl_TimesheetPublications(PublicationID),
    CONSTRAINT FK_PubLine_Emp FOREIGN KEY (EmployeeCode)  REFERENCES tbl_Employees(EmployeeCode)
);

CREATE TABLE tbl_TimesheetDisputes (
    DisputeID     INT IDENTITY(1,1) PRIMARY KEY,
    PublicationID INT           NOT NULL,
    EmployeeCode  VARCHAR(20)   NOT NULL,
    WorkDate      DATE          NULL,
    Content       NVARCHAR(1000) NOT NULL,
    Status        VARCHAR(10)   NOT NULL DEFAULT 'OPEN',   -- OPEN | ACCEPTED | REJECTED
    HRUserID      INT           NULL,
    HRResponse    NVARCHAR(500) NULL,
    CreatedAtUtc  DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
    ResolvedAtUtc DATETIME2(0)  NULL,
    CONSTRAINT CK_Disp_Status CHECK (Status IN ('OPEN','ACCEPTED','REJECTED')),
    CONSTRAINT FK_Disp_Pub FOREIGN KEY (PublicationID) REFERENCES tbl_TimesheetPublications(PublicationID),
    CONSTRAINT FK_Disp_Emp FOREIGN KEY (EmployeeCode)  REFERENCES tbl_Employees(EmployeeCode)
);

-- 8. THÔNG BÁO, CẢNH BÁO & NHẬT KÝ BẢO MẬT
CREATE TABLE tbl_Notifications (
    NotificationID BIGINT IDENTITY(1,1) PRIMARY KEY,
    UserID         INT           NOT NULL,
    Title          NVARCHAR(120) NOT NULL,
    Body           NVARCHAR(300) NULL,
    LinkType       VARCHAR(20)   NULL,
    LinkID         INT           NULL,
    IsRead         BIT           NOT NULL DEFAULT 0,
    CreatedAtUtc   DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Noti_User FOREIGN KEY (UserID) REFERENCES tbl_UserAccounts(UserID)
);
CREATE INDEX IX_Noti_User ON tbl_Notifications(UserID, IsRead, CreatedAtUtc);

CREATE TABLE tbl_HrAlerts (
    AlertID       INT IDENTITY(1,1) PRIMARY KEY,
    AlertType     VARCHAR(25)   NOT NULL,           -- IP_DRIFT | REPEAT_FLAG | DEVICE_ANOMALY
    BranchCode    VARCHAR(20)   NULL,
    EmployeeCode  VARCHAR(20)   NULL,
    Detail        NVARCHAR(500) NOT NULL,
    Status        VARCHAR(10)   NOT NULL DEFAULT 'OPEN',   -- OPEN | ACKED
    CreatedAtUtc  DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
    AckedByUserID INT           NULL,
    AckedAtUtc    DATETIME2(0)  NULL
);

CREATE TABLE tbl_SecurityAuditLog (
    LogID        BIGINT IDENTITY(1,1) PRIMARY KEY,
    UserID       INT           NULL,
    EventType    VARCHAR(40)   NOT NULL,            -- LOGIN_FAIL, DEVICE_REJECTED, ROLE_CHANGE, UNLOCK_PERIOD ...
    Detail       NVARCHAR(500) NULL,
    PublicIP     VARCHAR(45)   NULL,
    UserAgent    NVARCHAR(300) NULL,
    CreatedAtUtc DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Audit_Time ON tbl_SecurityAuditLog(CreatedAtUtc, EventType);
```

**Ghi chú thiết kế:**
- Số phép khả dụng = số dư sổ cái Phase 1 − tổng `DaysRequested` của đơn nghỉ trừ phép đang `PENDING_*` (không cần bảng giữ chỗ riêng; tính trong giao dịch có khóa).
- Lượt bấm không bị xoá; hết thời hạn lưu (`LOCATION_RETENTION_MONTHS`) thì job xoá tọa độ và User-Agent, giữ lại kết quả xác minh.
- `tbl_DailyPunchSummary` có thể dựng lại hoàn toàn từ lượt bấm + điều chỉnh, nên không phải nguồn sự thật gốc.

---

## 9. AN NINH, QUYỀN RIÊNG TƯ & PHI CHỨC NĂNG

### 9.1. Xác thực và phiên
- Access token 15 phút, refresh token xoay vòng (mỗi lần dùng cấp token mới, token cũ bị vô hiệu); thời hạn refresh: 30 ngày (mobile), 12 giờ (PC). Mỗi lệnh chấm công/đơn từ **kiểm tra lại thiết bị** (không chỉ lúc đăng nhập).
- Thu hồi thiết bị, khóa tài khoản hay đổi mật khẩu → thu hồi toàn bộ refresh token liên quan.
- Giới hạn tần suất theo IP và theo tài khoản cho đăng nhập và API chấm công; mọi API ghi dùng `X-Request-Id` (GUID) chống ghi trùng; cookie `HttpOnly`, `Secure`, `SameSite=Strict`; chống CSRF cho các lệnh dùng cookie.
- HCNS/Admin có thể bật `ADMIN_DEVICE_REQUIRED` (mặc định tắt) để buộc dùng thiết bị đã duyệt.

### 9.2. Dữ liệu
- Mọi truy vấn lọc theo hội sở/nhân viên mà người dùng được phép: nhân viên chỉ thấy dữ liệu của mình; HCNS chỉ thấy và xử lý hội sở được gán (`tbl_HrBranchScopes`); Admin thấy tất cả. Việc duyệt liên quan chính HCNS chỉ Admin thực hiện được.
- Nhật ký bảo mật chỉ thêm, không sửa; thao tác quan trọng (duyệt/từ chối, công bố/thu hồi, mở chốt, đổi vai trò, thu hồi thiết bị, **thêm/sửa/ngưng Public IP và vị trí hội sở**) đều ghi nhật ký.
- Sao lưu: toàn bộ CSDL mỗi đêm + sao lưu nhật ký giao dịch theo giờ; thư mục ảnh sao lưu cùng lịch; thử khôi phục định kỳ mỗi quý.

### 9.3. Tải ảnh minh chứng
- Chấp nhận JPEG/PNG/HEIC, ≤ 5 MB/ảnh, ≤ 5 ảnh/đơn; kiểm tra phần đầu tệp (không tin phần mở rộng), nén/đổi sang JPEG, **xoá EXIF (có toạ độ)**, đổi tên ngẫu nhiên.
- Lưu **ngoài thư mục web** (ví dụ `D:\\TimekeepingData\\Evidence\\`), không phục vụ trực tiếp bởi IIS; tải xuống qua API kiểm tra quyền (chủ đơn, HCNS đúng hội sở, Admin).
- Ảnh gắn với đơn bằng băm SHA-256; xoá theo `EVIDENCE_RETENTION_MONTHS`.

### 9.4. Quyền riêng tư
Vị trí, IP, ảnh giấy tờ là dữ liệu cá nhân. Hệ thống: hiển thị thông báo và ghi nhận đồng ý ở lần đăng nhập đầu; **chỉ lấy vị trí đúng lúc bấm chấm công**, không theo dõi nền; lưu tối thiểu; có thời hạn lưu; phân quyền xem ảnh/vị trí. Cần đối chiếu với **Nghị định 13/2023/NĐ-CP** và quy định bảo vệ dữ liệu cá nhân hiện hành, và thống nhất nội dung thông báo với bộ phận pháp lý (Q-P2-9). Tài liệu này không phải ý kiến pháp lý.

### 9.5. Hiệu năng và độ tin cậy
- Mục tiêu: 300 người dùng đồng thời, đỉnh 08:00–08:45; xử lý server một lượt bấm p95 < 1 giây (không tính thời gian GPS); dashboard tải < 3 giây; tính nháp cả kỳ cho 200 nhân viên < 2 phút.
- Giám sát: log ứng dụng có `RequestId`, cảnh báo khi tỷ lệ lỗi tăng; kiểm tra sức khoẻ `/health`.

---

## 10. ĐẶC TẢ REST API

**Quy ước:** tiền tố `/api/v1`, JSON UTF-8; `Authorization: Bearer <access>`; thiết bị gửi `X-Device-Secret`; mọi API ghi gửi `X-Request-Id`; lỗi trả `{ "code": "…", "message": "<tiếng Việt, nói rõ cách xử lý>" }`; danh sách có `page`, `pageSize`. **Server không nhận Public IP, giờ hay kết quả xác minh từ client.**

### 10.1. Xác thực & thiết bị
| Phương thức & đường dẫn | Quyền | Đầu vào chính | Xử lý |
|---|---|---|---|
| `POST /auth/login` | Công khai | `username, password` (+ `X-Device-Secret` nếu có) | Kiểm tra khóa tài khoản; trả access/refresh; nếu thiết bị chưa duyệt → chế độ chỉ xem hồ sơ |
| `POST /auth/refresh` | Có refresh | — | Xoay vòng token, kiểm tra thiết bị còn hiệu lực |
| `POST /auth/logout` | Đăng nhập | — | Thu hồi refresh token |
| `POST /auth/change-password` | Đăng nhập | `oldPassword, newPassword` | Kiểm tra độ dài, thu hồi token khác |
| `POST /auth/consent` | Đăng nhập | `version` | Ghi đồng ý xử lý dữ liệu cá nhân |
| `POST /devices/register` | Đăng nhập | `deviceType, deviceName, os, browser, fingerprintHash` | Tạo yêu cầu `PENDING`, trả mã bí mật (một lần) |
| `GET /devices/mine` | Đăng nhập | — | Hai khe và trạng thái |
| `GET /hr/devices?status=&branch=` | HR | — | Danh sách thiết bị chờ/đã duyệt kèm Public IP lúc đăng ký |
| `POST /hr/devices/{id}/decision` | HR | `action(APPROVE/REJECT), note` | Duyệt/từ chối |
| `POST /hr/devices/{id}/revoke` | HR | `note` | Reset thiết bị, thu hồi token |

### 10.2. Chấm công
| Phương thức & đường dẫn | Quyền | Đầu vào chính | Xử lý |
|---|---|---|---|
| `GET /attendance/state` | Nhân viên | — | Lượt hợp lệ hôm nay, chế độ nút (Check-in/Check-out), hội sở, chính sách áp dụng |
| `POST /attendance/punch` | Nhân viên (thiết bị đã duyệt) | `lat?, lng?, accuracy?, gpsError?` | Thực hiện 4.4; trả `status, reasonCode, message, time` |
| `GET /attendance/history?from=&to=` | Nhân viên | — | Các lượt bấm theo ngày (không kèm mã công/phút phạt trước công bố) |
| `GET /attendance/issues?periodId=` | Nhân viên | — | "Ngày cần giải trình" |
| `GET /hr/punches?date=&branch=&status=&reviewState=` | HR | — | Danh sách lượt bấm kèm vị trí, IP, thiết bị |
| `POST /hr/punches/review` | HR | `ids[], action(ACCEPT/REJECT), note` | Duyệt hàng loạt; kiểm tra kỳ chưa chốt |

### 10.3. Hồ sơ, phép, đơn từ
| Phương thức & đường dẫn | Quyền | Đầu vào chính | Xử lý |
|---|---|---|---|
| `GET /profile/me` | Nhân viên | — | Hồ sơ, hội sở chính/phụ, ca hôm nay |
| `GET /leave/balance` | Nhân viên | — | Thẻ quỹ phép (kèm phần giữ chỗ) |
| `POST /requests` | Nhân viên | multipart: `requestType, leaveCode, fromDate, toDate, dayPart, reasonCode, reason, actualIn, actualOut, files[]` | Kiểm tra 5.5/5.6, giữ chỗ phép trong giao dịch, tạo đơn |
| `GET /requests/mine?status=` | Nhân viên | — | Đơn của tôi |
| `GET /requests/{id}` | Chủ đơn/HR/Admin | — | Chi tiết + tệp |
| `POST /requests/{id}/cancel` | Chủ đơn | `reason` | Hủy đơn chưa duyệt; hoàn giữ chỗ |
| `GET /hr/requests?status=&branch=&month=` | HR | — | Hộp thư duyệt kèm ảnh |
| `POST /hr/requests/{id}/decision` | HR | `action(APPROVE/REJECT), note` | Duyệt: tạo ngoại lệ/điều chỉnh, trừ sổ cái phép, thông báo; từ chối: hoàn giữ chỗ |
| `GET /attachments/{id}` | Có quyền xem đơn | — | Trả ảnh sau kiểm tra quyền |

### 10.4. Bảng công
| Phương thức & đường dẫn | Quyền | Đầu vào chính | Xử lý |
|---|---|---|---|
| `GET /timesheet/mine?periodId=` | Nhân viên | — | Chỉ trả dữ liệu từ phiên bản **đang công bố**; chưa công bố → thông báo "đang được HCNS đối soát" |
| `POST /timesheet/disputes` | Nhân viên | `publicationId, workDate?, content` | Trong `DISPUTE_WINDOW_DAYS` |
| `POST /hr/timesheet/publish` | HR | `periodId, branchCode, note` | Kiểm tra kỳ đã chốt, chụp snapshot, tăng phiên bản |
| `POST /hr/timesheet/retract` | HR | `publicationId, note` | Thu hồi công bố |
| `GET /hr/timesheet/disputes` · `POST /hr/timesheet/disputes/{id}/resolve` | HR | `action, response` | Xử lý khiếu nại |

### 10.5. Quản trị & khác
| Phương thức & đường dẫn | Quyền | Mô tả |
|---|---|---|
| `GET /hr/dashboard/summary` | HR | Số liệu hôm nay, hàng đợi |
| `GET /hr/alerts` · `POST /hr/alerts/{id}/ack` | HR | Cảnh báo IP đổi, lặp lại, thiết bị |
| CRUD `/hr/branches/{code}/locations`, `/hr/branches/{code}/networks` (Admin: mọi hội sở) | HR (hội sở mình)/Admin | Geofence, Public IP/CIDR; có thao tác "Dùng IP hiện tại của tôi" (server đọc IP của người đang gọi) và "Thêm IP này" từ cảnh báo; kiểm tra độ rộng dải IP; ghi nhật ký và báo Admin |
| CRUD `/hr/assignments` | HR (hội sở chính của nhân viên)/Admin | Phân công hội sở phụ cho nhân viên |
| CRUD `/hr/users`, `POST /hr/users/{id}/reset-password` | HR (nhân viên hội sở mình) | Tạo hàng loạt, cấp mật khẩu tạm, khóa/mở khóa |
| CRUD `/admin/users` (gồm tài khoản HCNS, vai trò, phạm vi hội sở), `POST /admin/users/{id}/reset-password` | Admin | Quản lý tài khoản HCNS, vai trò, `tbl_HrBranchScopes` |
| `GET /notifications` · `POST /notifications/read` | Đăng nhập | Thông báo trong ứng dụng |
| `GET /admin/audit` | Admin | Nhật ký bảo mật |
| `GET /health` | Nội bộ | Kiểm tra sức khoẻ |

---

## 11. LỘ TRÌNH TRIỂN KHAI (3 ĐỢT PHÁT HÀNH, TÍNH THEO TUẦN)

Không đặt ngày cố định cho đến khi **cổng vào** (mục 1.4) đạt. Mốc thời gian dưới đây là tuần tương đối kể từ khi bắt đầu.

### Tuần 0 — Chuẩn bị
- [ ] Chốt các câu hỏi còn mở ở mục 14.2 (Q-P2-4 trở đi); Q-P2-1, Q-P2-2, Q-P2-3 đã chốt ngày 2026-10-11.
- [ ] Áp dụng các biện pháp bù đắp hạ tầng ở mục 2.1 trước khi mở ra Internet.
- [ ] Dựng môi trường, **cấu hình HTTPS ngay**, quy trình build/triển khai, sao lưu.
- [ ] HCNS từng hội sở khai báo Public IP và vị trí (4.8); đo thực tế độ chính xác GPS trong nhà ở vài vị trí để chốt bán kính.

### Đợt A — Lõi chấm công (tuần 1–4)
- [ ] Chạy script DDL mục 8; dữ liệu mặc định (vai trò, tham số mới).
- [ ] Đăng nhập, khoá tài khoản, đổi mật khẩu, đồng ý quyền riêng tư; refresh token.
- [ ] Đăng ký/duyệt/thu hồi thiết bị (mã bí mật do server cấp); chặn cài PWA sai chỗ trên iPhone.
- [ ] Quy trình 4.4: Haversine, so khớp CIDR (IPv4/IPv6), `CF-Connecting-IP`, bảng quyết định, chống trùng.
- [ ] PWA: Manifest, Service Worker, font Nunito Sans nhúng, 4 tab, nút Check-in/Check-out; PC portal.
- [ ] HCNS: duyệt thiết bị, hàng đợi duyệt cờ (bản đồ, hàng loạt), cảnh báo IP đổi.
- [ ] Gộp lượt bấm → `tbl_DailyPunchSummary`, nối vào engine Phase 1, job nháp hằng đêm.
- [ ] Tạo tài khoản hàng loạt, kế hoạch duyệt thiết bị theo đợt.
- **Pilot A** (từ cuối tuần 4): 15 nhân viên, vận hành thật song song cách chấm công hiện tại.

### Đợt B — Đơn từ (tuần 5–7)
- [ ] Đơn nghỉ: nhiều ngày/buổi, giữ chỗ phép trong giao dịch khoá, đối chiếu sổ cái Phase 1 (cần Module 5).
- [ ] Giải trình + điều chỉnh giờ → engine tính lại.
- [ ] Tải ảnh an toàn (mục 9.3), chuỗi duyệt cấu hình được, hủy đơn.
- [ ] Hộp thư HCNS, thông báo trong ứng dụng.
- **Pilot B:** mở rộng số người; ít nhất một kỳ 26→25 chạy trọn vòng.

### Đợt C — Công bố & hoàn thiện (tuần 8–9)
- [ ] Công bố có phiên bản, snapshot, thu hồi, khiếu nại.
- [ ] Kiểm thử bảo mật (đăng nhập, upload, phân quyền, giả mạo tham số), kiểm thử tải đỉnh sáng.
- [ ] Tài liệu hướng dẫn nhân viên và HCNS; buổi đào tạo; kế hoạch quay lại cách cũ.

### Go-live (tuần 10–12, sau khi đạt tiêu chí)
**Tiêu chí Go/No-Go:** ≥ 90% lượt bấm của pilot tự động `VALID`; thời gian HCNS duyệt cờ trung bình < 1 ngày làm việc; không có lỗi nghiêm trọng mở; kỳ pilot chốt công khớp bảng công đối chiếu, mọi chênh lệch giải thích được; sao lưu và khôi phục đã thử; HCNS hoàn thành đào tạo.

---

## 12. BỘ TIÊU CHÍ NGHIỆM THU (UAT)

Trạng thái ban đầu của mọi ca: **Chưa chạy**.

| Mã | Kịch bản | Hành động | Kết quả kỳ vọng |
|---|---|---|---|
| UAT-01 | Check-in chuẩn | Thiết bị đã duyệt, trong văn phòng, Wi-Fi công ty, bấm Check-in | 🟢 `VALID`, tính công tự động |
| UAT-02 | Chấm công hộ | Nhân viên B đăng nhập tài khoản A trên điện thoại của B | Từ chối: thiết bị chưa đăng ký cho tài khoản này; có nhật ký bảo mật |
| UAT-03 | Mã thiết bị đã gắn | Dùng thiết bị đã đăng ký cho A để đăng nhập tài khoản C | Từ chối: thiết bị đã đăng ký cho tài khoản khác |
| UAT-04 | Đăng ký PC | PC đăng ký, HCNS duyệt | Trước duyệt không chấm công PC; sau duyệt được |
| UAT-05 | PC tại nhà | PC đã duyệt, mở ở nhà, `OFFICE_STRICT` | Từ chối `PC_NOT_IN_OFFICE`, không ghi lượt bấm |
| UAT-06 | GPS trôi | IP đúng, GPS ngoài bán kính | 🟡 `GPS_DRIFT` |
| UAT-07 | 4G tại văn phòng | IP sai, GPS đúng | 🟡 `OFF_NETWORK` |
| UAT-08 | Giả GPS ở nhà | Bật ứng dụng giả vị trí về văn phòng, dùng mạng nhà | 🟡 `OFF_NETWORK` (chấp nhận không phân biệt với UAT-07), HCNS thấy IP lạ và lịch sử |
| UAT-09 | Ngoài văn phòng | IP sai, GPS ngoài bán kính | 🔴 `OUTSIDE`, chưa tính công, nhân viên được yêu cầu giải trình |
| UAT-10 | Từ chối quyền định vị | IP đúng, từ chối định vị | 🟡 `GPS_DRIFT`; thông báo hướng dẫn bật |
| UAT-11 | Bấm đúp | Bấm hai lần trong 5 giây / gửi lại cùng `X-Request-Id` | Chỉ một lượt được ghi |
| UAT-12 | Bấm nhầm Check-out | Bấm Check-out sau Check-in 5 phút | Lượt không đủ `MIN_WORK_SPAN_MIN` nên không thành giờ Ra |
| UAT-13 | IP văn phòng đổi | 6 nhân viên có GPS đúng, IP mới giống nhau, trong 30 phút | Cảnh báo cho HCNS, có nút thêm IP |
| UAT-14 | Hội sở phụ | Giáo viên được phân công hội sở phụ bấm tại đó | Nhận diện đúng hội sở phụ, `VALID` |
| UAT-15 | Sai hội sở | Nhân viên đến hội sở không được phân công | 🟡 `WRONG_BRANCH` |
| UAT-16 | Remote | Khối `LOCATION_NOT_REQUIRED` bấm ở nhà | `VALID`, vẫn ghi vị trí/IP |
| UAT-17 | iPhone cài PWA | Đăng ký thiết bị trong tab Safari | Bị chặn, hướng dẫn cài ra Màn hình chính |
| UAT-18 | Mất mạng | Bấm khi không có mạng | Nút bị khóa, không có lượt bấm offline |
| UAT-19 | Reset thiết bị | HCNS thu hồi điện thoại cũ, đăng ký máy mới | Máy cũ bị chặn ngay (token thu hồi); máy mới chờ duyệt |
| UAT-20 | Khóa tài khoản | Nhập sai mật khẩu 5 lần | Khóa 15 phút, nhật ký ghi sự kiện |
| UAT-21 | Đơn thiếu ảnh | Nộp đơn khi chính sách bắt buộc ảnh | Không gửi được, nêu lý do |
| UAT-22 | Ảnh không hợp lệ | Tải tệp không phải ảnh / > 5 MB | Bị từ chối, thông báo rõ |
| UAT-23 | Vượt quỹ phép | Còn 1 ngày, xin 2 ngày | Cảnh báo, đề xuất `P/2K` hoặc nghỉ không lương |
| UAT-24 | Hai đơn cùng lúc | Gửi 2 đơn cùng lúc, tổng vượt số dư | Chỉ một đơn được giữ chỗ |
| UAT-25 | Đơn trùng ngày | Xin nghỉ ngày đã có đơn | Từ chối |
| UAT-26 | Đơn vào ngày Lễ | Xin nghỉ trùng ngày Lễ | Ngày Lễ không tính vào số ngày xin |
| UAT-27 | Hủy đơn | Hủy đơn đang chờ | Hoàn giữ chỗ phép |
| UAT-28 | HCNS duyệt đơn nghỉ | Duyệt đơn `P` 2 ngày | Tạo 2 ngoại lệ, trừ sổ cái, nhân viên được thông báo; engine ra `P` |
| UAT-29 | Giải trình được duyệt | Duyệt giải trình giờ thực tế 08:10–17:15 | Ngày được tính lại theo giờ thực tế (không mặc định `1`); lượt bấm gốc còn nguyên |
| UAT-30 | Đơn kỳ đã chốt | Duyệt đơn thuộc kỳ đã chốt | Bị chặn, hướng dẫn nhờ Admin mở chốt |
| UAT-31 | Xem bảng công trước công bố | Nhân viên mở báo cáo | Thấy lịch sử lượt bấm + "ngày cần giải trình"; không thấy mã công/tổng; có thông báo đang đối soát |
| UAT-32 | Công bố | HCNS công bố khi kỳ đã chốt | Nhân viên thấy đủ các cột; số liệu khớp bản snapshot |
| UAT-33 | Công bố khi chưa chốt | HCNS công bố kỳ chưa chốt | Bị chặn |
| UAT-34 | Khiếu nại | Gửi khiếu nại trong hạn → HCNS chấp nhận → mở chốt → công bố bản 2 | Bản 1 thành "đã thay thế"; nhân viên thấy bản 2 |
| UAT-35 | Phân quyền | Nhân viên gọi API của HCNS / xem đơn người khác | Từ chối (403) |
| UAT-36 | Đường dẫn ảnh | Truy cập ảnh bằng đường dẫn đoán trước | Không truy cập được nếu không có quyền |
| UAT-37 | Múi giờ | Bấm lúc 00:05 GMT+7 | Ngày công đúng ngày hiện tại theo GMT+7 |
| UAT-38 | Giao diện | Quét toàn bộ mã giao diện | Chỉ một font Nunito Sans, không emoji làm biểu tượng, không logo mặc định |
| UAT-39 | Tải đỉnh | 300 người dùng bấm trong 45 phút sáng | Đạt mục tiêu 9.5 |
| UAT-40 | Sao lưu | Khôi phục bản sao lưu lên môi trường thử | Dữ liệu và ảnh khớp |

---

## 13. RỦI RO

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Hạ tầng hết hỗ trợ mở ra Internet (**chủ dự án đã chấp nhận giữ nguyên**) | Cao | Bộ biện pháp bù đắp bắt buộc ở mục 2.1; ghi nhận chấp nhận rủi ro bằng văn bản |
| HCNS giữ chốt chặn bảo mật (tự khai báo IP/vị trí) và là điểm đơn của hội sở | Trung bình | Nhật ký mọi thay đổi + thông báo Admin; giới hạn độ rộng dải IP; HCNS không tự duyệt cho mình; Admin xử lý khi HCNS vắng |
| Văn phòng không có IP cố định hoặc IP đổi | Cao | HCNS cập nhật IP qua cảnh báo; hội sở chưa có IP tạm chạy `OFFICE_GPS_ONLY` kèm cảnh báo; nên xin IP tĩnh |
| GPS trong nhà kém → nhiều cờ vàng | Trung bình | Đo khi chuẩn bị; điều chỉnh bán kính/tín dụng sai số; IP làm chính; duyệt hàng loạt |
| Mất mã bí mật thiết bị (xoá dữ liệu, gỡ PWA) → HCNS quá tải reset | Trung bình | Cảnh báo khi đăng ký; quy trình reset nhanh; cân nhắc WebAuthn |
| Khối lượng duyệt thiết bị ban đầu | Trung bình | Duyệt theo đợt/hội sở, duyệt hàng loạt trong pilot |
| Giả vị trí / mượn điện thoại | Trung bình | IP phía server, cảnh báo lặp lại, tuỳ chọn WebAuthn; chấp nhận giới hạn (4.7) |
| Phase 1 chưa chốt luật (Flexitime, phạt, lịch) | Cao | Cổng vào Phase 2 (mục 1.4) |
| Minh chứng ảnh bắt buộc gây rườm rà, ảnh dễ làm giả | Trung bình | Chính sách theo loại đơn (Q-P2-4), chuỗi duyệt 2 bước tuỳ chọn |
| Quy định dữ liệu cá nhân | Trung bình | Đồng ý rõ ràng, tối thiểu hoá, thời hạn lưu, đối chiếu pháp lý (Q-P2-9) |

---

## 14. ĐỒNG BỘ PHASE 1 & ĐIỂM CẦN CHỐT

### 14.1. Cập nhật cần làm trong kế hoạch Phase 1
1. Cho phép **hội sở chính + hội sở phụ** (sửa quy tắc "một nhân viên một hội sở", thực thể Nhân viên).
2. Thêm cột `Nguồn dữ liệu chấm công` (APP/FILE) cho nhân viên và cột `Nguồn` (FILE/APP/REGULARIZED) cho dữ liệu quẹt thô.
3. Thêm các tham số ở mục 6.4 vào Bảng cấu hình tham số (Module 1.5).
4. Module 2.2.1: chọn phương án nhập ngoại lệ qua ứng dụng (Phase 2) làm nguồn chính.
5. Module 5: sổ cái phép cần có API đọc số dư và ghi dòng trừ/hoàn; bổ sung hạn dùng phép tồn năm trước (31/03) và thứ tự trừ: phép bù sự kiện → phép tồn → phép năm hiện tại; xử lý thanh toán phép khi thôi việc giữa kỳ (đã nêu trong v2.0, vẫn chờ Phase 1 Q8).
6. Module 4.1.2: thêm điều kiện chốt "không còn lượt bấm chờ duyệt cờ" (`HasPendingReview`).
7. Thêm nghiệp vụ **công bố bảng công có phiên bản** gắn với kỳ công (Module 4.1.2/6).
8. Chu kỳ chốt 26→25 (đã khớp Phase 1 Q6).
9. Ánh xạ vai trò: **HCNS hội sở = "Nhân viên chấm công" của Phase 1**, mỗi hội sở có 1 người phụ trách. Phase 1 đang để Admin quản lý hội sở; thêm quyền cho HCNS khai báo Public IP và vị trí (Locations) của hội sở mình (Phase 2, mục 4.8).
10. Phase 1 cũng nên áp quy tắc "HCNS không tự duyệt/sửa dữ liệu của chính mình" cho các thao tác chốt/mở chốt.

### 14.2. Điểm cần chốt
| # | Câu hỏi | Gợi ý / ảnh hưởng |
|---|---|---|
| Q-P2-1 | Hạ tầng | **Đã chốt 2026-10-11:** giữ nguyên Windows Server 2012 R2 + SQL Server 2008; chấp nhận rủi ro, áp dụng biện pháp bù đắp mục 2.1 |
| Q-P2-2 | Public IP và vị trí hội sở | **Đã chốt 2026-10-11:** mỗi hội sở có 1 HCNS phụ trách (tài khoản đang xử lý file chấm công) tự khai báo Public IP và vị trí; chi tiết mục 4.8. Còn lại: hội sở nào không có IP cố định thì HCNS đó cập nhật khi IP đổi hoặc dùng `OFFICE_GPS_ONLY` |
| Q-P2-3 | Chuỗi duyệt đơn | **Đã chốt 2026-10-11:** chỉ HCNS duyệt, không phân quyền nhiều cấp quản lý |
| Q-P2-4 | Ảnh minh chứng: bắt buộc mọi loại đơn hay theo loại? | Mục 5.5; ảnh chụp tin nhắn dễ giả |
| Q-P2-5 | Mã nghỉ không lương nhân viên được chọn (`N` hay `NL`) và giá trị công | Phụ thuộc Phase 1 Q12 |
| Q-P2-6 | Có làm WebAuthn (xác thực sinh trắc của máy) không? | Đợt A+; cần thử thư viện trên .NET 4.8 |
| Q-P2-7 | Thông báo ngoài ứng dụng (Zalo OA/email/push)? | Hiện chỉ trong ứng dụng |
| Q-P2-8 | Chính sách chi tiết cho Remote, part-time, thực tập sinh, giáo viên | Khối nào dùng chính sách nào; cách tính công Task (Phase 1 Q12) |
| Q-P2-9 | Thời hạn lưu tọa độ/ảnh và nội dung đồng ý dữ liệu cá nhân | Cần pháp lý xác nhận |
| Q-P2-10 | Nhân viên nào dùng `APP`, nhân viên nào dùng `FILE`; có thời gian chuyển đổi không | Mục 1.4 |
| Q-P2-11 | Cấp tài khoản hàng loạt và mật khẩu tạm lần đầu; quên mật khẩu do HCNS cấp lại có đủ không | Mục 5.1 |
| Q-P2-12 | Bán kính geofence và ngưỡng sai số cho từng hội sở | Mặc định 50 m; chốt sau đo thực tế |

---

## 15. NHẬT KÝ THAY ĐỔI

| Ngày | Nội dung |
|---|---|
| 2026-10-11 | v2.1: viết lại hoàn chỉnh thay v2.0. Bỏ LAN probe, IP nội bộ và mọi liên quan máy chấm công; chốt Public IP phía server làm chốt chặn; bảng quyết định cờ đầy đủ; token thiết bị do server cấp; chính sách check-in theo khối; đa hội sở; gộp dữ liệu vào engine Phase 1; công bố có phiên bản và khiếu nại; DDL mới; API đầy đủ; an ninh và quyền riêng tư; lộ trình 3 đợt; UAT 40 ca; danh sách cập nhật Phase 1 |
| 2026-10-11 | v2.2: cập nhật theo 3 quyết định của chủ dự án — giữ nguyên hạ tầng (kèm biện pháp bù đắp bắt buộc); mỗi hội sở 1 HCNS tự khai báo Public IP và vị trí (thêm mục 4.8, bảng `tbl_HrBranchScopes`, API `/hr/branches/...`); chỉ một cấp duyệt là HCNS (bỏ vai trò quản lý, bước duyệt quản lý, tham số chuỗi duyệt, bảng quản lý–nhân viên); thêm quy tắc HCNS không tự duyệt cho mình; đóng Q-P2-1, Q-P2-2, Q-P2-3 |
