# Contract chung – Phòng làm việc thông minh IoT

Tài liệu thống nhất giao diện kết nối giữa M1, M2, M3, M4. Mọi thay đổi phải báo cả nhóm và sửa vào file này trước khi code.

**Phiên bản 1.3 (07/11/2026)** – bổ sung sau khi M3 triển khai backend, không phá vỡ v1.2:

- Chốt auth JWT + RBAC + quản lý user nằm **trong backend M3** (cùng Spring Boot), không tách service riêng.
- Thêm `resolvedAt` (nullable) cho Alert: alert tự đóng khi điều kiện hết; `GET /api/alerts` mặc định ẩn alert đã resolved, thêm `?includeResolved=true` để xem.
- Thêm mã lỗi `503 MQTT_UNAVAILABLE` khi backend không publish được do broker mất kết nối.
- Thêm entity `DeviceConfig` để lưu lịch sử config/ACK.
- Ghi rõ MVP dùng `roomId` string (chưa có bảng `Room`); chưa có API `Schedule`.
- Làm rõ phân trang telemetry mặc định `size=20` (client có thể truyền tối đa 100).

**Phiên bản 1.2 (26/10/2026)** – chốt các điểm còn lệch trước khi code. Thay đổi so với v1.1:

- Thêm `quality` (VALID / SUSPECT / INVALID) vào telemetry Node A và Node B; chốt quy tắc M3 dùng dữ liệu theo `quality`.
- Chốt cảm biến nhiệt-ẩm **AHT20** (I2C, chung bus BH1750, địa chỉ 0x38).
- Thêm alert `SENSOR_FAULT` vào enum Alert type.
- Bổ sung response JSON, quy ước phân trang và bảng mã lỗi cho toàn bộ REST API.
- Định nghĩa cấu trúc `Rule` và 5 rule mặc định (TEMP_HIGH, AIR_BAD, ABSENCE_OFF, DOOR_OPEN_LIMIT, ENERGY_WASTE).
- Ghi ngoại lệ NFR-02 cho `door1` (servo + công tắc từ).

**Phiên bản 1.1 (26/10/2026)** – cập nhật theo phần cứng thực tế đã mua. Thay đổi so với bản trước:

- Phần cứng: bỏ PIR và LDR (thay bằng LD2410C và BH1750); thêm MQ-135, INA219 ×2, servo SG90, công tắc từ FR3S, buzzer 5V vào phạm vi làm.
- Telemetry Node A: `lux` và `presence` (LD2410C) bắt buộc, bỏ `light`; thêm `airRaw`, `distanceCm`, `movingEnergy`, `staticEnergy`.
- Thêm telemetry Node B (công suất từng tải từ INA219); bỏ `powerW` khỏi status.
- Status Node B: thêm `door1`, `buzzer1`.
- Đưa topic `config` vào MVP, thêm payload cấu hình và ACK cấu hình.
- REST: thêm cấu hình thiết bị, rule/ngưỡng, báo cáo năng lượng, đổi mật khẩu.
- Cập nhật Telemetry/PowerReading ở mục 9, phân quyền, phân công và mục 14.

## 1. Phạm vi MVP và phần cứng

**MVP bắt buộc:** Login + 3 role, quản lý user, đăng ký/kích hoạt/khóa/decommission device, telemetry (nhiệt độ, độ ẩm, lux, hiện diện), dashboard realtime, điều khiển đèn/quạt, command + ACK, online/offline, cảnh báo, automation (phòng trống → tắt đèn/quạt), lịch sử, cấu hình tham số từ xa.

**Mở rộng đã có phần cứng (làm sau khi MVP lõi chạy ổn):** MQ-135 (`AIR_BAD`), INA219 (công suất/điện năng, `ENERGY_WASTE`), cửa mô hình servo + công tắc từ (`door1`, `DOOR_LEFT_OPEN`), buzzer, LCD (tùy chọn).

**Để sau MVP:** AI, OTA, thông báo Telegram/email, nhiều phòng.

| Phần cứng | Trạng thái |
| --- | --- |
| ESP32 ×2, relay 5V 2 kênh, BH1750, MQ-135, LD2410C, INA219 ×2, servo SG90, công tắc từ FR3S, buzzer 5V, breadboard, quạt tản nhiệt DC 12V | Đã có |
| Cảm biến nhiệt-ẩm **AHT20**, đèn DC 12V, nguồn 12V, nguồn 5V, tụ 1000µF, diode, cầu chì, dây/terminal/jumper | Giả định đã có – **cần xác nhận** (riêng AHT20 đã chốt mua/đã có) |
| PIR, LDR | Không dùng nữa (LD2410C thay PIR, BH1750 thay LDR) |
| DHT22, LM393, biến trở, LED RGB | Không mua |

**Đã chốt:** làm cửa mô hình (servo SG90 + công tắc từ), MQ-135 và INA219 (2 cái: một cho đèn, một cho quạt). `door1`, `airRaw`, `light1PowerW`, `fan1PowerW` là trường chính thức nhưng thuộc nhóm mở rộng.

