# M3 — Ghi chú triển khai so với contract (v1.3)

Tài liệu này ghi các điểm M3 đã chốt/đã làm khi code, để M1/M2/M4 đối chiếu. **Không thay thế
contract** — giao diện chung vẫn là
[`Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](../Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md).
Nếu cần đổi payload/endpoint chung, sửa contract trước.

## 1. Trạng thái triển khai

| Hạng mục | Trạng thái | Ghi chú |
| --- | --- | --- |
| MQTT subscribe/publish | ✅ | Paho, QoS 1, retained status/config, reconnect |
| Ingest telemetry Node A/B | ✅ | Chuẩn hoá quality, validate deviceId topic/payload |
| Status/heartbeat/LWT | ✅ | LWT `online:false` → OFFLINE + alert ngay |
| Command + ACK + timeout/retry | ✅ | 5s (door1 10s), retry 2, Idempotency-Key |
| Config + ACK + retained | ✅ | `CONFIG_CONFLICT` nếu đang PENDING |
| DB telemetry/power/command/alert/rule/audit | ✅ | JPA + PostgreSQL 16 |
| REST cho M4 | ⚠️ | Thiếu auth; thiếu `POST /api/devices`; thiếu config history |
| Rule/automation | ✅ | 5 rule + offline + sensor fault; có test live |
| Realtime SSE | ✅ | `GET /api/stream`, hỗ trợ Bearer & `?token=`, event camelCase, heartbeat 15s |
| Auth JWT/RBAC/user | ✅ | JWT HS256, BCrypt, ADMIN/OPERATOR/VIEWER, seed dev users, bỏ `X-User-Id` |
| Flyway | ✅ | `V1__init.sql` khởi tạo 9 bảng + index, `ddl-auto: validate` |
| Dockerfile backend | ✅ | Multi-stage Dockerfile + tích hợp compose |
| OpenAPI/Swagger | ✅ | `springdoc-openapi` + `/swagger-ui/index.html` + `docs/frontend-integration.md` |
| Retention/rate limit | ❌ | P2 |
| Room/Schedule entity | ❌ | MVP dùng `roomId` string; xem mục 4 |

Kế hoạch hoàn thiện: [`PROMPT-backend-complete.md`](PROMPT-backend-complete.md).
Bằng chứng test: [`test-checklist.md`](test-checklist.md).

## 2. Đúng contract, không đổi

- Topic: `office/{deviceId}/{telemetry|status|command|ack|config}`.
- Payload telemetry Node A/B, status, command, ACK, config đúng field/kiểu/đơn vị mục 5.
- QoS 1; status + config retained; heartbeat 30s; offline 90s; command timeout 5s (door1 10s), retry 2.
- `quality` VALID/SUSPECT/INVALID: chỉ VALID dùng cho rule/automation; INVALID đếm `SENSOR_FAULT`;
  SUSPECT lưu/hiển thị nhưng phá chuỗi liên tiếp.
- REST path/response/error code theo mục 8. Phân trang `items/page/size/total/totalPages`,
  `size` mặc định 20, tối đa 100.
- Idempotency-Key cho command; `?wait=true` chờ ACK tối đa 10s.
- Command status `PENDING → SUCCESS/FAILED/TIMEOUT`; ACK trùng không ghi đè kết quả cuối.
- `door1` dùng `CLOSED` trong state/status, `CLOSE` trong action command.

## 3. Bổ sung của M3 (đã có trong contract v1.3)

| Điểm | M3 đang làm | Lý do |
| --- | --- | --- |
| `Alert.resolvedAt` | Field nullable; alert tự đóng khi điều kiện hết | Contract chỉ có OPEN/ACKNOWLEDGED, nhưng TEMP_HIGH/SENSOR_FAULT/DEVICE_OFFLINE cần trạng thái "đã hết". `GET /api/alerts` mặc định ẩn alert đã resolved; `?includeResolved=true` để xem. |
| `503 MQTT_UNAVAILABLE` | Trả khi publish lúc broker down | Contract cũ chưa có mã lỗi cho tình huống broker mất kết nối. |
| `GET /api/alerts?includeResolved=` | Query param bổ sung | Phục vụ màn hình lịch sử cảnh báo của M4. |
| `POST /commands?wait=true` | Poll DB tới 10s, trả 200 khi có ACK, 504 `COMMAND_TIMEOUT` nếu hết | Đúng mục 8.3. |
| `X-User-Id` header | Tạm thời, mặc định 1, map `issuedBy = user-<id>` | Auth JWT chưa làm; P0 sẽ thay hoàn toàn. Header này **không phải** contract cuối. |
| Response `GET /api/devices/{id}/status` | `actuators = null` với Node A | Đúng mục 8.2. |
| `POST /devices/{id}/activate|lock|decommission` | Có endpoint cơ bản | Thuộc lifecycle; P1 sẽ chặn chuyển trạng thái sai (ví dụ DECOMMISSIONED → ACTIVE). |
| Auto-register thiết bị lạ | Bật ở dev (`smartoffice.mqtt.auto-register-unknown-devices=true`), log WARN | Cho M1 test trước khi có register; production phải tắt. |
| `SENSOR_FAULT` | Set device `FAULT`, tự về `ACTIVE` sau 3 VALID liên tiếp | Đúng mục 5.5. |
| MQTT mất kết nối | Paho `automaticReconnect`, giữ `cleanSession=false`; API trả 503 nếu publish lúc broker down | Cần M4 hiển thị trạng thái lỗi. |
| WebSocket/SSE | Chưa làm; đề xuất **SSE** `/api/stream` | Contract ghi "chốt riêng"; SSE đơn giản cho dashboard. |

## 4. Lệch mô hình dữ liệu so với mục 9 (cần biết)

| Contract | Hiện tại | Kế hoạch |
| --- | --- | --- |
| `Room` entity | Chỉ có `roomId` string (`room-01`) trên `Device`/`Alert` | MVP 1 phòng; thêm bảng `Room` khi làm nhiều phòng. Không ảnh hưởng API hiện tại. |
| `Schedule` entity | Chưa có | Chưa có endpoint trong contract MVP; để P2. |
| `DeviceConfig` | **Có thêm** entity để lưu lịch sử config + ACK | Đã ghi vào contract v1.3. |
| `Role` entity | Sẽ dùng enum `Role` trong `User` (P0), không tách bảng | Đủ cho 3 role cố định. |
| `Command.issuedBy` | String `user-<id>` / `automation`, không FK | Giữ đơn giản; audit log lưu `userId` riêng. |
| `Telemetry`/`PowerReading` quan hệ | Dùng `deviceId` string, không FK JPA | Tránh lazy-loading, phù hợp truy vấn theo deviceId. |

## 5. Quy ước cần M1/M2 xác nhận trước khi ghép ESP32

1. `deviceId` trong payload **phải** trùng topic. Sai → M3 bỏ bản tin + log WARN (không trả lỗi MQTT).
2. Node A luôn gửi `quality`; firmware cũ thiếu thì M3 coi VALID + log WARN.
3. `presence=false` chỉ được dùng cho automation khi `quality=VALID`. M3 giữ `emptySince` từ bản tin
   VALID đầu tiên; mất dữ liệu/INVALID/SUSPECT không làm tăng thời gian vắng.
4. `door1` trong status là trạng thái **đọc từ công tắc từ**, không phải vị trí servo đặt.
5. ACK `state` là trạng thái **thực tế sau khi thực thi**; M3 dùng `ack.state` để cập nhật actuator UI.
   Nếu thiếu, M3 suy ra từ action.
6. Command trùng `commandId` (QoS 1 redelivery): M2 không thực thi lại, chỉ gửi lại ACK cũ.
7. Backend restart: retained `status`/`config` sẽ được broker đẩy lại; M2 phải xử lý lặp idempotent
   theo `configId`.
8. LWT mỗi node: `{"online":false}` trên topic status, retained.

## 6. Quyết định xử lý đáng chú ý

- **Telemetry mặc định `size=20`** theo contract 8.1; client muốn 100 phải truyền `size=100`.
- **`GET telemetry/energy/commands` kiểm tra device tồn tại** → 404 `NOT_FOUND` thay vì trả rỗng.
- **`SUSPECT` phá chuỗi**: 2 INVALID + 1 SUSPECT + 1 INVALID không tạo `SENSOR_FAULT` (không phải
  3 INVALID liên tiếp).
- **LWT alert** chỉ tự đóng khi thiết bị online lại (có telemetry/status `online:true`), không đóng
  chỉ vì `lastSeenAt` còn mới.
- **`ENERGY_WASTE`** chỉ dùng power reading `VALID` và còn mới trong 90s.
- **Auto-register** phân loại ENV/CONTROL theo field công suất (`busVoltageV`, `light1PowerW`,
  `fan1PowerW`) thay vì theo temperature, để bản tin INVALID toàn null vẫn vào đúng Node A.
- **Publish MQTT trong transaction**: hiện tại publish ngay trong `CommandService.create`. P1 sẽ
  chuyển sang AFTER_COMMIT/outbox để tránh gửi lệnh khi transaction rollback.

## 7. Chạy test chung (checklist)

Chi tiết + bằng chứng: [`test-checklist.md`](test-checklist.md).

- [x] Mock → MQTT → DB → REST (profile `mock`).
- [x] API gửi lệnh → MQTT command → mock ACK → DB `SUCCESS` + actuator đổi.
- [x] Idempotency-Key trùng body khác → 409 `COMMAND_DUPLICATE`.
- [x] Telemetry thiếu from/to → 400 `VALIDATION_ERROR`.
- [x] Rule update validate ngưỡng → 400 nếu ngoài dải.
- [x] TEMP_HIGH tạo alert + tự đóng khi nhiệt độ hạ.
- [x] LWT `online:false` → `DEVICE_OFFLINE`.
- [x] 3 bản tin INVALID → `SENSOR_FAULT`, device `FAULT`.
- [x] Automation phòng trống 1 phút → tự gửi OFF, `issuedBy=automation`.
- [ ] ESP32 thật (M1) → telemetry thật vào DB.
- [ ] Nút web (M4) → relay thật (M2) → ACK.
- [ ] Rút nguồn/mất WiFi → quá 90s có `DEVICE_OFFLINE` + dashboard cập nhật.
- [ ] `mode=MANUAL` → automation không ghi đè.
- [ ] `door1` mở quá ngưỡng → `DOOR_LEFT_OPEN`.
- [ ] Cấu hình Mosquitto ACL: device chỉ pub/sub topic của mình.
