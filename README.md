# Smart Office IoT — Phòng làm việc thông minh

Hệ thống IoT giám sát môi trường và điều khiển thiết bị cho một phòng làm việc:
ESP32 đọc cảm biến, gửi dữ liệu qua MQTT; backend lưu trữ, sinh cảnh báo, tự động hóa;
frontend hiển thị dashboard realtime và điều khiển thiết bị.

Contract chung của nhóm: [`Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md) **(v1.3)**.
Đây là nguồn chân lý cho topic, payload, endpoint, enum và mã lỗi.

## Kiến trúc

```text
┌─────────────────────┐        MQTT        ┌──────────────────┐
│ M1 — Node A         │ ─────────────────► │                  │
│ AHT20, BH1750,      │                    │    Mosquitto     │
│ LD2410C, MQ-135     │ ◄───────────────── │      Broker      │
└─────────────────────┘                    │                  │
┌─────────────────────┐        MQTT        │                  │
│ M2 — Node B         │ ─────────────────► │                  │
│ relay, servo,       │ ◄───────────────── │                  │
│ buzzer, INA219 ×2   │                    └────────┬─────────┘
└─────────────────────┘                             │ MQTT
                                                    ▼
                                         ┌─────────────────────┐
                                         │ M3 — Spring Boot    │
                                         │ MQTT / DB / REST    │
                                         │ rule + automation   │
                                         └──────────┬──────────┘
                                                    │ JDBC
                                                    ▼
                                         ┌─────────────────────┐
                                         │    PostgreSQL       │
                                         └──────────┬──────────┘
                                                    │ REST + SSE
                                                    ▼
                                         ┌─────────────────────┐
                                         │ M4 — Frontend       │
                                         │ dashboard/control   │
                                         └─────────────────────┘
```

## Thành phần & phân công

| Module | Sở hữu | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| **M1** | Firmware Node A | ESP32, AHT20 (nhiệt/ẩm), BH1750 (lux), LD2410C (hiện diện), MQ-135 (airRaw), publish telemetry/status | ⏳ chưa có code trong repo / chưa test phần cứng |
| **M2** | Firmware Node B | ESP32, relay light1/fan1, buzzer, servo + công tắc từ door1, INA219 ×2, nhận command/config, ACK | ⏳ chưa có code trong repo / chưa test phần cứng |
| **M3** | Backend | Spring Boot, MQTT, PostgreSQL, REST, SSE, auth, rule engine, automation, energy | ✅ P0 xong, 29 test pass |
| **M4** | Frontend | Login, dashboard realtime, điều khiển, alert, history, energy, rule, quản trị | 🚧 sẵn sàng bắt đầu, chưa có code |

Chi tiết M3: [`docs/m3-backend.md`](docs/m3-backend.md).

## Phần cứng

| Node | Linh kiện |
| --- | --- |
| Node A | ESP32, AHT20 (I2C 0x38), BH1750 (chung bus), LD2410C, MQ-135 |
| Node B | ESP32, relay 5V 2 kênh, servo SG90 + công tắc từ FR3S, buzzer 5V, INA219 ×2 (0x40/0x41) |
| Nguồn | 12V cho tải, 5V riêng cho logic, chung GND; cầu chì, diode chống xung quạt, tụ 1000µF cho servo |

Chỉ dùng tải DC 12V. Không đấu trực tiếp 220V.

## Cấu trúc repo

```text
SmartOffice/
├── backend/                 # M3 — Spring Boot
├── docs/                    # contract notes, API, setup, test
├── infra/mosquitto/         # cấu hình broker dev
├── docker-compose.yml       # PostgreSQL + Mosquitto + Backend
├── .env.example             # copy → .env, không commit .env
├── Contract_chung_...md     # contract v1.3
├── ERD_...png               # sơ đồ dữ liệu
└── Kien_truc_IoT_tong_the.png
```

`frontend/` (M4) và firmware M1/M2 sẽ được bổ sung vào repo hoặc repo riêng theo phân công.

## Chạy nhanh toàn hệ thống

Yêu cầu: Docker Desktop. Frontend cần thêm Node.js 20+ (xem [`docs/frontend-setup.md`](docs/frontend-setup.md)).
Chỉ cần Java 17 + Maven nếu chạy backend ngoài Docker.

```powershell
Copy-Item .env.example .env      # KHÔNG commit .env

docker compose up --build -d
docker compose ps                # chờ postgres/backend healthy
```

| Dịch vụ | Địa chỉ host |
| --- | --- |
| Backend REST/SSE | `http://localhost:8080` |
| Swagger UI | `http://localhost:8080/swagger-ui/index.html` |
| PostgreSQL | `localhost:5433` (container 5432) |
| Mosquitto MQTT | `localhost:1883` (hoặc `1884` nếu set `MOSQUITTO_PORT`) |
| MQTT WebSocket | `localhost:9001` |
| Frontend dev | `http://localhost:5173` (khi M4 chạy) |

> **Windows:** nếu service Mosquitto có sẵn giữ cổng 1883, set `MOSQUITTO_PORT=1884` trong `.env`.
> Backend trong Docker vẫn dùng `mosquitto:1883` nội bộ.

Kiểm tra nhanh:

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health

$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/auth/login `
  -ContentType "application/json" `
  -Body '{"username":"operator1","password":"operatorPassword123!"}'
$token = $login.token

Invoke-RestMethod http://localhost:8080/api/devices `
  -Headers @{ Authorization = "Bearer $token" }
```

Dev users (chỉ seed khi `SEED_DEV_USERS=true` hoặc profile `dev`):

| Username | Role | Password |
| --- | --- | --- |
| `admin` | ADMIN | `adminPassword123!` |
| `operator1` | OPERATOR | `operatorPassword123!` |
| `viewer1` | VIEWER | `viewerPassword123!` |

## Không có phần cứng thì làm gì?

Backend có profile `mock` giả lập cả Node A + Node B (telemetry 5s, status 30s, ACK ~180ms):

```powershell
cd backend
$env:JWT_SECRET = "smartoffice-local-secret-at-least-32-chars-long-123"
$env:SEED_DEV_USERS = "true"
mvn spring-boot:run -Dspring-boot.run.profiles=mock
```

Frontend M4 vẫn làm bình thường với mock này; xem [`docs/frontend-setup.md`](docs/frontend-setup.md).

## Tài liệu

| File | Nội dung |
| --- | --- |
| [`Contract_chung_...md`](Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md) | Contract v1.3: topic, payload, API, enum, lỗi |
| [`docs/m3-backend.md`](docs/m3-backend.md) | Chi tiết backend M3: chạy, auth, SSE, Flyway, API, test |
| [`docs/frontend-setup.md`](docs/frontend-setup.md) | Setup frontend M4: Node/Vite, env, login, SSE |
| [`docs/m1-m2-test-guide.md`](docs/m1-m2-test-guide.md) | Test firmware M1/M2 với broker + backend |
| [`docs/frontend-integration.md`](docs/frontend-integration.md) | Hợp đồng API/SSE chi tiết cho M4 |
| [`docs/m3-api.http`](docs/m3-api.http) | Ví dụ gọi API bằng REST Client |
| [`docs/m3-contract-notes.md`](docs/m3-contract-notes.md) | Ghi chú triển khai/lệch contract của M3 |
| [`docs/test-checklist.md`](docs/test-checklist.md) | Biên bản test backend + checklist phần cứng |
| [`docs/PROMPT-backend-complete.md`](docs/PROMPT-backend-complete.md) | Kế hoạch P1/P2 backend |

## Trạng thái tổng

| Hạng mục | Trạng thái |
| --- | --- |
| Contract v1.3 | ✅ |
| Backend M3 P0 | ✅ 29 test, Docker healthy, Flyway verified |
| Frontend M4 | 🚧 sẵn sàng bắt đầu |
| Firmware M1/M2 | ⏳ chưa có trong repo |
| Test ESP32 thật → backend | ⏳ |
| Test web → relay thật → ACK | ⏳ |
| Test mất nguồn/WiFi → offline alert | ⏳ |
| Mosquitto ACL/credential | ⏳ (M4 phối hợp) |

## Quy ước contract

- JSON camelCase; timestamp ISO-8601 UTC.
- `deviceId` trong payload phải trùng topic.
- Topic: `office/{deviceId}/{telemetry|status|command|ack|config}`.
- QoS 1; status/config retained; heartbeat 30s; offline 90s.
- Command timeout 5s (door1 10s), retry 2.
- Chỉ telemetry `quality=VALID` dùng cho automation/ngưỡng.
- Mọi thay đổi payload/endpoint phải sửa contract trước.

## Git workflow

- `main` là nhánh ổn định; không push thẳng.
- Mỗi mảng làm nhánh riêng: `feature/backend-*`, `feature/frontend-*`, `feature/firmware-*`.
- Backend hiện tại: `feature/backend-complete`.
- Merge qua Pull Request, có review.
- Mỗi người dùng tài khoản GitHub riêng; không commit secret/`.env`/`target`.

## Việc tiếp theo

1. M1/M2 flash firmware thật, test telemetry + command + ACK + door.
2. M4 làm frontend theo [`docs/frontend-setup.md`](docs/frontend-setup.md).
3. Test end-to-end: web → backend → relay thật → ACK → UI.
4. Test mất kết nối: LWT + quá 90s → `DEVICE_OFFLINE`; cắm lại → `ACTIVE`.
5. Mosquitto ACL/credential cho từng device.
6. Backend P1: config history, search/filter, audit đầy đủ, retention, rate limit, Testcontainers.
