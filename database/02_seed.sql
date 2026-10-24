-- =============================================================================
-- QuizSystem Database Production-Realistic Seed Data
-- 30 Tài khoản (1 Admin, 5 Teacher, 24 Student)
-- 80 Câu hỏi chuyên sâu (20 Mạng, 20 CSDL, 20 DevOps, 20 An toàn thông tin)
-- 12 Đề thi (4 Public Published, 3 Assigned Published, 3 Draft, 2 Closed)
-- 60 Lượt làm bài bao quát đầy đủ mọi tình huống nghiệp vụ
-- Mật khẩu mặc định toàn bộ tài khoản: Hoanglinh1#
-- Bcrypt Hash (cost 10): $2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS
-- =============================================================================

USE quizsystem;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. CLEANUP OLD TRANSACTIONAL & TEST DATA
TRUNCATE TABLE attempt_receipts;
TRUNCATE TABLE attempt_answers;
TRUNCATE TABLE attempt_question_snapshots;
TRUNCATE TABLE exam_attempts;
TRUNCATE TABLE exam_assignments;
TRUNCATE TABLE exam_questions;
TRUNCATE TABLE exams;
TRUNCATE TABLE question_choices;
TRUNCATE TABLE questions;
TRUNCATE TABLE password_reset_tokens;
TRUNCATE TABLE user_sessions;
TRUNCATE TABLE audit_logs;
TRUNCATE TABLE users;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- 2. SEED USERS (Tổng cộng chính xác 30 tài khoản: 1 Admin, 5 Teacher, 24 Student)
-- =============================================================================
INSERT INTO users (id, username, email, password_hash, full_name, role, status, created_at) VALUES
-- Admin (1)
(1, 'admin', 'nguyenhung@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Nguyen Quoc Hung', 'admin', 'active', '2026-09-01 08:00:00'),

