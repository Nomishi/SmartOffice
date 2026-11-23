# Kết quả functional_telemetry-control-alert-config

Chạy lúc 08:35 11/11/2026 (giờ máy), API `http://localhost:3000/api`, broker `127.0.0.1:1883`.

| ID | Hạng mục | Kết quả mong đợi | Kết quả thực | Đánh giá |
| --- | --- | --- | --- | --- |
| CN-03 | Telemetry Node A | Lưu DB, có quality, dashboard đọc được qua API | seq 27, quality SUSPECT, temperature=23.58, humidity=78.35, lux=41.67, presence=True, airRaw=1415; API receivedAt 2026-11-11T01:35:20.854942Z | **PASS** |
| CN-04 | Telemetry Node B | Lưu DB, có quality, dashboard đọc được qua API | seq 7, quality VALID, busVoltageV=4.41, light1PowerW=0, fan1PowerW=0; API receivedAt 2026-11-11T01:35:25.803049Z | **PASS** |
| CN-03b | Tra cứu lịch sử + báo cáo năng lượng | API lịch sử 10 phút trả dữ liệu; API năng lượng trả 200 | lịch sử 200 (32 bản ghi/trang), năng lượng 200 | **PASS** |
| CN-05 | Điều khiển đèn / quạt / còi | ACK SUCCESS, trạng thái actuator đổi đúng | light1 ON: SUCCESS, thiết bị 2 ms, khứ hồi 1533 ms, light1CurrentMa=29; light1 OFF: SUCCESS, thiết bị 2 ms, khứ hồi 169 ms; fan1 ON: SUCCESS, thiết bị 2 ms, khứ hồi 168 ms, fan1CurrentMa=579; fan1 OFF: SUCCESS, thiết bị 2 ms, khứ hồi 167 ms; buzzer1 ON: SUCCESS, thiết bị 2 ms, khứ hồi 168 ms; buzzer1 OFF: SUCCESS, thiết bị 2 ms, khứ hồi 171 ms | **PASS** |
| CN-06 | Điều khiển cửa (servo + công tắc từ) | OPEN/CLOSE đều SUCCESS, trạng thái cửa theo công tắc từ, < 5 s | OPEN → FAILED (2533 ms); CLOSE → SUCCESS (702 ms); trạng thái cuối CLOSED — lệnh FAILED khi công tắc từ không xác nhận là đúng thiết kế; cần chỉnh nam châm | **FAIL** |
| CN-07 | Sinh và xử lý cảnh báo TEMP_HIGH | Hạ ngưỡng dưới nhiệt độ thật → alert OPEN; Operator xác nhận được; trả ngưỡng → alert đóng | nhiệt độ 23.56 °C, ngưỡng thử 21 °C → alert sau 16 s, xác nhận HTTP 200, tự đóng sau 6 s khi trả ngưỡng 30 °C | **PASS** |
| CN-13 | Thay đổi cấu hình thiết bị từ xa | Config hợp lệ → ACK SUCCESS và áp dụng; sai dải → API 400, thiết bị FAILED | PUT chu kỳ 7 s → CFG-0014 ACK SUCCESS; khoảng cách telemetry sau đổi: [7.1, 7.0, 7.1] s (trung vị 7.1 s); API giá trị sai 99999 → 400 VALIDATION_ERROR; gửi thẳng góc servo 999 → thiết bị trả FAILED | **PASS** |

Tổng: PASS 6, FAIL 1
