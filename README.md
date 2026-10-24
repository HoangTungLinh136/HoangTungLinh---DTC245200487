# QUIZSYSTEM — HỆ THỐNG QUIZ & THI TRẮC NGHIỆM TRỰC TUYẾN
## ĐỀ TÀI SỐ 35 — BÀI TẬP THỰC HÀNH THIẾT KẾ & QUẢN TRỊ HỆ THỐNG PHẦN MỀM (K23)

- **Sinh viên thực hiện:** Hoàng Tùng Linh
- **Mã sinh viên:** DTC245200487
- **Mã đề tài:** Đề tài 35: Hệ thống Quiz / Thi trắc nghiệm
- **Repository GitHub:** [https://github.com/HoangTungLinh136/HoangTungLinh---DTC245200487.git](https://github.com/HoangTungLinh136/HoangTungLinh---DTC245200487.git)
- **Môi trường phát triển:** Windows 11 + Docker Desktop
- **Môi trường triển khai:** Ubuntu Server (VMware) / Docker Compose

---

## 1. TỔNG QUAN HỆ THỐNG & CÔNG NGHỆ

Hệ thống **QuizSystem** được xây dựng nhằm phục vụ nhu cầu tổ chức thi trắc nghiệm trực tuyến chuẩn hoá, hỗ trợ đa vai trò (Quản trị viên, Giảng viên, Sinh viên) với cơ chế bảo mật nghiêm ngặt, chấm điểm tất-cả-hoặc-không (All-or-Nothing), lưu nháp chịu lỗi, và hạ tầng giám sát vận hành toàn diện (Observability).

### Công Nghệ Sử Dụng

| Thành phần | Công nghệ | Phiên bản / Chi tiết |
| :--- | :--- | :--- |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript | Giao diện hiện đại, responsive, không phụ thuộc framework nặng |
| **Backend API** | Node.js + Express | RESTful API, bảo mật Session/Cookie, Rate Limiting, Prom-client |
| **Cơ sở dữ liệu** | MySQL 8.0 (InnoDB) | Schema chuẩn hoá 12 bảng, ACID Transactions, Generated Columns |
| **Quản trị CSDL** | phpMyAdmin | Quản trị giao diện Web trực quan qua cổng 8081 |
| **Reverse Proxy** | Nginx Alpine | Cân bằng tải, reverse proxy `/api` và phục vụ frontend tĩnh, HTTP Security Headers |
| **Metrics Monitoring**| Prometheus | Thu thập số liệu hiệu năng backend và hệ thống định kỳ mỗi 5s |
| **Trực quan hoá Dashboard** | Grafana | Dashboard dựng sẵn giám sát RPS, Latency p95, Active Attempts, RAM |
| **Thu thập & Lưu trữ Log** | Loki + Promtail | Ghi nhận log truy vấn và lỗi tập trung, hỗ trợ truy vấn LogQL |
| **Email phát triển** | Mailpit | Giả lập máy chủ SMTP và giao diện WebMail xem email reset password |
| **Điều phối Container** | Docker Compose | Tự động hóa khởi chạy 9 dịch vụ qua 1 lệnh duy nhất |

---

## 2. KIẾN TRÚC & CƠ CHẾ NGHIỆP VỤ BẮT BUỘC

1. **BD-01 (Đăng ký tài khoản):** Sinh viên và Giảng viên được phép tự đăng ký tài khoản, kích hoạt ngay lập tức mà không cần mã mời hay duyệt thủ công.
2. **BD-02 & TC-01 (Phân quyền Admin Option B):** Quản trị viên chỉ có quyền quản trị tài khoản (khóa/mở khóa/đổi vai trò), xem nhật ký kiểm toán và siêu dữ liệu thống kê tổng hợp (aggregates). Admin **tuyệt đối không** có quyền xem nội dung đề thi, đáp án hay điểm số cá nhân của sinh viên.
3. **BD-03 (Tính bất biến của đề thi - Exam Immutability):** Đề thi một khi đã có lượt làm bài sẽ không thể bị sửa đổi câu hỏi hay trọng số. Giáo viên muốn cập nhật phải sử dụng tính năng **Nhân bản (Clone)** sang đề thi phiên bản mới.
4. **BD-04 (Chấm điểm câu hỏi nhiều đáp án - All-or-Nothing):** Câu hỏi nhiều đáp án chỉ được tính điểm trọn vẹn khi sinh viên chọn chính xác toàn bộ tập hợp đáp án đúng. Thiếu hoặc thừa bất kỳ phương án nào sẽ nhận 0 điểm.
5. **BD-05 (Lưu nháp & Ngoại tuyến):** Trình duyệt lưu đệm câu trả lời và tự động gửi đồng bộ lên máy chủ. Thời điểm ghi nhận hợp lệ do máy chủ xác thực theo Deadline.
6. **BD-06 (Công bố điểm & Đáp án độc lập):** Giảng viên có quyền bật/tắt hiển thị Điểm và hiển thị Đáp án chi tiết độc lập với nhau. Khi chưa công bố, API sẽ che giấu dữ liệu để đảm bảo tính công bằng.
7. **BD-07 (Tự động chốt bài thi):** Tiến trình nền tự động quét và chốt bài thi hết hạn, tính điểm an toàn (idempotent).
8. **BD-08 (Công thức quy đổi điểm chuẩn hoá):** Trọng số dương, tính toán số học nguyên quy đổi sang thang điểm 10 với 2 chữ số thập phân:
   $$\text{score\_hundredths} = \left\lfloor \frac{2000 \cdot R + M}{2 \cdot M} \right\rfloor, \quad \text{score} = \frac{\text{score\_hundredths}}{100}$$
9. **BD-09 (Giới hạn lượt thi & Resume):** Mỗi sinh viên chỉ có tối đa 1 lượt thi đang diễn ra (`in_progress`). Nếu bị ngắt kết nối hoặc thoát ra, sinh viên có thể quay lại làm tiếp trong thời gian còn lại.
10. **BD-10 (Phân loại đề thi):** Hỗ trợ cả 2 hình thức: Đề thi tự do (Public) và Đề thi chỉ định theo danh sách lớp (Assigned).
11. **BD-11 (Khôi phục mật khẩu):** Sử dụng mã Token ngẫu nhiên 32-byte an toàn mã hóa SHA-256, hết hạn sau 15 phút, sử dụng 1 lần duy nhất và gửi qua Mailpit.
12. **BD-12 (Snapshot đề thi):** Ngay khi sinh viên bắt đầu thi, toàn bộ nội dung câu hỏi, phương án và trọng số được chụp ảnh (Snapshot) cố định vào lượt thi, đảm bảo bài làm không bị sai lệch nếu ngân hàng đề có thay đổi sau đó.
13. **TC-Deadline (Option A):** Hạn chót bài thi được tính tuyệt đối:
    $$D = \min(\text{started\_at} + \text{duration\_minutes}, \text{exam.end\_time})$$

---

## 3. DANH MỤC CỔNG DỊCH VỤ & URL TRUY CẬP

Khi hệ thống khởi động qua Docker Compose, các dịch vụ sẵn sàng tại các cổng sau:

| Dịch vụ | Cổng Host | URL Truy Cập | Mục đích |
| :--- | :--- | :--- | :--- |
| **Nginx Web Portal** | `80` | [http://localhost](http://localhost) | Cổng chính ứng dụng QuizSystem |
| **Backend API Direct** | `3000` | [http://localhost:3000/health](http://localhost:3000/health) | API trực tiếp & Endpoint kiểm tra sức khỏe |
| **phpMyAdmin** | `8081` | [http://localhost:8081](http://localhost:8081) | Giao diện quản trị cơ sở dữ liệu MySQL |
| **Grafana Dashboard** | `3001` | [http://localhost:3001](http://localhost:3001) | Dashboard giám sát hiệu năng & vận hành |
| **Prometheus UI** | `9090` | [http://localhost:9090](http://localhost:9090) | Truy vấn số liệu Prometheus Metrics |
| **Loki Log Engine** | `3100` | [http://localhost:3100/ready](http://localhost:3100/ready) | Máy chủ lưu trữ Log |
| **Mailpit Web UI** | `8025` | [http://localhost:8025](http://localhost:8025) | Hộp thư phát triển (Xem email quên mật khẩu) |
| **Mailpit SMTP** | `1025` | `localhost:1025` | Cổng gửi nhận mail backend |
| **MySQL Database** | `3307` | `localhost:3307` | Cổng kết nối CSDL (ánh xạ từ container 3306) |

---

## 4. TÀI KHOẢN TRUY CẬP THỬ NGHIỆM MẶC ĐỊNH

Tất cả các tài khoản mặc định được khởi tạo sẵn với mật khẩu chung: `Hoanglinh1#`

1. **Quản trị viên (Admin):**
   - Username: `admin` (hoặc Email: `nguyenhung@gmail.com`)
   - Tên: Nguyễn Quốc Hưng
   - Vai trò: Quản lý người dùng, khóa/mở khóa tài khoản, xem thống kê hệ thống, xem nhật ký kiểm toán (Audit Logs).

2. **Giảng viên (Teacher):**
   - Username: `teacher1` (hoặc Email: `nguyenthay@gmail.com`)
   - Tên: TS. Nguyễn Văn Thầy
   - Vai trò: Soạn ngân hàng câu hỏi, tạo đề thi, gán sinh viên, công bố điểm / đáp án, xem bài nộp và thống kê điểm lớp.

3. **Sinh viên 1 (Student - Hoàng Tùng Linh):**
   - Username: `student1` (hoặc Email: `hoanglinh@gmail.com`)
   - Tên: Hoàng Tùng Linh (MSSV: DTC245200487)
   - Vai trò: Xem đề thi tự do & đề thi chỉ định, làm bài thi trực tuyến, tự động lưu nháp, xem điểm và đáp án đã công bố.

4. **Sinh viên 2 (Student):**
   - Username: `student2` (hoặc Email: `lehoa@gmail.com`)
   - Tên: Lê Thị Hoa

---

## 5. HƯỚNG DẪN CÀI ĐẶT & VẬN HÀNH

### Yêu cầu tiên quyết
- Đã cài đặt Docker Desktop hoặc Docker Engine + Docker Compose.
- Git.

### 1. Clone repository từ GitHub
```bash
git clone https://github.com/HoangTungLinh136/HoangTungLinh---DTC245200487.git
cd HoangTungLinh---DTC245200487
```

### 2. Khởi động hệ thống
Mở terminal tại thư mục gốc dự án:
```bash
# Khởi động toàn bộ 9 container ở chế độ chạy nền
docker compose up -d --build
```

### Kiểm tra trạng thái các container
```bash
docker compose ps
```

### Xem log hệ thống
```bash
docker compose logs -f app
```

### Dừng hệ thống
```bash
docker compose down
```

---

## 6. HƯỚNG DẪN SỬ DỤNG CHI TIẾT

### A. Dành Cho Sinh Viên (Student)
1. Truy cập [http://localhost](http://localhost), đăng nhập bằng tài khoản `student1` / `Hoanglinh1#`.
2. Danh sách bài thi hiện có hiển thị các đề Public và đề Assigned được chỉ định cho bạn.
3. Bấm **Bắt đầu làm bài**. Giao diện bài thi hiển thị:
   - Đồng hồ đếm ngược thời gian làm bài (tính toán chuẩn xác theo server).
   - Thanh điều hướng bảng câu hỏi (câu đã trả lời đổi màu xanh).
   - Câu hỏi 1 đáp án (Radio) hoặc nhiều đáp án (Checkbox).
   - Mỗi lựa chọn được tự động lưu nháp (auto-save draft) lên server.
4. Bấm **Nộp bài thi** để kết thúc. Hệ thống hiển thị điểm số quy đổi theo chuẩn BD-08 (nếu giáo viên đã bật công bố điểm) hoặc thông báo chờ công bố.

### B. Dành Cho Giảng Viên (Teacher)
1. Đăng nhập bằng tài khoản `teacher1` / `Password123!`.
2. **Tab Ngân hàng câu hỏi:** Tạo câu hỏi mới, phân loại theo môn học (Mạng máy tính, DevOps, CSDL...), độ khó, thêm/xóa lựa chọn và chỉ định đáp án đúng.
3. **Tab Quản lý đề thi:**
   - Tạo đề thi: chọn câu hỏi từ ngân hàng, gán trọng số (ví dụ 1.0, 2.0), đặt thời gian thi, số lượt thi tối đa, điểm đạt.
   - Bật/tắt checkbox **Công bố điểm** và **Công bố đáp án** linh hoạt.
   - Bấm **Nhân bản (Clone)** để tạo phiên bản đề mới khi đề cũ đã có sinh viên làm bài.
4. **Tab Kết quả & Bài làm:** Chọn đề thi để xem danh sách sinh viên đã nộp bài, điểm thô, điểm quy đổi (/10), và thời gian làm bài chi tiết.

### C. Dành Cho Quản Trị Viên (Admin)
1. Đăng nhập bằng tài khoản `admin` / `Password123!`.
2. **Quản lý người dùng:** Tìm kiếm, xem danh sách tài khoản, chuyển đổi vai trò, bấm **Khóa** hoặc **Mở khóa** tài khoản (khi khóa, mọi phiên đăng nhập của người dùng bị thu hồi ngay lập tức).
3. **Thống kê hệ thống:** Xem tổng số tài khoản theo vai trò, tổng số đề thi, tổng số lượt làm bài, thống kê phân bổ câu hỏi (chỉ siêu dữ liệu, không lộ nội dung bài làm học thuật).
4. **Nhật ký kiểm toán (Audit Logs):** Theo dõi mọi hành động quan trọng (đăng nhập, nộp bài, tạo đề, đổi tài khoản) cùng địa chỉ IP và dấu thời gian bất biến.

---

## 7. GIÁM SÁT & QUAN SÁT (OBSERVABILITY)

### A. Grafana Dashboards
- Truy cập: [http://localhost:3001](http://localhost:3001)
- Tài khoản đăng nhập mặc định: `admin` / `admin`
- Truy cập menu **Dashboards** > Thư mục **QuizSystem** > Mở dashboard: **"QuizSystem - Giám Sát Hiệu Năng & Vận Hành"**.
- Các biểu đồ được tích hợp sẵn:
  - **Lượt thi đang diễn ra (Active Attempts):** Đo lường số thí sinh đang đồng thời làm bài.
  - **Tốc độ yêu cầu (RPS):** Lưu lượng truy cập máy chủ Node.js.
  - **HTTP Requests theo mã phản hồi:** Tỷ lệ mã 200, 400, 403, 500.
  - **Độ trễ phản hồi (p50 & p95 Latency):** Thời gian phản hồi API.
  - **Node.js Heap Memory:** Theo dõi mức tiêu thụ RAM tránh memory leak.

### B. Truy Vấn Logs Qua Loki & LogQL
- Trong Grafana, vào mục **Explore**, chọn datasource **Loki**.
- Một số câu truy vấn LogQL thông dụng:
  ```logql
  # Xem toàn bộ log của backend QuizSystem
  {container="quizsystem-backend"}

  # Lọc các yêu cầu HTTP gặp lỗi (4xx hoặc 5xx)
  {container="quizsystem-backend"} | json | status >= 400

  # Đếm tốc độ log lỗi theo thời gian
  rate({container="quizsystem-backend"} |= "error" [1m])
  ```

### C. Kiểm Tra Email Qua Mailpit
- Truy cập: [http://localhost:8025](http://localhost:8025)
- Thử nghiệm tính năng **Quên mật khẩu** tại trang đăng nhập: Nhập `student1@quizsystem.local`.
- Vào giao diện Mailpit sẽ thấy ngay email gửi từ `QuizSystem Security` kèm đường dẫn đổi mật khẩu an toàn với token dùng 1 lần.

---

## 8. KIỂM THỬ TỰ ĐỘNG (AUTOMATED TESTS)

Hệ thống được trang bị bộ kiểm thử tự động toàn diện kiểm tra tính đúng đắn của logic tính điểm và các ràng buộc nghiệp vụ:
```bash
cd backend
npm test
```
Kết quả kiểm thử thực tế:
- `✔ BD-01 Registration & Password Security: bcrypt hashing`
- `✔ BD-11 Password Reset & Sessions: secure random token & SHA-256 hash`
- `✔ Deadline Option A: Authoritative deadline calculation D = min(now + duration, exam.end_time)`
- `✔ BD-06 Publication: Strict projection masking for students`
- `✔ TC-01 Option B: Admin metadata privacy protection`
- `✔ BD-08 Scoring: calculateNormalizedScore rounding to 2 decimal places`
- `✔ BD-04 Multiple Choice: All-or-Nothing exact set matching`
*(100% Pass, 0 Failures)*

---
*QuizSystem v2.0 — Thiết Kế Và Quản Trị Hệ Thống Phần Mềm K23.*
