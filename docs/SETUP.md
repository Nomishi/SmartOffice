# Setup từ đầu — SmartOffice

Hướng dẫn này dành cho người clone repo lần đầu, muốn chạy **toàn hệ thống**.
Nếu chỉ làm frontend, xem [`frontend-setup.md`](frontend-setup.md).

## 0. Lấy đúng nhánh

```powershell
git clone https://github.com/Nomishi/SmartOffice.git
cd SmartOffice
git checkout feature/backend-complete
```

> `main` chưa có backend P0, frontend, infra hay simulator mới nhất.
> Hiện tại nhánh đúng là **`feature/backend-complete`**.

## 1. Cần cài gì?

- **Git**
- **Docker Desktop** (đang chạy)
- Trình duyệt web

Chỉ cần thêm khi làm ngoài Docker:

- **Node.js 20+** — chạy frontend dev
- **Python 3.10+ + paho-mqtt** — chạy simulator M2
- **Java 17 + Maven** — chạy backend local

## 2. Cổng cần trống

| Cổng | Dùng cho |
| --- | --- |
| `3000` | Frontend Docker/nginx |
| `8080` | Backend REST/SSE |
| `1883` | Mosquitto MQTT |
| `5432` | PostgreSQL |

Kiểm tra nhanh:

```powershell
Get-NetTCPConnection -LocalPort 3000,8080,1883,5432 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

> **Windows:** nếu có Mosquitto service riêng, nó thường giữ `127.0.0.1:1883`.
> Docker vẫn map được `0.0.0.0:1883`, nhưng client trên chính PC dùng `localhost:1883`
> sẽ trúng service Windows. Từ PC/ESP32 hãy dùng **IP LAN của PC**, ví dụ
> `192.168.10.205:1883`, hoặc dừng service:
> `Stop-Service mosquitto` (PowerShell admin).

## 3. Chạy full stack

```powershell
cd iot-infra
Copy-Item .env.example .env
```

Mở `.env` và đổi mật khẩu. Lưu ý:

- `MQTT_USERS` dạng `user:mat_khau,user2:mat_khau2`.
- Mật khẩu MQTT **không được chứa dấu phẩy, dấu cách hoặc `$`**.
- `BACKEND_MQTT_PASSWORD` phải trùng mật khẩu của user `backend` trong `MQTT_USERS`.
- `JWT_SECRET` phải dài **≥ 32 ký tự**.
- `SEED_DEV_USERS=true` để có tài khoản dev.

Chạy:

```powershell
docker compose --profile ui up -d --build
docker compose ps
```

Kỳ vọng 4 container healthy:

```text
iot-backend     Up (healthy)   8080
iot-frontend    Up (healthy)   3000
iot-mosquitto   Up (healthy)   1883
iot-postgres    Up (healthy)   5432
```

Mở:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`
- Swagger: `http://localhost:8080/swagger-ui/index.html`

## 4. Tài khoản dev

Khi `SEED_DEV_USERS=true` trong `iot-infra/.env`:

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `adminPassword123!` | ADMIN |
| `operator1` | `operatorPassword123!` | OPERATOR |
| `viewer1` | `viewerPassword123!` | VIEWER |

Nếu đổi `ADMIN_PASSWORD` / `OPERATOR_PASSWORD` / `VIEWER_PASSWORD`, dùng mật khẩu mới.

## 5. Kiểm tra hệ thống

```powershell
# Health
Invoke-RestMethod http://localhost:8080/actuator/health

# Login qua frontend nginx
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login `
  -ContentType "application/json" `
  -Body '{"username":"operator1","password":"operatorPassword123!"}'
$token = $login.token

# Danh sách thiết bị
Invoke-RestMethod http://localhost:3000/api/devices `
  -Headers @{ Authorization = "Bearer $token" }

