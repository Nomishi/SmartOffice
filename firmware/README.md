# Firmware

Mã nguồn firmware ESP32.

```text
firmware/
└── node-b/                 # M2 — Node B (điều khiển)
    ├── node_b_firmware.ino # sketch chính
    ├── actuator.cpp/.h     # relay, buzzer, servo
    ├── door_sensor.cpp/.h  # công tắc từ
    ├── wifi_mqtt.cpp/.h    # Wi-Fi + MQTT
    └── config.h            # Wi-Fi, broker, deviceId, GPIO
```

## Node B — cấu hình

Sửa `node-b/config.h`:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_HOST     = "192.168.10.205"; // IP LAN của PC
const int   MQTT_PORT     = 1883;
const char* MQTT_USERNAME = "office-ctrl-01";
const char* MQTT_PASSWORD = "mat-khau-trong-deployment-env";
const char* DEVICE_ID     = "office-ctrl-01";
```

- MQTT auth/ACL lấy từ `deployment/.env` (`MQTT_USERS`).
- Nếu chạy broker anonymous cũ thì set user/password rỗng.
- Không commit mật khẩu thật; đây là file cấu hình dev.

## Build / flash

Mở `firmware/node-b/node_b_firmware.ino` bằng Arduino IDE (cài ESP32 board + PubSubClient + ArduinoJson),
hoặc dùng PlatformIO nếu nhóm thêm cấu hình. Chọn đúng board ESP32 và cổng COM.

## Node A (M1)

Firmware Node A chưa nằm trong repo này. Payload/topic theo
[`../docs/Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md`](../docs/Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md).

## Test không cần phần cứng

Simulator Node B: [`../tests/simulator/node_b_simulator.py`](../tests/simulator/node_b_simulator.py).
Mock Node A+B: [`../tests/mqtt/mock_publisher.py`](../tests/mqtt/mock_publisher.py).

Phần cứng/chân GPIO: [`../hardware/README.md`](../hardware/README.md).
