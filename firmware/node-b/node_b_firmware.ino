#include <WiFi.h>
#include <PubSubClient.h>
#include "config.h"
#include "wifi_mqtt.h"
#include "actuator.h"
#include "door_sensor.h"

WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastTelemetryMillis = 0;
unsigned long lastHeartbeatMillis = 0;
const unsigned long TELEMETRY_INTERVAL = 5000;  // 5 giây gửi telemetry công suất
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 giây gửi heartbeat status

// Hàm trung gian nhận lệnh từ wifi_mqtt gọi sang actuator
void processCommand(String commandId, String target, String action) {
  executeCommand(commandId, target, action, mqttClient);
}

void setup() {
  Serial.begin(115200);

  // Khởi tạo phần cứng Actuator & Cảm biến cửa
  initActuators();
  initDoorSensor();

  // Kết nối mạng & MQTT Broker
  setupWiFi();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT(mqttClient);
  }
  handleMqttLoop(mqttClient);

  unsigned long currentMillis = millis();

  // 1. Gửi Telemetry định kỳ (5s)
  if (currentMillis - lastTelemetryMillis >= TELEMETRY_INTERVAL) {
    lastTelemetryMillis = currentMillis;
    publishTelemetry(mqttClient);
  }

  // 2. Gửi Heartbeat Status định kỳ (30s)
  if (currentMillis - lastHeartbeatMillis >= HEARTBEAT_INTERVAL) {
    lastHeartbeatMillis = currentMillis;
    publishStatus(mqttClient, true);
  }

  // 3. Kiểm tra sự thay đổi của cửa (Độc lập, bật/tắt qua cờ trong config.h)
  handleDoorSensor(mqttClient);
}