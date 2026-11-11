// Cấu hình Node A (office-env-01) – node cảm biến môi trường.
// File này KHÔNG chứa bí mật; Wi-Fi/MQTT password nằm ở secrets.h (không commit).
#pragma once

#if __has_include("secrets.h")
#include "secrets.h"
#else
#warning "Chua co secrets.h - dang dung secrets.example.h (chi de bien dich thu, khong ket noi duoc)"
#include "secrets.example.h"
#endif

// ---------- Định danh (Contract mục 3) ----------
#define DEVICE_ID        "office-env-01"
#define FW_VERSION       "1.0.0"
#define HW_VERSION       "esp32-devkit-v1/env-a1"
#define MQTT_USERNAME    DEVICE_ID          // ACL Mosquitto dùng %u = username = deviceId
#define MQTT_CLIENT_ID   DEVICE_ID

// ---------- Topic MQTT (Contract mục 4) ----------
#define TOPIC_TELEMETRY  "office/" DEVICE_ID "/telemetry"
#define TOPIC_STATUS     "office/" DEVICE_ID "/status"
#define TOPIC_COMMAND    "office/" DEVICE_ID "/command"
#define TOPIC_ACK        "office/" DEVICE_ID "/ack"
#define TOPIC_CONFIG     "office/" DEVICE_ID "/config"
#define LWT_PAYLOAD      "{\"online\":false}"

// ---------- Chân GPIO (đã kiểm tra trên mạch thật ngày 11/11/2026) ----------
#define PIN_I2C_SDA      21     // AHT20 (0x38) + BH1750 (0x23)
#define PIN_I2C_SCL      22
#define PIN_RADAR_RX     16     // UART2 RX  <- TX của LD2410C
#define PIN_RADAR_TX     17     // UART2 TX  -> RX của LD2410C
#define PIN_MQ135        34     // ADC1_CH6, AO của MQ-135 qua cầu phân áp 20k/10k
#define STATUS_LED_PIN   2      // LED trên board: sáng = MQTT ok, nháy = đang kết nối (-1 để tắt)

#define I2C_ADDR_AHT20   0x38
#define I2C_ADDR_BH1750  0x23
#define RADAR_BAUD       256000

// ---------- Bật/tắt cảm biến mở rộng ----------
#define ENABLE_MQ135     1      // 0 nếu chưa gắn MQ-135 (không gửi airRaw)

// ---------- Chu kỳ & ngưỡng ----------
#define DEFAULT_TELEMETRY_INTERVAL_SEC  5      // Contract mục 4; đổi từ xa qua topic config
#define HEARTBEAT_INTERVAL_SEC          30     // publish status (Contract mục 6)
#define MQ135_WARMUP_SEC                180    // trong thời gian làm nóng, airRaw gắn SUSPECT
#define RADAR_STALE_MS                  3000   // quá lâu không có frame radar -> presence INVALID
#define TEMP_MIN_C                      (-10.0f)
#define TEMP_MAX_C                      60.0f

// ---------- Mạng ----------
#define MQTT_USE_TLS          0       // 1: dùng WiFiClientSecure + MQTT_CA_CERT (cổng 8883)
#define MQTT_KEEPALIVE_SEC    20      // broker gửi LWT sau ~1.5 x keepalive khi mất kết nối đột ngột
#define MQTT_TIMEOUT_MS       5000    // chờ CONNACK / PUBACK (QoS 1); hotspot điện thoại có lúc trễ ~1 s
#define MQTT_BUFFER_SIZE      768
#define WIFI_BACKOFF_MIN_MS   5000    // backoff tăng dần: 5s -> 10s -> 15s (tối đa)
#define WIFI_BACKOFF_MAX_MS   15000
#define MQTT_BACKOFF_MIN_MS   1000    // 1s -> 2s -> 4s -> 8s -> 15s (tối đa), đáp ứng NFR-04 (< 30s)
#define MQTT_BACKOFF_MAX_MS   15000
#define MQTT_AUTH_BACKOFF_MS  30000   // bị broker từ chối (sai mật khẩu / bị thu hồi): thử lại thưa hơn
#define WIFI_POWER_SAVE       1       // node cảm biến: bật modem-sleep để tiết kiệm điện
#define NTP_SERVER_1          "pool.ntp.org"
#define NTP_SERVER_2          "time.google.com"
#define WATCHDOG_TIMEOUT_SEC  30
