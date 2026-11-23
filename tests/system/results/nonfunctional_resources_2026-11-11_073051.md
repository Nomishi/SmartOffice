# Kết quả nonfunctional_resources

Chạy lúc 07:30 11/11/2026 (giờ máy), API `http://localhost:3000/api`, broker `127.0.0.1:1883`.

| ID | Hạng mục | Kết quả mong đợi | Kết quả thực | Đánh giá |
| --- | --- | --- | --- | --- |
| PCN-06 | Mức dùng tài nguyên | Ghi nhận CPU / RAM | iot-frontend: CPU 0.00%, RAM 16.03MiB; iot-backend: CPU 2.64%, RAM 433.6MiB; iot-postgres: CPU 0.09%, RAM 44.02MiB; iot-mosquitto: CPU 0.07%, RAM 4.223MiB — RAM ESP32: firmware dùng 15–17 % RAM tĩnh (theo trình biên dịch) | **PASS** |

Tổng: PASS 1
