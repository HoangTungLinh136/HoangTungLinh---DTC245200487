# QUIZSYSTEM — DECISION PACKAGE: IA01-F01
## Authoritative Deadline Invariant, Durable Commit & Admission Feasibility

**Document ID:** DR-F01-DECISION-PACKAGE  
**Target Finding:** IA01-F01 (Deadline & Durable Receipt Invariant)  
**System:** QuizSystem — Đề tài 35  
**Author:** Antigravity (Senior Software Architect & Security Auditor)  
**Date:** 2026-10-22  
**Gate Status:** Gate 01-A — BLOCKED (Awaiting User Review & Explicit Policy Decision)  
**Policy Status:** Current Policy Active | DR-F01-CHANGE PROPOSED (NOT APPROVED)

---

## 1. CHÍNH SÁCH $R \le C < D$ HIỆN TẠI

Trong toàn bộ tài liệu thiết kế gốc và baseline R8, quy tắc giới hạn hạn nộp bài được định nghĩa như sau:

$$\mathbf{R \le C < D}$$

Trong đó:
- **$R$ (Received Timestamp):** Thời điểm máy chủ (Reverse Proxy Nginx / Ứng dụng Node.js) nhận đủ byte cuối cùng của payload HTTP request gửi từ sinh viên.
- **$C$ (Durable Commit Timestamp):** Thời điểm giao dịch lưu câu trả lời hoặc nộp bài được ghi nhận bền vững (durable commit) xuống đĩa vật lý của hệ quản trị CSDL MySQL (`COMMIT` thành công trong InnoDB Redo Log / WAL).
- **$D$ (Authoritative Deadline):** Mốc thời gian kết thúc làm bài chính thức do máy chủ ấn định (`exam_attempts.deadline_at = started_at + duration_minutes * 60`).

### Quy tắc nghiệp vụ bắt buộc:
Một yêu cầu lưu nháp (SAVE) hoặc nộp bài (SUBMIT) chỉ được coi là hợp lệ (Admitted) khi và chỉ khi nó được commit bền vững xuống cơ sở dữ liệu **trước** hạn chót ($C < D$). Mọi yêu cầu có $C \ge D$, bất kể thời điểm sinh viên gửi $R$, đều bị máy chủ từ chối với mã lỗi `HTTP 400 Bad Request` hoặc `HTTP 409 Conflict`.

---

## 2. VÌ SAO IMPLEMENTATION HIỆN TẠI CHƯA THỂ CHỨNG MINH TUYỆT ĐỐI

Trong môi trường triển khai thực tế (MySQL 8.0 đơn node, container hóa trên Docker Desktop, hệ điều hành Windows 11):

1. **Giới hạn vật lý của I/O Storage & Page Cache:**  
   Mặc dù MySQL được cấu hình `innodb_flush_log_at_trx_commit = 1` và `sync_binlog = 1`, quá trình chuyển đổi từ bộ nhớ đệm (OS buffer cache) xuống phiến đĩa vật lý (NVMe SSD non-volatile cells) mất từ $1\text{ms}$ đến $50\text{ms}$ tùy thuộc tải I/O.
2. **Khoảng trống thời gian giữa $R$ và $C$ ($T_{process} = C - R$):**  
   Khi có $N$ sinh viên nộp bài đồng thời vào những giây cuối cùng ($D - 2\text{s}$), các giao dịch phải xếp hàng tranh chấp khóa hàng (`FOR UPDATE` trên `exam_attempts` và ghi vào `attempt_answers`, `attempt_receipts`). Độ trễ hàng đợi $T_{queue}$ có thể vượt quá $2\text{s}$. Khi đó, một yêu cầu nhận lúc $R = D - 1\text{s} < D$ sẽ bị hoàn tất commit tại $C = D + 1.5\text{s} \ge D$.
