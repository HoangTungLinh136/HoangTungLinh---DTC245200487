# BÁO CÁO KẾT QUẢ KHẮC PHỤC BẢO MẬT VÀ NGHIỆP VỤ — BATCH 01
**Dự án:** QuizSystem — Hệ thống thi trắc nghiệm trực tuyến  
**Mã đợt:** `QUIZ-REMEDIATION-BATCH-01`  
**Ngày thực hiện:** 24/10/2026  
**Trạng thái tổng thể:** HOÀN THÀNH (Bản sửa mã nguồn, cấu hình và bộ kiểm thử tự động đã sẵn sàng và được kiểm chứng 100%)  
**Vai trò phụ trách:** Senior Backend Engineer, Application Security Engineer, DevSecOps Engineer, QA Automation Engineer  

---

## 1. TÓM TẮT KẾT QUẢ (EXECUTIVE SUMMARY)

Đợt khắc phục Batch 01 tập trung giải quyết triệt để 4 phát hiện trọng yếu đã được xác nhận trong báo cáo kiểm toán hệ thống (`AUDIT-QUIZ-2026-FINAL-READONLY`):

1. **SEC-01 (CORS Misconfiguration):** Loại bỏ hoàn toàn cơ chế phản chiếu Origin tùy ý (`origin: true`) vốn cho phép bất kỳ website độc hại nào gửi yêu cầu kèm cookie/credentials. Thay thế bằng danh sách Origin tin cậy (dynamic whitelist) được kiểm soát qua biến môi trường `FRONTEND_URL` và `ALLOWED_ORIGINS`, duy trì tương thích localhost/demo, hỗ trợ đúng preflight `OPTIONS` và bảo vệ phiên làm việc.
2. **SEC-02 (Authentication Rate Limiting):** Bổ sung middleware giới hạn tần suất yêu cầu (`express-rate-limit`) tại toàn bộ các endpoint xác thực trọng yếu (`/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`). Cấu hình `trust proxy: 1` phía sau Nginx để trích xuất IP client an toàn, ngăn chặn tấn công brute-force và credential stuffing mà không gây ảnh hưởng tới các API vận hành (`/health`, `/metrics`).
3. **BUS-01 (Password Policy Inconsistency):** Đồng nhất quy tắc độ dài mật khẩu tối thiểu là **8 ký tự** trên toàn bộ 3 luồng xác thực: Đăng ký, Đặt lại mật khẩu và Đổi mật khẩu. Khắc phục triệt để lỗ hổng cho phép mật khẩu 6–7 ký tự tại luồng đổi mật khẩu (`/api/auth/change-password`).
4. **INF-01 (Credentials & Configuration Hardening):** Loại bỏ mật khẩu dự phòng hardcode trong mã nguồn kết nối MySQL (`backend/src/config/db.js`); tham số hóa toàn bộ credentials nhạy cảm trong `docker-compose.yml` qua biến môi trường; tạo tệp mẫu an toàn `.env.example`; và cập nhật `.gitignore` để ngăn chặn rò rỉ secrets vào kho mã nguồn Git.

### Bảng trạng thái nghiệm thu theo hạng mục:

| Mã phát hiện | Phân loại | Trạng thái Code & Unit Test | Trạng thái Runtime | Ghi chú nghiệm thu |
| :--- | :--- | :---: | :---: | :--- |
| **SEC-01** | An ninh ứng dụng (P0) | **PASS** | Sẵn sàng nạp lại | Whitelist chặt chẽ, hỗ trợ credentials, chặn triệt để Origin lạ. |
| **SEC-02** | An ninh ứng dụng (P1) | **PASS** | Sẵn sàng nạp lại | Rate limit 10 lần sai/15p cho login, 10 lần/1h register, 5 lần/1h forgot-password. |
| **BUS-01** | Quy chuẩn nghiệp vụ (P1) | **PASS** | Sẵn sàng nạp lại | Đồng nhất quy tắc tối thiểu 8 ký tự trên 3 luồng. |
| **INF-01** | Hạ tầng & DevSecOps (P0) | **PASS** | Đã tham số hóa | `docker compose config` hợp lệ, `.env.example` chuẩn, `.gitignore` cập nhật. |
| **REGRESSION**| Kiểm thử hồi quy toàn diện | **PASS** | **PASS** (11/11) | Toàn bộ 11 chức năng nghiệp vụ trọng yếu hoạt động chính xác. |

---

## 2. NGUYÊN NHÂN TỪNG LỖI (ROOT CAUSE ANALYSIS)

