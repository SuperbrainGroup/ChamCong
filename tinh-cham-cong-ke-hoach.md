# Phần mềm Tính Chấm Công (PRJ-TIME-ONPREM-2026) — Kế hoạch tổng thể

> Phiên bản 0.1 — 2026-10-04. File này là bản kế hoạch nguồn (source of truth), đủ chi tiết để một AI/dev khác đọc và code theo.
> Mỗi lần brainstorm thêm, cập nhật trực tiếp vào file này và ghi vào "Nhật ký thay đổi" ở cuối.
> Quy ước trạng thái: **Đã chốt** (có trong yêu cầu/Excel của chủ dự án) · **Đang brainstorm** (còn điểm mơ hồ hoặc là đề xuất, xem mục "Điểm cần chốt") · **Chưa bắt đầu**.

---

## Tổng quan dự án

### Mục tiêu
Xây phần mềm đọc file chấm công xuất từ máy chấm công (phần mềm MyTime), tự động tính công theo bộ quy chuẩn do chủ dự án quy định, rồi xuất lại file Excel Bảng chấm công đúng mẫu (sheet `Ouput` trong file `Bảng_mô_tả_chức_năng_Chấm_công.xlsx`: Bảng chấm công + Bảng đi trễ về sớm nằm cùng một sheet).

### Bối cảnh
- Build mới hoàn toàn, thay quy trình thủ công hiện tại (xuất MyTime → xử lý tay trên Excel → ra BCC).
- Chạy nội bộ (on-premise) ở giai đoạn 1, chưa tích hợp cloud/máy chấm công trực tiếp. Dữ liệu vào là **file Excel xuất từ MyTime** (sheet `Input` trong file mẫu).
- Một cài đặt phục vụ **nhiều hội sở/công ty**; mỗi hội sở có bộ cấu hình riêng.

### Hai vai trò
| Vai trò | Làm gì | Giao diện |
|---|---|---|
| Admin | Tạo hội sở/công ty, tài khoản, danh mục nhân sự, bảng mã ký hiệu, bảng tham số, lịch làm việc/ngày lễ; xem tổng quan | Dashboard quản trị |
| Nhân viên chấm công | Chọn hội sở được giao, import file máy chấm công, kiểm tra, tính công, xử lý cảnh báo, chốt kỳ, xuất file Excel | Giao diện thao tác theo 4 bước, dễ dùng |

### Danh sách module lớn
0. Nền tảng & quy chuẩn kỹ thuật
1. Quản trị hệ thống (Admin)
2. Nạp dữ liệu chấm công
3. Engine tính công
4. Kỳ công & quy trình xử lý
5. Quỹ phép & sổ cái phép
6. Xuất báo cáo Excel
7. Kiểm thử & triển khai

### Nguồn tài liệu đầu vào
1. `Bảng_mô_tả_chức_năng_Chấm_công.xlsx` — sheet `Tổng quan` (Bảng quy chuẩn mã ký hiệu + Bảng cấu hình tham số), `Input` (mẫu file MyTime), `Ouput` (mẫu BCC).
2. `gemini-code-1791108968749.md` — bản mô tả dự án ban đầu (mới có phần Tổng quan & mục tiêu, bị cắt ở mục "Luồng dữ liệu tổng quát").
3. Yêu cầu bổ sung của chủ dự án (tin nhắn ngày 2026-10-04): vai trò admin/nhân viên chấm công, cấu hình theo hội sở, giao diện đơn giản, một font Nunito Sans, không logo mặc định.

**Chỗ 2 nguồn lệch nhau (đã xử lý tạm, chờ xác nhận):**
- File .md ghi output có 2 sheet (`Chấm công` và `Đi trễ về sớm`); yêu cầu mới ghi gộp trong 1 sheet như file Excel mẫu → **lấy yêu cầu mới: 1 sheet, 2 khối xếp dọc**.
- File .md có thêm "file Nghỉ phép ngoại lệ" làm đầu vào thứ 2 và "Quỹ phép lũy kế"; yêu cầu mới chỉ nhắc file máy chấm công → xếp vào Module 2.2 và Module 5, trạng thái **Đang brainstorm**.
- File .md bắt buộc Windows Server 2012 R2 + SQL Server 2008 (compat 100); yêu cầu mới không nhắc → giữ làm ràng buộc tạm, **chờ xác nhận** (Điểm cần chốt Q14).

---

## Quy chuẩn giao diện & phi chức năng (áp dụng toàn bộ phần mềm)

### Font chữ — chỉ một font duy nhất
- Toàn bộ giao diện dùng **duy nhất font Nunito Sans**: tiêu đề, nội dung, nút, ô nhập, bảng, menu, thông báo, **kể cả số, mã nhân viên, giờ, ngày** (cấm dùng font monospace hoặc font số riêng).
- Nhúng sẵn file font (woff2, đủ bộ ký tự tiếng Việt, các độ đậm 400/600/700) ngay trong ứng dụng, **không tải từ internet** vì môi trường on-premise có thể không có mạng.
- Ép `font-family: 'Nunito Sans', sans-serif` cho cả `input`, `select`, `textarea`, `button`, `table`, và các thành phần của thư viện giao diện (mặc định của trình duyệt hay dùng font khác ở các thành phần này).
- Căn số trong bảng bằng căn lề phải, không đổi font.
- File Excel xuất ra cũng dùng Nunito Sans (đúng như file mẫu).

### Màu sắc và bố cục
- Đơn giản, dễ nhìn: nền sáng trung tính, 1 màu nhấn chính, màu trạng thái nhẹ (thành công/cảnh báo/lỗi), độ tương phản chữ đạt mức dễ đọc.
- Mã ký hiệu trong bảng chấm công có màu nền nhẹ để nhìn nhanh (theo mẫu: P màu hồng đậm `EF949F`, L màu hồng nhạt `F4B7BE`; các mã còn lại Admin chọn trong Bảng quy chuẩn).
- **Không có logo thương hiệu mặc định.** Admin có thể tải logo cho từng hội sở (xem 1.2.2); chưa có logo thì chỉ hiện tên hệ thống dạng chữ.
- Admin: bố cục **dashboard** (menu dọc bên trái, thẻ số liệu tổng quan, bảng danh sách). Nhân viên chấm công: giao diện thao tác tuần tự, ít menu, mỗi màn hình một việc, nút hành động chính nổi bật.
- Hiển thị ngày theo `dd/MM/yyyy`, giờ `HH:mm`; toàn bộ chữ giao diện bằng tiếng Việt.

### Phi chức năng
- Môi trường (theo file .md, chờ xác nhận ở Q14): Windows Server 2012 R2, SQL Server 2008 ở mức tương thích 100. Hệ quả cho người code: không dùng `OFFSET/FETCH`, `LAG/LEAD`, `FORMAT`, `CONCAT`, `IIF`, `TRY_CONVERT`, `STRING_AGG`, hàm JSON; phân trang bằng `ROW_NUMBER()`; dùng kiểu `nvarchar` cho toàn bộ chữ tiếng Việt.
- Hiệu năng: tính công một kỳ cho ~100 nhân viên × 31 ngày phải xong trong vài giây; import file ~3.000 dòng dưới 30 giây.
- Bảo mật: mật khẩu băm một chiều, khóa tài khoản sau nhiều lần đăng nhập sai, phiên hết hạn khi không hoạt động, mọi thao tác thay đổi dữ liệu đều ghi nhật ký.
- Dữ liệu chấm công và nhân sự là dữ liệu nội bộ: chỉ người được gán hội sở mới thấy dữ liệu hội sở đó.

---

## Quy tắc toàn cục theo thực thể

### Thực thể: Hội sở / Công ty
- Mỗi hội sở có mã duy nhất trong toàn hệ thống và tên hiển thị dùng làm dòng tiêu đề của file xuất (ví dụ "CÔNG TY CỔ PHẦN SUPERBRAIN GROUP").
- Dữ liệu (nhân viên, kỳ công, lịch, tham số) của hội sở này không lẫn sang hội sở khác; người dùng chỉ thấy hội sở được gán.
- Hội sở đã có kỳ công thì không được xóa, chỉ được chuyển sang "Ngưng sử dụng".

### Thực thể: Nhân viên chấm công
- Mã nhân viên (hiển thị trên bảng chấm công, ví dụ `QL01`, `6`, `76`) là duy nhất trong một hội sở.
- Mã trên máy chấm công là duy nhất trong một hội sở; **việc khớp dữ liệu import với nhân viên luôn dựa trên mã máy chấm công, không dựa trên tên** (tên trên máy như "Son Ha Le" khác tên chính thức "Lê Quốc Sơn Hà").
- Một nhân viên tại một thời điểm chỉ thuộc 1 hội sở, 1 bộ phận, 1 khối nhân viên.
- Nhân viên có ngày bắt đầu làm việc và (nếu có) ngày nghỉ việc; các ngày trước ngày bắt đầu hoặc sau ngày nghỉ việc không được tính công, và được đếm vào "Nghỉ trừ lương" ở bảng tổng hợp (đúng như mẫu: nhân viên mới vào 14/09 có 15 ngày nghỉ trừ lương).
- Nhân viên đã có dữ liệu trong kỳ công thì không được xóa, chỉ được đánh dấu nghỉ việc.
- Có thể đánh dấu nhân viên "Miễn quẹt thẻ" (ví dụ Ban Giám Đốc không có trên máy) — xem Q9.

### Thực thể: Khối nhân viên
- Mặc định có 3 khối khớp 3 cột của Bảng cấu hình tham số: **Chuẩn (Global)**, **Part-time / Tạp vụ**, **Remote / Online**.
- Mỗi nhân viên thuộc đúng 1 khối. Tham số của khối ghi đè tham số của hội sở; ô nào khối không khai báo thì lấy giá trị hội sở; hội sở không khai báo thì lấy giá trị mặc định hệ thống.