**Đã chốt (v1.2):** cảm biến nhiệt-ẩm dùng **AHT20** (I2C, SDA 21 / SCL 22, địa chỉ 0x38, chung bus với BH1750). Không dùng DHT11.

## 2. Quy ước chung

- JSON dùng **camelCase**.
- Timestamp: ISO-8601 UTC, ví dụ `2026-10-24T15:30:00Z`.
- ESP32 không có RTC nên **backend tự gán `receivedAt`** khi nhận bản tin. `ts` từ thiết bị là tùy chọn.
- Mật khẩu/secret không commit, dùng biến môi trường và `.env.example`.

## 3. Định danh

| Đối tượng | ID |
| --- | --- |
| Node A (môi trường) | `office-env-01` |
| Node B (điều khiển) | `office-ctrl-01` |
| Phòng mẫu | `room-01` |
| Command | `CMD-0001`, `CMD-0002`, ... |
| Config | `CFG-0001`, `CFG-0002`, ... |

## 4. MQTT topic

| Topic | Hướng | Ghi chú |
| --- | --- | --- |
| `office/{deviceId}/telemetry` | Device → Backend | 5 giây/lần, cả Node A và Node B |
| `office/{deviceId}/status` | Device → Backend | retained, gồm cả LWT |
| `office/{deviceId}/command` | Backend → Device | lệnh điều khiển |
| `office/{deviceId}/ack` | Device → Backend | xác nhận lệnh và xác nhận cấu hình |
| `office/{deviceId}/config` | Backend → Device | cấu hình tham số thiết bị, retained (MVP) |

## 5. Payload

### 5.1 Telemetry Node A (`office-env-01`)

| Field | Kiểu | Đơn vị / giá trị | Nguồn | Bắt buộc |
| --- | --- | --- | --- | --- |
| `temperature` | float | °C | AHT20 (I2C 0x38) | ✔ |
| `humidity` | float | %RH | AHT20 (I2C 0x38) | ✔ |
| `lux` | float | lux | BH1750 | ✔ |
| `presence` | bool | true = có người (kể cả người ngồi yên) | LD2410C | ✔ |
| `quality` | string | `VALID` / `SUSPECT` / `INVALID` | Thiết bị tự đánh giá (xem 5.5) | ✔ |
| `airRaw` | int | 0–4095 (ADC, tương đối, **không phải ppm**) | MQ-135 | mở rộng |
| `distanceCm` | int | cm, khoảng cách mục tiêu gần nhất | LD2410C | tùy chọn |
| `movingEnergy`, `staticEnergy` | int | 0–100 | LD2410C | tùy chọn |
| `rssi` | int | dBm | ESP32 | tùy chọn |

```json
{"deviceId":"office-env-01","temperature":28.5,"humidity":72,"lux":320.5,"presence":true,"quality":"VALID","airRaw":1450,"rssi":-58}
```

### 5.1b Telemetry Node B (`office-ctrl-01`) – mở rộng

| Field | Kiểu | Đơn vị | Nguồn | Bắt buộc |
| --- | --- | --- | --- | --- |
| `busVoltageV` | float | V | INA219 #1 | mở rộng |
| `light1PowerW` | float | W | INA219 #1 (địa chỉ 0x40), tải đèn | mở rộng |
| `light1CurrentMa` | int | mA | INA219 #1 | mở rộng |
| `fan1PowerW` | float | W | INA219 #2 (địa chỉ 0x41), tải quạt | mở rộng |
| `fan1CurrentMa` | int | mA | INA219 #2 | mở rộng |
| `quality` | string | `VALID` / `SUSPECT` / `INVALID` | Thiết bị tự đánh giá (xem 5.5) | ✔ (mặc định `VALID` nếu thiếu khi INA219 chưa gắn) |
| `rssi` | int | dBm | ESP32 | tùy chọn |

```json
{"deviceId":"office-ctrl-01","busVoltageV":12.1,"light1PowerW":4.8,"light1CurrentMa":397,"fan1PowerW":2.1,"fan1CurrentMa":173,"quality":"VALID","rssi":-61}
```

Điện năng (Wh) do backend tính từ công suất theo thời gian, thiết bị không tự tính.

### 5.2 Status (retained)

| Field | Giá trị |
| --- | --- |
| `online` | `true` / `false` |
| `light1`, `fan1`, `buzzer1` | `ON` / `OFF` (Node B) |
| `door1` | `OPEN` / `CLOSED` (Node B; đọc từ công tắc từ) |
| `mode` | `AUTO` / `MANUAL` |
| `fwVersion` | string |

```json
{"online":true,"light1":"OFF","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED","mode":"AUTO","fwVersion":"1.0.0"}
```

LWT (broker tự gửi khi mất kết nối): `{"online":false}`. Node A cũng gửi status với `online`, `fwVersion`.

### 5.3 Command và ACK

- `target`: `light1`, `fan1`, `buzzer1`, `door1`
- `action`: `ON`, `OFF` (cửa: `OPEN`, `CLOSE`)
- `issuedBy`: `user-<id>` hoặc `automation`

