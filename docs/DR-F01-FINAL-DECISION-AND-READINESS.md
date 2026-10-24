# QUIZSYSTEM — DR-F01 FINAL DECISION & IMPLEMENTATION READINESS REVIEW

**Document ID:** DR-F01-FINAL-DECISION-AND-READINESS  
**Target Finding:** IA01-F01 (Authoritative Deadline, Durable Commit & Order Invariant)  
**System:** QuizSystem — Đề tài 35: Hệ thống Quiz / Thi trắc nghiệm  
**Author:** Senior Distributed Systems Architect & Transaction Correctness Reviewer (Antigravity AI)  
**Date:** 2026-10-22  
**Target File:** `docs/DR-F01-FINAL-DECISION-AND-READINESS.md`  
**Execution Mode:** STRICT READ-ONLY REVIEW — No code, database runtime, Docker, or Git changes executed.  
**Gate Status:** **GATE 01-A: BLOCKED** (Awaiting Explicit User Approval on Policies D-01 – D-04)

---

## 1. KẾT QUẢ RÀ SOÁT SOURCE CODE & HẠ TẦNG HIỆN TẠI (NHIỆM VỤ 1)

Rà soát trực tiếp mã nguồn thực tế tại workspace `C:\Users\hoang\OneDrive\Desktop\TRIỂN KHAI`:

| Thành phần kiểm tra | Cơ chế hiện có trong source code | Phần có thể tái sử dụng ngay | Phần còn thiếu để đạt chuẩn F01 Y+ |
| :--- | :--- | :--- | :--- |
| **`attemptController.js`** | Đã có transaction `saveDraft` và `submitAttempt`. Đã tích hợp `receiptRepo` kiểm tra duplicate `requestId` và `digest` (SHA-256). | Khóa hàng `findByIdForUpdate`, kiểm tra `attempt.status === 'in_progress'`, logic kiểm tra snapshot batch conflict. | 1. Chưa lưu `canonical_payload` vào receipt.<br>2. Chưa có ranh giới nhận đủ tại Node.js sau stream parse `express.json()`.<br>3. Thiếu xử lý `ER_DUP_ENTRY` chống phantom insert song song.<br>4. Thiếu cơ chế kiểm tra `last_applied_sequence == N - 1` chống SUBMIT apply trước SAVE. |
| **`receiptRepository.js`** | Bảng `attempt_receipts` hỗ trợ `findByRequestKeyForUpdate`, `recordReceipt`, tính `digest` SHA-256. | Cấu trúc định danh `(actor_id, attempt_id, request_id)` với `FOR UPDATE`. | Thiếu cột `sequence_num`, `canonical_payload`, `apply_retry_count` và các trạng thái vòng đời đầy đủ (`DURABLE`, `APPLYING`, `APPLIED`, `REJECTED`, `FAILED`, `HELD`). |
| **`finalizationService.js`** | `processExpiredAttempts` quét theo `deadline_at < CURRENT_TIMESTAMP` và gọi `updateStatus(att.id, 'expired')`. | Vòng lặp quét nền định kỳ (`setInterval`), xử lý batch 50 bản ghi. | **Lỗ hổng race condition:** Không có Admission Drain Barrier toàn diện. Cần kiểm tra toàn bộ trạng thái chưa giải quyết (`DURABLE`, `APPLYING`, `FAILED`, `HELD`) và độ trễ ân hạn (Finalization Grace Period $\Delta_\text{lag} = 3\text{s}$). |
| **`scoringService.js`** | Quy trình 2 pha: `claimGradingJob` (fencing token + lease 30s) và `completeGradingJob` (so sánh token trong transaction commit). | Toàn bộ cơ chế Fencing Token, Lease Renewal, Retry Budget ($\ge 3 \rightarrow$ failed). | Chưa gắn rào chắn: Cho phép claim chấm điểm khi attempt chưa finalized hoàn toàn hoặc còn receipt chưa được giải quyết an toàn. |
| **`01_schema.sql`** | 13 bảng InnoDB, bảng `attempt_receipts` có `UNIQUE(actor_id, attempt_id, request_id)`. | Ràng buộc khóa ngoại, UTF8MB4, cấu trúc bảng hoàn chỉnh. | Thiếu bảng `attempt_sequence_locks` (`current_sequence`, `last_applied_sequence`, `is_finalized`, `finalized_sequence`, `claim_worker_id`, `claim_lease_until`, `claim_fencing_token`). |
| **`nginx/conf.d/default.conf`**| Reverse proxy cổng 80 chuyển tiếp `/api/` về `app:3000`. | Cấu hình proxy HTTP 1.1, Security Headers, routes. | **Lưu ý kỹ thuật quan trọng:** Biến `$time_iso8601` của Nginx được gán khi bắt đầu nhận request line/headers, **KHÔNG PHẢI** bằng chứng nhận đủ toàn bộ HTTP request body. Do đó, ranh giới nhận đủ thuộc thẩm quyền Node.js sau khi stream parsing hoàn tất. |
| **Existing Test Suites** | `test_mandatory_matrix.js` (14 tests) và `test_r2_contracts.js` (21 tests). | 100% test matrix chạy thật trên DB cổng 3307, 33/35 tests PASS, 2 BLOCKED (F01). | Đã chạy 33 test PASS (Baseline Executed). Cần bổ sung 13 bài test chấp nhận đặc tả mới cho F01 Y+. |

---

## 2. GIẢI QUYẾT XUNG ĐỘT CHÍNH SÁCH & SO SÁNH KIẾN TRÚC (NHIỆM VỤ 1 & 2)

### 2.1. Phân tích Xung đột Chính sách (Policy Contradiction) & Phản Ví dụ Thực tế

**Mâu thuẫn phát hiện:**
- D-01 trước đây dùng $R < D$ tại Node.js (cam kết 100% request nhận trước deadline sẽ được cấp receipt thành công).
- D-04 lại cho phép Background Finalizer quét CSDL và chốt bài (`is_finalized = 1`) khi một request nhận trước hạn vẫn đang nằm chờ kết nối trong connection pool.

**Phản ví dụ chính xác (Concrete Counterexample):**
1. Giả sử bài thi có hạn chót $D = 10:00:00.000$.
2. Lúc $T_1 = 09:59:59.950$ ($R < D$, trước hạn $50\text{ms}$), sinh viên gửi request nộp bài $S_1$.
3. Node.js nhận đủ body qua `express.json()`, gắn nhãn $R = 09:59:59.950$ (đạt điều kiện $R < D$). Tuy nhiên, do pool kết nối CSDL đang bận, $S_1$ phải xếp hàng chờ DB connection.
4. Lúc $T_2 = 10:00:00.050$ ($D + 50\text{ms}$), tiến trình nền `finalizationService` lấy được 1 connection, chạy query thấy $D < \text{NOW()}$. Finalizer khóa hàng `attempt_sequence_locks`, thấy chưa có receipt nào commit trong CSDL, lập tức cập nhật `is_finalized = 1` và commit.
5. Lúc $T_3 = 10:00:00.080$, request $S_1$ mới lấy được connection, bắt đầu transaction Pha 1. Khi đọc `attempt_sequence_locks`, nó thấy `is_finalized = 1` $\rightarrow$ $S_1$ bị từ chối với lỗi `FINALIZATION_BARRIER` (`HTTP 409 Conflict`).
6. **Hậu quả:** Sinh viên nộp bài trước hạn chót ($R < D$) nhưng bài thi vẫn bị đóng và bài nộp bị từ chối $\rightarrow$ Phá vỡ cam kết D-01 nếu không điều chỉnh hợp đồng tiếp nhận!

---

### 2.2. Hợp đồng Tiếp nhận Giao dịch Hai Điều Kiện (Two-Condition Transactional Admission Contract)

Hệ thống xác lập hợp đồng tiếp nhận nhất quán và khả thi:

