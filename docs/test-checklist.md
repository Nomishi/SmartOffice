# Test checklist & biên bản test — M3 Backend

- Ngày chạy: **06–07/11/2026**
- Môi trường: Windows, Java 17 (Temurin), Maven 3.9, Spring Boot 3.5.16,
  PostgreSQL 16 (Docker), Mosquitto 2 (Docker + service Windows).
- Backend chạy profile `mock` (giả lập M1+M2) tại `http://localhost:8080`.

## 1. Test tự động

```powershell
cd backend
mvn test
```

Kết quả tại thời điểm ghi:

| Test class | Số test | Kết quả |
| --- | ---: | --- |
| `SmartOfficeApplicationTests` | 1 | PASS |
| `ApiSmokeTest` | 8 | PASS |
| `RuleServiceTest` | 3 | PASS |
| `EnergyServiceTest` | 1 | PASS |
| `DeviceServiceTest` | 2 | PASS |
| **Tổng** | **15** | **0 failure, 0 error** |

`ApiSmokeTest` kiểm tra: list devices seed, list rules seed, alerts endpoint, status endpoint,
telemetry thiếu from/to → 400 `VALIDATION_ERROR`, telemetry device không tồn tại → 404 `NOT_FOUND`,
telemetry mặc định `size=20`, command tới device offline → 409 `DEVICE_OFFLINE`.
`DeviceServiceTest` kiểm tra `SUSPECT` phá chuỗi INVALID/VALID và `VALID + presence=true` xoá `emptySince`.

## 2. Test live qua MQTT + REST (mock)

### 2.1 Command → ACK → actuator

```powershell
curl.exe -X POST "http://localhost:8080/api/devices/office-ctrl-01/commands?wait=true" `
  -H "Content-Type: application/json" -H "X-User-Id: 2" `
  -H "Idempotency-Key: test-key-001" -d '{"target":"light1","action":"ON"}'
```

Kết quả thực tế:

```text
CMD-0001 light1 ON -> SUCCESS latency=180ms
status sau ACK: light1=ON, fan1=OFF
GET /commands: total=1, CMD-0001/SUCCESS
```

### 2.2 Idempotency-Key

Dùng lại `test-key-001` với body khác (`fan1 ON`):

```text
409 COMMAND_DUPLICATE — "Idempotency-Key đã dùng cho lệnh khác"
```

### 2.3 Telemetry + energy

```text
GET /api/devices/office-env-01/telemetry?from=...&to=...&size=5
→ total=6, latest=31.5°C, quality=VALID

GET /api/devices/office-ctrl-01/energy?...&bucket=minute
→ totalWh=0.012, buckets=1
```

### 2.4 TEMP_HIGH + tự đóng alert

Hạ rule `TEMP_HIGH` xuống `thresholdC=20, consecutiveSamples=1`, chờ 1 chu kỳ telemetry:

```text
OPEN ALERTS=1
alertId=1, type=TEMP_HIGH, severity=MEDIUM, status=OPEN, value=30.90, threshold=20.00
```

Khôi phục ngưỡng 32 → bản tin VALID tiếp theo tự đóng alert (`resolvedAt` được set).

### 2.5 LWT offline → alert

Publish retained qua Windows Mosquitto (backend đang nối broker này):

```powershell
& "C:\Program Files\mosquitto\mosquitto_pub.exe" -h 127.0.0.1 -t office/office-ctrl-01/status `
  -m '{"online":false}' -r -q 1
```

Kết quả sau 3s:

```text
ALERTS=1: DEVICE_OFFLINE (severity HIGH)
```

### 2.6 SENSOR_FAULT

Publish 3 bản tin `quality=INVALID` liên tiếp cho `office-env-01`:

```text
ALERTS=1: SENSOR_FAULT
GET /api/devices/office-env-01/status → status=FAULT
```

Sau 3 bản tin VALID liên tiếp, rule engine tự đóng alert và đưa device về `ACTIVE` (đã implement;
kiểm tra live lại khi có broker/thiết bị thật).

### 2.7 Automation phòng trống

- Đặt `ABSENCE_OFF` rule `absenceMinutes=1`.
- Bật `light1=ON` qua API (ACK SUCCESS).
- Chờ mock chuyển sang pha `presence=false` (chu kỳ mock: 3 phút có người, 2 phút vắng).

Kết quả:

```text
AUTO OFF FOUND: CMD-0003 light1 SUCCESS (issuedBy=automation)
light1 hiện tại=OFF
```

## 3. Test tay cần làm khi có phần cứng/frontend

- [ ] ESP32 Node A thật → telemetry vào DB, đúng `quality`, đúng đơn vị.
- [ ] ESP32 Node B thật → command relay thật, ACK trong < 1s.
- [ ] Door servo: mở/đóng, ACK phản ánh công tắc từ, timeout 10s.
- [ ] Nút trên web (M4) → relay thật → ACK → UI cập nhật.
- [ ] Rút nguồn/WiFi Node B → LWT + quá 90s → `DEVICE_OFFLINE` + dashboard.
- [ ] Cắm lại → heartbeat → `ACTIVE`, alert tự đóng.
- [ ] `mode=MANUAL` → automation không gửi OFF dù phòng trống.
- [ ] `door1=OPEN` quá ngưỡng → `DOOR_LEFT_OPEN`.
- [ ] Cấu hình Mosquitto ACL/password: device không publish được topic của node khác.
- [ ] Kiểm tra CORS với origin frontend thật.
- [ ] Kiểm tra SSE (sau P0) nhận telemetry/alert/command realtime.

## 4. Lưu ý khi chạy test

- Nếu Windows Mosquitto service và Docker Mosquitto cùng bật, kiểm tra backend đang nối broker nào:
  `Get-NetTCPConnection -LocalPort 1883`.
- DB dev có thể còn alert/command của lần test trước; dùng `docker compose down -v` để reset
  (xoá volume) nếu cần dữ liệu sạch.
- `X-User-Id` chỉ là tạm thời; sau P0 auth phải đổi sang Bearer token.
