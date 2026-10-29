# SỔ TAY VẬN HÀNH & HƯỚNG DẪN THAO TÁC DÀNH CHO ROLE HR (NHÂN SỰ)
**Hệ Thống Chấm Công & Quản Lý Nghỉ Phép Toán Trí Tuệ Superbrain Việt Nam**

---

## 1. Video Hướng Dẫn Thao Tác Thực Tế

Toàn bộ phiên thao tác trực tiếp trên giao diện thực tế với tài khoản Nhân sự (`hr`) đã được ghi hình tự động và lưu trữ tại:
`C:/Users/ADMIN/.gemini/antigravity-ide/brain/cf67fe7d-9d40-41ef-bc71-bb33cf18c0b3/hr_guide_tour_1792491030348.webp`

---

## 2. Thông Tin Đăng Nhập & Phân Quyền Role HR

- **Cổng truy cập**: `http://localhost:5192` (hoặc tên miền máy chủ nội bộ Superbrain)
- **Tài khoản mẫu**: `hr`
- **Mật khẩu khởi tạo**: `Hr@123456`
- **Quyền hạn (Role HR / Operator)**:
  - Tiếp nhận, xét duyệt các đơn giải trình chấm công (quên quẹt thẻ, công tác, lỗi thiết bị) và kiểm tra ảnh minh chứng WebP.
  - Quản lý lượt chấm công hàng ngày: rà soát lượt vi phạm, quản lý và cấp phát thiết bị PC/Mobile.
  - Quản lý nghỉ phép: phê duyệt đơn nghỉ phép của nhân viên, quản lý danh sách nghỉ toàn công ty và theo dõi quỹ phép năm.
  - Vận hành quy trình tính công 4 bước cuối kỳ: nạp bổ sung file vân tay/khuôn mặt, hiệu chỉnh bảng công thủ công (có nút Hoàn tác Undo), xuất bảng lương Excel chi tiết và chốt khóa kỳ công.

---

## 3. Hướng Dẫn Thao Tác Chi Tiết Theo Từng Phân Hệ

### Phân Hệ 1: Trang Tổng Quan (Dashboard)
1. **Mục đích**: Nắm bắt nhanh quân số, tỷ lệ đi làm đúng giờ, số lượt cần xác nhận và đơn từ đang chờ xử lý trong ngày.
2. **Thao tác**:
   - Chọn Hội sở làm việc tại góc trên bên phải thanh điều hướng nếu quản lý nhiều cơ sở.
   - Quan sát các thẻ thống kê tổng quan (Tổng nhân sự, Đi làm, Vắng mặt, Đang chờ duyệt).
   - Nhấp vào các liên kết tắt để nhảy nhanh đến màn hình cần giải quyết ngay.

### Phân Hệ 1.1: Quản Lý Nhân Sự & Hình Thức Làm Việc (`admin-employees`)
1. **Mục đích**: Quản lý hồ sơ nhân viên, phân loại hình thức làm việc và thiết lập tài khoản tự phục vụ (Mobile ESS).
2. **Quy định 3 hình thức nhân sự**:
   - 🏢 **Nhân sự Chuẩn (`STANDARD`)**:
     * Làm việc toàn thời gian theo ca tiêu chuẩn tại hội sở.
     * Chấm công bắt buộc xác thực địa chỉ MAC thiết bị PC và/hoặc Wifi + GPS văn phòng.
     * Áp dụng quy chế đi trễ, về sớm và nghỉ việc tiêu chuẩn.
   - 🏠 **Nhân sự Remote (`REMOTE`)**:
     * Làm việc từ xa / Tại nhà.
     * **Điểm danh linh hoạt tại nhà**: Hệ thống tự động miễn trừ kiểm tra mạng Wifi/IP và tọa độ GPS của hội sở. Lượt chấm công được ghi nhận ngay trạng thái `VALID` với lý do `REMOTE_HOME_PUNCH`.
     * **Tính đủ công tháng**: Khi chấm công, nhân sự Remote được hưởng đủ ngày công tiêu chuẩn của tháng (ví dụ tháng có 25 ngày làm việc chuẩn thì tính đủ 25 ngày công).
     * Cần đăng ký lịch làm việc trước trên cổng tự phục vụ.
   - ⏱️ **Nhân sự Part-time (`PARTTIME`)**:
     * Làm việc bán thời gian theo lịch phân công hoặc đăng ký trước.
     * **Miễn giải trình ngày ngoài lịch**: Trong bảng chấm công, những ngày nhân viên Part-time không có lịch làm việc sẽ được xem là ngày nghỉ tự nhiên, **hoàn toàn không cần giải trình và không bị cảnh báo vắng không phép (`KP`)**, tránh gây phiền hà cho nhân viên và HR.
     * **Tính công dựa trên ngày làm việc thực tế**: Được tính đủ công dựa trên ngày đăng ký và ngày làm việc thực tế. Trường hợp đăng ký 8 ngày nhưng thực tế đi làm 9 hoặc 10 ngày thì hệ thống **vẫn tính đủ công 9 hoặc 10 ngày** cho nhân viên!