```json
{"commandId":"CMD-0001","target":"light1","action":"OFF","issuedBy":"automation"}
```

```json
{"commandId":"CMD-0001","target":"light1","status":"SUCCESS","state":"OFF","latencyMs":180}
```

ACK `status`: `SUCCESS` / `FAILED`. Backend tự quản lý `PENDING` → `TIMEOUT`.

Với `door1`: sau khi servo chuyển động, Node B đọc công tắc từ để xác nhận; `state` trả về là trạng thái đọc được (`OPEN`/`CLOSED`). Nếu không khớp với lệnh thì ACK `FAILED`.

**Ngoại lệ NFR-02 (lệnh → ACK < 1 giây):** chỉ áp dụng cho `light1`, `fan1`, `buzzer1` (relay/buzzer đổi trạng thái tức thời). Với `door1`, mục tiêu là **< 5 giây** (thời gian servo chạy + chống dội công tắc từ), đo riêng và ghi `latencyMs`; không tính vào chỉ tiêu < 1 giây.

### 5.4 Config và ACK cấu hình

Ngưỡng cảnh báo và automation (nhiệt độ cao, lux, số phút vắng, ngưỡng không khí, ngưỡng công suất) lưu ở backend (bảng `Rule`), chỉnh qua REST. Topic `config` chỉ dùng cho tham số chạy trên thiết bị.

```json
{"configId":"CFG-0001","telemetryIntervalSec":5,"servoOpenDeg":90,"servoCloseDeg":0,"issuedBy":"user-1"}
```

```json
{"configId":"CFG-0001","status":"SUCCESS"}
```

Thiết bị nhận config (retained) khi khởi động lại, áp dụng và gửi ACK trên topic `ack`. ACK cấu hình phân biệt với ACK lệnh bằng trường `configId` (thay cho `commandId`).

### 5.5 Quy ước `quality`

| Giá trị | Thiết bị gán khi | Backend/M3 xử lý |
| --- | --- | --- |
| `VALID` | Đọc thành công, nằm trong dải hợp lệ, đã qua kiểm tra chéo | Lưu, hiển thị, dùng cho rule/automation/alert |
| `SUSPECT` | Giá trị ngoài dải kỳ vọng, cảm biến trả dữ liệu bất thường, hoặc mới khởi động chưa đủ thời gian ổn định (MQ-135 warm-up) | Lưu, hiển thị kèm nhãn; **không** dùng cho automation và không sinh alert theo ngưỡng (chỉ ghi log) |
| `INVALID` | Không đọc được / lỗi giao tiếp cảm biến | Chỉ lưu + log; không hiển thị như giá trị hiện tại; **không** dùng cho automation; **không** coi là phòng trống; đếm cho `SENSOR_FAULT` |

Quy tắc bắt buộc:

- Thiết bị **luôn** gửi `quality` trong mỗi bản tin telemetry. Nếu thiếu (firmware cũ), backend coi là `VALID` nhưng ghi log cảnh báo.
- Một bản tin có nhiều cảm biến: `quality` là mức xấu nhất trong bản tin (`INVALID` > `SUSPECT` > `VALID`). Khi cần chi tiết theo từng cảm biến, gửi thêm `qualityDetail` (object, tùy chọn, ví dụ `{"temperature":"VALID","airRaw":"SUSPECT"}`).
- Đếm `SENSOR_FAULT`: N bản tin `INVALID` liên tiếp (mặc định N = 3, tương đương 15 giây) → sinh alert `SENSOR_FAULT`; khi có 3 bản tin `VALID` liên tiếp → tự đóng alert và đưa thiết bị về `ACTIVE`.
- `quality` không có trong payload `command`, `ack`, `status`, `config`.

## 6. Quy tắc MQTT

- QoS 1 cho telemetry, command, ack, config. Status và config dùng retained.
- Heartbeat (publish status) mỗi 30 giây; quá 90 giây không thấy → `OFFLINE`.
- Command timeout **5 giây** (riêng `door1`: **10 giây** vì servo chạy + đọc công tắc từ), retry tối đa 2 lần.
- Trùng `commandId`: thiết bị **không thực thi lại** nhưng vẫn gửi lại ACK cũ.
- Thiết bị tự reconnect WiFi/MQTT có backoff.
- Khi `mode = MANUAL`, automation không được ghi đè lệnh tay.
- Backend kiểm tra `deviceId` trong payload phải trùng `deviceId` trong topic; không khớp thì loại bỏ.
- Bản tin `quality = INVALID` bị loại khỏi luồng rule/automation; `SUSPECT` chỉ lưu và hiển thị (xem 5.5).
- Khi cảm biến lỗi hoặc không có dữ liệu hiện diện, automation **không** coi là phòng trống.
- Khởi động: relay ở trạng thái `OFF`, servo ở vị trí đóng, buzzer `OFF`, cho đến khi nhận lệnh.

## 7. Enum