### Thực thể: Tham số cấu hình
- Thứ tự ưu tiên khi lấy giá trị: **Khối của hội sở → Hội sở → Mặc định hệ thống** (cái cụ thể hơn thắng).
- Mỗi tham số có mã biến cố định (ví dụ `GRACE_PERIOD_MINUTES`), kiểu dữ liệu và khoảng giá trị hợp lệ; nhập sai kiểu/ngoài khoảng bị chặn.
- Khi tạo kỳ công, hệ thống **chụp lại (snapshot) toàn bộ tham số và bảng mã** đang hiệu lực cho kỳ đó. Đổi tham số sau này không làm thay đổi kỳ đã tạo; muốn áp dụng thì tính lại kỳ đó (nếu kỳ chưa chốt).

### Thực thể: Kỳ công
- Một kỳ công thuộc 1 hội sở, có ngày bắt đầu và kết thúc. Theo mẫu, kỳ tháng 09/2026 chạy từ **26/08 đến 25/09** (31 ngày → 31 cột ngày). Ngày bắt đầu kỳ (ngày 26) và ngày chốt (ngày 25) là tham số của hội sở, xem Q6.
- Mỗi hội sở chỉ có 1 kỳ công cho 1 tháng/năm.
- Trạng thái: **Nháp → Đã nạp dữ liệu → Đã tính → Đã chốt**. Kỳ **Đã chốt** không được nạp lại, tính lại hay sửa; chỉ Admin mới được mở chốt, bắt buộc nhập lý do và có ghi nhật ký.

### Thực thể: Dữ liệu quẹt thô
- Mỗi (nhân viên, ngày) có tối đa 1 dòng dữ liệu quẹt trong một kỳ; nếu file có 2 dòng trùng thì báo lỗi để người dùng chọn dòng giữ lại.
- Dữ liệu thô được giữ nguyên để đối chiếu, **không bị sửa**; mọi chỉnh sửa nằm ở kết quả công.
- Cột "Số giờ công 1" của MyTime **không được dùng để tính** (xem Phụ lục A); chỉ lưu để đối chiếu.

### Thực thể: Kết quả công ngày
- Mỗi (nhân viên, ngày làm việc) có đúng 1 mã ký hiệu kết quả (mã ghép như `P/2`, `L/2` là một mã).
- Mỗi kết quả ghi rõ nguồn: Tự động / Sửa tay (kèm lý do, người sửa, thời gian).
- Kết quả sửa tay không bị ghi đè khi bấm "Tính lại" trừ khi người dùng chọn rõ "Tính lại và bỏ các chỉnh sửa tay".

### Thực thể: Lịch làm việc
- Mỗi ngày trong năm của một hội sở thuộc đúng 1 loại: Làm việc cả ngày · Làm nửa ngày · Nghỉ tuần · Lễ cả ngày · Lễ nửa ngày · Nghỉ toàn công ty. Số ngày làm việc chuẩn của kỳ (ô `Số ngày làm việc tháng` = 25 trong mẫu) lấy từ lịch này, xem Q5/Q6.

### Thực thể: Ngoại lệ nghỉ phép (đơn nghỉ đã duyệt)
- Một nhân viên một ngày chỉ có 1 ngoại lệ nghỉ.
- Ngoại lệ phải có đơn đã được duyệt **trước kỳ chốt** (đúng điều kiện của mã P trong Bảng quy chuẩn).
- Ngày Lễ cả ngày được ưu tiên hơn ngoại lệ nghỉ: nếu có đơn nghỉ trùng ngày Lễ thì ghi cảnh báo và không trừ phép.

### Thực thể: Quỹ phép
- Có 3 loại quỹ cho mỗi nhân viên: quỹ phép năm hiện tại, phép tồn năm trước, quỹ bù (phép bù sự kiện/Lễ Tết). Quỹ không được âm sau khi cấn trừ.
- Chi tiết Module 5 (Đang brainstorm).

---

## Mô hình dữ liệu mức nghiệp vụ

| Thực thể | Thông tin chính cần lưu |
|---|---|
| Hội sở/Công ty | mã, tên hiển thị, logo (tuỳ chọn), trạng thái |
| Tài khoản | tên đăng nhập, họ tên, vai trò (Admin / Nhân viên chấm công), danh sách hội sở được gán, trạng thái, lần đăng nhập cuối |
| Bộ phận | hội sở, tên bộ phận (ví dụ Đào tạo, Kế toán, IT…) |
| Khối nhân viên | hội sở, tên khối (Chuẩn / Part-time-Tạp vụ / Remote-Online / khối Admin thêm) |
| Nhân viên | hội sở, mã nhân viên, mã máy chấm công, họ tên chính thức, tên trên máy, bộ phận, khối, ngày bắt đầu, ngày nghỉ việc, cờ miễn quẹt thẻ, ghi chú mặc định |
| Mã ký hiệu | mã, tên, giá trị công hưởng lương, cách tính trên BCC, tác động quỹ phép, điều kiện ghi nhận, màu hiển thị, thứ tự |
| Định nghĩa tham số | mã biến, nhóm, tên, kiểu dữ liệu, giá trị mặc định hệ thống, diễn giải |
| Giá trị tham số | phạm vi (hệ thống / hội sở / khối của hội sở), tham số, giá trị, hiệu lực từ ngày |
| Lịch làm việc | hội sở, ngày, loại ngày, giờ ca riêng (nếu có), ghi chú (ví dụ "sự kiện, về sớm") |
| Kỳ công | hội sở, tháng/năm, từ ngày, đến ngày, số ngày làm việc chuẩn, trạng thái, bản chụp tham số |
| Đợt import | kỳ công, tên file, dấu vân tay file, người nhập, thời gian, số dòng đọc được, số dòng lỗi, số dòng cảnh báo |
| Dữ liệu quẹt thô | đợt import, mã máy, tên trên máy, ngày công, vào 1, ra 1, số giờ công MyTime (đối chiếu), loại nghỉ phép, trạng thái nghỉ phép, số giờ nghỉ phép, trạng thái giờ vào-ra, lý do, duyệt ca |
| Ngoại lệ nghỉ phép | nhân viên, ngày, mã ký hiệu, số công/giờ, lý do, hồ sơ đính kèm, nguồn (file / nhập tay) |
| Kết quả công ngày | nhân viên, ngày, mã ký hiệu, giá trị công, số giờ hữu dụng, phút đi trễ, phút về sớm, phút OT, cảnh báo, nguồn, lý do sửa |
| Tổng hợp tháng | nhân viên, kỳ công, các cột tổng (xem 3.6.1), ghi chú |
| Sổ cái phép | nhân viên, loại quỹ, năm, số dư đầu, phát sinh (cộng/trừ + ngày + mã), số dư cuối |
| Nhật ký thao tác | người dùng, thời gian, đối tượng, hành động, giá trị cũ → mới |

---

## Module 0: Nền tảng & quy chuẩn kỹ thuật

Phần hạ tầng dùng chung, làm trước các module nghiệp vụ.

### Module con 0.1: Môi trường & kiến trúc

#### Tính năng 0.1.1: Môi trường triển khai on-premise
- **Mô tả**: cài đặt chạy trên máy chủ nội bộ, không phụ thuộc internet khi vận hành.
- **Vai trò liên quan**: người triển khai (IT).
- **Luồng nghiệp vụ chính**: tạo cơ sở dữ liệu → chạy script tạo bảng và dữ liệu mặc định (bảng mã, tham số, tài khoản Admin đầu tiên) → cài ứng dụng → đổi mật khẩu Admin lần đầu.
- **Ràng buộc dữ liệu**: toàn bộ dữ liệu chữ lưu dạng Unicode; script khởi tạo chạy lặp lại không làm mất dữ liệu đã có.
- **Liên kết module khác**: mọi module.
- **Trạng thái**: Đang brainstorm (chờ Q14: có còn bắt buộc Windows Server 2012 R2 + SQL Server 2008, và chọn nền tảng lập trình).

#### Tính năng 0.1.2: Kiến trúc & cấu trúc mã nguồn
- **Mô tả**: tách rõ 3 lớp — giao diện, nghiệp vụ, dữ liệu. **Engine tính công (Module 3) là một thư viện độc lập, không phụ thuộc giao diện và cơ sở dữ liệu**, nhận vào dữ liệu thô + tham số + lịch + ngoại lệ, trả ra kết quả công. Nhờ vậy test tự động được toàn bộ quy tắc.
- **Ràng buộc dữ liệu**: engine không đọc trực tiếp cấu hình từ cơ sở dữ liệu; luôn nhận bản chụp tham số của kỳ công.
- **Trạng thái**: Đang brainstorm.

### Module con 0.2: Giao diện chung

#### Tính năng 0.2.1: Hệ thiết kế (font, màu, thành phần)
- **Mô tả**: bộ thành phần giao diện dùng chung (nút, ô nhập, bảng, thẻ số liệu, thông báo, hộp thoại xác nhận) theo mục "Quy chuẩn giao diện".
- **Ràng buộc dữ liệu**: không thành phần nào được dùng font khác Nunito Sans; kiểm tra bằng một bước rà soát tự động trên mã giao diện (tìm `font-family` khác).
- **Trạng thái**: Đã chốt.

#### Tính năng 0.2.2: Khung giao diện Admin và khung giao diện Nhân viên chấm công
- **Mô tả**: Admin — dashboard có menu dọc: Tổng quan · Hội sở · Tài khoản · Nhân sự · Bảng mã ký hiệu · Bảng tham số · Lịch làm việc · Nhật ký. Nhân viên chấm công — thanh bước 4 bước: **1 Nạp file → 2 Kiểm tra → 3 Tính công → 4 Xuất file**, cộng màn hình danh sách kỳ công.
- **Vai trò liên quan**: Admin, Nhân viên chấm công.
- **Ràng buộc dữ liệu**: người dùng chỉ thấy menu đúng vai trò; truy cập thẳng bằng đường dẫn vào trang không đủ quyền bị chặn.
- **Trạng thái**: Đã chốt.

### Module con 0.3: Bảo mật & nhật ký

