# SỔ TAY HƯỚNG DẪN DÀNH CHO QUẢN TRỊ VIÊN HỆ THỐNG (ADMIN)
## 🛠️ QUẢN TRỊ CẤU HÌNH, TÀI KHOẢN, HỘI SỞ & BẢO MẬT HỆ THỐNG

---

## LỜI MỞ ĐẦU
Tài liệu này dành cho Quản trị viên hệ thống (Admin / IT Lead) chịu trách nhiệm thiết lập nền tảng, quản lý phân quyền, cấu hình thông số điểm chấm công và vận hành kỹ thuật cho Hệ thống Chấm công Superbrain.

Tài liệu được trình bày trực quan, loại bỏ các khái niệm lý thuyết trừu tượng, tập trung vào thao tác thực tế và các cấu hình cốt lõi nhất.

---

## MỤC LỤC
1. [Tổng quan Bảng điều khiển Quản trị viên](#1-tổng-quan-bảng-điều-khiển-quản-trị-viên)
2. [Quản lý Hội sở & Cấu hình Điểm chấm công (GPS + Wifi)](#2-quản-lý-hội-sở--cấu-hình-điểm-chấm-công-gps--wifi)
3. [Quản lý Tài khoản & Phân quyền người dùng](#3-quản-lý-tài-khoản--phân-quyền-người-dùng)
4. [Quản lý Thiết bị: Reset máy khi nhân viên đổi thiết bị](#4-quản-lý-thiết-bị-reset-máy-khi-nhân-viên-đổi-thiết-bị)
5. [Cấu hình Tham số Chấm công & Giờ làm việc](#5-cấu-hình-tham-số-chấm-công--giờ-làm-việc)
6. [Tùy biến Thương hiệu & Giao diện Nền tảng (Platform Branding)](#6-tùy-biến-thương-hiệu--giao-diện-nền-tảng-platform-branding)
7. [Theo dõi Nhật ký hoạt động & Bảo mật](#7-theo-dõi-nhật-ký-hoạt-động--bảo-mật)
8. [Các lưu ý kỹ thuật quan trọng cho Quản trị viên](#8-các-lưu-ý-kỹ-thuật-quan-trọng-cho-quản-trị-viên)

---

# 1. TỔNG QUAN BẢNG ĐIỀU KHIỂN QUẢN TRỊ VIÊN

![Bảng điều khiển Quản trị viên](docs/images/admin_01_dashboard.png)

Tài khoản Quản trị viên (`admin`) sở hữu quyền hạn cao nhất trên toàn hệ thống, có thể truy cập tất cả các phân hệ:
- **Thanh menu trên cùng**: Tích hợp nút chọn nhanh Hội sở làm việc, nút Chuông thông báo và Menu người dùng.
- **Thanh điều hướng nghiệp vụ**: Bao gồm Quản lý Hội sở, Tài khoản & Phân quyền, Danh mục Nhân sự, Cấu hình Tham số, Quản trị Nền tảng và Nhật ký thao tác.

---

# 2. QUẢN LÝ HỘI SỞ & CẤU HÌNH ĐIỂM CHẤM CÔNG (GPS + WIFI)

Đây là phân hệ nền tảng quyết định việc nhân viên có chấm công trên điện thoại thành công hay không.

![Quản lý Hội sở](docs/images/admin_02_hoi_so.png)

### Các bước thiết lập một Cơ sở / Hội sở mới:
1. Vào menu **"Hội sở / Đơn vị"**.
2. Nhấn nút **"Thêm hội sở mới"**.
3. Điền thông tin cơ bản:
   - **Mã hội sở**: Ví dụ `SUPERBRAIN_Q1`, `SUPERBRAIN_TB`.
   - **Tên đơn vị**: Ví dụ *Toán Trí Tuệ Superbrain - Cơ sở Quận 1*.
4. **Cấu hình Vị trí Địa lý (GPS) cho Chấm công Điện thoại**:
   - Mở Google Maps, tìm đúng địa chỉ trung tâm, nhấp chuột phải chọn copy tọa độ.
   - Dán **Vĩ độ (Latitude)** và **Kinh độ (Longitude)** vào ô tương ứng.
   - **Bán kính cho phép (Radius)**: Nhập từ `50` đến `100` mét (khoảng cách này giúp nhân viên ở trong phòng kín, hành lang hoặc tầng hầm vẫn chấm công tốt mà không bị sai số vệ tinh).
5. **Cấu hình Mạng Wifi văn phòng (SSID)**:
   - Nhập chính xác tên các mạng Wifi phát sóng tại cơ sở (Ví dụ: `Superbrain_Office`, `Superbrain_Guest`).
   - Nhân viên khi kết nối vào đúng tên Wifi này thì mới được phép bấm chấm công.
6. Nhấn **"Lưu thay đổi"**.

---

# 3. QUẢN LÝ TÀI KHOẢN & PHÂN QUYỀN NGƯỜI DÙNG

![Quản lý Tài khoản và Phân quyền](docs/images/admin_03_tai_khoan.png)

### A. Tạo tài khoản mới cho nhân sự:
1. Vào menu **"Tài khoản & Phân quyền"** -> Nhấn **"Thêm người dùng mới"**.
2. Nhập thông tin:
   - **Tên đăng nhập**: Thường là Mã nhân viên (Ví dụ: `nv02`, `nv03`) hoặc Email.
   - **Họ và tên**: Họ tên đầy đủ của nhân sự.
   - **Mật khẩu khởi tạo**: Ví dụ `Superbrain@123` (yêu cầu tối thiểu 8 ký tự).
   - **Gán Hội sở phụ trách**: Chọn cơ sở mà nhân sự này trực thuộc.
3. **Phân quyền vai trò (Role)**:
   - `Employee`: Nhân viên thông thường (chỉ dùng cổng chấm công cá nhân, xem bảng công, gửi đơn xin phép).
   - `Manager`: Trưởng phòng / Quản lý cơ sở (thêm quyền duyệt đơn nghỉ phép và đơn giải trình của cấp dưới).
   - `HR`: Nhân sự / Kế toán bảng lương (sử dụng quy trình tính công, duyệt chấm công, nạp file máy chấm công).
   - `Admin`: Toàn quyền quản trị kỹ thuật.
4. Nhấn **"Lưu tài khoản"**.

### B. Đặt lại mật khẩu (Reset Password) cho nhân viên:
Khi nhân viên quên mật khẩu hoặc nhập sai quá 5 lần bị tạm khóa:
1. Tìm tên tài khoản của nhân viên trong danh sách.
2. Bấm vào nút **"Đặt lại mật khẩu"**.
3. Nhập mật khẩu mới và gửi lại cho nhân viên đăng nhập.

---

# 4. QUẢN LÝ THIẾT BỊ: RESET MÁY KHI NHÂN VIÊN ĐỔI THIẾT BỊ

Để chống gian lận, hệ thống áp dụng nguyên tắc **1 Máy = 1 Tài khoản**:
- Máy tính PC được gắn với **Địa chỉ MAC** của card mạng.
- Điện thoại được gắn với **Mã định danh thiết bị (Device ID)**.

### Khi nhân viên mua máy tính mới hoặc đổi điện thoại:
1. Nhân viên khi dùng máy mới sẽ nhận thông báo: *"Tài khoản đã được gắn với thiết bị khác"*.
2. Nhân viên sẽ báo cho Admin hỗ trợ.
3. Admin truy cập vào menu **"Duyệt Chấm Công"** -> Chọn tab **"Quản Lý Thiết Bị"**.
4. Tìm dòng tên của nhân viên đó.
5. Nhấn nút **"Hủy liên kết (Unlink / Reset Device)"**.
6. Ngay sau khi bấm, liên kết cũ bị xóa bỏ. Nhân viên chỉ cần mở máy mới lên và bấm nút "Đăng ký thiết bị này" là hoàn tất.

---

# 5. CẤU HÌNH THAM SỐ CHẤM CÔNG & GIỜ LÀM VIỆC

![Cấu hình Tham số](docs/images/admin_04_tham_so.png)

Hệ thống cho phép cấu hình linh hoạt mọi quy tắc chấm công theo văn hóa doanh nghiệp Superbrain mà không cần sửa mã nguồn:
1. Vào menu **"Cấu Hình Tham Số"**.
2. Các tham số chính có thể tùy chỉnh:
   - **Giờ ca chuẩn**: Ví dụ 08:30 đến 17:30.
   - **Thời gian nghỉ trưa**: Ví dụ 12:00 đến 13:30 (tự động trừ 1.5 giờ khi tính giờ làm việc thực tế).
   - **Thời gian ân hạn đi trễ**: Ví dụ cho phép đi trễ `5` phút hoặc `10` phút không bị phạt công.
   - **Ngưỡng tính đủ 1.0 công**: Ví dụ làm từ đủ `7.0` giờ trở lên được làm tròn thành đủ 1 công.
   - **Chế độ làm việc ngày Thứ 7**: Tùy chỉnh làm cả ngày, làm nửa ngày hoặc nghỉ cả ngày.
3. Nhấn nút **"Lưu cấu hình tham số"** để áp dụng cho toàn công ty.

---

# 6. TÙY BIẾN THƯƠNG HIỆU & GIAO DIỆN NỀN TẢNG (PLATFORM BRANDING)

Phần mềm cho phép thay đổi nhận diện thương hiệu (White-label) theo nhu cầu:

![Cấu hình Nền tảng](docs/images/admin_05_nen_tang.png)

1. Vào menu **"Cấu hình Nền tảng"**.
2. Bạn có thể thay đổi:
   - **Tên Nền tảng (Site Title)**: Ví dụ *Hệ Thống Chấm Công Superbrain*.
   - **Khẩu hiệu (Site Subtitle)**: Ví dụ *Nền tảng Quản trị Chấm công & Nhân sự Thông minh*.
   - **Logo Thương hiệu (Brand Logo)**: Dán đường dẫn ảnh logo hoặc tải trực tiếp file logo của Superbrain lên.
   - **Biểu tượng website (Favicon)**: Logo nhỏ hiển thị trên tab trình duyệt.
   - **Bản quyền chân trang (Copyright)**: Tùy biến dòng chữ chân trang cuối màn hình.
3. Bấm **"Lưu cài đặt nền tảng"**. Hệ thống sẽ đổi giao diện ngay lập tức trên toàn bộ các máy đang truy cập!

---

# 7. THEO DÕI NHẬT KÝ HOẠT ĐỘNG & BẢO MẬT

Để đảm bảo tính minh bạch và phục vụ công tác kiểm toán:
1. Vào menu **"Nhật Ký Thao tác"**.
2. Hệ thống ghi lại toàn bộ hoạt động quan trọng:
   - Ai đã đăng nhập vào lúc nào.
   - Ai đã bấm duyệt đơn nghỉ phép, duyệt giải trình.
   - Ai đã chỉnh sửa tay vào ô công của nhân viên.
   - Ai đã thực hiện bấm tính công hoặc chốt kỳ.
3. Nhật ký này được lưu trữ theo cơ chế **Chỉ ghi thêm (Append-only)**, không thể bị xóa hoặc sửa đổi bởi bất kỳ người dùng nào, đảm bảo an toàn tối đa cho dữ liệu doanh nghiệp.

---

# 8. CÁC LƯU Ý KỸ THUẬT QUAN TRỌNG CHO QUẢN TRỊ VIÊN

> [!IMPORTANT]
> ### 5 NGUYÊN TẮC QUẢN TRỊ AN TOÀN
> 
> 1. **KIỂM TRA BÁN KÍNH GPS TRƯỚC KHI TRIỂN KHAI**: Khi nhập tọa độ cơ sở, hãy đến tận nơi kiểm tra trên điện thoại để xem bán kính 50m - 100m có phủ kín toàn bộ khuôn viên làm việc của nhân viên hay không.
> 2. **CẬP NHẬT TÊN WIFI KHI THAY THẾ ROUTER**: Nếu trung tâm mua cục phát Wifi mới hoặc đổi tên mạng, Admin phải cập nhật ngay tên SSID mới vào bảng cấu hình Hội sở để nhân viên không bị báo lỗi "Sai mạng Wifi".
> 3. **BẢO MẬT MẬT KHẨU TÀI KHOẢN ADMIN**: Tài khoản admin có quyền can thiệp vào toàn bộ cơ sở dữ liệu. Cần đặt mật khẩu mạnh (có chữ hoa, chữ thường, số và ký tự đặc biệt) và không chia sẻ cho người không có thẩm quyền.
> 4. **HỖ TRỢ RESET THIẾT BỊ KỊP THỜI**: Khi nhân viên báo đổi máy, hãy xử lý hủy liên kết ngay trong ngày để nhân viên kịp chấm công ca làm việc tiếp theo.
> 5. **SAO LƯU DỮ LIỆU ĐỊNH KỲ**: Định kỳ hàng tuần hoặc trước mỗi kỳ chốt lương lớn, hãy sao lưu cơ sở dữ liệu SQL Server của phần mềm để luôn sẵn sàng trong mọi tình huống khẩn cấp.

---
*(Tài liệu kỹ thuật và vận hành dành riêng cho Bộ phận Quản trị Hệ thống Superbrain)*
