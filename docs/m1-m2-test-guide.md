# M1/M2 — Test firmware với backend

Tài liệu cho M1 (Node A) và M2 (Node B) test firmware với broker + backend M3.

## 0. Cần pull gì?

- Repo **không chứa code firmware M1/M2**. Firmware nằm ở máy/repo riêng của M1/M2.
- Việc cần pull: contract + tài liệu test này.

```powershell
git clone https://github.com/Nomishi/SmartOffice.git
cd SmartOffice
git checkout feature/backend-complete
```

Đọc trước:

- [`../Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](../Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md) v1.3
- [`m3-backend.md`](m3-backend.md) mục MQTT contract
- [`frontend-integration.md`](frontend-integration.md) nếu cần API

Firmware chỉ cần kết nối **MQTT**, không cần Java/DB/REST.

## 1. Broker đang chạy

Backend Docker hiện tại:

| Thông số | Giá trị |
| --- | --- |
| Broker host (từ PC) | `localhost` |
| Broker port (từ PC) | **1884** |
| Broker host (từ ESP32 cùng Wi-Fi) | **192.168.10.205** (IP Wi-Fi hiện tại, có thể đổi) |
| Broker port (từ ESP32) | **1884** |
| Auth dev | anonymous (không username/password) |
| WebSocket | `localhost:9001` |

Kiểm tra:

```powershell
docker compose ps mosquitto
# Ports: 0.0.0.0:1884->1883/tcp

Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object InterfaceAlias, IPAddress
```

> Port host là **1884** vì Windows đang có Mosquitto service giữ 1883. Backend trong Docker
> vẫn nối `mosquitto:1883` nội bộ nên không ảnh hưởng.
>
> Nếu dùng broker Windows (service) thì port là **1883**.
>
> ESP32 phải dùng Wi-Fi 2.4 GHz cùng mạng LAN với PC. Nếu không kết nối được, kiểm tra
> Windows Firewall cho phép inbound port 1884 (hoặc 1883).

Test broker từ điện thoại/MQTTX cùng Wi-Fi: host `192.168.10.205`, port `1884`.

## 2. Device ID & topic

| Node | deviceId | Topic chính |
| --- | --- | --- |
| Node A | `office-env-01` | `office/office-env-01/telemetry`, `office/office-env-01/status` |
| Node B | `office-ctrl-01` | `office/office-ctrl-01/telemetry`, `office/office-ctrl-01/status`, `office/office-ctrl-01/ack` |

Quy tắc bắt buộc:

- `deviceId` trong payload **phải trùng** deviceId trên topic.
- QoS 1 cho telemetry/status/command/ack/config.
- Status và config dùng **retained**.
- Heartbeat: publish status mỗi 30s. Quá 90s không có dữ liệu → backend đánh `OFFLINE` + alert.
- LWT: `{"online":false}` trên topic status, retained.

## 3. Payload mẫu

### Node A telemetry (5s/lần)

```json
{"deviceId":"office-env-01","temperature":28.5,"humidity":72,"lux":320.5,"presence":true,"quality":"VALID","airRaw":1450,"rssi":-58}
```

### Node A status (30s/lần, retained)

```json
{"online":true,"fwVersion":"1.0.0","mode":"AUTO"}
```

### Node B telemetry công suất

```json
{"deviceId":"office-ctrl-01","busVoltageV":12.1,"light1PowerW":4.8,"light1CurrentMa":397,"fan1PowerW":2.1,"fan1CurrentMa":173,"quality":"VALID","rssi":-61}
```

### Node B status (retained)

```json
{"online":true,"light1":"OFF","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED","mode":"AUTO","fwVersion":"1.0.0"}
```

### Node B ACK

```json
{"commandId":"CMD-0001","target":"light1","status":"SUCCESS","state":"ON","latencyMs":180}
```

### Command backend gửi xuống

```json
{"commandId":"CMD-0001","target":"light1","action":"ON","issuedBy":"user-2"}
```

`target`: `light1|fan1|buzzer1|door1`; `action`: `ON|OFF` (door: `OPEN|CLOSE`).
Node B phải subscribe `office/office-ctrl-01/command` và trả ACK trong 5s (door 10s).

## 4. Test nhanh bằng MQTTX / mosquitto_pub

### 4.1. Subscribe toàn bộ

```powershell
mosquitto_sub -h localhost -p 1884 -t "office/#" -v
```

### 4.2. Node A gửi telemetry giả

```powershell
mosquitto_pub -h localhost -p 1884 -t office/office-env-01/telemetry -q 1 `
  -m '{"deviceId":"office-env-01","temperature":31.5,"humidity":70,"lux":300,"presence":false,"quality":"VALID","airRaw":1200}'
```

### 4.3. Node B gửi status + telemetry

```powershell
mosquitto_pub -h localhost -p 1884 -t office/office-ctrl-01/status -q 1 -r `
  -m '{"online":true,"light1":"OFF","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED","mode":"AUTO","fwVersion":"1.0.0"}'

mosquitto_pub -h localhost -p 1884 -t office/office-ctrl-01/telemetry -q 1 `
  -m '{"deviceId":"office-ctrl-01","busVoltageV":12.1,"light1PowerW":0,"fan1PowerW":0,"quality":"VALID"}'
```

## 5. Kiểm tra backend đã nhận

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/auth/login `
  -ContentType "application/json" `
  -Body '{"username":"operator1","password":"operatorPassword123!"}'
$token = $login.token

# Node A mới nhất
Invoke-RestMethod "http://localhost:8080/api/devices/office-env-01/status" `
  -Headers @{ Authorization = "Bearer $token" }

# Node B mới nhất
Invoke-RestMethod "http://localhost:8080/api/devices/office-ctrl-01/status" `
  -Headers @{ Authorization = "Bearer $token" }
```

Telemetry history:

```powershell
$from = (Get-Date).ToUniversalTime().AddMinutes(-10).ToString("yyyy-MM-ddTHH:mm:ssZ")
$to = (Get-Date).ToUniversalTime().AddMinutes(1).ToString("yyyy-MM-ddTHH:mm:ssZ")
Invoke-RestMethod "http://localhost:8080/api/devices/office-env-01/telemetry?from=$from&to=$to&size=20" `
  -Headers @{ Authorization = "Bearer $token" }
```

## 6. Test command → ACK

1. Node B publish status `online:true` (retained).
2. Subscribe command trên Node B hoặc PC:

```powershell
mosquitto_sub -h localhost -p 1884 -t office/office-ctrl-01/command -v
```

3. Gửi lệnh từ API:

```powershell
$body = @{ target = "light1"; action = "ON" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/devices/office-ctrl-01/commands?wait=true" `
  -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = [guid]::NewGuid() } `
  -ContentType "application/json" -Body $body
```