| Enum | Giá trị |
| --- | --- |
| Role | `ADMIN`, `OPERATOR`, `VIEWER` |
| Device status | `REGISTERED`, `PROVISIONED`, `ACTIVE`, `OFFLINE`, `FAULT`, `MAINTENANCE`, `LOCKED`, `DECOMMISSIONED` |
| Command status | `PENDING`, `SUCCESS`, `FAILED`, `TIMEOUT` |
| Alert type | `TEMP_HIGH`, `AIR_BAD`, `DOOR_LEFT_OPEN`, `DEVICE_OFFLINE`, `ENERGY_WASTE`, `SENSOR_FAULT` |
| Alert severity | `LOW`, `MEDIUM`, `HIGH` |
| Alert status | `OPEN`, `ACKNOWLEDGED` |
| Mode | `AUTO`, `MANUAL` |
| Quality | `VALID`, `SUSPECT`, `INVALID` |

Lifecycle thiết bị: `REGISTERED → PROVISIONED → ACTIVE ⇄ OFFLINE / FAULT / MAINTENANCE`, và `ACTIVE → LOCKED → DECOMMISSIONED`. (`PROVISIONED`, `FAULT` lấy từ proposal, nhóm xác nhận có giữ không. Đề xuất giữ vì đề bài dùng đúng các trạng thái này làm ví dụ.)

Điều kiện sinh cảnh báo (ngưỡng cấu hình được, đo thực tế rồi chốt):

| Alert type | Điều kiện |
| --- | --- |
| `TEMP_HIGH` | `temperature` vượt ngưỡng liên tục qua N lần đo |
| `AIR_BAD` | `airRaw` vượt ngưỡng đã hiệu chuẩn (sau khi MQ-135 làm nóng xong) |
| `DOOR_LEFT_OPEN` | `door1 = OPEN` liên tục quá N phút |
| `DEVICE_OFFLINE` | quá 90 giây không nhận status/telemetry |
| `ENERGY_WASTE` | `presence = false` liên tục quá X phút nhưng công suất tải vẫn vượt ngưỡng |
| `SENSOR_FAULT` | N bản tin telemetry `quality = INVALID` liên tiếp (mặc định N = 3); tự đóng sau 3 bản tin `VALID` liên tiếp |

## 8. REST API

| Method | Endpoint | Quyền | Mô tả |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | public | đăng nhập, trả JWT |
| POST | `/api/auth/register` | Admin | tạo tài khoản (bootstrap: cho phép public khi DB chưa có user nào) |
| PUT | `/api/users/me/password` | user | đổi mật khẩu |
| GET | `/api/users` | Admin | danh sách user |
| POST | `/api/users` | Admin | tạo user |
| GET | `/api/devices` | user | danh sách thiết bị |
| POST | `/api/devices` | Admin | đăng ký thiết bị |
| POST | `/api/devices/{id}/activate` | Admin | kích hoạt |
| POST | `/api/devices/{id}/lock` | Admin | khóa |
| POST | `/api/devices/{id}/decommission` | Admin | ngừng sử dụng |
| GET | `/api/devices/{id}/status` | user | trạng thái hiện tại |
| POST | `/api/devices/{id}/mode` | Admin/Operator | body `{"mode":"MANUAL"}` |
| PUT | `/api/devices/{id}/config` | Admin/Operator | gửi cấu hình tham số thiết bị (publish topic `config`) |
| GET | `/api/devices/{id}/telemetry?from=&to=` | user | lịch sử telemetry |
| GET | `/api/devices/{id}/energy?from=&to=` | user | công suất/điện năng (Wh) theo thời gian |
| POST | `/api/devices/{id}/commands` | Admin/Operator | gửi lệnh |
| GET | `/api/devices/{id}/commands` | user | lịch sử lệnh |
| GET | `/api/rules` | user | danh sách rule/ngưỡng |
| PUT | `/api/rules/{id}` | Admin/Operator | sửa ngưỡng, bật/tắt rule |
| GET | `/api/alerts` | user | danh sách cảnh báo; mặc định ẩn alert đã resolved |
| PATCH | `/api/alerts/{id}/acknowledge` | Admin/Operator | xác nhận cảnh báo |
| GET | `/api/audit-logs` | Admin | nhật ký thao tác |

Xác thực: header `Authorization: Bearer <JWT>`. Realtime: WebSocket hoặc SSE do M3 và M4 chốt riêng.

### 8.1 Quy ước chung cho request/response

- Content-Type `application/json; charset=utf-8`.
- Timestamp trong response: ISO-8601 UTC (`2026-10-24T15:30:00Z`). ID: số nguyên tăng dần cho `userId`/`ruleId`/`alertId`; `commandId`/`configId` dạng `CMD-0001`/`CFG-0001`; `deviceId` là chuỗi.
- **Phân trang** cho mọi endpoint trả danh sách: query `page` (mặc định 0), `size` (mặc định 20, tối đa 100), `sort` (ví dụ `receivedAt,desc`). Riêng `GET /api/devices/{id}/telemetry` cũng mặc định `size=20`; client truyền `size=100` nếu cần.
- **Alert đã resolved** (`resolvedAt != null`) bị ẩn khỏi `GET /api/alerts` mặc định; thêm `?includeResolved=true` để xem lịch sử đầy đủ.