3. **Quy tắc vàng khi Đăng Ký Lịch Làm Việc (`tbl_WorkSchedules`)**:
   - ⚠️ **Phải đăng ký trước ngày làm việc**: Nhân sự Remote và Part-time bắt buộc phải đăng ký lịch làm việc trước (`WorkDate >= hôm nay`).
   - 🚫 **Nghiêm cấm đăng ký lùi ngày**: Hệ thống chặn hoàn toàn việc nghỉ làm trước rồi sau đó mới vào đăng ký lùi ngày đã qua.
   - HR có thể theo dõi và đăng ký bổ sung theo lô cho nhân viên tại giao diện quản trị.

### Phân Hệ 1.2: Cổng Đăng Ký Chỗ Làm & Lịch Làm Việc Của Nhân Viên (Giao diện Desktop & Mobile)
1. **Mục đích**: Cung cấp giao diện trực quan dạng Lịch Tháng (Calendar Grid tương tự màn hình Quản lý lịch làm việc của Admin) giúp nhân viên dễ dàng chọn ngày, ca làm và địa điểm/chỗ làm việc.
2. **Các tính năng nổi bật trên giao diện**:
   - 📅 **Lịch tháng trực quan (7 cột Thứ Hai → Chủ Nhật)**: Hiển thị rõ ràng ngày làm việc, nửa ngày thứ 7, ngày nghỉ tuần, và các ngày lễ công ty (lấy từ dữ liệu lịch công ty).
   - 🖱️ **Chọn ngày tiện lợi & Chọn hàng loạt (Batch Select)**:
     * Nhân viên nhấp chuột vào từng ngày để đăng ký hoặc chọn nhanh nhiều ngày cùng lúc.
     * Thanh tác vụ nổi (Floating Action Bar) xuất hiện ngay khi chọn ngày: cho phép gán nhanh Ca làm việc (`FULL` Cả ngày, `MORNING` Sáng, `AFTERNOON` Chiều) và Chỗ làm việc (`Văn phòng Hội sở`, `Chi nhánh`, `Làm việc từ xa Remote`...).
   - 💻 **Hiện diện đầy đủ trên Desktop & Mobile**:
     * **Desktop**: Nằm ngay trên thanh menu chính (`Đăng Ký Chỗ Làm & Lịch`) và tích hợp thành Tab tiện ích trong màn hình Chấm Công PC (`PcCheckinView`).
     * **Mobile**: Tích hợp sẵn trong Cổng nhân viên (`EmployeePortalView`), đồng bộ dữ liệu thời gian thực.
   - 📊 **Thống kê & Chuyển đổi góc nhìn**:
     * Thống kê số ngày đã đăng ký trong tháng, ca cả ngày, ca sáng/chiều.
     * Chuyển đổi linh hoạt giữa Dạng Lịch (`Grid View`) và Dạng Danh Sách (`List Filter`).
     * Hủy hoặc điều chỉnh lịch đã đăng ký an toàn trước ngày làm việc.

---

