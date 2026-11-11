// MẪU cấu hình bí mật. Sao chép file này thành "secrets.h" (cùng thư mục) rồi điền giá trị thật.
// secrets.h đã nằm trong .gitignore – KHÔNG commit mật khẩu thật lên GitHub.
#pragma once

// Wi-Fi 2.4 GHz (ESP32 không hỗ trợ 5 GHz)
#define WIFI_SSID      "YOUR_WIFI_SSID"
#define WIFI_PASSWORD  "YOUR_WIFI_PASSWORD"

// MQTT broker: IP LAN của máy chạy docker compose (không dùng "localhost")
#define MQTT_HOST      "192.168.1.100"
#define MQTT_PORT      1883

// Mật khẩu MQTT RIÊNG của thiết bị này (khớp MQTT_USERS trong deployment/.env).
// Username chính là DEVICE_ID trong config.h, mỗi thiết bị một tài khoản riêng.
#define MQTT_PASSWORD  "doi-mat-khau-ctrl01"

// Chỉ cần khi bật MQTT_USE_TLS = 1 trong config.h: chứng chỉ CA của broker (PEM).
// #define MQTT_CA_CERT "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
