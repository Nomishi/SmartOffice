# M1/M2 — Test firmware với hệ thống

Hướng dẫn test Node A (M1), Node B (M2) với broker + backend + frontend.

## 0. Repo có gì?

- `firmware/` — firmware Node B; simulator ở `tests/simulator/node_b_simulator.py`.
- Backend M3: `backend/`.
- Frontend M4: `frontend/`.
- Hạ tầng full stack: `deployment/` (Mosquitto ACL + PostgreSQL + backend + frontend).
- Node A firmware có thể nằm ngoài repo; dùng contract/payload bên dưới.

```powershell
git clone https://github.com/Nomishi/SmartOffice.git
cd SmartOffice
git checkout main
```

## 1. Chọn cách chạy

### Cách A — Full stack `deployment` (khuyến nghị, có ACL)

```powershell
cd deployment
Copy-Item .env.example .env      # đổi mật khẩu; KHÔNG commit .env
docker compose --profile ui up -d --build
docker compose ps
```

Mặc định trong `.env.example`:

```env
MQTT_USERS=backend:doi-mat-khau-backend,office-env-01:doi-mat-khau-env01,office-ctrl-01:doi-mat-khau-ctrl01
```

> Đọc `MQTT_USERS` trong `deployment/.env` để lấy username/password thật.
> Username = `deviceId`; backend dùng username `backend`.

Broker:

| Từ đâu | Host | Port | Auth |
| --- | --- | --- | --- |
| ESP32 cùng Wi-Fi | IP LAN của PC, ví dụ `192.168.10.205` | `1883` | username=deviceId, password trong `MQTT_USERS` |
| Từ chính PC | `192.168.10.205` (không dùng `localhost` nếu Windows có Mosquitto service) | `1883` | như trên |

ACL: device chỉ publish `office/{deviceId}/telemetry|status|ack` và subscribe
`office/{deviceId}/command|config`. Backend publish command/config, subscribe telemetry/status/ack.

## 2. Device ID & topic

| Node | deviceId | Topic |
| --- | --- | --- |
| Node A | `office-env-01` | `office/office-env-01/telemetry`, `.../status` |
| Node B | `office-ctrl-01` | `office/office-ctrl-01/telemetry`, `.../status`, `.../ack` |

Quy tắc:

- `deviceId` payload phải trùng topic.
- QoS 1; status/config retained.
- Heartbeat status 30s; quá 90s không dữ liệu → backend `OFFLINE` + alert.
- LWT: `{"online":false}` trên status, retained.
- Node B subscribe `office/office-ctrl-01/command` và `.../config`.

## 3. Payload mẫu

Node A telemetry (5s):

```json
{"deviceId":"office-env-01","temperature":28.5,"humidity":72,"lux":320.5,"presence":true,"quality":"VALID","airRaw":1450,"rssi":-58}
```

Node A status (30s, retained):

```json
{"online":true,"fwVersion":"1.0.0","mode":"AUTO"}
```

Node B telemetry:

```json
{"deviceId":"office-ctrl-01","busVoltageV":12.1,"light1PowerW":4.8,"light1CurrentMa":397,"fan1PowerW":2.1,"fan1CurrentMa":173,"quality":"VALID","rssi":-61}
```

Node B status (retained):

```json
{"online":true,"light1":"OFF","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED","mode":"AUTO","fwVersion":"1.0.0"}
```

Node B ACK:

```json
{"commandId":"CMD-0001","target":"light1","status":"SUCCESS","state":"ON","latencyMs":180}
```

Command backend gửi xuống:

```json
{"commandId":"CMD-0001","target":"light1","action":"ON","issuedBy":"user-2"}
```

`target`: `light1|fan1|buzzer1|door1`; `action`: `ON|OFF` (door: `OPEN|CLOSE`).

## 4. Test bằng MQTTX / mosquitto_pub

### Cách A — có auth

```powershell
# Subscribe
mosquitto_sub -h 192.168.10.205 -p 1883 -u office-ctrl-01 -P "mat-khau-ctrl01" -t "office/#" -v

# Node A telemetry
mosquitto_pub -h 192.168.10.205 -p 1883 -u office-env-01 -P "mat-khau-env01" `
  -t office/office-env-01/telemetry -q 1 `
  -m '{"deviceId":"office-env-01","temperature":31.5,"humidity":70,"lux":300,"presence":false,"quality":"VALID","airRaw":1200}'

# Node B status retained
mosquitto_pub -h 192.168.10.205 -p 1883 -u office-ctrl-01 -P "mat-khau-ctrl01" `
  -t office/office-ctrl-01/status -q 1 -r `
  -m '{"online":true,"light1":"OFF","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED","mode":"AUTO","fwVersion":"1.0.0"}'
```