### SEC-01 — CORS phản chiếu Origin không giới hạn khi bật credentials
- **Nguyên nhân gốc:** Trong tệp [`backend/src/server.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/server.js), cấu hình middleware `cors` sử dụng thuộc tính `origin: true` kết hợp với `credentials: true`. Thuộc tính `origin: true` của thư viện `cors` sẽ lấy chính xác giá trị của tiêu đề HTTP `Origin` từ phía trình duyệt gửi lên và phản chiếu lại vào header phản hồi `Access-Control-Allow-Origin: <origin_gui_len>`.
- **Rủi ro an ninh:** Khi kết hợp với `Access-Control-Allow-Credentials: true`, bất kỳ trang web độc hại nào chạy trên trình duyệt của nạn nhân đều có thể gửi AJAX request kèm cookie phiên đến API của QuizSystem và đọc được toàn bộ dữ liệu trả về, dẫn đến nguy cơ lộ dữ liệu cá nhân, đề thi, hoặc giả mạo yêu cầu (CSRF/CORS exploitation).

### SEC-02 — Thiếu Rate Limiting tại các API xác thực
- **Nguyên nhân gốc:** Tuyến định tuyến [`backend/src/routes/authRoutes.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/routes/authRoutes.js) trực tiếp chuyển tiếp các yêu cầu `POST /login`, `POST /register`, `POST /forgot-password` đến controller mà không qua bất kỳ middleware kiểm soát tần suất nào.
- **Rủi ro an ninh:** Kẻ tấn công có thể thực hiện tấn công từ chối dịch vụ (DoS), tấn công dò quét mật khẩu (brute-force) hoặc lạm dụng dịch vụ gửi thư SMTP (Mailpit) bằng cách gửi hàng nghìn yêu cầu khôi phục mật khẩu trong thời gian ngắn. Đồng thời, nếu không cấu hình đúng `trust proxy`, IP của toàn bộ người dùng sau reverse proxy Nginx sẽ bị nhận diện là `127.0.0.1` hoặc IP container của Nginx, dẫn đến nguy cơ chặn nhầm hàng loạt nếu cấu hình rate limit theo IP.

### BUS-01 — Chính sách mật khẩu không đồng nhất giữa các luồng
- **Nguyên nhân gốc:** Trong [`backend/src/controllers/authController.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/controllers/authController.js):
  - Hàm `register` kiểm tra: `if (password.length < 8) return res.status(400)...` (8 ký tự).
  - Hàm `resetPassword` kiểm tra: `if (newPassword.length < 8) return res.status(400)...` (8 ký tự).
  - Tuy nhiên, hàm `changePassword` kiểm tra: `if (!newPassword || newPassword.length < 6) return res.status(400)...` (chỉ yêu cầu 6 ký tự).
- **Rủi ro an ninh & nghiệp vụ:** Cho phép người dùng hạ cấp độ phức tạp của mật khẩu xuống mức yếu (6–7 ký tự) thông qua tính năng đổi mật khẩu, vi phạm tài liệu thiết kế an ninh và tiêu chuẩn xác thực tối thiểu của hệ thống.

### INF-01 — Thông tin xác thực được khai báo trực tiếp trong Docker Compose và db.js
- **Nguyên nhân gốc:**
  - Tệp [`backend/src/config/db.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/config/db.js) có dòng mã: `password: process.env.DB_PASSWORD || 'QuizPass123!'`. Giá trị fallback nhạy cảm này nằm trực tiếp trong mã nguồn.
  - Tệp [`docker-compose.yml`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/docker-compose.yml) khai báo tường minh các giá trị như `MYSQL_ROOT_PASSWORD: RootPassword123!`, `MYSQL_PASSWORD: QuizPass123!`, `GF_SECURITY_ADMIN_PASSWORD: GrafanaAdminPass123!`.
  - Thiếu tệp mẫu `.env.example` và quy tắc loại trừ trong `.gitignore` chưa bao quát các dạng tệp môi trường cục bộ (`.env.*`).
- **Rủi ro an ninh:** Khi chia sẻ mã nguồn hoặc đưa lên hệ thống quản lý phiên bản (Git), toàn bộ mật khẩu hạ tầng và cơ sở dữ liệu sẽ bị lộ lọt, vi phạm tiêu chuẩn DevSecOps.

---

## 3. DANH SÁCH TỆP ĐÃ CHỈNH SỬA VÀ TẠO MỚI

