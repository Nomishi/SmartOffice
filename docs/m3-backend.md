# M3 — Backend (Spring Boot)

Tài liệu chi tiết phần **M3**. README chỉ giữ overview hệ thống; mọi thứ về backend nằm ở đây.

Contract chân lý: [`Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md)
(version 1.3). Ghi chú triển khai: [`m3-contract-notes.md`](m3-contract-notes.md).

## 1. Vai trò M3

Backend là mắt xích giữa firmware (M1/M2) và frontend (M4):

```text
ESP32 → MQTT broker → Spring Boot → PostgreSQL → REST/SSE → Frontend
Frontend → REST → Spring Boot → MQTT command → ESP32 → ACK → Backend → DB/SSE
```

Nhiệm vụ:

- Subscribe telemetry/status/ack; publish command/config qua MQTT.
- Lưu telemetry, công suất, command + ACK, alert, rule, config, audit log.
- REST API + SSE realtime cho M4.
- Rule engine + automation.
- Auth JWT + RBAC ADMIN/OPERATOR/VIEWER.

## 2. Trạng thái

| Hạng mục | Trạng thái |
| --- | --- |
| MQTT subscribe/publish | ✅ |
| Ingest telemetry Node A/B, status, ACK | ✅ |
| Command lifecycle + timeout/retry + Idempotency-Key | ✅ |
| Config + ACK + retained | ✅ |
| REST API + phân trang + mã lỗi | ✅ |
| Auth JWT + RBAC + user | ✅ |
| SSE `GET /api/stream` | ✅ |
| Rule engine + automation + alert | ✅ |
| Flyway V1+V2 + `ddl-auto: validate` | ✅ đã verify PostgreSQL 16 sạch |
| Dockerfile + compose backend | ✅ backend healthy, login OK |
| Test tự động | ✅ 29 test pass |
| Test ESP32/relay thật | ⏳ chưa có phần cứng |
| P1/P2: config history, search/filter, audit đầy đủ, retention, rate limit, Testcontainers | ⏳ |

## 3. Cấu trúc backend

```text
backend/
├── Dockerfile
├── pom.xml
└── src/main/java/com/smartoffice/backend/
    ├── api/          # controller, DTO, error handler
    ├── mqtt/         # Paho client + ingest
    ├── service/      # rule engine, automation, command, alert, energy, user
    ├── domain/       # JPA entity + enum
    ├── repository/
    ├── config/       # properties, CORS, seed, OpenAPI
    ├── security/     # JWT, filter, RBAC
    ├── realtime/     # SSE
    └── mock/         # giả lập M1+M2, profile mock
```

## 4. Chạy backend

### Docker (khuyến nghị)

Từ thư mục repo:

```powershell
cd deployment
Copy-Item ../.env.example .env
docker compose --profile ui up -d --build
docker compose ps
```

Backend: `http://localhost:8080`.

### Local

Cần Java 17, Maven, PostgreSQL (Docker hoặc local):

```powershell
cd backend
$env:JWT_SECRET = "smartoffice-local-secret-at-least-32-chars-long-123"
$env:SEED_DEV_USERS = "true"
mvn spring-boot:run
```

Chạy kèm mock M1+M2 (không cần ESP32):

```powershell
mvn spring-boot:run -Dspring-boot.run.profiles=mock
```

Test:

```powershell
mvn test
mvn verify
```

Swagger: `http://localhost:8080/swagger-ui/index.html`

## 5. Auth & RBAC

Mọi endpoint `/api/**` (trừ login, Swagger, actuator health) yêu cầu:

```http
Authorization: Bearer <JWT>
```

| Role | Quyền |
| --- | --- |
| ADMIN | Toàn quyền, user management, device lifecycle, audit |
| OPERATOR | Điều khiển, mode, config, sửa rule, ack alert |
| VIEWER | Chỉ đọc |

- JWT HS256/HS512 tuỳ độ dài key, expiry 3600s.
- `JWT_SECRET` bắt buộc ≥ 32 ký tự; thiếu/short → app không start.
- Dev users chỉ seed khi `SEED_DEV_USERS=true` hoặc profile `dev`.
- `?token=` chỉ chấp nhận tại `/api/stream` (EventSource).
- `issuedBy` lấy từ JWT dạng `user-<id>`; automation dùng `automation`.

Tài khoản dev:

| Username | Role | Password env |
| --- | --- | --- |
| `admin` | ADMIN | `ADMIN_PASSWORD` |
| `operator1` | OPERATOR | `OPERATOR_PASSWORD` |
| `viewer1` | VIEWER | `VIEWER_PASSWORD` |

## 6. SSE realtime

```http
GET /api/stream
Authorization: Bearer <token>

# hoặc
GET /api/stream?token=<JWT>
```

Event:

```json
{"type":"telemetry","data":{ "...":"..." },"timestamp":"2026-11-08T01:00:00Z"}
```

Loại event: `connected`, `telemetry`, `status`, `alert`, `command`, `config`.
Heartbeat `:ping` mỗi 15s.

## 7. Flyway

Migration nằm ở `database/migrations/`; Maven copy vào jar khi build.

| File | Nội dung |
| --- | --- |
| `V1__init.sql` | Schema: users, devices, telemetry, power_reading, commands, alerts, rules, device_configs, audit_logs |
| `V2__add_device_streaks_and_version.sql` | `ADD COLUMN IF NOT EXISTS` cho streak/version, idempotent |

- `ddl-auto: validate` — Hibernate không tự sửa schema.
- `baseline-on-migrate: true` — áp được lên DB đã có data.
- V1 đã có cột streak/version; V2 dùng `IF NOT EXISTS` nên DB mới log warning “already exists” — vô hại.
- **Không sửa migration đã chạy** (Flyway checksum mismatch).

Reset dev:

```powershell
cd deployment
docker compose --profile ui down -v
docker compose --profile ui up -d --build
```

## 8. MQTT contract

| Topic | Hướng | Payload mẫu |
| --- | --- | --- |
| `office/office-env-01/telemetry` | device → backend | `{"deviceId":"office-env-01","temperature":28.5,"humidity":72,"lux":320.5,"presence":true,"quality":"VALID","airRaw":1450}` |
| `office/office-ctrl-01/telemetry` | device → backend | `{"deviceId":"office-ctrl-01","busVoltageV":12.1,"light1PowerW":4.8,"light1CurrentMa":397,"fan1PowerW":2.1,"fan1CurrentMa":173,"quality":"VALID"}` |
| `office/{deviceId}/status` | device → backend, retained | `{"online":true,"light1":"OFF","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED","mode":"AUTO","fwVersion":"1.0.0"}` |
| `office/{deviceId}/command` | backend → device | `{"commandId":"CMD-0001","target":"light1","action":"OFF","issuedBy":"user-1"}` |
| `office/{deviceId}/ack` | device → backend | `{"commandId":"CMD-0001","target":"light1","status":"SUCCESS","state":"OFF","latencyMs":180}` |
| `office/{deviceId}/config` | backend → device, retained | `{"configId":"CFG-0001","telemetryIntervalSec":5,"servoOpenDeg":90,"servoCloseDeg":0,"issuedBy":"user-1"}` |

- QoS 1 cho telemetry/command/ack/config; status + config retained.
- Heartbeat 30s; quá 90s → `OFFLINE` + alert. LWT `{"online":false}` tạo alert ngay.
- Command timeout 5s (door1 10s), retry 2 → `TIMEOUT`.
- Chỉ telemetry `VALID` dùng cho rule/automation; `SUSPECT` phá chuỗi; `INVALID` đếm `SENSOR_FAULT`.

## 9. REST API

Chi tiết request/response: [`frontend-integration.md`](frontend-integration.md) và Swagger.

| Method | Endpoint | Quyền | Ghi chú |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Public | trả JWT |
| POST | `/api/auth/register` | ADMIN | bootstrap khi DB trống |
| GET | `/api/users/me` | Auth | user hiện tại |
| PUT | `/api/users/me/password` | Auth | đổi mật khẩu |
| GET/POST | `/api/users` | ADMIN | quản lý user |
| GET | `/api/devices` | VIEWER+ | phân trang |
| POST | `/api/devices` | ADMIN | 201 `REGISTERED`, trùng → 409 `DEVICE_EXISTS` |
| GET | `/api/devices/{id}` | VIEWER+ | chi tiết |
| GET | `/api/devices/{id}/status` | VIEWER+ | actuator + telemetry mới nhất |
| GET | `/api/devices/{id}/telemetry` | VIEWER+ | from/to bắt buộc, ≤ 7 ngày, size=20 |
| GET | `/api/devices/{id}/energy` | VIEWER+ | `raw|minute|hour|day` |
| GET | `/api/devices/{id}/commands` | VIEWER+ | lịch sử lệnh + ACK |
| POST | `/api/devices/{id}/commands` | OPERATOR+ | 202, `Idempotency-Key`, `?wait=true` |
| POST | `/api/devices/{id}/mode` | OPERATOR+ | AUTO/MANUAL |
| PUT | `/api/devices/{id}/config` | OPERATOR+ | config retained |
| POST | `/api/devices/{id}/activate|lock|decommission` | ADMIN | lifecycle |
| GET | `/api/alerts` | VIEWER+ | `includeResolved` |
| PATCH | `/api/alerts/{id}/acknowledge` | OPERATOR+ | |
| GET | `/api/rules` | VIEWER+ | 5 rule mặc định |
| PUT | `/api/rules/{id}` | OPERATOR+ | validate ngưỡng |
| GET | `/api/audit-logs` | ADMIN | |
| GET | `/api/stream` | Auth | SSE |

Lỗi:

```json
{"error":{"code":"FORBIDDEN","message":"...","details":null,"timestamp":"..."}}
```

Mã chính: 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED|TOKEN_EXPIRED`, 403 `FORBIDDEN`,
404 `NOT_FOUND`, 409 `DEVICE_OFFLINE|DEVICE_NOT_ACTIVE|DEVICE_EXISTS|DEVICE_LOCKED|DEVICE_DECOMMISSIONED|COMMAND_DUPLICATE|CONFIG_CONFLICT`,
503 `MQTT_UNAVAILABLE`, 504 `COMMAND_TIMEOUT`.

## 10. Rule engine

| Rule | Hành vi |
| --- | --- |
| `TEMP_HIGH` | nhiệt độ > ngưỡng N lần → alert, tự đóng khi hạ |
| `AIR_BAD` | `airRaw` > ngưỡng N lần → alert |
| `ABSENCE_OFF` | `presence=false` X phút + AUTO → gửi OFF light1/fan1 |
| `DOOR_OPEN_LIMIT` | `door1=OPEN` quá X phút → alert |
| `ENERGY_WASTE` | vắng + công suất > ngưỡng → alert, AUTO thì tắt tải |
| `SENSOR_FAULT` | 3 INVALID liên tiếp → alert; 3 VALID → đóng |
| `DEVICE_OFFLINE` | quá 90s không dữ liệu → alert; có dữ liệu → đóng |

`MANUAL` không bị automation ghi đè. Không có dữ liệu/INVALID/SUSPECT không coi là phòng trống.

## 11. Biến môi trường

| Biến | Mặc định / ghi chú |
| --- | --- |
| `JWT_SECRET` | **Bắt buộc**, ≥ 32 ký tự |
| `DB_URL` | `jdbc:postgresql://postgres:5432/iot` (Docker) |
| `DB_USER` / `DB_PASSWORD` | `iot` / trong `.env` |
| `MQTT_BROKER_URL` | `tcp://mosquitto:1883` (Docker) |
| `MQTT_CLIENT_ID` | `smartoffice-backend` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | `backend` / `BACKEND_MQTT_PASSWORD` |
| `MQTT_ENABLED` | `true` |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:5173` |
| `SEED_DEV_USERS` | `false` prod; `true` dev |
| `ADMIN_PASSWORD` / `OPERATOR_PASSWORD` / `VIEWER_PASSWORD` | mật khẩu seed |

Trong Docker: `DB_URL=jdbc:postgresql://postgres:5432/smartoffice`,
`MQTT_BROKER_URL=tcp://mosquitto:1883`.

## 12. Test

```text
mvn verify → 29 test pass
```

| Test class | Số test |
| --- | ---: |
| ApiSmokeTest | 9 |
| AuthIntegrationTest | 10 |
| StreamIntegrationTest | 3 |
| RuleServiceTest | 3 |
| EnergyServiceTest | 1 |
| DeviceServiceTest | 2 |
| Context | 1 |

Biên bản test live + phần cứng: [`test-checklist.md`](test-checklist.md).

## 13. Việc còn lại của M3

- Test ESP32 Node A/B thật, relay/servo thật, ACK thật.
- Test mất nguồn/WiFi thật (LWT + 90s offline + recovery).
- Test chung M4: nút web → relay → ACK → UI.
- GET config history, lọc/tìm kiếm device.
- Audit đầy đủ rule/alert/config.
- Clock test đầy đủ automation.
- Testcontainers Flyway/PostgreSQL trong CI.
- Retention telemetry, rate limit 429.
- Mosquitto ACL/credential (phối hợp M4).
- Room/Schedule entity nếu mở rộng nhiều phòng.