Thay mật khẩu bằng giá trị thật trong `deployment/.env`.

## 5. Kiểm tra backend

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login `
  -ContentType "application/json" `
  -Body '{"username":"operator1","password":"operatorPassword123!"}'
$token = $login.token
$h = @{ Authorization = "Bearer $token" }

Invoke-RestMethod "http://localhost:3000/api/devices/office-env-01/status" -Headers $h
Invoke-RestMethod "http://localhost:3000/api/devices/office-ctrl-01/status" -Headers $h
```

Telemetry history:

```powershell
$from = (Get-Date).ToUniversalTime().AddMinutes(-10).ToString("yyyy-MM-ddTHH:mm:ssZ")
$to = (Get-Date).ToUniversalTime().AddMinutes(1).ToString("yyyy-MM-ddTHH:mm:ssZ")
Invoke-RestMethod "http://localhost:3000/api/devices/office-env-01/telemetry?from=$from&to=$to&size=20" -Headers $h
```

## 6. Test command → ACK

1. Node B publish status `online:true`.
2. Subscribe command:

```powershell
mosquitto_sub -h 192.168.10.205 -p 1883 -u office-ctrl-01 -P "mat-khau-ctrl01" `
  -t office/office-ctrl-01/command -v
```

3. Gửi lệnh qua API:

```powershell
$body = @{ target = "light1"; action = "ON" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/devices/office-ctrl-01/commands?wait=true" `
  -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = [guid]::NewGuid() } `
  -ContentType "application/json" -Body $body
```

4. Node B nhận command, đổi relay, publish ACK.
5. Kiểm tra lịch sử:

```powershell
Invoke-RestMethod "http://localhost:3000/api/devices/office-ctrl-01/commands" -Headers $h
```

Kỳ vọng: `SUCCESS`, status actuator đổi.

## 7. Chạy simulator Node B có sẵn

```powershell
$env:MQTT_HOST = "192.168.10.205"
$env:MQTT_PORT = "1883"
$env:MQTT_USERNAME = "office-ctrl-01"
$env:MQTT_PASSWORD = "mat-khau-ctrl01"
$env:PYTHONIOENCODING = "utf-8"
python tests/simulator/node_b_simulator.py
```

Simulator publish status retained, telemetry 5s, heartbeat 30s; nhận command và trả ACK.

## 8. Test offline / LWT

- **LWT:** cấu hình Will topic `office/office-ctrl-01/status`, retained, payload `{"online":false}`.
  Mất kết nối → broker gửi LWT → backend tạo alert `DEVICE_OFFLINE` ngay.
- **Mất heartbeat:** ngừng publish status/telemetry; sau **90s** backend đánh `OFFLINE` + alert.
- Có dữ liệu mới → `ACTIVE`, alert tự đóng.

Kiểm tra:

```powershell
Invoke-RestMethod "http://localhost:3000/api/devices/office-ctrl-01/status" -Headers $h
Invoke-RestMethod "http://localhost:3000/api/alerts?status=OPEN" -Headers $h
```

## 9. Lỗi thường gặp

| Lỗi | Nguyên nhân |
| --- | --- |
| Kết nối bị từ chối (5) | Sai username/password, thiếu user trong `MQTT_USERS` |
| Không connect được | Sai IP LAN, firewall, dùng `localhost` trúng Windows Mosquitto service |
| Backend không thấy telemetry | Sai topic/deviceId, JSON lỗi, ACL chặn |
| Command 409 `DEVICE_OFFLINE` | Node B chưa gửi status/telemetry trong 90s |
| Command `TIMEOUT` | Không subscribe command hoặc ACK chậm > 5s (door 10s) |
| ACK không cập nhật | Sai `commandId`, sai topic ACK, JSON thiếu field |
| Door `FAILED` | Công tắc từ không khớp trạng thái servo |

## 10. Checklist M1/M2

- [ ] ESP32 kết nối broker Wi-Fi 2.4GHz, đúng user/password.
- [ ] Node A telemetry 5s + quality.
- [ ] Node A status heartbeat 30s.
- [ ] Node B telemetry công suất + status retained.
- [ ] Node B nhận command, đổi relay/servo, ACK.
- [ ] ACK cập nhật command `SUCCESS` + actuator UI.
- [ ] LWT / quá 90s → `DEVICE_OFFLINE`.
- [ ] Cắm lại → `ACTIVE`, alert tự đóng.