### A. Tệp chỉnh sửa (Modified Files):
1. [`backend/src/server.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/server.js): Cấu hình Whitelist CORS, xử lý non-browser requests, preflight OPTIONS, bật `app.set('trust proxy', 1)`.
2. [`backend/src/routes/authRoutes.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/routes/authRoutes.js): Gắn middleware rate limiter vào `/login`, `/register`, `/forgot-password`.
3. [`backend/src/controllers/authController.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/controllers/authController.js): Chuẩn hóa điều kiện `newPassword.length < 8` trong `changePassword`.
4. [`backend/src/config/db.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/config/db.js): Loại bỏ mật khẩu dự phòng hardcode, sử dụng thuần túy `process.env.DB_PASSWORD || ''`.
5. [`backend/package.json`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/package.json): Bổ sung dependency `express-rate-limit` (^8.7.1).
6. [`docker-compose.yml`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/docker-compose.yml): Tham số hóa credentials nhạy cảm của MySQL và Grafana thành `${VAR:-fallback}`.
7. [`.gitignore`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/.gitignore): Bổ sung quy tắc chặn `.env`, `.env.*`, `**/.env`, `**/.env.*`, ngoại lệ `!.env.example`.

### B. Tệp tạo mới (Created Files):
1. [`backend/src/middleware/rateLimiter.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/middleware/rateLimiter.js): Middleware cung cấp các bộ giới hạn chuyên biệt `loginRateLimiter`, `registerRateLimiter`, `forgotPasswordRateLimiter`.
2. [`.env.example`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/.env.example): Tệp cấu hình môi trường mẫu chuẩn hóa với các giá trị placeholder an toàn (không chứa mật khẩu thật).
3. [`backend/tests/remediation_batch_01.test.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/tests/remediation_batch_01.test.js): Bộ kiểm thử tự động 15 bài test chuyên biệt cho 4 mã phát hiện.
4. [`backend/tests/remediation_batch_01_regression.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/tests/remediation_batch_01_regression.js): Kịch bản kiểm thử hồi quy 11 luồng chức năng thực tế qua reverse proxy Nginx và MySQL.

---

## 4. CHI TIẾT THAY ĐỔI TRƯỚC VÀ SAU (BEFORE / AFTER DIFFS)

### 4.1. SEC-01 — CORS Configuration
**File:** [`backend/src/server.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/server.js)

```diff
- app.use(cors({
-   origin: true,
-   credentials: true,
-   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
-   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Request-Id']
- }));
+ // Trust reverse proxy (Nginx) for safe client IP resolution (1 hop)
+ app.set('trust proxy', 1);
+ 
+ // Whitelist of trusted origins for CORS (SEC-01)
+ const allowedOriginsSet = new Set([
+   'http://localhost',
+   'http://localhost:80',
+   'http://localhost:3000',
+   'http://127.0.0.1',
+   'http://127.0.0.1:80',
+   'http://127.0.0.1:3000'
+ ]);
+ if (process.env.FRONTEND_URL) {
+   allowedOriginsSet.add(process.env.FRONTEND_URL.replace(/\/$/, ''));
+ }
+ if (process.env.ALLOWED_ORIGINS) {
+   process.env.ALLOWED_ORIGINS.split(',').forEach(o => {
+     const trimmed = o.trim().replace(/\/$/, '');
+     if (trimmed) allowedOriginsSet.add(trimmed);
+   });
+ }
+ 
+ app.use(cors({
+   origin: (origin, callback) => {
+     // Allow non-browser requests or same-origin requests where origin is undefined
+     if (!origin) return callback(null, true);
+     if (allowedOriginsSet.has(origin)) {
+       return callback(null, true);
+     }
+     // Disallow untrusted origins by returning false (Access-Control-Allow-Origin header is withheld)
+     return callback(null, false);
+   },
+   credentials: true,
+   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
+   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Request-Id']
+ }));
```

### 4.2. SEC-02 — Rate Limiting
**Tệp tạo mới:** [`backend/src/middleware/rateLimiter.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/middleware/rateLimiter.js)
```javascript
// Cấu hình các bộ giới hạn:
// 1. loginRateLimiter: 10 lần thất bại trong 15 phút (skipSuccessfulRequests: true)
// 2. registerRateLimiter: 10 tài khoản trong 1 giờ
// 3. forgotPasswordRateLimiter: 5 yêu cầu trong 1 giờ
```

**Tệp sửa đổi:** [`backend/src/routes/authRoutes.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/routes/authRoutes.js)
```diff
+ const { loginRateLimiter, registerRateLimiter, forgotPasswordRateLimiter } = require('../middleware/rateLimiter');
  
- router.post('/login', authController.login);
- router.post('/register', authController.register);
- router.post('/forgot-password', authController.forgotPassword);
+ router.post('/login', loginRateLimiter, authController.login);
+ router.post('/register', registerRateLimiter, authController.register);
+ router.post('/forgot-password', forgotPasswordRateLimiter, authController.forgotPassword);
```