```json
{"items":[],"page":0,"size":20,"total":0,"totalPages":0}
```

- Endpoint trả một tài nguyên: trả thẳng object, không bọc `data`.
- Tạo mới: `201 Created`. Gửi lệnh (bất đồng bộ, chờ ACK): `202 Accepted`. Xóa/không có body: `204 No Content`.
- **Idempotency cho lệnh:** client gửi header `Idempotency-Key` (UUID). Cùng key + cùng body → trả lại đúng response cũ (200/202), không tạo lệnh mới.
- `PUT /api/rules/{id}` chỉ sửa rule đã có; không cho đổi `type` (tạo rule mới nếu cần loại khác).

### 8.2 Response mẫu

**POST `/api/auth/login`** → 200

```json
{"token":"eyJhbGciOiJIUzI1NiJ9...","tokenType":"Bearer","expiresIn":3600,
 "user":{"userId":2,"username":"operator1","role":"OPERATOR","accountStatus":"ACTIVE"}}
```

**GET `/api/users`** → 200 (phân trang)

```json
{"items":[{"userId":1,"username":"admin","role":"ADMIN","accountStatus":"ACTIVE","createdAt":"2026-10-20T08:00:00Z"}],
 "page":0,"size":20,"total":1,"totalPages":1}
```

**GET `/api/devices`** → 200

```json
{"items":[{"deviceId":"office-env-01","name":"Node A - môi trường","type":"ENV","status":"ACTIVE","mode":"AUTO","roomId":"room-01","online":true,"fwVersion":"1.0.0","lastSeenAt":"2026-10-24T15:30:00Z"}],
 "page":0,"size":20,"total":2,"totalPages":1}
```

**GET `/api/devices/{id}/status`** → 200

```json
{"deviceId":"office-ctrl-01","name":"Node B - điều khiển","type":"CONTROL","status":"ACTIVE","mode":"AUTO","online":true,
 "lastSeenAt":"2026-10-24T15:30:00Z","fwVersion":"1.0.0",
 "actuators":{"light1":"ON","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED"},
 "latestTelemetry":{"receivedAt":"2026-10-24T15:30:00Z","busVoltageV":12.1,"light1PowerW":4.8,"light1CurrentMa":397,"fan1PowerW":2.1,"fan1CurrentMa":173,"quality":"VALID"}}
```

Với Node A, `actuators` = `null`, `latestTelemetry` chứa `temperature`, `humidity`, `lux`, `presence`, `quality` (và `airRaw` nếu có).

**GET `/api/devices/{id}/telemetry?from=&to=&page=&size=`** → 200

```json
{"items":[{"receivedAt":"2026-10-24T15:30:00Z","temperature":28.5,"humidity":72,"lux":320.5,"presence":true,"quality":"VALID","airRaw":1450}],
 "page":0,"size":100,"total":17280,"totalPages":173}
```

`from`/`to` bắt buộc, tối đa 7 ngày/lần truy vấn; thiếu thì trả 400 `VALIDATION_ERROR`. Ví dụ trên client truyền `size=100`; mặc định của endpoint là `size=20`.

**GET `/api/devices/{id}/energy?from=&to=&bucket=hour`** → 200

```json
{"deviceId":"office-ctrl-01","from":"2026-10-24T00:00:00Z","to":"2026-10-24T23:59:59Z","unit":"Wh",
 "totalWh":42.7,
 "buckets":[{"start":"2026-10-24T00:00:00Z","light1Wh":3.1,"fan1Wh":0.4,"light1AvgW":3.1,"fan1AvgW":0.4}]}
```

`bucket`: `raw` | `minute` | `hour` | `day` (mặc định `hour`, tối đa 1000 buckets/lần).

**POST `/api/devices/{id}/commands`** body `{"target":"light1","action":"ON"}` → 202

```json
{"commandId":"CMD-0001","deviceId":"office-ctrl-01","target":"light1","action":"ON","status":"PENDING",
 "issuedBy":"user-2","issuedAt":"2026-10-24T15:30:00Z"}
```

**GET `/api/devices/{id}/commands`** → 200

```json
{"items":[{"commandId":"CMD-0001","target":"light1","action":"ON","status":"SUCCESS","issuedBy":"user-2",
 "issuedAt":"2026-10-24T15:30:00Z","ackAt":"2026-10-24T15:30:00Z","latencyMs":180}],
 "page":0,"size":20,"total":1,"totalPages":1}
```

**PUT `/api/devices/{id}/config`** body như 5.4 → 200

```json
{"configId":"CFG-0001","deviceId":"office-ctrl-01","status":"PENDING","issuedBy":"user-2","issuedAt":"2026-10-24T15:30:00Z"}
```

**POST `/api/devices/{id}/mode`** body `{"mode":"MANUAL"}` → 200 `{"deviceId":"office-ctrl-01","mode":"MANUAL","updatedAt":"2026-10-24T15:30:00Z"}`