### Phân Hệ 2: Duyệt Giải Trình Chấm Công (`admin-regularization`)
1. **Mục đích**: Xét duyệt các trường hợp nhân viên quên check-in/check-out, lỗi thiết bị hoặc đi công tác ngoài.
2. **Quy trình thao tác**:
   - **Bước 1**: Nhấp menu **Duyệt Giải Trình**. Hệ thống hiển thị 4 thẻ KPI trạng thái:
     * 🟡 **Chờ HR Duyệt**: Các đơn mới gửi lên cần xử lý.
     * 🟢 **Đã Phê Duyệt**: Lịch sử các đơn đã duyệt thành công.
     * 🔴 **Đã Từ Chối**: Các đơn bị bác bỏ kèm lý do.
     * 🔵 **Tất Cả Đơn**: Toàn bộ dữ liệu giải trình của hội sở.
   - **Bước 2**: Nhấp vào nút **Xem (biểu tượng con mắt 👁️)** hoặc nút **Tệp đính kèm (📎)** trên từng dòng đơn để mở **Chi Tiết Đơn Giải Trình**.
   - **Bước 3**: Kiểm tra hình ảnh minh chứng:
     * Nhận diện nhãn xanh lá **`WebP`**: Hình ảnh đã được hệ thống tự động tối ưu hóa nén siêu nhẹ, giữ nguyên độ nét.
     * Nhấp nút **`Xem`**: Mở modal phóng to hình ảnh trực tiếp ngay trên trình duyệt mà không cần tải về máy.
     * Nhấp nút **`Tải về`**: Tải file ảnh gốc về máy tính nếu cần lưu trữ hồ sơ độc lập.
   - **Bước 4**: Bấm nút **Duyệt đơn này** (màu xanh) hoặc **Từ chối đơn này** (màu đỏ).
     * Khi từ chối, HR nhập lý do phản hồi rõ ràng để nhân viên nhận thông báo tại chuông hệ thống.
     * Có thể tích chọn nhiều đơn để **Phê duyệt theo lô (Batch Approval)** hoặc **Xóa theo lô (Batch Delete)** giúp tiết kiệm thời gian.
   - **Bước 5 (Xử lý khi duyệt nhầm ngày)**: Bấm nút **Xóa** (🗑️) ngay trên dòng đơn đã duyệt (hoặc chọn nhiều đơn để xóa hàng loạt).
     * Hệ thống sẽ tự động thu hồi giờ chấm công điều chỉnh và tính toán lại gộp công ngày thực tế cho nhân sự.
     * Gửi thông báo đến tài khoản nhân viên báo đơn giải trình đã được thu hồi do duyệt nhầm.

> [!NOTE]
> Mọi đơn giải trình sau khi được HR duyệt (`APPROVED`) sẽ **tự động cập nhật giờ vào/giờ ra thực tế** vào bảng tính công của kỳ công tương ứng.
> 
> **Cấu hình thời hạn nộp lùi linh hoạt (`REQUEST_BACKDATE_MAX_DAYS`)**: Hệ thống hỗ trợ cấu hình tùy ý hạn nộp lùi tại menu **Cấu hình tham số**. HR có thể nâng lên 30, 60, 90, 180, 365... tối đa 3650 ngày. Đặc biệt có thể đặt về `0` để **KHÔNG GIỚI HẠN giải trình lùi**, nhân viên có thể nộp cho bất kỳ ngày nào trong quá khứ mà không bị chặn.

---

### Phân Hệ 3: Quản Lý & Duyệt Chấm Công (`admin-hr-attendance`)
1. **Mục đích**: Giám sát tính toàn vẹn của dữ liệu chấm công từ thiết bị và quản lý việc đăng ký máy của nhân sự.
2. **Các tab nghiệp vụ**:
   - **Tab 1: Lượt Cần Xác Nhận**:
     * Hệ thống tự động phân loại: Các lượt hợp lệ đã được tự động duyệt và chuyển sang Tab 2, **không bắt HR phải bấm duyệt thủ công từng lượt**.
     * Tab này chỉ hiển thị các lượt bị cảnh báo: Sai địa chỉ MAC, Sai IP văn phòng, hoặc Vị trí GPS ngoài bán kính cho phép. HR kiểm tra xem có phải nhân viên làm ngoài hay vi phạm quy chế.
   - **Tab 2: Chấm Công Hợp Lệ & Đã Duyệt**:
     * Hiển thị toàn bộ lịch sử bấm giờ check-in / check-out hợp lệ từ PC và Mobile của toàn bộ nhân sự.
   - **Tab 3: Quản Lý Thiết Bị**:
     * Danh sách các thiết bị PC (Địa chỉ MAC) và Mobile (Device ID) đã được đăng ký theo nguyên tắc **1 Thiết Bị = 1 Tài Khoản**.
     * Khi nhân viên đổi máy tính hoặc đổi điện thoại mới, HR vào tab này để bấm **Mở khóa / Hủy đăng ký thiết bị cũ (`REVOKE`)**, cho phép nhân viên đăng ký thiết bị mới.

---

