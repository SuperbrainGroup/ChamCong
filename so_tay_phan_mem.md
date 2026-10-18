# SỔ TAY PHẦN MỀM: HỆ THỐNG CHẤM CÔNG & QUẢN LÝ NGHỈ PHÉP SUPERBRAIN
*(Tài liệu Hướng dẫn Sử dụng Chi tiết & Quy chuẩn Vận hành Dành cho Toàn bộ Nhân viên, Quản lý, Nhân sự và Quản trị viên)*

---

## MỤC LỤC
1. [GIỚI THIỆU TỔNG QUAN HỆ THỐNG](#1-giới-thiệu-tổng-quan-hệ-thống)
2. [SƠ ĐỒ PHÂN QUYỀN & TRÁCH NHIỆM THEO VAI TRÒ (ROLES)](#2-sơ-đồ-phân-quyền--trách-nhiệm-theo-vai-trò-roles)
3. [HƯỚNG DẪN DÀNH CHO NHÂN VIÊN (ESS - EMPLOYEE SELF-SERVICE)](#3-hướng-dẫn-dành-cho-nhân-viên-ess---employee-self-service)
   - 3.1. [Đăng nhập & Đăng ký thiết bị lần đầu](#31-đăng-nhập--đăng-ký-thiết-bị-lần-đầu)
   - 3.2. [Chấm công bằng Máy tính bàn / Laptop (PC)](#32-chấm-công-bằng-máy-tính-bàn--laptop-pc)
   - 3.3. [Chấm công bằng Điện thoại di động (Mobile)](#33-chấm-công-bằng-điện-thoại-di-động-mobile)
   - 3.4. [Xem Bảng công cá nhân & Tra cứu lịch sử](#34-xem-bảng-công-cá-nhân--tra-cứu-lịch-sử)
   - 3.5. [Gửi đơn Giải trình chấm công (Quên quẹt thẻ / Công tác ngoài)](#35-gửi-đơn-giải-trình-chấm-công-quên-quẹt-thẻ--công-tác-ngoài)
   - 3.6. [Gửi đơn Xin nghỉ phép & Theo dõi trạng thái](#36-gửi-đơn-xin-nghỉ-phép--theo-dõi-trạng-thái)
   - 3.7. [Trung tâm Thông báo hệ thống](#37-trung-tâm-thông-báo-hệ-thống)
4. [HƯỚNG DẪN DÀNH CHO TRƯỞNG BỘ PHẬN / QUẢN LÝ (MANAGER)](#4-hướng-dẫn-dành-cho-trưởng-bộ-phận--quản-lý-manager)
   - 4.1. [Duyệt đơn Xin nghỉ phép của cấp dưới](#41-duyệt-đơn-xin-nghỉ-phép-của-cấp-dưới)
   - 4.2. [Duyệt đơn Giải trình bổ sung công](#42-duyệt-đơn-giải-trình-bổ-sung-công)
   - 4.3. [Theo dõi quân số và tình hình đi làm thời gian thực](#43-theo-dõi-quân-số-và-tình-hình-đi-làm-thời-gian-thực)
5. [HƯỚNG DẪN DÀNH CHO BỘ PHẬN NHÂN SỰ (HR / PAYROLL OPERATOR)](#5-hướng-dẫn-dành-cho-bộ-phận-nhân-sự-hr--payroll-operator)
   - 5.1. [Quản lý Lượt chấm công & Xử lý lượt quẹt không hợp lệ](#51-quản-lý-lượt-chấm-công--xử-lý-lượt-quẹt-không-hợp-lệ)
   - 5.2. [Quản lý Nghỉ phép: Duyệt phép ESS & "Danh Sách Nghỉ Đã Ghi Nhận"](#52-quản-lý-nghỉ-phép-duyệt-phép-ess--danh-sách-nghỉ-đã-ghi-nhận)
   - 5.3. [Quy trình Tính công Kỳ này 1-Chạm (One-Touch Attendance Workflow)](#53-quy-trình-tính-công-kỳ-này-1-chạm-one-touch-attendance-workflow)
   - 5.4. [Nạp file Excel chấm công bổ sung (Gộp dữ liệu từ máy vân tay/khuôn mặt)](#54-nạp-file-excel-chấm-công-bổ-sung-gộp-dữ-liệu-từ-máy-vân-taykhuôn-mặt)
   - 5.5. [Bảo toàn dữ liệu giải trình & Cơ chế Hoàn tác (Undo) khi sửa tay](#55-bảo-toàn-dữ-liệu-giải-trình--cơ-chế-hoàn-tác-undo-khi-sửa-tay)
   - 5.6. [Chốt kỳ công & Xuất file Báo cáo Excel bảng lương](#56-chốt-kỳ-công--xuất-file-báo-cáo-excel-bảng-lương)
6. [HƯỚNG DẪN DÀNH CHO QUẢN TRỊ VIÊN HỆ THỐNG (ADMIN)](#6-hướng-dẫn-dành-cho-quản-trị-viên-hệ-thống-admin)
   - 6.1. [Quản lý Cơ cấu tổ chức: Hội sở & Phòng ban](#61-quản-lý-cơ-cấu-tổ-chức-hội-sở--phòng-ban)
   - 6.2. [Cấu hình Điểm chấm công: Tọa độ GPS, Bán kính, Wifi SSID](#62-cấu-hình-điểm-chấm-công-tọa-độ-gps-bán-kính-wifi-ssid)
   - 6.3. [Quản lý Tài khoản & Phân quyền người dùng](#63-quản-lý-tài-khoản--phân-quyền-người-dùng)
   - 6.4. [Quản lý Thiết bị: Phê duyệt & Hủy gán thiết bị khi nhân viên đổi máy](#64-quản-lý-thiết-bị-phê-duyệt--hủy-gán-thiết-bị-khi-nhân-viên-đổi-máy)
7. [NHỮNG ĐIỂM ĐẶC BIỆT CẦN LƯU Ý KHI THAO TÁC (CRITICAL NOTICES)](#7-những-điểm-đặc-biệt-cần-lưu-ý-khi-thao-tác-critical-notices)
8. [HỎI ĐÁP & XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING FAQ)](#8-hỏi-đáp--xử-lý-sự-cố-thường-gặp-troubleshooting-faq)

---

# 1. GIỚI THIỆU TỔNG QUAN HỆ THỐNG

**Hệ thống Chấm công & Quản lý Nghỉ phép Superbrain** là giải pháp số hóa toàn diện quy trình ghi nhận thời gian làm việc, quản lý nghỉ phép và tính toán ngày công cho toàn bộ cán bộ nhân viên Superbrain.

### Mục Tiêu Cốt Lõi:
1. **Minh bạch & Tự động**: Tự động hóa khâu thu thập dữ liệu chấm công từ thiết bị của chính nhân viên (máy tính hoặc điện thoại cá nhân).
2. **Chính xác & Phòng chống gian lận**: Ràng buộc vật lý chặt chẽ thông qua xác thực **Địa chỉ MAC** máy tính và định vị **Wifi + GPS Geofence** trên điện thoại di động theo nguyên tắc **1 Thiết bị = 1 Tài khoản**.
3. **Tiết kiệm thời gian cho Nhân sự (HR)**: Rút ngắn 90% thời gian xử lý bảng công cuối tháng nhờ quy trình tính công 1-chạm tự động tổng hợp quẹt thẻ, giải trình và đơn phép.

---

# 2. SƠ ĐỒ PHÂN QUYỀN & TRÁCH NHIỆM THEO VAI TRÒ (ROLES)

| Vai trò (Role) | Đối tượng áp dụng | Quyền hạn & Trách nhiệm chính |
| :--- | :--- | :--- |
| **Nhân viên (Employee)** | Toàn thể cán bộ nhân viên | - Đăng ký thiết bị cá nhân (PC / Điện thoại).<br>- Thực hiện Chấm công vào/ra hàng ngày.<br>- Xem bảng công, nộp đơn giải trình quên chấm công, nộp đơn xin nghỉ phép. |
| **Quản lý (Manager)** | Trưởng bộ phận, Trưởng cơ sở | - Duyệt / Từ chối đơn xin nghỉ phép của nhân viên trực thuộc.<br>- Duyệt / Từ chối đơn giải trình chấm công của nhân viên.<br>- Giám sát quân số làm việc thực tế tại cơ sở. |
| **Nhân sự (HR / Operator)** | Chuyên viên C&B, Trưởng phòng HR | - Kiểm tra các lượt quẹt không hợp lệ.<br>- Quản lý duyệt phép và danh sách nghỉ đã ghi nhận (nạp Excel).<br>- Vận hành quy trình Tính công kỳ này 1-chạm.<br>- Điều chỉnh công thủ công, sử dụng tính năng Hoàn tác (Undo).<br>- Chốt kỳ công và xuất bảng lương Excel. |
| **Quản trị viên (Admin)** | Bộ phận CNTT / Quản trị hệ thống | - Khởi tạo hội sở, cấu hình bán kính GPS, SSID Wifi văn phòng.<br>- Quản trị tài khoản, gán quyền role.<br>- Mở khóa/reset thiết bị khi nhân viên thay đổi máy tính/điện thoại. |

---

# 3. HƯỚNG DẪN DÀNH CHO NHÂN VIÊN (ESS - EMPLOYEE SELF-SERVICE)

## 3.1. Đăng nhập & Đăng ký thiết bị lần đầu
Mỗi nhân viên chỉ được sử dụng thiết bị chính chủ để chấm công. Hệ thống tự động nhận diện thiết bị người dùng đang truy cập để tối ưu thao tác.

### Bước 1: Đăng nhập
1. Truy cập vào địa chỉ cổng nội bộ: `http://chamcong.superbrain.vn` (hoặc địa chỉ IP/tên miền do công ty cấp).
2. Nhập **Tên đăng nhập (Mã nhân viên/Email)** và **Mật khẩu**.
3. Bấm **Đăng nhập**.

### Bước 2: Đăng ký thiết bị cá nhân
1. Vào mục **Cài đặt thiết bị** trên menu tài khoản cá nhân.
2. **Nếu bạn đang ngồi trước Máy tính văn phòng / Laptop cá nhân (PC)**:
   - Hệ thống tự nhận diện bạn đang dùng PC.
   - Nút đăng ký Mobile sẽ tự động bị khóa và ẩn các nút mở Mobile để tránh đăng ký nhầm.
   - Nhấn nút **"Đăng ký thiết bị PC này"**. Hệ thống sẽ đọc và ghi nhận Địa chỉ MAC của máy vào tài khoản.
3. **Nếu bạn đang mở bằng Trình duyệt Điện thoại (Mobile)**:
   - Hệ thống tự nhận diện giao diện di động.
   - Khu vực PC chỉ hiển thị trạng thái xem thông tin.
   - Nhấn nút **"Đăng ký thiết bị di động này"**.
   - Trình duyệt sẽ hỏi: *"Trang web muốn truy cập vị trí của bạn"*, nhấn **CHO PHÉP (Allow)**.

> [!IMPORTANT]
> **Nguyên tắc 1:1**: Một máy tính hoặc một chiếc điện thoại chỉ được đăng ký cho **DUY NHẤT 01 TÀI KHOẢN**. Tuyệt đối không mượn máy đồng nghiệp để bấm đăng ký hộ vì tài khoản đó sẽ chiếm quyền thiết bị của đồng nghiệp!

---

## 3.2. Chấm công bằng Máy tính bàn / Laptop (PC)
Phương thức chấm công này phù hợp cho nhân viên làm việc tại văn phòng cố định.

- **Cơ chế xác thực**: Chỉ kiểm tra **Địa chỉ MAC** của máy tính. Không bắt buộc kiểm tra GPS hay Wifi.
- **Các bước thực hiện**:
  1. Mở trình duyệt trên máy tính đã đăng ký MAC.
  2. Truy cập vào mục **Chấm công PC**.
  3. Màn hình hiển thị trạng thái thiết bị: `Địa chỉ MAC: Hợp lệ` kèm thời gian thực.
  4. Bấm nút **"BẮT ĐẦU CHẤM CÔNG"** (hoặc **Chấm công Vào / Chấm công Ra**).
  5. Màn hình thông báo màu xanh: **"Chấm công thành công! [Thời gian: HH:mm:ss]"**.

---

## 3.3. Chấm công bằng Điện thoại di động (Mobile)
Phương thức chấm công này dành cho nhân viên làm việc tại các cơ sở, hội sở hoặc di chuyển linh hoạt.

- **Cơ chế xác thực**: Xác thực kết hợp **Wifi SSID văn phòng** và **Tọa độ GPS Geofence**.
- **Điều kiện cần trước khi bấm**:
  1. Điện thoại đã kết nối vào đúng mạng **Wifi của Hội sở/Cơ sở** (không dùng 4G/5G).
  2. Điện thoại đã **Bật định vị (Location/GPS)** với chế độ *Độ chính xác cao*.
- **Các bước thực hiện**:
  1. Mở trình duyệt trên điện thoại (Safari trên iOS hoặc Chrome trên Android).
  2. Vào cổng chấm công, chọn mục **Chấm công Mobile**.
  3. Hệ thống quét Wifi và định vị GPS hiện tại:
     - `Wifi`: Hiển thị tên Wifi văn phòng (Hợp lệ ✅).
     - `Vị trí`: Hiển thị khoảng cách tới tâm hội sở (VD: *Cách cơ sở 15m - Nằm trong bán kính cho phép* ✅).
  4. Bấm nút **"CHẤM CÔNG MOBILE"**.
  5. Nhận thông báo chấm công thành công.

---

## 3.4. Xem Bảng công cá nhân & Tra cứu lịch sử
1. Vào menu **Bảng công cá nhân**.
2. Chọn **Tháng / Kỳ công** cần tra cứu (VD: *Kỳ tháng 10/2026*).
3. Màn hình hiển thị lịch trực quan:
   - Các ngày có chấm công đầy đủ hiển thị màu xanh lá (Đủ 8.0 giờ).
   - Ngày đi trễ / về sớm hiển thị số phút chênh lệch.
   - Ngày vắng mặt hoặc chỉ quẹt 1 đầu (In/Out) sẽ có ký hiệu cảnh báo màu vàng cam.
4. Nhấn vào từng ngày để xem chi tiết giờ quẹt thẻ và thiết bị đã thực hiện.

---

## 3.5. Gửi đơn Giải trình chấm công (Quên quẹt thẻ / Công tác ngoài)
Khi bạn có đi làm nhưng quên quẹt thẻ, máy tính gặp sự cố, hoặc phải ra ngoài gặp khách hàng:

1. Tại Bảng công cá nhân, chọn ngày bị thiếu công hoặc nhấn nút **"Tạo đơn giải trình"**.
2. Chọn loại giải trình:
   - *Bổ sung giờ Vào (Check-in)*
   - *Bổ sung giờ Ra (Check-out)*
   - *Bổ sung cả ngày*
3. Nhập **Giờ thực tế** bạn có mặt/rời đi.
4. Ghi rõ **Lý do giải trình** (VD: *Đi tiếp đối tác tại Quận 1 theo chỉ đạo của TBP*, *Máy tính cập nhật Windows lúc 8h30 không bấm được web*).
5. Bấm **"Gửi giải trình"**. Đơn sẽ tự động chuyển tới Quản lý trực tiếp để xét duyệt.

---

## 3.6. Gửi đơn Xin nghỉ phép & Theo dõi trạng thái
1. Vào menu **Nghỉ phép** -> Chọn **Tạo đơn xin nghỉ phép**.
2. Điền thông tin đơn:
   - **Loại phép**: Nghỉ phép năm, Nghỉ không hưởng lương, Nghỉ ốm/chế độ, Nghỉ việc riêng có lương.
   - **Thời gian**: Chọn từ ngày đến ngày; chọn *Cả ngày*, *Nửa ngày sáng*, hoặc *Nửa ngày chiều*.
   - **Lý do nghỉ**: Mô tả ngắn gọn lý do.
   - **Người bàn giao công việc**: Chọn đồng nghiệp tạm nhận bàn giao (nếu có).
3. Bấm **"Gửi đơn duyệt"**.
4. **Theo dõi trạng thái**:
   - Trạng thái ban đầu: `Chờ duyệt` (Màu vàng).
   - Khi Quản lý duyệt: Trạng thái đổi thành `Đã chấp thuận` (Màu xanh), số ngày phép tồn sẽ tự động trừ tương ứng.
   - Nếu bị từ chối: Trạng thái đổi thành `Bị từ chối` kèm lý do giải thích từ Quản lý.

---

## 3.7. Trung tâm Thông báo hệ thống
Nút **Chuông thông báo (🔔)** được bố trí ngay trên thanh công cụ góc phải màn hình (cạnh tên tài khoản):
- Khi có bất kỳ sự thay đổi nào về: Đơn nghỉ phép được duyệt/từ chối, Đơn giải trình được chấp thuận, hoặc Thông báo khẩn từ HR.
- Biểu tượng chuông sẽ hiện chấm đỏ báo hiệu có thông báo mới. Nhấp vào chuông để đọc chi tiết phản hồi.

---

# 4. HƯỚNG DẪN DÀNH CHO TRƯỞNG BỘ PHẬN / QUẢN LÝ (MANAGER)

## 4.1. Duyệt đơn Xin nghỉ phép của cấp dưới
1. Vào menu **Quản lý Nghỉ phép** -> Chọn tab **Chờ phê duyệt**.
2. Danh sách hiển thị toàn bộ đơn xin nghỉ của các nhân viên thuộc phòng ban/cơ sở bạn quản lý.
3. Kiểm tra các thông tin:
   - Tên nhân sự, ngày xin nghỉ, số ngày phép năm còn lại.
   - Lý do xin nghỉ và kế hoạch bàn giao công việc.
4. Thao tác:
   - Nhấn **"Duyệt"**: Đơn được thông qua ngay lập tức, hệ thống tự động ghi nhận ngày nghỉ hợp lệ vào bảng công của nhân viên.
   - Nhấn **"Từ chối"**: Bắt buộc nhập ô *Lý do từ chối* (VD: *Trùng lịch trực cơ sở, đề nghị dời sang tuần sau*). Hệ thống sẽ gửi thông báo trả về cho nhân viên.

## 4.2. Duyệt đơn Giải trình bổ sung công
1. Vào menu **Duyệt Giải Trình (Regularization Approval)**.
2. Xem danh sách các đề xuất bổ sung giờ chấm công của nhân viên.
3. Đối chiếu lý do giải trình với lịch trình công việc thực tế của nhân viên.
4. Nhấn **"Chấp thuận"** hoặc **"Từ chối"**.
   - Khi được chấp thuận, lượt giải trình này trở thành **dữ liệu được bảo vệ (Protected Regularization)**, sẵn sàng cho HR gộp vào kỳ tính công.

## 4.3. Theo dõi quân số và tình hình đi làm thời gian thực
- Tại trang chủ **Dashboard Quản lý**, Trưởng bộ phận có thể xem biểu đồ thời gian thực:
  - Tổng số nhân viên đã có mặt (Đã check-in).
  - Danh sách nhân viên đang nghỉ phép có lương / không lương.
  - Danh sách nhân viên vắng chưa rõ lý do trong ngày.

---

# 5. HƯỚNG DẪN DÀNH CHO BỘ PHẬN NHÂN SỰ (HR / PAYROLL OPERATOR)

## 5.1. Quản lý Lượt chấm công & Xử lý lượt quẹt không hợp lệ
Tại menu **Quản lý Chấm công**:
- **Cơ chế lọc tự động thông minh**:
  - Toàn bộ các lượt chấm công **HỢP LỆ** (đúng MAC, đúng Wifi, đúng GPS) được hệ thống tự động xác nhận và đưa thẳng vào cơ sở dữ liệu tính công. Các lượt này **KHÔNG hiển thị trong "Lượt cần xác nhận"** và không làm phiền HR bằng các nút bấm duyệt dư thừa.
- **Xử lý các lượt KHÔNG HỢP LỆ (Bất thường)**:
  - Tab cảnh báo chỉ hiển thị danh sách các lượt quẹt vi phạm kèm mã lỗi chi tiết:
    + `Lỗi MAC`: Địa chỉ MAC máy tính gửi lên khác với MAC đã đăng ký của nhân viên.
    + `Lỗi Wifi`: Tên mạng Wifi không trùng với SSID hội sở.
    + `Lỗi Ngoài vùng`: Khoảng cách GPS vượt quá bán kính cho phép (VD: *Cách hội sở 350m*).
  - HR kiểm tra nguyên nhân với nhân viên. Nếu là trường hợp ngoại lệ chính đáng (VD: *Cơ sở đổi cục phát Wifi mới chưa kịp khai báo*), HR có quyền bấm **"Chấp nhận đặc cách"** hoặc **"Bác bỏ"**.

---

## 5.2. Quản lý Nghỉ phép: Duyệt phép ESS & "Danh Sách Nghỉ Đã Ghi Nhận"
Giao diện Quản lý Nghỉ phép của HR được phân định rõ ràng thành 2 khu vực:

### A. Duyệt Đơn Nghỉ Phép (Từ nhân viên)
- Hiển thị danh sách các đơn do nhân viên nộp qua cổng ESS.
- HR có thể theo dõi tiến độ duyệt của Trưởng bộ phận hoặc thực hiện duyệt cấp cao nếu được ủy quyền.

### B. Danh Sách Nghỉ Đã Ghi Nhận (Ngoại lệ & Import Excel)
- Đây là khu vực lưu trữ:
  1. Các ngày nghỉ lễ, tết toàn quốc được hệ thống tính nguyên lương.
  2. Các ngày nghỉ đột xuất của công ty (sự kiện, team building).
  3. **Nạp danh sách nghỉ hàng loạt từ Excel**: HR có thể tải file mẫu Excel, điền danh sách nhân viên nghỉ phép từ các nguồn khác và bấm **"Import Danh Sách Nghỉ"**. Hệ thống sẽ đồng bộ trực tiếp vào cơ sở dữ liệu ngày nghỉ của kỳ.

---

## 5.3. Quy trình Tính công Kỳ này 1-Chạm (One-Touch Attendance Workflow)
Trước đây, HR phải trải qua nhiều bước thủ công (chọn kỳ -> tính toán thô -> vào tab bảng chấm công -> tính toán lại). Nay hệ thống đã tối ưu thành **Quy trình 1-Chạm**:

1. Vào menu **Tính công kỳ này**.
2. Chọn **Kỳ công cần tính** (VD: *Tháng 10/2026: 01/10/2026 - 31/10/2026*).
3. Nhấn nút **"TỔNG HỢP VÀ TÍNH CÔNG KỲ NÀY"**.
4. **Hệ thống tự động thực hiện ngầm trong 1-2 giây**:
   - Thu thập toàn bộ lượt chấm công hợp lệ từ máy tính và điện thoại.
   - Tự động gộp toàn bộ các đơn Giải trình bổ sung công đã được duyệt.
   - Tự động tích hợp toàn bộ các ngày Nghỉ phép đã duyệt và Danh sách nghỉ đã ghi nhận.
   - Chuyển thẳng người dùng sang **Bảng Tính Công Chi Tiết (Grid Tính Công)** với đầy đủ dữ liệu hoàn chỉnh!

---

## 5.4. Nạp file Excel chấm công bổ sung (Gộp dữ liệu từ máy vân tay/khuôn mặt)
Nếu công ty vẫn duy trì máy chấm công vân tay hoặc khuôn mặt đặt tại cửa:
1. Tại màn hình tính công, có khung **"Nạp File Chấm Công Bổ Sung (Tùy chọn)"**.
2. Kéo thả file Excel xuất từ máy chấm công vân tay vào đây.
3. Hệ thống sẽ **tự động gộp chung (Merge)** dữ liệu từ file Excel này với dữ liệu chấm công từ thiết bị của nhân viên, không phân tách thành 2 luồng riêng biệt.

---

## 5.5. Bảo toàn dữ liệu giải trình & Cơ chế Hoàn tác (Undo) khi sửa tay

> [!TIP]
> **Điểm cải tiến vượt trội về an toàn dữ liệu**:
> - **Dữ liệu giải trình**: Các ngày công có giải trình đã duyệt sẽ được gắn cờ bảo vệ cố định. Khi HR bấm nút "Tính toán lại", hệ thống **KHÔNG BAO GIỜ** làm mất đi dữ liệu giải trình của nhân viên.
> - **Nút Hoàn tác (Undo)**: Khi HR sửa tay trực tiếp vào các ô công trên Grid (Manual Override), hệ thống tự động lưu bản sao lưu (Snapshot). Nếu HR sửa nhầm hoặc bấm nhầm nút tính lại, chỉ cần nhấn nút **"↩️ Hoàn tác"**, toàn bộ số liệu sửa tay trước đó sẽ được khôi phục nguyên vẹn 100%!

### Các bước chỉnh sửa tay trên Grid:
1. Nhấp đúp vào ô công của nhân viên cần điều chỉnh (VD: cột Ngày 15, nhân viên A).
2. Sửa lại số giờ hoặc ký hiệu công (VD: sửa từ *0* thành *1.0* công).
3. Nhấn Enter hoặc nhấp ra ngoài để lưu.
4. Nếu phát hiện nhầm lẫn: Nhấn nút **"↩️ Hoàn tác (Restore)"** nằm ngay phía trên bên phải của bảng công để quay về trạng thái trước đó.

---

## 5.6. Chốt kỳ công & Xuất file Báo cáo Excel bảng lương
1. Sau khi đã rà soát bảng công đầy đủ và chuẩn xác.
2. Nhấn nút **"Xuất Excel Bảng Công"**: Hệ thống tải về file `.xlsx` định dạng chuẩn theo mẫu bảng lương của Superbrain (đầy đủ số giờ công, ngày phép, đi trễ, làm thêm).
3. Nhấn **"Chốt Kỳ Công (Lock Period)"**:
   - Sau khi chốt kỳ, bảng công chuyển sang chế độ **Chỉ Đọc (Read-only)**.
   - Toàn bộ dữ liệu được đóng băng an toàn phục vụ việc thanh toán lương và lưu trữ hồ sơ thuế, kiểm toán.

---

# 6. HƯỚNG DẪN DÀNH CHO QUẢN TRỊ VIÊN HỆ THỐNG (ADMIN)

## 6.1. Quản lý Cơ cấu tổ chức: Hội sở & Phòng ban
1. Vào menu **Quản trị hệ thống** -> **Danh mục Hội sở / Chi nhánh**.
2. Thêm mới hoặc chỉnh sửa các hội sở (Cơ sở 1, Cơ sở 2, Hội sở chính).
3. Khai báo các **Phòng ban** và phân bổ nhân sự trực thuộc.

## 6.2. Cấu hình Điểm chấm công: Tọa độ GPS, Bán kính, Wifi SSID
Đây là bước tối quan trọng để việc chấm công qua điện thoại hoạt động chuẩn xác:
1. Vào chi tiết của một Hội sở.
2. **Cấu hình Vị trí Địa lý (GPS)**:
   - Nhập **Vĩ độ (Latitude)** và **Kinh độ (Longitude)** chính xác của văn phòng (lấy từ Google Maps).
   - Thiết lập **Bán kính cho phép (Radius)**: Khuyên dùng từ `50m` đến `100m` để bù đắp sai số GPS trong nhà.
3. **Cấu hình Mạng Wifi**:
   - Nhập chính xác danh sách **Wifi SSID (Tên Wifi văn phòng)** mà nhân viên được phép kết nối (VD: `Superbrain_Office`, `Superbrain_Guest`).
4. Nhấn **"Lưu cấu hình"**.

## 6.3. Quản lý Tài khoản & Phân quyền người dùng
1. Vào menu **Người dùng & Phân quyền**.
2. Thêm mới tài khoản: Cung cấp Mã nhân viên, Họ tên, Email, Phòng ban, Hội sở làm việc.
3. Gán Role phù hợp:
   - `Employee`: Toàn bộ nhân viên.
   - `Manager`: Trưởng phòng / Giám đốc chi nhánh.
   - `Hr`: Nhân sự / Phụ trách bảng công.
   - `Admin`: Quản trị viên kỹ thuật.

## 6.4. Quản lý Thiết bị: Phê duyệt & Hủy gán thiết bị khi nhân viên đổi máy
1. Vào menu **Quản lý Thiết bị (Devices Management)**.
2. Danh sách hiển thị toàn bộ máy PC (kèm MAC) và điện thoại (kèm Device ID) đã liên kết với nhân viên.
3. **Khi nhân viên đổi máy tính hoặc mua điện thoại mới**:
   - Nhân viên không thể tự đăng ký thêm thiết bị mới do đã có thiết bị cũ trong hệ thống.
   - Admin tìm tên nhân viên trong danh sách -> Nhấn nút **"Hủy liên kết (Unlink / Reset Device)"**.
   - Sau khi Admin hủy liên kết, nhân viên có thể dùng máy mới để đăng ký lại như lần đầu.

---

# 7. NHỮNG ĐIỂM ĐẶC BIỆT CẦN LƯU Ý KHI THAO TÁC (CRITICAL NOTICES)

> [!WARNING]
> ### 10 ĐIỀU BẮT BUỘC PHẢI NHỚ ĐỂ TRÁNH LỖI DỮ LIỆU
> 
> 1. **KHÔNG CHIA SẺ THIẾT BỊ ĐÃ ĐĂNG KÝ**: Tuyệt đối không cho đồng nghiệp mượn máy tính hoặc điện thoại cá nhân để chấm công hộ. Hệ thống nhận diện 1 thiết bị = 1 người; nếu người khác đăng nhập vào máy của bạn thì hệ thống sẽ từ chối hoặc báo lỗi xung đột MAC!
> 
> 2. **CHẤM CÔNG PC CHỈ DỰA VÀO ĐỊA CHỈ MAC**: Khi ngồi máy tính bàn, hệ thống chỉ kiểm tra MAC card mạng máy tính đã đăng ký. Bạn không cần bận tâm về việc kết nối Wifi hay GPS.
> 
> 3. **CHẤM CÔNG ĐIỆN THOẠI BẮT BUỘC BẬT GPS VÀ WIFI**: Không dùng 4G/5G để chấm công điện thoại. Bắt buộc điện thoại phải kết nối vào Wifi công ty và cấp quyền "Vị trí có độ chính xác cao" cho trình duyệt.
> 
> 4. **GIAO DIỆN TỰ ĐỘNG KHÓA NÚT TRÁNH ĐĂNG KÝ NHẦM**: Khi đang mở bằng PC, nút đăng ký Mobile bị khóa hoàn toàn. Khi mở bằng Mobile, nút PC chỉ có tác dụng xem. Hãy thực hiện đăng ký trên chính thiết bị đó.
> 
> 5. **LƯỢT QUẸT HỢP LỆ TỰ ĐỘNG ĐƯỢC CHẤP THUẬN**: HR không cần tìm kiếm nút duyệt cho các lượt quẹt hợp lệ. Hệ thống đã tự động tính công. HR chỉ cần tập trung rà soát danh sách lượt quẹt bất thường.
> 
> 6. **GIẢI TRÌNH ĐƯỢC BẢO VỆ TUYỆT ĐỐI**: Khi HR bấm nút "Tính toán lại", mọi ngày công đã có giải trình được phê duyệt sẽ được giữ nguyên, không bao giờ bị tính đè thành vắng mặt.
> 
> 7. **SỬ DỤNG NÚT HOÀN TÁC (UNDO) KHI SỬA NHẦM BẢNG CÔNG**: Nếu HR điều chỉnh tay trên bảng công mà lỡ tay nhập sai hoặc bấm nhầm tính lại, hãy bình tĩnh bấm nút **"↩️ Hoàn tác"** ở góc phải bảng công để khôi phục lại dữ liệu ngay lập tức.
> 
> 8. **PHÂN BIỆT RÕ 2 TAB NGHỈ PHÉP**: 
>    - *Duyệt Đơn Nghỉ Phép*: Dành cho đơn do nhân viên nộp lên.
>    - *Danh Sách Nghỉ Đã Ghi Nhận*: Dành cho các ngoại lệ của công ty và nạp file Excel danh sách nghỉ hàng loạt.
> 
> 9. **GỬI ĐƠN NGHỈ & GIẢI TRÌNH ĐÚNG KỲ**: Nhân viên cần hoàn tất gửi đơn nghỉ phép và giải trình trước ngày 25 hàng tháng (hoặc ngày chốt kỳ công) để Quản lý kịp duyệt trước khi HR chạy bảng tính công.
> 
> 10. **CHỐT KỲ CÔNG ĐỂ BẢO VỆ SỐ LIỆU**: Sau khi HR hoàn tất tính công và đối soát với kế toán, bắt buộc phải bấm **"Chốt Kỳ Công"** để tránh việc dữ liệu bị thay đổi ngoài ý muốn.

---

# 8. HỎI ĐÁP & XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING FAQ)

### Q1: Tôi bấm chấm công trên điện thoại nhưng hệ thống báo "Không tìm thấy vị trí" hoặc "Ngoài bán kính cho phép"?
- **Nguyên nhân**:
  1. Chưa cấp quyền truy cập GPS cho trình duyệt (Safari / Chrome).
  2. Điện thoại đang để chế độ định vị tiết kiệm pin dẫn đến sai lệch vị trí.
  3. Đang ở trong góc phòng quá kín khiến sóng GPS không xuyên qua được.
- **Cách xử lý**:
  - Vào Cài đặt điện thoại -> *Quyền riêng tư & Bảo mật* -> *Dịch vụ định vị* -> Bật *Cho phép khi dùng ứng dụng* và bật *Vị trí chính xác* cho Safari/Chrome.
  - Mở Google Maps trên điện thoại để cập nhật lại tọa độ thực tế, sau đó quay lại trang chấm công bấm lại.

### Q2: Tôi chấm công trên điện thoại nhưng báo "Sai mạng Wifi"?
- **Nguyên nhân**: Điện thoại đang bật 4G/5G hoặc đang bắt vào mạng Wifi lạ/Wifi nhà dân lân cận.
- **Cách xử lý**: Vào Cài đặt Wifi trên điện thoại, chọn đúng mạng Wifi của công ty (theo danh sách Wifi văn phòng do Admin công bố).

### Q3: Tôi đổi máy tính mới hoặc vừa cài lại Windows, khi chấm công bị báo "Địa chỉ MAC không khớp"?
- **Nguyên nhân**: Máy mới có địa chỉ MAC khác với máy cũ đã lưu trên hệ thống.
- **Cách xử lý**: Liên hệ Admin hoặc HR phụ trách để bấm nút **"Hủy liên kết thiết bị PC cũ"**. Sau đó bạn chỉ cần vào lại mục *Cài đặt thiết bị* và bấm *Đăng ký thiết bị PC này* là xong.

### Q4: Đơn xin nghỉ phép của tôi đã gửi nhưng sếp bảo chưa nhận được?
- **Nguyên nhân**: Đơn chưa bấm nút Gửi hoặc mạng chập chờn.
- **Cách xử lý**: Vào mục *Nghỉ phép cá nhân* kiểm tra xem đơn đang ở trạng thái `Chờ duyệt` hay `Bản nháp`. Nếu ở trạng thái `Chờ duyệt`, nhắn Quản lý vào tab *Chờ phê duyệt* để kiểm tra.

### Q5: HR bấm nhầm nút "Tính toán lại" làm mất các ô đã sửa tay trước đó thì làm thế nào?
- **Cách xử lý**: Rất đơn giản! Nhìn lên góc trên bên phải của Bảng tính công Grid, nhấn ngay vào nút **"↩️ Hoàn tác" (Undo)**. Toàn bộ các giá trị sửa tay trước đó sẽ lập tức xuất hiện trở lại.

---
*(Tài liệu được phát hành và quản lý bởi Ban Dự Án Hệ Thống Chấm Công Superbrain - Lưu hành nội bộ)*