**GET `/api/rules`** → 200

```json
{"items":[{"ruleId":1,"name":"Nhiệt độ cao","type":"TEMP_HIGH","enabled":true,
 "params":{"thresholdC":30,"consecutiveSamples":3},"action":{"alert":true,"severity":"MEDIUM"},
 "updatedAt":"2026-10-24T15:30:00Z"}],
 "page":0,"size":20,"total":5,"totalPages":1}
```

Xem cấu trúc `Rule` đầy đủ ở mục 9.1.

**GET `/api/alerts?status=OPEN&type=&from=&to=`** → 200

```json
{"items":[{"alertId":12,"type":"TEMP_HIGH","severity":"MEDIUM","status":"OPEN","deviceId":"office-env-01",
 "roomId":"room-01","value":31.2,"threshold":30,"createdAt":"2026-10-24T15:30:00Z",
 "acknowledgedBy":null,"acknowledgedAt":null,"resolvedAt":null}],
 "page":0,"size":20,"total":1,"totalPages":1}
```

**PATCH `/api/alerts/{id}/acknowledge`** → 200

```json
{"alertId":12,"status":"ACKNOWLEDGED","acknowledgedBy":2,"acknowledgedAt":"2026-10-24T15:31:00Z"}
```

**GET `/api/audit-logs`** → 200

```json
{"items":[{"logId":88,"userId":2,"action":"COMMAND_SENT","target":"office-ctrl-01/light1","result":"SUCCESS","timestamp":"2026-10-24T15:30:00Z"}],
 "page":0,"size":20,"total":1,"totalPages":1}
```

### 8.3 Format lỗi và mã lỗi

```json
{"error":{"code":"DEVICE_OFFLINE","message":"Thiết bị đang offline","details":null,"timestamp":"2026-10-24T15:30:00Z"}}
```

`details` tùy chọn (object/array, ví dụ danh sách field sai). `message` là tiếng Việt cho UI, `code` là hằng số cho client xử lý.

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Thiếu field, sai kiểu, `from`/`to` sai hoặc quá 7 ngày |
| 401 | `UNAUTHORIZED` | Thiếu/sai JWT |
| 401 | `TOKEN_EXPIRED` | JWT hết hạn, client cần login lại |
| 403 | `FORBIDDEN` | Đúng đăng nhập nhưng sai role (Viewer gửi lệnh) |
| 404 | `NOT_FOUND` | Không thấy user/device/rule/alert |
| 409 | `DEVICE_NOT_ACTIVE` | Thiết bị chưa `ACTIVE` (REGISTERED/PROVISIONED/MAINTENANCE) |
| 409 | `DEVICE_OFFLINE` | Thiết bị `ACTIVE` nhưng quá 90 giây không có status/telemetry |
| 409 | `DEVICE_LOCKED` | Thiết bị `LOCKED` |
| 409 | `DEVICE_DECOMMISSIONED` | Thiết bị `DECOMMISSIONED` |
| 409 | `COMMAND_DUPLICATE` | Cùng `Idempotency-Key` nhưng body khác (target/action khác) |
| 409 | `CONFIG_CONFLICT` | Đang có config `PENDING` chưa ACK mà gửi config mới |
| 429 | `RATE_LIMITED` | Quá số request cho phép |
| 500 | `INTERNAL_ERROR` | Lỗi backend không xác định |
| 503 | `MQTT_UNAVAILABLE` | Backend chưa kết nối được MQTT broker, không publish được lệnh/config |
| 504 | `COMMAND_TIMEOUT` | Hết timeout chờ ACK lệnh (5 giây; `door1` 10 giây) |
| 504 | `CONFIG_TIMEOUT` | Hết timeout chờ ACK cấu hình (10 giây) |

Lưu ý: kiểm tra theo thứ tự **401 → 403 → 404 → 409 trạng thái thiết bị → 202/201**, để client không nhận `DEVICE_OFFLINE` khi thực ra chưa có quyền.

`POST /api/devices/{id}/commands` mặc định trả `202` ngay (lệnh chạy nền). Nếu client cần chờ kết quả, dùng `?wait=true` (chờ tối đa 10 giây); hết thời gian đó backend trả `504 COMMAND_TIMEOUT`. Không dùng `wait=true` khi gửi `door1` từ UI realtime — để trạng thái `TIMEOUT` hiển thị qua `GET /commands`.

## 9. Database entity

`User`, `Role`, `Room`, `Device`, `Telemetry`, `PowerReading`, `Command`, `Alert`, `Rule`, `Schedule`, `DeviceConfig`, `AuditLog`.

Quan hệ chính: `Room ───< Device`, `Device ───< Telemetry`, `Device ───< PowerReading`, `Device ───< Command`, `Device ───< Alert`, `Device ───< DeviceConfig`, `User ───< AuditLog`, `User ───< Command (issuedBy)`.

