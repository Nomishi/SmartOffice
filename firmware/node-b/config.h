// Cấu hình Node B (office-ctrl-01) – node điều khiển: đèn, quạt, cửa (servo), còi, đo điện.
// File này KHÔNG chứa bí mật; Wi-Fi/MQTT password nằm ở secrets.h (không commit).
#pragma once

#if __has_include("secrets.h")
#include "secrets.h"
#else
#warning "Chua co secrets.h - dang dung secrets.example.h (chi de bien dich thu, khong ket noi duoc)"
#include "secrets.example.h"
#endif

// ---------- Định danh (Contract mục 3) ----------
#define DEVICE_ID        "office-ctrl-01"
#define FW_VERSION       "1.0.0"
#define HW_VERSION       "esp32-devkit-v1/ctrl-b1"
#define MQTT_USERNAME    DEVICE_ID          // ACL Mosquitto dùng %u = username = deviceId
#define MQTT_CLIENT_ID   DEVICE_ID

// ---------- Topic MQTT (Contract mục 4) ----------
#define TOPIC_TELEMETRY  "office/" DEVICE_ID "/telemetry"
#define TOPIC_STATUS     "office/" DEVICE_ID "/status"
#define TOPIC_COMMAND    "office/" DEVICE_ID "/command"
#define TOPIC_ACK        "office/" DEVICE_ID "/ack"
#define TOPIC_CONFIG     "office/" DEVICE_ID "/config"
#define LWT_PAYLOAD      "{\"online\":false}"

// ---------- Chân GPIO: THEO MẠCH THẬT đã test ngày 11/11/2026 ----------
// Lưu ý: I2C của Node B đi chân 5/19 (không phải 21/22 như bản thiết kế ban đầu).
#define PIN_I2C_SDA      5      // 2 module INA219: 0x40 (quạt) và 0x41 (đèn)
#define PIN_I2C_SCL      19
#define PIN_SERVO        18     // SG90 – cửa mô hình (door1)
#define PIN_BUZZER       23     // còi (buzzer1)
#define PIN_FAN          26     // relay 1 kênh -> quạt mini (fan1)
#define PIN_LIGHT        27     // LED 5 mm (light1)
#define PIN_DOOR_SENSOR  25     // công tắc từ (reed switch), INPUT_PULLUP: LOW = có nam châm = cửa ĐÓNG
#define STATUS_LED_PIN   2      // LED trên board: sáng = MQTT ok, nháy = đang kết nối (-1 để tắt)

// Mức kích: relay 1 kênh (quạt) đặt jumper H, quạt nối COM–NO -> GPIO26 = HIGH là quạt BẬT.
// Đèn là LED 5 mm nối thẳng GPIO27 (qua INA219 0x41) -> HIGH là sáng.
#define FAN_ON_LEVEL     HIGH
#define LIGHT_ON_LEVEL   HIGH

// Theo mạch thật: dòng quạt đi qua INA219 0x40, dòng đèn đi qua INA219 0x41 (ngược với Contract 5.1b).
#define I2C_ADDR_INA_LIGHT  0x41
#define I2C_ADDR_INA_FAN    0x40
#define INA_SHUNT_OHM       0.1f    // điện trở shunt R100 trên module INA219

// ---------- Tùy chọn phần cứng ----------
#define ENABLE_DOOR_SENSOR  1       // 0: không có công tắc từ, tin theo lệnh servo
#define ENABLE_INA219       1       // 0: chưa gắn INA219, không gửi các trường công suất
#define ENABLE_SERIAL_CONSOLE 1     // 1: cho phép gõ lệnh thử qua cổng USB ("fan1 ON", "door1 OPEN", "t")
#define BUZZER_PASSIVE      1      // 1: còi thụ động (phát tone PWM); 0: còi chủ động (HIGH = kêu)
#define BUZZER_FREQ_HZ      2000
#define BUZZER_BEEP_MS      400     // còi kêu ngắt quãng: 400 ms kêu / 400 ms nghỉ
#define BUZZER_MAX_ON_SEC   120     // tự tắt còi sau N giây để tránh kêu mãi (0 = không tự tắt)

// ---------- Servo ----------
#define SERVO_CHANNEL        0      // LEDC kênh 0 (timer 0)
#define BUZZER_CHANNEL       2      // LEDC kênh 2 (timer 1) – khác timer với servo
#define SERVO_FREQ_HZ        50
#define SERVO_RESOLUTION     14
#define SERVO_MIN_US         500
#define SERVO_MAX_US         2400
#define DEFAULT_SERVO_OPEN_DEG   90   // đổi từ xa qua topic config
#define DEFAULT_SERVO_CLOSE_DEG  0
#define SERVO_MOVE_MS            700  // thời gian chờ servo quay tới vị trí
#define DOOR_CONFIRM_TIMEOUT_MS  2500 // chờ công tắc từ xác nhận sau khi servo quay (NFR-02: door < 5 s)
#define DOOR_DEBOUNCE_MS         50

// ---------- Chu kỳ ----------
#define DEFAULT_TELEMETRY_INTERVAL_SEC  5
#define HEARTBEAT_INTERVAL_SEC          30
#define COMMAND_HISTORY_SIZE            16   // số commandId gần nhất được nhớ để chống thực thi lặp

// ---------- Mạng ----------
#define MQTT_USE_TLS          0       // 1: dùng WiFiClientSecure + MQTT_CA_CERT (cổng 8883)
#define MQTT_KEEPALIVE_SEC    20
#define MQTT_TIMEOUT_MS       5000
#define MQTT_BUFFER_SIZE      768
#define WIFI_BACKOFF_MIN_MS   5000
#define WIFI_BACKOFF_MAX_MS   15000
#define MQTT_BACKOFF_MIN_MS   1000
#define MQTT_BACKOFF_MAX_MS   15000
#define MQTT_AUTH_BACKOFF_MS  30000
#define WIFI_POWER_SAVE       0       // node điều khiển: tắt modem-sleep để lệnh -> ACK nhanh (NFR-02 < 1 s)
#define NTP_SERVER_1          "pool.ntp.org"
#define NTP_SERVER_2          "time.google.com"
#define WATCHDOG_TIMEOUT_SEC  30
