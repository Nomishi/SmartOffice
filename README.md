# Smart Office IoT — M3 Backend

Backend Spring Boot cho hệ thống phòng làm việc thông minh. Đây là phần **M3**: cầu nối giữa
firmware (M1/M2) và frontend (M4).

- MQTT: subscribe telemetry/status/ack, publish command/config
- PostgreSQL: lưu telemetry, công suất, lệnh, ACK, cảnh báo, rule, config, audit log
- REST API + SSE cho M4; Auth JWT + RBAC (ADMIN/OPERATOR/VIEWER)
- Rule engine: nhiệt độ cao, không khí xấu, phòng trống, cửa mở lâu, lãng phí điện, mất heartbeat, sensor fault

Nguồn chân lý: [`Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md)
(version 1.3). Ghi chú triển khai: [`docs/m3-contract-notes.md`](docs/m3-contract-notes.md).
Mọi thay đổi payload/endpoint phải sửa contract trước.

## Trạng thái triển khai

**P0 — Đã hoàn thành và verified:**

| Hạng mục | Trạng thái |
| --- | --- |
| Auth JWT HS512, RBAC ADMIN/OPERATOR/VIEWER | ✅ Xong |
| SSE realtime `GET /api/stream` | ✅ Xong |
| OpenAPI/Swagger + `docs/frontend-integration.md` | ✅ Xong |
| Flyway V1+V2 migration, `ddl-auto: validate` | ✅ Xong |
| Dockerfile + service backend trong docker-compose | ✅ Xong |
| `mvn verify` xanh (29 test pass) | ✅ Xanh |
| `docker compose up --build` → backend healthy | ✅ Chạy được |
| Login → JWT → GET /api/devices hoạt động | ✅ Verified |
| Flyway trên PostgreSQL 16 sạch | ✅ Verified |

**P1/P2 — Chưa làm (ngoài scope P0):**

- Testcontainers cho Flyway/PostgreSQL test trong CI
- Retention telemetry, rate limit 429, Prometheus metrics
- Entity `Room`, `Schedule` (MVP dùng `roomId` string)
- Mosquitto ACL + credential (phối hợp M4)
- Test với ESP32 thật + relay thật

Kế hoạch: [`docs/PROMPT-backend-complete.md`](docs/PROMPT-backend-complete.md).

## Cấu trúc

```
SmartOffice/
├── backend/                     # Spring Boot (M3)
│   ├── Dockerfile               # multi-stage JDK 21 → JRE
│   └── src/main/java/com/smartoffice/backend/
│       ├── api/                 # REST controller + DTO + error handler
│       ├── mqtt/                # Paho client + ingest
│       ├── service/             # rule engine, automation, command, alert, energy
│       ├── domain/              # JPA entity + enum
│       ├── repository/
│       ├── config/              # properties, CORS, seed data, OpenAPI
│       ├── security/            # JWT, RBAC, filter
│       └── mock/                # giả lập M1+M2 (profile mock)
├── infra/mosquitto/             # cấu hình broker cho dev
├── docs/                        # ghi chú contract, API, test, prompt handoff
├── docker-compose.yml           # PostgreSQL + Mosquitto + Backend
├── .env.example                 # copy → .env, không commit .env
└── Contract_chung_...md         # contract chung của nhóm
```

## Chạy nhanh (5 phút)

### 1. Bật toàn bộ stack

```powershell
Copy-Item .env.example .env      # chỉnh nếu cần; KHÔNG commit .env
# Bắt buộc: đặt JWT_SECRET >= 32 ký tự
docker compose up --build -d
docker compose ps                # chờ backend healthy (~30s)
```

Postgres ở `localhost:5433`, Mosquitto ở `1883` (hoặc `1884` nếu set `MOSQUITTO_PORT=1884`), Backend ở `8080`.

> **Windows:** nếu Windows Mosquitto service giữ cổng 1883, thêm `MOSQUITTO_PORT=1884` vào `.env`.
> Kiểm tra: `Get-NetTCPConnection -LocalPort 1883`.

### 2. Lấy JWT token

```powershell
$body = @{ username = "admin"; password = $env:ADMIN_PASSWORD } | ConvertTo-Json
$res = Invoke-RestMethod -Uri http://localhost:8080/api/auth/login `
  -Method Post -Body $body -ContentType application/json
$token = $res.token
```

Dev users (chỉ có khi `SEED_DEV_USERS=true` hoặc profile `dev`):

| Username | Role | Mật khẩu (env) |
| --- | --- | --- |
| `admin` | ADMIN | `ADMIN_PASSWORD` |
| `operator1` | OPERATOR | `OPERATOR_PASSWORD` |
| `viewer1` | VIEWER | `VIEWER_PASSWORD` |

### 3. Gọi API

```powershell
# Danh sách thiết bị
Invoke-RestMethod http://localhost:8080/api/devices `
  -Headers @{ Authorization = "Bearer $token" }

# Gửi lệnh (cần role OPERATOR hoặc ADMIN)
$cmd = @{ target = "light1"; action = "ON" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  http://localhost:8080/api/devices/office-ctrl-01/commands `
  -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = [guid]::NewGuid() } `
  -Body $cmd -ContentType application/json

# SSE realtime (token qua query param — chỉ cho /api/stream)
curl.exe -N "http://localhost:8080/api/stream?token=$token"
```

### 4. Chạy backend riêng (không Docker)

```powershell
cd backend
# Cần PostgreSQL chạy ở localhost:5433 và JWT_SECRET trong env
$env:JWT_SECRET = "super-secure-jwt-secret-key-at-least-256-bits!"
$env:SEED_DEV_USERS = "true"
mvn spring-boot:run
```

Profile mock (giả lập thiết bị, không cần ESP32):

```powershell
mvn spring-boot:run -Dspring-boot.run.profiles=mock
```

Chạy test:

```powershell
mvn test
# hoặc đầy đủ
mvn verify
```

### 5. Swagger UI

```
http://localhost:8080/swagger-ui.html
```

## Auth & RBAC

Tất cả endpoint `/api/**` (trừ `/api/auth/**`, `/api/stream`, `/actuator/health`) đều yêu cầu
`Authorization: Bearer <JWT>`.

| Role | Quyền |
| --- | --- |
| ADMIN | Full access, kể cả user management |
| OPERATOR | Gửi lệnh, thay đổi mode/config, xem mọi thứ |
| VIEWER | Chỉ đọc (GET); 403 nếu POST/PUT/PATCH |

JWT claims: `sub=<username>`, `role=<ROLE>`, `userId=<id>`, `issuedBy=user-<id>`, exp=1h.

**Bảo mật:**
- `JWT_SECRET` phải ≥ 32 ký tự — backend throw `IllegalStateException` nếu thiếu.
- `?token=` chỉ được chấp nhận tại `/api/stream` (SSE). Các endpoint khác bắt buộc Bearer header.
- Dev users chỉ được seed khi `SEED_DEV_USERS=true` hoặc profile `dev`.
- CORS: không dùng `*` + `allowCredentials(true)` cùng lúc.

## SSE Realtime

```
GET /api/stream
Authorization: Bearer <token>          # Bearer header
# hoặc
GET /api/stream?token=<JWT>            # query param (chỉ endpoint này)
```

Events được push mỗi khi có: telemetry mới, thay đổi trạng thái thiết bị, alert mới, ACK lệnh.

## Flyway Migrations

| File | Nội dung |
| --- | --- |
| `V1__init.sql` | Tạo toàn bộ schema (users, devices, telemetry, power_reading, commands, alerts, rules, device_configs, audit_logs) |
| `V2__add_device_streaks_and_version.sql` | `ADD COLUMN IF NOT EXISTS` cho các cột streak/version — idempotent cho dev DB đã chạy V1 cũ |

`ddl-auto: validate` — Hibernate không tự sửa schema; Flyway là nguồn chân lý.
`baseline-on-migrate: true` — An toàn khi áp lên DB đã có data.

> V1 hiện đã chứa các cột streak/version; V2 dùng `IF NOT EXISTS` nên DB mới sẽ log warning
> "column already exists" — **vô hại**. Không sửa migration đã chạy (Flyway checksum).

> **Reset sạch:** `docker compose down -v && docker compose up --build -d`

## MQTT contract đang dùng

| Topic | Hướng | Payload mẫu |
| --- | --- | --- |
| `office/office-env-01/telemetry` | device → backend | `{"deviceId":"office-env-01","temperature":28.5,"humidity":72,"lux":320.5,"presence":true,"quality":"VALID","airRaw":1450}` |
| `office/office-ctrl-01/telemetry` | device → backend | `{"deviceId":"office-ctrl-01","busVoltageV":12.1,"light1PowerW":4.8,"light1CurrentMa":397,"quality":"VALID"}` |
| `office/{deviceId}/status` | device → backend, retained | `{"online":true,"light1":"OFF","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED","mode":"AUTO","fwVersion":"1.0.0"}` |
| `office/{deviceId}/command` | backend → device | `{"commandId":"CMD-0001","target":"light1","action":"OFF","issuedBy":"user-1"}` |
| `office/{deviceId}/ack` | device → backend | `{"commandId":"CMD-0001","target":"light1","status":"SUCCESS","state":"OFF","latencyMs":180}` |
| `office/{deviceId}/config` | backend → device, retained | `{"configId":"CFG-0001","telemetryIntervalSec":5,"servoOpenDeg":90,"servoCloseDeg":0,"issuedBy":"user-1"}` |

- QoS 1 cho telemetry/command/ack/config. Status và config retained.
- Heartbeat 30s, quá 90s → `OFFLINE` + alert. LWT `{"online":false}` tạo alert ngay.
- Command timeout 5s (door1 10s), retry tối đa 2 lần → `TIMEOUT`.

## REST API (M3 đã làm)

| Method | Endpoint | Auth | Ghi chú |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Public | Trả `{token, role, userId, expiresIn}` |
| GET | `/api/stream` | JWT (Bearer/`?token=`) | SSE realtime |
| GET | `/api/devices` | VIEWER+ | phân trang `page,size,sort` |
| POST | `/api/devices` | ADMIN | đăng ký thiết bị, trả 201 `REGISTERED`; trùng ID → 409 `DEVICE_EXISTS` |
| GET | `/api/devices/{id}` | VIEWER+ | chi tiết thiết bị |
| GET | `/api/devices/{id}/status` | VIEWER+ | trạng thái + actuator + telemetry mới nhất |
| GET | `/api/devices/{id}/telemetry` | VIEWER+ | `from,to` bắt buộc; tối đa 7 ngày; `size=20` mặc định |
| GET | `/api/devices/{id}/energy` | VIEWER+ | `raw\|minute\|hour\|day`, tối đa 1000 bucket |
| GET | `/api/devices/{id}/commands` | VIEWER+ | lịch sử lệnh + ACK |
| POST | `/api/devices/{id}/commands` | OPERATOR+ | 202, `Idempotency-Key`, `?wait=true` |
| POST | `/api/devices/{id}/mode` | OPERATOR+ | `{"mode":"MANUAL"}` |
| PUT | `/api/devices/{id}/config` | OPERATOR+ | publish config retained |
| POST | `/api/devices/{id}/activate\|lock\|decommission` | ADMIN | lifecycle |
| GET | `/api/alerts` | VIEWER+ | lọc `status,type,deviceId,from,to` |
| PATCH | `/api/alerts/{id}/acknowledge` | OPERATOR+ | |
| GET | `/api/rules` | VIEWER+ | 5 rule mặc định |
| PUT | `/api/rules/{id}` | ADMIN | sửa ngưỡng |
| GET | `/api/audit-logs` | ADMIN | nhật ký lệnh/config |

Lỗi chuẩn: `{"error":{"code","message","details","timestamp"}}`.
Mã lỗi: 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`,
409 `DEVICE_OFFLINE|DEVICE_NOT_ACTIVE|DEVICE_EXISTS|COMMAND_DUPLICATE|...`, 503 `MQTT_UNAVAILABLE`, 504 `COMMAND_TIMEOUT`.

## Biến môi trường

Copy `.env.example` → `.env` (không commit). Các biến chính:

| Biến | Mặc định / Ghi chú |
| --- | --- |
| `JWT_SECRET` | **Bắt buộc** — ≥ 32 ký tự; app crash nếu thiếu |
| `DB_URL` | `jdbc:postgresql://localhost:5433/smartoffice` |
| `DB_USER` / `DB_PASSWORD` | `smartoffice` / `smartoffice` |
| `MQTT_BROKER_URL` | `tcp://localhost:1883` |
| `MQTT_CLIENT_ID` | `smartoffice-backend` |
| `MQTT_ENABLED` | `true` (test = false) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` |
| `MOSQUITTO_PORT` | `1883` — đổi sang `1884` nếu conflict Windows service |
| `SEED_DEV_USERS` | `false` prod; `true` dev — seed admin/operator1/viewer1 |
| `ADMIN_PASSWORD` / `OPERATOR_PASSWORD` / `VIEWER_PASSWORD` | Mật khẩu dev users |

Khi chạy backend trong Docker, `DB_URL=jdbc:postgresql://postgres:5432/smartoffice`
và `MQTT_BROKER_URL=tcp://mosquitto:1883` (đã set sẵn trong `docker-compose.yml`).

## Git workflow

Branch: `feature/backend-complete`. Không push thẳng `main`.

```powershell
git checkout feature/backend-complete
# code + test
git commit -m "feat/fix/docs/test: ..."
git push origin feature/backend-complete
```
