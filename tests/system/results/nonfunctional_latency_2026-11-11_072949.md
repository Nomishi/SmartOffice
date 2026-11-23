# Kết quả nonfunctional_latency

Chạy lúc 07:29 11/11/2026 (giờ máy), API `http://localhost:3000/api`, broker `127.0.0.1:1883`.

| ID | Hạng mục | Kết quả mong đợi | Kết quả thực | Đánh giá |
| --- | --- | --- | --- | --- |
| PCN-01 | Độ trễ cảm biến → dashboard (NFR-01) | < 2 s | broker → backend → SSE tới trình duyệt: n=24, trung bình 3 ms, trung vị 3, p95 6, lớn nhất 7 (24 bản tin trong 60 s) — cộng thêm thời gian ESP32 đọc cảm biến + Wi-Fi (không đo được bằng đồng hồ máy này) | **PASS** |

Tổng: PASS 1
