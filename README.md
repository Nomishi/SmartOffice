# Smart Office IoT — M3 Backend

Backend Spring Boot cho hệ thống phòng làm việc thông minh. Đây là phần **M3**: cầu nối giữa
firmware (M1/M2) và frontend (M4).

- MQTT: subscribe telemetry/status/ack, publish command/config
- PostgreSQL: lưu telemetry, công suất, lệnh, ACK, cảnh báo, rule, config, audit log
- REST API cho M4
- Rule engine: nhiệt độ cao, không khí xấu, phòng trống, cửa mở lâu, lãng phí điện, mất heartbeat, sensor fault

Nguồn chân lý: [`Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md)
(version 1.3). Ghi chú triển khai: [`docs/m3-contract-notes.md`](docs/m3-contract-notes.md).
Mọi thay đổi payload/endpoint phải sửa contract trước.

## Trạng thái triển khai

**Đã có và đã test:**

- MQTT Paho: subscribe `office/+/telemetry|status|ack`, publish `command|config`, QoS 1,
  reconnect, retained status/config, validate `deviceId` topic vs payload.
- Ingest telemetry Node A/B, status/heartbeat, ACK command/config; command lifecycle
  `PENDING → SUCCESS/FAILED/TIMEOUT`, timeout 5s (door1 10s), retry 2, Idempotency-Key.
- Entity: `Device`, `Telemetry`, `PowerReading`, `Command`, `Alert`, `Rule`, `DeviceConfig`, `AuditLog`.
- REST: devices/status/telemetry/energy/commands/mode/config/alerts/rules/audit-logs, phân trang,
  format lỗi `{"error":{"code","message","details","timestamp"}}`.
- Rule engine: 5 rule mặc định + `DEVICE_OFFLINE` + `SENSOR_FAULT`; automation không ghi đè `MANUAL`;
  chỉ dùng telemetry `VALID`.
- Mock profile `mock` giả lập cả M1+M2 và trả ACK thật.
- 15 test tự động đang xanh; đã test live command→ACK, alert, LWT offline, SENSOR_FAULT,
  automation phòng trống. Xem [`docs/test-checklist.md`](docs/test-checklist.md).

**Chưa có (nằm trong kế hoạch P0/P1):**

- Auth JWT + RBAC + user management (đang dùng header tạm `X-User-Id`).
- SSE realtime cho dashboard.
- OpenAPI/Swagger + tài liệu tích hợp frontend.
- Flyway migration (đang `ddl-auto: update`).
- `Dockerfile` backend + service backend trong compose.
- Retention dữ liệu, rate limit, test MQTT bằng broker thật trong CI.
- Entity `Room`, `Schedule` (MVP dùng `roomId` string; xem ghi chú contract).

Kế hoạch hoàn thiện backend: [`docs/PROMPT-backend-complete.md`](docs/PROMPT-backend-complete.md).

## Cấu trúc

```
SmartOffice/
├── backend/                     # Spring Boot (M3)
│   └── src/main/java/com/smartoffice/backend/
│       ├── api/                 # REST controller + DTO + error handler
│       ├── mqtt/                # Paho client + ingest
│       ├── service/             # rule engine, automation, command, alert, energy
│       ├── domain/              # JPA entity + enum
│       ├── repository/
│       ├── config/              # properties, CORS, seed data
│       └── mock/                # giả lập M1+M2 (profile mock)
├── infra/mosquitto/             # cấu hình broker cho dev
├── docs/                        # ghi chú contract, API, test, prompt handoff
├── docker-compose.yml           # PostgreSQL + Mosquitto (backend service: TODO P0)
├── .env.example
└── Contract_chung_...md         # contract chung của nhóm
```

## Chạy nhanh (5 phút)

### 1. Bật hạ tầng

```powershell
Copy-Item .env.example .env      # chỉnh nếu cần; KHÔNG commit .env
docker compose up -d
docker compose ps                # chờ postgres healthy
```

Postgres ở `localhost:5433` (tránh đụng Postgres local), Mosquitto ở `1883`.

> **Windows:** nếu đã cài Mosquitto service, nó có thể giữ `127.0.0.1:1883` song song với broker
> Docker. Kiểm tra bằng `Get-NetTCPConnection -LocalPort 1883`. Nên tắt một bên:
> `Stop-Service mosquitto` (PowerShell admin) nếu dùng broker Docker.

### 2. Chạy backend + giả lập thiết bị

```powershell
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=mock
```

Profile `mock` publish telemetry mỗi 5 giây và status/heartbeat mỗi 30 giây cho 2 node, đồng thời
nhận command/config để trả ACK. Không cần ESP32, không cần MQTTX.
Chu kỳ hiện diện: 3 phút có người, 2 phút vắng (dùng để test automation; có thể hạ
`absenceMinutes` xuống 1 để thấy nhanh).

Chạy thật (không mock):

```powershell
mvn spring-boot:run
```

Chạy test:

```powershell
mvn test
```

### 3. Kiểm tra

Dùng `curl.exe` (PowerShell 7) hoặc `Invoke-RestMethod`:

```powershell
curl.exe http://localhost:8080/api/devices
curl.exe http://localhost:8080/api/devices/office-ctrl-01/status
curl.exe http://localhost:8080/api/alerts
curl.exe http://localhost:8080/api/rules
```

Gửi lệnh bật đèn (mock trả ACK sau ~180ms):

```powershell
curl.exe -i -X POST http://localhost:8080/api/devices/office-ctrl-01/commands `
  -H "Content-Type: application/json" `
  -H "X-User-Id: 2" `
  -H "Idempotency-Key: 11111111-1111-1111-1111-111111111111" `
  -d '{"target":"light1","action":"ON"}'

# chờ ACK rồi trả kết quả
curl.exe -X POST "http://localhost:8080/api/devices/office-ctrl-01/commands?wait=true" `
  -H "Content-Type: application/json" -d '{"target":"fan1","action":"ON"}'
```

> `X-User-Id` là tạm thời cho tới khi P0 auth JWT hoàn tất. Sau đó dùng
> `Authorization: Bearer <token>`.

## MQTT contract đang dùng

| Topic | Hướng | Payload mẫu |
| --- | --- | --- |
| `office/office-env-01/telemetry` | device → backend | `{"deviceId":"office-env-01","temperature":28.5,"humidity":72,"lux":320.5,"presence":true,"quality":"VALID","airRaw":1450}` |
| `office/office-ctrl-01/telemetry` | device → backend | `{"deviceId":"office-ctrl-01","busVoltageV":12.1,"light1PowerW":4.8,"light1CurrentMa":397,"fan1PowerW":2.1,"fan1CurrentMa":173,"quality":"VALID"}` |
| `office/{deviceId}/status` | device → backend, retained | `{"online":true,"light1":"OFF","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED","mode":"AUTO","fwVersion":"1.0.0"}` |
| `office/{deviceId}/command` | backend → device | `{"commandId":"CMD-0001","target":"light1","action":"OFF","issuedBy":"automation"}` |
| `office/{deviceId}/ack` | device → backend | `{"commandId":"CMD-0001","target":"light1","status":"SUCCESS","state":"OFF","latencyMs":180}` |
| `office/{deviceId}/config` | backend → device, retained | `{"configId":"CFG-0001","telemetryIntervalSec":5,"servoOpenDeg":90,"servoCloseDeg":0,"issuedBy":"user-1"}` |

- QoS 1 cho telemetry/command/ack/config. Status và config retained.
- Heartbeat 30s, quá 90s không thấy → `OFFLINE` + alert `DEVICE_OFFLINE`. LWT `{"online":false}`
  cũng tạo alert ngay.
- Command timeout 5s (door1 10s), retry tối đa 2 lần → `TIMEOUT`.
- Chỉ dùng telemetry `quality=VALID` cho automation/ngưỡng; `INVALID` chỉ lưu + đếm `SENSOR_FAULT`;
  `SUSPECT` lưu/hiển thị nhưng phá chuỗi VALID/INVALID liên tiếp.
- Thiếu `quality` → backend coi `VALID` + log WARN (firmware cũ).

Test tay bằng MQTTX / mosquitto_pub:

```powershell
mosquitto_pub -h localhost -t office/office-env-01/telemetry -q 1 -m '{"deviceId":"office-env-01","temperature":31.5,"humidity":70,"lux":300,"presence":false,"quality":"VALID"}'
mosquitto_sub -h localhost -t 'office/#' -v
```

## REST API (M3 đã làm)

| Method | Endpoint | Ghi chú |
| --- | --- | --- |
| GET | `/api/devices` | phân trang `page,size,sort` |
| GET | `/api/devices/{id}` | chi tiết thiết bị |
| GET | `/api/devices/{id}/status` | trạng thái + actuator + telemetry mới nhất |
| GET | `/api/devices/{id}/telemetry?from=&to=` | bắt buộc from/to, tối đa 7 ngày, mặc định `size=20` |
| GET | `/api/devices/{id}/energy?from=&to=&bucket=` | `raw|minute|hour|day`, tối đa 1000 bucket |
| GET | `/api/devices/{id}/commands` | lịch sử lệnh + ACK |
| POST | `/api/devices/{id}/commands` | 202, hỗ trợ `Idempotency-Key`, `?wait=true` |
| POST | `/api/devices/{id}/mode` | `{"mode":"MANUAL"}` |
| PUT | `/api/devices/{id}/config` | publish topic config retained |
| POST | `/api/devices/{id}/activate|lock|decommission` | lifecycle cơ bản |
| GET | `/api/alerts` | lọc `status,type,deviceId,from,to`; mặc định ẩn alert đã resolved |
| PATCH | `/api/alerts/{id}/acknowledge` | |
| GET | `/api/rules` | 5 rule mặc định |
| PUT | `/api/rules/{id}` | sửa ngưỡng, validate theo contract |
| GET | `/api/audit-logs` | nhật ký lệnh/config |

- Alert đã tự đóng (`resolvedAt != null`) bị ẩn mặc định; thêm `?includeResolved=true` để xem.
- Lỗi: 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 409 `DEVICE_NOT_ACTIVE|DEVICE_OFFLINE|DEVICE_LOCKED|DEVICE_DECOMMISSIONED|COMMAND_DUPLICATE|CONFIG_CONFLICT`, 503 `MQTT_UNAVAILABLE`, 504 `COMMAND_TIMEOUT`.
- Auth/JWT + user management **chưa có**; hiện dùng header tạm `X-User-Id`. Đây là P0 của
  [`docs/PROMPT-backend-complete.md`](docs/PROMPT-backend-complete.md), không phải phần M2.

## Rule engine

| Rule | Hành vi |
| --- | --- |
| `TEMP_HIGH` | nhiệt độ > ngưỡng N lần liên tiếp → alert, tự đóng khi xuống dưới ngưỡng |
| `AIR_BAD` | `airRaw` > ngưỡng N lần → alert |
| `ABSENCE_OFF` | `presence=false` liên tục X phút + mode AUTO → gửi OFF light1/fan1 |
| `DOOR_OPEN_LIMIT` | `door1=OPEN` quá X phút → alert |
| `ENERGY_WASTE` | vắng + công suất > ngưỡng → alert, AUTO thì tắt tải |
| `SENSOR_FAULT` | 3 bản tin `INVALID` liên tiếp → alert; 3 `VALID` liên tiếp → tự đóng |
| `DEVICE_OFFLINE` | quá 90s không status/telemetry → alert; có dữ liệu mới → tự đóng |

Thiết bị `MANUAL` không bị automation ghi đè. Không có dữ liệu / `INVALID` / `SUSPECT` không bị coi là phòng trống.
`ENERGY_WASTE` chỉ dùng power reading `VALID` và còn mới (trong 90s).

## Biến môi trường

Copy `.env.example` → `.env` (không commit). Các biến chính:

| Biến | Mặc định |
| --- | --- |
| `DB_URL` | `jdbc:postgresql://localhost:5433/smartoffice` |
| `DB_USER` / `DB_PASSWORD` | `smartoffice` / `smartoffice` |
| `MQTT_BROKER_URL` | `tcp://localhost:1883` |
| `MQTT_CLIENT_ID` | `smartoffice-backend` |
| `MQTT_ENABLED` | `true` (test = false) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` |

Khi chạy backend trong Docker (P0), `DB_URL` phải trỏ `jdbc:postgresql://postgres:5432/smartoffice`
và `MQTT_BROKER_URL=tcp://mosquitto:1883`.

## Git workflow (contract mục 13)

Repo: `https://github.com/Nomishi/SmartOffice`. Không push thẳng `main`.

```powershell
git checkout main
git pull origin main
git checkout -b feature/<mảng>-<tên>    # ví dụ feature/backend-mqtt-subscriber
# code + test
git add .
git commit -m "feat: ..."
git push -u origin feature/<mảng>-<tên>
```

Mở Pull Request vào `main`, cần ít nhất 1 người review. Xong = code + test chạy + docs + merge.

## Việc tiếp theo (ưu tiên P0 → P1)

- [ ] Auth JWT + RBAC + user management (backend M3, unblock M4)
- [ ] SSE realtime `/api/stream` cho dashboard
- [ ] OpenAPI/Swagger + `docs/frontend-integration.md`
- [ ] Flyway `V1__init.sql`, chuyển `ddl-auto: validate`
- [ ] `Dockerfile` + service backend trong `docker-compose.yml`
- [ ] Test automation/offline/command lifecycle đầy đủ; test MQTT broker thật
- [ ] Retention telemetry, rate limit
- [ ] Mosquitto ACL + credential (M4 phối hợp)
- [ ] Test với ESP32 thật + relay thật