3. **Thiếu chứng thực đồng thuận bên ngoài (Binlog Witness / Consensus Quorum):**  
   Nếu hệ thống máy chủ bị mất điện đột ngột hoặc kernel panic ngay tại thời điểm $t = D - 10\text{ms}$, sau khi máy chủ khởi động lại, log CSDL không thể tự chứng minh được liệu giao dịch đã kịp flush xuống đĩa trước $D$ hay chưa nếu không có một quorum độc lập làm nhân chứng ghi nhận log đồng thuận (e.g. Raft/Paxos journal).

Do đó, về mặt khoa học máy tính và lý thuyết hệ thống phân tán, **chính sách $R \le C < D$ là bất khả thi để chứng minh 100% trong mọi kịch bản sự cố phần cứng/sập nguồn mà không dẫn đến việc loại bỏ oan uổng bài thi của sinh viên.**

---

## 3. PHÂN TÍCH PHẢN VÍ DỤ SẬP NGUỒN H1 & H2 (CRASH COUNTEREXAMPLES)

### Phản ví dụ H1: Nhận trước hạn nhưng sập nguồn trước khi xả Redo Log
- **Trạng thái ban đầu:** Sinh viên A làm bài thi có $D = \text{10:00:00.000}$.
- **Diễn biến:**
  1. Lúc $t = \text{09:59:59.900}$ ($R = D - 100\text{ms}$): Máy chủ Nginx/Node.js nhận trọn vẹn request `POST /api/attempts/1/submit`.
  2. Lúc $t = \text{09:59:59.950}$: Backend mở transaction, kiểm tra thấy attempt đang `in_progress`, deadline chưa qua, thực thi lệnh `UPDATE exam_attempts SET status = 'completed'`.
  3. Lúc $t = \text{09:59:59.990}$ ($D - 10\text{ms}$): Phần cứng máy chủ bị ngắt điện đột ngột trước khi MySQL kịp hoàn tất lệnh `fsync()` đưa Redo Log vào SSD.
  4. Lúc $t = \text{10:01:00.000}$ (sau khi khởi động lại máy chủ): MySQL crash recovery chạy, thấy giao dịch chưa commit nên rollback về trạng thái trước đó. Background finalizer quét thấy attempt vẫn ở trạng thái `in_progress` nhưng hiện tại đã là `10:01:00` ($> D$), lập tức chuyển trạng thái attempt thành `expired` với 0 điểm.
- **Hệ quả của H1:** Dưới chính sách $R \le C < D$, sinh viên đã gửi bài hợp lệ trước hạn ($R < D$) nhưng bị trượt môn vì sự cố hạ tầng máy chủ mà không có cách nào tự bảo vệ quyền lợi.

