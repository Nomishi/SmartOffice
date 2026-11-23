# Kết quả nonfunctional_command

Chạy lúc 06:05 11/11/2026 (giờ máy), API `http://localhost:3000/api`, broker `127.0.0.1:1883`.

| ID | Hạng mục | Kết quả mong đợi | Kết quả thực | Đánh giá |
| --- | --- | --- | --- | --- |
| PCN-02 | Độ trễ lệnh → ACK (NFR-02) | < 1 s cho đèn/quạt/còi; cửa < 5 s | đèn, 20 lệnh qua REST: khứ hồi n=20, trung bình 169 ms, trung vị 163, p95 185, lớn nhất 186; thiết bị xử lý n=20, trung bình 2 ms, trung vị 2, p95 2, lớn nhất 2; lỗi 0. Cửa: OPEN SUCCESS khứ hồi 185 ms (thiết bị 52 ms); CLOSE FAILED khứ hồi 2749 ms (thiết bị 2532 ms) | **PASS** |

Tổng: PASS 1