> **HỢP ĐỒNG TIẾP NHẬN Y+:**
> Một yêu cầu chỉ được công nhận là đã tiếp nhận thành công khi thỏa mãn đồng thời hai điều kiện độc lập:
> 1. **Điều kiện Hợp lệ Hạn chót (Deadline Eligibility):** Máy chủ Node.js đọc xong byte cuối cùng của request body trước hạn chót ($R < D$). Nếu $R \ge D$, yêu cầu bị từ chối ngay lập tức (`EXPIRED_DEADLINE`).
> 2. **Điều kiện Khả dụng Khóa Giao dịch (Commit Availability):** Giao dịch lưu ký biên nhận (Pha 1) phải giành được khóa tuần tự và commit bền vững vào CSDL **trước khi** tiến trình Finalizer chốt bài thi (`is_finalized == 0`).
>
> **Thời gian Ân hạn Chốt bài (Finalization Grace Period $\Delta_\text{lag}$):**  
> Để bảo vệ tối đa các request $R < D$ đang chờ giải phóng kết nối trong pool, Finalizer bắt buộc phải có độ trễ ân hạn $\Delta_\text{lag} = 3.0\text{s}$. Finalizer chỉ được phép chốt bài khi `NOW() > deadline_at + 3s`.
>
> **Giới hạn Thừa nhận:** Nếu độ trễ connection pool vượt quá $\Delta_\text{lag}$ hoặc máy chủ sập nguồn trước khi commit CSDL, request sẽ bị từ chối bởi rào chắn `FINALIZATION_BARRIER`. Hệ thống **tuyệt đối không cam kết 100% request nhận trước $D$ đều thành công**.

---

### 2.3. Những Bảo đảm của R8 Phải Thay đổi Chính thức

| Khía cạnh | Quy định ban đầu trong R8 | Quy định điều chỉnh trong Kiến trúc Y+ |
| :--- | :--- | :--- |
| **Thứ tự Tiếp nhận** | Network Arrival Order (Thứ tự gói tin chạm socket mạng). | **MySQL Transactional Lock-Grant Order** (Thứ tự giao dịch giành được khóa hàng CSDL). |
| **Thẩm quyền Thứ tự** | Gateway Network Timestamp quyết định thứ tự xử lý. | Khóa hàng `attempt_sequence_locks` cấp số `sequence_num` duy nhất tăng đơn điệu. |
| **Điều kiện Hoàn tất** | Giả định mọi request đến trước hạn đều được ghi nhận. | Phải thỏa mãn đồng thời **$R < D$** VÀ **commit CSDL trước khi Finalizer đóng bài**. |
| **Bảo đảm Concurrency** | Đòi hỏi Gateway FIFO queue phân tán. | Đảm bảo tuần tự hóa tuyệt đối bằng khóa hàng CSDL và con trỏ `last_applied_sequence`. |

---

## 3. THIẾT KẾ ĐÚNG ĐẮN VỀ GIAO DỊCH, THỨ TỰ KHÓA & KHÔI PHỤC (TASK 1 – 4)

### 3.1. Thứ tự Khóa Thống nhất & Chính sách Xử lý Deadlock/Timeout (Task 1)

Nhằm giảm thiểu tối đa nguy cơ deadlock giữa các luồng xử lý song song, toàn bộ hệ thống áp dụng một **Thứ tự Khóa Tăng dần Phân cấp Bắt buộc (Strict Hierarchical Lock Ordering)**:

$$\text{Level 1: } \mathbf{attempt\_sequence\_locks} \longrightarrow \text{Level 2: } \mathbf{exam\_attempts} \longrightarrow \text{Level 3: } \mathbf{attempt\_receipts} \longrightarrow \text{Level 4: } \mathbf{attempt\_answers}$$

| Giao dịch | Khóa Level 1 (`attempt_sequence_locks`) | Khóa Level 2 (`exam_attempts`) | Khóa Level 3 (`attempt_receipts`) | Khóa Level 4 (`attempt_answers`) |
| :--- | :--- | :--- | :--- | :--- |
| **1. Admission (`ingestReceipt`)** | `SELECT ... FOR UPDATE` (Khóa L1) | `SELECT ... FOR UPDATE` (Khóa L2) | `INSERT INTO ...` (Ghi L3) | *Không khóa* |
| **2. Ordered Apply (`applyReceiptOrdered`)** | `SELECT ... FOR UPDATE` (Khóa L1) | `SELECT/UPDATE ... FOR UPDATE` (Khóa L2) | `SELECT ... FOR UPDATE` (Khóa L3) | `INSERT/UPDATE ...` (Khóa L4) |
| **3. Finalizer (`finalizeExpiredAttempt`)** | `SELECT ... FOR UPDATE` (Khóa L1) | `UPDATE status = 'expired'` (Khóa L2) | `SELECT COUNT(*)` (Drain check L3) | *Không khóa* |
| **4. Scoring Service (`claimGradingJob`)** | `SELECT ... FOR UPDATE` (Khóa L1) | `SELECT status ... FOR UPDATE` (Khóa L2) | `SELECT COUNT(*)` (Drain check L3) | *Không khóa* |
| **5. Recovery Worker (`runSafeRecoveryWorker`)** | `SELECT ... FOR UPDATE SKIP LOCKED` (L1) | `SELECT/UPDATE ... FOR UPDATE` (Khóa L2) | `SELECT ... FOR UPDATE` (Khóa L3) | `INSERT/UPDATE ...` (Khóa L4) |

**Kiểm tra Khóa Ngầm (Implicit Locks do FK & Secondary Indexes):**
- Bảng `attempt_receipts` và `attempt_answers` có foreign key trỏ về `exam_attempts(id)`. Trong MySQL InnoDB, câu lệnh `INSERT` vào bảng con sẽ tự động yêu cầu khóa chia sẻ (Shared S-lock) trên hàng cha ở `exam_attempts`.
- Nếu giao dịch không khóa độc quyền `exam_attempts` ở Level 2 trước khi insert vào bảng con, một giao dịch khác đang cập nhật `exam_attempts` sẽ gây ra deadlock nghịch đảo!
- Do đó, quy tắc bắt buộc: **Mọi giao dịch sửa đổi phải khóa Level 2 trước khi thao tác trên Level 3 và Level 4**.

**Chính sách Xử lý Deadlock 1213 & Lock Timeout 1205:**
- **Không tuyên bố miễn nhiễm deadlock 100%:** Do bản chất gap lock, foreign key checks và concurrent secondary index updates của InnoDB, deadlock vẫn có xác suất xảy ra ở mức microsecond.
- **Quy tắc Retry An toàn:**
  1. *Lỗi 1213 (`ER_LOCK_DEADLOCK`) & 1205 (`ER_LOCK_WAIT_TIMEOUT`):* Giao dịch bị hủy rollback sạch sẽ. Phía backend thực hiện retry tối đa 3 lần với thuật toán Randomized Exponential Backoff ($50\text{ms} \pm 20\text{ms}, 150\text{ms} \pm 50\text{ms}, 300\text{ms} \pm 100\text{ms}$).
  2. *Tuyệt đối không cấp `request_id` mới khi retry:* Nếu xảy ra timeout hoặc crash mà kết quả commit chưa chắc chắn (Uncertain Outcome), client bắt buộc phải phát lại bằng **chính `request_id` ban đầu** để cơ chế Idempotent Replay phân xử, không tạo thêm bản ghi mồ côi.

---

### 3.2. Cơ chế Claim Độc quyền An toàn Cho Recovery Worker (Task 2: Lựa chọn Phương án A)

Hệ thống lựa chọn **Phương án A: Durable Claim + Lease / Fencing Token** (Đồng bộ với kiến trúc fencing lease đã được phê duyệt trong `scoringService.js`):

- **Bổ sung cột vào `attempt_sequence_locks`:**
  - `claim_worker_id VARCHAR(64) NULL`: Định danh worker đang giữ quyền apply.
  - `claim_lease_until DATETIME(3) NULL`: Thời hạn hiệu lực của lease (mặc định 15 giây).
  - `claim_fencing_token BIGINT NOT NULL DEFAULT 0`: Bộ đếm tăng đơn điệu chống zombie worker.