#### Tính năng 0.3.1: Đăng nhập & phiên
- **Mô tả**: đăng nhập bằng tên đăng nhập + mật khẩu; đổi mật khẩu; hết phiên tự động.
- **Ràng buộc dữ liệu**: tài khoản bị khóa sau 5 lần sai liên tiếp (số lần là hằng số cấu hình), Admin mở khóa; mật khẩu tối thiểu 8 ký tự.
- **Trạng thái**: Đang brainstorm (con số do mình đề xuất).

#### Tính năng 0.3.2: Nhật ký thao tác
- **Mô tả**: ghi lại ai làm gì lúc nào với dữ liệu quan trọng: đổi tham số, đổi bảng mã, import, tính công, sửa tay, chốt/mở chốt, xuất file, quản lý tài khoản.
- **Ràng buộc dữ liệu**: nhật ký chỉ thêm, không sửa/xóa qua giao diện; Admin xem được tất cả, Nhân viên chấm công chỉ xem nhật ký kỳ công của hội sở mình.
- **Trạng thái**: Đang brainstorm.

---

## Module 1: Quản trị hệ thống (Admin)

Toàn bộ cấu hình nền do Admin quản lý bằng giao diện dashboard.

### Module con 1.1: Tài khoản & phân quyền

#### Tính năng 1.1.1: Quản lý tài khoản
- **Mô tả**: tạo/sửa/khóa tài khoản, đặt lại mật khẩu, chọn vai trò.
- **Vai trò liên quan**: Admin.
- **Luồng nghiệp vụ chính**: Admin tạo tài khoản → chọn vai trò → gán hội sở → người dùng đăng nhập lần đầu và đổi mật khẩu.
- **Ràng buộc dữ liệu**: tên đăng nhập duy nhất toàn hệ thống; luôn còn ít nhất 1 tài khoản Admin đang hoạt động; tài khoản đã có thao tác trong nhật ký không được xóa, chỉ khóa.
- **Trạng thái**: Đã chốt.

#### Tính năng 1.1.2: Gán hội sở cho tài khoản
- **Mô tả**: Nhân viên chấm công chỉ làm việc trên các hội sở được gán.
- **Ràng buộc dữ liệu**: một Nhân viên chấm công phải được gán ít nhất 1 hội sở mới đăng nhập vào được phần thao tác; Admin thấy mọi hội sở.
- **Trạng thái**: Đang brainstorm (Q15: Admin có được tự tính công không; có cần vai trò "Người xem/Duyệt").

### Module con 1.2: Hội sở / Công ty & thương hiệu

#### Tính năng 1.2.1: Quản lý hội sở / công ty
- **Mô tả**: thêm/sửa hội sở: mã, tên hiển thị trên bảng chấm công, trạng thái.
- **Ràng buộc dữ liệu**: xem "Quy tắc toàn cục — Hội sở". Thêm hội sở mới tự tạo sẵn 3 khối mặc định, và sao chép bảng mã + bảng tham số mặc định hệ thống làm điểm xuất phát.
- **Trạng thái**: Đã chốt.

#### Tính năng 1.2.2: Logo & tên hiển thị (tuỳ chọn)
- **Mô tả**: Admin có thể tải logo cho từng hội sở; không có logo thì không hiển thị gì (không có logo mặc định của hệ thống).
- **Ràng buộc dữ liệu**: ảnh PNG/SVG/JPG, tối đa 1 MB; logo chỉ hiển thị trên giao diện, không bắt buộc đưa vào file Excel xuất.
- **Trạng thái**: Đã chốt.

### Module con 1.3: Danh mục nhân sự

#### Tính năng 1.3.1: Bộ phận & Khối nhân viên
- **Mô tả**: danh mục bộ phận (BP) và khối theo từng hội sở.
- **Ràng buộc dữ liệu**: tên bộ phận duy nhất trong hội sở; không xóa bộ phận/khối đang có nhân viên; 3 khối mặc định không được xóa.
- **Trạng thái**: Đã chốt.

#### Tính năng 1.3.2: Hồ sơ nhân viên chấm công
- **Mô tả**: thêm/sửa nhân viên với các trường ở "Thực thể: Nhân viên chấm công". Ghi chú mặc định (ví dụ "TTS: 3 ngày/tuần, 2tr/tháng", "Thử việc: 17/08-15/10") xuất ra cột Ghi chú của bảng chấm công.
- **Vai trò liên quan**: Admin tạo/sửa; Nhân viên chấm công chỉ xem.
- **Ràng buộc dữ liệu**: xem "Quy tắc toàn cục — Nhân viên chấm công".
- **Liên kết module khác**: Module 2 (khớp import theo mã máy), Module 3 (khối, ngày hiệu lực), Module 6 (STT, mã NV, họ tên, BP).
- **Trạng thái**: Đã chốt.

#### Tính năng 1.3.3: Import danh sách nhân viên từ Excel
- **Mô tả**: nạp hàng loạt nhân viên lúc khởi tạo để Admin không phải gõ từng người.
- **Ràng buộc dữ liệu**: dòng trùng mã máy hoặc mã nhân viên trong cùng hội sở bị báo lỗi, không ghi đè nhân viên đã có.
- **Trạng thái**: Đang brainstorm (đề xuất thêm, chưa có trong yêu cầu).

### Module con 1.4: Bảng quy chuẩn mã ký hiệu

#### Tính năng 1.4.1: Danh mục mã ký hiệu chấm công
- **Mô tả**: Admin xem/sửa **BẢNG QUY CHUẨN MÃ KÝ HIỆU CHẤM CÔNG VÀ QUY ĐỔI CÔNG**. Dữ liệu khởi tạo từ file Excel (13 dòng):

| Mã | Tên | Công hưởng lương | Tác động quỹ phép | Điều kiện ghi nhận |
|---|---|---|---|---|
| `1` | Đi làm đủ ngày công | 1.0 | Không trừ | Quẹt vào/ra đủ ≥ 7.5h hoặc đạt chuẩn bù giờ Flexitime |
| `0.5` | Đi làm nửa ngày công | 0.5 | Không trừ | Làm thực tế từ 3.5h đến dưới 7.5h |
| `L` | Nghỉ Lễ/Tết hưởng lương | 1.0 | Không trừ | Trùng ngày nghỉ Lễ quốc gia |
| `L/2` | Nghỉ Lễ nửa ngày | 1.0 (0.5L + 0.5 làm) | Không trừ | Lễ nửa ngày + quẹt thẻ làm thực tế ≥ 3.5h |
| `P` | Nghỉ phép năm cả ngày | 1.0 | Trừ 1.0 ngày | Có đơn nghỉ phép năm được duyệt trước kỳ chốt |
| `P/2` | Nghỉ phép năm 1/2 ngày | 1.0 (0.5P + 0.5 làm) | Trừ 0.5 ngày | Nghỉ phép 0.5 + quẹt thẻ làm việc ≥ 3.5h |
| `P/2K` | Nghỉ 0.5 phép + 0.5 trừ lương | 0.5 (hưởng 0.5) | Trừ 0.5 ngày | Nghỉ cả ngày nhưng chỉ còn/chỉ xin 0.5 ngày phép |
| `BL` | Nghỉ bù Lễ Tết/Sự kiện | 1.0 | Trừ 1.0 ngày Quỹ bù | Có đơn nghỉ bù từ quỹ hỗ trợ workshop, cuộc thi ngoài giờ |
| `BL/2` | Nghỉ bù 1/2 ngày | 1.0 (0.5BL + 0.5 làm) | Trừ 0.5 ngày Quỹ bù | Nghỉ bù 0.5 + đi làm thực tế ≥ 3.5h |
| `N` | Nghỉ việc không xin phép | 0.0 | Không trừ | Nghỉ không lương có đơn hoặc vắng mặt không phép |
| `NL` | Nghỉ phép không hưởng lương | **1.0 (xem Q12)** | Không trừ | Chế độ nghỉ không hưởng lương theo Luật Lao động |
| `K` | Nghỉ phép có hưởng lương | 1.0 | Không trừ | Chế độ nghỉ có hưởng lương theo Luật Lao động |
| `?` / `V` | Nghi vấn thiếu quẹt / Vắng | Tạm tính 0.0–0.5 | Không trừ | Chỉ có 1 lượt quẹt hoặc không quẹt; xuất danh sách giải trình |

- **Vai trò liên quan**: Admin sửa; Nhân viên chấm công chỉ xem.
- **Ràng buộc dữ liệu**: mã ký hiệu duy nhất; **các mã mà engine dùng trực tiếp (`1`, `0.5`, `L`, `L/2`, `P`, `P/2`, `P/2K`, `BL`, `BL/2`, `N`, `NL`, `K`, `?`, `V`) không được xóa hay đổi mã**, chỉ được sửa tên, màu, giá trị công, điều kiện diễn giải; mã mới do Admin thêm chỉ dùng được cho sửa tay/ngoại lệ, engine không tự gán.
- **Liên kết module khác**: Module 3 (gán mã), Module 4 (sửa tay chọn mã), Module 5 (tác động quỹ phép), Module 6 (màu mã trên file).
- **Trạng thái**: Đã chốt phần danh mục; **Đang brainstorm** giá trị công của `NL` (Q12).

### Module con 1.5: Bảng cấu hình tham số

#### Tính năng 1.5.1: Danh mục tham số hệ thống
- **Mô tả**: Admin xem/sửa **BẢNG CẤU HÌNH THAM SỐ QUẢN TRỊ ĐA HỘI SỞ**. Dữ liệu khởi tạo (giá trị mặc định / Part-time-Tạp vụ / Remote-Online):