# SSE (sẽ timeout sau vài giây, miễn thấy event:connected)
curl.exe -sS -N --max-time 4 "http://localhost:3000/api/stream?token=$token"
```

Trong UI:

1. Login `operator1`.
2. Dashboard hiển thị 2 node seed.
3. Nếu chưa có telemetry, chạy simulator ở mục 7.

## 6. Chạy frontend dev (không Docker)

```powershell
cd iot-frontend
Copy-Item .env.example .env
npm ci
```

`.env`:

```env
VITE_USE_MOCK=false
VITE_API_PROXY=http://localhost:8080
```

```powershell
npm run dev        # http://localhost:5173
```

Chạy demo không cần backend:

```env
VITE_USE_MOCK=true
```

Tài khoản mock: `admin/admin123`, `operator1/operator123`, `viewer1/viewer123`.

## 7. Chạy simulator M2

Simulator Node B nằm ở `iot-node-b/simulated_node.py`.

Với full stack `iot-infra` (auth/ACL):

```powershell
python -m pip install "paho-mqtt>=2.0,<3"

$env:MQTT_HOST = "192.168.10.205"       # IP LAN PC, KHÔNG dùng localhost nếu có Mosquitto Windows
$env:MQTT_PORT = "1883"
$env:MQTT_USERNAME = "office-ctrl-01"
$env:MQTT_PASSWORD = "<mật khẩu office-ctrl-01 trong iot-infra/.env>"
$env:PYTHONIOENCODING = "utf-8"

python iot-node-b/simulated_node.py
```

Với backend-only anonymous (`docker-compose.yml` gốc):

```powershell
$env:MQTT_HOST = "localhost"
$env:MQTT_PORT = "1884"
python iot-node-b/simulated_node.py
```

Simulator sẽ publish status retained, telemetry 5s, heartbeat 30s; nhận command và trả ACK.

## 8. Chạy simulator M1/M2 nâng cao

`iot-infra/scripts/mock_publisher.py` giả lập cả Node A + B, có scenario:

```powershell
cd iot-infra/scripts
python -m pip install -r requirements.txt

# cần MQTT_USERS trong env; xem iot-infra/README.md
python mock_publisher.py --scenario normal
python mock_publisher.py --scenario hot
python mock_publisher.py --scenario sensor-fault
python mock_publisher.py --scenario absent
python mock_publisher.py --scenario silent
```

Hoặc chạy qua Docker:

```powershell
cd iot-infra
docker compose --profile mock up -d mock-publisher
```

## 9. Dừng / reset

```powershell
cd iot-infra
docker compose --profile ui down       # giữ dữ liệu
docker compose --profile ui down -v    # xoá luôn DB/MQTT volume
```

## 10. Lỗi thường gặp

| Lỗi | Cách xử lý |
| --- | --- |
| `docker: daemon not running` | Bật Docker Desktop, chờ engine ready |
| Port đã bị chiếm | Tắt service/process đang giữ port, hoặc đổi mapping |
| `localhost:1883` nối nhầm broker | Dùng IP LAN PC hoặc tắt Mosquitto Windows |
| Mosquitto restart liên tục | Kiểm tra `MQTT_USERS` đúng format, không có dấu phẩy/space/$ |
| Backend không start | Thiếu `JWT_SECRET` ≥ 32 ký tự hoặc DB chưa healthy |
| Login 401 | Sai mật khẩu hoặc chưa seed user (`SEED_DEV_USERS=true`) |
| 409 `DEVICE_OFFLINE` | Chưa có telemetry/status; chạy simulator |
| Frontend 3000 trắng | `docker compose ps` xem frontend/backend healthy; xem log nginx |
| SSE không nhận | Token hết hạn; login lại; kiểm tra nginx proxy `/api/stream` |

## 11. Chạy backend-only (nếu chỉ test M3)

```powershell
Copy-Item .env.example .env
docker compose up -d
```

Backend `8080`, Postgres `5433`, Mosquitto host `1884` (anonymous).
Không chạy đồng thời với `iot-infra` vì trùng `8080`.
