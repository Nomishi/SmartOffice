# Kết quả functional_absence

Chạy lúc 06:40 11/11/2026 (giờ máy), API `http://localhost:3000/api`, broker `127.0.0.1:1883`.

| ID | Hạng mục | Kết quả mong đợi | Kết quả thực | Đánh giá |
| --- | --- | --- | --- | --- |
| CN-08 | Tự động tắt tải khi phòng trống | presence=false ≥ 1 phút, AUTO → lệnh OFF issuedBy=automation | radar báo vắng từ giây 0; đèn tắt ở giây 76 bởi automation (CMD-0128) — automation chỉ dùng bản tin quality VALID (MQ-135 làm nóng 3 phút sau khi Node A khởi động thì bản tin là SUSPECT) | **PASS** |

Tổng: PASS 1