| # | Mã biến | Tham số | Mặc định (Global) | Part-time / Tạp vụ | Remote / Online |
|---|---|---|---|---|---|
| 1 | `SHIFT_STANDARD_HOURS` | Khung giờ ca chuẩn | 08:00 – 17:00 | Linh hoạt theo ca đăng ký tuần | Linh hoạt theo Task dự án |
| 2 | `LUNCH_BREAK_MINUTES` | Giờ nghỉ trưa cố định (phút) | 60 | 0 (nếu ca < 5h) | 0 |
| 3 | `FLEXITIME_MODE` | Chế độ Flexitime | Kích hoạt (đối xứng) | Không áp dụng | Kích hoạt linh hoạt |
| 4 | `FLEX_IN_WINDOW` | Khung giờ vào linh hoạt | 08:00 – 08:45 | Theo ca đăng ký | Không giới hạn |
| 5 | `FLEX_OUT_WINDOW` | Khung giờ ra bù giờ | 17:00 – 17:45 | Theo ca đăng ký | Không giới hạn |
| 6 | `GRACE_PERIOD_MINUTES` | Thời gian du di (phút) | 10 | 10 | Không áp dụng |
| 7 | `MIN_HOURS_FULL_DAY` | Ngưỡng tính đủ 1.0 công (giờ) | **7.5** | Không tính ngày | Hoàn thành Task ngày |
| 8 | `MIN_HOURS_HALF_DAY` | Ngưỡng tính nửa công 0.5 (giờ) | **3.5** | Không tính ngày | 50% Task ngày |
| 9 | `SATURDAY_WORK_POLICY` | Chế độ làm việc Thứ 7 | Làm sáng Thứ 7 (0.5) | Theo lịch đăng ký | Nghỉ Thứ 7 |
| 10 | `OT_TRIGGER_THRESHOLD_MIN` | Ngưỡng kích hoạt OT (phút) | 30 | Không tính OT | Theo duyệt của GĐ |
| 11 | `MISSING_PUNCH_POLICY` | Xử lý quên quẹt (1 lần) | Gán cảnh báo (?) | Cần xác nhận ca | Tính theo Task log |

  *Lưu ý nhập liệu: trong file Excel mẫu, ô giá trị của tham số 7 và 8 bị Excel đổi thành ngày (07/05 và 03/05). Đối chiếu với cột diễn giải ("3.5h đến dưới 7.5h") thì giá trị đúng là **7.5** và **3.5**.*
- **Ràng buộc dữ liệu**: mỗi tham số có kiểu riêng (giờ-phút, số, danh sách lựa chọn); khung giờ phải có giờ bắt đầu < giờ kết thúc; `FLEX_IN_WINDOW` phải bắt đầu từ giờ vào ca chuẩn; ngưỡng nửa công < ngưỡng đủ công; tham số "Không áp dụng" nghĩa là engine bỏ qua quy tắc đó cho khối này.
- **Trạng thái**: Đã chốt danh mục 11 tham số; các giá trị dạng chữ ("Linh hoạt theo ca đăng ký", "Theo duyệt của GĐ"…) **chưa có logic máy tính được** → xem Tính năng 3.4.1/3.4.2 và Q12.

#### Tính năng 1.5.2: Cấu hình theo hội sở và theo khối
- **Mô tả**: màn hình lưới tham số: hàng = tham số, cột = Mặc định hệ thống · Hội sở đang chọn · từng khối. Ô để trống nghĩa là "kế thừa" (hiển thị giá trị kế thừa mờ).
- **Vai trò liên quan**: Admin.
- **Luồng nghiệp vụ chính**: Admin chọn hội sở → sửa ô → lưu (có hiệu lực từ ngày chọn) → các kỳ công tạo sau đó dùng giá trị mới.
- **Ràng buộc dữ liệu**: xem "Quy tắc toàn cục — Tham số cấu hình"; không sửa được tham số của kỳ công đã chốt.
- **Trạng thái**: Đã chốt.

#### Tính năng 1.5.3: Lịch sử thay đổi tham số
- **Mô tả**: xem ai đổi tham số nào, giá trị cũ → mới, hiệu lực từ ngày nào.
- **Trạng thái**: Đang brainstorm (đề xuất, dùng chung nhật ký 0.3.2).

### Module con 1.6: Lịch làm việc & ngày lễ

#### Tính năng 1.6.1: Lịch làm việc theo hội sở
- **Mô tả**: Admin khai báo từng ngày thuộc loại nào (xem "Thực thể: Lịch làm việc"), có nút tạo nhanh: đánh dấu Chủ nhật là nghỉ tuần, nhập danh sách ngày Lễ quốc gia theo năm, chọn các ngày Thứ 7 làm việc/nghỉ. Mỗi ngày có thể khai báo **giờ ca riêng** (ví dụ ngày sự kiện về sớm) để engine không tính đi trễ/về sớm sai.
- **Luồng nghiệp vụ chính**: Admin tạo lịch năm → Nhân viên chấm công tạo kỳ công → hệ thống tự đếm số ngày làm việc chuẩn của kỳ từ lịch.
- **Ràng buộc dữ liệu**: mỗi ngày chỉ 1 loại; Lễ nửa ngày phải chọn buổi (sáng/chiều); không sửa lịch của ngày thuộc kỳ đã chốt.
- **Liên kết module khác**: Module 3 (xác định ngày làm việc, Lễ, Thứ 7), Module 4 (số ngày chuẩn của kỳ), Module 6 (hàng "Số ngày làm việc tháng").
- **Trạng thái**: **Đang brainstorm** — mẫu Output cho thấy Thứ 7 không theo một quy luật đơn giản (Q5).

---

## Module 2: Nạp dữ liệu chấm công

Nhân viên chấm công đưa file từ máy chấm công vào hệ thống. Đây là bước 1–2 trên giao diện.

### Module con 2.1: Import file máy chấm công

#### Tính năng 2.1.1: Chọn hội sở, kỳ công và tải file
- **Mô tả**: màn hình bước 1: chọn hội sở (chỉ hiện hội sở được gán) → chọn tháng/năm (mặc định tháng hiện tại, tự điền 26 → 25) → kéo-thả file `.xlsx`.
- **Vai trò liên quan**: Nhân viên chấm công.
- **Luồng nghiệp vụ chính**: chọn → tải file → hệ thống đọc, làm sạch, đối chiếu → hiện báo cáo kiểm tra (2.1.4) → người dùng xác nhận "Nạp dữ liệu".
- **Ràng buộc dữ liệu**: file phải có đủ các cột của mẫu `Input` (Mã, Tên, Ngày công, Vào 1, Ra 1, Số giờ công 1, Loại nghỉ phép, Trạng thái nghỉ phép, Số giờ nghỉ phép, Trạng thái giờ vào-ra, Lý do, Duyệt ca làm việc); thiếu cột bắt buộc (Mã, Ngày công, Vào 1, Ra 1) thì chặn và nêu tên cột thiếu; chỉ chấp nhận `.xlsx` ≤ 20 MB; kỳ **Đã chốt** thì chặn nạp; nạp lại cho cùng hội sở + kỳ chưa chốt sẽ **thay thế** toàn bộ dữ liệu thô của lần trước sau khi người dùng xác nhận.
- **Liên kết module khác**: Module 4 (trạng thái kỳ), Module 1 (hội sở).
- **Trạng thái**: Đã chốt luồng; chi tiết thay thế/nạp bổ sung đang brainstorm.

#### Tính năng 2.1.2: Đọc & làm sạch dữ liệu
- **Mô tả**: phần quan trọng nhất của bước nạp, vì file thực tế đã hỏng do lỗi định dạng ngôn ngữ của Excel (xem Phụ lục A). Quy tắc:
  1. **Ngày công**: ô có thể là chữ `M/D/YYYY` (ví dụ `8/26/2026`) hoặc ngày thật bị **hoán đổi ngày–tháng** (ngày 01/09 bị lưu thành 09-Jan-2026). Hệ thống thử cả 2 cách đọc (ngày/tháng và tháng/ngày), chỉ nhận cách cho ra ngày **nằm trong kỳ công đã chọn**; thêm bước kiểm tra chuỗi ngày của mỗi nhân viên phải liên tục, đủ ngày, không trùng. Không phân giải được → đánh dấu lỗi dòng, không đoán.
  2. **Giờ vào/ra**: đọc dạng giờ; ô trống = không quẹt; lấy theo phút (bỏ giây).
  3. **Số giờ công 1**: bỏ qua khi tính (có thể là chữ `'7.48'`, số, dấu `-`, ngày bị hỏng như `06/08`, hoặc số vô lý như `6983`); chỉ lưu thô để đối chiếu.
  4. Chuẩn hóa khoảng trắng và ký tự tiếng Việt trong tên (chỉ để hiển thị, không dùng để khớp).
- **Ràng buộc dữ liệu**: một dòng chỉ được giữ khi có mã máy và ngày hợp lệ; dòng có giờ ra nhỏ hơn giờ vào bị đánh dấu cảnh báo (nghi qua đêm/nhầm lượt) và không tự suy đoán.
- **Trạng thái**: Đã chốt hướng xử lý; cần bộ file thật để thử (Module 7).

#### Tính năng 2.1.3: Khớp nhân viên
- **Mô tả**: ghép dòng dữ liệu với nhân viên trong danh mục **theo mã máy** của hội sở.
- **Luồng nghiệp vụ chính**: mã có trong danh mục → ghép; mã **không có** → xếp vào danh sách "Chưa khớp" cùng tên trên máy để Admin bổ sung (Nhân viên chấm công không tự tạo nhân viên); nhân viên có trong danh mục (đang làm) nhưng **không có dòng nào** trong file → cảnh báo "Không có dữ liệu máy" (có thể do Ban Giám Đốc miễn quẹt hoặc nghỉ cả kỳ).
- **Ràng buộc dữ liệu**: tên trên máy khác tên chính thức không phải lỗi; chỉ cảnh báo khi 1 mã máy xuất hiện với 2 tên khác hẳn nhau trong cùng file.
- **Trạng thái**: Đã chốt.

