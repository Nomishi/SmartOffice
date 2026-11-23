# Kết quả nonfunctional_load

Chạy lúc 06:10 11/11/2026 (giờ máy), API `http://localhost:3000/api`, broker `127.0.0.1:1883`.

| ID | Hạng mục | Kết quả mong đợi | Kết quả thực | Đánh giá |
| --- | --- | --- | --- | --- |
| PCN-05 | Tải đồng thời API + SSE | Không lỗi, mọi client SSE vẫn nhận dữ liệu | 300 request / 30 luồng trong 0.6 s (469 req/s): n=300, trung bình 56 ms, trung vị 56, p95 81, lớn nhất 99, lỗi 0; 20 client SSE nhận 2–2 sự kiện telemetry trong lúc tải | **PASS** |

Tổng: PASS 1
