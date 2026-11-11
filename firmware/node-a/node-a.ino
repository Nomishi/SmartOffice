/*
 * SmartOffice – Firmware Node A (office-env-01): node cảm biến môi trường.
 *
 *   Cảm biến : AHT20 (nhiệt độ/độ ẩm), BH1750 (ánh sáng), LD2410C (hiện diện), MQ-135 (không khí)
 *   Gửi lên  : office/office-env-01/telemetry (QoS 1, mặc định 5 giây/lần)
 *              office/office-env-01/status    (QoS 1, retained, heartbeat 30 giây, LWT {"online":false})
 *              office/office-env-01/ack       (xác nhận cấu hình)
 *   Nhận về  : office/office-env-01/config    (telemetryIntervalSec, retained)
 *              office/office-env-01/command   (node này không có cơ cấu chấp hành -> trả ACK FAILED)
 *
 * Yêu cầu: Arduino-ESP32 core 3.x, thư viện "MQTT" (256dpi) và "ArduinoJson" 7.x.
 * Trước khi nạp: sao chép secrets.example.h thành secrets.h và điền Wi-Fi + mật khẩu MQTT.
 */
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_task_wdt.h>

#include "config.h"
#include "net_mqtt.h"
#include "sensors.h"

static Preferences prefs;
static uint32_t telemetryIntervalSec = DEFAULT_TELEMETRY_INTERVAL_SEC;
static uint32_t lastTelemetryMs = 0, lastStatusMs = 0, telemetrySeq = 0;
static char jsonBuffer[640];

static double round2(float value) {
  return round((double)value * 100.0) / 100.0;
}

// ---------------------------------------------------------------- status / heartbeat
static void publishStatus() {
  JsonDocument doc;
  doc["online"] = true;
  doc["fwVersion"] = FW_VERSION;
  doc["hwVersion"] = HW_VERSION;
  // Không gửi "mode": chế độ AUTO/MANUAL do backend quản lý, thiết bị gửi lên sẽ ghi đè lựa chọn của người dùng.
  doc["telemetryIntervalSec"] = telemetryIntervalSec;
  doc["uptimeSec"] = millis() / 1000;
  doc["rssi"] = netRssi();
  doc["ip"] = netIp();
  doc["reconnects"] = netConnectCount() > 0 ? netConnectCount() - 1 : 0;
  serializeJson(doc, jsonBuffer, sizeof(jsonBuffer));
  if (netPublish(TOPIC_STATUS, jsonBuffer, true, 1)) {
    Serial.printf("[STATUS] %s\n", jsonBuffer);
  }
  lastStatusMs = millis();
}

// ---------------------------------------------------------------- telemetry
static void publishTelemetry() {
  lastTelemetryMs = millis();

  EnvReading reading;
  sensorsRead(reading);
  Quality overall = reading.overall();

  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["seq"] = ++telemetrySeq;                 // số thứ tự, dùng để đo tỷ lệ mất bản tin
  char timestamp[24];
  if (netTimeIso(timestamp, sizeof(timestamp))) doc["ts"] = timestamp;   // tùy chọn, chỉ khi có NTP

  if (reading.hasClimate) {
    doc["temperature"] = round2(reading.temperature);   // °C
    doc["humidity"] = round2(reading.humidity);         // %RH
  }
  if (reading.hasLux) doc["lux"] = round2(reading.lux); // lux
  if (reading.hasPresence) {
    doc["presence"] = reading.presence;
    doc["distanceCm"] = reading.distanceCm;
    doc["movingEnergy"] = reading.movingEnergy;
    doc["staticEnergy"] = reading.staticEnergy;
  }
  if (reading.hasAir) doc["airRaw"] = reading.airRaw;   // 0..4095

  doc["quality"] = qualityName(overall);
  if (overall != Q_VALID) {                    // chi tiết từng cảm biến khi có vấn đề
    JsonObject detail = doc["qualityDetail"].to<JsonObject>();
    detail["temperature"] = qualityName(reading.qClimate);
    detail["lux"] = qualityName(reading.qLux);
    detail["presence"] = qualityName(reading.qPresence);
#if ENABLE_MQ135
    detail["airRaw"] = qualityName(reading.qAir);
#endif
  }
  doc["rssi"] = netRssi();

  serializeJson(doc, jsonBuffer, sizeof(jsonBuffer));
  bool sent = netPublish(TOPIC_TELEMETRY, jsonBuffer, false, 1);
  Serial.printf("[TELEMETRY]%s %s\n", sent ? "" : " (KHONG GUI - mat ket noi)", jsonBuffer);
}