### Phân Hệ 4: Quản Lý Nghỉ Phép (`admin-leave`)
1. **Mục đích**: Phê duyệt nghỉ phép và quản lý quỹ phép năm của nhân sự.
2. **Các tab nghiệp vụ**:
   - **Tab 1: Duyệt Đơn Nghỉ Phép**:
     * Danh sách đơn xin nghỉ phép do nhân viên gửi lên từ cổng ESS.
     * HR kiểm tra loại phép (Phép năm `P`, Nghỉ bù `BL`, Nghỉ không lương `KL`...), thời gian nghỉ, số ngày đề xuất và hình ảnh minh chứng đính kèm (giấy viện, đơn khám bệnh).
     * Bấm **Duyệt** hoặc **Từ chối**.
     * **Tính năng Xóa đơn khi HR duyệt nhầm ngày**: Đối với các đơn đã duyệt (APPROVED), hệ thống trang bị nút **Xóa** (🗑️) trực tiếp. Khi bấm Xóa:
       1. Hệ thống tự động thu hồi các ngày nghỉ đã nạp vào lịch công.
       2. **Hoàn trả đủ số ngày phép đã trừ vào Sổ cái phép và Quỹ phép năm** cho nhân viên nguyên trạng.
       3. Tự động gửi thông báo đến chuông của nhân sự thông báo đơn đã được thu hồi.
   - **Tab 2: Danh Sách Nghỉ Đã Ghi Nhận**:
     * Quản lý các ngày nghỉ đặc biệt toàn công ty, lịch nghỉ lễ/nghỉ bù.
     * Hỗ trợ HR nạp danh sách ngày nghỉ hàng loạt từ file Excel mẫu.
   - **Tab 3: Sổ Dư & Quỹ Phép**:
     * Hỗ trợ bộ lọc linh hoạt theo **Năm** và **Từng Tháng cụ thể**:
       - Chuẩn hóa hiển thị **5 chỉ số cốt lõi** dễ hình dung:
         1. **Phép năm (Đầu kỳ)**: Định mức phép năm ban đầu (gồm hạn mức năm + phép năm trước chuyển sang nếu có).
         2. **Tích lũy (Đến T...)**: Số ngày phép được tích lũy lũy kế tính đến kỳ tháng đang chọn (+1 ngày/tháng khi làm việc đủ >= 50% ngày công chuẩn, ví dụ tháng 24 công làm đủ từ 12 công trở lên thì được +1 phép).
         3. **Tổng phép hưởng**: = Phép năm (Đầu kỳ) + Tích lũy (Đến T...).
         4. **Đã dùng trong T...**: Số ngày nghỉ phép năm nhân viên đã sử dụng trong tháng đang chọn (kèm cột **Dùng lũy kế T1-T...**).
         5. **Tồn phép (Tại T...)**: = Tổng phép hưởng - Dùng lũy kế. Thể hiện chính xác số phép nhân viên còn tồn tại mốc tháng đó.
       - Cảnh báo trực quan nhãn đỏ `⚠️ Hết phép (0)` khi nhân viên đã dùng hết hạn mức phép năm tại thời điểm đó, ngăn chặn việc xin nghỉ phép năm vượt quỹ.
     * Nhấp biểu tượng **Lịch sử (History)** trên từng nhân viên để mở Sổ cái phép chi tiết các giao dịch cộng tích lũy hoặc trừ ngày phép.

---

