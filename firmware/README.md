# Firmware

Firmware ESP32 cho hai node của hệ thống Phòng làm việc thông minh.

```text
firmware/
├── node-a/                  # M1 – Node A (office-env-01): cảm biến môi trường
│   ├── node-a.ino           # chương trình chính: telemetry, status, config
│   ├── sensors.cpp/.h       # AHT20, BH1750, LD2410C, MQ-135 + đánh giá quality
│   ├── net_mqtt.cpp/.h      # Wi-Fi + MQTT (dùng chung, giống hệt bên node-b)
│   ├── config.h             # deviceId, topic, chân GPIO, chu kỳ – KHÔNG chứa bí mật
│   └── secrets.example.h    # mẫu Wi-Fi / mật khẩu MQTT -> sao chép thành secrets.h
└── node-b/                  # M2 – Node B (office-ctrl-01): điều khiển + đo điện
    ├── node-b.ino           # chương trình chính: command/ACK, config, status, telemetry
    ├── actuators.cpp/.h     # đèn, relay quạt, còi, servo cửa + công tắc từ
    ├── power.cpp/.h         # INA219 x2 (đọc thẳng thanh ghi)
    ├── net_mqtt.cpp/.h
    ├── config.h
    └── secrets.example.h
```

## 1. Cài đặt và nạp

Yêu cầu:

- Arduino IDE 2.x, board **esp32 by Espressif 3.x** (đã kiểm tra với 3.3.12). Node B dùng API LEDC của core 3.x.
- Thư viện (Library Manager): **MQTT** của Joel Gaehwiler (256dpi) 2.5.x và **ArduinoJson** 7.x.

```bash
arduino-cli core install esp32:esp32
arduino-cli lib install "MQTT" "ArduinoJson"
```

Các bước:

1. Trong mỗi thư mục node, sao chép `secrets.example.h` thành `secrets.h` rồi điền Wi-Fi 2.4 GHz, IP LAN của máy chạy broker
   và **mật khẩu MQTT riêng của node đó** (khớp `MQTT_USERS` trong `deployment/.env`).
   `secrets.h` đã nằm trong `.gitignore`, không commit.
2. Mở `node-a/node-a.ino` hoặc `node-b/node-b.ino`, chọn board **ESP32 Dev Module**, đúng cổng COM, bấm Upload.
3. Mở Serial Monitor 115200 để xem log (`[NET]`, `[TELEMETRY]`, `[STATUS]`, `[CMD]`, `[CONFIG]`).

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/node-a
arduino-cli upload  --fqbn esp32:esp32:esp32 -p COM8 firmware/node-a
```

Nếu chưa có `secrets.h`, firmware vẫn biên dịch được (dùng file mẫu, có cảnh báo) nhưng không kết nối được mạng.

## 2. Đối chiếu yêu cầu đề bài (mục 4.2, 4.3)

| Yêu cầu | Cách đáp ứng |
| --- | --- |
| Thu thập dữ liệu cảm biến | Node A: nhiệt độ, độ ẩm, lux, hiện diện, không khí. Node B: điện áp, dòng, công suất từng tải |
| Mã định danh duy nhất | `DEVICE_ID` (`office-env-01`, `office-ctrl-01`), dùng làm MQTT username, clientId và trong topic |
| Gửi dữ liệu về backend | MQTT `office/{deviceId}/telemetry`, QoS 1, JSON camelCase, kèm `seq`, `ts` (khi có NTP), `quality` |
| Nhận cấu hình / lệnh từ xa | Topic `config` (retained) và `command`; mọi bản tin đều có ACK |
| Điều khiển cơ cấu chấp hành | Node B: đèn, quạt, còi, cửa servo; cửa được xác nhận bằng công tắc từ |
| Trạng thái / heartbeat | Topic `status` retained mỗi 30 giây và ngay khi trạng thái đổi |
| Phát hiện mất kết nối | LWT `{"online":false}` retained; LED trên board nháy; log `[NET]`; telemetry không gửi được thì bỏ, đếm số bỏ |
| Tự kết nối lại | Wi-Fi: backoff 5 → 10 → 15 giây. MQTT: 1 → 2 → 4 → 8 → 15 giây. Bị broker từ chối đăng nhập: 30 giây |
| Xác nhận lệnh | ACK `{commandId,target,status,state,latencyMs}` QoS 1 |
| Xử lý bản tin trùng | Node B nhớ 16 `commandId` gần nhất: trùng thì không thực thi lại, gửi lại ACK cũ |
| Thông tin xác thực riêng | Mỗi node một tài khoản MQTT; ACL broker chỉ cho đọc/ghi topic của chính nó |
| Không commit bí mật | `secrets.h` bị `.gitignore`; repo chỉ có `secrets.example.h` |
| An toàn khi khởi động | Đèn, quạt, còi OFF; servo về vị trí đóng (Contract mục 6) |
| Độ ổn định | Watchdog 30 giây tự khởi động lại nếu treo; cấu hình lưu flash (NVS) |

## 3. Bản tin

Node A telemetry (mặc định 5 giây):

```json
{"deviceId":"office-env-01","seq":12,"ts":"2026-11-11T08:30:00Z","temperature":27.4,"humidity":63.2,"lux":320.5,
 "presence":true,"distanceCm":85,"movingEnergy":40,"staticEnergy":100,"airRaw":640,"quality":"VALID","rssi":-58}
```

Node B telemetry:

```json
{"deviceId":"office-ctrl-01","seq":12,"busVoltageV":12.08,"light1PowerW":4.81,"light1CurrentMa":398,
 "fan1PowerW":2.1,"fan1CurrentMa":174,"quality":"VALID","rssi":-61}