#### Tính năng 2.1.4: Báo cáo kiểm tra sau khi đọc file
- **Mô tả**: bảng tóm tắt trước khi nạp: tổng số dòng, số nhân viên khớp/chưa khớp, số ngày thiếu/thừa so với kỳ, số dòng 1 lượt quẹt, số dòng lỗi định dạng; phân 3 mức **Lỗi (chặn)** / **Cảnh báo (cho qua, có ghi chú)** / **Thông tin**; tải được danh sách chi tiết ra Excel.
- **Ràng buộc dữ liệu**: còn lỗi mức "chặn" thì không nạp được; cảnh báo thì người dùng phải bấm xác nhận.
- **Trạng thái**: Đã chốt.

### Module con 2.2: Ngoại lệ nghỉ phép

#### Tính năng 2.2.1: Nhập ngoại lệ nghỉ phép
- **Mô tả**: các mã `P`, `P/2`, `P/2K`, `BL`, `BL/2`, `N`, `NL`, `K` cần biết **đơn nghỉ đã duyệt** — mà các cột "Loại nghỉ phép/Trạng thái nghỉ phép/Số giờ nghỉ phép/Lý do" trong file MyTime mẫu đều **trống**. Cần một nguồn dữ liệu nghỉ phép riêng.
- **Phương án** (chờ chọn ở Q7): (A) import file Excel nghỉ phép ngoại lệ như file .md mô tả; (B) nhập trực tiếp trên màn hình (chọn nhân viên, ngày, mã, lý do); (C) cả hai.
- **Ràng buộc dữ liệu**: xem "Quy tắc toàn cục — Ngoại lệ nghỉ phép".
- **Liên kết module khác**: Module 3.3.2 (ghép với giờ quẹt), Module 5 (cấn trừ phép).
- **Trạng thái**: **Đang brainstorm**.

---

## Module 3: Engine tính công

Thư viện thuần nghiệp vụ (xem 0.1.2). Đầu vào: dữ liệu quẹt thô + ngoại lệ + lịch + nhân viên + bản chụp tham số/bảng mã. Đầu ra: kết quả công từng ngày + tổng hợp tháng. Các ký hiệu: `S` = giờ vào ca chuẩn (08:00), `E` = giờ ra ca chuẩn (17:00), `IN`/`OUT` = giờ vào/ra theo phút.

### Module con 3.1: Chuẩn bị ngày công

#### Tính năng 3.1.1: Xác định loại ngày và hiệu lực nhân viên
- **Luồng nghiệp vụ chính** (thứ tự ưu tiên, dừng ở bước đầu tiên khớp):
  1. Ngày trước ngày bắt đầu hoặc sau ngày nghỉ việc của nhân viên → **để trống**, không tính công (đếm vào "Nghỉ trừ lương" ở tổng hợp).
  2. Ngày **Nghỉ tuần** theo lịch → để trống (nếu vẫn có quẹt thì ghi cảnh báo "có quẹt vào ngày nghỉ", không tự tính công).
  3. Ngày **Lễ cả ngày** → `L` (1.0 công), kể cả không quẹt.
  4. Ngày **Nghỉ toàn công ty** → áp mã công ty chọn khi khai báo lịch (ví dụ `P` ngày 29/08 trong mẫu) — Đang brainstorm, Q5.
  5. Ngày có **ngoại lệ nghỉ** → Tính năng 3.3.2.
  6. Ngày làm việc bình thường → 3.2 và 3.3.1.
- **Ràng buộc dữ liệu**: ngày Lễ thắng ngoại lệ nghỉ (cảnh báo, không trừ phép).
- **Trạng thái**: Đã chốt thứ tự; Đang brainstorm điểm 4.

### Module con 3.2: Giờ làm & Flexitime

#### Tính năng 3.2.1: Tính số giờ làm hữu dụng
- **Mô tả**: `giờ hữu dụng = (OUT − IN) − phần giao của [IN, OUT] với khung nghỉ trưa (12:00–13:00, dài `LUNCH_BREAK_MINUTES`)`. Chỉ tính được khi có đủ cả 2 lượt quẹt.
- **Ràng buộc dữ liệu**: nghỉ trưa chỉ bị trừ khi khoảng làm việc thật sự chứa giờ nghỉ trưa (người vào 12:48 chỉ bị trừ 12 phút, không trừ 60 phút); khối có nghỉ trưa = 0 thì không trừ.
- **Trạng thái**: **Đang brainstorm** — có 2 cách hiểu "hữu dụng" ảnh hưởng kết quả công (Q1). Phương án A (đang dùng làm mặc định đề xuất): tính thời gian thực tế trừ nghỉ trưa, không cắt theo ca. Phương án B: cắt theo khung ca chuẩn rồi cộng phần bù Flexitime (đây là cách MyTime tính cột "Số giờ công 1").

#### Tính năng 3.2.2: Flexitime & ân hạn
- **Mô tả** (Khối Chuẩn; quy tắc "bù giờ đối xứng" đã chốt trong tài liệu: vào 08:35 thì ra 17:35 được tính đủ 8 tiếng, **1.0 công, 0 phút trễ**):
  1. `trễ_thô = max(0, IN − S)` (phút).
  2. Nếu `trễ_thô ≤ GRACE_PERIOD_MINUTES` (10): **không bị coi là đi trễ**, giờ ra yêu cầu = `E`.
  3. Nếu `GRACE < trễ_thô` và `IN` trong `FLEX_IN_WINDOW` (≤ 08:45) và Flexitime đang bật: giờ ra yêu cầu = `E + trễ_thô`. `OUT ≥` giờ ra yêu cầu → **trễ = 0, sớm = 0**. `OUT <` giờ ra yêu cầu → thiếu giờ (cách ghi phạt: Q2).
  4. Nếu `IN` sau 08:45 hoặc Flexitime tắt: không được bù; phút trễ tính theo Q3; giờ ra yêu cầu = `E`.
  5. `sớm = max(0, giờ ra yêu cầu − OUT)` khi chưa nằm trong trường hợp bù ở bước 3.
- **Ràng buộc dữ liệu**: giờ ra bù không vượt quá cuối `FLEX_OUT_WINDOW` (17:45) vì giờ vào bị chặn ở 08:45.
- **Trạng thái**: Đã chốt nguyên tắc; **Đang brainstorm** Q2, Q3, Q4 (cách ghi phút phạt, vào sớm có bù không).

#### Tính năng 3.2.3: Phút đi trễ / về sớm
- **Mô tả**: mỗi ngày làm việc lưu `phút trễ + phút sớm` (khối 2 của file xuất, từng ngày); tổng tháng `Tổng số phút đi trễ về sớm`, và `Tổng cộng (giờ) = ROUND(tổng phút / 60, 1)` (kiểm chứng trên mẫu: 65 phút → 1.1; 33 → 0.6; 21 → 0.4; dòng Tổng cộng: 119 → 2.0).
- **Ràng buộc dữ liệu**: ngày ra `L`, `P`, `BL`, `K`, `NL`, `N`, `P/2`… không tính phút trễ/sớm của buổi đã nghỉ; ngày có "giờ ca riêng" trong lịch (1.6.1) dùng giờ đó thay cho `S`/`E`.
- **Trạng thái**: Đang brainstorm (Q3).

### Module con 3.3: Phân loại mã công

#### Tính năng 3.3.1: Mã công từ quẹt thẻ (`1`, `0.5`)
- **Luồng nghiệp vụ chính** (ngày làm việc thường, nhân viên Khối Chuẩn, có đủ 2 lượt quẹt):
  - `giờ hữu dụng ≥ MIN_HOURS_FULL_DAY (7.5)` hoặc đạt chuẩn bù giờ Flexitime → mã `1`, 1.0 công.
  - `MIN_HOURS_HALF_DAY (3.5) ≤ giờ hữu dụng < 7.5` → mã `0.5`, 0.5 công.
  - `giờ hữu dụng < 3.5` → xử lý như bất thường `?` (Tính năng 3.3.3).
- **Ràng buộc dữ liệu**: ngày có công `0.5` mà vào rất muộn (ví dụ 12:48) được gắn cảnh báo "Nghi nghỉ nửa buổi — đối chiếu đơn nghỉ" vì thực tế thường là `P/2` (mẫu: Nguyễn Thị Dung 15/09 vào 12:48, bảng mẫu ghi `P/2`).
- **Trạng thái**: Đã chốt ngưỡng; công thức giờ hữu dụng chờ Q1.

#### Tính năng 3.3.2: Kết hợp ngoại lệ nghỉ (`L/2`, `P`, `P/2`, `P/2K`, `BL`, `BL/2`, `N`, `NL`, `K`)
- **Luồng nghiệp vụ chính**:
  - Nghỉ cả ngày (`P`, `BL`, `N`, `NL`, `K`) → gán mã theo đơn, công theo Bảng quy chuẩn; quẹt thẻ trong ngày (nếu có) chỉ để cảnh báo mâu thuẫn.
  - Nghỉ nửa ngày (`L/2`, `P/2`, `BL/2`) → **bắt buộc giờ quẹt thực tế ≥ 3.5h** mới ra 1.0 công (0.5 nghỉ + 0.5 làm); không đủ → cảnh báo, công tạm 0.5.
  - `P/2K`: nghỉ cả ngày nhưng chỉ còn/xin 0.5 phép → 0.5 công hưởng lương, trừ 0.5 phép; hệ thống **gợi ý** `P/2K` khi nhân viên xin `P` mà quỹ phép còn đúng 0.5 (người dùng xác nhận).
  - Xin `P` khi quỹ phép = 0 → cảnh báo và gợi ý đổi mã (cách xử lý: Q8).
- **Ràng buộc dữ liệu**: ngoại lệ không có đơn duyệt thì không được áp dụng; xem thêm quy tắc toàn cục.
- **Liên kết module khác**: Module 5 (mỗi ngoại lệ phát sinh một dòng cấn trừ phép).
- **Trạng thái**: Đang brainstorm (phụ thuộc Q7, Q8, Q12).