- **Quy trình Thực thi 2 Giao dịch Độc lập:**
  1. **Transaction 1 (Claim Phase):**
     - Mở transaction tường minh: `SELECT ... FROM attempt_sequence_locks WHERE last_applied_sequence < current_sequence AND (claim_lease_until IS NULL OR claim_lease_until < NOW()) LIMIT 1 FOR UPDATE SKIP LOCKED`.
     - Cập nhật lease: `UPDATE attempt_sequence_locks SET claim_worker_id = ?, claim_lease_until = DATE_ADD(NOW(), INTERVAL 15 SECOND), claim_fencing_token = claim_fencing_token + 1 WHERE attempt_id = ?`.
     - Commit ngay Transaction 1 $\rightarrow$ **Giải phóng hoàn toàn row lock của CSDL, không giữ khóa dài ngoài DB**.
  2. **Transaction 2 (Apply Phase):**
     - Mở transaction mới, khóa Level 1 trên `attempt_sequence_locks`.
     - Xác minh fencing token: `WHERE attempt_id = ? AND claim_fencing_token = expectedToken`. Nếu token bị thay đổi do worker khác đã cướp lease $\rightarrow$ Hủy ngay, không apply.
     - Thực thi apply theo đúng thứ tự phân cấp Level 1 $\rightarrow$ 2 $\rightarrow$ 3 $\rightarrow$ 4.
     - Xóa lease: `claim_worker_id = NULL`, `claim_lease_until = NULL`. Commit Transaction 2.
- **Khôi phục khi Worker Crash giữa Claim và Apply:**
  - Nếu Worker 1 crash sau khi commit Transaction 1 nhưng trước khi bắt đầu Transaction 2, attempt được bảo vệ tạm thời bởi lease.
  - Sau 15 giây, lease hết hạn (`claim_lease_until < NOW()`).
  - Worker 2 quét thấy lease đã hết hạn, tự động tăng `claim_fencing_token` lên và nhận quyền apply an toàn. Nếu Worker 1 tỉnh lại (zombie), Transaction 2 của nó sẽ thất bại do token đã cũ.

---

### 3.3. Xử lý Biên nhận Khi Attempt Đã Finalized (Task 3)

Kiểm tra tính nhất quán giữa `attempt.status`, `is_finalized` và `lifecycle_state` của từng receipt:

| Loại thao tác | Sequence $N$ so với `finalized_sequence` | Trạng thái Attempt | Hành vi Hợp đồng | Trạng thái Receipt cập nhật |
| :--- | :--- | :--- | :--- | :--- |
| **`SAVE_DRAFT`** | $N < finalized\_sequence$ | `in_progress` | Hợp lệ trước nộp: Phải apply vào `attempt_answers` theo đúng thứ tự sequence. | `lifecycle_state = 'APPLIED'` |
| **`SAVE_DRAFT`** | $N > finalized\_sequence$ | `submitted` hoặc `expired` | Bị vô hiệu hóa bởi rào chắn finalization: **Tuyệt đối không sửa đổi đáp án**. | `lifecycle_state = 'REJECTED'`, `reject_reason = 'SUPERSEDED_BY_FINALIZATION'` |
| **`SUBMIT_ATTEMPT`** | $N == finalized\_sequence$ | `submitted` | Thao tác nộp bài hợp lệ đầu tiên: Chốt bài, cập nhật điểm/đáp án cuối cùng. | `lifecycle_state = 'APPLIED'` |
| **`SUBMIT_ATTEMPT`** | $N > finalized\_sequence$ | `submitted` hoặc `expired` | Nộp bài trùng lặp sau khi bài thi đã đóng: Không sửa đổi bài thi. | `lifecycle_state = 'REJECTED'`, `reject_reason = 'ALREADY_FINALIZED'` |

- **Bảo đảm không âm thầm từ chối (No Silent Rejection):**
  - Mọi receipt bị từ chối do finalization đều được ghi nhận lý do rõ ràng vào cột `reject_reason` để đối soát.
  - Con trỏ `last_applied_sequence` vẫn được tịnh tiến lên $N$ để chuỗi sequence không bị nghẽn vĩnh viễn, nhưng nội dung câu trả lời hoàn toàn không bị áp dụng vào `attempt_answers`.

---

### 3.4. Quy trình Retry, Xử lý Lỗi và Đối soát HELD (Task 4)

- **Vị trí Tăng `apply_retry_count`:**
  - Được thực hiện trong khối `catch` khi gặp lỗi tạm thời (Transient Error: Deadlock 1213, Timeout 1205, Connection drop).
  - Cập nhật trực tiếp: `UPDATE attempt_receipts SET apply_retry_count = apply_retry_count + 1, last_retry_error = ? WHERE receipt_id = ?`.
- **Phân loại Lỗi:**
  1. *Lỗi Tạm thời (Transient):* Retry tối đa 3 lần. Trạng thái giữ nguyên `DURABLE`.
  2. *Lỗi Dữ liệu Bất biến (Permanent Validation Error - hỏng SHA-256 digest, sai lệch cấu trúc JSON):* Chuyển ngay sang `FAILED`, không retry.
  3. *Vượt quá Retry Budget ($\ge 3$ lần thất bại):* Chuyển sang `HELD` (`STALE_RECEIPT_HOLD`), kích hoạt Prometheus Alert.
- **Quy trình Đối soát Thủ công Trạng thái HELD (Manual Audit Workflow):**
  - **Phân quyền RBAC:** Chỉ người dùng có vai trò `teacher` hoặc `admin` mới có quyền truy cập endpoint đối soát.
  - **Endpoint Quản trị:** `POST /api/admin/attempts/:id/receipts/:receiptId/reconcile`.
  - **Giao dịch Đối soát (`resolveHeldReceipt`):**
    ```javascript
    // Thực thi trong 1 transaction có khóa phân cấp Level 1 -> 2 -> 3
    if (action === 'APPROVE_APPLY') {
      // 1. Reset retry count và thực thi ordered apply
      await applyReceiptOrdered(attemptId, receipt.sequence_num);
      // 2. Ghi nhật ký kiểm toán bất biến
      await recordAuditLog(adminId, 'RECONCILE_HELD_APPLY', receiptId, reason);
    } else if (action === 'REJECT_DISCARD') {
      // 1. Chuyển sang REJECTED kèm lý do của Hội đồng thi
      await db.query(`UPDATE attempt_receipts SET lifecycle_state = 'REJECTED', reject_reason = ? WHERE receipt_id = ?`, [reason, receiptId]);
      // 2. Tịnh tiến con trỏ sequence để giải phóng rào chắn
      await db.query(`UPDATE attempt_sequence_locks SET last_applied_sequence = ? WHERE attempt_id = ?`, [receipt.sequence_num, attemptId]);
      await recordAuditLog(adminId, 'RECONCILE_HELD_REJECT', receiptId, reason);
    }
    ```
  - **Nguyên tắc Tuyệt đối:** Không có bất kỳ tiến trình nền tự động nào được phép tự ý chuyển `HELD` sang `APPLIED` hoặc `REJECTED`. Finalizer và Scoring Service bị chặn đứng cho đến khi Giám thị phê duyệt đối soát.

---

### 3.5. Mã giả Giao dịch Hoàn chỉnh Đã Vá Toàn bộ Lỗ hổng