### Phân Hệ 5: Quy Trình Vận Hành Chấm Công 4 Bước (`operator`)
1. **Mục đích**: Tổng hợp, tính toán, rà soát và chốt bảng lương cuối tháng cho hội sở.
2. **Quy trình chuẩn 4 bước**:
   - **Bước 1: Nạp Dữ Liệu**:
     * Hệ thống tự động gom toàn bộ lượt chấm công trên Web PC/Mobile + Đơn giải trình đã duyệt + Ngày nghỉ phép đã duyệt.
     * Nếu hội sở có sử dụng máy chấm công vân tay/khuôn mặt truyền thống, HR bấm **"Tải lên file Excel chấm công"** để nạp dữ liệu gộp.
   - **Bước 2: Bảng Tính Công (Grid View)**:
     * Hiển thị ma trận chấm công toàn bộ nhân viên từ ngày 01 đến ngày cuối tháng.
     * Tự động tính toán công hưởng lương, số phút đi trễ, về sớm.
     * **Bảo vệ dữ liệu giải trình**: Các ngày đã có giải trình duyệt sẽ được khóa bảo vệ, không bị mất khi bấm tính lại.
     * **Xử lý linh hoạt theo Hình thức nhân sự**:
       - *Nhân sự Remote*: Chấm công tại nhà tính đủ công chuẩn tháng (ví dụ 25/25 ngày).
       - *Nhân sự Part-time*: Ngày ngoài lịch đăng ký không đòi hỏi giải trình, không sinh cảnh báo `KP`. Làm thêm ngoài lịch (đăng ký 8 ngày làm 9 hoặc 10 ngày) vẫn tính đủ 9 hoặc 10 ngày công.
     * **Sửa tay & Hoàn tác**: Nếu HR bấm sửa mã công của 1 ngày (ví dụ sửa từ `V` sang `P`), hệ thống tự động lưu bản snapshot. Nếu muốn khôi phục lại công máy tính, HR chỉ cần bấm nút **"↩️ Hoàn tác" (Undo)**.
   - **Bước 3: Cảnh Báo & Rà Soát**:
     * Rà soát danh sách nhân viên vi phạm quy chế: Đi trễ nhiều lần, Vắng không phép (`KP`), Quên quẹt thẻ ra về.
   - **Bước 4: Xuất Báo Cáo & Chốt Kỳ Công**:
     * **Xuất Bảng Chấm Công Excel**: Bảng tính chuẩn gồm Sheet chấm công tổng hợp (kèm cột Phép năm còn lại, Nghỉ không lương `KL`) và Sheet Phép năm (tự động giới hạn đến tháng của kỳ công).
     * **Xuất Báo Cáo Cảnh Báo**: Tải danh sách cảnh báo vi phạm đi trễ/về sớm.
     * **Chốt Kỳ Công (`Close Period`)**: Khóa an toàn toàn bộ số liệu của tháng, ngăn chặn chỉnh sửa hoặc nạp đè dữ liệu.
   - **Tính năng Xóa Hoàn Toàn Kỳ Công & Tính Lại Từ Đầu (`Xóa kỳ này`)**:
     * **Khi nào sử dụng**: Khi HR/Admin cần làm lại kỳ công từ đầu do import nhầm file quẹt thẻ, cấu hình sai lịch làm việc chuẩn, hoặc muốn reset sạch số liệu để nạp và tính lại kỳ mới.
     * **Cơ chế xóa sạch 100%**: Hệ thống tự động giải phóng toàn bộ bảng khóa ngoại liên quan theo thứ tự: bản công bố bảng công & khiếu nại (`TimesheetPublications`, `TimesheetDisputes`), dữ liệu quẹt thô & đợt nạp (`RawPunches`, `ImportBatches`), bảng tính công & sao lưu (`DayResults`, `DayResultManualBackups`), sổ cái phép phát sinh (`LeaveLedger`), và tự động hoàn tác ngày tích lũy phép năm (+1 phép) nếu kỳ đó đã từng chốt.
     * **Tự động điền tháng tạo mới**: Ngay sau khi xóa, hệ thống sẽ tự động gán sẵn Tháng/Năm vừa xóa vào modal tạo kỳ công mới, giúp HR chỉ cần bấm 1 click là có thể tạo lại và tính công ngay.

---

### Phân Hệ 6: Quản Trị Hội Sở & Xóa Cưỡng Bức (`admin-companies`)
1. **Quản lý danh sách Hội sở / Chi nhánh**: Thiết lập thông tin, mã hội sở, logo, danh mục phòng ban và cấu hình mạng chấm công.
2. **Cơ chế Xóa Cưỡng Bức (`Force Delete`) An Toàn**:
   - Khi cần xóa hoàn toàn một hội sở thử nghiệm hoặc giải thể chi nhánh, hệ thống thực thi cơ chế xóa theo chuỗi thác đổ (Cascade) tuần tự:
     * *Tầng 1*: Khiếu nại & Bảng công bố (`Disputes`, `PublishedLines`, `Publications`).
     * *Tầng 2*: Lượt quẹt thô & Lịch sử nạp (`RawPunches`, `ImportBatches`, `ExportHistory`).
     * *Tầng 3*: Bảng tính công, Sao lưu snapshot & Sổ cái phép (`DayResults`, `LeaveFunds`, `LeaveLedger`).
     * *Tầng 4*: Điều chỉnh giờ, Tóm tắt chấm công ngày & Lượt quẹt web/mobile (`TimeAdjustments`, `DailyPunchSummaries`, `WebAttendanceLogs` - xóa trước để giải phóng khóa ngoại `FK_Log_Dev`).
     * *Tầng 5*: Thiết bị & Token xác thực thiết bị (`RefreshTokens`, `EmployeeDevices`).
     * *Tầng 6*: Đơn từ giải trình & Tệp đính kèm (`EmployeeRequests`, `RequestAttachments`, `LeaveRequests`).
     * *Tầng 7*: Phân công chi nhánh, Cảnh báo & Lịch làm việc (`EmployeeBranchAssignments`, `HrAlerts`, `WorkSchedules`).
     * *Tầng 8*: Kỳ công, Nhân viên, Tham số, Phòng ban, Khối, và cuối cùng là Hội sở.
   - 🛡️ **Bảo vệ hệ thống**: Tuyệt đối không cho phép xóa hội sở gốc (`SUPERBRAIN` / Id 1) hoặc khi hệ thống chỉ còn duy nhất 1 hội sở hoạt động.