> **Hiện trạng MVP (v1.3):** auth/`User` chưa triển khai (P0); 1 phòng nên `Room` đang là `roomId` string trên `Device`/`Alert`, chưa tạo bảng riêng; `Schedule` chưa có API nên chưa triển khai; `Role` dùng enum trong `User`; `DeviceConfig` thêm để lưu lịch sử config/ACK.

### 9.1 Cấu trúc `Rule`

| Field | Kiểu | Ghi chú |
| --- | --- | --- |
| `ruleId` | int | khóa chính |
| `name` | string | tên hiển thị, sửa được |
| `type` | enum | `TEMP_HIGH`, `AIR_BAD`, `ABSENCE_OFF`, `DOOR_OPEN_LIMIT`, `ENERGY_WASTE`; **không sửa sau khi tạo** |
| `enabled` | bool | bật/tắt rule |
| `params` | object | tham số theo `type`, xem bảng dưới |
| `action` | object | `{"alert":true,"severity":"MEDIUM"}` hoặc `{"command":{"target":"light1","action":"OFF"}}` |
| `updatedAt` | datetime | backend gán |

| `type` | `params` | Hành vi |
| --- | --- | --- |
| `TEMP_HIGH` | `{"thresholdC":30,"consecutiveSamples":3}` | `temperature` > ngưỡng N lần liên tiếp (chỉ bản tin `VALID`) → alert |
| `AIR_BAD` | `{"thresholdRaw":2000,"consecutiveSamples":3,"warmupSec":180}` | `airRaw` > ngưỡng sau warm-up → alert; ngưỡng chốt sau hiệu chuẩn |
| `ABSENCE_OFF` | `{"absenceMinutes":10,"targets":["light1","fan1"]}` | `presence=false` liên tục X phút và `mode=AUTO` → gửi lệnh OFF; `MANUAL` thì bỏ qua |
| `DOOR_OPEN_LIMIT` | `{"openMinutes":5}` | `door1=OPEN` liên tục → alert |
| `ENERGY_WASTE` | `{"absenceMinutes":10,"powerThresholdW":2}` | vắng quá X phút nhưng `light1PowerW + fan1PowerW` > ngưỡng → alert; `AUTO` thì tắt tải, `MANUAL` chỉ cảnh báo |

**PUT `/api/rules/{id}`** body (chỉ các field có mặt mới được cập nhật):

```json
{"name":"Nhiệt độ cao","enabled":true,"params":{"thresholdC":32,"consecutiveSamples":3},"action":{"alert":true,"severity":"MEDIUM"}}
```

Validate: `thresholdC` 0–60, `consecutiveSamples` 1–20, `absenceMinutes`/`openMinutes` 1–120, `powerThresholdW` 0–100, `warmupSec` 0–600. Sai dải → 400 `VALIDATION_ERROR` kèm `details`.

Field tối thiểu:

- **Device**: `deviceId`, `name`, `type` (ENV / CONTROL), `status`, `mode`, `roomId`, `fwVersion`, `lastSeenAt`
- **Telemetry** (Node A): `deviceId`, `receivedAt`, `temperature`, `humidity`, `lux`, `presence`, `quality`, `airRaw` (nullable)
- **PowerReading** (Node B): `deviceId`, `receivedAt`, `busVoltageV`, `light1PowerW`, `light1CurrentMa`, `fan1PowerW`, `fan1CurrentMa`, `quality`
- **Command**: `commandId`, `deviceId`, `target`, `action`, `status`, `issuedBy`, `issuedAt`, `ackAt`, `latencyMs`, `idempotencyKey` (nullable)
- **Alert**: `type`, `severity`, `status`, `deviceId`, `createdAt`, `acknowledgedBy`, `acknowledgedAt`, `value`, `threshold`, `roomId`, `resolvedAt` (nullable)
- **Rule**: `ruleId`, `name`, `type`, `params`, `action`, `enabled` (xem 9.1)
- **Schedule**: `scheduleId`, `roomId`, `time`, `action`, `enabled` (chưa có API trong MVP)
- **DeviceConfig**: `configId`, `deviceId`, `status`, `issuedBy`, `issuedAt`, `ackAt`, `payload` (lịch sử config/ACK; bổ sung v1.3)

## 10. Phân quyền

| Chức năng | Admin | Operator | Viewer |
| --- | --- | --- | --- |
| Đăng nhập, đổi mật khẩu của mình | ✓ | ✓ | ✓ |
| Quản lý user | ✓ | ✗ | ✗ |
| Quản lý/cấu hình thiết bị | ✓ | Giới hạn | ✗ |
| Chỉnh ngưỡng/rule và tham số thiết bị | ✓ | ✓ | ✗ |
| Xem dashboard, dữ liệu, báo cáo năng lượng | ✓ | ✓ | ✓ |
| Điều khiển thiết bị | ✓ | ✓ | ✗ |
| Xử lý cảnh báo | ✓ | ✓ | Chỉ xem |
| Decommission | ✓ | ✗ | ✗ |
| Audit log | ✓ | Giới hạn | ✗ |

## 11. Bảo mật tối thiểu