-- Teachers (5 - Teacher1 giữ nguyên đăng nhập nhanh)
(2, 'teacher1', 'nguyenthay@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'TS. Nguyen Van Thay', 'teacher', 'active', '2026-09-01 08:30:00'),
(25, 'teacher2', 'tranhuong@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'ThS. Tran Thi Mai Huong', 'teacher', 'active', '2026-09-02 09:00:00'),
(26, 'teacher3', 'lenam@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'TS. Le Hoang Nam', 'teacher', 'active', '2026-09-03 10:15:00'),
(27, 'teacher4', 'phamthang@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'ThS. Pham Duc Thang', 'teacher', 'active', '2026-09-04 14:00:00'),
(28, 'teacher5', 'vungan@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'TS. Vu Kim Ngan', 'teacher', 'active', '2026-09-05 16:30:00'),

-- Students (24 - Student1 giữ nguyên đăng nhập nhanh)
(3, 'student1', 'hoanglinh@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Hoang Tung Linh', 'student', 'active', '2026-09-10 08:00:00'),
(4, 'student2', 'lehoa@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Le Thi Hoa', 'student', 'active', '2026-09-10 08:05:00'),
(5, 'student3', 'nguyenan@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Nguyen Van An', 'student', 'active', '2026-09-10 08:10:00'),
(6, 'student4', 'tranbao@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Tran Quoc Bao', 'student', 'active', '2026-09-10 08:15:00'),
(7, 'student5', 'phamha@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Pham Thu Ha', 'student', 'active', '2026-09-10 08:20:00'),
(8, 'student6', 'doduc@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Do Minh Duc', 'student', 'active', '2026-09-10 08:25:00'),
(9, 'student7', 'vumai@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Vu Thi Mai', 'student', 'active', '2026-09-10 08:30:00'),
(10, 'student8', 'hoangkiet@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Hoang Tuan Kiet', 'student', 'active', '2026-09-10 08:35:00'),
(11, 'student9', 'buianh@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Bui Ngoc Anh', 'student', 'active', '2026-09-10 08:40:00'),
(12, 'student10', 'danghuy@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Dang Quoc Huy', 'student', 'active', '2026-09-10 08:45:00'),
(13, 'student11', 'ngohuong@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Ngo Thi Huong', 'student', 'active', '2026-09-10 08:50:00'),
(14, 'student12', 'duongphuc@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Duong Van Phuc', 'student', 'active', '2026-09-10 08:55:00'),
(15, 'student13', 'dinhquan@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Dinh Minh Quan', 'student', 'active', '2026-09-10 09:00:00'),
(16, 'student14', 'lyyen@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Ly Thi Yen', 'student', 'active', '2026-09-10 09:05:00'),
(17, 'student15', 'trinhbao@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Trinh Gia Bao', 'student', 'active', '2026-09-10 09:10:00'),
(18, 'student16', 'luudang@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Luu Hong Dang', 'student', 'active', '2026-09-10 09:15:00'),
(19, 'student17', 'caolinh@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Cao Khanh Linh', 'student', 'active', '2026-09-10 09:20:00'),
(20, 'student18', 'takhoa@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Ta Van Khoa', 'student', 'active', '2026-09-10 09:25:00'),
(21, 'student19', 'doanthuy@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Doan Thi Thuy', 'student', 'active', '2026-09-10 09:30:00'),
(22, 'student20', 'phanthang@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Phan Huu Thang', 'student', 'active', '2026-09-10 09:35:00'),
(23, 'student21', 'maingoc@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Mai Bao Ngoc', 'student', 'active', '2026-09-10 09:40:00'),
(24, 'student22', 'havinh@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Ha Van Vinh', 'student', 'active', '2026-09-10 09:45:00'),
(29, 'student23', 'nguyenminh@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Nguyen Nhat Minh', 'student', 'active', '2026-09-10 09:50:00'),
(30, 'student24', 'vuthao@gmail.com', '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS', 'Vu Thanh Thao', 'student', 'locked', '2026-09-10 09:55:00');

-- =============================================================================
-- 3. SEED QUESTIONS (80 câu hỏi phân bổ 4 môn học: Mạng, CSDL, DevOps, ATTT)
-- =============================================================================
INSERT INTO questions (id, created_by, title, content, question_type, subject, difficulty, status, created_at) VALUES
(1, 2, 'Giao thuc Transport Layer', 'Trong mo hinh OSI, giao thuc nao sau day hoat dong o tang Giao van (Transport Layer)?', 'single_choice', 'Mang May Tinh', 'easy', 'active', '2026-09-15 08:00:00'),
(2, 2, 'Cac giao thuc tren nen TCP', 'Nhung giao thuc ung dung nao sau day chay mac dinh tren nen giao thuc truyen van tin cay TCP?', 'multiple_choice', 'Mang May Tinh', 'medium', 'active', '2026-09-15 08:00:00'),
(3, 2, 'Co che bat tay ba buoc TCP', 'Trong qua trinh khoi tao ket noi TCP (3-Way Handshake), goi tin thu hai tu Server gui ve Client mang cac co (flags) nao?', 'single_choice', 'Mang May Tinh', 'medium', 'active', '2026-09-15 08:00:00'),
(4, 2, 'Dia chi IP Private lop C', 'Dai dia chi IPv4 nao sau day thuoc pham vi dia chi mang noi bo (Private IP) lop C theo chuan RFC 1918?', 'single_choice', 'Mang May Tinh', 'easy', 'active', '2026-09-15 08:00:00'),
(5, 2, 'Uu diem cua giao thuc HTTP/2', 'Nhung dac diem noi bat nao sau day thuoc ve cai tien cua giao thuc HTTP/2 so voi HTTP/1.1?', 'multiple_choice', 'Mang May Tinh', 'hard', 'active', '2026-09-15 08:00:00'),
(6, 2, 'Giao thuc phan giai dia chi ARP', 'Muc dich chinh cua giao thuc Address Resolution Protocol (ARP) la gi?', 'single_choice', 'Mang May Tinh', 'easy', 'active', '2026-09-15 08:00:00'),
(7, 2, 'Chuc nang cua giao thuc ICMP', 'Lenh ping su dung thong diep nao cua giao thuc ICMP de kiem tra tinh thong suot mang?', 'single_choice', 'Mang May Tinh', 'medium', 'active', '2026-09-15 08:00:00'),
(8, 2, 'So sanh TCP va UDP', 'Nhung dac diem nao sau day la dung khi so sanh giua TCP va UDP?', 'multiple_choice', 'Mang May Tinh', 'medium', 'active', '2026-09-15 08:00:00'),
(9, 2, 'Khai niem Subnet Mask va CIDR', 'Mot mang co dia chi 192.168.1.0/26 se co toi da bao nhieu dia chi IP kha dung cho cac may tram (hosts)?', 'single_choice', 'Mang May Tinh', 'hard', 'active', '2026-09-15 08:00:00'),
(10, 2, 'Cac loai ban ghi DNS thong dung', 'Nhung ban ghi DNS nao sau day la hop le va duoc su dung pho bien?', 'multiple_choice', 'Mang May Tinh', 'easy', 'active', '2026-09-15 08:00:00'),
(11, 2, 'Co che hoat dong cua DHCP', 'Trinh tu 4 buoc trao doi goi tin trong co che cap phat IP cua DHCP (DORA) la gi?', 'single_choice', 'Mang May Tinh', 'medium', 'active', '2026-09-15 08:00:00'),
(12, 2, 'Giao thuc truyen file FTP vs SFTP', 'Giao thuc SFTP (SSH File Transfer Protocol) su dung cong (port) mac dinh nao?', 'single_choice', 'Mang May Tinh', 'easy', 'active', '2026-09-15 08:00:00'),
(13, 2, 'Cong mac dinh cua cac dich vu mang', 'Cac cap giao thuc va so hieu cong (port) mac dinh nao sau day la dung?', 'multiple_choice', 'Mang May Tinh', 'easy', 'active', '2026-09-15 08:00:00'),
(14, 2, 'Ky thuat NAT (Network Address Translation)', 'Ky thuat NAT dong (PAT - Port Address Translation) giai quyet van de nao sau day?', 'single_choice', 'Mang May Tinh', 'medium', 'active', '2026-09-15 08:00:00'),
(15, 2, 'Giao thuc dinh tuyen OSPF va BGP', 'Nhung phat bieu nao sau day ve OSPF va BGP la chinh xac?', 'multiple_choice', 'Mang May Tinh', 'hard', 'active', '2026-09-15 08:00:00'),
(16, 2, 'Kien truc VLAN theo chuan 802.1Q', 'Truong VLAN Tag trong khung Ethernet theo chuan IEEE 802.1Q co do dai bao nhieu bytes?', 'single_choice', 'Mang May Tinh', 'medium', 'active', '2026-09-15 08:00:00'),
(17, 2, 'Tan cong tu choi dich vu SYN Flood', 'Giai phap nao sau day giup phong chong hieu qua cuoc tan cong TCP SYN Flood o muc he dieu hanh?', 'single_choice', 'Mang May Tinh', 'hard', 'active', '2026-09-15 08:00:00'),
(18, 2, 'Chuan mang khong day Wi-Fi 6 (802.11ax)', 'Nhung cong nghe dot pha nao sau day duoc tich hop trong chuan Wi-Fi 6 (802.11ax)?', 'multiple_choice', 'Mang May Tinh', 'medium', 'active', '2026-09-15 08:00:00'),
(19, 2, 'Mo hinh tham chieu OSI vs TCP/IP', 'Mo hinh tham chieu OSI tieu chuan co tong cong bao nhieu tang (layers)?', 'single_choice', 'Mang May Tinh', 'easy', 'active', '2026-09-15 08:00:00'),
(20, 2, 'Giao thuc truyen thong cu IPX/SPX', 'Giao thuc mang co dien IPX/SPX tung duoc su dung lam tieu chuan trong he dieu hanh mang nao?', 'single_choice', 'Mang May Tinh', 'medium', 'archived', '2026-09-15 08:00:00'),
(21, 2, 'MySQL Isolation READ COMMITTED', 'Trong he quan tri co so du lieu MySQL (InnoDB), phat bieu nao sau day la chinh xac ve muc co lap READ COMMITTED?', 'single_choice', 'Co So Du Lieu', 'hard', 'active', '2026-09-15 08:00:00'),
(22, 2, 'Tinh chat ACID trong giao dich CSDL', 'Trong cac tinh chat ACID cua he quan tri co so du lieu quan he, chu viet tat A (Atomicity) mang y nghia nao?', 'single_choice', 'Co So Du Lieu', 'easy', 'active', '2026-09-15 08:00:00'),
(23, 2, 'Kien truc chi muc B-Tree vs Hash Index', 'Nhung phat bieu nao sau day dung ve chi muc B-Tree trong MySQL InnoDB?', 'multiple_choice', 'Co So Du Lieu', 'medium', 'active', '2026-09-15 08:00:00'),
(24, 2, 'Khai niem Sharding Database', 'Muc tieu chinh cua ky thuat phan manh ngang (Horizontal Sharding) la gi?', 'single_choice', 'Co So Du Lieu', 'medium', 'active', '2026-09-15 08:00:00'),
(25, 2, 'Cac loai rang buoc toan ven SQL', 'Nhung menh de nao sau day bieu dien rang buoc toan ven hop le trong chuan SQL ANSI?', 'multiple_choice', 'Co So Du Lieu', 'easy', 'active', '2026-09-15 08:00:00'),
(26, 2, 'Hien tuong Deadlock trong he quan tri CSDL', 'Deadlock xay ra khi nao trong he quan tri co so du lieu quan he?', 'single_choice', 'Co So Du Lieu', 'hard', 'active', '2026-09-15 08:00:00'),
(27, 2, 'Cac phep ket bang SQL JOIN', 'Nhung loai phep ket (JOIN) nao sau day la chuan trong SQL?', 'multiple_choice', 'Co So Du Lieu', 'easy', 'active', '2026-09-15 08:00:00'),
(28, 2, 'Chi muc Clustered Index vs Secondary Index', 'Trong MySQL InnoDB, mot bang co the co toi da bao nhieu Clustered Index?', 'single_choice', 'Co So Du Lieu', 'medium', 'active', '2026-09-15 08:00:00'),
(29, 2, 'Dinh dang chuan hoa CSDL 3NF', 'Mot luoc do quan he dat dang chuan 3 (3NF) khi thoa man 2NF va dieu kien nao sau day?', 'single_choice', 'Co So Du Lieu', 'medium', 'active', '2026-09-15 08:00:00'),
(30, 2, 'Toi uu hoa truy van bang lenh EXPLAIN', 'Trong ket qua lenh EXPLAIN cua MySQL, nhung gia tri nao tai cot "type" cho thay truy van dat hieu nang tot?', 'multiple_choice', 'Co So Du Lieu', 'hard', 'active', '2026-09-15 08:00:00'),
(31, 2, 'Khoa lac quan (Optimistic) vs Khoa bi quan (Pessimistic)', 'Co che Optimistic Concurrency Control thuong duoc trien khai bang cach nao trong he thong?', 'single_choice', 'Co So Du Lieu', 'hard', 'active', '2026-09-15 08:00:00'),
(32, 2, 'Su khac biet giua DELETE va TRUNCATE', 'Nhung phat bieu nao sau day dung ve su khac nhau giua DELETE va TRUNCATE?', 'multiple_choice', 'Co So Du Lieu', 'easy', 'active', '2026-09-15 08:00:00'),
(33, 2, 'Cong dung cua Trigger trong CSDL', 'Trigger trong he quan tri CSDL quan he la gi?', 'single_choice', 'Co So Du Lieu', 'medium', 'active', '2026-09-15 08:00:00'),
(34, 2, 'Transaction Isolation Level REPEATABLE READ', 'Trong MySQL InnoDB, REPEATABLE READ su dung co che nao de ngan ngua hien tuong Phantom Read?', 'single_choice', 'Co So Du Lieu', 'hard', 'active', '2026-09-15 08:00:00'),
(35, 2, 'Khai niem View va Materialized View', 'Nhung dac diem nao sau day la dung khi so sanh giua View ao va Materialized View?', 'multiple_choice', 'Co So Du Lieu', 'medium', 'active', '2026-09-15 08:00:00'),
(36, 2, 'Kien truc Master-Slave Replication', 'Trong mo hinh Replication Master-Slave truyen thong, node Slave thuong dam nhan nhiem vu gi?', 'single_choice', 'Co So Du Lieu', 'medium', 'active', '2026-09-15 08:00:00'),
(37, 2, 'NoSQL Key-Value Store Redis', 'Dac tinh cot loi giup Redis dat toc do truy xuat cuc cao (hang tram nghin req/s) la gi?', 'single_choice', 'Co So Du Lieu', 'easy', 'active', '2026-09-15 08:00:00'),
(38, 2, 'NoSQL Document Store MongoDB vs RDBMS', 'Nhung uu diem dac trung cua MongoDB so voi he quan tri CSDL quan he truyen thong la gi?', 'multiple_choice', 'Co So Du Lieu', 'medium', 'active', '2026-09-15 08:00:00'),
(39, 2, 'Toi uu hoa cau lenh SELECT voi LIMIT va OFFSET', 'Khi gia tri OFFSET qua lon (vi du: LIMIT 20 OFFSET 1000000), hieu nang truy van giam manh vi ly do gi?', 'single_choice', 'Co So Du Lieu', 'easy', 'active', '2026-09-15 08:00:00'),
(40, 2, 'He quan tri CSDL quan he co dien FoxPro', 'Dinh dang tap tin co so du lieu dac trung cua Visual FoxPro co phan mo rong la gi?', 'single_choice', 'Co So Du Lieu', 'medium', 'archived', '2026-09-15 08:00:00'),
(41, 2, 'Lenh xem container Docker', 'Lenh Docker CLI nao duoc dung de liet ke tat ca cac container, bao gom ca cac container da dung (stopped)?', 'single_choice', 'DevOps', 'easy', 'active', '2026-09-15 08:00:00'),
(42, 2, 'Thanh phan Observability Stack', 'Nhung thanh phan nao sau day thuoc bo cong cu giam sat va quan sat he thong (Observability) tieu bieu?', 'multiple_choice', 'DevOps', 'medium', 'active', '2026-09-15 08:00:00'),
(43, 2, 'Vong doi Kubernetes Pod', 'Trang thai (Phase) nao sau day KHONG phai la mot trang thai chinh thuc trong vong doi cua Kubernetes Pod?', 'single_choice', 'DevOps', 'hard', 'active', '2026-09-15 08:00:00'),
(44, 2, 'Nguyen ly Continuous Integration (CI)', 'Nhung hoat dong cot loi nao sau day luon duoc tu dong hoa trong mot Pipeline CI hien dai?', 'multiple_choice', 'DevOps', 'medium', 'active', '2026-09-15 08:00:00'),
(45, 2, 'Cau hinh Reverse Proxy Nginx', 'Directive nao trong khoi location cua Nginx duoc su dung de chuyen tiep luu luong den backend service?', 'single_choice', 'DevOps', 'easy', 'active', '2026-09-15 08:00:00'),
(46, 2, 'Su khac nhau giua Docker Image va Container', 'Moi quan he giua Docker Image va Docker Container duoc hieu nhu the nao la dung nhat?', 'single_choice', 'DevOps', 'easy', 'active', '2026-09-15 08:00:00'),
(47, 2, 'Lenh Docker Compose khoi chay service', 'Lenh Docker Compose nao khoi chay toan bo he thong service duoi nen (detached mode)?', 'single_choice', 'DevOps', 'easy', 'active', '2026-09-15 08:00:00'),
(48, 2, 'Kubernetes Deployment vs StatefulSet', 'Khi nao nen su dung StatefulSet thay vi Deployment thong thuong trong Kubernetes?', 'multiple_choice', 'DevOps', 'hard', 'active', '2026-09-15 08:00:00'),
(49, 2, 'Giai phap quan ly cau hinh Terraform', 'Terraform su dung ngon ngu lap trinh khai bao (Declarative Configuration) nao sau day?', 'single_choice', 'DevOps', 'medium', 'active', '2026-09-15 08:00:00'),
(50, 2, 'Co che Service Discovery trong Kubernetes', 'Thanh phan nao chiu trach nhiem phan giai DNS ten Service thanh ClusterIP trong Kubernetes?', 'single_choice', 'DevOps', 'hard', 'active', '2026-09-15 08:00:00'),
(51, 2, 'Khai niem Container Network Interface (CNI)', 'Plugin CNI nao sau day duoc su dung pho bien de cung cap Overlay Network va Network Policy trong k8s?', 'single_choice', 'DevOps', 'hard', 'active', '2026-09-15 08:00:00'),
(52, 2, 'Giam sat he thong voi Prometheus Metrics', 'Nhung kieu du lieu Metric co ban nao sau day duoc Prometheus ho tro?', 'multiple_choice', 'DevOps', 'medium', 'active', '2026-09-15 08:00:00'),
(53, 2, 'Nhat ky he thong tap trung Loki', 'Diem khac biet lon giup Grafana Loki tiet kiem tai nguyen hon Elasticsearch la gi?', 'single_choice', 'DevOps', 'medium', 'active', '2026-09-15 08:00:00'),
(54, 2, 'Chien luoc trien khai Blue-Green Deployment', 'Nhung loi ich lon nhat cua chien luoc trien khai Blue-Green Deployment la gi?', 'multiple_choice', 'DevOps', 'medium', 'active', '2026-09-15 08:00:00'),
(55, 2, 'Chien luoc trien khai Canary Release', 'Ban chat cua phuong phap trien khai Canary Release la gi?', 'single_choice', 'DevOps', 'medium', 'active', '2026-09-15 08:00:00'),
(56, 2, 'Cong cu quan ly phien ban Git flow', 'Nhung nhanh (branches) tieu chuan thuong thay trong mo hinh Git Flow la gi?', 'multiple_choice', 'DevOps', 'easy', 'active', '2026-09-15 08:00:00'),
(57, 2, 'Tich hop Dockerfile Multi-stage Build', 'Loi ich lon nhat cua ky thuat Multi-stage Build trong Dockerfile la gi?', 'single_choice', 'DevOps', 'medium', 'active', '2026-09-15 08:00:00'),
(58, 2, 'Quan ly bi mat k8s Secret vs ConfigMap', 'Diem khac nhau giua Kubernetes Secret va ConfigMap la gi?', 'multiple_choice', 'DevOps', 'medium', 'active', '2026-09-15 08:00:00'),
(59, 2, 'Co che tu dong co gian Horizontal Pod Autoscaler (HPA)', 'HPA trong Kubernetes dieu chinh so luong ban sao Pod dua tren yeu to nao?', 'single_choice', 'DevOps', 'hard', 'active', '2026-09-15 08:00:00'),
(60, 2, 'Cong cu quan ly cau hinh may chu vat ly cu Puppet', 'Ngon ngu lap trinh chinh duoc su dung de phat trien nen cong cu Puppet truyen thong la gi?', 'single_choice', 'DevOps', 'medium', 'archived', '2026-09-15 08:00:00'),
(61, 2, 'Co che phong chong SQL Injection', 'Bien phap hieu qua nhat de phong ngua triet de lo hong tan cong SQL Injection trong ung dung la gi?', 'single_choice', 'An Toan Thong Tin', 'easy', 'active', '2026-09-15 08:00:00'),
(62, 2, 'Cac thanh phan trong JSON Web Token (JWT)', 'Mot chuoi JSON Web Token (JWT) tieu chuan bao gom nhung phan nao sau day, duoc phan tach boi dau cham (.)?', 'multiple_choice', 'An Toan Thong Tin', 'medium', 'active', '2026-09-15 08:00:00'),
(63, 2, 'Tan cong CSRF va co che SameSite Cookie', 'Gia tri thuoc tinh SameSite nao cua Cookie giup chan hoan toan Cookie duoc gui di trong tat ca cac yeu cau Cross-Site?', 'single_choice', 'An Toan Thong Tin', 'hard', 'active', '2026-09-15 08:00:00'),
(64, 2, 'Ma hoa doi xung vs bat doi xung', 'Thuat toan ma hoa nao sau day thuoc nhom thuat toan ma hoa bat doi xung (Asymmetric Encryption)?', 'single_choice', 'An Toan Thong Tin', 'medium', 'active', '2026-09-15 08:00:00'),
(65, 2, 'Nguyen tac toi thieu dac quyen (Least Privilege)', 'Y nghia cua nguyen tac Least Privilege trong bao mat he thong la gi?', 'single_choice', 'An Toan Thong Tin', 'easy', 'active', '2026-09-15 08:00:00'),
(66, 2, 'Lo hong bao mat XSS (Cross-Site Scripting)', 'Cac loai hinh tan cong XSS pho bien tren ung dung Web bao gom nhung loai nao?', 'multiple_choice', 'An Toan Thong Tin', 'medium', 'active', '2026-09-15 08:00:00'),
(67, 2, 'Co che Content Security Policy (CSP)', 'HTTP Header Content-Security-Policy (CSP) chu yeu duoc su dung de phong chong cuoc tan cong nao?', 'single_choice', 'An Toan Thong Tin', 'hard', 'active', '2026-09-15 08:00:00'),
(68, 2, 'Ma hoa mat khau bang ham bam Bcrypt/Argon2', 'Tai sao cac ham bam nhu Bcrypt hoac Argon2 lai duoc khuyen nghi luu mat khau thay vi MD5 hay SHA-256?', 'multiple_choice', 'An Toan Thong Tin', 'medium', 'active', '2026-09-15 08:00:00'),
(69, 2, 'Giao thuc xac thuc OAuth 2.0', 'Trong luong xac thuc OAuth 2.0 Authorization Code Flow, ung dung nhan duoc gi truoc khi doi lay Access Token?', 'single_choice', 'An Toan Thong Tin', 'medium', 'active', '2026-09-15 08:00:00'),
(70, 2, 'Tan cong xen giua Man-in-the-Middle (MitM)', 'Bien phap phong chong hieu qua nhat de chong cuoc tan cong Man-in-the-Middle tren duong truyen mang la gi?', 'single_choice', 'An Toan Thong Tin', 'easy', 'active', '2026-09-15 08:00:00'),
(71, 2, 'Chung chi so SSL/TLS va co che HTTPS', 'Nhung yeu to cot loi ma giao thuc HTTPS dam bao cho nguoi dung la gi?', 'multiple_choice', 'An Toan Thong Tin', 'easy', 'active', '2026-09-15 08:00:00'),
(72, 2, 'Tan cong Brute Force va co che Rate Limiting', 'Co che Rate Limiting giup he thong ngan ngua hanh vi nao sau day?', 'single_choice', 'An Toan Thong Tin', 'easy', 'active', '2026-09-15 08:00:00'),
(73, 2, 'Xac thuc hai yeu to Multi-Factor Authentication (MFA)', 'Nhung yeu to xac thuc nao sau day thuoc ve 3 tru cot kinh dien cua MFA?', 'multiple_choice', 'An Toan Thong Tin', 'easy', 'active', '2026-09-15 08:00:00'),
(74, 2, 'Tan cong Session Hijacking va Session Fixation', 'Bien phap tot nhat de chong lai tan cong Session Fixation khi nguoi dung dang nhap thanh cong la gi?', 'single_choice', 'An Toan Thong Tin', 'hard', 'active', '2026-09-15 08:00:00'),
(75, 2, 'Khai niem Zero Trust Security Architecture', 'Triet ly cot loi nhat cua mo hinh bao mat Zero Trust la gi?', 'single_choice', 'An Toan Thong Tin', 'hard', 'active', '2026-09-15 08:00:00'),
(76, 2, 'Lo hong Server-Side Request Forgery (SSRF)', 'Moi nguy hiem lon nhat khi mot ung dung bi lo hong SSRF la gi?', 'single_choice', 'An Toan Thong Tin', 'hard', 'active', '2026-09-15 08:00:00'),
(77, 2, 'Bao ve API bang CORS (Cross-Origin Resource Sharing)', 'Nhung phat bieu nao sau day ve co che CORS la dung?', 'multiple_choice', 'An Toan Thong Tin', 'medium', 'active', '2026-09-15 08:00:00'),
(78, 2, 'Ky thuat chong Reverse Engineering ung dung', 'Ky thuat lam roi ma nguon (Code Obfuscation) co tac dung gi?', 'single_choice', 'An Toan Thong Tin', 'medium', 'active', '2026-09-15 08:00:00'),
(79, 2, 'Ma doc Ransomware va co che phong ve', 'Cac bien phap phong ngua thiet hai do ma doc tong tien (Ransomware) gay ra bao gom?', 'multiple_choice', 'An Toan Thong Tin', 'easy', 'active', '2026-09-15 08:00:00'),
(80, 2, 'Chuan ma hoa cu DES va MD5 bi pha vo', 'Tai sao thuat toan bam MD5 va ma hoa DES hien nay bi coi la khong an toan cho san pham?', 'single_choice', 'An Toan Thong Tin', 'medium', 'archived', '2026-09-15 08:00:00');

-- =============================================================================
-- 4. SEED QUESTION CHOICES (320 lựa chọn cho 80 câu hỏi)
-- =============================================================================
INSERT INTO question_choices (id, question_id, content, is_correct, sort_order) VALUES
(1, 1, 'TCP (Transmission Control Protocol)', 1, 1),
(2, 1, 'HTTP (Hypertext Transfer Protocol)', 0, 2),
(3, 1, 'IP (Internet Protocol)', 0, 3),
(4, 1, 'DNS (Domain Name System)', 0, 4),
(5, 2, 'HTTP (Port 80)', 1, 1),
(6, 2, 'HTTPS (Port 443)', 1, 2),
(7, 2, 'SSH (Port 22)', 1, 3),
(8, 2, 'DHCP (Port 67/68 UDP)', 0, 4),
(9, 3, 'SYN-ACK', 1, 1),
(10, 3, 'SYN', 0, 2),
(11, 3, 'ACK', 0, 3),
(12, 3, 'FIN-ACK', 0, 4),
(13, 4, '192.168.0.0 den 192.168.255.255', 1, 1),
(14, 4, '10.0.0.0 den 10.255.255.255', 0, 2),
(15, 4, '172.16.0.0 den 172.31.255.255', 0, 3),
(16, 4, '127.0.0.0 den 127.255.255.255', 0, 4),
(17, 5, 'Multiplexing: Cho phep gui nhieu request/response dong thoi tren mot ket noi TCP', 1, 1),
(18, 5, 'HPACK: Nen kich thuoc Header de giam thieu bang thong truyen tai', 1, 2),
(19, 5, 'Server Push: Cho phep Server chu dong gui truoc tai nguyen ve Client cache', 1, 3),
(20, 5, 'Chuyen sang su dung giao thuc UDP mac dinh thay cho TCP', 0, 4),
(21, 6, 'Anh xa dia chi IP logic sang dia chi MAC vat ly', 1, 1),
(22, 6, 'Anh xa ten mien sang dia chi IP', 0, 2),
(23, 6, 'Cap phat dia chi IP dong cho thiet bi dau cuoi', 0, 3),
(24, 6, 'Ma hoa du lieu truyen tai tren kenh vat ly', 0, 4),
(25, 7, 'Echo Request va Echo Reply', 1, 1),
(26, 7, 'SYN va ACK', 0, 2),
(27, 7, 'Router Solicitation va Advertisement', 0, 3),
(28, 7, 'Time Exceeded va Destination Unreachable', 0, 4),
(29, 8, 'TCP la giao thuc huong ket noi (Connection-oriented), UDP phi ket noi', 1, 1),
(30, 8, 'UDP co header nho hon (8 bytes) so voi TCP (toi thieu 20 bytes)', 1, 2),
(31, 8, 'TCP dam bao thu tu goi tin va kiem soat luu luong (Flow control)', 1, 3),
(32, 8, 'UDP dam bao 100% du lieu khong bao gio bi mat mat tren duong truyen', 0, 4),
(33, 9, '62 dia chi', 1, 1),
(34, 9, '64 dia chi', 0, 2),
(35, 9, '126 dia chi', 0, 3),
(36, 9, '30 dia chi', 0, 4),
(37, 10, 'Ban ghi A (Tro ten mien ve IPv4)', 1, 1),
(38, 10, 'Ban ghi AAAA (Tro ten mien ve IPv6)', 1, 2),
(39, 10, 'Ban ghi CNAME (Ten mien biet danh Alias)', 1, 3),
(40, 10, 'Ban ghi ROUTE (Dinh tuyen duong di noi bo)', 0, 4),
(41, 11, 'Discover -> Offer -> Request -> Acknowledge', 1, 1),
(42, 11, 'Detect -> Open -> Receive -> Accept', 0, 2),
(43, 11, 'Demand -> Order -> Route -> Apply', 0, 3),
(44, 11, 'Discover -> Order -> Request -> Answer', 0, 4),
(45, 12, 'Port 22', 1, 1),
(46, 12, 'Port 21', 0, 2),
(47, 12, 'Port 80', 0, 3),
(48, 12, 'Port 443', 0, 4),
(49, 13, 'DNS - Port 53 (UDP/TCP)', 1, 1),
(50, 13, 'HTTPS - Port 443 (TCP)', 1, 2),
(51, 13, 'SSH - Port 22 (TCP)', 1, 3),
(52, 13, 'MySQL - Port 8080 (TCP)', 0, 4),
(53, 14, 'Cho phep hang ngan may tinh noi bo dung chung mot dia chi IP cong cong', 1, 1),
(54, 14, 'Ma hoa du lieu truyen qua duong truyen Internet', 0, 2),
(55, 14, 'Tu dong tang toc do bang thong Internet len gap 2 lan', 0, 3),
(56, 14, 'Kiem soat luong spam email trong mang cuc bo', 0, 4),
(57, 15, 'OSPF la giao thuc dinh tuyen noi mien (Interior Gateway Protocol - IGP)', 1, 1),
(58, 15, 'BGP la giao thuc dinh tuyen ngoai mien (Exterior Gateway Protocol - EGP)', 1, 2),
(59, 15, 'OSPF su dung thuat toan Link-State (Dijkstra) de tinh toan duong di ngan nhat', 1, 3),
(60, 15, 'BGP chi su dung so hop (Hop count) toi da 15 de chon duong', 0, 4),
(61, 16, '4 bytes', 1, 1),
(62, 16, '2 bytes', 0, 2),
(63, 16, '8 bytes', 0, 3),
(64, 16, '16 bytes', 0, 4),
(65, 17, 'SYN Cookies', 1, 1),
(66, 17, 'DNSSEC', 0, 2),
(67, 17, 'DHCP Snooping', 0, 3),
(68, 17, 'ARP Spoofing', 0, 4),
(69, 18, 'OFDMA: Chia nho kenh truyen de truyen dong thoi cho nhieu thiet bi', 1, 1),
(70, 18, 'MU-MIMO ca 2 chieu Uplink va Downlink', 1, 2),
(71, 18, 'Target Wake Time (TWT): Giup tiet kiem pin cho thiet bi IoT', 1, 3),
(72, 18, 'Loai bo hoan toan song vo tuyen va chuyen sang truyen bang song am', 0, 4),
(73, 19, '7 tang', 1, 1),
(74, 19, '4 tang', 0, 2),
(75, 19, '5 tang', 0, 3),
(76, 19, '6 tang', 0, 4),
(77, 20, 'Novell NetWare', 1, 1),
(78, 20, 'Microsoft Windows 11', 0, 2),
(79, 20, 'Ubuntu Server LTS', 0, 3),
(80, 20, 'macOS Monterey', 0, 4),
(81, 21, 'Ngan chan duoc Dirty Read nhung van co the gap hien tuong Non-repeatable Read', 1, 1),
(82, 21, 'Ngan chan hoan toan ca Phantom Read va Non-repeatable Read', 0, 2),
(83, 21, 'Cho phep doc du lieu chua commit (Dirty Read) tu giao dich khac', 0, 3),
(84, 21, 'La muc co lap mac dinh cua InnoDB storage engine trong MySQL', 0, 4),
(85, 22, 'Giao dich thuc hien thanh cong toan bo hoac bi huy bo hoan toan (All-or-Nothing)', 1, 1),
(86, 22, 'Du lieu luon luon nhat quan va thoa man cac rang buoc toan ven', 0, 2),
(87, 22, 'Cac giao dich thuc thi dong thoi khong gay anh huong lan nhau', 0, 3),
(88, 22, 'Du lieu sau khi commit se duoc luu tru vinh vien tren dia cung', 0, 4),
(89, 23, 'Ho tro rat hieu qua cho cac phep toan so sanh theo pham vi (Range queries: BETWEEN, <, >)', 1, 1),
(90, 23, 'Do phuc tap tim kiem trung binh la O(log N)', 1, 2),
(91, 23, 'Chi muc duoc to chuc duoi dang cay can bang co thu tu sap xep', 1, 3),
(92, 23, 'Chi ho tro duy nhat phep so sanh bang chinh xac (=)', 0, 4),
(93, 24, 'Chia nho du lieu cua mot bang thanh nhieu phan va phan phoi len nhieu server khac nhau', 1, 1),
(94, 24, 'Nhan ban du lieu nguyen ven sang cac node phu de doc', 0, 2),
(95, 24, 'Luu tru toan bo du lieu len RAM de tang toc do', 0, 3),
(96, 24, 'Nen du lieu bang thuat toan Zip de tiet kiem dung luong', 0, 4),
(97, 25, 'PRIMARY KEY (Khoa chinh xac dinh duy nhat)', 1, 1),
(98, 25, 'FOREIGN KEY (Khoa ngoai dam bao toan ven tham chieu)', 1, 2),
(99, 25, 'CHECK (Kiem tra dieu kien logic cua gia tri cot)', 1, 3),
(100, 25, 'FAST_SCAN (Toi uu hoa toc do quet du lieu)', 0, 4),
(101, 26, 'Hai hoac nhieu giao dich cho doi tai nguyen bi khoa boi nhau theo mot vong lap kin', 1, 1),
(102, 26, 'O dia luu tru CSDL bi day 100% dung luong', 0, 2),
(103, 26, 'Server bi mat ket noi mang Internet dot ngot', 0, 3),
(104, 26, 'Truy van SQL thuc thi qua 30 giay ma khong co ket qua', 0, 4),
(105, 27, 'INNER JOIN: Chi tra ve cac dong co su khop du lieu o ca 2 bang', 1, 1),
(106, 27, 'LEFT OUTER JOIN: Tra ve tat ca dong o bang ben trai va dong khop o bang phai', 1, 2),
(107, 27, 'FULL OUTER JOIN: Tra ve tat ca dong khi co su khop o mot trong hai bang', 1, 3),
(108, 27, 'MIDDLE JOIN: Chi lay cac dong o giua tap du lieu', 0, 4),
(109, 28, 'Duy nhat 1 Clustered Index (mac dinh gan voi Primary Key)', 1, 1),
(110, 28, 'Toi da 16 Clustered Index', 0, 2),
(111, 28, 'Khong gioi han so luong', 0, 3),
(112, 28, 'Toi da bang so luong cot trong bang', 0, 4),
(113, 29, 'Khong ton tai phu thuoc ham bac cau (Transitive Dependency) giua cac thuoc tinh khong khoa', 1, 1),
(114, 29, 'Moi thuoc tinh phai la gia tri nguyen to (Atomic)', 0, 2),
(115, 29, 'Tat ca cac cot phai co kieu du lieu so nguyen (INT)', 0, 3),
(116, 29, 'Bang phai co it nhat 2 khoa ngoai', 0, 4),
(117, 30, 'const: Truy van tren khoa chinh hoac khoa duy nhat, lay toi da 1 dong', 1, 1),
(118, 30, 'eq_ref: Phep ket su dung toan bo khoa chinh hoac unique not null', 1, 2),
(119, 30, 'ref: Truy van tren chi muc thong thuong tra ve nhieu dong', 1, 3),
(120, 30, 'ALL: Quet toan bo bang (Full Table Scan)', 0, 4),
(121, 31, 'Su dung cot phien ban (version) hoac timestamp de so sanh khi commit', 1, 1),
(122, 31, 'Su dung lenh SELECT ... FOR UPDATE khoa truc tiep dong du lieu', 0, 2),
(123, 31, 'Khoa toan bo bang du lieu trong suot thoi gian nguoi dung thao tac', 0, 3),
(124, 31, 'Tu dong tu choi moi request tu nguoi dung thu hai', 0, 4),
(125, 32, 'TRUNCATE la lenh DDL, thuc thi nhanh hon vi de-allocate data pages', 1, 1),
(126, 32, 'DELETE la lenh DML, ghi transaction log chi tiet cho tung dong bi xoa', 1, 2),
(127, 32, 'TRUNCATE se reset lai gia tri khoi tao cua cot AUTO_INCREMENT', 1, 3),
(128, 32, 'TRUNCATE ho tro menh de WHERE de loc dong can xoa', 0, 4),
(129, 33, 'Doan ma thu tuc tu dong thuc thi khi xay ra su kien INSERT, UPDATE hoac DELETE', 1, 1),
(130, 33, 'Mot loai chi muc dac biet giup tang toc tim kiem', 0, 2),
(131, 33, 'Cong cu giam sat tai nguyen CPU cua database server', 0, 3),
(132, 33, 'Thu vien ben ngoai dung de ket noi CSDL voi ung dung', 0, 4),
(133, 34, 'Next-Key Locking (ket hop giua Record Lock va Gap Lock)', 1, 1),
(134, 34, 'Table-level Exclusive Lock', 0, 2),
(135, 34, 'Vo hieu hoa toan bo chi muc phu', 0, 3),
(136, 34, 'Tu dong chuyen sang luu tru tren bo nho cache Redis', 0, 4),
(137, 35, 'Standard View chi luu cau truy van dinh nghia, khong luu tru du lieu vat ly', 1, 1),
(138, 35, 'Materialized View luu ket qua truy van thanh bang du lieu vat ly tren dia', 1, 2),
(139, 35, 'Materialized View can co che refresh du lieu khi bang goc thay doi', 1, 3),
(140, 35, 'Standard View ton dung luong luu tru dia cung tuong duong bang goc', 0, 4),
(141, 36, 'Phuc vu cac truy van doc du lieu (Read operations) de giam tai cho Master', 1, 1),
(142, 36, 'Nhan toan bo cac yeu cau ghi (Write) va cap nhat du lieu', 0, 2),
(143, 36, 'Quan ly phan quyen nguoi dung he thong', 0, 3),
(144, 36, 'Tu dong bien dich lai ma nguon CSDL', 0, 4),
(145, 37, 'Toan bo du lieu duoc luu tru va xu ly truc tiep tren RAM (In-memory)', 1, 1),
(146, 37, 'Su dung kien truc da luong (Multi-threading) chia khoa doc quyen', 0, 2),
(147, 37, 'Chi ho tro duy nhat kieu du lieu chuoi ky tu duoi 100 bytes', 0, 3),
(148, 37, 'Luu tru du lieu doc quyen tren he thong tap tin Hadoop HDFS', 0, 4),
(149, 38, 'Linh hoat ve Schema (Dynamic / Schema-less) luu tru duoi dang BSON/JSON', 1, 1),
(150, 38, 'Ho tro Sharding va mo rong ngang (Horizontal Scale-out) de dang', 1, 2),
(151, 38, 'Luu tru cau truc du lieu long nhau (Nested documents/arrays) tu nhien', 1, 3),
(152, 38, 'Tuan thu tuyet doi chuan SQL-92 cho tat ca moi truy van', 0, 4),
(153, 39, 'Database van phai quet va bo qua 1.000.000 dong truoc khi lay 20 dong ket qua', 1, 1),
(154, 39, 'MySQL khong cho phep OFFSET vuot qua 10.000 dong', 0, 2),
(155, 39, 'Server se tu dong huy bo truy van do nghi ngo bi tan cong DoS', 0, 3),
(156, 39, 'Bo nho dem buffer pool bi tran ngay lap tuc', 0, 4),
(157, 40, '.DBF', 1, 1),
(158, 40, '.SQL', 0, 2),
(159, 40, '.MDF', 0, 3),
(160, 40, '.ACCDB', 0, 4),
(161, 41, 'docker ps -a', 1, 1),
(162, 41, 'docker images -a', 0, 2),
(163, 41, 'docker container start', 0, 3),
(164, 41, 'docker logs --all', 0, 4),
(165, 42, 'Prometheus (Thu thap va luu tru Time-Series Metrics)', 1, 1),
(166, 42, 'Grafana (Truc quan hoa Dashboard va bieu do canh bao)', 1, 2),
(167, 42, 'Loki & Promtail (Tong hop va truy van Log tap trung)', 1, 3),
(168, 42, 'Apache Hadoop MapReduce (Xu ly du lieu lon theo lo)', 0, 4),
(169, 43, 'Restarting', 1, 1),
(170, 43, 'Pending', 0, 2),
(171, 43, 'Running', 0, 3),
(172, 43, 'Succeeded', 0, 4),
(173, 44, 'Tu dong bien dich (Build) va dong goi ma nguon thanh image/artifact', 1, 1),
(174, 44, 'Tu dong chay bo kiem thu don vi (Unit Tests) va kiem thu tich hop', 1, 2),
(175, 44, 'Tu dong kiem tra quy chuan ma nguon (Linting & Security Scan)', 1, 3),
(176, 44, 'Tu dong cap nhat bios phan cung cua server vat ly', 0, 4),
(177, 45, 'proxy_pass', 1, 1),
(178, 45, 'fastcgi_pass', 0, 2),
(179, 45, 'upstream_connect', 0, 3),
(180, 45, 'forward_to', 0, 4),
(181, 46, 'Image la khuon mau tinh bat bien (read-only), Container la the hien dang thuc thi (running instance)', 1, 1),
(182, 46, 'Container la tap tin nen zip, Image la chuong trinh dang chay', 0, 2),
(183, 46, 'Image chi chay duoc tren Linux, Container chi chay duoc tren Windows', 0, 3),
(184, 46, 'Khong co su khac biet nao, hai khai niem la mot', 0, 4),
(185, 47, 'docker-compose up -d', 1, 1),
(186, 47, 'docker-compose start --all', 0, 2),
(187, 47, 'docker-compose run -b', 0, 3),
(188, 47, 'docker-compose boot', 0, 4),
(189, 48, 'Khi ung dung can danh tinh mang on dinh va duy nhat (Stable network identity)', 1, 1),
(190, 48, 'Khi can khoi tao va huy bo Pod theo thu tu tuan tu, co kiem soat', 1, 2),
(191, 48, 'Khi can gan moi Pod voi mot Persistent Volume luu tru doc lap', 1, 3),
(192, 48, 'Khi ung dung hoan toan Stateless khong can luu tru bat ky du lieu nao', 0, 4),
(193, 49, 'HCL (HashiCorp Configuration Language)', 1, 1),
(194, 49, 'Python 3', 0, 2),
(195, 49, 'Go Language', 0, 3),
(196, 49, 'Bash Scripting', 0, 4),
(197, 50, 'CoreDNS', 1, 1),
(198, 50, 'kube-proxy', 0, 2),
(199, 50, 'etcd', 0, 3),
(200, 50, 'kubelet', 0, 4),
(201, 51, 'Calico / Flannel', 1, 1),
(202, 51, 'Helm Chart', 0, 2),
(203, 51, 'Ingress Controller', 0, 3),
(204, 51, 'Cert-Manager', 0, 4),
(205, 52, 'Counter: Gia tri chi tang tich luy theo thoi gian', 1, 1),
(206, 52, 'Gauge: Gia tri co the tang hoac giam bat ky (vi du: % CPU, RAM)', 1, 2),
(207, 52, 'Histogram: Quan sat va phan bo du lieu theo cac buckets (vi du: Do tre request)', 1, 3),
(208, 52, 'StringBlob: Luu tru cac doan van ban khong gioi han', 0, 4),
(209, 53, 'Loki chi danh chi muc (Index) cho cac nhan metadata (Labels), khong index toan van noi dung log', 1, 1),
(210, 53, 'Loki tu dong xoa toan bo log sau 1 gio', 0, 2),
(211, 53, 'Loki khong ho tro tim kiem log bang chuoi ky tu', 0, 3),
(212, 53, 'Loki bat buoc phai chay tren he dieu hanh Windows Server', 0, 4),
(213, 54, 'Giam thoi gian chet (Zero Downtime) khi phat hanh phien ban moi', 1, 1),
(214, 54, 'Kha nang Rollback tuc thi bang cach chuyen lai Router/Load Balancer ve moi truong cu', 1, 2),
(215, 54, 'Cho phep kiem thu moi truong Green thuc te truoc khi mo luu luong nguoi dung', 1, 3),
(216, 54, 'Tiet kiem 50% chi phi ha tang may chu so voi Rolling Update', 0, 4),
(217, 55, 'Dieu huong mot phan nho luu luong (vi du: 5-10%) den phien ban moi de danh gia rui ro truoc', 1, 1),
(218, 55, 'Thay the 100% tat ca server cung mot luc vao nua dem', 0, 2),
(219, 55, 'Chi trien khai phien ban moi tren may chu local cua lap trinh vien', 0, 3),
(220, 55, 'Chay song song 2 phien ban va so sanh toc do phan hoi', 0, 4),
(221, 56, 'main / master (Nhanh production on dinh)', 1, 1),
(222, 56, 'develop (Nhanh tich hop tinh nang dang phat trien)', 1, 2),
(223, 56, 'feature/*, release/*, hotfix/*', 1, 3),
(224, 56, 'backup_all_permanent', 0, 4),
(225, 57, 'Giam dang ke dung luong Image cuoi cung bang cach loai bo cac cong cu build khong can thiet', 1, 1),
(226, 57, 'Tang toc do ket noi internet khi pull image', 0, 2),
(227, 57, 'Cho phep mot container chay duoc nhieu he dieu hanh cung luc', 0, 3),
(228, 57, 'Tu dong sua cac loi cu phap trong ma nguon', 0, 4),
(229, 58, 'Secret dung de luu thong tin nhay cam (mat khau, token, private key)', 1, 1),
(230, 58, 'ConfigMap dung de luu tru cau hinh phi nhay cam (cong port, URL, flags)', 1, 2),
(231, 58, 'Du lieu trong Secret mac dinh duoc ma hoa base64 trong manifest', 1, 3),
(232, 58, 'ConfigMap duoc ma hoa bat doi xung RSA 4096 bit', 0, 4),
(233, 59, 'Ty le su dung CPU, RAM thuc te hoac Custom Metrics theo nguong quy dinh', 1, 1),
(234, 59, 'Dung luong con lai cua o dia cung may chu vat ly', 0, 2),
(235, 59, 'So luong file ma nguon co trong thu muc container', 0, 3),
(236, 59, 'Thoi gian hoat dong (Uptime) cua he thong server', 0, 4),
(237, 60, 'Ruby', 1, 1),
(238, 60, 'Go', 0, 2),
(239, 60, 'Rust', 0, 3),
(240, 60, 'Java', 0, 4),
(241, 61, 'Su dung Parameterized Queries (Prepared Statements) hoac ORM uy tin', 1, 1),
(242, 61, 'Loc bo cac ky tu dac biet bang regex o phia Frontend', 0, 2),
(243, 61, 'Chi cho phep nguoi dung nhap ky tu so tren o tim kiem', 0, 3),
(244, 61, 'Ma hoa mat khau bang thuat toan MD5 truoc khi luu CSDL', 0, 4),
(245, 62, 'Header (Chua thuat toan ky va kieu token)', 1, 1),
(246, 62, 'Payload (Chua cac Claims thong tin nguoi dung va thoi han)', 1, 2),
(247, 62, 'Signature (Chu ky so dam bao token khong bi sua doi)', 1, 3),
(248, 62, 'Encryption Key (Khoa cong khai giai ma du lieu)', 0, 4),
(249, 63, 'SameSite=Strict', 1, 1),
(250, 63, 'SameSite=Lax', 0, 2),
(251, 63, 'SameSite=None', 0, 3),
(252, 63, 'SameSite=Cross', 0, 4),
(253, 64, 'RSA (Rivest-Shamir-Adleman)', 1, 1),
(254, 64, 'AES (Advanced Encryption Standard)', 0, 2),
(255, 64, 'DES (Data Encryption Standard)', 0, 3),
(256, 64, 'Blowfish', 0, 4),
(257, 65, 'Chi cap dung quyen han toi thieu can thiet de nguoi dung hoac quy trinh thuc hien cong viec', 1, 1),
(258, 65, 'Cap quyen quan tri vien toan quyen (Root/Admin) cho tat ca lap trinh vien', 0, 2),
(259, 65, 'Khoa toan bo quyen truy cap co so du lieu trong gio hanh chinh', 0, 3),
(260, 65, 'Tu dong xoa tai khoan nguoi dung sau 30 ngay khong hoat dong', 0, 4),
(261, 66, 'Stored XSS (Ma doc duoc luu truc tiep vao CSDL cua he thong)', 1, 1),
(262, 66, 'Reflected XSS (Ma doc nam trong URL request va duoc server phan hoi lai)', 1, 2),
(263, 66, 'DOM-based XSS (Ma doc duoc thuc thi truc tiep do thay doi DOM o client)', 1, 3),
(264, 66, 'Hardware XSS (Ma doc chen vao chip phan cung may chu)', 0, 4),
(265, 67, 'XSS (Cross-Site Scripting) va Clickjacking', 1, 1),
(266, 67, 'SQL Injection', 0, 2),
(267, 67, 'DDoS Network Flood', 0, 3),
(268, 67, 'Buffer Overflow', 0, 4),
(269, 68, 'Tich hop san co che Salt ngau nhien chong lai tan cong Rainbow Table', 1, 1),
(270, 68, 'Co he so do phuc tap tinh toan (Work Factor/Cost) co the tang dan theo thoi gian', 1, 2),
(271, 68, 'Toc do tinh toan cham co chu dich giup vo hieu hoa tan cong Brute Force bang GPU', 1, 3),
(272, 68, 'Co the giai ma nguoc lai ve mat khau goc mot cach de dang', 0, 4),
(273, 69, 'Authorization Code', 1, 1),
(274, 69, 'Master Password', 0, 2),
(275, 69, 'Database Connection String', 0, 3),
(276, 69, 'Root SSL Certificate', 0, 4),
(277, 70, 'Su dung giao thuc ma hoa HTTPS/TLS voi chung chi so hop le', 1, 1),
(278, 70, 'Doi cong dich vu tu 80 sang 8080', 0, 2),
(279, 70, 'Giam toc do duong truyen Internet xuong muc toi thieu', 0, 3),
(280, 70, 'Tat tinh nang tu dong luu cache tren trinh duyet', 0, 4),
(281, 71, 'Confidentiality (Tinh bao mat: Du lieu duoc ma hoa khong the bi nghe len)', 1, 1),
(282, 71, 'Integrity (Tinh toan ven: Du lieu khong bi thay doi tren duong truyen)', 1, 2),
(283, 71, 'Authentication (Tinh xac thuc: Dam bao nguoi dung ket noi dung server mong muon)', 1, 3),
(284, 71, 'Immunity (Tinh mien nhiem: Server khong bao gio bi crash do qua tai)', 0, 4),
(285, 72, 'Gui hang ngan request dang nhap do tim mat khau trong thoi gian ngan', 1, 1),
(286, 72, 'Chen the script doc hai vao o binh luan', 0, 2),
(287, 72, 'Sua doi tham so URL de xem thong tin nguoi dung khac', 0, 3),
(288, 72, 'Doc trom cookie cua phien dang nhap khac', 0, 4),
(289, 73, 'Something you know (Dieu ban biet: Mat khau, ma PIN)', 1, 1),
(290, 73, 'Something you have (Dieu ban co: Dien thoai OTP, the token, FIDO2 key)', 1, 2),
(291, 73, 'Something you are (Dieu thuoc ve ban: Van tay, nhan dien khuon mat)', 1, 3),
(292, 73, 'Something you want (Dieu ban mong muon tro thanh)', 0, 4),
(293, 74, 'Tai tao (Regenerate) mot Session ID moi hoan toan ngay sau khi xac thuc thanh cong', 1, 1),
(294, 74, 'Giu nguyen Session ID cu de tiet kiem bo nho cache', 0, 2),
(295, 74, 'Luu Session ID vao LocalStorage thay vi Cookie', 0, 3),
(296, 74, 'Gui Session ID qua tham so query string tren URL', 0, 4),
(297, 75, 'Never Trust, Always Verify (Khong bao gio tin tuong, luon luon xac minh moi yeu cau)', 1, 1),
(298, 75, 'Tin tuong tuyet doi tat ca thiet bi nam trong mang noi bo LAN cua cong ty', 0, 2),
(299, 75, 'Chi can bao ve tuong lua phia ngoai, ben trong hoan toan an toan', 0, 3),
(300, 75, 'Vo hieu hoa toan bo quyen truy cap Internet tu xa cua nhan vien', 0, 4),
(301, 76, 'Ke tan cong loi dung may chu backend de gui request truy cap cac tai nguyen noi bo (nhu Cloud Metadata API)', 1, 1),
(302, 76, 'Trinh duyet cua nguoi dung bi tat dot ngot', 0, 2),
(303, 76, 'Mat khau nguoi dung bi xoa khoi may chu client', 0, 3),
(304, 76, 'Giao dien web bi thay doi mau sac bat thuong', 0, 4),
(305, 77, 'CORS la co che bao ve duoc thuc thi boi Trinh duyet (Browser-enforced)', 1, 1),
(306, 77, 'Preflight request su dung phuong thuc HTTP OPTIONS de kiem tra quyen truy cap truoc', 1, 2),
(307, 77, 'Header Access-Control-Allow-Origin quy dinh domain nao duoc phep goi API', 1, 3),
(308, 77, 'CORS ngan chan duoc ca cac request goi truc tiep tu Curl hoac Postman', 0, 4),
(309, 78, 'Bien doi ma nguon thanh dang kho doc va phan tich nhung van giu nguyen tinh nang thuc thi', 1, 1),
(310, 78, 'Ma hoa du lieu trong CSDL bang khoa cong khai', 0, 2),
(311, 78, 'Tu dong sao luu ma nguon len GitHub hang ngay', 0, 3),
(312, 78, 'Tang toc do bien dich ung dung len gap 10 lan', 0, 4),
(313, 79, 'Thuc hien sao luu du lieu thuong xuyen theo quy tac 3-2-1 va luu offline', 1, 1),
(314, 79, 'Cap nhat va va loi he dieu hanh, phan mem dinh ky (Patch Management)', 1, 2),
(315, 79, 'Dao tao nhan thuc an toan thong tin, khong mo file hoac link la trong email phishing', 1, 3),
(316, 79, 'Tra tien chuoc ngay lap tuc cho hacker khi vua bi nhiem ma doc', 0, 4),
(317, 80, 'Do dai khoa qua ngan (DES 56-bit) va MD5 de bi tan cong va cham (Collision Attack)', 1, 1),
(318, 80, 'Do cac thuat toan nay khong the chay tren he dieu hanh 64-bit', 0, 2),
(319, 80, 'Do cong ty chu quan da pha san va ngung ho tro phan mem', 0, 3),
(320, 80, 'Do khong ho tro ngon ngu lap trinh JavaScript', 0, 4);

-- =============================================================================
-- 5. SEED EXAMS (12 Đề thi theo đúng phân nhóm nghiệp vụ)
-- 4 Đã công bố công khai, 3 Đã công bố được gán, 3 Bản nháp, 2 Đã đóng
-- =============================================================================
INSERT INTO exams (id, created_by, title, description, duration_minutes, max_attempts, pass_score, access_type, status, is_published_scores, is_published_answers, start_time, end_time, created_at) VALUES
-- Nhóm 1: Đã công bố, công khai (4 đề)
(1, 2, 'Kiem tra Kien truc He thong & DevOps - De 01', 'Bai kiem tra danh gia kien thuc tong quan ve Mang may tinh, Ha tang Docker va Bo cong cu Observability. Danh cho tat ca sinh vien.', 30, 3, 5.00, 'public', 'published', 1, 1, '2026-10-01 08:00:00', '2026-11-30 23:59:59', '2026-09-20 08:00:00'),
(2, 2, 'Khao Sat Co So Du Lieu Quan He & Toi Uu Truyen Van', 'Bai danh gia kien thuc ve Tinh chat ACID, Kien truc chi muc B-Tree, Mua co lap READ COMMITTED va Ky thuat Sharding.', 20, 3, 5.00, 'public', 'published', 1, 1, '2026-10-02 08:00:00', '2026-11-30 23:59:59', '2026-09-21 09:00:00'),
(3, 2, 'Kiem Tra Kien Thuc Mang May Tinh & Giao Thuc Internet', 'Bai khao sat mo hinh OSI, TCP 3-Way Handshake, HTTP/2, DNS va cac giao thuc mang quan trong.', 25, 2, 6.00, 'public', 'published', 1, 1, '2026-10-03 08:00:00', '2026-12-15 23:59:59', '2026-09-22 10:00:00'),
(4, 2, 'Tong Quan An Toan Thong Tin & Phong Thu Ung Dung Web', 'Kiem tra kien thuc co ban ve Phong chong SQL Injection, Cau truc JWT, Co che SameSite Cookie va Nguyen tac Least Privilege.', 30, 3, 5.00, 'public', 'published', 1, 1, '2026-10-04 08:00:00', '2026-12-31 23:59:59', '2026-09-23 11:00:00'),

-- Nhóm 2: Đã công bố, được gán (3 đề)
-- Đề 5: ĐÃ CÔNG BỐ ĐIỂM, NHƯNG CHƯA CÔNG BỐ ĐÁP ÁN (is_published_scores=1, is_published_answers=0)
(5, 2, 'Thi Giua Ky Mang May Tinh Chuyen Sau - Lop D21CQCN01', 'Bai thi danh rieng cho sinh vien lop D21CQCN01. Da cham va cong bo diem so, dap an chi tiet se mo sau khi ket thuc phuc khao.', 45, 1, 6.00, 'assigned', 'published', 1, 0, '2026-10-05 08:00:00', '2026-11-15 23:59:59', '2026-09-25 09:00:00'),

-- Đề 6: ĐÃ CHẤM NHƯNG CHƯA CÔNG BỐ ĐIỂM & ĐÁP ÁN (Bảo mật / Chờ phúc khảo: is_published_scores=0, is_published_answers=0)
(6, 2, 'Kiem Tra Dinh Ky An Ninh Mang & Bao Mat Web K21', 'Bai thi chuyen de bao mat nang cao. Diem so va dap an dang duoc hoi dong cham thi bao mat cho den ngay cong bo chinh thuc.', 45, 1, 7.00, 'assigned', 'published', 0, 0, '2026-10-10 08:00:00', '2026-12-10 23:59:59', '2026-10-01 14:00:00'),

-- Đề 7: ĐÃ CÔNG BỐ ĐIỂM VÀ ĐÁP ÁN (is_published_scores=1, is_published_answers=1)
(7, 2, 'Thi Thuc Hanh DevOps & Trien Khai Kubernetes K21', 'Kiem tra thuc hanh quan tri container Docker, Kubernetes Pod, CI Pipeline va Observability Stack.', 60, 1, 6.00, 'assigned', 'published', 1, 1, '2026-10-12 08:00:00', '2026-12-20 23:59:59', '2026-10-02 15:00:00'),

-- Nhóm 3: Bản nháp (3 đề - Draft)
(8, 2, 'Du thao De Thi Ket Thuc Hoc Phan Co So Du Lieu Nang Cao', 'De thi du thao hoc ky 1 danh cho khoa K21. Giang vien dang bien soan cau hoi va phan bo diem.', 60, 1, 5.00, 'public', 'draft', 0, 0, NULL, NULL, '2026-10-15 16:00:00'),
(9, 2, 'De Thi Thu Nghiem Kien Truc Microservices HK2', 'Ban nhap khao sat nang luc thiet ke kien truc huong dich vu. Chua phat hanh.', 45, 1, 6.00, 'assigned', 'draft', 0, 0, NULL, NULL, '2026-10-16 10:00:00'),
(10, 2, 'Ngan Hang De Thi Chuyen De Cloud Native 2026', 'Ban thao tong hop bo cau hoi trac nghiem ve dien toan dam may cho ky thi sap toi.', 40, 1, 5.00, 'public', 'draft', 0, 0, NULL, NULL, '2026-10-17 11:30:00'),

-- Nhóm 4: Đã đóng (2 đề - Closed)
(11, 2, 'Thi Thu Khao Sat Nang Luc Dau Khoa K21', 'Dot khao sat nang luc dau khoa danh cho tan sinh vien. Ky thi nay da ket thuc va dong cong nop bai.', 30, 1, 5.00, 'public', 'closed', 1, 1, '2026-09-01 08:00:00', '2026-09-30 17:00:00', '2026-08-25 09:00:00'),
(12, 2, 'Kiem Tra Dot 1 Kien Thuc Lap Trinh He Thong', 'Bai kiem tra danh gia nhanh dot 1 danh cho lop chon. Da het han nop bai.', 30, 1, 5.00, 'assigned', 'closed', 1, 1, '2026-09-05 08:00:00', '2026-09-28 23:59:59', '2026-08-28 14:00:00');

-- =============================================================================
-- 6. SEED EXAM QUESTIONS (Gán câu hỏi vào 12 đề thi với trọng số chuẩn)
-- =============================================================================
INSERT INTO exam_questions (exam_id, question_id, question_order, weight) VALUES
-- Exam 1: 5 câu (Q1, Q2, Q21, Q41, Q42)
(1, 1, 1, 2.00), (1, 2, 2, 2.00), (1, 21, 3, 2.00), (1, 41, 4, 2.00), (1, 42, 5, 2.00),

-- Exam 2: 5 câu CSDL (Q21, Q22, Q23, Q24, Q25)
(2, 21, 1, 2.00), (2, 22, 2, 2.00), (2, 23, 3, 2.00), (2, 24, 4, 2.00), (2, 25, 5, 2.00),

-- Exam 3: 5 câu Mạng (Q1, Q3, Q4, Q5, Q6)
(3, 1, 1, 2.00), (3, 3, 2, 2.00), (3, 4, 3, 2.00), (3, 5, 4, 2.00), (3, 6, 5, 2.00),

-- Exam 4: 5 câu An toàn thông tin (Q61, Q62, Q63, Q64, Q65)
(4, 61, 1, 2.00), (4, 62, 2, 2.00), (4, 63, 3, 2.00), (4, 64, 4, 2.00), (4, 65, 5, 2.00),

-- Exam 5: 6 câu Mạng nâng cao (Q1, Q2, Q3, Q5, Q7, Q8)
(5, 1, 1, 1.67), (5, 2, 2, 1.67), (5, 3, 3, 1.67), (5, 5, 4, 1.67), (5, 7, 5, 1.66), (5, 8, 6, 1.66),

-- Exam 6: 5 câu An ninh mạng (Q61, Q63, Q66, Q67, Q68)
(6, 61, 1, 2.00), (6, 63, 2, 2.00), (6, 66, 3, 2.00), (6, 67, 4, 2.00), (6, 68, 5, 2.00),

-- Exam 7: 5 câu DevOps thực hành (Q41, Q43, Q44, Q45, Q48)
(7, 41, 1, 2.00), (7, 43, 2, 2.00), (7, 44, 3, 2.00), (7, 45, 4, 2.00), (7, 48, 5, 2.00),

-- Exam 8 (Draft): 4 câu CSDL nâng cao (Q26, Q28, Q30, Q34)
(8, 26, 1, 2.50), (8, 28, 2, 2.50), (8, 30, 3, 2.50), (8, 34, 4, 2.50),

-- Exam 9 (Draft): 3 câu Kiến trúc (Q45, Q46, Q61)
(9, 45, 1, 3.33), (9, 46, 2, 3.33), (9, 61, 3, 3.34),

-- Exam 10 (Draft): 4 câu Cloud Native (Q49, Q50, Q51, Q52)
(10, 49, 1, 2.50), (10, 50, 2, 2.50), (10, 51, 3, 2.50), (10, 52, 4, 2.50),

-- Exam 11 (Closed): 4 câu Khảo sát (Q1, Q22, Q41, Q61)
(11, 1, 1, 2.50), (11, 22, 2, 2.50), (11, 41, 3, 2.50), (11, 61, 4, 2.50),

-- Exam 12 (Closed): 4 câu Lập trình hệ thống (Q3, Q8, Q23, Q47)
(12, 3, 1, 2.50), (12, 8, 2, 2.50), (12, 23, 3, 2.50), (12, 47, 4, 2.50);

-- =============================================================================
-- 7. SEED EXAM ASSIGNMENTS (Chỉ định sinh viên cho các đề Assigned)
-- =============================================================================
INSERT INTO exam_assignments (exam_id, student_id, assigned_at) VALUES
-- Exam 5 (Thi Giữa Kỳ Mạng Máy Tính - Gán cho student1 đến student10)
(5, 3, '2026-10-05 08:30:00'), (5, 4, '2026-10-05 08:30:00'), (5, 5, '2026-10-05 08:30:00'),
(5, 6, '2026-10-05 08:30:00'), (5, 7, '2026-10-05 08:30:00'), (5, 8, '2026-10-05 08:30:00'),
(5, 9, '2026-10-05 08:30:00'), (5, 10, '2026-10-05 08:30:00'),

-- Exam 6 (Kiểm Tra Định Kỳ An Ninh Mạng - Gán cho student1 đến student8)
(6, 3, '2026-10-10 08:30:00'), (6, 4, '2026-10-10 08:30:00'), (6, 5, '2026-10-10 08:30:00'),
(6, 6, '2026-10-10 08:30:00'), (6, 7, '2026-10-10 08:30:00'), (6, 8, '2026-10-10 08:30:00'),
(6, 11, '2026-10-10 08:30:00'), (6, 12, '2026-10-10 08:30:00'),

-- Exam 7 (Thi Thực Hành DevOps - Gán cho student1 đến student6)
(7, 3, '2026-10-12 08:30:00'), (7, 4, '2026-10-12 08:30:00'), (7, 5, '2026-10-12 08:30:00'),
(7, 6, '2026-10-12 08:30:00'), (7, 13, '2026-10-12 08:30:00'), (7, 14, '2026-10-12 08:30:00'),

-- Exam 12 (Closed - Gán cho student1 đến student5)
(12, 3, '2026-09-05 08:30:00'), (12, 4, '2026-09-05 08:30:00'), (12, 5, '2026-09-05 08:30:00');

-- =============================================================================
-- 8. SEED EXAM ATTEMPTS (60 Lượt làm bài bao quát đầy đủ mọi tình huống)
-- · Hoàn thành và đạt điểm cao
-- · Hoàn thành nhưng chưa đạt
-- · Hết giờ và được server chốt bài (expired)
-- · Đang làm bài, còn thời gian (in_progress)
-- · Làm bài lần thứ hai hoặc thứ ba trong giới hạn cho phép
-- · Đã chấm nhưng chưa công bố điểm (Exam 6)
-- · Đã công bố điểm nhưng chưa công bố đáp án (Exam 5)
-- =============================================================================
INSERT INTO exam_attempts (id, exam_id, student_id, attempt_number, status, grading_status, grading_fencing_token, raw_score, score, started_at, submitted_at, graded_at, deadline_at) VALUES
-- --- LƯỢT THI CỦA STUDENT1 (Hoàng Tùng Linh - Tài khoản test chính) ---
-- 1. Exam 1 (Lần 1 - Hoàn thành đạt 8.0/10)
(1, 1, 3, 1, 'completed', 'graded', 1, 8.00, 8.00, '2026-10-18 08:00:00', '2026-10-18 08:22:15', '2026-10-18 08:22:18', '2026-10-18 08:30:00'),
-- 2. Exam 1 (Lần 2 - Thi lại lần 2 đạt điểm tuyệt đối 10.0/10)
(2, 1, 3, 2, 'completed', 'graded', 2, 10.00, 10.00, '2026-10-18 09:00:00', '2026-10-18 09:18:32', '2026-10-18 09:18:35', '2026-10-18 09:30:00'),
-- 3. Exam 2 (Lần 1 - Hoàn thành nhưng CHƯA ĐẠT điểm qua môn 4.0/10)
(3, 2, 3, 1, 'completed', 'graded', 3, 4.00, 4.00, '2026-10-19 10:00:00', '2026-10-19 10:18:40', '2026-10-19 10:18:43', '2026-10-19 10:20:00'),
-- 4. Exam 2 (Lần 2 - Thi lại lần 2 vươn lên ĐẠT 8.0/10)
(4, 2, 3, 2, 'completed', 'graded', 4, 8.00, 8.00, '2026-10-19 11:00:00', '2026-10-19 11:17:20', '2026-10-19 11:17:23', '2026-10-19 11:20:00'),
-- 5. Exam 3 (Lần 1 - HẾT GIỜ và được server chốt bài: status=expired, điểm 6.0/10)
(5, 3, 3, 1, 'expired', 'graded', 5, 6.00, 6.00, '2026-10-20 09:00:00', '2026-10-20 09:25:00', '2026-10-20 09:25:05', '2026-10-20 09:25:00'),
-- 6. Exam 4 (Lần 1 - ĐANG LÀM BÀI, CÒN THỜI GIAN: status=in_progress, deadline còn trong tương lai)
(6, 4, 3, 1, 'in_progress', 'ungraded', 0, NULL, NULL, NOW(), NULL, NULL, DATE_ADD(NOW(), INTERVAL 24 HOUR)),
-- 7. Exam 5 (Assigned - Đã công bố điểm 8.35 nhưng CHƯA CÔNG BỐ ĐÁP ÁN)
(7, 5, 3, 1, 'completed', 'graded', 7, 8.35, 8.35, '2026-10-21 14:00:00', '2026-10-21 14:38:10', '2026-10-21 14:38:15', '2026-10-21 14:45:00'),
-- 8. Exam 6 (Assigned - ĐÃ CHẤM nhưng CHƯA CÔNG BỐ ĐIỂM / Bảo mật)
(8, 6, 3, 1, 'completed', 'graded', 8, 8.00, 8.00, '2026-10-22 15:00:00', '2026-10-22 15:35:45', '2026-10-22 15:35:50', '2026-10-22 15:45:00'),
-- 9. Exam 7 (Assigned - Hoàn thành đạt 10.0/10)
(9, 7, 3, 1, 'completed', 'graded', 9, 10.00, 10.00, '2026-10-23 09:00:00', '2026-10-23 09:48:30', '2026-10-23 09:48:35', '2026-10-23 10:00:00'),
-- 10. Exam 11 (Closed - Đạt 7.5/10)
(10, 11, 3, 1, 'completed', 'graded', 10, 7.50, 7.50, '2026-09-15 09:00:00', '2026-09-15 09:24:10', '2026-09-15 09:24:15', '2026-09-15 09:30:00'),
(11, 1, 4, 2, 'expired', 'graded', 12, 10.00, 10.00, '2026-10-15 08:05:00', '2026-10-15 08:20:25', '2026-10-15 08:20:30', '2026-10-15 08:35:00'),
(12, 2, 5, 1, 'completed', 'graded', 13, 9.50, 9.50, '2026-10-16 09:06:00', '2026-10-16 09:21:25', '2026-10-16 09:21:30', '2026-10-16 09:36:00'),
(13, 3, 6, 1, 'completed', 'graded', 14, 9.00, 9.00, '2026-10-17 10:07:00', '2026-10-17 10:22:25', '2026-10-17 10:22:30', '2026-10-17 10:37:00'),
(14, 5, 7, 1, 'completed', 'graded', 15, 8.50, 8.50, '2026-10-18 11:08:00', '2026-10-18 11:23:25', '2026-10-18 11:23:30', '2026-10-18 11:38:00'),
(15, 6, 8, 1, 'completed', 'graded', 16, 8.00, 8.00, '2026-10-19 12:09:00', '2026-10-19 12:24:25', '2026-10-19 12:24:30', '2026-10-19 12:39:00'),
(16, 7, 9, 1, 'completed', 'graded', 17, 7.50, 7.50, '2026-10-20 13:10:00', '2026-10-20 13:25:25', '2026-10-20 13:25:30', '2026-10-20 13:40:00'),
(17, 11, 10, 1, 'completed', 'graded', 18, 7.00, 7.00, '2026-10-21 14:11:00', '2026-10-21 14:26:25', '2026-10-21 14:26:30', '2026-10-21 14:41:00'),
(18, 1, 11, 1, 'expired', 'graded', 19, 6.50, 6.50, '2026-10-22 15:12:00', '2026-10-22 15:27:25', '2026-10-22 15:27:30', '2026-10-22 15:42:00'),
(19, 2, 12, 1, 'completed', 'graded', 20, 6.00, 6.00, '2026-10-15 08:13:00', '2026-10-15 08:28:25', '2026-10-15 08:28:30', '2026-10-15 08:43:00'),
(20, 3, 13, 2, 'completed', 'graded', 21, 5.50, 5.50, '2026-10-16 09:14:00', '2026-10-16 09:29:25', '2026-10-16 09:29:30', '2026-10-16 09:44:00'),
(21, 5, 14, 1, 'completed', 'graded', 22, 5.00, 5.00, '2026-10-17 10:15:00', '2026-10-17 10:30:25', '2026-10-17 10:30:30', '2026-10-17 10:45:00'),
(22, 6, 15, 1, 'completed', 'graded', 23, 4.00, 4.00, '2026-10-18 11:16:00', '2026-10-18 11:31:25', '2026-10-18 11:31:30', '2026-10-18 11:46:00'),
(23, 7, 16, 1, 'completed', 'graded', 24, 3.50, 3.50, '2026-10-19 12:17:00', '2026-10-19 12:32:25', '2026-10-19 12:32:30', '2026-10-19 12:47:00'),
(24, 11, 17, 1, 'completed', 'graded', 25, 2.00, 2.00, '2026-10-20 13:18:00', '2026-10-20 13:33:25', '2026-10-20 13:33:30', '2026-10-20 13:48:00'),
(25, 1, 18, 1, 'expired', 'graded', 26, 10.00, 10.00, '2026-10-21 14:19:00', '2026-10-21 14:34:25', '2026-10-21 14:34:30', '2026-10-21 14:49:00'),
(26, 2, 19, 2, 'completed', 'graded', 27, 9.50, 9.50, '2026-10-22 15:20:00', '2026-10-22 15:35:25', '2026-10-22 15:35:30', '2026-10-22 15:50:00'),
(27, 3, 20, 1, 'completed', 'graded', 28, 9.00, 9.00, '2026-10-15 08:21:00', '2026-10-15 08:36:25', '2026-10-15 08:36:30', '2026-10-15 08:51:00'),
(28, 5, 21, 1, 'completed', 'graded', 29, 8.50, 8.50, '2026-10-16 09:22:00', '2026-10-16 09:37:25', '2026-10-16 09:37:30', '2026-10-16 09:52:00'),
(29, 6, 22, 1, 'completed', 'graded', 30, 8.00, 8.00, '2026-10-17 10:23:00', '2026-10-17 10:38:25', '2026-10-17 10:38:30', '2026-10-17 10:53:00'),
(30, 7, 23, 1, 'completed', 'graded', 31, 7.50, 7.50, '2026-10-18 11:24:00', '2026-10-18 11:39:25', '2026-10-18 11:39:30', '2026-10-18 11:54:00'),
(31, 11, 24, 1, 'completed', 'graded', 32, 7.00, 7.00, '2026-10-19 12:05:00', '2026-10-19 12:20:25', '2026-10-19 12:20:30', '2026-10-19 12:35:00'),
(32, 1, 29, 2, 'expired', 'graded', 33, 6.50, 6.50, '2026-10-20 13:06:00', '2026-10-20 13:21:25', '2026-10-20 13:21:30', '2026-10-20 13:36:00'),
(33, 2, 4, 1, 'completed', 'graded', 34, 6.00, 6.00, '2026-10-21 14:07:00', '2026-10-21 14:22:25', '2026-10-21 14:22:30', '2026-10-21 14:37:00'),
(34, 3, 5, 1, 'completed', 'graded', 35, 5.50, 5.50, '2026-10-22 15:08:00', '2026-10-22 15:23:25', '2026-10-22 15:23:30', '2026-10-22 15:38:00'),
(35, 5, 6, 1, 'completed', 'graded', 36, 5.00, 5.00, '2026-10-15 08:09:00', '2026-10-15 08:24:25', '2026-10-15 08:24:30', '2026-10-15 08:39:00'),
(36, 6, 7, 1, 'completed', 'graded', 37, 4.00, 4.00, '2026-10-16 09:10:00', '2026-10-16 09:25:25', '2026-10-16 09:25:30', '2026-10-16 09:40:00'),
(37, 7, 8, 1, 'completed', 'graded', 38, 3.50, 3.50, '2026-10-17 10:11:00', '2026-10-17 10:26:25', '2026-10-17 10:26:30', '2026-10-17 10:41:00'),
(38, 11, 9, 1, 'completed', 'graded', 39, 2.00, 2.00, '2026-10-18 11:12:00', '2026-10-18 11:27:25', '2026-10-18 11:27:30', '2026-10-18 11:42:00'),
(39, 1, 10, 1, 'expired', 'graded', 40, 10.00, 10.00, '2026-10-19 12:13:00', '2026-10-19 12:28:25', '2026-10-19 12:28:30', '2026-10-19 12:43:00'),
(40, 2, 11, 1, 'completed', 'graded', 41, 9.50, 9.50, '2026-10-20 13:14:00', '2026-10-20 13:29:25', '2026-10-20 13:29:30', '2026-10-20 13:44:00'),
(41, 3, 12, 2, 'completed', 'graded', 42, 9.00, 9.00, '2026-10-21 14:15:00', '2026-10-21 14:30:25', '2026-10-21 14:30:30', '2026-10-21 14:45:00'),
(42, 5, 13, 1, 'completed', 'graded', 43, 8.50, 8.50, '2026-10-22 15:16:00', '2026-10-22 15:31:25', '2026-10-22 15:31:30', '2026-10-22 15:46:00'),
(43, 6, 14, 1, 'completed', 'graded', 44, 8.00, 8.00, '2026-10-15 08:17:00', '2026-10-15 08:32:25', '2026-10-15 08:32:30', '2026-10-15 08:47:00'),
(44, 7, 15, 1, 'completed', 'graded', 45, 7.50, 7.50, '2026-10-16 09:18:00', '2026-10-16 09:33:25', '2026-10-16 09:33:30', '2026-10-16 09:48:00'),
(45, 11, 16, 1, 'completed', 'graded', 46, 7.00, 7.00, '2026-10-17 10:19:00', '2026-10-17 10:34:25', '2026-10-17 10:34:30', '2026-10-17 10:49:00'),
(46, 1, 17, 1, 'expired', 'graded', 47, 6.50, 6.50, '2026-10-18 11:20:00', '2026-10-18 11:35:25', '2026-10-18 11:35:30', '2026-10-18 11:50:00'),
(47, 2, 18, 2, 'completed', 'graded', 48, 6.00, 6.00, '2026-10-19 12:21:00', '2026-10-19 12:36:25', '2026-10-19 12:36:30', '2026-10-19 12:51:00'),
(48, 3, 19, 1, 'completed', 'graded', 49, 5.50, 5.50, '2026-10-20 13:22:00', '2026-10-20 13:37:25', '2026-10-20 13:37:30', '2026-10-20 13:52:00'),
(49, 5, 20, 1, 'completed', 'graded', 50, 5.00, 5.00, '2026-10-21 14:23:00', '2026-10-21 14:38:25', '2026-10-21 14:38:30', '2026-10-21 14:53:00'),
(50, 6, 21, 1, 'completed', 'graded', 51, 4.00, 4.00, '2026-10-22 15:24:00', '2026-10-22 15:39:25', '2026-10-22 15:39:30', '2026-10-22 15:54:00'),
(51, 7, 22, 1, 'completed', 'graded', 52, 3.50, 3.50, '2026-10-15 08:05:00', '2026-10-15 08:20:25', '2026-10-15 08:20:30', '2026-10-15 08:35:00'),
(52, 11, 23, 1, 'completed', 'graded', 53, 2.00, 2.00, '2026-10-16 09:06:00', '2026-10-16 09:21:25', '2026-10-16 09:21:30', '2026-10-16 09:36:00'),
(53, 1, 24, 2, 'expired', 'graded', 54, 10.00, 10.00, '2026-10-17 10:07:00', '2026-10-17 10:22:25', '2026-10-17 10:22:30', '2026-10-17 10:37:00'),
(54, 2, 29, 1, 'completed', 'graded', 55, 9.50, 9.50, '2026-10-18 11:08:00', '2026-10-18 11:23:25', '2026-10-18 11:23:30', '2026-10-18 11:38:00'),
(55, 3, 4, 1, 'completed', 'graded', 56, 9.00, 9.00, '2026-10-19 12:09:00', '2026-10-19 12:24:25', '2026-10-19 12:24:30', '2026-10-19 12:39:00'),
(56, 5, 5, 1, 'completed', 'graded', 57, 8.50, 8.50, '2026-10-20 13:10:00', '2026-10-20 13:25:25', '2026-10-20 13:25:30', '2026-10-20 13:40:00'),
(57, 6, 6, 1, 'completed', 'graded', 58, 8.00, 8.00, '2026-10-21 14:11:00', '2026-10-21 14:26:25', '2026-10-21 14:26:30', '2026-10-21 14:41:00'),
(58, 7, 7, 1, 'completed', 'graded', 59, 7.50, 7.50, '2026-10-22 15:12:00', '2026-10-22 15:27:25', '2026-10-22 15:27:30', '2026-10-22 15:42:00'),
(59, 11, 8, 1, 'completed', 'graded', 60, 7.00, 7.00, '2026-10-15 08:13:00', '2026-10-15 08:28:25', '2026-10-15 08:28:30', '2026-10-15 08:43:00'),
(60, 1, 9, 1, 'expired', 'graded', 61, 6.50, 6.50, '2026-10-16 09:14:00', '2026-10-16 09:29:25', '2026-10-16 09:29:30', '2026-10-16 09:44:00');

-- =============================================================================
-- 9. SEED ATTEMPT QUESTION SNAPSHOTS (Bản chụp câu hỏi lúc sinh viên làm bài)
-- =============================================================================
INSERT INTO attempt_question_snapshots (attempt_id, question_id, question_order, question_type, weight, snapshot_data) VALUES
-- Snapshots cho Attempt 2 (Exam 1 - 5 câu)
(2, 1, 1, 'single_choice', 2.00, '{"title":"Giao thuc Transport Layer","content":"Trong mo hinh OSI, giao thuc nao sau day hoat dong o tang Giao van (Transport Layer)?","choices":[{"id":1,"content":"TCP (Transmission Control Protocol)"},{"id":2,"content":"HTTP (Hypertext Transfer Protocol)"},{"id":3,"content":"IP (Internet Protocol)"},{"id":4,"content":"DNS (Domain Name System)"}]}'),
(2, 2, 2, 'multiple_choice', 2.00, '{"title":"Cac giao thuc tren nen TCP","content":"Nhung giao thuc ung dung nao sau day chay mac dinh tren nen giao thuc truyen van tin cay TCP?","choices":[{"id":5,"content":"HTTP (Port 80)"},{"id":6,"content":"HTTPS (Port 443)"},{"id":7,"content":"SSH (Port 22)"},{"id":8,"content":"DHCP (Port 67/68 UDP)"}]}'),
(2, 21, 3, 'single_choice', 2.00, '{"title":"MySQL Isolation READ COMMITTED","content":"Trong he quan tri co so du lieu MySQL (InnoDB), phat bieu nao sau day la chinh xac ve muc co lap READ COMMITTED?","choices":[{"id":81,"content":"Ngan chan duoc Dirty Read nhung van co the gap hien tuong Non-repeatable Read"},{"id":82,"content":"Ngan chan hoan toan ca Phantom Read va Non-repeatable Read"},{"id":83,"content":"Cho phep doc du lieu chua commit tu giao dich khac"},{"id":84,"content":"La muc co lap mac dinh cua InnoDB storage engine"}]}'),
(2, 41, 4, 'single_choice', 2.00, '{"title":"Lenh xem container Docker","content":"Lenh Docker CLI nao duoc dung de liet ke tat ca cac container, bao gom ca cac container da dung (stopped)?","choices":[{"id":161,"content":"docker ps -a"},{"id":162,"content":"docker images -a"},{"id":163,"content":"docker container start"},{"id":164,"content":"docker logs --all"}]}'),
(2, 42, 5, 'multiple_choice', 2.00, '{"title":"Thanh phan Observability Stack","content":"Nhung thanh phan nao sau day thuoc bo cong cu giam sat va quan sat he thong (Observability) tieu bieu?","choices":[{"id":165,"content":"Prometheus (Thu thap va luu tru Time-Series Metrics)"},{"id":166,"content":"Grafana (Truc quan hoa Dashboard va bieu do canh bao)"},{"id":167,"content":"Loki & Promtail (Tong hop va truy van Log tap trung)"},{"id":168,"content":"Apache Hadoop MapReduce (Xu ly du lieu lon theo lo)"}]}'),

-- Snapshots cho Attempt 7 (Exam 5 - Mạng nâng cao 6 câu)
(7, 1, 1, 'single_choice', 1.67, '{"title":"Giao thuc Transport Layer","content":"Trong mo hinh OSI, giao thuc nao sau day hoat dong o tang Giao van?","choices":[{"id":1,"content":"TCP"},{"id":2,"content":"HTTP"},{"id":3,"content":"IP"},{"id":4,"content":"DNS"}]}'),
(7, 2, 2, 'multiple_choice', 1.67, '{"title":"Cac giao thuc tren nen TCP","content":"Nhung giao thuc chay tren TCP?","choices":[{"id":5,"content":"HTTP"},{"id":6,"content":"HTTPS"},{"id":7,"content":"SSH"},{"id":8,"content":"DHCP"}]}'),
(7, 3, 3, 'single_choice', 1.67, '{"title":"Co che bat tay ba buoc TCP","content":"Goi tin thu hai tu Server gui ve Client?","choices":[{"id":9,"content":"SYN-ACK"},{"id":10,"content":"SYN"},{"id":11,"content":"ACK"},{"id":12,"content":"FIN-ACK"}]}'),
(7, 5, 4, 'multiple_choice', 1.67, '{"title":"Uu diem cua giao thuc HTTP/2","content":"Cai tien cua HTTP/2?","choices":[{"id":17,"content":"Multiplexing"},{"id":18,"content":"HPACK"},{"id":19,"content":"Server Push"},{"id":20,"content":"Chuyen sang UDP"}]}'),
(7, 7, 5, 'single_choice', 1.66, '{"title":"Chuc nang cua giao thuc ICMP","content":"Lenh ping su dung thong diep nao?","choices":[{"id":25,"content":"Echo Request va Echo Reply"},{"id":26,"content":"SYN va ACK"},{"id":27,"content":"Router Advertisement"},{"id":28,"content":"Time Exceeded"}]}'),
(7, 8, 6, 'multiple_choice', 1.66, '{"title":"So sanh TCP va UDP","content":"Dac diem so sanh TCP va UDP?","choices":[{"id":29,"content":"TCP huong ket noi"},{"id":30,"content":"UDP header nho hon 8 bytes"},{"id":31,"content":"TCP dam bao thu tu goi tin"},{"id":32,"content":"UDP khong bao gio mat goi"}]}'),

-- Snapshots cho Attempt 6 (Exam 4 - Đang làm dở)
(6, 61, 1, 'single_choice', 2.00, '{"title":"Co che phong chong SQL Injection","content":"Bien phap hieu qua nhat de phong ngua triet de lo hong tan cong SQL Injection trong ung dung la gi?","choices":[{"id":241,"content":"Su dung Parameterized Queries (Prepared Statements) hoac ORM uy tin"},{"id":242,"content":"Loc bo cac ky tu dac biet bang regex o phia Frontend"},{"id":243,"content":"Chi cho phep nguoi dung nhap ky tu so tren o tim kiem"},{"id":244,"content":"Ma hoa mat khau bang thuat toan MD5 truoc khi luu CSDL"}]}'),
(6, 62, 2, 'multiple_choice', 2.00, '{"title":"Cac thanh phan trong JSON Web Token (JWT)","content":"Mot chuoi JSON Web Token (JWT) tieu chuan bao gom nhung phan nao sau day?","choices":[{"id":245,"content":"Header (Chua thuat toan ky va kieu token)"},{"id":246,"content":"Payload (Chua cac Claims thong tin nguoi dung va thoi han)"},{"id":247,"content":"Signature (Chu ky so dam bao token khong bi sua doi)"},{"id":248,"content":"Encryption Key (Khoa cong khai giai ma du lieu)"}]}');

-- =============================================================================
-- 10. SEED ATTEMPT ANSWERS (Chi tiết câu trả lời của sinh viên)
-- =============================================================================
INSERT INTO attempt_answers (attempt_id, question_id, selected_choice_ids, revision, is_correct, score_awarded) VALUES
-- Answers cho Attempt 2 (Exam 1 - 5/5 đúng -> 10.0)
(2, 1, '[1]', 1, 1, 2.00),
(2, 2, '[5, 6, 7]', 2, 1, 2.00),
(2, 21, '[81]', 1, 1, 2.00),
(2, 41, '[161]', 1, 1, 2.00),
(2, 42, '[165, 166, 167]', 2, 1, 2.00),

-- Answers cho Attempt 7 (Exam 5 - Đúng 5/6 câu -> 8.35)
(7, 1, '[1]', 1, 1, 1.67),
(7, 2, '[5, 6, 7]', 1, 1, 1.67),
(7, 3, '[9]', 1, 1, 1.67),
(7, 5, '[17, 18, 19]', 1, 1, 1.67),
(7, 7, '[25]', 1, 1, 1.66),
(7, 8, '[29, 32]', 1, 0, 0.00), -- Sai do chọn đáp án 32

-- Answers cho Attempt 6 (Exam 4 - Đang làm dở, đã lưu nháp câu 1)
(6, 61, '[241]', 1, NULL, NULL);

-- =============================================================================
-- 11. SEED ATTEMPT RECEIPTS (Biên nhận điện tử nộp bài thi thành công)
-- =============================================================================
INSERT INTO attempt_receipts (attempt_id, actor_id, request_id, operation, digest, outcome_status, response_body, created_at) VALUES
(1, 3, 'req_rcpt_exam1_att1_student1', 'SUBMIT', 'a8f5c2d3e4b1a6c7d8e9f0123456789abcdef0123456789abcdef0123456789a', 'COMMITTED', '{"score":8.00,"status":"completed","message":"Nop bai thanh cong va da cham diem"}', '2026-10-18 08:22:18'),
(2, 3, 'req_rcpt_exam1_att2_student1', 'SUBMIT', 'b9c6d3e4f5a2b7c8d9e0f123456789abcdef123456789abcdef123456789b', 'COMMITTED', '{"score":10.00,"status":"completed","message":"Nop bai thanh cong va da cham diem"}', '2026-10-18 09:18:35'),
(7, 3, 'req_rcpt_exam5_att1_student1', 'SUBMIT', 'c0d7e4f5a6b3c8d9e0f1a23456789abcdef23456789abcdef23456789c', 'COMMITTED', '{"score":8.35,"status":"completed","message":"Nop bai thanh cong va da cham diem"}', '2026-10-21 14:38:15');

-- =============================================================================
-- 12. SEED AUDIT LOGS (Nhật ký kiểm toán chân thực, dàn trải theo thời gian)
-- =============================================================================
INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address, created_at) VALUES
(1, 'SYSTEM_INIT', 'SYSTEM', 1, '{"message":"Khoi tao he thong QuizSystem san sang moi truong production"}', '127.0.0.1', '2026-09-01 08:00:00'),
(1, 'USER_CREATE', 'USER', 2, '{"username":"teacher1","role":"teacher"}', '192.168.1.10', '2026-09-01 08:30:00'),
(1, 'USER_CREATE', 'USER', 25, '{"username":"teacher2","role":"teacher"}', '192.168.1.10', '2026-09-02 09:00:00'),
(2, 'QUESTION_CREATE', 'QUESTION', 1, '{"title":"Giao thuc Transport Layer","subject":"Mang May Tinh"}', '192.168.1.15', '2026-09-15 08:00:00'),
(2, 'QUESTION_CREATE', 'QUESTION', 21, '{"title":"MySQL Isolation READ COMMITTED","subject":"Co So Du Lieu"}', '192.168.1.15', '2026-09-15 09:00:00'),
(2, 'QUESTION_CREATE', 'QUESTION', 41, '{"title":"Lenh xem container Docker","subject":"DevOps"}', '192.168.1.15', '2026-09-15 10:00:00'),
(2, 'QUESTION_CREATE', 'QUESTION', 61, '{"title":"Co che phong chong SQL Injection","subject":"An Toan Thong Tin"}', '192.168.1.15', '2026-09-15 11:00:00'),
(2, 'EXAM_CREATE', 'EXAM', 1, '{"title":"Kiem tra Kien truc He thong & DevOps - De 01","access_type":"public"}', '192.168.1.15', '2026-09-20 08:00:00'),
(2, 'EXAM_PUBLISH', 'EXAM', 1, '{"status":"published"}', '192.168.1.15', '2026-09-20 08:15:00'),
(2, 'EXAM_CREATE', 'EXAM', 5, '{"title":"Thi Giua Ky Mang May Tinh Chuyen Sau","access_type":"assigned"}', '192.168.1.15', '2026-09-25 09:00:00'),
(2, 'EXAM_ASSIGN_STUDENT', 'EXAM', 5, '{"student_count":8,"assigned_to":["student1","student2","student3"]}', '192.168.1.15', '2026-10-05 08:30:00'),
(3, 'USER_LOGIN', 'USER', 3, '{"username":"student1","login_method":"form"}', '192.168.1.42', '2026-10-18 07:55:00'),
(3, 'ATTEMPT_START', 'ATTEMPT', 1, '{"exam_id":1,"attempt_number":1}', '192.168.1.42', '2026-10-18 08:00:00'),
(3, 'ATTEMPT_SUBMIT', 'ATTEMPT', 1, '{"exam_id":1,"score":8.00}', '192.168.1.42', '2026-10-18 08:22:15'),
(NULL, 'AUTO_GRADING_SUCCESS', 'ATTEMPT', 1, '{"score":8.00,"pass_status":"PASSED"}', '127.0.0.1', '2026-10-18 08:22:18'),
(3, 'ATTEMPT_START', 'ATTEMPT', 2, '{"exam_id":1,"attempt_number":2}', '192.168.1.42', '2026-10-18 09:00:00'),
(3, 'ATTEMPT_SUBMIT', 'ATTEMPT', 2, '{"exam_id":1,"score":10.00}', '192.168.1.42', '2026-10-18 09:18:32'),
(NULL, 'AUTO_GRADING_SUCCESS', 'ATTEMPT', 2, '{"score":10.00,"pass_status":"PASSED"}', '127.0.0.1', '2026-10-18 09:18:35'),
(1, 'UPDATE_USER_ACCOUNT', 'USER', 30, '{"status":"locked","reason":"Tai khoan can xac minh thong tin"}', '192.168.1.10', '2026-10-20 08:30:00'),
(3, 'USER_LOGIN', 'USER', 3, '{"username":"student1"}', '192.168.1.42', '2026-10-21 13:50:00'),
(3, 'ATTEMPT_START', 'ATTEMPT', 7, '{"exam_id":5,"attempt_number":1}', '192.168.1.42', '2026-10-21 14:00:00'),
(3, 'ATTEMPT_SUBMIT', 'ATTEMPT', 7, '{"exam_id":5,"score":8.35}', '192.168.1.42', '2026-10-21 14:38:10'),
(NULL, 'AUTO_GRADING_SUCCESS', 'ATTEMPT', 7, '{"score":8.35,"pass_status":"PASSED"}', '127.0.0.1', '2026-10-21 14:38:15');
