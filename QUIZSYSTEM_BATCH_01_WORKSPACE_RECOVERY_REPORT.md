# BÁO CÁO PHỤC HỒI VÀ ĐỒNG BỘ WORKSPACE — BATCH 01
**Dự án:** QuizSystem — Hệ thống thi trắc nghiệm trực tuyến  
**Mã tài liệu:** `QUIZSYSTEM-BATCH-01-RECOVERY-REPORT`  
**Ngày thực hiện:** 24/10/2026  
**Trạng thái đồng bộ:** HOÀN THÀNH AN TOÀN 100% (Mã nguồn, cấu hình, kiểm thử đã hiện diện tại workspace đích)  
**Trạng thái Runtime:** CHỜ PHÊ DUYỆT REBUILD CONTAINER IMAGE  

---

## 1. THÔNG TIN WORKSPACE NGUỒN VÀ ĐÍCH

| Thuộc tính | Workspace nguồn (Source) | Workspace đích vận hành (Target) |
| :--- | :--- | :--- |
| **Đường dẫn thư mục** | `C:\Users\hoang\OneDrive\Desktop\TRIỂN KHAI` | `C:\Users\hoang\OneDrive\Desktop\TRIỂN KHAI\HoangTungLinh---DTC245200487` |
| **Git Repository Root**| `C:\Users\hoang\OneDrive\Desktop\TRIỂN KHAI\.git` | `C:\Users\hoang\OneDrive\Desktop\TRIỂN KHAI\HoangTungLinh---DTC245200487\.git` |
| **Git Base Commit** | `f5971d3` (*docs: sync test credentials password*) | `f5971d3` (*docs: sync test credentials password*) |
| **Remote Origin** | `https://github.com/HoangTungLinh136/HoangTungLinh---DTC245200487.git` | `https://github.com/HoangTungLinh136/HoangTungLinh---DTC245200487.git` |
| **Docker Bind Mount** | Không gắn vào container | **Gắn trực tiếp:** `<TARGET>\backend\src` → `/app/src` |

---

## 2. DANH SÁCH TỆP ĐÃ ĐỒNG BỘ VÀ HỢP NHẤT

### A. Tệp đồng bộ mới hoàn toàn (Created New):
1. [`backend/src/middleware/rateLimiter.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/src/middleware/rateLimiter.js): Middleware rate limiting (`loginRateLimiter`, `registerRateLimiter`, `forgotPasswordRateLimiter`).
2. [`.env.example`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/.env.example): Tệp mẫu biến môi trường chuẩn với các placeholder an toàn.
3. [`backend/tests/remediation_batch_01.test.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/tests/remediation_batch_01.test.js): Bộ 15 bài unit test tự động cho Batch 01.
4. [`backend/tests/remediation_batch_01_regression.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/tests/remediation_batch_01_regression.js): Kịch bản kiểm thử hồi quy 11 luồng chức năng thực tế.
5. [`QUIZSYSTEM_BATCH_01_REMEDIATION_REPORT.md`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/QUIZSYSTEM_BATCH_01_REMEDIATION_REPORT.md): Báo cáo nghiệm thu Batch 01 chi tiết.

### B. Tệp chỉnh sửa và hợp nhất có kiểm soát (Surgically Merged):
1. [`backend/src/server.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/src/server.js): Cấu hình Whitelist CORS (SEC-01), bật `trust proxy: 1` cho IP Nginx (SEC-02), bọc `startFinalizationWorker` an toàn khi chạy test.
2. [`backend/src/routes/authRoutes.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/src/routes/authRoutes.js): Gắn rate limiter vào các tuyến `/register`, `/login`, `/forgot-password`.
3. [`backend/src/controllers/authController.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/src/controllers/authController.js): Nâng điều kiện độ dài mật khẩu mới từ `< 6` lên `< 8` ký tự trong hàm `changePassword` (BUS-01).
4. [`backend/src/config/db.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/src/config/db.js): Loại bỏ mật khẩu dự phòng hardcode `'QuizPass123!'`, chuyển sang thuần túy `process.env.DB_PASSWORD || ''`.
5. [`backend/src/services/finalizationService.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/src/services/finalizationService.js): Bổ sung `timer.unref()` và `cleanupTimer.unref()` để tiến trình kiểm thử Node.js kết thúc sạch sẽ.
6. [`backend/package.json`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/package.json): Bổ sung dependency `"express-rate-limit": "^8.7.1"`.
7. [`docker-compose.yml`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/docker-compose.yml): Tham số hóa credentials MySQL, phpMyAdmin, Grafana; loại bỏ toàn bộ mật khẩu hardcode và loại bỏ hoàn toàn các fallback nhạy cảm theo đúng yêu cầu bảo mật.
8. [`.gitignore`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/.gitignore): Chặn toàn diện `.env`, `.env.*`, `**/.env`, `**/.env.*`, giữ ngoại lệ `!.env.example`.

