# SmartOffice — Phòng làm việc thông minh IoT

Hệ thống giám sát môi trường và điều khiển thiết bị phòng làm việc:
ESP32 gửi dữ liệu qua MQTT, backend Spring Boot lưu PostgreSQL và đẩy realtime lên web React.

Contract chung: [`docs/Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](docs/Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md) v1.3.

## Cấu trúc repo

```text
SmartOffice/
├── README.md
├── firmware/       # M1/M2 — ESP32
├── backend/        # M3 — Spring Boot API, MQTT, rule engine
├── frontend/       # M4 — React + Vite + Ant Design
├── database/       # Flyway migrations + ERD
├── deployment/     # Docker Compose, Mosquitto ACL/config
├── hardware/       # linh kiện, chân GPIO, an toàn, ảnh prototype
├── tests/          # simulator Node B, mock publisher, test ACL
├── docs/           # contract, setup, API, báo cáo, test
└── .env.example
```

| Thư mục | Nội dung |
| --- | --- |
| `firmware/` | Firmware ESP32 Node B (Node A bổ sung sau) |
| `backend/` | REST API, MQTT ingest, auth, rule/automation, SSE |
| `frontend/` | Dashboard, điều khiển, alert, history, energy, admin |
| `database/` | `V1`, `V2`, ERD |
| `deployment/` | Full stack Docker: Mosquitto ACL + PostgreSQL + backend + frontend |
| `hardware/` | Danh sách linh kiện, GPIO, an toàn điện |
| `tests/` | Simulator Node B, mock publisher Node A+B, test ACL |
| `docs/` | Contract v1.3, setup, API, test checklist, báo cáo |

## Kiến trúc

```text
Node A (cảm biến) ─┐
                   ├─ MQTT ─► Mosquitto ─► Backend M3 ─► PostgreSQL
Node B (điều khiển)┘             │              │
                                 │              └─ REST + SSE ─► Frontend M4
                                 └─ command/config/ACK
```

## Chạy full stack

Yêu cầu: Docker Desktop + Git.

```powershell
git clone https://github.com/Nomishi/SmartOffice.git
cd SmartOffice

cd deployment
Copy-Item ../.env.example .env      # đổi mật khẩu; KHÔNG commit .env
docker compose --profile ui up -d --build
docker compose ps
```

Mở `http://localhost:3000`.

| Dịch vụ | URL / port |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:8080` |
| Swagger | `http://localhost:8080/swagger-ui/index.html` |
| MQTT | `192.168.10.205:1883` (IP LAN) |
| PostgreSQL | `5432` |

Tài khoản dev (khi `SEED_DEV_USERS=true`):

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `adminPassword123!` | ADMIN |
| `operator1` | `operatorPassword123!` | OPERATOR |
| `viewer1` | `viewerPassword123!` | VIEWER |

> Windows: `localhost:1883` có thể trúng Mosquitto service riêng. Thiết bị/client trên PC dùng
> IP LAN (ví dụ `192.168.10.205:1883`) hoặc tắt service Mosquitto.

## Chạy từng phần

### Backend

```powershell
cd backend
$env:JWT_SECRET = "smartoffice-local-secret-at-least-32-chars-long-123"
$env:SEED_DEV_USERS = "true"
mvn spring-boot:run -Dspring-boot.run.profiles=mock
```

### Frontend dev

```powershell
cd frontend
Copy-Item .env.example .env
# VITE_USE_MOCK=false
# VITE_API_PROXY=http://localhost:8080
npm ci
npm run dev        # 5173
```

Mock không cần backend: `VITE_USE_MOCK=true`.

### Simulator / mock

```powershell
# Node B
python tests/simulator/node_b_simulator.py

# Node A+B, scenario
cd tests/mqtt
python mock_publisher.py --scenario normal
```

Hoặc `docker compose --profile mock up -d mock-publisher` trong `deployment/`.

## AI API (tùy chọn)

AI ngoài MVP, bật bằng env backend:

```env
AI_ENABLED=true
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=...
AI_MODEL=gpt-4o-mini
```

Gọi:

```http
POST /api/ai/chat
Authorization: Bearer <JWT>

{"message":"Nhiệt độ hôm nay có bất thường không?","deviceId":"office-env-01"}
```

Frontend chỉ gọi backend, không cầm API key. Chi tiết: [`docs/ai-api.md`](docs/ai-api.md).

## Trạng thái

| Hạng mục | Trạng thái |
| --- | --- |
| Backend M3 | ✅ 31 test, auth/SSE/Flyway/Docker |
| Frontend M4 | ✅ 49 test, build + Docker, có UI Trợ lý AI |
| Infra ACL/credential | ✅ |
| Simulator M2 | ✅ command/ACK qua ACL |
| AI API (tùy chọn) | ✅ `/api/ai/chat`, bật bằng env |
| Full stack Docker | ✅ healthy |
| ESP32 thật | ⏳ chưa test phần cứng |
| Test web → relay thật | ⏳ |

## Tài liệu

| File | Nội dung |
| --- | --- |
| [`docs/SETUP.md`](docs/SETUP.md) | Setup từ đầu |
| [`docs/Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](docs/Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md) | Contract v1.3 |
| [`docs/m3-backend.md`](docs/m3-backend.md) | Backend M3 chi tiết |
| [`docs/frontend-setup.md`](docs/frontend-setup.md) | Setup frontend |
| [`docs/frontend-integration.md`](docs/frontend-integration.md) | API/SSE cho M4 |
| [`docs/m1-m2-test-guide.md`](docs/m1-m2-test-guide.md) | Test firmware M1/M2 |
| [`docs/ai-api.md`](docs/ai-api.md) | AI API (OpenAI-compatible) |
| [`docs/m3-api.http`](docs/m3-api.http) | Ví dụ gọi API |
| [`docs/test-checklist.md`](docs/test-checklist.md) | Biên bản test |
| [`database/README.md`](database/README.md) | Migration/ERD |
| [`deployment/README.md`](deployment/README.md) | Docker/ACL |
| [`hardware/README.md`](hardware/README.md) | Phần cứng/GPIO |

## Quy ước

- JSON camelCase; timestamp ISO-8601 UTC.
- `deviceId` payload phải trùng topic.
- QoS 1; status/config retained; heartbeat 30s; offline 90s.
- Command timeout 5s (door1 10s), retry 2.
- Chỉ telemetry `quality=VALID` dùng cho automation.

## Git

- `main` ổn định; không push thẳng.
- Nhánh feature: `feature/backend-complete`, `feature/frontend-integration`, `M2`.
- Merge qua PR; không commit `.env`, secret, `target`, `node_modules`.
