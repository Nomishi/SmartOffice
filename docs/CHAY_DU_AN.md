# Chạy toàn bộ dự án SmartOffice

Tài liệu này là bản hướng dẫn độc lập để chạy **toàn bộ hệ thống** từ đầu: PostgreSQL, Mosquitto, backend Spring Boot, frontend React, simulator và AI.

---

## 1. Cần cài gì?

### Cách nhanh nhất: Docker

Chỉ cần:

- Git
- Docker Desktop đang chạy
- Trình duyệt web

Không cần cài PostgreSQL, MySQL hay Mosquitto riêng. Docker Compose sẽ tạo các container này.

### Chạy ngoài Docker

Cần thêm:

- Java 17 + Maven
- Node.js 20+
- Python 3.10+ nếu chạy simulator

---

## 2. Cấu trúc nhanh

```text
SmartOffice/
├── backend/       Spring Boot API, MQTT, rule engine
├── frontend/      React + Vite + Ant Design
├── database/      Flyway migration + ERD
├── deployment/    Docker Compose, Mosquitto config
├── firmware/      ESP32 Node A / Node B
├── hardware/      Sơ đồ, linh kiện, đấu dây
├── tests/         Simulator Node B, mock publisher
└── docs/          Tài liệu, contract, báo cáo
```

---

## 3. Chuẩn bị file môi trường

Vào thư mục deployment:

```powershell
cd D:\project\SmartOffice\deployment
```

Nếu chưa có `.env`:

```powershell
Copy-Item ..\.env.example .env
```

Mở file:

```powershell
notepad .env
```

Các biến quan trọng:

```env
POSTGRES_DB=iot
POSTGRES_USER=iot
POSTGRES_PASSWORD=doi-mat-khau-db

MQTT_USERS=backend:doi-mat-khau-backend,office-env-01:doi-mat-khau-env01,office-ctrl-01:doi-mat-khau-ctrl01
BACKEND_MQTT_PASSWORD=doi-mat-khau-backend

JWT_SECRET=chuoi-ngau-nhien-dai-it-nhat-32-ky-tu

SEED_DEV_USERS=true
ADMIN_PASSWORD=adminPassword123!
OPERATOR_PASSWORD=operatorPassword123!
VIEWER_PASSWORD=viewerPassword123!

FRONTEND_USE_MOCK=false
```

Quy tắc:

- `BACKEND_MQTT_PASSWORD` phải trùng mật khẩu user `backend` trong `MQTT_USERS`.
- Mật khẩu MQTT không chứa dấu phẩy, dấu cách hoặc `$`.
- Đổi mật khẩu PostgreSQL sau khi đã tạo volume thì phải xóa volume cũ.
- Không commit file `.env`.

---

## 4. Bật AI (tùy chọn)

AI không bắt buộc để chạy hệ thống.

### Dùng OpenCode Go

```env
AI_ENABLED=true
AI_BASE_URL=https://opencode.ai/inference/go/openai/v1
AI_API_KEY=key-opencode-go
AI_MODEL=glm-5.3-flash
AI_TIMEOUT_MS=30000
```

Một số model đang dùng được:

```text
glm-5.3-flash
kimi-k3
mimo-v2.6-flash
```

Lưu ý:

- Backend tự gửi header `x-opencode-session`.
- Nếu model quá tải, đổi sang model khác.
- Key lấy trong OpenCode Console, không commit.

### Dùng OpenAI

```env
AI_ENABLED=true
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=20000
```

### Dùng Ollama local

```env
AI_ENABLED=true
AI_BASE_URL=http://host.docker.internal:11434/v1
AI_API_KEY=
AI_MODEL=llama3.1
AI_TIMEOUT_MS=60000
```

### Không dùng AI

```env
AI_ENABLED=false
AI_API_KEY=
```

---

## 5. Chạy full stack

Từ thư mục `deployment`:

```powershell
docker compose --profile ui up -d --build
```

Kiểm tra:

```powershell
docker compose ps
```

Kỳ vọng:

```text
iot-postgres    Up (healthy)   5432
iot-mosquitto   Up (healthy)   1883
iot-backend     Up (healthy)   8080
iot-frontend    Up (healthy)   3000
```

Mở:

```text
Frontend:  http://localhost:3000
Backend:   http://localhost:8080
Swagger:   http://localhost:8080/swagger-ui/index.html
```

### Chạy kèm dữ liệu giả

```powershell
docker compose --profile ui --profile mock up -d --build
```