---

## 4. Bảng Tra Cứu Lưu Ý Sống Còn Dành Cho HR

| Vấn đề | Rủi ro nếu thao tác sai | Thao tác chuẩn mực của HR |
| :--- | :--- | :--- |
| **Ảnh minh chứng WebP** | Tưởng chưa lưu ảnh do không xem được | Mở xem trực tiếp qua nút `Xem` hoặc nút `Tải về`. File đã được nén WebP bảo mật bằng Token xác thực an toàn. |
| **Chấm công PC vs Mobile** | Nhân viên báo lỗi không chấm công được | - PC: Kiểm tra đã đăng ký đúng địa chỉ MAC chưa.<br>- Mobile: Nhắc nhân viên kết nối đúng Wifi công ty và bật GPS chính xác. |
| **Nhân sự Remote** | Bị từ chối lượt quẹt thẻ vì ở nhà | Đảm bảo hồ sơ nhân viên được chọn hình thức `Nhân sự Remote`. Hệ thống sẽ tự động miễn trừ IP/GPS văn phòng, ghi nhận `VALID` và tính đủ công tháng. |
| **Nhân sự Part-time** | Bị phạt vắng `KP` vào những ngày không đi làm | Nhắc nhân viên đăng ký lịch làm việc trước. Ngày ngoài lịch hệ thống tự động xem là ngày nghỉ tự nhiên, không cần giải trình. Nếu làm thêm ngày (đăng ký 8 làm 10), hệ thống vẫn tính đủ 10 công. |
| **Đăng ký lịch làm việc** | Nghỉ làm rồi mới xin đăng ký lùi ngày | Hệ thống chặn đăng ký lùi ngày (`WorkDate < hôm nay`). Bắt buộc nhân viên phải đăng ký lịch làm việc trước ngày làm việc. |
| **Hết phép năm** | Nhân viên tự ý nghỉ không xin phép | Nhắc nhân viên nộp đơn **Nghỉ không hưởng lương (`KL`)**. Hệ thống cho phép nộp tự do kể cả khi quỹ phép còn 0. |
| **Tính toán lại công** | Sợ mất dữ liệu giải trình hoặc sửa tay | Hệ thống tự động bảo toàn ngày đã duyệt giải trình. Khi sửa tay có nút **↩️ Hoàn tác (Undo)** khôi phục nguyên trạng. |
| **Chốt kỳ công** | Quên kiểm tra giải trình còn tồn đọng | Trước khi bấm Chốt kỳ ở Bước 4, HR phải kiểm tra tab "Chờ HR Duyệt" của Giải trình và Nghỉ phép phải là **0**. |
| **Xóa kỳ công làm lại** | Lo lắng sót dữ liệu cũ hoặc xung đột khóa ngoại | Bấm **"Xóa kỳ này"** màu đỏ ở góc trên màn hình vận hành. Hộp thoại sẽ liệt kê chi tiết mọi dữ liệu con bị xóa và tự động hoàn tác phép năm đã cộng (nếu kỳ đã chốt), sau đó bấm **"Tạo kỳ chấm công mới"** để tính lại từ đầu. |
| **Xóa cưỡng bức hội sở** | Lỗi vi phạm khóa ngoại không thể xóa | Sử dụng nút **Xóa cưỡng bức** trên danh mục hội sở. Hệ thống tự động dọn sạch tuần tự toàn bộ dữ liệu phụ thuộc không để lại rác. |
