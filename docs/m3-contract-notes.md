# M3 — Ghi chú triển khai so với contract v1.2

File này ghi các điểm M3 đã chốt khi code, để M1/M2/M4 đối chiếu. **Không thay thế contract** —
nếu cần đổi giao diện chung thì sửa file contract trước.

## 1. Đúng contract, không đổi

- Topic: `office/{deviceId}/{telemetry|status|command|ack|config}`.
- Payload telemetry Node A/B, status, command, ACK, config: đúng field/kiểu/đơn vị mục 5.
- QoS 1; status + config retained; heartbeat 30s; offline 90s; command timeout 5s (door1 10s), retry 2.
- `quality` VALID/SUSPECT/INVALID: chỉ VALID dùng cho rule/automation; INVALID đếm `SENSOR_FAULT`.
- REST path/response/error code theo mục 8. Phân trang `items/page/size/total/totalPages`.
- Idempotency-Key cho command; `?wait=true` chờ ACK tối đa 10s.
- Command status `PENDING → SUCCESS/FAILED/TIMEOUT`; ACK trùng không ghi đè kết quả cuối.
- `door1` dùng `CLOSED` trong state/status, `CLOSE` trong action command.

## 2. Bổ sung nhỏ (đã implement, cần nhóm xác nhận)

| Điểm | M3 đang làm | Lý do |
| --- | --- | --- |
| `Alert.resolvedAt` | Thêm field nullable, alert tự đóng khi điều kiện hết | Contract chỉ có OPEN/ACKNOWLEDGED, nhưng TEMP_HIGH/SENSOR_FAULT/DEVICE_OFFLINE cần trạng thái "đã hết". `GET /api/alerts` mặc định ẩn alert đã resolved; thêm `?includeResolved=true` để xem. |
| `POST /commands?wait=true` | Poll DB tới 10s, trả 200 khi có ACK, 504 `COMMAND_TIMEOUT` nếu hết | Đúng mục 8.3. |
| `X-User-Id` header | Tạm thời cho API điều khiển, mặc định 1, map thành `issuedBy = user-<id>` | JWT thuộc M2; khi có JWT sẽ bỏ header này. |
| `X-User-Id` cho acknowledge/config/mode | Như trên | |
| Response `GET /api/devices/{id}/status` | `actuators` = null với Node A | Đúng mục 8.2. |
| `POST /devices/{id}/activate|lock|decommission` | Có endpoint cơ bản | Thuộc lifecycle M2 nhưng cần để test. |
| Auto-register thiết bị lạ | Bật ở dev (`smartoffice.mqtt.auto-register-unknown-devices=true`), log WARN | Cho M1 test trước khi M2 làm register; production tắt. |
| `SENSOR_FAULT` | Set device `FAULT`, tự về `ACTIVE` sau 3 VALID liên tiếp | Đúng mục 5.5. |
| MQTT mất kết nối | Paho `automaticReconnect`, giữ `cleanSession=false`; API trả 503 `MQTT_UNAVAILABLE` nếu publish lúc broker down | Contract chưa có mã lỗi 503; **cần chốt thêm** `MQTT_UNAVAILABLE` (503). |
| WebSocket/SSE | Chưa làm, chờ M3+M4 chốt | Contract mục 8 ghi "chốt riêng". |

## 3. Quy ước cần M1/M2 xác nhận trước khi ghép ESP32

1. `deviceId` trong payload **phải** trùng topic. Sai → M3 bỏ bản tin + log WARN (không trả lỗi MQTT).
2. Node A luôn gửi `quality`; firmware cũ thiếu thì M3 coi VALID + log WARN.
3. `presence=false` chỉ được dùng cho automation khi `quality=VALID`. M3 giữ `emptySince` từ bản tin VALID đầu tiên; mất dữ liệu/INVALID không làm tăng thời gian vắng.
4. `door1` trong status là trạng thái **đọc từ công tắc từ**, không phải vị trí servo đặt.
5. ACK `state` là trạng thái **thực tế sau khi thực thi**; M3 dùng `ack.state` để cập nhật actuator UI. Nếu thiếu, M3 suy ra từ action.
6. Command trùng `commandId` (QoS 1 redelivery): M2 không thực thi lại, chỉ gửi lại ACK cũ.
7. Khi backend restart, retained `status` và `config` sẽ được broker đẩy lại; M2 cần chịu được việc nhận config lặp (idempotent theo `configId`).
8. LWT của mỗi node: `{"online":false}` trên topic status, retained.

## 4. Chạy test chung (checklist)

- [x] Mock → MQTT → DB → REST (profile `mock`).
- [x] Web/API gửi lệnh → MQTT command → mock ACK → DB `SUCCESS` + actuator đổi.
- [x] Idempotency-Key trùng body khác → 409 `COMMAND_DUPLICATE`.
- [x] Telemetry thiếu field → 400 `VALIDATION_ERROR`.
- [x] Rule update validate ngưỡng → 400 nếu ngoài dải.
- [ ] ESP32 thật (M1) → telemetry thật vào DB.
- [ ] Nút web (M4) → relay thật (M2) → ACK.
- [ ] Rút nguồn/mất WiFi → quá 90s có `DEVICE_OFFLINE` + dashboard cập nhật.
- [ ] Phòng trống 1 phút (hạ `absenceMinutes=1`) → tự gửi OFF, `issuedBy=automation`.
- [ ] `mode=MANUAL` → automation không ghi đè.
- [ ] `door1` mở quá ngưỡng → `DOOR_LEFT_OPEN`.
- [ ] Cấu hình Mosquitto ACL: device chỉ pub/sub topic của mình.