Mock sẽ gửi telemetry Node A/B, tạo cảnh báo và dữ liệu cho dashboard.

---

## 6. Đăng nhập

Khi `SEED_DEV_USERS=true`:

| Username | Password | Role |
|---|---|---|
| `admin` | `adminPassword123!` | ADMIN |
| `operator1` | `operatorPassword123!` | OPERATOR |
| `viewer1` | `viewerPassword123!` | VIEWER |

Nếu đổi biến `ADMIN_PASSWORD`, `OPERATOR_PASSWORD`, `VIEWER_PASSWORD` trong `.env` thì dùng mật khẩu mới.

---

## 7. Kiểm tra nhanh hệ thống

### Backend

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
```

### Frontend

Mở `http://localhost:3000`, đăng nhập, xem dashboard.

### MQTT

```powershell
docker logs --tail 50 iot-mosquitto
```

### Backend log

```powershell
docker logs -f iot-backend
```

---

## 8. Test còi khi nhiệt độ cao

Backend đã có rule tự động:

```text
TEMP_HIGH
→ tạo alert
→ gửi buzzer1 ALARM
→ còi hú
```

Cấu hình:

```env
BUZZER_AUTO_ALERT_ENABLED=true
BUZZER_COOLDOWN_SECONDS=60
```

### Cách test

1. Vào trang **Rules**.
2. Sửa rule **Nhiệt độ cao**:

```json
{
  "thresholdC": 20,
  "consecutiveSamples": 1
}
```

3. Đảm bảo không có alert `TEMP_HIGH` đang mở.
4. Gửi telemetry nhiệt độ > 20°C.
5. Kiểm tra:

- Alert `TEMP_HIGH` xuất hiện.
- Command `buzzer1 / ALARM` xuất hiện.
- Log backend có dòng:

```text
Kích còi office-ctrl-01 do alert TEMP_HIGH
```

### Lưu ý

- Alert đang mở sẽ không tạo alert mới, nên không kích còi lại.
- Cooldown mặc định 60 giây.
- Muốn test nhanh, đặt tạm:

```env
BUZZER_COOLDOWN_SECONDS=0
```

rồi restart backend.

- Còi thật chỉ kêu khi firmware Node B xử lý action `ALARM`.
- Module firmware có sẵn:

```text
firmware/node-b/buzzer.h
firmware/node-b/buzzer.cpp
```

---

## 9. Chạy frontend riêng bằng mock

Không cần backend:

```powershell
cd D:\project\SmartOffice\frontend
Copy-Item .env.example .env
```

Trong `frontend/.env`:

```env
VITE_USE_MOCK=true
```

Chạy:

```powershell
npm ci
npm run dev
```

Mở:

```text
http://localhost:5173
```

---

## 10. Chạy backend local

Cần PostgreSQL và Mosquitto đang chạy. Có thể dùng Docker cho hạ tầng:

```powershell
cd D:\project\SmartOffice\deployment
docker compose up -d postgres mosquitto
```

Sau đó:

```powershell
cd D:\project\SmartOffice\backend
$env:DB_URL="jdbc:postgresql://localhost:5432/iot"
$env:DB_USER="iot"
$env:DB_PASSWORD="doi-mat-khau-db"
$env:MQTT_BROKER_URL="tcp://localhost:1883"
$env:MQTT_USERNAME="backend"
$env:MQTT_PASSWORD="doi-mat-khau-backend"
$env:JWT_SECRET="smartoffice-local-secret-at-least-32-chars-long-123"
$env:SEED_DEV_USERS="true"
mvn spring-boot:run
```

---

## 11. Chạy simulator thủ công

### Node B

```powershell
cd D:\project\SmartOffice
python tests\simulator\node_b_simulator.py
```

### Node A + B theo kịch bản

```powershell
cd tests\mqtt
python -m pip install -r requirements.txt
$env:MQTT_USERS = "backend:doi-mat-khau-backend,office-env-01:doi-mat-khau-env01,office-ctrl-01:doi-mat-khau-ctrl01"
python mock_publisher.py --scenario normal
```

Kịch bản có sẵn:

```text
normal
hot
sensor-fault
absent
silent
```

---

## 12. Chạy test tự động

### Backend

```powershell
cd backend
mvn test
```

### Frontend

```powershell
cd frontend
npm test
npm run build
```

---

## 13. Dừng và reset

Dừng container:

```powershell
cd deployment
docker compose --profile ui down
```