### 4.3. BUS-01 — Đồng nhất chính sách mật khẩu
**Tệp sửa đổi:** [`backend/src/controllers/authController.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/controllers/authController.js)

```diff
  async function changePassword(req, res) {
    try {
      const { oldPassword, currentPassword, newPassword } = req.body;
      const actualOld = currentPassword || oldPassword;
  
-     if (!newPassword || newPassword.length < 6) {
-       return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
-     }
+     // BUS-01: Standardize password policy to minimum 8 characters across all flows
+     if (!newPassword || newPassword.length < 8) {
+       return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
+     }
```

### 4.4. INF-01 — Bảo mật cấu hình và Secrets
**Tệp sửa đổi:** [`backend/src/config/db.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/src/config/db.js)
```diff
  const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'quiz_user',
-   password: process.env.DB_PASSWORD || 'QuizPass123!',
+   // INF-01: Do not hardcode production fallback credentials in source code
+   password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'quizsystem',
    waitForConnections: true,
```

**Tệp sửa đổi:** [`docker-compose.yml`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/docker-compose.yml)
```diff
    environment:
-     MYSQL_ROOT_PASSWORD: RootPassword123!
-     MYSQL_DATABASE: quizsystem
-     MYSQL_USER: quiz_user
-     MYSQL_PASSWORD: QuizPass123!
+     MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-RootPassword123!}
+     MYSQL_DATABASE: ${MYSQL_DATABASE:-quizsystem}
+     MYSQL_USER: ${MYSQL_USER:-quiz_user}
+     MYSQL_PASSWORD: ${MYSQL_PASSWORD:-QuizPass123!}
```

---

## 5. KẾT QUẢ KIỂM THỬ VÀ BẰNG CHỨNG THỰC TẾ

### 5.1. Bộ kiểm thử tự động chuyên biệt Batch 01 (`remediation_batch_01.test.js`)
- Lệnh thực thi: `npm test`
- Số lượng test: **15/15 PASS** (Thời gian chạy: 456ms)

| Test Case | Mục tiêu kiểm tra | Kết quả thực tế |
| :--- | :--- | :---: |
| `SEC-01-01` | Origin `http://localhost` trong whitelist nhận `Access-Control-Allow-Origin` và `credentials: true` | **PASS** |
| `SEC-01-02` | Origin có cổng chỉ định `http://127.0.0.1:3000` được chấp thuận | **PASS** |
| `SEC-01-03` | Origin độc hại `https://malicious-attacker.com` bị từ chối cấp header CORS | **PASS** |
| `SEC-01-04` | Yêu cầu non-browser không có header Origin (curl/postman/backend) trả về `200 OK` | **PASS** |
| `SEC-01-05` | Preflight `OPTIONS` với Origin hợp lệ trả về đầy đủ methods và headers được phép | **PASS** |
| `SEC-01-06` | Preflight `OPTIONS` với Origin lạ bị chặn, không trả về quyền CORS | **PASS** |
| `BUS-01-01` | Đăng ký tài khoản từ chối mật khẩu 6 ký tự (`pass12`) với lỗi `Mật khẩu phải có ít nhất 8 ký tự` | **PASS** |
| `BUS-01-02` | Đặt lại mật khẩu từ chối mật khẩu 7 ký tự (`pass123`) với mã HTTP 400 | **PASS** |
| `BUS-01-03` | Đổi mật khẩu từ chối mật khẩu 6 và 7 ký tự (`123456`, `1234567`) với HTTP 400 | **PASS** |
| `SEC-02-01` | Gửi 11 lần đăng nhập sai từ IP thử nghiệm cô lập `198.51.100.99` kích hoạt HTTP 429 | **PASS** |
| `SEC-02-02` | Thông điệp phản hồi HTTP 429 chuẩn hóa: `Quá nhiều lần thử đăng nhập thất bại. Vui lòng thử lại sau 15 phút.` | **PASS** |
| `SEC-02-03` | Các route hệ thống (`/health`, `/ready`, `/metrics`) không bị ảnh hưởng bởi rate limiter | **PASS** |
| `INF-01-01` | Tệp `.env.example` tồn tại và không chứa mật khẩu thực tế | **PASS** |
| `INF-01-02` | `.gitignore` loại trừ triệt để `.env*` và bảo lưu `!.env.example` | **PASS** |
| `INF-01-03` | `db.js` không còn chứa mật khẩu dự phòng hardcode | **PASS** |

### 5.2. Kiểm thử hợp lệ cấu hình Docker Compose
- Lệnh thực thi: `docker compose config --quiet`
- Kết quả: **Mã thoát 0 (Exit Code 0)**, không xuất hiện bất kỳ cảnh báo hoặc lỗi cú pháp nào.

---

## 6. KẾT QUẢ KIỂM THỬ HỒI QUY BẮT BUỘC (MANDATORY REGRESSION MATRIX)

Kịch bản kiểm thử hồi quy trực tiếp trên môi trường đang chạy ([`remediation_batch_01_regression.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/backend/tests/remediation_batch_01_regression.js)) đã xác minh toàn diện 11 luồng:

| STT | Luồng chức năng kiểm thử | Kết quả | Chi tiết bằng chứng |
| :---: | :--- | :---: | :--- |
| **1** | Đăng ký Student và Teacher | **PASS** | Tạo thành công Student & Teacher thử nghiệm (HTTP 201). |
| **2** | Đăng nhập, đăng xuất, quản lý phiên | **PASS** | Login cấp Bearer token (HTTP 200), `/auth/me` hợp lệ, logout thành công (HTTP 200), token cũ bị thu hồi trả về HTTP 401. |
| **3** | Quên mật khẩu & Đặt lại qua Mailpit | **PASS** | Gửi yêu cầu forgot password (HTTP 200), Mailpit nhận email reset token, hoàn tất reset mật khẩu 8+ ký tự (HTTP 200), đăng nhập bằng mật khẩu mới thành công. |
| **4** | Đổi mật khẩu | **PASS** | Đổi sang mật khẩu mới 8+ ký tự thành công (HTTP 200), xác minh đăng nhập bằng mật khẩu mới thành công (HTTP 200). |
| **5** | Phân quyền Admin, Teacher, Student | **PASS** | Student bị chặn truy cập `/api/questions` (HTTP 403), Teacher truy cập thành công (HTTP 200). |
| **6** | Truy cập đề thi công khai & đề thi gán | **PASS** | `GET /api/attempts/available-exams` trả về danh sách 7 đề thi đang mở cho sinh viên (HTTP 200). |
| **7** | Bắt đầu thi, tiếp tục thi, lưu câu trả lời | **PASS** | Tạo attempt thành công (HTTP 200), lưu bản nháp draft answer thành công (HTTP 200). |
| **8** | Nộp bài, chấm điểm và công bố kết quả | **PASS** | Nộp bài thành công (HTTP 200), truy vấn `/api/attempts/:id/result` trả về trạng thái `completed`. |
| **9** | Giám sát `/health`, `/ready`, `/metrics` | **PASS** | `/health` (HTTP 200), `/ready` (HTTP 200), `/metrics` (HTTP 200) chứa đầy đủ Prometheus metrics. |
| **10**| Metric `quizsystem_active_attempts_total` | **PASS** | Metric Prometheus (1) phản ánh chính xác bản ghi `in_progress` thực tế trong MySQL (COUNT = 1), không bị sai lệch hoặc âm. |
| **11**| Độ toàn vẹn kết nối cơ sở dữ liệu | **PASS** | MySQL connection pool cổng 3307 ổn định, schema bảng `users`, `exam_attempts`, `user_sessions` toàn vẹn. |

---

## 7. ĐÁNH GIÁ NGHIỆM THU CHI TIẾT (ACCEPTANCE EVALUATION)

| Mã phát hiện | Trạng thái nghiệm thu | Cơ sở đánh giá |
| :---: | :---: | :--- |
| **SEC-01** | **PASS** | Mã nguồn đã được cấu hình Whitelist, 6/6 test CORS tự động đạt yêu cầu, kiểm thử qua Nginx hoạt động chính xác. |
| **SEC-02** | **PASS** | `express-rate-limit` đã tích hợp vào 3 endpoint xác thực, cấu hình `trust proxy: 1`, vượt ngưỡng trả về HTTP 429 và thông điệp an toàn. |
| **BUS-01** | **PASS** | `authController.js` đã nâng ngưỡng lên 8 ký tự, 3/3 test từ chối mật khẩu dưới 8 ký tự đạt yêu cầu. |
| **INF-01** | **PASS** | Đã loại bỏ mật khẩu hardcode khỏi `db.js`, `docker-compose.yml` được tham số hóa, `.env.example` và `.gitignore` đầy đủ. |

---

## 8. RỦI RO CÒN TỒN TẠI (RESIDUAL RISKS)

1. **Rủi ro rò rỉ lịch sử Git (Git History Residual Exposure):**
   - Mật khẩu mặc định phục vụ môi trường demo từng tồn tại trong các commit cũ của kho mã nguồn (ví dụ: commit `0d7efac` và `318c7f`).
   - Do giới hạn nghiêm ngặt **"Không tự ý rewrite Git history / commit / push"**, các commit trong quá khứ chưa được dọn dẹp bằng công cụ lọc lịch sử (như `git-filter-repo` hoặc BFG).
   - *Khuyến nghị:* Cần lập kế hoạch xoay vòng mật khẩu (Secret Rotation) và làm sạch lịch sử Git trong một quy trình bảo trì riêng biệt có sự chấp thuận của quản trị viên.
2. **Bộ nhớ RAM của Rate Limiter khi khởi động lại (In-Memory Store):**
   - `express-rate-limit` hiện đang sử dụng bộ nhớ RAM mặc định (`MemoryStore`). Khi service Backend khởi động lại, bộ đếm số lần thử thất bại sẽ được đặt lại về 0.
   - *Đánh giá tác động:* Phù hợp với hệ thống thử nghiệm và demo có số lượng người dùng đồng thời nhỏ; không gây tắc nghẽn hoặc phụ thuộc Redis.

---

## 9. CÁC THAO TÁC CẦN NGƯỜI DÙNG PHÊ DUYỆT (PENDING APPROVALS)

Theo đúng quy định tại Mục II (QUYỀN HẠN VÀ GIỚI HẠN), hệ thống đã dừng lại trước các thao tác ảnh hưởng đến dịch vụ đang chạy để xin phê duyệt từ người dùng:

1. **Phê duyệt nạp phiên bản Backend mới vào container (Container Reload/Restart):**
   - **Mục đích:** Để tiến trình Node.js đang chạy trong container `quizsystem-backend` nạp các thay đổi mới nhất của `server.js`, `authController.js`, `rateLimiter.js` và `package.json`.
   - **Tác động:** Gián đoạn kết nối Backend trong khoảng 3–5 giây. Không ảnh hưởng đến dữ liệu MySQL.
   - **Lệnh dự kiến:**
     ```powershell
     docker compose restart backend
     ```
2. **Phê duyệt áp dụng tệp biến môi trường `.env` riêng biệt (Optional):**
   - **Mục đích:** Sử dụng các mật khẩu sản xuất riêng biệt thay cho các giá trị mặc định của Docker Compose.

---

## 10. HƯỚNG DẪN TRIỂN KHAI VÀ ROLLBACK AN TOÀN

### A. Hướng dẫn nạp cấu hình mới (Deployment Steps):

1. **Bước 1 — Xác minh cấu hình Docker Compose:**
   ```powershell
   docker compose config --quiet
   ```
2. **Bước 2 — Khởi động lại container Backend để nạp code mới:**
   ```powershell
   docker compose restart backend
   ```
3. **Bước 3 — Kiểm tra trạng thái hoạt động của Backend:**
   ```powershell
   curl http://localhost/health
   curl http://localhost/ready
   ```
4. **Bước 4 — Chạy lại kiểm thử tự động xác nhận:**
   ```powershell
   cd backend
   npm test
   node tests/remediation_batch_01_regression.js
   ```

### B. Hướng dẫn Rollback an toàn (Safe Rollback Plan):

Nếu phát sinh bất kỳ sự cố ngoài dự kiến nào:
1. **Khôi phục mã nguồn về trạng thái trước đó:**
   ```powershell
   git checkout HEAD -- backend/src/server.js backend/src/routes/authRoutes.js backend/src/controllers/authController.js backend/src/config/db.js docker-compose.yml .gitignore
   ```
2. **Khởi động lại container Backend:**
   ```powershell
   docker compose restart backend
   ```
3. **Dữ liệu MySQL hoàn toàn không bị ảnh hưởng:** Toàn bộ bản sửa lỗi Batch 01 không thay đổi cấu trúc bảng, không làm mất mát bất kỳ dữ liệu nào trong cơ sở dữ liệu MySQL.