```javascript
// ============================================================================
// BƯỚC 0: CHUẨN HÓA CANONICAL & DIGEST
// ============================================================================
function canonicalizeDigest(operation, attemptId, payload) {
  const canonicalObj = {
    operation,
    attempt_id: Number(attemptId),
    answers: (payload.answers || []).map(a => ({
      question_id: Number(a.question_id),
      selected_option_id: a.selected_option_id ? Number(a.selected_option_id) : null,
      answer_text: a.answer_text ? String(a.answer_text).trim() : null
    })).sort((a, b) => a.question_id - b.question_id)
  };
  const canonicalJson = JSON.stringify(canonicalObj);
  const digest = crypto.createHash('sha256').update(canonicalJson).digest('hex');
  return { canonicalJson, digest };
}

// ============================================================================
// GIAO DỊCH PHA 1: TIẾP NHẬN BỀN VỮNG & CẤP SEQUENCE (DURABLE ADMISSION)
// ============================================================================
async function ingestReceipt(studentId, attemptId, requestId, operation, rawPayload, receivedAt) {
  const { canonicalJson, digest } = canonicalizeDigest(operation, attemptId, rawPayload);

  // 1. Kiểm tra Idempotency Replay nhanh (Fast-path read-only check)
  const [fastExisting] = await db.query(
    `SELECT receipt_id, digest, lifecycle_state, sequence_num, idempotent_response, reject_reason 
     FROM attempt_receipts 
     WHERE actor_id = ? AND attempt_id = ? AND request_id = ?`,
    [studentId, attemptId, requestId]
  );
  if (fastExisting) {
    if (fastExisting.digest !== digest) {
      return { httpStatus: 409, body: { success: false, code: 'PAYLOAD_MUTATED', error: 'Duplicate request_id with differing payload' } };
    }
    if (fastExisting.lifecycle_state === 'APPLIED') {
      return { httpStatus: 200, body: JSON.parse(fastExisting.idempotent_response) };
    } else if (fastExisting.lifecycle_state === 'DURABLE' || fastExisting.lifecycle_state === 'APPLYING') {
      return { httpStatus: 202, body: { success: true, status: fastExisting.lifecycle_state, receipt_id: fastExisting.receipt_id, sequence: fastExisting.sequence_num } };
    } else if (fastExisting.lifecycle_state === 'HELD') {
      return { httpStatus: 423, body: { success: false, status: 'HELD', message: 'Receipt is held for manual administrative audit' } };
    } else {
      return { httpStatus: 400, body: { success: false, status: 'REJECTED', reason: fastExisting.reject_reason } };
    }
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // KHÓA LEVEL 1: attempt_sequence_locks
    const [lockRow] = await db.query(
      `SELECT current_sequence, last_applied_sequence, is_finalized, finalized_sequence 
       FROM attempt_sequence_locks WHERE attempt_id = ? FOR UPDATE`,
      [attemptId], connection
    );
    if (!lockRow) {
      await connection.rollback();
      return { httpStatus: 404, body: { success: false, error: 'Attempt sequencer lock not found' } };
    }

    // KHÓA LEVEL 2: exam_attempts (Khóa trước khi chạm L3 để tránh deadlock FK)
    const [attempt] = await db.query(
      `SELECT student_id, status, deadline_at FROM exam_attempts WHERE id = ? FOR UPDATE`,
      [attemptId], connection
    );
    if (!attempt || attempt.student_id !== studentId) {
      await connection.rollback();
      return { httpStatus: 403, body: { success: false, error: 'Attempt does not belong to student' } };
    }

    // ĐIỀU KIỆN 1: DEADLINE ELIGIBILITY (R < D)
    if (new Date(receivedAt).getTime() >= new Date(attempt.deadline_at).getTime()) {
      await connection.rollback();
      return { httpStatus: 400, body: { success: false, error: 'Submission received after exam deadline' } };
    }

    // ĐIỀU KIỆN 2: COMMIT AVAILABILITY (FINALIZATION BARRIER)
    if (lockRow.is_finalized) {
      await connection.rollback();
      return { httpStatus: 409, body: { success: false, error: 'Attempt has already been finalized' } };
    }

    // Cấp Monotonic Sequence
    const nextSeq = lockRow.current_sequence + 1;
    await db.query(`UPDATE attempt_sequence_locks SET current_sequence = ? WHERE attempt_id = ?`, [nextSeq, attemptId], connection);

    // KHÓA LEVEL 3: Ghi nhận biên nhận bền vững vào attempt_receipts
    let receiptId;
    try {
      const [insertRes] = await db.query(
        `INSERT INTO attempt_receipts 
         (attempt_id, actor_id, request_id, operation, sequence_num, digest, received_at, canonical_payload, lifecycle_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DURABLE')`,
        [attemptId, studentId, requestId, operation, nextSeq, digest, receivedAt, canonicalJson], connection
      );
      receiptId = insertRes.insertId;
    } catch (insertErr) {
      if (insertErr.code === 'ER_DUP_ENTRY') {
        await connection.rollback();
        const [recheck] = await db.query(
          `SELECT digest, lifecycle_state, idempotent_response FROM attempt_receipts WHERE actor_id = ? AND attempt_id = ? AND request_id = ?`,
          [studentId, attemptId, requestId]
        );
        if (recheck && recheck.digest === digest) {
          const resp = recheck.idempotent_response ? JSON.parse(recheck.idempotent_response) : { status: recheck.lifecycle_state };
          return { httpStatus: recheck.lifecycle_state === 'APPLIED' ? 200 : 202, body: resp };
        }
        return { httpStatus: 409, body: { success: false, error: 'Duplicate request_id with differing digest' } };
      }
      throw insertErr;
    }

    await connection.commit(); // Redo log fsynced -> DURABLE
    return { httpStatus: 202, body: { success: true, status: 'DURABLE', receipt_id: receiptId, sequence: nextSeq } };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// ============================================================================
