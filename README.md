# SmartOffice — Phòng làm việc thông minh IoT

Hệ thống giám sát môi trường và điều khiển thiết bị phòng làm việc:
hai ESP32 gửi dữ liệu qua MQTT, backend Spring Boot lưu PostgreSQL và đẩy realtime lên web React.

Contract chung (topic, payload, API, chân GPIO): [`docs/Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](docs/Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md) **v1.5**.

## Cấu trúc repo

```text
SmartOffice/
├── README.md
├── firmware/       # M1/M2 — firmware ESP32 Node A và Node B (Arduino)
├── backend/        # M3 — Spring Boot API, MQTT, rule engine
├── frontend/       # M4 — React + Vite + Ant Design
├── database/       # Flyway migrations + ERD
├── deployment/     # Docker Compose, Mosquitto ACL/config
├── hardware/       # linh kiện, chân GPIO, sơ đồ nối dây, ảnh mạch thật
├── tests/          # kịch bản + kiểm thử hệ thống trên thiết bị thật, mock publisher, test ACL
├── docs/           # contract, setup, API, báo cáo
└── .env.example
```

| Thư mục | Nội dung |
| --- | --- |
| `firmware/` | `node-a/` (cảm biến môi trường), `node-b/` (điều khiển + đo công suất); hướng dẫn nạp trong `firmware/README.md` |
| `backend/` | REST API, MQTT ingest, auth/RBAC, rule/automation, SSE, AI tùy chọn |
| `frontend/` | Dashboard, điều khiển, cảnh báo, lịch sử, năng lượng, quản trị |
| `database/` | Migration `V1`, `V2`, ERD |
| `deployment/` | Full stack Docker: Mosquitto ACL + PostgreSQL + backend + frontend |
| `hardware/` | BOM, bảng chân GPIO, nguồn điện, sơ đồ khối / nối dây / triển khai, ảnh prototype |
| `tests/` | Kịch bản kiểm thử (CN-xx, PCN-xx), script kiểm thử hệ thống và kết quả đo, mock Node A+B, test ACL |
| `docs/` | Contract v1.5, setup, API, test checklist, báo cáo |

## Kiến trúc

```text
Node A (cảm biến) ─┐
                   ├─ MQTT ─► Mosquitto ─► Backend M3 ─► PostgreSQL
Node B (điều khiển)┘             │              │
                                 │              └─ REST + SSE ─► Frontend M4
                                 └─ command/config/ACK
```

| Node | deviceId | Phần cứng |
| --- | --- | --- |
| A | `office-env-01` | ESP32 + AHT20 (nhiệt-ẩm), BH1750 (ánh sáng), LD2410C (radar hiện diện), MQ-135 (không khí) |
| B | `office-ctrl-01` | ESP32 + relay 1 kênh → quạt mini, LED 5 mm (đèn), servo SG90 + công tắc từ (cửa), còi, INA219 ×2 (công suất quạt/đèn); tải chạy hộp 3 pin AA |

Chân GPIO, địa chỉ I2C và sơ đồ nối dây: [`hardware/README.md`](hardware/README.md).

## Chạy full stack

> Hướng dẫn đầy đủ từ đầu: [`docs/CHAY_DU_AN.md`](docs/CHAY_DU_AN.md).

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
| MQTT | `<IP Wi-Fi của máy chạy Docker>:1883` |
| PostgreSQL | `5432` |

Tài khoản dev (khi `SEED_DEV_USERS=true`): `admin`, `operator1`, `viewer1`; mật khẩu lấy từ
`ADMIN_PASSWORD`, `OPERATOR_PASSWORD`, `VIEWER_PASSWORD` trong `deployment/.env`.

> Windows: `localhost:1883` có thể trúng Mosquitto service riêng. Thiết bị/client dùng
> IP LAN của máy chạy Docker hoặc tắt service Mosquitto.

## Nạp firmware ESP32

Yêu cầu: Arduino IDE 2 (hoặc `arduino-cli`), core **esp32 3.x**, thư viện **MQTT** (Joel Gaehwiler / 256dpi) và **ArduinoJson 7**.

1. Sao chép `firmware/node-a/secrets.example.h` thành `secrets.h` (tương tự cho `node-b`), điền:
   - `WIFI_SSID`, `WIFI_PASSWORD`: mạng **2.4 GHz** (có thể dùng hotspot điện thoại);
   - `MQTT_HOST`: IP của máy chạy Docker **trên chính mạng đó** (xem bằng `ipconfig`);
   - `MQTT_PASSWORD`: mật khẩu của thiết bị trong `MQTT_USERS` của `deployment/.env`.
2. Mở `firmware/node-a/node-a.ino` (hoặc `node-b/node-b.ino`), chọn board **ESP32 Dev Module**, nạp.
3. Mở Serial Monitor 115200: thấy `MQTT da ket noi`, LED xanh (GPIO 2) sáng đứng là đã nối broker.

`secrets.h` đã nằm trong `.gitignore`, không commit. Chi tiết bản tin, cấu hình và giới hạn: [`firmware/README.md`](firmware/README.md).

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

### Mock Node A+B (không cần phần cứng)

```powershell
cd tests/mqtt
python mock_publisher.py --scenario normal
```

Hoặc `docker compose --profile mock up -d mock-publisher` trong `deployment/`.

## Kiểm thử

Kịch bản và kết quả: [`tests/KICH_BAN_KIEM_THU.md`](tests/KICH_BAN_KIEM_THU.md). Kiểm thử hệ thống chạy trên ESP32 thật + full stack Docker:

```powershell
cd tests/system
python -m pip install -r requirements.txt
python test_functional.py --serial-port COM7    # cổng USB của Node B (ca offline/phục hồi)
python test_nonfunctional.py --minutes 5
```

Kết quả mới nhất (11/11/2026, file trong `tests/system/results/`):

- Chức năng: **16/17 đạt**. Không đạt: đóng cửa (CN-06) do nam châm chưa áp sát công tắc từ.
- Phi chức năng: **5/6 đạt**. Độ trễ telemetry p95 6 ms, lệnh → ACK p95 185 ms, mất bản tin 0 %, 469 req/s không lỗi.
  Không đạt: backend mất 112 s mới nhận lại dữ liệu sau khi broker khởi động lại (PCN-04).
- Chưa kiểm thử: sai lệch INA219 so với đồng hồ vạn năng, chạy liên tục 24 giờ, mô phỏng ≥ 10 node.

Test tự động: `cd backend && mvn verify`, `cd frontend && npm test`, `python tests/mqtt/test_acl.py`.

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
| Backend M3 | ✅ auth/SSE/Flyway/Docker, test tự động |
| Frontend M4 | ✅ build + Docker, có UI Trợ lý AI |
| Infra ACL/credential | ✅ đã kiểm thử ghi chéo topic, sai mật khẩu |
| Firmware Node A | ✅ chạy trên ESP32 thật, 4 cảm biến, telemetry/status/config |
| Firmware Node B | ✅ chạy trên ESP32 thật: quạt, đèn, còi, cửa, INA219, command/ACK |
| Web → thiết bị thật | ✅ end-to-end qua hotspot điện thoại |
| AI API (tùy chọn) | ✅ `/api/ai/chat`, bật bằng env |
| Đóng cửa (servo + công tắc từ) | ⚠️ ACK `FAILED`: cần đặt lại nam châm |
| Backend phục hồi sau khi broker khởi động lại | ⚠️ 112 s (mục tiêu < 30 s) |
| Sai số INA219, chạy 24 giờ | ⏳ chưa đo |

## Tài liệu

| File | Nội dung |
| --- | --- |
| [`docs/CHAY_DU_AN.md`](docs/CHAY_DU_AN.md) | Hướng dẫn chạy toàn bộ dự án |
| [`docs/SETUP.md`](docs/SETUP.md) | Setup từ đầu |
| [`docs/Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](docs/Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md) | Contract v1.5 |
| [`firmware/README.md`](firmware/README.md) | Nạp firmware, bản tin, giới hạn |
| [`hardware/README.md`](hardware/README.md) | Linh kiện, GPIO, nguồn, sơ đồ, ảnh mạch |
| [`tests/KICH_BAN_KIEM_THU.md`](tests/KICH_BAN_KIEM_THU.md) | Kịch bản và kết quả kiểm thử |
| [`docs/m3-backend.md`](docs/m3-backend.md) | Backend M3 chi tiết |
| [`docs/frontend-setup.md`](docs/frontend-setup.md) | Setup frontend |
| [`docs/frontend-integration.md`](docs/frontend-integration.md) | API/SSE cho M4 |
| [`docs/m1-m2-test-guide.md`](docs/m1-m2-test-guide.md) | Test firmware M1/M2 với hệ thống |
| [`docs/ai-api.md`](docs/ai-api.md) | AI API (OpenAI-compatible) |
| [`docs/m3-api.http`](docs/m3-api.http) | Ví dụ gọi API |
| [`docs/test-checklist.md`](docs/test-checklist.md) | Biên bản test |
| [`database/README.md`](database/README.md) | Migration/ERD |
| [`deployment/README.md`](deployment/README.md) | Docker/ACL |

## Quy ước

- JSON camelCase; timestamp ISO-8601 UTC.
- `deviceId` payload phải trùng topic.
- QoS 1; status/config retained; heartbeat 30s; offline 90s.
- Command timeout 5s (door1 10s), retry 2.
- Chỉ telemetry `quality=VALID` dùng cho automation.

## Git

- `main` ổn định; không push thẳng, merge qua Pull Request có review.
- Mỗi phần một nhánh từ `main`: `feature/...` cho code, `docs/...` cho tài liệu.
- Không commit `.env`, `secrets.h`, `target/`, `node_modules/`.
