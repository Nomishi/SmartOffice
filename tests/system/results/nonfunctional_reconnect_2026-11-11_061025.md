# Kết quả nonfunctional_reconnect

Chạy lúc 06:10 11/11/2026 (giờ máy), API `http://localhost:3000/api`, broker `127.0.0.1:1883`.

| ID | Hạng mục | Kết quả mong đợi | Kết quả thực | Đánh giá |
| --- | --- | --- | --- | --- |
| PCN-04 | Phục hồi sau khi broker khởi động lại (NFR-04) | < 30 s, đầu-cuối tới backend | thiết bị gửi lại: office-ctrl-01 0.5 s, office-env-01 0.6 s; backend nhận lại dữ liệu: office-env-01 112 s, office-ctrl-01 112 s — tính từ lúc broker chạy lại; phần chậm nằm ở client MQTT của backend (Paho tự kết nối lại với thời gian chờ tăng dần) | **FAIL** |

Tổng: FAIL 1