#### Tính năng 3.3.3: Ca bất thường (`?` / `V`)
- **Luồng nghiệp vụ chính**: ngày làm việc, nhân viên đang hiệu lực, không có ngoại lệ:
  - **Không có lượt quẹt nào** → `V` (vắng).
  - **Chỉ 1 lượt quẹt** (chỉ vào hoặc chỉ ra) → `?` (theo `MISSING_PUNCH_POLICY` = "Gán cảnh báo").
  - Cả 2 loại đều được đưa vào **Danh sách giải trình** để nhân viên chấm công xử lý (chọn mã đúng, kèm lý do).
- **Ràng buộc dữ liệu**: công tạm tính của `?`/`V` là 0.0 hoặc 0.5 — chọn bằng một tham số mới `MISSING_PUNCH_PROVISIONAL_VALUE` (Q11 đề xuất, mặc định 0.0); không có `?`/`V` nào được tồn tại khi chốt kỳ (xem 4.1.2).
- **Trạng thái**: Đã chốt mã và danh sách giải trình; Đang brainstorm giá trị tạm tính.

### Module con 3.4: Xử lý theo khối nhân viên

#### Tính năng 3.4.1: Khối Part-time / Tạp vụ
- **Mô tả**: ca theo đăng ký tuần, nghỉ trưa 0 nếu ca < 5h, ân hạn 10 phút, không Flexitime, không OT, không tính công theo ngày. Mẫu có ghi chú trả theo giờ ("30k/h") và "TTS: 3 ngày/tuần, 2tr/tháng".
- **Trạng thái**: **Đang brainstorm** — cột Part-time trong bảng tham số có nhiều giá trị dạng chữ ("Theo ca đăng ký", "Không tính ngày") chưa đủ để máy tính: cần biết ca đăng ký lấy từ đâu và công/giờ làm tính ra sao (Q12/Q10).

#### Tính năng 3.4.2: Khối Remote / Online
- **Mô tả**: tính theo Task (hoàn thành Task ngày = 1 công; 50% Task = 0.5), OT theo duyệt giám đốc, nghỉ Thứ 7.
- **Trạng thái**: **Đang brainstorm** — không có dữ liệu Task trong file MyTime; cần quyết định có nhập tay % hoàn thành Task hay bỏ khỏi giai đoạn 1 (Q12).

#### Tính năng 3.4.3: Nhân viên miễn quẹt thẻ
- **Mô tả**: nhân viên có cờ "Miễn quẹt thẻ" (ví dụ Ban Giám Đốc, không có trên máy) tự nhận `1` mỗi ngày làm việc theo lịch, `L` ngày lễ; vẫn nhận ngoại lệ nghỉ như bình thường.
- **Trạng thái**: Đang brainstorm (Q9 — suy ra từ mẫu: các dòng QL01, QL02, QL03 có công đủ mà không có trong file máy).

### Module con 3.5: Làm thêm giờ (OT)

#### Tính năng 3.5.1: Tính phút OT
- **Mô tả**: tham số `OT_TRIGGER_THRESHOLD_MIN` = 30: chỉ khi làm quá giờ ra yêu cầu từ 30 phút trở lên mới ghi nhận OT.
- **Ràng buộc dữ liệu**: Part-time/Tạp vụ không tính OT; Remote theo duyệt.
- **Trạng thái**: **Đang brainstorm** — mẫu Output **không có cột OT** và chưa có quy tắc quy đổi/giá trị OT (Q11). Mặc định đề xuất: tính và lưu phút OT, hiển thị ở màn hình chi tiết ngày, chưa đưa vào file xuất.

### Module con 3.6: Tổng hợp tháng

#### Tính năng 3.6.1: Các cột tổng của bảng chấm công
- **Mô tả**: định nghĩa các cột tổng (suy ra từ mẫu, đã kiểm chứng trên nhiều dòng):
  - `Số ngày làm ca 1, HC` (cột H) = số ngày làm việc thực tế: mỗi mã `1` = 1; mỗi mã `0.5` = 0.5; mỗi mã nửa ngày `P/2`, `L/2`, `BL/2` góp phần làm = 0.5.
  - `Ngày lễ` (I) = số ngày `L` (+ 0.5 cho mỗi `L/2`).
  - `Số ngày công làm việc` (J) = H.
  - `Nghỉ phép năm` (K) = số ngày `P` + `BL` (+ 0.5 cho mỗi `P/2`, `P/2K`, `BL/2`) — **bù được hiển thị là `P` trong mẫu**, xem Q8.
  - `Nghỉ hưởng lương` (L) = số ngày `K` (+ `NL` nếu Q12 giữ 1.0 công).
  - `Số ngày công tính lương` (N) = H + I + K + L (kiểm chứng: 21 + 2 + 2 = 25; 21.5 + 2 + 1.5 = 25).
  - `Nghỉ trừ lương` (M) = `Số ngày làm việc tháng − N`, không âm (kiểm chứng: nhân viên mới vào 9 công → 25 − 9 = 16).
  - Các cột ca đêm CN / ca 3 / ca 2 (E, F, G) giữ nguyên trong mẫu nhưng giai đoạn 1 chỉ có ca hành chính → để 0.
  - Cột Ghi chú: lấy từ ghi chú nhân viên + ghi chú nhập tay của kỳ.
- **Liên kết module khác**: Module 6 — các cột này xuất bằng công thức Excel (6.1.3).
- **Trạng thái**: Đang brainstorm (Q8, Q12); phần còn lại đã chốt.

---

## Module 4: Kỳ công & quy trình xử lý

Nhân viên chấm công làm việc ở đây: tạo kỳ, xem kết quả, xử lý cảnh báo, chốt.

### Module con 4.1: Quản lý kỳ công

#### Tính năng 4.1.1: Danh sách và tạo kỳ công
- **Mô tả**: danh sách kỳ công của các hội sở được gán (tháng, trạng thái, số cảnh báo còn lại); tạo kỳ mới: chọn hội sở + tháng/năm → hệ thống tự điền khoảng ngày, đếm số ngày làm việc chuẩn từ lịch, chụp tham số và bảng mã.
- **Ràng buộc dữ liệu**: xem "Thực thể: Kỳ công"; không tạo được kỳ nếu lịch làm việc của khoảng ngày đó chưa khai báo đủ (báo Admin).
- **Trạng thái**: Đã chốt.

#### Tính năng 4.1.2: Trạng thái & chốt kỳ
- **Mô tả**: chốt kỳ để khóa kết quả.
- **Luồng nghiệp vụ chính**: Nháp → (nạp file) Đã nạp dữ liệu → (tính công) Đã tính → (chốt) Đã chốt. Mở chốt: chỉ Admin, nhập lý do.
- **Ràng buộc dữ liệu**: **không chốt được khi còn ngày mang mã `?` hoặc `V` chưa giải trình, hoặc còn nhân viên "Chưa khớp"**; chốt xong không còn nút nạp, tính lại, sửa tay; mọi thao tác ghi nhật ký.
- **Trạng thái**: Đang brainstorm (đề xuất quy trình; chờ Q16).

### Module con 4.2: Xem & điều chỉnh kết quả

#### Tính năng 4.2.1: Lưới bảng chấm công
- **Mô tả**: màn hình dạng lưới giống mẫu: hàng = nhân viên, cột = ngày (kèm thứ T2…CN), ô = mã công tô màu theo Bảng quy chuẩn; bấm vào ô xem chi tiết (giờ vào/ra thô, giờ hữu dụng, phút trễ/sớm, cảnh báo, nguồn, lịch sử sửa); lọc theo bộ phận, khối, cảnh báo.
- **Trạng thái**: Đã chốt.

#### Tính năng 4.2.2: Sửa tay có lý do
- **Mô tả**: đổi mã công của một ô hoặc nhập ghi chú; bắt buộc nhập lý do; chỉ chọn trong các mã của Bảng quy chuẩn.
- **Ràng buộc dữ liệu**: xem "Kết quả công ngày"; sửa tay sang mã trừ phép thì tự cập nhật sổ cái phép (nếu Module 5 bật); kỳ đã chốt không sửa.
- **Trạng thái**: Đang brainstorm.

#### Tính năng 4.2.3: Danh sách cảnh báo & giải trình
- **Mô tả**: gom mọi cảnh báo: `?`/`V`, nghi nghỉ nửa buổi, quẹt ngày nghỉ, mâu thuẫn đơn nghỉ–quẹt, nghi đi muộn bất thường, nhân viên không có dữ liệu máy; mỗi dòng có hành động "Chọn mã đúng + lý do". Xuất danh sách ra Excel để in giải trình.
- **Trạng thái**: Đã chốt.

#### Tính năng 4.2.4: Tính lại
- **Mô tả**: chạy lại engine cho cả kỳ hoặc một nhân viên sau khi bổ sung ngoại lệ, đổi lịch, đổi tham số.
- **Ràng buộc dữ liệu**: mặc định giữ nguyên các ô sửa tay; có lựa chọn "bỏ chỉnh sửa tay"; luôn hiển thị số ô sẽ đổi trước khi áp dụng.
- **Trạng thái**: Đang brainstorm.

---

## Module 5: Quỹ phép & sổ cái phép

Theo dõi và cấn trừ quỹ phép lũy kế (tiêu đề sheet `Tổng quan` và mục tiêu số 4 của file .md). **Phạm vi giai đoạn 1 chưa được xác nhận** (Q8).

### Module con 5.1: Quỹ phép

#### Tính năng 5.1.1: Khởi tạo quỹ phép
- **Mô tả**: nhập quỹ phép năm, phép tồn năm trước, quỹ bù cho từng nhân viên; phép thâm niên tự cộng theo quy định (tham số hóa, không viết cứng).
- **Ràng buộc dữ liệu**: quỹ không âm; mỗi nhân viên mỗi năm một bản ghi quỹ.
- **Trạng thái**: Đang brainstorm.