Xóa luôn database và MQTT volume:

```powershell
docker compose --profile ui down -v
```

Chỉ rebuild sau khi sửa code:

```powershell
docker compose --profile ui up -d --build
```

---

## 14. Lỗi thường gặp

### Port bị chiếm

```powershell
Get-NetTCPConnection -LocalPort 3000,8080,1883,5432 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort,OwningProcess
```

Windows có thể đang chạy Mosquitto service riêng ở cổng 1883:

```powershell
Stop-Service mosquitto
```

### Backend không kết nối PostgreSQL

- Kiểm tra `POSTGRES_*` trong `deployment/.env`.
- Nếu vừa đổi mật khẩu sau khi đã chạy, xóa volume:

```powershell
docker compose --profile ui down -v
docker compose --profile ui up -d --build
```

### AI báo 400 MissingSessionID

Đã được xử lý trong backend: header `x-opencode-session` được gửi tự động.

### AI báo 429

Provider đang quá tải hoặc hết credit. Đổi model hoặc dùng provider khác.

### AI báo 502

Kiểm tra:

```powershell
docker logs --tail 100 iot-backend
```

Thường gặp:

- Key sai/hết hạn
- Hết credit
- Model không tồn tại
- Provider timeout

### MQTT lỗi xác thực

Kiểm tra:

- `MQTT_USERS` đúng định dạng `user:password,user2:password2`.
- `BACKEND_MQTT_PASSWORD` trùng user `backend`.
- Không có dấu phẩy, dấu cách, `$` trong mật khẩu.

---

## 15. Lệnh nhanh

```powershell
# Chạy toàn bộ
cd D:\project\SmartOffice\deployment
docker compose --profile ui up -d --build

# Chạy kèm mock
docker compose --profile ui --profile mock up -d --build

# Xem trạng thái
docker compose ps

# Xem log backend
docker logs -f iot-backend

# Dừng
docker compose --profile ui down

# Reset sạch
docker compose --profile ui down -v
```

---

## 16. Bản đồ chức năng hệ thống

Tài liệu này thiên về **cách chạy**. Bảng dưới đây tóm tắt toàn bộ chức năng đã có để kiểm tra nhanh.

### 16.1. Người dùng và phân quyền

| Chức năng | Trạng thái | Ghi chú |
|---|---|---|
| Đăng nhập / đăng xuất | Có | JWT, token hết hạn sau 3600 giây |
| Phân quyền Admin / Operator / Viewer | Có | Kiểm tra ở backend bằng Spring Security |
| Admin quản lý người dùng | Có | Tạo tài khoản, xem danh sách |
| Đổi mật khẩu | Có | `PUT /api/users/me/password` |
| Khóa tài khoản | Một phần | Có trạng thái tài khoản, chưa có API khóa/mở riêng |

### 16.2. Thiết bị và vòng đời

| Chức năng | Trạng thái | Ghi chú |
|---|---|---|
| Đăng ký thiết bị | Có | Admin |
| Kích hoạt / khóa / decommission | Có | `POST /api/devices/{id}/activate|lock|decommission` |
| Trạng thái online/offline | Có | Heartbeat, LWT, timeout 90 giây |
| Chế độ AUTO / MANUAL | Có | Automation không ghi đè MANUAL |
| Xem trạng thái actuator | Có | `GET /api/devices/{id}/status` |
| Cấu hình từ xa | Có | Chu kỳ telemetry, góc servo; có ACK |

### 16.3. Giám sát môi trường

| Chức năng | Trạng thái | Ghi chú |
|---|---|---|
| Nhiệt độ, độ ẩm | Có | AHT20 |
| Ánh sáng | Có | BH1750 |
| Hiện diện | Có | LD2410C |
| Chất lượng không khí | Có | MQ-135, `airRaw` |
| Công suất / dòng điện | Có | INA219 ×2 |
| Dashboard realtime | Có | SSE, không cần F5 |
| Lịch sử telemetry | Có | Lọc theo thiết bị, khoảng thời gian |
| Thống kê năng lượng | Có | Wh theo raw/minute/hour/day |

### 16.4. Điều khiển và còi

