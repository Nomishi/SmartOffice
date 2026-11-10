# Smart Office IoT — Phòng làm việc thông minh

Hệ thống IoT giám sát môi trường và điều khiển thiết bị cho một phòng làm việc:
ESP32 đọc cảm biến, gửi dữ liệu qua MQTT; backend lưu trữ, sinh cảnh báo, tự động hóa;
frontend React hiển thị dashboard realtime và điều khiển thiết bị.

Contract chung: [`Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md) **(v1.3)**.

## Kiến trúc

```text
┌─────────────────────┐        MQTT        ┌──────────────────┐
│ M1 — Node A         │ ─────────────────► │                  │
│ AHT20, BH1750,      │                    │    Mosquitto     │
│ LD2410C, MQ-135     │ ◄───────────────── │  (ACL per user)  │
└─────────────────────┘                    │                  │
┌─────────────────────┐        MQTT        │                  │
│ M2 — Node B         │ ─────────────────► │                  │
│ relay, servo,       │ ◄───────────────── └────────┬─────────┘
│ buzzer, INA219 ×2   │                             │ MQTT
└─────────────────────┘                             ▼
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
                                         │ React + Ant Design  │
                                         └─────────────────────┘
```

## Thành phần & trạng thái

| Module | Nội dung | Trạng thái |
| --- | --- | --- |
| **M1 — Node A** | ESP32, AHT20, BH1750, LD2410C, MQ-135; telemetry/status | ⏳ firmware chưa test phần cứng thật |
| **M2 — Node B** | ESP32, relay, buzzer, servo + công tắc từ, INA219 ×2; command/ACK | ⏳ firmware + simulator đã có, chưa test phần cứng thật |
| **M3 — Backend** | Spring Boot, MQTT, PostgreSQL, REST/SSE, auth, rule/automation | ✅ 29 test backend, Docker healthy |
| **M4 — Frontend** | React + Vite + Ant Design; dashboard, control, alert, history, energy, rule, admin | ✅ 46 test, build + Docker OK |
| **Infra** | Docker Compose, Mosquitto ACL/credential, mock publisher | ✅ full stack chạy được |

## Cấu trúc repo

```text
SmartOffice/
├── backend/          # M3 — Spring Boot
├── iot-frontend/     # M4 — React + Vite + Ant Design
├── iot-infra/        # Docker full stack + Mosquitto ACL + mock publisher
├── iot-node-b/       # M2 — firmware Node B + simulated_node.py
├── docs/             # contract notes, API, setup, test guide
├── infra/            # Mosquitto config cho stack backend-only
├── docker-compose.yml# Stack backend-only (M3 dev)
└── Contract_chung_...md
```

## Chạy full stack (khuyến nghị)

Dùng `iot-infra` — có Mosquitto ACL/credential, PostgreSQL, backend, frontend:

```powershell
cd iot-infra
Copy-Item .env.example .env     # đổi mật khẩu nếu cần; KHÔNG commit .env
docker compose --profile ui up -d --build
docker compose ps
```

| Dịch vụ | URL / cổng |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend REST | `http://localhost:8080` |
| Swagger | `http://localhost:8080/swagger-ui/index.html` |
| MQTT (auth bắt buộc) | `localhost:1883` |
| PostgreSQL | `localhost:5432` |

Tài khoản dev (khi `SEED_DEV_USERS=true` trong `iot-infra/.env`):

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `adminPassword123!` | ADMIN |
| `operator1` | `operatorPassword123!` | OPERATOR |
| `viewer1` | `viewerPassword123!` | VIEWER |

> Trên Windows, nếu có Mosquitto service riêng giữ `localhost:1883`, client trên PC có thể nối nhầm
> service đó. Dùng IP LAN của PC (ví dụ `192.168.10.205:1883`) để vào broker Docker, hoặc tắt
> service Mosquitto. ESP32 cũng dùng IP LAN.

## Chạy backend-only (M3 dev)

Nếu chỉ cần backend + broker anonymous:

```powershell
Copy-Item .env.example .env
docker compose up -d
```

Backend `8080`, Postgres `5433`, Mosquitto host `1884` (nếu `MOSQUITTO_PORT=1884`).

## Frontend (M4)

Chạy dev, nối backend thật:

```powershell
cd iot-frontend
Copy-Item .env.example .env
# .env: VITE_USE_MOCK=false
#       VITE_API_PROXY=http://localhost:8080
npm ci
npm run dev        # http://localhost:5173
```

Chạy bằng dữ liệu giả, không cần backend:

```env
VITE_USE_MOCK=true
```

```powershell
npm run dev
```

Chi tiết: [`iot-frontend/README.md`](iot-frontend/README.md).

## Simulator Node B (M2)

File `iot-node-b/simulated_node.py` giả lập relay/buzzer/door, trả ACK và telemetry công suất.

Với full stack `iot-infra` (có auth/ACL):

```powershell
$env:MQTT_HOST = "192.168.10.205"   # IP LAN của PC, không dùng localhost nếu Windows có Mosquitto service
$env:MQTT_PORT = "1883"
$env:MQTT_USERNAME = "office-ctrl-01"
$env:MQTT_PASSWORD = "<mật khẩu office-ctrl-01 trong iot-infra/.env>"
$env:PYTHONIOENCODING = "utf-8"
python iot-node-b/simulated_node.py
```

Với backend-only anonymous:

```powershell
$env:MQTT_HOST = "localhost"
$env:MQTT_PORT = "1884"
python iot-node-b/simulated_node.py
```

Simulator publish status retained, telemetry 5s, heartbeat 30s; nhận `command` và trả ACK
`{commandId,target,status,state,latencyMs}`.

## Test đã chạy

| Nhóm | Kết quả |
| --- | --- |
| Backend `mvn verify` | ✅ 29 test |
| Frontend `npm test` | ✅ 46 test |
| Frontend `npm run build` | ✅ |
| Frontend Docker image | ✅ build + chạy nginx |
| Frontend → nginx `/api` → backend | ✅ login, devices, SSE |
| `iot-infra` full stack | ✅ backend/frontend/postgres/mosquitto healthy |
| Simulator M2 qua ACL | ✅ command light1/door1 → ACK SUCCESS, actuator đổi |
| ESP32 thật | ⏳ chưa có phần cứng |

## Tài liệu

| File | Nội dung |
| --- | --- |
| [`Contract_chung_...md`](Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md) | Contract v1.3 |
| [`docs/m3-backend.md`](docs/m3-backend.md) | Backend M3 chi tiết |
| [`docs/frontend-setup.md`](docs/frontend-setup.md) | Setup frontend (bản mới) |
| [`docs/frontend-integration.md`](docs/frontend-integration.md) | API/SSE cho M4 |
| [`docs/m1-m2-test-guide.md`](docs/m1-m2-test-guide.md) | Test M1/M2 với broker/backend |
| [`docs/m3-api.http`](docs/m3-api.http) | Ví dụ gọi API |
| [`docs/test-checklist.md`](docs/test-checklist.md) | Biên bản test backend |
| [`iot-frontend/README.md`](iot-frontend/README.md) | Frontend chi tiết |
| [`iot-infra/README.md`](iot-infra/README.md) | Hạ tầng/ACL/credential |

## Quy ước contract

- JSON camelCase; timestamp ISO-8601 UTC.
- `deviceId` trong payload phải trùng topic.
- Topic: `office/{deviceId}/{telemetry|status|command|ack|config}`.
- QoS 1; status/config retained; heartbeat 30s; offline 90s.
- Command timeout 5s (door1 10s), retry 2.
- Chỉ telemetry `quality=VALID` dùng cho automation.

## Git workflow

- `main` ổn định; không push thẳng.
- Nhánh backend: `feature/backend-complete`.
- Nhánh frontend: `feature/frontend-integration`.
- Nhánh firmware: `M2`.
- Merge qua PR; không commit `.env`, token, secret.

## Việc tiếp theo

1. Test ESP32 Node A/B thật với `iot-infra` (ACL/credential).
2. Test end-to-end web → backend → relay thật → ACK → UI.
3. Test mất nguồn/WiFi: LWT + 90s offline + recovery.
4. Backend P1: config history, search/filter, audit đầy đủ, retention, rate limit, Testcontainers.
5. Giảm bundle frontend (~1.7 MB) bằng code-splitting nếu cần.