#### Tính năng 5.1.2: Cấn trừ phép tự động
- **Mô tả**: mỗi kết quả `P`, `P/2`, `P/2K`, `BL`, `BL/2` tạo một dòng trừ trong sổ cái. Theo file .md, thứ tự trừ là **phép bù sự kiện → phép tồn năm trước → phép năm hiện tại**; theo Bảng quy chuẩn, `BL` trừ "Quỹ bù". Hai chỗ này chưa khớp nhau hoàn toàn nên cần chốt thứ tự thực tế (Q8).
- **Ràng buộc dữ liệu**: quỹ không được âm sau cấn trừ; sửa/xóa ngoại lệ thì dòng sổ cái tương ứng được hoàn lại; kỳ đã chốt thì sổ cái của kỳ đó bị khóa theo.
- **Trạng thái**: Đang brainstorm.

#### Tính năng 5.1.3: Báo cáo số phép còn lại
- **Mô tả**: bảng số dư theo nhân viên (đầu kỳ, đã dùng trong kỳ, còn lại) xuất Excel.
- **Trạng thái**: Đang brainstorm.

---

## Module 6: Xuất báo cáo Excel

### Module con 6.1: File Bảng chấm công (BCC)

Một file `.xlsx`, **một sheet**, gồm **2 khối xếp dọc** đúng như sheet `Ouput` của file mẫu (khối 2 bắt đầu cách khối 1 đúng 2 dòng trống, vị trí phụ thuộc số nhân viên).

#### Tính năng 6.1.1: Khối 1 — Bảng chấm công
- **Mô tả**: cấu trúc theo mẫu:
  - Dòng 1: tên hội sở (viết hoa). Dòng 2: `BẢNG CHẤM CÔNG THÁNG mm/yyyy`; ô `Số ngày làm việc tháng` và giá trị (mẫu: 25) ở góc phải.
  - 3 dòng tiêu đề: tên cột + ngày (`dd/mm`) · thứ (`T2…T7, CN`) · số thứ tự cột (1…44).
  - Cột: STT · Mã NV · Họ và tên · BP · Ca đêm CN (C) · Số ngày làm ca 3 (D) · Số ngày làm ca 2 (II) · Số ngày làm ca 1, HC · Ngày lễ · Số ngày công làm việc · Nghỉ phép năm · Nghỉ hưởng lương · Nghỉ trừ lương · Số ngày công tính lương · **các cột ngày của kỳ (tối đa 31, mẫu 26/08 → 25/09)** · Ghi chú.
  - Ô ngày: số `1`/`0.5` (định dạng `0.00`) hoặc mã chữ (`L`, `P`, `P/2`…) tô màu theo Bảng quy chuẩn; ngày không làm việc/không hiệu lực để trống.
  - Dòng cuối: tổng theo cột.
- **Trạng thái**: Đã chốt cấu trúc.

#### Tính năng 6.1.2: Khối 2 — Bảng đi trễ về sớm
- **Mô tả**: cấu trúc theo mẫu: tên hội sở · `BẢNG CHẤM ĐI TRỄ VỀ SỚM THÁNG mm/yyyy` · cột STT · Mã NV · Họ và tên · Bộ phận · Tổng trừ · Phạt khác · Trừ đi trễ về sớm · Tổng thu nhập · Tổng cộng (giờ) · Tổng số phút đi trễ về sớm · **các cột ngày (phút trễ+sớm từng ngày; trống nếu 0)**; dòng `Tổng Cộng` tô xanh; tiêu đề cột tô vàng.
- **Ràng buộc dữ liệu**: danh sách nhân viên và thứ tự **giống hệt khối 1** (mẫu hiện đang lệch: khối 2 có 4 người không có ở khối 1).
- **Trạng thái**: Đã chốt cấu trúc; Đang brainstorm 4 cột tiền `Tổng trừ/Phạt khác/Trừ đi trễ về sớm/Tổng thu nhập` (Q10): hiện chưa có dữ liệu lương trong phần mềm, đề xuất để trống ở giai đoạn 1.

#### Tính năng 6.1.3: Công thức & định dạng
- **Mô tả**: file xuất dùng **công thức Excel** cho mọi cột tổng để người dùng sửa một ô công là các cột tổng tự cập nhật (mục tiêu "kèm công thức tự động" trong file .md). Mẫu hiện có tất cả giá trị dạng **chữ** (`'22.0'`) và không có công thức; file xuất mới phải là **số thật**.
  - Công thức gợi ý: `H = COUNTIF(ô ngày,"1") + 0.5*COUNTIF(ô ngày,"0.5")`… viết chính xác theo định nghĩa 3.6.1; `N = H + I + K + L`; `M = MAX(0, Số ngày làm việc tháng − N)`; khối 2: `Tổng số phút = SUM(các ô ngày)`, `Tổng cộng (giờ) = ROUND(Tổng phút/60,1)`, dòng tổng dùng `SUM`.
  - Dùng định dạng có điều kiện tô màu mã ký hiệu để sửa tay mã vẫn đổi màu.
  - Font Nunito Sans toàn file; đóng băng dòng tiêu đề và 3 cột đầu; in ngang khổ A3/A4 vừa 1 trang rộng.
  - Mở file không báo lỗi công thức, giá trị đã được tính sẵn khi mở.
- **Trạng thái**: Đang brainstorm cách đúng của từng công thức (phụ thuộc Q8/Q12).

### Module con 6.2: Báo cáo phụ

#### Tính năng 6.2.1: Danh sách giải trình & báo cáo kiểm tra import
- **Mô tả**: xuất Excel danh sách `?`/`V` và các cảnh báo (nguồn 4.2.3) và báo cáo kiểm tra sau import (2.1.4).
- **Trạng thái**: Đã chốt.

#### Tính năng 6.2.2: Tên file và lịch sử xuất
- **Mô tả**: tên mặc định `BCC_<mãHộiSở>_<yyyy>-<mm>.xlsx`; lưu lịch sử mỗi lần xuất (ai, lúc nào, kỳ ở trạng thái nào); file xuất trước khi chốt có chữ "NHÁP" ở góc trên.
- **Trạng thái**: Đang brainstorm.

---

## Module 7: Kiểm thử & triển khai

#### Tính năng 7.1: Bộ kiểm thử engine
- **Mô tả**: kiểm thử tự động cho từng quy tắc Module 3 bằng bộ ca mẫu ở Phụ lục C (kết quả mong đợi do chủ dự án xác nhận), cộng bộ kiểm thử làm sạch ngày/giờ của Module 2.1.2.
- **Ràng buộc dữ liệu**: **bảng Output mẫu không được dùng làm đáp án đúng** (xem Phụ lục A, mục 9).
- **Trạng thái**: Đang brainstorm.

#### Tính năng 7.2: Chạy thử song song và nghiệm thu
- **Mô tả**: chạy phần mềm với dữ liệu 1–2 kỳ thật, so với bảng chấm công làm tay, ghi nhận chênh lệch và lý do; nghiệm thu khi chênh lệch đều giải thích được bằng quy tắc.
- **Trạng thái**: Chưa bắt đầu.

#### Tính năng 7.3: Hướng dẫn sử dụng & triển khai
- **Mô tả**: tài liệu ngắn cho Admin (cấu hình lần đầu) và Nhân viên chấm công (4 bước); hướng dẫn cài đặt/sao lưu cơ sở dữ liệu.
- **Trạng thái**: Chưa bắt đầu.

---

## Phụ lục A — Phát hiện từ file mẫu (cần xử lý trong thiết kế)

1. **Ngày công bị hỏng định dạng**: lẫn chữ `M/D/YYYY` và ngày bị hoán đổi ngày–tháng (01/09 lưu thành 09-Jan). → Quy tắc phục hồi ở 2.1.2.
2. **"Số giờ công 1" không đáng tin**: chữ (`'7.48'`), số, dấu `-`, ngày hỏng (`6.08` → 06/08, `7.02` → 07/02) và giá trị vô lý (`6983`). Kiểm tra trên các dòng đọc được cho thấy cột này = phần giao giữa [giờ vào, giờ ra] và hai buổi của ca chuẩn (08–12, 13–17), **không có bù Flexitime và không tính phần vào sớm** (ví dụ 08:31→17:35 ra 7.48; 06:59→15:57 ra 6.95). → App tự tính lại từ giờ vào/ra.
3. **Tên trên máy ≠ tên chính thức** (Son Ha Le ↔ Lê Quốc Sơn Hà; Le Thuy NT ↔ Nguyễn Thị Lệ Thủy; mã 89 là "Hoàng Thạch Tĩnh" trên máy nhưng "Nguyễn Thị Minh" trong bảng Output). → Khớp theo mã máy, danh mục nhân viên là nguồn duy nhất.
4. **Nhân viên có trong Output nhưng không có trong Input** (QL01–QL03, DV01…). → Cờ "Miễn quẹt thẻ" (Q9).
5. **Nhân viên không quẹt cả kỳ** (mã 79) và nhân viên vào giữa kỳ (mã 88 từ 14/09; mã 89 từ 16/09). → Hiệu lực nhân viên theo ngày bắt đầu/nghỉ việc.
6. Các cột **Loại nghỉ phép / Trạng thái nghỉ phép / Số giờ nghỉ phép / Lý do** trong Input mẫu **đều trống**. → Cần nguồn nghỉ phép riêng (2.2.1).
7. **Quy luật Thứ 7 không đơn giản**: 29/08 ghi `P` cho toàn bộ nhân viên; 05/09 và 12/09 đa số làm cả ngày (1.0, không phải 0.5 như `SATURDAY_WORK_POLICY`); 19/09 không ai làm; 31/08 (Thứ 2) để trống toàn bộ. → Lịch làm việc khai báo từng ngày (1.6.1, Q5).
8. **Ngày 25/09**: nhiều nhân viên ra khoảng 15:45–16:00 nhưng bảng mẫu không có phạt về sớm và vẫn 1.00 → có thể là ngày giờ ca khác (sự kiện/về sớm). → Khai báo "giờ ca riêng" trong lịch.
9. **Bảng Output mẫu chưa khớp quy tắc mới**: nhiều người vào 08:04–08:07 vẫn bị tính 4–7 phút trễ dù ân hạn 10 phút; không thấy bù giờ Flexitime. → Output mẫu dùng để lấy **định dạng/cấu trúc**, không phải đáp án số liệu.
10. **Output mẫu lưu số dạng chữ** và vài ô bị Excel đổi thành ngày (`21.5` → 21-May, `1.5` → 01-May); **không có công thức**; hàng nhân viên khối 2 khác khối 1.
11. **Bảng tham số**: ô `MIN_HOURS_FULL_DAY` và `MIN_HOURS_HALF_DAY` bị đổi thành ngày (đọc đúng là 7.5 và 3.5).
12. Cột **Ghi chú** của Output chứa nghiệp vụ nhập tay: thử việc có ngày, thực tập 3 ngày/tuần, trả theo giờ, phép bù sự kiện, "ngày cuối làm việc nên cộng phép năm" (nghỉ việc giữa kỳ). → Ghi chú nhập tay trong 4.2.1; xử lý nghỉ việc giữa kỳ ghi vào Q8.