### Phản ví dụ H2: Mất gói ACK sau khi Commit bền vững & Tranh chấp Replay
- **Trạng thái ban đầu:** Sinh viên B nộp bài lúc $t = \text{09:59:59.950}$ ($R < D$).
- **Diễn biến:**
  1. MySQL commit thành công lúc $t = \text{09:59:59.980}$ ($C < D$).
  2. Tuy nhiên, trước khi gói tin HTTP 200 gửi ngược về sinh viên, đường truyền mạng phía sinh viên bị rớt (client timeout/dropped packet).
  3. Client tự động gửi lại (retry) cùng request lúc $t = \text{10:00:00.200}$ ($R' > D$).
- **Hệ quả của H2:**
  - Nếu không có bảng biên nhận `attempt_receipts`, server sẽ nhìn vào $R'$ và attempt đã `completed` để trả về lỗi tranh chấp hoặc từ chối do quá hạn.
  - Kiểm toán viên độc lập không thể phân biệt được bài thi nộp thành công là do request hợp lệ lúc $09:59:59.950$ hay do request trễ lúc $10:00:00.200$ nếu không lưu trữ digest và timestamp của cả hai lần nhận.

---

## 4. PHƯƠNG ÁN A: GIỮ NGUYÊN CHÍNH SÁCH $R \le C < D$ VÀ GIỚI HẠN KHẢ THI

### Nội dung:
Giữ nguyên triệt để bất biến toán học: Mọi hành động ghi dữ liệu phải hoàn thành `COMMIT` trong CSDL trước thời điểm $D$. Nếu vì bất kỳ lý do gì (kẹt mạng nội bộ, CSDL nghẽn I/O, khóa hàng) mà thời điểm commit rơi vào $C \ge D$, hệ thống **bắt buộc phải reject**.

### Giới hạn kỹ thuật và khả thi:
1. **Dung lượng chịu tải (Throughput ceiling):** Hệ thống chỉ đảm bảo tính đúng đắn khi số lượng sinh viên nộp bài đồng thời trong 5 giây cuối cùng không vượt quá khả năng xử lý giao dịch tuần tự của MySQL (ước tính tối đa 50-80 TPS trên phần cứng hiện tại).
2. **Cấu hình bắt buộc:**
   - `innodb_flush_log_at_trx_commit = 1`
   - Bảng `attempt_receipts` với khóa duy nhất `UNIQUE(actor_id, attempt_id, request_id)` để ngăn chặn lost ACK replay.
3. **Hạn chế cố hữu:** Bất kỳ sự cố mất điện nào xảy ra trước `COMMIT` đều được coi là bài thi không hợp lệ. Sinh viên phải chấp nhận rủi ro kỹ thuật nếu nộp sát nút (dưới 2 giây trước giờ G).

---

## 5. PHƯƠNG ÁN B: ĐỀ XUẤT THAY ĐỔI DR-F01-CHANGE (PROPOSED)

### Nội dung đề xuất:
Chuyển tiêu chí chấp nhận nộp bài (Admission Criterion) từ thời điểm commit CSDL ($C$) sang **thời điểm máy chủ nhận đủ gói tin ($R$)**:

$$\mathbf{R < D \quad \text{và} \quad C \ge R}$$

### Cơ chế hoạt động:
1. Khi máy chủ (Reverse Proxy Nginx) nhận đủ byte cuối của body request nộp bài, nó đóng dấu biên nhận thời gian nhận đủ: $R = T_{\text{received}}$.
2. Nếu $R < D$, yêu cầu được **chấp thuận vào hàng đợi xử lý (Admitted)**.
3. Transaction CSDL thực hiện ghi nhận câu trả lời kèm theo giá trị $R$ được chứng thực. Ngay cả khi do nghẽn tải CSDL mà commit diễn ra lúc $C = D + 1.2\text{s}$, giao dịch vẫn được phép commit thành công vì căn cứ admission $R$ đã thỏa mãn trước deadline.
4. Nếu máy chủ nhận được gói tin khi $R \ge D$, yêu cầu bị từ chối ngay lập tức tại tầng gateway mà không cần đẩy tải vào CSDL.

---

## 6. PHÂN BIỆT RÕ RÀNG 4 THỜI ĐIỂM CỐT LÕI

Để đảm bảo tính minh bạch tuyệt đối, hệ thống tách bạch 4 cột mốc thời gian:

```
[Client]                [Nginx / Gateway]          [Backend Node.js]           [MySQL InnoDB]
   |                            |                          |                         |
   |--- (1) Gửi HTTP Request -->|                          |                         |
   |                            |-- (1) R: Nhận đủ byte -->|                         |
   |                            |                          |-- (2) T_admit: Hợp lệ ->|
   |                            |                          |                         |-- (3) C: COMMIT Redo Log
   |                            |                          |<-- (3) DB ACK ----------|
   |                            |<-- (4) HTTP 200 OK ------|
   |<-- (4) Hiển thị kết quả ---|
```

| Cột mốc | Tên gọi | Định nghĩa | Ý nghĩa pháp lý / Nghiệp vụ |
| :--- | :--- | :--- | :--- |
| **(1) $R$** | **Server Fully-Received Time** | Thời điểm máy chủ đọc xong byte cuối cùng của request body. | Mốc xác định sinh viên đã hoàn thành chuyển giao dữ liệu cho nhà trường. |
| **(2) $T_{\text{admit}}$** | **Admission Decision** | Thời điểm ứng dụng kiểm tra tính hợp lệ (token, trạng thái in_progress, quyền dự thi). | Quyết định logic: Bài thi có được phép ghi nhận hay không. |
| **(3) $C$** | **Durable Commit** | Thời điểm InnoDB hoàn tất xả Redo Log xuống đĩa cứng vật lý. | Dữ liệu đạt tính bền vững (Durability trong ACID), không thể bị rollback. |
| **(4) $T_{\text{applied}}$** | **Business Application** | Thời điểm kết quả thi được áp dụng (tính điểm, khóa lượt thi, công bố kết quả). | Nghiệp vụ hoàn tất, sẵn sàng phục vụ tra cứu và thống kê. |

---

## 7. TÁC ĐỘNG ĐẾN SINH VIÊN, GIÁO VIÊN VÀ TÍNH CÔNG BẰNG

| Tiêu chí so sánh | Phương án A: Giữ nguyên $R \le C < D$ | Phương án B: Đề xuất DR-F01-CHANGE ($R < D$) |
| :--- | :--- | :--- |
| **Bảo vệ sinh viên** | **Kém:** Sinh viên phải gánh toàn bộ rủi ro về độ trễ mạng nội bộ máy chủ, hàng đợi CSDL và lock contention. | **Cao:** Sinh viên chỉ cần đảm bảo tín hiệu đến máy chủ trước giờ G; không bị trừng phạt bởi độ trễ máy chủ. |
| **Tính công bằng giữa các thí sinh** | **Không đồng nhất:** Hai sinh viên cùng bấm nộp lúc $D - 0.5\text{s}$, sinh viên A được commit trước thì ĐẠT, sinh viên B bị lock sau 0.6s thì TRƯỢT. | **Tuyệt đối:** Mọi sinh viên gửi bài đến máy chủ trước $D$ đều được công nhận bình đẳng. |
| **Gánh nặng cho giáo viên** | **Lớn:** Phải tiếp nhận nhiều khiếu nại của sinh viên khẳng định "em đã bấm nộp trước khi đồng hồ hết giờ". | **Thấp:** Có log Nginx/Access log chứng minh rõ ràng thời điểm $R$; nếu $R \ge D$ sinh viên không thể khiếu nại. |
| **Độ phức tạp triển khai** | **Thấp:** Chỉ cần kiểm tra `NOW() < deadline_at` trong truy vấn SQL. | **Trung bình:** Cần đồng bộ NTP giữa Reverse Proxy và Backend, lưu trữ $R$ trong bảng biên nhận. |

---

## 8. CÁC TRƯỜNG HỢP KHÔNG XÁC ĐỊNH ĐƯỢC ADMISSION (UNDETERMINED CASES)

Trong thực tế vận hành mạng IP, tồn tại các kịch bản không thể xác định được $R$:
1. **Đứt cáp / Rớt sóng giữa chừng:** Sinh viên bấm nộp bài lúc $D - 1\text{s}$, nhưng gói tin TCP bị phân mảnh và chỉ gửi được 60% dữ liệu trước khi mất mạng hoàn toàn.
   - *Xử lý:* $R = \emptyset$ (chưa nhận đủ). Máy chủ hủy kết nối; yêu cầu **không được admit**. Khi sinh viên có mạng lại, attempt đã expired.
2. **Sập nguồn Gateway trước khi ghi log:** Nginx nhận đủ byte nhưng phần cứng sập nguồn trước khi chuyển tiếp cho Node.js và trước khi ghi access log.
   - *Xử lý:* Không có dấu vết kỹ thuật tồn tại trên máy chủ. Trạng thái là **Undetermined**.
   - *Chính sách xử lý:* Bắt buộc áp dụng quy trình khiếu nại ngoại lệ của Giảng viên.

---

## 9. QUY TRÌNH RECOVERY VÀ XỬ LÝ SỰ CỐ (INCIDENT HANDLING)

Khi xảy ra sự cố sập nguồn máy chủ trong kỳ thi:

1. **Khôi phục tự động (Automated Recovery):**
   - Background worker `processStaleGradingRecovery` tự động quét các bài thi bị kẹt ở trạng thái `grading` hoặc `ungraded` sau khi hệ thống khởi động lại.
   - Worker sử dụng Fencing Token và Lease Renewal để tiếp quản và hoàn tất chấm điểm cho các bài thi đã commit thành công trước sự cố.
2. **Khôi phục ngoại lệ có can thiệp của Giáo viên (Administrative Reconciliation):**
   - Quản trị viên trích xuất log của Nginx (`/var/log/nginx/access.log`) tìm kiếm các request nộp bài có mã `request_id` được ghi nhận với `$time_iso8601 < D`.
   - Nếu tìm thấy biên nhận hợp lệ nhưng CSDL bị rollback do crash, Quản trị viên/Giáo viên sử dụng script đối soát để tái nộp (replay) payload từ log đệm vào CSDL với cờ `reconciled_by_admin = 1`.
   - Mọi thao tác đều được ghi lại trong bảng `audit_logs` để đảm bảo trách nhiệm giải trình.

---

## 10. ĐIỀU KIỆN KIỂM THỬ VÀ ĐIỀU KIỆN TRIỂN KHAI

Để một trong hai phương án được đưa vào vận hành chính thức, cần thỏa mãn:
1. **Đồng bộ thời gian:** Máy chủ Linux container và Windows host phải đồng bộ NTP sai số dưới $10\text{ms}$.
2. **Kiểm thử chịu tải:** Chạy kịch bản 50 kết nối đồng thời gửi draft và submit trong cửa sổ 2 giây trước deadline.
3. **Bộ test hợp đồng:** Toàn bộ 21 kịch bản kiểm thử trong `backend/tests/test_r2_contracts.js` phải được thực thi định kỳ.

---

## 11. CHÍNH XÁC QUYẾT ĐỊNH CẦN NGƯỜI DÙNG PHÊ DUYỆT

Để gỡ bỏ trạng thái **BLOCKED** của Gate 01-A và chốt baseline kỹ thuật, Người dùng (Product Owner / Giảng viên hướng dẫn) cần đưa ra quyết định chính thức cho các câu hỏi sau:

> ### QUYẾT ĐỊNH 1: LỰA CHỌN CHÍNH SÁCH HẠN CHÓT NỘP BÀI
> - **LỰA CHỌN 1-A (Giữ nguyên hiện tại):** Duy trì bất biến $R \le C < D$. Chấp nhận rằng nếu CSDL bị nghẽn dẫn đến $C \ge D$, bài thi của sinh viên sẽ bị từ chối dù sinh viên bấm nộp trước deadline.
> - **LỰA CHỌN 1-B (Phê duyệt DR-F01-CHANGE):** Phê duyệt chính sách $R < D$ dựa trên thời điểm máy chủ nhận đủ byte dữ liệu. Giao dịch CSDL được phép hoàn tất sau deadline ($C \ge D$) miễn là thời điểm nhận $R < D$.

> ### QUYẾT ĐỊNH 2: XỬ LÝ KHIẾU NẠI SỰ CỐ MẤT ĐIỆN PHẦN CỨNG
> - **LỰA CHỌN 2-A:** Không hỗ trợ khôi phục bài thi bị mất giao dịch do sập nguồn phần cứng (sinh viên phải thi lại lượt khác nếu còn lượt).
> - **LỰA CHỌN 2-B:** Cho phép Giáo viên đối soát Nginx Access Log để khôi phục bài thi có $R < D$ đã bị mất do CSDL rollback.

---

*Tài liệu này được lập hoàn chỉnh, khách quan và không tự ý thay đổi chính sách đã được duyệt trước đó.*  
*Trạng thái: CHỜ NGƯỜI DÙNG PHÊ DUYỆT TRỰC TIẾP.*