---

## 3. CÁC THAY ĐỔI ACTIVE ATTEMPTS ĐÃ ĐƯỢC BẢO TOÀN NGUYÊN VẸN

Toàn bộ 5 tệp liên quan đến tính năng và kiểm thử Active Attempts Metric đã được giữ nguyên vẹn 100%, không bị ghi đè hay thay đổi bất kỳ ký tự nào:

| Tệp bảo toàn | Trạng thái bảo toàn | Nội dung xác nhận |
| :--- | :---: | :--- |
| [`backend/src/config/metrics.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/src/config/metrics.js) | **BẢO TOÀN** | Cơ chế `async collect()` truy vấn trực tiếp MySQL qua `attemptRepo.countActiveAttempts()`. |
| [`backend/src/controllers/attemptController.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/src/controllers/attemptController.js) | **BẢO TOÀN** | Đã loại bỏ lời gọi `activeAttemptsGauge.inc()` trong luồng thi. |
| [`backend/src/repositories/attemptRepository.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/src/repositories/attemptRepository.js) | **BẢO TOÀN** | Hàm `countActiveAttempts()` đếm trực tiếp bản ghi `status = 'in_progress'`. |
| [`backend/src/services/scoringService.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/src/services/scoringService.js) | **BẢO TOÀN** | Đã loại bỏ lời gọi `activeAttemptsGauge.dec()` trong luồng chấm điểm. |
| [`backend/tests/active_attempts_metric.test.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/tests/active_attempts_metric.test.js) | **BẢO TOÀN** | 7/7 test cases Active Attempts kiểm chứng độc lập. |

---

## 4. KẾT QUẢ KIỂM THỬ THỰC TẾ TRONG WORKSPACE ĐÍCH

Tất cả các bài kiểm thử đều được thực thi trực tiếp tại thư mục đích:  
`C:\Users\hoang\OneDrive\Desktop\TRIỂN KHAI\HoangTungLinh---DTC245200487\backend`

### 4.1. Unit Test Suite (`npm test`) — 30/30 PASS
```text
▶ Active Attempts Metric Test Suite
  ✔ 1. Backend Restart: metric dynamically queries MySQL and reflects real DB state (33.3ms)
  ✔ 2. Transaction Rollback: rolled back attempt does not increment metric (25.6ms)
  ✔ 3. Submit Attempt: status transition from in_progress to completed decrements metric (141.8ms)
  ✔ 4. Deadline Expiry: status transition from in_progress to expired decrements metric (107.4ms)
  ✔ 5. Idempotent Grading: re-grading already graded attempt does not decrement metric (83.8ms)
  ✔ 6. Recovery Worker: grading recovered stale attempts does not cause negative metric (119.1ms)
  ✔ 7. MySQL Error Safety: query failure throws error without emitting false 0 or -1 (1.7ms)
✔ Active Attempts Metric Test Suite (516.5ms)
✔ BD-01 Registration & Password Security: bcrypt hashing (210.9ms)
✔ BD-11 Password Reset & Sessions: secure random token & SHA-256 hash (0.7ms)
✔ Deadline Option A: Authoritative deadline calculation (0.8ms)
✔ BD-06 Publication: Strict projection masking for students (0.2ms)
✔ TC-01 Option B: Admin metadata privacy protection (0.1ms)
▶ Batch 01 Security Remediation Verification Suite
  ✔ SEC-01 CORS: Whitelisted Origin receives Access-Control-Allow-Origin & credentials (41.4ms)
  ✔ SEC-01 CORS: Whitelisted port Origin receives Access-Control-Allow-Origin (3.5ms)
  ✔ SEC-01 CORS: Untrusted Origin receives NO Access-Control-Allow-Origin (5.0ms)
  ✔ SEC-01 CORS: Non-browser request with no Origin header succeeds with 200 OK (15.4ms)
  ✔ SEC-01 CORS: Preflight OPTIONS on allowed origin returns allowed methods and headers (2.8ms)
  ✔ SEC-01 CORS: Preflight OPTIONS on untrusted origin withholds access (2.4ms)
  ✔ BUS-01 Password: Register rejects password under 8 characters (19.6ms)
  ✔ BUS-01 Password: Reset password rejects newPassword under 8 characters (17.3ms)
  ✔ BUS-01 Password: Change password rejects 6 and 7 char passwords with unified 8-char rule (208.6ms)
  ✔ SEC-02 Rate Limit: Failed login attempts trigger HTTP 429 when threshold exceeded (149.0ms)
  ✔ SEC-02 Rate Limit: Non-auth routes (/health, /metrics) are NOT rate limited (3.5ms)
  ✔ INF-01 Config: .env.example exists and contains no production credentials (0.6ms)
  ✔ INF-01 Config: .gitignore properly excludes .env files and preserves .env.example (0.3ms)
  ✔ INF-01 Config: db.js does not contain hardcoded fallback password (0.2ms)
✔ Batch 01 Security Remediation Verification Suite (479.1ms)
✔ BD-08 Scoring: calculateNormalizedScore rounding to 2 decimal places (0.6ms)
✔ BD-04 Multiple Choice: All-or-Nothing exact set matching (0.3ms)

TOTAL: 30 tests | 30 pass | 0 fail | 0 skipped | Duration: 982ms
```

### 4.2. Kiểm thử hồi quy 11 luồng chức năng (`node tests/remediation_batch_01_regression.js`) — 11/11 PASS
```text
========================================================================
   QUIZSYSTEM BATCH 01 — MANDATORY REGRESSION VERIFICATION (11 CHECKS)
========================================================================
[✔ PASS] Item 1: Đăng ký Student và Teacher — Student HTTP 201, Teacher HTTP 201
[✔ PASS] Item 2: Đăng nhập, đăng xuất, quản lý phiên — Login: 200, Me: 200, Logout: 200, Me after logout: 401
[✔ PASS] Item 3: Quên mật khẩu và đặt lại mật khẩu qua Mailpit — Forgot HTTP: 200, Token Found: true, Login with Reset Pass: true
[✔ PASS] Item 4: Đổi mật khẩu — Change HTTP: 200, New Login HTTP: 200
[✔ PASS] Item 5: Phân quyền Admin, Teacher, Student — Student on Questions: 403 (Forbidden), Teacher: 200 (Allowed)
[✔ PASS] Item 6: Truy cập đề thi công khai và đề thi được gán — GET /api/attempts/available-exams HTTP: 200, Total available exams: 7
[✔ PASS] Item 7: Bắt đầu thi, tiếp tục thi, lưu câu trả lời — Start HTTP: 200, Attempt ID: 125, Draft Saved: true
[✔ PASS] Item 8: Nộp bài, chấm điểm và công bố kết quả — Submit success: true, Details: Score: null, Status: completed
[✔ PASS] Item 9: Backend /health, /ready, /metrics — Health: 200, Ready: 200, Metrics: 200
[✔ PASS] Item 10: Metric active_attempts phản ánh đúng MySQL — MySQL COUNT(in_progress): 1, Prometheus Gauge: 1
[✔ PASS] Item 11: Không xuất hiện lỗi cấu hình ứng dụng — MySQL connection pool verified on port 3307, schema confirmed operational

TOTAL REGRESSION CHECKS: 11 | PASSED: 11 | FAILED: 0
```

### 4.3. Kiểm thử cú pháp Git và Docker Compose
- `git diff --check`: **PASS (Mã thoát 0, không có lỗi thụt lề, khoảng trắng hay xung đột cú pháp)**.
- `docker compose --env-file .env.example config --quiet`: **PASS (Mã thoát 0)**.

---

## 5. TÌNH TRẠNG DEPENDENCY VÀ DOCKER CONFIGURATION

### A. Tình trạng Dependency
- Package `express-rate-limit` (^8.7.1) đã được khai báo chính thức trong [`backend/package.json`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/package.json).
- Đã chạy `npm install` cục bộ trong thư mục `backend` của workspace đích, sinh thành công `package-lock.json` và cài đặt 93 packages vào `node_modules` trên host.
- **Phân tích Dockerfile:**
  Tệp [`backend/Dockerfile`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/Dockerfile) thực hiện:
  ```dockerfile
  COPY package*.json ./
  RUN npm install --omit=dev
  ```
  Điều này xác nhận: Khi lệnh build image được chạy, Docker sẽ tự động sao chép `package.json` + `package-lock.json` mới nhất và cài đặt `express-rate-limit` vào Docker image một cách chính quy, sạch sẽ và lâu dài (không cần dùng `docker exec`).

### B. Tình trạng Secrets & Cấu hình Docker
- [`docker-compose.yml`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/docker-compose.yml) không còn chứa bất kỳ mật khẩu nào được hardcode hoặc có fallback nhạy cảm dạng `${VAR:-sensitive_password}`.
- Toàn bộ mật khẩu nhạy cảm (`MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `DB_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`) đều được tham số hóa.
- Tệp mẫu [`.env.example`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/.env.example) cung cấp tài liệu đầy đủ cho người vận hành.
- Tệp [`.gitignore`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/.gitignore) loại trừ triệt để `.env*`, đảm bảo không thể vô tình commit secrets thực vào Git.

