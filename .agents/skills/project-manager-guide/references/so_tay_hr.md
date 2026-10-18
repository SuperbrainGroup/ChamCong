# SỔ TAY HƯỚNG DẪN DÀNH CHO BỘ PHẬN NHÂN SỰ (HR / C&B)
## 💼 VẬN HÀNH BẢNG CÔNG, DUYỆT PHÉP & TÍNH CÔNG 1-CHẠM THÔNG MINH

---

## LỜI NÓI ĐẦU
Tài liệu này được biên soạn dành riêng cho các Chuyên viên Nhân sự, C&B và Quản trị viên phụ trách công tác chấm công - tính lương tại Superbrain. 

Với phiên bản phần mềm mới, toàn bộ các khâu thủ công rườm rà trước đây đã được tối ưu thành quy trình **tự động hóa và 1-chạm**, giúp bộ phận Nhân sự tiết kiệm hàng chục giờ đồng hồ mỗi kỳ chốt lương.

---

## MỤC LỤC
1. [Tổng quan Bảng điều khiển Nhân sự](#1-tổng-quan-bảng-điều-khiển-nhân-sự)
2. [Quản lý Lượt chấm công hàng ngày & Xử lý bất thường](#2-quản-lý-lượt-chấm-công-hàng-ngày--xử-lý-bất-thường)
3. [Quản lý Nghỉ phép: Duyệt đơn & "Danh Sách Nghỉ Đã Ghi Nhận"](#3-quản-lý-nghỉ-phép-duyệt-đơn--danh-sách-nghỉ-đã-ghi-nhận)
4. [Quy trình Tính công Kỳ này 1-Chạm (One-Touch Workflow)](#4-quy-trình-tính-công-kỳ-này-1-chạm-one-touch-workflow)
5. [Nạp file Excel chấm công bổ sung (Gộp chung với máy quẹt thẻ)](#5-nạp-file-excel-chấm-công-bổ-sung-gộp-chung-với-máy-quẹt-thẻ)
6. [Thao tác trên Bảng tính công (Grid), Bảo toàn giải trình & Nút Hoàn tác](#6-thao-tác-trên-bảng-tính-công-grid-bảo-toàn-giải-trình--nút-hoàn-tác)
7. [Chốt kỳ công & Xuất file Excel Bảng lương](#7-chốt-kỳ-công--xuất-file-excel-bảng-lương)
8. [Những điểm Nhân sự cần đặc biệt lưu ý khi vận hành](#8-những-điểm-nhân-sự-cần-đặc-biệt-lưu-ý-khi-vận-hành)

---

# 1. TỔNG QUAN BẢNG ĐIỀU KHIỂN NHÂN SỰ

![Bảng điều khiển Nhân sự](docs/images/hr_01_dashboard.png)

Sau khi đăng nhập với tài khoản HR (`hr`), bạn sẽ thấy Bảng điều khiển trung tâm với đầy đủ các phân hệ làm việc:
- **Chấm Công**: Nơi thực hiện quy trình tính công cuối kỳ.
- **Duyệt Chấm Công**: Giám sát các lượt chấm công có vấn đề (sai địa chỉ máy, sai mạng Wifi, ngoài tọa độ văn phòng).
- **Quản lý nghỉ phép**: Nơi phê duyệt đơn nghỉ phép của nhân viên và nhập danh sách nghỉ bù, nghỉ lễ.
- **Danh mục Nhân sự & Lịch Làm Việc**: Quản lý thông tin nhân viên, phòng ban và lịch làm việc của công ty.

---

# 2. QUẢN LÝ LƯỢT CHẤM CÔNG HÀNG NGÀY & XỬ LÝ BẤT THƯỜNG

![Quản lý lượt chấm công](docs/images/hr_07_quan_ly_cham_cong_flags.png)

### Điểm cải tiến quan trọng giúp HR không bị ngợp việc:
- **Lượt quẹt HỢP LỆ (Đúng máy, đúng Wifi, đúng vị trí)**: Hệ thống **tự động xác nhận** và ghi nhận vào bảng tính công. HR không phải bấm nút duyệt từng lượt một cách thủ công như trước. Danh sách "Lượt cần xác nhận" sẽ luôn sạch sẽ và chỉ hiển thị khi có vấn đề.
- **Lượt quẹt KHÔNG HỢP LỆ (Bất thường)**: Sẽ xuất hiện cờ cảnh báo màu vàng hoặc đỏ kèm lý do cụ thể:
  + `Lỗi MAC`: Nhân viên chấm công từ một máy tính lạ chưa được đăng ký.
  + `Lỗi Wifi`: Nhân viên dùng mạng Wifi lạ hoặc 4G để chấm công điện thoại.
  + `Lỗi Ngoài vùng`: Vị trí GPS của nhân viên cách cơ sở quá xa bán kính cho phép.

### Cách xử lý:
1. Nhấp vào lượt bị cảnh báo để xem chi tiết giờ quẹt và nguyên nhân.
2. Trao đổi nhanh với nhân viên hoặc Trưởng cơ sở.
3. Nếu nhân viên có lý do chính đáng (Ví dụ: Cơ sở vừa đổi cục phát Wifi mới), HR nhấn nút **"Chấp thuận đặc cách"** để ghi nhận giờ công cho nhân viên.

---

# 3. QUẢN LÝ NGHỈ PHÉP: DUYỆT ĐƠN & "DANH SÁCH NGHỈ ĐÃ GHI NHẬN"

Giao diện Quản lý nghỉ phép của HR được tách biệt rõ ràng thành 2 khu vực để tránh nhầm lẫn:

---

## 3.1. Tab 1: Duyệt Đơn Nghỉ Phép (Từ nhân viên gửi lên)

![Duyệt đơn nghỉ phép](docs/images/hr_05_duyet_nghi_phep.png)

- Hiển thị toàn bộ các đơn xin nghỉ phép năm, nghỉ ốm, việc riêng do nhân viên nộp qua cổng tự phục vụ (ESS).
- HR kiểm tra:
  + Tên nhân sự, số ngày xin nghỉ, lý do nghỉ.
  + Quỹ phép năm còn lại của nhân sự đó.
- Thao tác: Bấm nút **"Duyệt"** hoặc **"Từ chối"** (có ô nhập lý do từ chối để hệ thống gửi thông báo lại cho nhân viên).

---

## 3.2. Tab 2: Danh Sách Nghỉ Đã Ghi Nhận (Ngoại lệ & Nạp file Excel)

![Danh sách nghỉ đã ghi nhận](docs/images/hr_06_danh_sach_nghi_da_ghi_nhan.png)

Nơi lưu trữ các ngày nghỉ đặc thù do công ty quyết định mà không cần nhân viên phải nộp đơn từng người:
1. **Nghỉ Lễ, Tết theo quy định nhà nước**: Hệ thống tự động ghi nhận ngày nghỉ có lương.
2. **Nghỉ sự kiện / Team building / Đóng cửa cơ sở sửa chữa**: HR bấm nút tạo mới để thêm ngày nghỉ cho toàn thể nhân viên hoặc cho một chi nhánh cụ thể.
3. **Nạp danh sách nghỉ hàng loạt từ file Excel**: 
   - Nếu bạn có danh sách nhân viên nghỉ phép từ file ngoài, chỉ cần bấm **"Import Danh Sách Nghỉ (Excel)"**.
   - Hệ thống sẽ đọc file và ghi nhận toàn bộ vào bảng công kỳ này chỉ trong 2 giây.

---

# 4. QUY TRÌNH TÍNH CÔNG KỲ NÀY 1-CHẠM (ONE-TOUCH WORKFLOW)

Đây là tính năng đột phá giúp rút ngắn tối đa thời gian chốt công cuối tháng của HR.

![Quy trình Tính công](docs/images/hr_02_cham_cong_workflow.png)

### Thao tác 1-Chạm diễn ra như sau:
1. Vào menu **"Chấm Công"**.
2. Chọn **Kỳ công** cần tính (Ví dụ: *Tháng 11/2026: 26/10/2026 - 25/11/2026*).
3. Nhấn nút xanh nổi bật: **"⚡ 1-Chạm: Tổng hợp & Tính công ngay"**.

![Tính công 1-chạm thành công](docs/images/hr_03_tinh_cong_1cham_done.png)

4. **Hệ thống tự động thực hiện tức thì**:
   - Tự động gom toàn bộ lượt chấm công hợp lệ từ máy tính và điện thoại của nhân viên.
   - Tự động tích hợp toàn bộ các đơn **Giải trình bổ sung công** đã được duyệt.
   - Tự động khấu trừ và tính ngày nghỉ phép từ **Đơn nghỉ phép** và **Danh sách nghỉ đã ghi nhận**.
   - **Tự động chuyển thẳng HR sang Bước 3: Bảng Tính Công (Grid)** với đầy đủ số liệu hoàn chỉnh! Bạn không cần phải thao tác thủ công qua từng bước rườm rà.

---

# 5. NẠP FILE EXCEL CHẤM CÔNG BỔ SUNG (GỘP CHUNG VỚI MÁY QUẸT THẺ)

Nếu cơ sở của bạn vẫn đang dùng song song một máy chấm công vân tay hoặc nhận diện khuôn mặt gắn ở cửa ra vào:
1. Tại màn hình tính công, bạn nhìn sang ô bên phải: **"Nạp bổ sung từ file máy chấm công (Tùy chọn)"**.
2. Kéo thả file Excel xuất ra từ máy chấm công vân tay vào khung này.
3. Nhấn **"Xác nhận Nạp & Gộp dữ liệu"**.
4. **Cơ chế gộp thông minh**: Hệ thống sẽ tự động gộp (merge) lượt quẹt vân tay này chung với dữ liệu chấm công từ máy tính và điện thoại của nhân viên. Nhân viên quẹt kênh nào hệ thống cũng đều ghi nhận chuẩn xác.

---

# 6. THAO TÁC TRÊN BẢNG TÍNH CÔNG (GRID), BẢO TOÀN GIẢI TRÌNH & NÚT HOÀN TÁC

![Bảng tính công chi tiết](docs/images/hr_04_bang_tinh_cong_grid.png)

### 3 Điểm an toàn tuyệt đối khi HR thao tác trên Bảng tính công:

#### A. Không bao giờ bị mất Giải trình khi bấm "Tính lại"
- Trước đây, nếu HR bấm "Tính toán lại", hệ thống có thể đè mất giờ công giải trình của nhân viên.
- Nay hệ thống đã có cơ chế **Bảo vệ giải trình (Protected Regularization)**: Mọi ngày công có giải trình đã duyệt sẽ được giữ nguyên 100%, không bao giờ bị tính lại thành vắng mặt.

#### B. Sửa tay trực tiếp vào ô công (Manual Override)
- Khi cần can thiệp đặc cách cho nhân viên nào, HR chỉ cần nhấp đúp chuột vào ô ngày công tương ứng trên bảng.
- Nhập giá trị mới (Ví dụ: sửa từ `0` thành `1.0` công) rồi nhấn Enter.

#### C. Nút "↩️ Hoàn tác" (Undo) cứu cánh khi sửa nhầm
- Mỗi khi HR sửa tay, hệ thống sẽ tự động tạo một bản sao lưu ngầm (Snapshot).
- Nếu lỡ tay gõ nhầm điểm số hoặc bấm nhầm nút "Đặt lại về mặc định", HR chỉ cần nhấn nút **"↩️ Hoàn tác"** ở góc phải bảng công.
- Ngay lập tức, bảng công sẽ khôi phục lại nguyên trạng các số liệu bạn đã sửa trước đó. Bạn không còn phải lo lắng việc mất dữ liệu!

---

# 7. CHỐT KỲ CÔNG & XUẤT FILE EXCEL BẢNG LƯƠNG

Sau khi đã rà soát xong bảng công:
1. Nhấn nút **"Bước tiếp theo: Xuất file & Chốt kỳ"** (hoặc chọn Bước 4).
2. Nhấn nút **"Xuất file Excel Bảng công"**:
   - File Excel tải về máy tính được định dạng chuẩn hóa theo mẫu bảng lương Superbrain (đầy đủ các cột: Số ngày làm việc, Ngày nghỉ lễ, Phép năm, Số giờ trễ/sớm, Tổng công hưởng lương).
3. Nhấn nút **"Chốt kỳ công (Lock Period)"**:
   - Kỳ công sẽ chuyển sang trạng thái đóng băng an toàn (Chỉ đọc).
   - Ngăn ngừa việc sửa nhầm số liệu sau khi đã gửi sang kế toán tính lương.

---

# 8. NHỮNG ĐIỂM NHÂN SỰ CẦN ĐẶC BIỆT LƯU Ý KHI VẬN HÀNH

> [!TIP]
> ### 6 NGUYÊN TẮC VÀNG CHO BỘ PHẬN NHÂN SỰ
> 
> 1. **DUYỆT HẾT ĐƠN TỪ TRƯỚC KHI BẤM TÍNH CÔNG**: Trước ngày chốt lương, hãy nhắc các Trưởng bộ phận duyệt hết toàn bộ đơn nghỉ phép và đơn giải trình của nhân viên để hệ thống tự động gộp vào bảng công.
> 2. **LƯỢT QUẸT HỢP LỆ ĐÃ TỰ ĐỘNG DUYỆT**: Đừng mất công đi tìm nút duyệt cho các lượt quẹt hợp lệ. Bạn chỉ cần chú ý vào danh sách các lượt bị cờ cảnh báo (sai máy, sai Wifi, ngoài bán kính).
> 3. **TẬN DỤNG QUY TRÌNH 1-CHẠM**: Chỉ cần chọn kỳ và bấm nút *"⚡ 1-Chạm: Tổng hợp & Tính công ngay"*, bạn sẽ có ngay bảng công hoàn thiện mà không cần làm từng bước.
> 4. **BÌNH TĨNH DÙNG NÚT HOÀN TÁC**: Nếu có lỡ bấm nhầm nút tính lại làm đổi các ô đã sửa tay, hãy bấm ngay nút *"↩️ Hoàn tác"* để lấy lại dữ liệu.
> 5. **HỖ TRỢ NHÂN VIÊN ĐỔI MÁY**: Khi nhân viên mua máy tính hoặc đổi điện thoại mới, nhân viên sẽ không tự đăng ký được. Bạn hãy vào mục *Tài khoản & Thiết bị*, bấm hủy máy cũ của nhân viên đó để họ đăng ký máy mới.
> 6. **BẮT BUỘC BẤM CHỐT KỲ CÔNG**: Khi đã chốt xong số liệu với Ban Giám đốc và Kế toán, hãy bấm *Chốt kỳ công* để lưu trữ hồ sơ phục vụ kiểm toán và không bị xáo trộn dữ liệu về sau.

---
*(Tài liệu chuẩn hóa nghiệp vụ dành riêng cho Bộ phận Nhân sự Superbrain)*