```

Node B status (retained):

```json
{"online":true,"light1":"OFF","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED","fwVersion":"1.0.0",
 "hwVersion":"esp32-devkit-v1/ctrl-b1","telemetryIntervalSec":5,"servoOpenDeg":90,"servoCloseDeg":0,
 "uptimeSec":120,"rssi":-61,"ip":"192.168.1.50","reconnects":0}
```

Các trường ngoài Contract (`seq`, `ts`, `hwVersion`, `uptimeSec`, `ip`, `reconnects`, `qualityDetail`, `message`) là bổ sung;
backend bỏ qua trường lạ nên không ảnh hưởng.

### Quy tắc `quality` (Contract mục 5.5)

| Trường hợp | Node A | Node B |
| --- | --- | --- |
| Không đọc được cảm biến | Bỏ trường đó, `INVALID` | Gửi `null`, cả bản tin `SUSPECT`, chi tiết `INVALID` trong `qualityDetail` |
| Radar im lặng quá 3 giây | Không gửi `presence` (không coi là phòng trống), `INVALID` | – |
| Giá trị ngoài dải | `SUSPECT` | `SUSPECT` (trên 26 V hoặc trên 3,2 A) |
| MQ-135 đang làm nóng (180 giây đầu) | `SUSPECT` | – |

`quality` của bản tin là mức xấu nhất. Khi khác `VALID`, firmware gửi thêm `qualityDetail` theo từng cảm biến.
**Firmware không bao giờ gửi số gán cứng thay cho số đo.**

Node B dùng `SUSPECT` thay vì `INVALID` khi INA219 lỗi vì backend chuyển thiết bị sang `FAULT` sau 3 bản tin `INVALID`
và chặn lệnh điều khiển; hỏng bộ đo điện không được làm mất khả năng bật/tắt đèn quạt (đổi bằng `INA_FAIL_QUALITY`).

### Trường `mode` trong status

Firmware **không gửi `mode`**. Chế độ AUTO/MANUAL do backend quản lý (`PUT /api/devices/{id}/mode`) và không có bản tin
nào báo xuống thiết bị. Nếu firmware gửi `"mode":"AUTO"` theo heartbeat, backend sẽ ghi đè lựa chọn MANUAL của người dùng
mỗi 30 giây. Backend chấp nhận status thiếu `mode`.

### Cấu hình từ xa

| Tham số | Dải hợp lệ | Node |
| --- | --- | --- |
| `telemetryIntervalSec` | 1–3600 | A, B |
| `servoOpenDeg`, `servoCloseDeg` | 0–180 | B (Node A bỏ qua) |

Sai kiểu hoặc ngoài dải: không áp dụng gì, ACK `FAILED` kèm `message`. Hợp lệ: áp dụng, lưu flash, ACK `SUCCESS`, gửi status mới.

## 4. Test nhanh bằng mosquitto

```bash
# Xem mọi bản tin của Node B (dùng tài khoản backend vì ACL chỉ cho thiết bị đọc command/config của chính nó)
mosquitto_sub -h <IP> -u backend -P "<mat-khau-backend>" -t "office/office-ctrl-01/#" -v

# Bật đèn
mosquitto_pub -h <IP> -u backend -P "<mat-khau-backend>" -q 1 -t office/office-ctrl-01/command \
  -m '{"commandId":"CMD-T001","target":"light1","action":"ON","issuedBy":"user-1"}'

# Gửi lại đúng lệnh trên: đèn không đổi, nhận lại ACK cũ (chống thực thi lặp)

# Mở cửa (ACK sau khi công tắc từ xác nhận)
mosquitto_pub -h <IP> -u backend -P "<mat-khau-backend>" -q 1 -t office/office-ctrl-01/command \
  -m '{"commandId":"CMD-T002","target":"door1","action":"OPEN","issuedBy":"user-1"}'

# Đổi chu kỳ telemetry của Node A thành 10 giây
mosquitto_pub -h <IP> -u backend -P "<mat-khau-backend>" -q 1 -r -t office/office-env-01/config \
  -m '{"configId":"CFG-T001","telemetryIntervalSec":10,"issuedBy":"user-1"}'
```

Kiểm thử mất mạng: tắt Wi-Fi hoặc dừng broker → LED nháy, log `[NET] Mat ket noi`, broker phát LWT `{"online":false}`;
bật lại → tự kết nối, gửi status `online:true`. Thu hồi thiết bị: xóa user khỏi `MQTT_USERS` và tạo lại container Mosquitto →
log `Broker TU CHOI dang nhap`.

## 5. Giới hạn hiện tại

- Chưa có OTA.
- TLS: có công tắc `MQTT_USE_TLS` (dùng `WiFiClientSecure` + `MQTT_CA_CERT`), **chưa kiểm thử** vì broker đang chạy cổng 1883.
- Telemetry trong lúc mất mạng không được lưu để gửi bù (dữ liệu cũ đến muộn sẽ làm sai rule/automation của backend).
- Lịch sử `commandId` nằm trong RAM, mất khi khởi động lại.
- `airRaw` là giá trị ADC tương đối, không phải ppm; MQ-135 cần làm nóng 24–48 giờ trước khi hiệu chuẩn ngưỡng.

Test không cần phần cứng: [`../tests/mqtt/mock_publisher.py`](../tests/mqtt/mock_publisher.py). Chân GPIO: [`../hardware/README.md`](../hardware/README.md).