## Phụ lục B — Bảng tóm tắt thứ tự gán mã trong một ngày

1. Ngoài hiệu lực nhân viên → trống.
2. Nghỉ tuần → trống.
3. Lễ cả ngày → `L`.
4. Nghỉ toàn công ty → mã công ty chọn.
5. Có ngoại lệ → mã đơn (nửa ngày kèm quẹt ≥ 3.5h).
6. Miễn quẹt → `1`.
7. Không quẹt → `V`; 1 lượt quẹt → `?`.
8. Đủ 2 lượt quẹt → `1` / `0.5` / `?` theo ngưỡng; kèm tính phút trễ/sớm.

## Phụ lục C — Bộ ca kiểm thử mẫu (lấy từ file Input; kết quả là **đề xuất**, chờ chủ dự án xác nhận)

Giả định cho cột kết quả: Phương án A (Q1), phạt phần thiếu (Q2), phạt toàn bộ phút trễ khi không được bù (Q3).

| # | Trường hợp (nhân viên, ngày, vào–ra) | Mã | Công | Phút trễ+sớm | Ghi chú cần chốt |
|---|---|---|---|---|---|
| 1 | Lê Quốc Sơn Hà, 07/09, 08:31–17:35 | `1` | 1.0 | 0 | Ví dụ bù giờ đối xứng đúng như tài liệu |
| 2 | Lê Quốc Sơn Hà, 08/09, 08:46–17:34 | `1` | 1.0 | 46 | Vào sau 08:45, không được bù; mẫu Output ghi 0 phút |
| 3 | Lê Quốc Sơn Hà, 14/09, 08:29–19:20 | `1` | 1.0 | 0 | Có OT (Q11) |
| 4 | Lê Quốc Sơn Hà, 22/09, 09:49–17:50 | `0.5` | 0.5 | 109 | Vừa giảm công vừa phạt phút trễ? (Q3) |
| 5 | Nguyễn Đoan Thục, 17/09, 11:23–17:32 | `0.5` | 0.5 | 203 | Nghi nghỉ sáng; cần đơn nghỉ |
| 6 | Nguyễn Thị Dung, 15/09, 12:48–18:20, không có đơn | `0.5` | 0.5 | 288 | Cảnh báo nghi `P/2` |
| 7 | Như dòng 6 nhưng có đơn `P/2` | `P/2` | 1.0 | 0 | Trừ 0.5 phép |
| 8 | Nguyễn Thị Lệ Thủy, 21/09, chỉ có giờ vào 07:34 | `?` | 0 (tạm) | — | Vào danh sách giải trình |
| 9 | Nguyễn Thị Thu Nga, 25/09, chỉ có giờ ra 16:00 | `?` | 0 (tạm) | — | Như trên |
| 10 | Hồ Thùy Linh (mã 80), 25/09, 06:34–15:42 | `1` | 1.0 | 78 | Nếu lịch không khai báo giờ ca riêng ngày 25/09 sẽ bị phạt sớm; mẫu không phạt |
| 11 | Mã 79 (Thùy Linh ĐT), mọi ngày không quẹt | `V` mỗi ngày làm việc | 0 | — | Hay là nhân viên chưa hoạt động? (khai báo ngày nghỉ việc) |
| 12 | Bất kỳ ai, ngày 01–02/09 (Lễ) | `L` | 1.0 | 0 | Kể cả không quẹt |
| 13 | Nhân viên mới (mã 88), các ngày trước 14/09 | trống | — | — | Tính vào "Nghỉ trừ lương" |
| 14 | File có ngày lưu `09-Jan-2026` trong kỳ 26/08–25/09 | đọc thành 01/09 | — | — | Kiểm thử làm sạch ngày |

---

## Điểm cần chốt (Open Questions)

| # | Câu hỏi | Phương án / gợi ý | Ảnh hưởng |
|---|---|---|---|
| Q1 | "Giờ làm hữu dụng" tính thế nào? | **A**: (ra − vào) trừ nghỉ trưa, không cắt theo ca (phù hợp cụm "làm việc thực tế" trong bảng mã). **B**: cắt theo khung ca chuẩn + bù Flexitime (cách của cột MyTime). Khác nhau ở người vào sớm và người vào muộn nhưng ở lại muộn (ví dụ vào 09:00 ra 18:30: A = 8.5h → 1.0 công; B = 7.0h → 0.5 công) | 3.2.1, 3.3.1 |
| Q2 | Vào trong khung linh hoạt nhưng ra không đủ bù, phạt bao nhiêu? | **A**: chỉ phần thiếu (vào 08:35, ra 17:20 → 15 phút). **B**: toàn bộ phút trễ (35 phút) | 3.2.2, khối 2 |
| Q3 | Cách tính phút trễ khi không được bù (vào sau ân hạn hoặc sau 08:45) | Tính từ 08:00 (toàn bộ) hay chỉ phần vượt 10 phút ân hạn? Ngày đã giảm còn `0.5` công có còn phạt phút trễ nữa không? | 3.2.2, 3.2.3 |
| Q4 | Vào sớm (trước 08:00) có được bù cho về sớm không? | Mặc định đề xuất: không | 3.2.2 |
| Q5 | Cách khai báo Thứ 7 và ngày nghỉ toàn công ty | Khai báo từng ngày trong lịch (đề xuất) thay vì chỉ một tham số `SATURDAY_WORK_POLICY`? Ngày nghỉ toàn công ty áp mã nào (`P`, `BL`, `K`)? | 1.6.1, 3.1.1 |
| Q6 | Kỳ công cố định 26 → 25? "Số ngày làm việc tháng" (25) tính từ lịch hay nhập tay? | Đề xuất: ngày bắt đầu là tham số hội sở, số ngày tính từ lịch có cho sửa tay | Thực thể Kỳ công |
| Q7 | Nguồn dữ liệu nghỉ phép: file ngoại lệ, nhập tay hay cả hai? Định dạng file ngoại lệ? | Xem 2.2.1 | Module 2.2, 3.3.2 |
| Q8 | Quỹ phép có làm trong giai đoạn 1 không? Thứ tự trừ; quỹ hết thì sao; nghỉ việc giữa kỳ cộng phép thế nào; `BL` hiện thành `P` trên file hay giữ `BL` | Xem Module 5 | Module 5, 3.3.2, 3.6.1 |
| Q9 | Ban Giám Đốc (không có trên máy) tự động 1.0 công mỗi ngày làm việc? | Đề xuất cờ "Miễn quẹt thẻ" | 3.4.3 |
| Q10 | Cột tiền (`Tổng trừ`, `Phạt khác`, `Trừ đi trễ về sớm`, `Tổng thu nhập`) và đơn giá giờ cho tạp vụ (30k/h) | Giai đoạn 1 để trống, hay khai báo lương nhân viên? | 6.1.2, 3.4.1 |
| Q11 | OT: có tính, hiển thị ở đâu (file mẫu chưa có cột)? Giá trị công tạm tính của `?`/`V` là 0 hay 0.5? | Đề xuất: lưu OT, chưa xuất; tạm tính 0.0 | 3.5.1, 3.3.3 |
| Q12 | Mâu thuẫn/thiếu trong bảng mã và tham số: `NL` "không hưởng lương" nhưng ghi 1.0 công; khối Part-time/Remote có giá trị dạng chữ chưa tính được (ca đăng ký, Task) | Cần quyết định `NL` = 0 hay 1.0; Part-time/Remote làm đầy đủ ở giai đoạn 1 hay để sau | 1.4.1, 3.4.1, 3.4.2 |
| Q13 | Chốt: output **1 sheet 2 khối** (theo yêu cầu mới) và Output mẫu **chỉ dùng làm mẫu định dạng, không làm đáp án** | Cần 1–2 kỳ có kết quả đã duyệt bằng tay để làm bộ test | 6.1, 7.1 |
| Q14 | Môi trường: còn bắt buộc Windows Server 2012 R2 + SQL Server 2008? Chọn nền tảng lập trình | **A**: .NET Framework 4.8 + SQL Server 2008 (chắc chắn chạy trên Server 2012 R2). **B**: nền tảng .NET hiện đại (cần kiểm tra OS hỗ trợ) + SQL Server đời mới hơn. Giao diện web chạy trong mạng nội bộ | Module 0 |
| Q15 | Phân quyền: Admin có được tự tính công không; có cần vai trò "Người xem/Người duyệt"? Dự kiến bao nhiêu người dùng/hội sở? | Hiện chỉ 2 vai trò theo yêu cầu | 1.1 |
| Q16 | Quy trình chốt kỳ: cần người duyệt trước khi chốt không? Ai được mở chốt? | Đề xuất: Nhân viên chấm công chốt, Admin mở chốt | 4.1.2 |

---

## Nhật ký thay đổi

| Ngày | Module/Tính năng | Nội dung thay đổi |
|---|---|---|
| 2026-10-04 | Toàn bộ | Khởi tạo bản kế hoạch v0.1 từ file Excel mẫu, file .md ban đầu và yêu cầu bổ sung: 8 module (0–7), 16 điểm cần chốt, 3 phụ lục |
