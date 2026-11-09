#ifndef CONFIG_H
#define CONFIG_H

// Cờ bật/tắt module cửa (Reed Switch). Đặt thành false nếu nhóm quyết định bỏ qua tính năng cửa.
#define ENABLE_DOOR_SENSOR true

// Thông tin mạng Wi-Fi
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Thông tin MQTT Broker (Theo tài liệu test M1/M2, port host là 1884 hoặc 1883)
const char* MQTT_HOST     = "192.168.1.100"; 
const int   MQTT_PORT     = 1884;

// Định danh thiết bị chuẩn theo Contract nhóm
const char* DEVICE_ID     = "office-ctrl-01";

// MQTT Topics chuẩn
const char* TOPIC_COMMAND   = "office/office-ctrl-01/command";
const char* TOPIC_ACK       = "office/office-ctrl-01/ack";
const char* TOPIC_STATUS    = "office/office-ctrl-01/status";
const char* TOPIC_TELEMETRY = "office/office-ctrl-01/telemetry";

// Định nghĩa chân GPIO phần cứng trên ESP32
const int PIN_RELAY_LIGHT = 18; // Relay Đèn (light1)
const int PIN_RELAY_FAN   = 19; // Relay Quạt DC (fan1)
const int PIN_REED_SWITCH = 21; // Cảm biến từ cửa (door1)

// Cấu hình mức kích hoạt Relay (Active HIGH hoặc LOW)
const int RELAY_ON  = HIGH;
const int RELAY_OFF = LOW;

#endif