// ---------------------------------------------------------------- config / command
static void sendConfigAck(const char *configId, bool success, const char *message) {
  JsonDocument ack;
  ack["configId"] = configId;
  ack["status"] = success ? "SUCCESS" : "FAILED";
  if (message) ack["message"] = message;
  serializeJson(ack, jsonBuffer, sizeof(jsonBuffer));
  netPublish(TOPIC_ACK, jsonBuffer, false, 1);
  Serial.printf("[ACK] %s\n", jsonBuffer);
}

static void handleConfig(JsonDocument &doc) {
  const char *configId = doc["configId"] | "";
  if (configId[0] == '\0') {
    Serial.println("[CONFIG] Thieu configId, bo qua");
    return;
  }
  if (!doc["telemetryIntervalSec"].isNull()) {
    long interval = doc["telemetryIntervalSec"].is<long>() ? doc["telemetryIntervalSec"].as<long>() : -1;
    if (interval < 1 || interval > 3600) {
      sendConfigAck(configId, false, "telemetryIntervalSec phai trong khoang 1..3600");
      return;
    }
    if ((uint32_t)interval != telemetryIntervalSec) {
      telemetryIntervalSec = (uint32_t)interval;
      prefs.putUInt("intervalSec", telemetryIntervalSec);   // lưu flash, giữ lại sau khi mất điện
    }
  }
  // servoOpenDeg / servoCloseDeg không áp dụng cho Node A nên được bỏ qua.
  Serial.printf("[CONFIG] %s ap dung: telemetryIntervalSec=%lu\n", configId, (unsigned long)telemetryIntervalSec);
  sendConfigAck(configId, true, nullptr);
  publishStatus();
}

static void handleCommand(JsonDocument &doc, uint32_t receivedAtMs) {
  const char *commandId = doc["commandId"] | "";
  if (commandId[0] == '\0') return;
  JsonDocument ack;
  ack["commandId"] = commandId;
  ack["target"] = doc["target"] | "";
  ack["status"] = "FAILED";
  ack["message"] = "Node A khong co co cau chap hanh";
  ack["latencyMs"] = millis() - receivedAtMs;
  serializeJson(ack, jsonBuffer, sizeof(jsonBuffer));
  netPublish(TOPIC_ACK, jsonBuffer, false, 1);
  Serial.printf("[ACK] %s\n", jsonBuffer);
}

static void onMessage(const String &topic, const String &payload, uint32_t receivedAtMs) {
  Serial.printf("[MQTT] %s <- %s\n", topic.c_str(), payload.c_str());
  if (payload.length() == 0) return;   // retained bị xóa
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload);
  if (error || !doc.is<JsonObject>()) {
    Serial.printf("[MQTT] JSON khong hop le (%s), bo qua\n", error.c_str());
    return;
  }
  if (topic == TOPIC_CONFIG) handleConfig(doc);
  else if (topic == TOPIC_COMMAND) handleCommand(doc, receivedAtMs);
}

// ---------------------------------------------------------------- setup / loop
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\n=== SmartOffice Node A | %s | fw %s ===\n", DEVICE_ID, FW_VERSION);

  prefs.begin("node-a", false);
  telemetryIntervalSec = constrain(prefs.getUInt("intervalSec", DEFAULT_TELEMETRY_INTERVAL_SEC), 1U, 3600U);

  sensorsBegin();
  netBegin(onMessage);

  // Watchdog: nếu loop() bị treo quá lâu thì tự khởi động lại (độ ổn định 24 giờ – NFR-06).
  esp_task_wdt_config_t watchdog = {};
  watchdog.timeout_ms = WATCHDOG_TIMEOUT_SEC * 1000;
  watchdog.trigger_panic = true;
  esp_task_wdt_reconfigure(&watchdog);
  esp_task_wdt_add(NULL);
}

void loop() {
  esp_task_wdt_reset();
  sensorsPoll();
  netLoop();

  uint32_t now = millis();
  if (netTakeJustConnected()) {
    publishStatus();                       // báo online ngay sau khi (tái) kết nối, ghi đè LWT retained
  } else if (netConnected() && now - lastStatusMs >= HEARTBEAT_INTERVAL_SEC * 1000UL) {
    publishStatus();
  }

  if (now - lastTelemetryMs >= telemetryIntervalSec * 1000UL) {
    publishTelemetry();                    // khi mất mạng vẫn đọc và in ra Serial nhưng không gửi
  }
  delay(2);
}
