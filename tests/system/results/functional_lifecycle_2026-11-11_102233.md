# Kết quả functional_lifecycle

Chạy lúc 10:22 11/11/2026 (giờ máy), API `http://localhost:3000/api`, broker `127.0.0.1:1883`.

| ID | Hạng mục | Kết quả mong đợi | Kết quả thực | Đánh giá |
| --- | --- | --- | --- | --- |
| CN-17 | Vòng đời thiết bị: đăng ký, kích hoạt, bảo trì, khóa/mở khóa, ngừng sử dụng | Đúng luồng thì chuyển được; sai luồng 409 INVALID_TRANSITION; decommission không hoàn tác; Operator không được đăng ký | test-device-fd6a53: REGISTERED → activate:ACTIVE → maintenance:MAINTENANCE → activate:ACTIVE → decommission:409 INVALID_TRANSITION → lock:LOCKED → activate:ACTIVE → lock:LOCKED → decommission:DECOMMISSIONED → activate:409 INVALID_TRANSITION; Operator đăng ký → 403 — thiết bị thử để lại ở trạng thái DECOMMISSIONED | **PASS** |

Tổng: PASS 1