- Mật khẩu băm BCrypt, API dùng JWT, kiểm tra quyền ở backend.
- Mỗi device có credential MQTT riêng và ACL trên Mosquitto (chỉ đọc/ghi topic của chính nó).
- Device bị `LOCKED`/`DECOMMISSIONED` không gửi được dữ liệu.
- 2 test bảo mật bắt buộc: (1) user không đủ quyền không điều khiển được thiết bị, (2) thiết bị bị decommission không gửi dữ liệu được.
- Quyền riêng tư: chỉ thu dữ liệu môi trường và hiện diện; LD2410C là radar, không thu hình ảnh, âm thanh hay danh tính.
- An toàn điện: chỉ dùng tải DC 12V; nguồn 12V và 5V tách riêng, chung GND; cầu chì trên đường 12V, diode chống xung song song quạt, tụ 1000µF cho servo; không đấu trực tiếp 220V.

## 12. Phân công và ranh giới

| Người | Sở hữu | Bàn giao |
| --- | --- | --- |
| M1 | Firmware Node A, đọc cảm biến (AHT20, BH1750, LD2410C, MQ-135), gắn `quality`, publish telemetry/status, mock telemetry | ESP32 gửi đúng payload; có script giả lập |
| M2 | Firmware Node B, relay, servo + công tắc từ (`door1`), buzzer, INA219 ×2, gắn `quality`, command handler, ACK, nhận config (LCD nếu làm) | Gửi lệnh bằng MQTT client, nhận ACK đúng; telemetry công suất đúng payload |
| M3 | Spring Boot, MQTT subscriber, DB, REST API, auth/RBAC + user, rule engine, alert, automation, tính điện năng, publish config | Nhận dữ liệu, lưu DB, sinh cảnh báo, gửi lệnh/config |
| M4 | Frontend, login theo role, dashboard, realtime, Docker, Mosquitto ACL/credential, docs | Giao diện chạy bằng mock trước, nối backend thật sau |

**Làm song song bằng mock:** M1 dùng mock publisher, M2 test bằng MQTT client, M3 test với telemetry giả, M4 dùng JSON giả. Miễn contract không đổi thì khi thay mock bằng ESP32 thật không phải sửa code.

## 13. Git và Definition of Done

- Nhánh `main` + `feature/<mảng>-<tên>`, ví dụ `feature/backend-mqtt-subscriber`.
- Merge qua Pull Request, có ít nhất 1 người review. Không push thẳng `main`.
- Mỗi người dùng tài khoản GitHub riêng, commit message rõ ràng.
- Không commit secret; có `.env.example`.
- **Xong = code + test chạy được + ghi vào docs + merge.**

## 14. Việc còn mở

- [x] Chốt có làm cửa/servo/công tắc từ, MQ-135, INA219 → **có**
- [x] Chốt cảm biến nhiệt-ẩm → **AHT20** (I2C 0x38), đã sửa mục 5.1 và sơ đồ chân
- [x] Chốt thêm alert `SENSOR_FAULT` → **có**, gắn với `quality = INVALID` (mục 5.5, 7)
- [x] Chốt thêm `quality` vào telemetry → **có** (mục 5.5); M1/M2 phải gửi, M3 phải lọc
- [x] Chốt response JSON, phân trang, mã lỗi REST → **có** (mục 8.1–8.3)
- [x] Chốt cấu trúc `Rule` và 5 rule mặc định → **có** (mục 9.1)
- [x] Chốt ngoại lệ NFR-02 cho `door1` → ACK < 5 giây, timeout 10 giây (mục 5.3, 6)
- [ ] Xác nhận linh kiện giả định đã có: đèn 12V, nguồn 12V/5V, cầu chì, diode, tụ 1000µF
- [ ] Hàn bridge chân A0 trên INA219 #2 để đổi địa chỉ sang 0x41
- [ ] Chốt có dùng LCD không, loại LCD và gắn vào node nào
- [x] Chốt vai trò M2/M3 theo bảng mục 12 (M2 firmware Node B, M3 backend) — đã thống nhất v1.3
- [ ] Chốt giữ hay bỏ `PROVISIONED`, `FAULT` (đề xuất giữ; `SENSOR_FAULT` đã chốt)
- [ ] Làm nóng và hiệu chuẩn MQ-135, chốt ngưỡng `airRaw`; chốt ngưỡng `TEMP_HIGH`, lux, công suất
- [ ] Thử LD2410C với quạt đang chạy (kiểm tra nhiễu), chỉnh độ nhạy; nếu nhiễu thì cân nhắc thêm PIR để đối chiếu
- [x] Tạo `docker-compose.yml` (Mosquitto + PostgreSQL) và `.env.example` (backend service trong compose: TODO P0)
- [x] Viết mock publisher (telemetry Node A, Node B, status) – **có `quality`** (profile `mock` của backend)
- [ ] Cấu hình ACL/credential Mosquitto
- [ ] Vẽ ERD, sequence diagram (điều khiển, cảnh báo), state diagram, threat model
- [ ] Chỉnh lại proposal cho khớp phần cứng thật và các ngưỡng