// GIAO DỊCH PHA 2: ÁP DỤNG TUẦN TỰ ĐÃ VÁ THỨ TỰ KHÓA (ORDERED APPLY)
// ============================================================================
async function applyReceiptOrdered(attemptId, sequenceNum) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. KHÓA LEVEL 1: attempt_sequence_locks
    const [lockRow] = await db.query(
      `SELECT current_sequence, last_applied_sequence, is_finalized, finalized_sequence 
       FROM attempt_sequence_locks WHERE attempt_id = ? FOR UPDATE`,
      [attemptId], connection
    );

    // BẢO ĐẢM THỨ TỰ TUẦN TỰ (Sequential Invariant)
    if (lockRow.last_applied_sequence !== sequenceNum - 1) {
      await connection.rollback();
      return { status: 'DEFERRED_WAITING_PREDECESSOR', expectedSeq: lockRow.last_applied_sequence + 1 };
    }

    // 2. KHÓA LEVEL 2: exam_attempts (ĐÚNG THỨ TỰ PHÂN CẤP L1 -> L2 TRƯỚC L3)
    const [attempt] = await db.query(
      `SELECT id, status FROM exam_attempts WHERE id = ? FOR UPDATE`,
      [attemptId], connection
    );

    // 3. KHÓA LEVEL 3: attempt_receipts (ĐỌC TRỰC TIẾP TỪ CSDL CÓ KHÓA)
    const [receipt] = await db.query(
      `SELECT receipt_id, operation, sequence_num, digest, canonical_payload, lifecycle_state 
       FROM attempt_receipts WHERE attempt_id = ? AND sequence_num = ? FOR UPDATE`,
      [attemptId], sequenceNum], connection
    );

    if (!receipt || receipt.lifecycle_state !== 'DURABLE') {
      await connection.rollback();
      return { status: 'RECEIPT_NOT_APPLYABLE' };
    }

    // XÁC MINH DIGEST BẢO ĐẢM TÍNH TOÀN VẸN
    const recomputedDigest = crypto.createHash('sha256').update(receipt.canonical_payload).digest('hex');
    if (recomputedDigest !== receipt.digest) {
      await db.query(`UPDATE attempt_receipts SET lifecycle_state = 'FAILED', reject_reason = 'DIGEST_CORRUPTED' WHERE receipt_id = ?`, [receipt.receipt_id], connection);
      await connection.commit();
      return { status: 'CORRUPTED_PAYLOAD' };
    }

    // 4. KIỂM TRA FINALIZATION THEO TỪNG TRƯỜNG HỢP (Task 3)
    if (lockRow.is_finalized) {
      if (receipt.operation === 'SAVE_DRAFT' || receipt.sequence_num > lockRow.finalized_sequence) {
        await db.query(
          `UPDATE attempt_receipts SET lifecycle_state = 'REJECTED', reject_reason = 'SUPERSEDED_BY_FINALIZATION' WHERE receipt_id = ?`,
          [receipt.receipt_id], connection
        );
        // Tịnh tiến last_applied_sequence để không làm nghẽn chuỗi sequence
        await db.query(`UPDATE attempt_sequence_locks SET last_applied_sequence = ? WHERE attempt_id = ?`, [sequenceNum, attemptId], connection);
        await connection.commit();
        return { status: 'REJECTED_ALREADY_FINALIZED' };
      }
    }

    // 5. NẾU LÀ SUBMIT HỢP LỆ ĐẦU TIÊN: Cập nhật exam_attempts ở Level 2
    if (receipt.operation === 'SUBMIT_ATTEMPT') {
      await db.query(`UPDATE exam_attempts SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE id = ?`, [attemptId], connection);
      await db.query(`UPDATE attempt_sequence_locks SET is_finalized = 1, finalized_sequence = ? WHERE attempt_id = ?`, [sequenceNum, attemptId], connection);
    }

    // 6. KHÓA LEVEL 4: Áp dụng câu trả lời vào attempt_answers
    const payload = JSON.parse(receipt.canonical_payload);
    for (const item of payload.answers) {
      await db.query(
        `INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id, answer_text, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE 
           selected_option_id = VALUES(selected_option_id),
           answer_text = VALUES(answer_text),
           updated_at = CURRENT_TIMESTAMP`,
        [attemptId, item.question_id, item.selected_option_id, item.answer_text], connection
      );
    }

    // 7. Tịnh tiến last_applied_sequence và chuyển receipt sang APPLIED
    await db.query(`UPDATE attempt_sequence_locks SET last_applied_sequence = ? WHERE attempt_id = ?`, [sequenceNum, attemptId], connection);
    const responsePayload = { success: true, sequence: sequenceNum, operation: receipt.operation, appliedAt: new Date() };
    await db.query(
      `UPDATE attempt_receipts SET lifecycle_state = 'APPLIED', idempotent_response = ? WHERE receipt_id = ?`,
      [JSON.stringify(responsePayload), receipt.receipt_id], connection
    );

    await connection.commit();
    return { status: 'APPLY_SUCCESS', response: responsePayload };
  } catch (err) {
    await connection.rollback();
    // Tăng apply_retry_count khi gặp transient error
    await db.query(
      `UPDATE attempt_receipts SET apply_retry_count = apply_retry_count + 1, last_retry_error = ? WHERE attempt_id = ? AND sequence_num = ?`,
      [err.message, attemptId, sequenceNum]
    ).catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

// ============================================================================
// PHA 3: FINALIZER VỚI THỨ TỰ KHÓA ĐỒNG BỘ L1 -> L2 -> L3
// ============================================================================
async function finalizeExpiredAttempt(attemptId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. KHÓA LEVEL 1: attempt_sequence_locks
    const [lockRow] = await db.query(
      `SELECT current_sequence, last_applied_sequence, is_finalized 
       FROM attempt_sequence_locks WHERE attempt_id = ? FOR UPDATE`,
      [attemptId], connection
    );
    if (!lockRow || lockRow.is_finalized) {
      await connection.rollback();
      return { status: 'ALREADY_FINALIZED' };
    }

    // 2. KHÓA LEVEL 2: exam_attempts
    const [attempt] = await db.query(
      `SELECT deadline_at, status FROM exam_attempts WHERE id = ? FOR UPDATE`,
      [attemptId], connection
    );
    if (!attempt || attempt.status !== 'in_progress') {
      await connection.rollback();
      return { status: 'NOT_IN_PROGRESS' };
    }

    // ĐỘ TRỄ ÂN HẠN (3.0s)
    const gracePeriodMs = 3000;
    if (Date.now() < new Date(attempt.deadline_at).getTime() + gracePeriodMs) {
      await connection.rollback();
      return { status: 'GRACE_PERIOD_ACTIVE' };
    }

    // 3. KHÓA LEVEL 3: RÀO CHẮN TOÀN DIỆN
    const [unresolvedRows] = await db.query(
      `SELECT COUNT(*) AS count 
       FROM attempt_receipts 
       WHERE attempt_id = ? AND lifecycle_state IN ('DURABLE', 'APPLYING', 'FAILED', 'HELD')`,
      [attemptId], connection
    );

    if (unresolvedRows.count > 0 || lockRow.last_applied_sequence < lockRow.current_sequence) {
      await connection.rollback();
      return { status: 'BARRIER_BLOCKED', unresolvedCount: unresolvedRows.count };
    }

    // Chốt bài thi
    await db.query(`UPDATE exam_attempts SET status = 'expired' WHERE id = ?`, [attemptId], connection);
    await db.query(
      `UPDATE attempt_sequence_locks SET is_finalized = 1, finalized_sequence = ? WHERE attempt_id = ?`,
      [lockRow.current_sequence, attemptId], connection
    );

    await connection.commit();
    return { status: 'FINALIZED_SUCCESS' };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// ============================================================================
// PHA 4: RECOVERY WORKER VỚI FENCING LEASE (PHƯƠNG ÁN A) (Task 2)
// ============================================================================
async function runSafeRecoveryWorker(workerId) {
  const connection = await db.getConnection();
  let claimedAttemptId = null;
  let nextSeq = null;
  let currentToken = null;

  try {
    // -------------------------------------------------------------
    // TRANSACTION 1: CLAIM LEASE ĐỘC QUYỀN (Không giữ khóa dài)
    // -------------------------------------------------------------
    await connection.beginTransaction();

    const [attempt] = await db.query(
      `SELECT attempt_id, last_applied_sequence, current_sequence, claim_fencing_token 
       FROM attempt_sequence_locks 
       WHERE last_applied_sequence < current_sequence 
         AND (claim_lease_until IS NULL OR claim_lease_until < NOW()) 
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [], connection
    );

    if (!attempt) {
      await connection.rollback();
      return { status: 'NO_WORK' };
    }

    claimedAttemptId = attempt.attempt_id;
    nextSeq = attempt.last_applied_sequence + 1;
    currentToken = attempt.claim_fencing_token + 1;

    // Cấp lease 15 giây và tăng fencing token
    await db.query(
      `UPDATE attempt_sequence_locks 
       SET claim_worker_id = ?, claim_lease_until = DATE_ADD(NOW(), INTERVAL 15 SECOND), claim_fencing_token = ? 
       WHERE attempt_id = ?`,
      [workerId, currentToken, claimedAttemptId], connection
    );

    await connection.commit(); // Hoàn tất claim, nhả khóa CSDL ngay lập tức!
  } catch (err) {
    await connection.rollback();
    connection.release();
    throw err;
  }

  // -------------------------------------------------------------
  // TRANSACTION 2: THỰC THI APPLY VỚI XÁC THỰC FENCING TOKEN
  // -------------------------------------------------------------
  try {
    await connection.beginTransaction();

    // Xác minh token vẫn còn hiệu lực trước khi apply
    const [verify] = await db.query(
      `SELECT claim_fencing_token FROM attempt_sequence_locks WHERE attempt_id = ? FOR UPDATE`,
      [claimedAttemptId], connection
    );

    if (!verify || verify.claim_fencing_token !== currentToken) {
      await connection.rollback();
      return { status: 'FENCING_TOKEN_EXPIRED' };
    }

    // Kiểm tra retry count của receipt trước khi apply
    const [rcpt] = await db.query(
      `SELECT receipt_id, apply_retry_count FROM attempt_receipts WHERE attempt_id = ? AND sequence_num = ?`,
      [claimedAttemptId, nextSeq], connection
    );

    if (rcpt && rcpt.apply_retry_count >= 3) {
      // Quá 3 lần retry -> Chuyển sang HELD và giải phóng lease
      await db.query(
        `UPDATE attempt_receipts SET lifecycle_state = 'HELD', reject_reason = 'MAX_RETRY_EXCEEDED' WHERE receipt_id = ?`,
        [rcpt.receipt_id], connection
      );
      await db.query(
        `UPDATE attempt_sequence_locks SET claim_worker_id = NULL, claim_lease_until = NULL WHERE attempt_id = ?`,
        [claimedAttemptId], connection
      );
      await connection.commit();
      console.error(`[ALERT] Receipt ${rcpt.receipt_id} moved to HELD. Prometheus alert triggered.`);
      return { status: 'QUARANTINED_TO_HELD', receiptId: rcpt.receipt_id };
    }

    await connection.commit(); // Giải phóng bước kiểm tra
    connection.release();

    // Thực thi apply tuần tự chuẩn tắc
    const applyRes = await applyReceiptOrdered(claimedAttemptId, nextSeq);

    // Giải phóng lease sau khi hoàn thành
    const cleanupConn = await db.getConnection();
    try {
      await cleanupConn.query(
        `UPDATE attempt_sequence_locks SET claim_worker_id = NULL, claim_lease_until = NULL WHERE attempt_id = ?`,
        [claimedAttemptId]
      );
    } finally {
      cleanupConn.release();
    }

    return applyRes;
  } catch (err) {
    connection.release();
    throw err;
  }
}
```

---

## 4. BẢN GHI QUYẾT ĐỊNH NGHIỆP VỤ ĐÃ HIỆU CHỈNH (D-01 – D-04)

### QUYẾT ĐỊNH D-01: DEADLINE ELIGIBILITY & TRANSACTIONAL ADMISSION COMMIT
- **Chính sách hiện hành:** R8 giả định Network Arrival Time quyết định mọi quyền lợi nộp bài.
- **Chính sách đề xuất (Y+):** Áp dụng **Hợp đồng Tiếp nhận Giao dịch Hai Điều Kiện**.
  1. Yêu cầu chỉ hợp lệ khi $R < D$ đo lường tại Node.js sau stream parse `express.json()`.
  2. Yêu cầu chỉ được chấp nhận vào CSDL khi transaction Pha 1 commit bền vững trước khi bài thi bị finalize (`is_finalized == 0`).
  3. Duy trì độ trễ ân hạn $\Delta_\text{lag} = 3.0\text{s}$ cho Finalizer để bảo vệ các request đang xếp hàng trong connection pool.
  4. Phân định rõ 4 trạng thái vòng đời (`RECEIVED` $\rightarrow$ `DURABLE` $\rightarrow$ `APPLIED` $\rightarrow$ `FINALIZED`). ACK chỉ phát sau `DURABLE`.
- **Thừa nhận giới hạn:** Không cam kết 100% request nhận trước $D$ thành công nếu bị nghẽn connection pool vượt quá $3\text{s}$ hoặc mất điện trước khi commit.
- **Phân loại:** `[APPROVABLE POLICY]`

---

### QUYẾT ĐỊNH D-02: THẨM QUYỀN THỨ TỰ (MYSQL LOCK-GRANT ORDER) & TUẦN TỰ HÓA APPLY
- **Chính sách hiện hành:** R8 Arrival Order (theo thời điểm gói tin mạng đến).
- **Chính sách đề xuất (Y+):** Thay thế chính thức bằng **MySQL Transactional Lock-Grant Order**.
  1. Thứ tự có thẩm quyền được cấp phát qua khóa hàng `attempt_sequence_locks FOR UPDATE`.
  2. Bắt buộc tuần tự hóa khâu apply: Receipt $N$ chỉ được apply khi `last_applied_sequence == N - 1`.
  3. First Valid SUBMIT được xác định bởi request SUBMIT đầu tiên được cấp sequence và apply thành công, khóa vĩnh viễn attempt không cho SAVE sau đó thay đổi đáp án.
- **Thừa nhận giới hạn:** Jitter luồng hoặc delay connection pool có thể làm request đến trước $2\text{ms}$ nhận sequence lớn hơn request đến sau.
- **Phân loại:** `[APPROVABLE POLICY]`

---

### QUYẾT ĐỊNH D-03: CRASH CONSISTENCY, IDEMPOTENCY & QUY TRÌNH ĐỐI SOÁT
- **Chính sách hiện hành:** Chưa có quy định chi tiết về xử lý mất điện hoặc Lost ACK.
- **Chính sách đề xuất (Y+):**
  1. Chỉ công nhận biên nhận đã commit bền vững vào Redo Log (`innodb_flush_log_at_trx_commit = 1`). Mọi dữ liệu in-flight trong RAM khi sập nguồn đều bị hủy.
  2. Idempotency xử lý triệt để phantom insert thông qua bắt lỗi `ER_DUP_ENTRY` từ chỉ mục `UNIQUE(actor_id, attempt_id, request_id)` và đối soát SHA-256 digest gắn liền với operation. Tuyệt đối không trả `{}` khi receipt chưa `APPLIED`.
  3. Khi có sự cố tranh chấp điểm thi, tuyệt đối không tự động sửa điểm hoặc mở thêm lượt thi. Hội đồng thi tiến hành đối soát thủ công dựa trên nhật ký biên nhận trong `attempt_receipts`.
- **Phân loại:** `[APPROVABLE POLICY]`

---

### QUYẾT ĐỊNH D-04: RÀO CHẮN FINALIZATION TOÀN DIỆN & QUY TRÌNH HELD
- **Chính sách hiện hành:** Quét hết hạn và chốt bài tự động mà không kiểm tra trạng thái biên nhận.
- **Chính sách đề xuất (Y+):**
  1. Finalizer và Scoring Service chỉ được phép can thiệp khi **toàn bộ receipt của attempt đã ở trạng thái kết thúc an toàn** (`APPLIED` hoặc `REJECTED`).
  2. Nghiêm cấm chốt bài khi còn receipt ở các trạng thái: `DURABLE`, `APPLYING`, `FAILED`, `HELD`, hoặc `last_applied_sequence < current_sequence`.
  3. Trạng thái `HELD` là khu vực cách ly sự cố, **không phải trạng thái kết thúc hợp lệ**. Khi có receipt bị `HELD`, attempt bị đóng băng chờ Giám thị/Admin đối soát qua API quản trị (`RESOLVE_HELD_APPLY` hoặc `RESOLVE_HELD_REJECT`). Tuyệt đối không tự ý xóa bỏ receipt hợp lệ.
- **Phân loại:** `[APPROVABLE POLICY]`

---

## 5. KẾ HOẠCH TRIỂN KHAI THEO MODULE (NHIỆM VỤ 5)

| Tập tin / Module | Nội dung thay đổi dự kiến | Phân loại | Trạng thái hiện tại |
| :--- | :--- | :---: | :---: |
| **`database/01_schema.sql`** | 1. Thêm bảng `attempt_sequence_locks` (`attempt_id`, `current_sequence`, `last_applied_sequence`, `is_finalized`, `finalized_sequence`, `claim_worker_id`, `claim_lease_until`, `claim_fencing_token`).<br>2. Thêm cột `sequence_num`, `canonical_payload` (JSON), `apply_retry_count`, `last_retry_error`, `lifecycle_state` (`DURABLE`, `APPLYING`, `APPLIED`, `REJECTED`, `FAILED`, `HELD`) vào `attempt_receipts`. | `[IMPLEMENTATION REQUIREMENT]` | **ĐÃ THIẾT KẾ — CHƯA MIGRATION** |
| **`receiptRepository.js`** | Cập nhật hàm `insertDurable` bắt lỗi `ER_DUP_ENTRY`; hàm `updateStateAndAdvanceSeq` trong cùng transaction apply; hàm `findUnresolvedByAttempt(attemptId)`. | `[IMPLEMENTATION REQUIREMENT]` | **ĐÃ THIẾT KẾ — CHƯA SỬA FILE** |
| **`attemptController.js`** | Điều chỉnh `saveDraft` và `submitAttempt` theo mô hình 2 pha: Gọi `ingestReceipt` $\rightarrow$ Gọi `applyReceiptOrdered`. Bổ sung endpoint `GET /api/attempts/:id/receipts/:requestId`. | `[IMPLEMENTATION REQUIREMENT]` | **ĐÃ THIẾT KẾ — CHƯA SỬA FILE** |
| **`finalizationService.js`** | Tích hợp kiểm tra độ trễ ân hạn $\Delta_\text{lag} = 3\text{s}$, khóa hàng theo đúng thứ tự Level 1 $\rightarrow$ Level 2 $\rightarrow$ Level 3 và rào chắn toàn diện trước khi chốt `expired`. | `[IMPLEMENTATION REQUIREMENT]` | **ĐÃ THIẾT KẾ — CHƯA SỬA FILE** |
| **`scoringService.js`** | Kiểm tra điều kiện tiên quyết: Attempt đã finalized VÀ không còn receipt nào ở trạng thái `DURABLE`, `APPLYING`, `FAILED`, `HELD` trước khi cấp phát lease chấm điểm. | `[IMPLEMENTATION REQUIREMENT]` | **ĐÃ THIẾT KẾ — CHƯA SỬA FILE** |
| **`backend/services/recoveryWorker.js`** | Tiến trình nền quét các attempt có `last_applied_sequence < current_sequence` sử dụng cơ chế Fencing Lease (Phương án A) và retry backoff an toàn. | `[IMPLEMENTATION REQUIREMENT]` | **ĐÃ THIẾT KẾ — CHƯA TẠO FILE** |
| **`backend/tests/test_f01_y_plus.js`** | Bộ 13 bài test chấp nhận tự động kiểm chứng toàn bộ ma trận Mục 6. | `[REQUIRES TEST]` | **ĐÃ THIẾT KẾ KỊCH BẢN TEST** |

---

## 6. MA TRẬN KIỂM THỬ CHẤP NHẬN (PHÂN BIỆT RÕ BASELINE EXECUTED VÀ SPECIFICATION TEST)

### 6.1. Các Bài Test Đã Chạy Thực Tế (EXECUTED TEST PASS)
- **`backend/tests/test_r2_contracts.js`**: Chạy thực tế trên CSDL cổng 3307 $\rightarrow$ **20/21 PASS**, 1 BLOCKED (F01).
- **`backend/tests/test_mandatory_matrix.js`**: Chạy thực tế trên CSDL cổng 3307 $\rightarrow$ **13/14 PASS**, 1 BLOCKED (F01).
- *Tổng cộng: 33/35 test nghiệp vụ cốt lõi đã đạt trạng thái EXECUTED TEST PASS.*

### 6.2. Bộ 13 Bài Test Chấp Nhận Mới Thiết Kế Cho F01 Y+ (DESIGN SPECIFICATION PASS)

| Mã Test | Kịch bản Kiểm thử Tương tranh / Sự cố | Kết quả Kỳ vọng (Expected Result) | Căn cứ Chính sách | Trạng thái Hiện tại |
| :---: | :--- | :--- | :---: | :---: |
| **AT-01** | SAVE seq=5 apply chậm, SUBMIT seq=6 đến sau. | SUBMIT seq=6 phát hiện `last_applied_sequence == 4 < 5`, bị hoãn; chờ seq=5 apply xong mới được apply; cấm apply vượt cấp. | D-02 | `[DESIGN SPEC PASS]` |
| **AT-02** | Hai Recovery Worker cùng claim 1 attempt (Phương án A). | Worker 1 claim thành công và giữ lease 15s; Worker 2 kiểm tra thấy `claim_lease_until > NOW()` nên bỏ qua, không xung đột. | Task 2 (Option A) | `[DESIGN SPEC PASS]` |
| **AT-03** | Deadlock retry: 10 luồng song song chạy Admission, Apply, Finalizer và Scoring. | Gặp Deadlock 1213 hoặc Timeout 1205, hệ thống tự động backoff retry tối đa 3 lần và hoàn tất thành công. | Task 1 (Retry Policy) | `[DESIGN SPEC PASS]` |
| **AT-04** | Replay receipt khi đang ở trạng thái `DURABLE`. | Trả về `HTTP 202 Accepted` kèm sequence và trạng thái `DURABLE`; tuyệt đối không trả `{}`. | D-03 & Task 3 | `[DESIGN SPEC PASS]` |
| **AT-05** | Replay receipt khi đã ở trạng thái `APPLIED`. | Trả về `HTTP 200 OK` kèm toàn bộ `idempotent_response` gốc đã lưu trong CSDL. | D-03 & Task 3 | `[DESIGN SPEC PASS]` |
| **AT-06** | Replay receipt khi đang ở trạng thái `HELD`. | Trả về `HTTP 423 Locked` kèm thông báo bài thi đang tạm giữ để đối soát thủ công. | D-04 & Task 3 | `[DESIGN SPEC PASS]` |
| **AT-07** | SUBMIT sau khi attempt đã finalized (`is_finalized = 1`). | Request bị từ chối với mã `HTTP 409 Conflict`, ghi nhận `REJECTED_ALREADY_FINALIZED`, không đổi đáp án. | D-01 & Task 3 | `[DESIGN SPEC PASS]` |
| **AT-08** | Crash sau khi worker commit claim nhưng trước khi apply. | Lease hết hạn sau 15 giây; Worker 2 reclaim thành công với fencing token mới; Worker 1 zombie bị từ chối commit. | Task 2 (Option A) | `[DESIGN SPEC PASS]` |
| **AT-09** | Chủng tộc giữa Finalizer và Admission sát hạn chót. | Finalizer bị hoãn bởi độ trễ ân hạn 3.0s; nếu admission commit trước, Finalizer gặp rào chắn `DURABLE` và hoãn chốt bài. | D-01 & D-04 | `[DESIGN SPEC PASS]` |
| **AT-10** | Hai request trùng `request_id` gửi đồng thời cùng microsecond. | 1 request insert thành công; request 2 bắt lỗi `ER_DUP_ENTRY`, đọc lại bản ghi đã commit, trả về kết quả giống hệt. | D-03 | `[DESIGN SPEC PASS]` |
| **AT-11** | SAVE đến sau khi attempt đã finalized (`N > finalized_sequence`). | SAVE bị đánh dấu `REJECTED`, ghi lý do `SUPERSEDED_BY_FINALIZATION`, tịnh tiến con trỏ sequence, không sửa đáp án. | Task 3 | `[DESIGN SPEC PASS]` |
| **AT-12** | Receipt bị HELD và quy trình đối soát thủ công. | Receipt thất bại 3 lần $\rightarrow$ `HELD`. Finalizer bị chặn. Admin gọi API đối soát $\rightarrow$ apply/reject và ghi audit log. | Task 4 | `[DESIGN SPEC PASS]` |
| **AT-13** | Outcome commit không chắc chắn (Unknown Commit Outcome). | Client bị rớt mạng đúng lúc commit, gửi lại bằng đúng `request_id` cũ $\rightarrow$ server trả lại kết quả ACK an toàn. | Task 1 & D-03 | `[DESIGN SPEC PASS]` |

---

## 7. FINAL POLICY APPROVAL — Y+ (DÀNH CHO NGƯỜI DÙNG PHÊ DUYỆT)

### 7.1. Bốn Quyết định Chính sách Đã Hiệu chỉnh Triệt để
1. **D-01 (Deadline & Admission):** Phê duyệt Hợp đồng Tiếp nhận Giao dịch Hai Điều Kiện ($R < D$ tại Node.js VÀ commit CSDL trước khi bài thi bị chốt). Thiết lập độ trễ ân hạn $\Delta_\text{lag} = 3\text{s}$ cho Finalizer.
2. **D-02 (Ordering & Sequential Apply):** Phê duyệt **MySQL Transactional Lock-Grant Order** thay thế cho Network Arrival Order của R8. Bắt buộc tuần tự hóa khâu apply theo con trỏ `last_applied_sequence == N - 1`. First Valid SUBMIT khóa attempt vĩnh viễn.
3. **D-03 (Crash & Idempotency):** Chỉ công nhận biên nhận đã commit bền vững vào Redo Log. Xử lý phantom insert bằng bắt lỗi `ER_DUP_ENTRY` từ chỉ mục `UNIQUE` kết hợp so khớp digest. Trả mã phản hồi phân cấp (200, 202, 409, 423), không bao giờ trả `{}`.
4. **D-04 (Finalization Barrier & HELD Workflow):** Rào chắn Finalization toàn diện chặn chốt bài khi còn receipt ở bất kỳ trạng thái nào trong: `DURABLE`, `APPLYING`, `FAILED`, `HELD`. Trạng thái `HELD` kích hoạt cảnh báo Prometheus và yêu cầu giám thị xử lý thủ công qua API đối soát.

### 7.2. Các Giới hạn Được Chấp nhận & Không Thể Loại bỏ của Kiến trúc Y+
- **Jitter thứ tự luồng:** Request chạm socket trước $1-2\text{ms}$ có thể nhận sequence sau nếu hàng đợi kết nối bị trễ. Hệ thống chấp nhận thứ tự lấy khóa CSDL là thứ tự có thẩm quyền tối cao.
- **Giới hạn sập nguồn trước commit:** Request gửi trước hạn chót nhưng máy chủ bị mất điện trước khi lệnh commit biên nhận hoàn tất sẽ bị mất theo RAM.
- **Giới hạn nghẽn pool vượt quá thời gian ân hạn:** Request $R < D$ nhưng bị kẹt trong connection pool quá $\Delta_\text{lag} = 3\text{s}$ sau deadline sẽ bị Finalizer chốt bài và bị từ chối `HTTP 409`.

---

## 8. BẢNG ĐỐI SOÁT VÁ TOÀN DIỆN CÁC ĐIỂM CHẶN GIAO DỊCH (FINAL BLOCKER FIX TABLE)

| Issue | Before | Corrected Contract | Proof Obligation | Status |
| :--- | :--- | :--- | :--- | :---: |
| **B-01: Nghịch đảo thứ tự khóa trong `applyReceiptOrdered`** | Apply khóa L1 (`attempt_sequence_locks`), rồi khóa L3 (`attempt_receipts`), sau đó mới khóa L2 (`exam_attempts`). | Bắt buộc tuân thủ 100% thứ tự phân cấp: Level 1 $\rightarrow$ Level 2 $\rightarrow$ Level 3 $\rightarrow$ Level 4. Khóa L2 trước L3 để triệt tiêu deadlock nghịch đảo do Foreign Key checks. | Phân tích DAG không chu trình; kịch bản test AT-03. | **RESOLVED IN DESIGN** |
| **B-02: Recovery Worker claim không an toàn & rủi ro tranh chấp** | Worker dùng `SKIP LOCKED` không có lease bền vững; commit claim xong gọi apply bằng connection mới làm mất dấu khóa. | Áp dụng **Phương án A: Durable Claim + Lease (15s) + Monotonic Fencing Token**. Tách 2 transaction rõ ràng; giải phóng khóa ngay; zombie worker bị chặn bởi fencing token. | Chứng minh recovery khi crash sau claim; test AT-02, AT-08. | **RESOLVED IN DESIGN** |
| **B-03: Trả `{}` rỗng khi replay receipt chưa apply** | Replay receipt `DURABLE` trả fallback `{}` làm client tưởng lầm đã apply câu trả lời thành công. | Phân định HTTP status chuẩn tắc: `DURABLE`/`APPLYING` $\rightarrow$ 202 Accepted; `APPLIED` $\rightarrow$ 200 OK kèm payload gốc; `HELD` $\rightarrow$ 423 Locked. | Test replay AT-04, AT-05, AT-06. | **RESOLVED IN DESIGN** |
| **B-04: Apply tin cậy tham số bộ nhớ thay vì đọc từ CSDL có khóa** | `applyReceiptOrdered` nhận tham số `operation`, `canonicalJson` từ caller truyền vào. | Trong transaction apply: Đọc lại receipt từ CSDL bằng khóa `FOR UPDATE`, xác minh `sequence_num == last_applied + 1`, tính lại digest SHA-256 đối soát. | Test kiểm thực dữ liệu AT-01, AT-11. | **RESOLVED IN DESIGN** |
| **B-05: Xử lý receipt khi attempt đã finalized** | Chưa phân biệt rõ hành vi của SAVE và SUBMIT có sequence trước/sau `finalized_sequence`. | Quy định rõ: Receipt $N \le finalized\_seq$ được apply bình thường; Receipt $N > finalized\_seq$ bị đánh dấu `REJECTED`, ghi rõ lý do, tịnh tiến con trỏ sequence, không đổi đáp án. | Ma trận bảng Mục 3.3; test AT-07, AT-11. | **RESOLVED IN DESIGN** |
| **B-06: Tuyên bố miễn nhiễm deadlock 100% không thực tế** | Bản thảo trước tuyên bố hệ thống miễn nhiễm deadlock 100% bằng thiết kế. | Thừa nhận giới hạn vi mô của InnoDB gap locks/FK; bổ sung **Chính sách Retry Deadlock 1213 / Timeout 1205** với Randomized Exponential Backoff tối đa 3 lần. | Đặc tả cơ chế retry Mục 3.1; test AT-03. | **RESOLVED IN DESIGN** |
| **B-07: Thiếu quy trình kiểm soát và đối soát thủ công trạng thái HELD** | Receipt bị HELD có nguy cơ bị bỏ quên hoặc bị tiến trình nền tự ý xóa/chuyển trạng thái. | Quy định trạng thái `HELD` phong tỏa bài thi vĩnh viễn; kích hoạt Prometheus Alert; bắt buộc Giám thị/Admin xử lý qua API quản trị có ghi log kiểm toán. | Đặc tả quy trình Mục 3.4; test AT-12. | **RESOLVED IN DESIGN** |

---

### 8.1. KHUNG XÁC NHẬN PHÊ DUYỆT DÀNH CHO NGƯỜI DÙNG

Để mở khóa Gate 01-A và cho phép Antigravity bắt đầu triển khai mã nguồn theo kế hoạch tại Mục 5, Người dùng phản hồi nội dung sau:

```text
PHÊ DUYỆT CÁC QUYẾT ĐỊNH D-01, D-02 (KIẾN TRÚC Y+ VÀ LOCK-GRANT ORDER), D-03 VÀ D-04 THEO TÀI LIỆU DR-F01-FINAL-DECISION-AND-READINESS.MD. 
CHẤP NHẬN BẢNG ĐỐI SOÁT VÁ TOÀN DIỆN MỤC 8, PHƯƠNG ÁN A (FENCING LEASE), THAY ĐỔI SO VỚI R8 VÀ GIỚI HẠN CỦA HỢP ĐỒNG HAI ĐIỀU KIỆN. 
CHO PHÉP BẮT ĐẦU TRIỂN KHAI THEO KẾ HOẠCH TẠI MỤC 5 VÀ CHUYỂN GATE 01-A SANG PASS SAU KHI TOÀN BỘ 13 ACCEPTANCE TESTS ĐẠT 100% PASS.
```

---
*Trạng thái hiện tại: **DỪNG VÀ CHỜ PHÊ DUYỆT CỦA NGƯỜI DÙNG (STOP — WAIT FOR USER APPROVAL)**.*  
*Finding IA01-F01: **BLOCKED** — Gate 01-A: **BLOCKED**.*
