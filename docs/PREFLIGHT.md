# QuizSystem — E0 Pre-flight

Ngày kiểm tra: 2026-10-22, Asia/Saigon. Gate 01-A: BLOCKED.

## 1. Phạm vi quyền

Master Execution Prompt V1.0 cho phép đọc workspace và tạo/cập nhật tài liệu thiết kế. Prompt mới thay thế hạn chế ghi tài liệu trong các handoff cũ. Chưa có quyền ghi application source, cài dependencies, chạy build/test có ghi file, Docker/container, migration/database writes, thay cấu hình máy hoặc Git commit. Không push/merge, production, đổi chính sách hay chuyển Batch 02.

## 2. Kết quả thực tế

| Hạng mục | Kết quả quan sát | Giới hạn |
|---|---|---|
| Workspace | `C:\Users\hoang\OneDrive\Desktop\TRIỂN KHAI` tồn tại và trống trước lượt này | Chỉ tạo tài liệu mới trong `docs/` |
| Source/config/SQL/OpenAPI có sẵn | Không tìm thấy | Không có application để sửa hoặc chạy |
| AGENTS.md | Không tìm thấy trong workspace trống hoặc các ancestor đã kiểm tra | Không có chỉ dẫn local bổ sung |
| Git | Không phải Git repository; status/branch trả lỗi tương ứng | Không chạy git init/commit; không có branch hay tracked changes để báo |
| Thay đổi người dùng có sẵn | Không có file trong workspace lúc kiểm kê | Không ghi đè tài liệu ngoài workspace |
| Git executable | `E:\Git\cmd\git.exe`, 2.55.0.windows.5 | Chỉ kiểm tra đọc |
| Node | v24.19.0, runtime do Codex cung cấp | Chưa chốt version cho image triển khai |
| npm | Không tìm thấy trên PATH | Không cài npm; không có package.json/lockfile |
| pnpm | Có bundled launcher `C:\Users\hoang\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd` | Chỉ đọc launcher, chưa cài dependency hoặc chọn thay package manager |
| Docker CLI | 29.9.1, build dfc520d | Không chứng minh daemon/container đang chạy |
| Docker Compose CLI | v5.6.0 | Chưa chạy compose/config/build/up |
| Database hiện có | Chưa kiểm kê daemon/volumes/database | Không được suy ra không có dữ liệu chỉ vì workspace trống |
| Automated tests | Chưa chạy | BLOCKED_EXECUTION_PERMISSION |

## 3. Nguồn đã đọc

| Nguồn | Bằng chứng |
|---|---|
| `C:\Users\hoang\OneDrive\Desktop\De_Tai_Thuc_Hanh - TKQT HTPM K23.pdf` | 11 trang; đọc lại trang 1, 2, 10; đề 35 tạo đề/làm bài/chấm tự động; MySQL/phpMyAdmin; rubric và Compose/report/demo |
| `C:\Users\hoang\OneDrive\Desktop\ĐỀ TÀI.xlsx` | Sheet `K23.K1.CNTT K23G`: C46 Hoàng Tùng Linh, E46=35, K46 tên đề tài |
| R7 attachment | `C:\Users\hoang\.codex\attachments\b418f476-12bd-4c41-84b8-0c79cfaedff2\Pasted text.txt` |
| Baseline Supplement 02 | `C:\Users\hoang\.codex\attachments\c0705275-acd3-47f3-b504-ecd2ffd066d8\Pasted text.txt` |
| Hội thoại | Phê duyệt deadline, durable receipt, SAVE/SUBMIT, session/revocation, escalation; Master V1.0 là thẩm quyền thực thi mới |

SHA256 đọc tại E0:

```text
PDF:      31BF806FED08785820B0D3BAB73F9EBBDDBADE529B735DA01A0FB4E755DBAB55
Excel:    8ABE4DDD9E6D559802CCFC606CFB7786E5BD5B99A85D46D8CFA6D63E59B0C5C6
Baseline: A17BC67633C939B25557A4BD59A76E133194DEB4D29ED2090BE0E08A2D313B1D
```

## 4. Backup và ranh giới triển khai

Không có workspace files cần backup trước tạo docs mới. Trước bất kỳ DB/container mutation phải kiểm kê read-only database đích, volumes, schema version và dữ liệu; xác nhận development/test; backup và kiểm chứng khả năng restore nếu có dữ liệu. Chưa có quyền hoặc bằng chứng để chạy bước đó. Không dùng volume/database hiện có chưa xác minh. Thiết kế đề xuất môi trường development riêng; chưa tạo môi trường này.

## 5. Handoff E0

E0 đã hoàn tất phần kiểm kê đọc trong phạm vi được phép. Docker daemon health, database inventory, dependency installation, build và runtime tests chưa thực hiện. E1 được ghi tại [DESIGN_BASELINE.md](DESIGN_BASELINE.md), API design tại [openapi.yaml](openapi.yaml). Các file này là tài liệu, không phải implementation.
