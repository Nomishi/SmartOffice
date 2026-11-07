# Smart Office IoT — M3 Backend

Backend Spring Boot cho hệ thống phòng làm việc thông minh. Đây là phần **M3**: cầu nối giữa
firmware (M1/M2) và frontend (M4).

- MQTT: subscribe telemetry/status/ack, publish command/config
- PostgreSQL: lưu telemetry, công suất, lệnh, ACK, cảnh báo, rule, audit log
- REST API cho M4
- Rule engine: nhiệt độ cao, không khí xấu, phòng trống, cửa mở lâu, lãng phí điện, mất heartbeat, sensor fault

Contract gốc: [`Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md)
(version 1.2). Mọi thay đổi payload/endpoint phải sửa file đó trước.

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
├── docker-compose.yml           # PostgreSQL + Mosquitto
├── .env.example
└── Contract_chung_...md         # contract chung của nhóm
```

## Chạy nhanh (5 phút)

### 1. Bật hạ tầng

```powershell
docker compose up -d
docker compose ps          # chờ postgres healthy
```

Postgres ở `localhost:5433` (tránh đụng Postgres local), Mosquitto ở `1883`.

> Nếu Windows đã cài Mosquitto service và chiếm port 1883, dừng service đó trước:
> `Stop-Service mosquitto` (mở PowerShell admin) hoặc dùng broker Docker.

### 2. Chạy backend + giả lập thiết bị

```powershell
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=mock
```

`mock` sẽ tự publish telemetry/status cho 2 node mỗi 5 giây, và nhận command/config để trả ACK.
Không cần ESP32, không cần MQTTX.

Chạy thật (không mock):

```powershell
mvn spring-boot:run
```

Chạy test:

```powershell
mvn test
```

### 3. Kiểm tra

```powershell
curl http://localhost:8080/api/devices
curl http://localhost:8080/api/devices/office-ctrl-01/status
curl http://localhost:8080/api/alerts
curl http://localhost:8080/api/rules
```

Gửi lệnh bật đèn (mock sẽ trả ACK sau ~180ms):

```powershell
curl -i -X POST http://localhost:8080/api/devices/office-ctrl-01/commands `
  -H "Content-Type: application/json" `
  -H "X-User-Id: 2" `
  -H "Idempotency-Key: 11111111-1111-1111-1111-111111111111" `
  -d '{"target":"light1","action":"ON"}'

# chờ ACK rồi trả kết quả
curl -X POST "http://localhost:8080/api/devices/office-ctrl-01/commands?wait=true" `
  -H "Content-Type: application/json" -d '{"target":"fan1","action":"ON"}'
```

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
- Heartbeat 30s, quá 90s không thấy → `OFFLINE` + alert `DEVICE_OFFLINE`.
- Command timeout 5s (door1 10s), retry tối đa 2 lần → `TIMEOUT`.
- Chỉ dùng telemetry `quality=VALID` cho automation/ngưỡng; `INVALID` chỉ lưu + đếm `SENSOR_FAULT`.

Test tay bằng MQTTX / mosquitto_pub:

```powershell
mosquitto_pub -h localhost -t office/office-env-01/telemetry -q 1 -m '{"deviceId":"office-env-01","temperature":31.5,"humidity":70,"lux":300,"presence":false,"quality":"VALID"}'
mosquitto_sub -h localhost -t 'office/#' -v
```

## REST API (M3 đã làm)

| Method | Endpoint | Ghi chú |
| --- | --- | --- |
| GET | `/api/devices` | phân trang `page,size,sort` |
| GET | `/api/devices/{id}/status` | trạng thái + actuator + telemetry mới nhất |
| GET | `/api/devices/{id}/telemetry?from=&to=` | bắt buộc from/to, tối đa 7 ngày |
| GET | `/api/devices/{id}/energy?from=&to=&bucket=` | `raw|minute|hour|day` |
| GET | `/api/devices/{id}/commands` | lịch sử lệnh + ACK |
| POST | `/api/devices/{id}/commands` | 202, hỗ trợ `Idempotency-Key`, `?wait=true` |
| POST | `/api/devices/{id}/mode` | `{"mode":"MANUAL"}` |
| PUT | `/api/devices/{id}/config` | publish topic config retained |
| POST | `/api/devices/{id}/activate|lock|decommission` | lifecycle cơ bản |
| GET | `/api/alerts` | lọc `status,type,deviceId,from,to` |
| PATCH | `/api/alerts/{id}/acknowledge` | |
| GET | `/api/rules` | 5 rule mặc định |
| PUT | `/api/rules/{id}` | sửa ngưỡng, validate theo contract |
| GET | `/api/audit-logs` | nhật ký lệnh/config |

Auth/JWT và quản lý user thuộc phần M2 — hiện dùng header tạm `X-User-Id`, sẽ thay bằng JWT.

## Rule engine

| Rule | Hành vi |
| --- | --- |
| `TEMP_HIGH` | nhiệt độ > ngưỡng N lần liên tiếp → alert, tự đóng khi xuống dưới ngưỡng |
| `AIR_BAD` | `airRaw` > ngưỡng N lần → alert |
| `ABSENCE_OFF` | `presence=false` liên tục X phút + mode AUTO → gửi OFF light1/fan1 |
| `DOOR_OPEN_LIMIT` | `door1=OPEN` quá X phút → alert |
| `ENERGY_WASTE` | vắng + công suất > ngưỡng → alert, AUTO thì tắt tải |
| `SENSOR_FAULT` | 3 bản tin `INVALID` liên tiếp → alert; 3 `VALID` liên tiếp → tự đóng |

Thiết bị `MANUAL` không bị automation ghi đè. Không có dữ liệu / `INVALID` / `SUSPECT` không bị coi là phòng trống.

## Biến môi trường

Copy `.env.example` → `.env` (không commit). Các biến chính:

| Biến | Mặc định |
| --- | --- |
| `DB_URL` | `jdbc:postgresql://localhost:5433/smartoffice` |
| `DB_USER` / `DB_PASSWORD` | `smartoffice` / `smartoffice` |
| `MQTT_BROKER_URL` | `tcp://localhost:1883` |
| `MQTT_ENABLED` | `true` (test = false) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` |

## Git workflow (contract mục 13)

```powershell
git init
git config user.name "Tên của mày"
git config user.email "email@example.com"
git add .
git commit -m "chore: scaffold M3 backend (Spring Boot, MQTT, Postgres, rule engine)"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Sau đó làm nhánh riêng:

```powershell
git checkout -b feature/backend-mqtt-subscriber
```

## Việc tiếp theo

- [ ] JWT + RBAC (phối hợp M2)
- [ ] SSE/WebSocket realtime cho M4
- [ ] Mock publisher độc lập (script Python) cho M1
- [ ] Migration Flyway thay `ddl-auto: update`
- [ ] Mosquitto ACL + credential (M4)
- [ ] Test với ESP32 thật + relay thật