| Chức năng | Trạng thái | Ghi chú |
|---|---|---|
| Bật/tắt đèn, quạt | Có | `light1`, `fan1` |
| Điều khiển cửa mô hình | Có | `door1 OPEN/CLOSE` |
| Còi ON/OFF | Có | `buzzer1 ON/OFF` |
| Còi BEEP / BEEP2 / BEEP_LONG | Có | Kêu ngắn, 2 tiếng, dài |
| Còi ALARM | Có | Hú lặp, tự tắt theo firmware |
| Tự kêu khi có cảnh báo | Có | TEMP_HIGH, AIR_BAD, DOOR_LEFT_OPEN, ENERGY_WASTE |
| Chống hú liên tục | Có | Cooldown 60 giây |
| ACK / timeout / retry | Có | Command có trạng thái PENDING → SUCCESS/FAILED/TIMEOUT |
| Chống gửi trùng | Có | `Idempotency-Key` |

### 16.5. Cảnh báo, rule và tự động hóa

| Chức năng | Trạng thái | Ghi chú |
|---|---|---|
| Cảnh báo nhiệt độ cao | Có | `TEMP_HIGH` |
| Cảnh báo không khí xấu | Có | `AIR_BAD` |
| Cảnh báo cửa mở lâu | Có | `DOOR_LEFT_OPEN` |
| Cảnh báo thiết bị offline | Có | `DEVICE_OFFLINE` |
| Cảnh báo lãng phí điện | Có | `ENERGY_WASTE` |
| Cảnh báo cảm biến lỗi | Có | `SENSOR_FAULT` |
| Xác nhận cảnh báo | Có | Operator/Admin |
| Sửa ngưỡng / rule | Có | Admin/Operator |
| Tự tắt đèn/quạt khi phòng trống | Có | Chỉ mode AUTO |
| Tự tắt tải khi lãng phí điện | Có | Chỉ mode AUTO |
| Lịch sử cảnh báo | Có | Có phân trang |

### 16.6. API và tích hợp

Các nhóm API chính:

```text
POST   /api/auth/login
POST   /api/auth/register
GET    /api/users/me
PUT    /api/users/me/password
GET    /api/users
POST   /api/users

GET    /api/devices
POST   /api/devices
GET    /api/devices/{id}/status
GET    /api/devices/{id}/telemetry
GET    /api/devices/{id}/energy
GET    /api/devices/{id}/commands
POST   /api/devices/{id}/commands
POST   /api/devices/{id}/mode
PUT    /api/devices/{id}/config
POST   /api/devices/{id}/activate
POST   /api/devices/{id}/lock
POST   /api/devices/{id}/decommission

GET    /api/alerts
PATCH  /api/alerts/{id}/acknowledge
GET    /api/rules
PUT    /api/rules/{id}
GET    /api/audit-logs
GET    /api/stream
POST   /api/ai/chat
```

Swagger:

```text
http://localhost:8080/swagger-ui/index.html
```

### 16.7. Giao thức và bảo mật

| Hạng mục | Trạng thái |
|---|---|
| MQTT topic theo `deviceId` | Có |
| QoS 1 cho telemetry/command/ACK | Có |
| Retained status/config | Có |
| LWT phát hiện mất kết nối | Có |
| MQTT auth + ACL theo user | Có |
| JWT + BCrypt | Có |
| RBAC backend | Có |
| Audit log | Có command/config |
| TLS/HTTPS production | Chưa bật mặc định |

### 16.8. Cơ sở dữ liệu và triển khai

| Hạng mục | Trạng thái |
|---|---|
| PostgreSQL 16 | Có |
| Flyway migration | Có |
| 9 bảng nghiệp vụ | Có |
| Docker Compose full stack | Có |
| Nginx proxy REST + SSE | Có |
| Swagger/OpenAPI | Có |
| AI provider tùy chọn | Có |
| Simulator Node A/B | Có |

### 16.9. Phần cứng / firmware

| Hạng mục | Trạng thái |
|---|---|
| Firmware Node A | Có trong repo |
| Firmware Node B | Đang hoàn thiện, main có thể thay đổi |
| Module còi `buzzer.cpp` | Có |
| Sơ đồ đấu dây | Có trong `hardware/` |
| Đo công suất INA219 | Có thiết kế, cần hiệu chuẩn |
| OTA | Chưa có |
| Telegram/email | Chưa có |

### 16.10. Giới hạn hiện tại

- Chưa phân quyền theo từng phòng/user.
- Audit mới phủ command/config, chưa phủ rule/alert/user/device.
- Chưa có retention telemetry và rate limit API.
- AI phụ thuộc provider bên ngoài; có thể lỗi 429/timeout.
- Firmware Node B đang trong quá trình hoàn thiện.
- Chưa test đầy đủ với phần cứng thật.