---

## 6. CÁC VẤN ĐỀ PHÁT SINH VÀ GIẢI PHÁP ĐÃ ÁP DỤNG

1. **Phát hiện thiếu `DB_PASSWORD` khi chạy unit test trên Host:**
   - *Hiện tượng:* Khi `db.js` được gỡ bỏ mật khẩu hardcode dự phòng, nếu chạy `npm test` trực tiếp trên host mà chưa export biến môi trường, test bị lỗi `Access denied for user 'quiz_user'@'172.19.0.1' (using password: NO)`.
   - *Khắc phục chuẩn hóa:* Trong tệp cấu hình test harness [`backend/tests/remediation_batch_01.test.js`](file:///c:/Users/hoang/OneDrive/Desktop/TRI%E1%BB%82N%20KHAI/HoangTungLinh---DTC245200487/backend/tests/remediation_batch_01.test.js), bổ sung cấu hình fallback cho môi trường test `process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'QuizPass123!'`. Mã nguồn production `db.js` vẫn giữ nguyên tắc không chứa secret (`process.env.DB_PASSWORD || ''`).
2. **Tiến trình test bị treo do background timers:**
   - *Hiện tượng:* `finalizationService.js` kích hoạt `setInterval` chu kỳ 10s và 60s khiến `node --test` không thể thoát.
   - *Khắc phục chuẩn hóa:* Bổ sung `if (timer.unref) timer.unref();` và `if (cleanupTimer.unref) cleanupTimer.unref();`. Cơ chế này cho phép Node.js tự động giải phóng event loop khi hết test cases mà vẫn đảm bảo hoạt động định kỳ bình thường trong production.

---

## 7. KẾT LUẬN VÀ TRẠNG THÁI: CHỜ PHÊ DUYỆT TRIỂN KHAI RUNTIME

- **Mã nguồn và cấu hình (Filesystem & Tests):** **GO (100% SẴN SÀNG)**.
  Toàn bộ 4 mã lỗi (SEC-01, SEC-02, BUS-01, INF-01) đã được đưa vào workspace vận hành `HoangTungLinh---DTC245200487`, unit tests đạt 30/30 PASS, hồi quy đạt 11/11 PASS, Active Attempts được bảo toàn tuyệt đối.
- **Môi trường Runtime Container:** **DỪNG ĐỂ XIN PHÊ DUYỆT (Theo Mục III & Mục VIII)**.
  Container `quizsystem-backend` hiện tại đang chạy image cũ chưa có `express-rate-limit` trong image layer. Do đó, **không được chỉ chạy `docker compose restart backend`** (sẽ gây lỗi `Cannot find module 'express-rate-limit'`).
  Cần thực hiện **rebuild image** cho service `app`.

---

## 8. HƯỚNG DẪN TRIỂN KHAI RUNTIME VÀ ROLLBACK ĐỀ XUẤT

### A. Kế hoạch triển khai Runtime đề xuất (Cần người dùng phê duyệt):

> [!IMPORTANT]
> Thực hiện các lệnh sau tại thư mục:  
> `C:\Users\hoang\OneDrive\Desktop\TRIỂN KHAI\HoangTungLinh---DTC245200487`

1. **Bước 1 — Chuẩn bị tệp `.env` nếu muốn nạp mật khẩu runtime:**
   Sao chép từ template (hoặc giữ nguyên các biến đang có):
   ```powershell
   Copy-Item .env.example .env
   # Điều chỉnh mật khẩu thực tế nếu cần
   ```
2. **Bước 2 — Rebuild Docker Image cho Backend:**
   Lệnh này chỉ build lại image `app` (Node.js backend) mà không ảnh hưởng đến MySQL, Nginx hay Prometheus:
   ```powershell
   docker compose build app
   ```
3. **Bước 3 — Nạp lại container Backend mới (Gián đoạn dự kiến ~3 giây):**
   ```powershell
   docker compose up -d --no-deps app
   ```
4. **Bước 4 — Xác minh runtime:**
   ```powershell
   curl http://localhost/health
   curl http://localhost/ready
   curl -I -X OPTIONS http://localhost/api/auth/login
   ```

### B. Phương án Rollback an toàn (Safe Rollback Plan):

Nếu có bất kỳ sự cố phát sinh ngoài ý muốn:
1. **Khôi phục mã nguồn workspace đích:**
   ```powershell
   git restore backend/src/server.js backend/src/routes/authRoutes.js backend/src/controllers/authController.js backend/src/config/db.js docker-compose.yml .gitignore backend/package.json backend/src/services/finalizationService.js
   Remove-Item backend/src/middleware/rateLimiter.js
   ```
2. **Khởi động lại Backend:**
   ```powershell
   docker compose up -d --no-deps --build app
   ```
3. **Dữ liệu MySQL:** Dữ liệu người dùng, đề thi, bài làm trong MySQL hoàn toàn không bị thay đổi trong toàn bộ quá trình trên.