4. Node B nhận command, bật relay, publish ACK.
5. Kiểm tra lịch sử:

```powershell
Invoke-RestMethod "http://localhost:8080/api/devices/office-ctrl-01/commands" `
  -Headers @{ Authorization = "Bearer $token" }
```

Kỳ vọng: command `SUCCESS`, `latencyMs` > 0, status actuator đổi.

## 7. Test offline / LWT

- **LWT:** cấu hình Will topic `office/office-ctrl-01/status`, retained, payload `{"online":false}`.
  Khi ESP32 mất kết nối, broker gửi LWT; backend tạo alert `DEVICE_OFFLINE` ngay.
- **Mất heartbeat:** ngừng publish status/telemetry; sau **90s** backend tự đánh `OFFLINE` + alert.
- Cắm lại/gửi dữ liệu mới: backend đưa về `ACTIVE`, alert tự đóng.

Kiểm tra:

```powershell
Invoke-RestMethod "http://localhost:8080/api/devices/office-ctrl-01/status" `
  -Headers @{ Authorization = "Bearer $token" }

Invoke-RestMethod "http://localhost:8080/api/alerts?status=OPEN" `
  -Headers @{ Authorization = "Bearer $token" }
```

## 8. Lỗi thường gặp

| Lỗi | Nguyên nhân |
| --- | --- |
| ESP32 không connect | Sai Wi-Fi 2.4GHz, sai IP PC, firewall chặn port 1884 |
| Backend không thấy telemetry | `deviceId` payload khác topic, sai topic, QoS/JSON lỗi |
| 404 device | Chưa đăng ký và `auto-register` tắt (dev đang bật) |
| Command 409 `DEVICE_OFFLINE` | Node B chưa gửi status/telemetry trong 90s |
| Command `TIMEOUT` | Node B không subscribe command hoặc không ACK trong 5s (door 10s) |
| ACK không cập nhật | Sai `commandId`, sai topic ACK, JSON sai |
| Door `FAILED` | Công tắc từ không khớp trạng thái servo |

## 9. Checklist M1/M2

- [ ] ESP32 kết nối broker qua Wi-Fi 2.4GHz.
- [ ] Node A telemetry 5s/lần đúng payload, có `quality`.
- [ ] Node A status heartbeat 30s.
- [ ] Node B telemetry công suất đúng.
- [ ] Node B status retained, có actuator + door.
- [ ] Node B nhận command, đổi relay/servo, gửi ACK.
- [ ] ACK cập nhật command `SUCCESS` trên backend.
- [ ] LWT + quá 90s → `DEVICE_OFFLINE`.
- [ ] Cắm lại → `ACTIVE`, alert tự đóng.

Khi xong checklist này, M3 có thể chuyển sang test end-to-end với M4 (web → relay → ACK).
