/*
 * SmartOffice – Firmware Node B (office-ctrl-01): node điều khiển.
 *
 *   Chấp hành: đèn (light1), quạt (fan1), còi (buzzer1), cửa servo + công tắc từ (door1)
 *   Đo điện  : INA219 #1 (đèn, 0x40) và INA219 #2 (quạt, 0x41)
 *   Nhận về  : office/office-ctrl-01/command  {commandId,target,action,issuedBy}
 *              office/office-ctrl-01/config   {configId,telemetryIntervalSec,servoOpenDeg,servoCloseDeg}
 *   Gửi lên  : office/office-ctrl-01/ack       (xác nhận lệnh / cấu hình, QoS 1)
 *              office/office-ctrl-01/status    (QoS 1, retained, heartbeat 30 giây, LWT {"online":false})
 *              office/office-ctrl-01/telemetry (công suất, QoS 1, mặc định 5 giây/lần)
 *
 * Yêu cầu: Arduino-ESP32 core 3.x, thư viện "MQTT" (256dpi) và "ArduinoJson" 7.x.
 * Trước khi nạp: sao chép secrets.example.h thành secrets.h và điền Wi-Fi + mật khẩu MQTT.
 */
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Wire.h>
#include <esp_task_wdt.h>

#include "config.h"
#include "net_mqtt.h"
#include "actuators.h"
#include "power.h"

// Khi không đọc được INA219: mặc định gắn SUSPECT (không phải INVALID) cho cả bản tin, vì backend sẽ
// chuyển thiết bị sang FAULT sau 3 bản tin INVALID và CHẶN lệnh điều khiển – hỏng bộ đo điện không
// được làm mất khả năng bật/tắt đèn quạt. Chi tiết từng kênh vẫn ghi INVALID trong qualityDetail.
#define INA_FAIL_QUALITY Q_SUSPECT

static Preferences prefs;
static uint32_t telemetryIntervalSec = DEFAULT_TELEMETRY_INTERVAL_SEC;
static int servoOpenDeg = DEFAULT_SERVO_OPEN_DEG, servoCloseDeg = DEFAULT_SERVO_CLOSE_DEG;
static uint32_t lastTelemetryMs = 0, lastStatusMs = 0, telemetrySeq = 0;
static char jsonBuffer[640];

// Lịch sử lệnh đã xử lý: cùng commandId thì không thực thi lại, chỉ gửi lại ACK cũ (Contract mục 6, NFR-05).
struct CommandRecord {
  char commandId[40];
  char ack[220];
};
static CommandRecord commandHistory[COMMAND_HISTORY_SIZE];
static uint8_t commandHistoryNext = 0;

static double round2(float value) {
  return round((double)value * 100.0) / 100.0;
}

// ---------------------------------------------------------------- status / heartbeat
static void publishStatus() {
  JsonDocument doc;
  doc["online"] = true;
  doc["light1"] = lightIsOn() ? "ON" : "OFF";
  doc["fan1"] = fanIsOn() ? "ON" : "OFF";
  doc["buzzer1"] = buzzerIsOn() ? "ON" : "OFF";
  doc["door1"] = doorIsOpen() ? "OPEN" : "CLOSED";
  doc["fwVersion"] = FW_VERSION;
  doc["hwVersion"] = HW_VERSION;
  // Không gửi "mode": chế độ AUTO/MANUAL do backend quản lý, thiết bị gửi lên sẽ ghi đè lựa chọn của người dùng.
  doc["telemetryIntervalSec"] = telemetryIntervalSec;
  doc["servoOpenDeg"] = servoOpenDeg;
  doc["servoCloseDeg"] = servoCloseDeg;
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

// ---------------------------------------------------------------- telemetry công suất
static void publishTelemetry() {
  lastTelemetryMs = millis();

  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["seq"] = ++telemetrySeq;                 // số thứ tự, dùng để đo tỷ lệ mất bản tin
  char timestamp[24];
  if (netTimeIso(timestamp, sizeof(timestamp))) doc["ts"] = timestamp;

#if ENABLE_INA219
  PowerReading power;
  powerRead(power);

  // Kênh không đọc được thì gửi null (không bịa số); backend lưu null.
  // busVoltageV: điện áp bus lớn hơn trong hai kênh đọc được (kênh đang tắt tải có thể đọc ~0 V).
  if (power.light.ok && power.fan.ok) doc["busVoltageV"] = round2(max(power.light.busVoltageV, power.fan.busVoltageV));
  else if (power.light.ok) doc["busVoltageV"] = round2(power.light.busVoltageV);
  else if (power.fan.ok) doc["busVoltageV"] = round2(power.fan.busVoltageV);
  else doc["busVoltageV"] = nullptr;

  if (power.light.ok) {
    doc["light1PowerW"] = round2(power.light.powerW);            // W
    doc["light1CurrentMa"] = (int)lroundf(power.light.currentMa); // mA
  } else {
    doc["light1PowerW"] = nullptr;
    doc["light1CurrentMa"] = nullptr;
  }
  if (power.fan.ok) {
    doc["fan1PowerW"] = round2(power.fan.powerW);
    doc["fan1CurrentMa"] = (int)lroundf(power.fan.currentMa);
  } else {
    doc["fan1PowerW"] = nullptr;
    doc["fan1CurrentMa"] = nullptr;
  }

  Quality overall = max(power.light.quality, power.fan.quality);
  if (overall == Q_INVALID) overall = INA_FAIL_QUALITY;
  doc["quality"] = qualityName(overall);
  if (overall != Q_VALID) {
    JsonObject detail = doc["qualityDetail"].to<JsonObject>();
    detail["light1"] = qualityName(power.light.quality);
    detail["fan1"] = qualityName(power.fan.quality);
  }
#else
  // Chưa gắn INA219: không gửi số công suất giả. Contract 5.1b cho phép quality mặc định VALID.
  doc["busVoltageV"] = nullptr;
  doc["quality"] = "VALID";
#endif
  doc["rssi"] = netRssi();

  serializeJson(doc, jsonBuffer, sizeof(jsonBuffer));
  bool sent = netPublish(TOPIC_TELEMETRY, jsonBuffer, false, 1);
  Serial.printf("[TELEMETRY]%s %s\n", sent ? "" : " (KHONG GUI - mat ket noi)", jsonBuffer);
}

// ---------------------------------------------------------------- command + ACK
static CommandRecord *findCommand(const char *commandId) {
  for (uint8_t i = 0; i < COMMAND_HISTORY_SIZE; i++) {
    if (commandHistory[i].commandId[0] && strcmp(commandHistory[i].commandId, commandId) == 0) return &commandHistory[i];
  }
  return nullptr;
}

// Thực thi lệnh ON/OFF cho một đầu ra. Trả false nếu action không hợp lệ.
static bool applyOnOff(const char *action, void (*setter)(bool)) {
  if (strcmp(action, "ON") == 0) { setter(true); return true; }
  if (strcmp(action, "OFF") == 0) { setter(false); return true; }
  return false;
}

static void handleCommand(JsonDocument &doc, uint32_t receivedAtMs) {
  const char *commandId = doc["commandId"] | "";
  const char *target = doc["target"] | "";
  const char *action = doc["action"] | "";
  const char *issuedBy = doc["issuedBy"] | "?";
  if (commandId[0] == '\0') {
    Serial.println("[CMD] Thieu commandId, khong the ACK -> bo qua");
    return;
  }

  // Lệnh trùng (backend retry hoặc QoS 1 gửi lặp): KHÔNG thực thi lại, gửi lại đúng ACK cũ.
  if (CommandRecord *previous = findCommand(commandId)) {
    netPublish(TOPIC_ACK, previous->ack, false, 1);
    Serial.printf("[CMD] %s bi trung -> gui lai ACK cu, khong thuc thi lai\n", commandId);
    return;
  }

  bool success = false;
  const char *state = nullptr;
  const char *message = nullptr;

  if (strlen(commandId) >= sizeof(commandHistory[0].commandId)) {
    message = "commandId qua dai";
  } else if (strcmp(target, "light1") == 0) {
    success = applyOnOff(action, setLight);
    state = lightIsOn() ? "ON" : "OFF";
  } else if (strcmp(target, "fan1") == 0) {
    success = applyOnOff(action, setFan);
    state = fanIsOn() ? "ON" : "OFF";
  } else if (strcmp(target, "buzzer1") == 0) {
    success = applyOnOff(action, setBuzzer);
    state = buzzerIsOn() ? "ON" : "OFF";
  } else if (strcmp(target, "door1") == 0) {
    bool open = strcmp(action, "OPEN") == 0;
    if (open || strcmp(action, "CLOSE") == 0) {
      // Servo quay xong thì đọc công tắc từ; không khớp với lệnh -> FAILED (Contract mục 5.3).
      success = doorMove(open);
      if (!success) message = "Cong tac tu khong xac nhan trang thai cua";
    }
    state = doorIsOpen() ? "OPEN" : "CLOSED";
  } else {
    message = "target khong hop le";
  }
  if (!success && !message) message = "action khong hop le";

  JsonDocument ack;
  ack["commandId"] = commandId;
  ack["target"] = target;
  ack["status"] = success ? "SUCCESS" : "FAILED";
  if (state) ack["state"] = state;
  ack["latencyMs"] = millis() - receivedAtMs;      // từ lúc nhận lệnh đến lúc thực thi xong
  if (message) ack["message"] = message;

  CommandRecord &record = commandHistory[commandHistoryNext];
  commandHistoryNext = (commandHistoryNext + 1) % COMMAND_HISTORY_SIZE;
  strlcpy(record.commandId, commandId, sizeof(record.commandId));
  serializeJson(ack, record.ack, sizeof(record.ack));

  netPublish(TOPIC_ACK, record.ack, false, 1);
  Serial.printf("[CMD] %s %s %s boi %s -> %s\n", commandId, target, action, issuedBy, record.ack);
  publishStatus();                                  // cập nhật trạng thái thật ngay sau lệnh
}

// ---------------------------------------------------------------- config + ACK
static void sendConfigAck(const char *configId, bool success, const char *message) {
  JsonDocument ack;
  ack["configId"] = configId;
  ack["status"] = success ? "SUCCESS" : "FAILED";
  if (message) ack["message"] = message;
  serializeJson(ack, jsonBuffer, sizeof(jsonBuffer));
  netPublish(TOPIC_ACK, jsonBuffer, false, 1);
  Serial.printf("[ACK] %s\n", jsonBuffer);
}

// Đọc một trường số nguyên tùy chọn. Trả false nếu có mặt nhưng sai kiểu hoặc ngoài dải.
static bool readIntField(JsonDocument &doc, const char *key, long minValue, long maxValue, long &value) {
  if (doc[key].isNull()) return true;               // không có -> giữ giá trị hiện tại
  if (!doc[key].is<long>()) return false;
  long parsed = doc[key].as<long>();
  if (parsed < minValue || parsed > maxValue) return false;
  value = parsed;
  return true;
}

static void handleConfig(JsonDocument &doc) {
  const char *configId = doc["configId"] | "";
  if (configId[0] == '\0') {
    Serial.println("[CONFIG] Thieu configId, bo qua");
    return;
  }
  long interval = telemetryIntervalSec, openDeg = servoOpenDeg, closeDeg = servoCloseDeg;
  if (!readIntField(doc, "telemetryIntervalSec", 1, 3600, interval)) {
    sendConfigAck(configId, false, "telemetryIntervalSec phai trong khoang 1..3600");
    return;
  }
  if (!readIntField(doc, "servoOpenDeg", 0, 180, openDeg) || !readIntField(doc, "servoCloseDeg", 0, 180, closeDeg)) {
    sendConfigAck(configId, false, "Goc servo phai trong khoang 0..180");
    return;
  }

  // Hợp lệ toàn bộ rồi mới áp dụng và lưu flash (giữ lại sau khi mất điện).
  if ((uint32_t)interval != telemetryIntervalSec) {
    telemetryIntervalSec = (uint32_t)interval;
    prefs.putUInt("intervalSec", telemetryIntervalSec);
  }
  if (openDeg != servoOpenDeg || closeDeg != servoCloseDeg) {
    servoOpenDeg = (int)openDeg;
    servoCloseDeg = (int)closeDeg;
    prefs.putInt("openDeg", servoOpenDeg);
    prefs.putInt("closeDeg", servoCloseDeg);
    setServoAngles(servoOpenDeg, servoCloseDeg);
  }
  Serial.printf("[CONFIG] %s ap dung: interval=%lus open=%d close=%d\n",
                configId, (unsigned long)telemetryIntervalSec, servoOpenDeg, servoCloseDeg);
  sendConfigAck(configId, true, nullptr);
  publishStatus();
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
  if (topic == TOPIC_COMMAND) handleCommand(doc, receivedAtMs);
  else if (topic == TOPIC_CONFIG) handleConfig(doc);
}

// ---------------------------------------------------------------- lệnh thử qua Serial (chẩn đoán tại chỗ)
// Gõ vào Serial Monitor, ví dụ: "fan1 ON", "door1 OPEN", "buzzer1 OFF", hoặc "t" để đo điện ngay.
// Lệnh đi qua đúng hàm handleCommand() như lệnh MQTT nên kiểm tra được phần cứng khi chưa có mạng.
#if ENABLE_SERIAL_CONSOLE
static void serialConsoleLoop() {
  static String line;
  static uint32_t localSeq = 0;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c != '\n' && c != '\r') {
      if (line.length() < 40) line += c;
      continue;
    }
    line.trim();
    if (line.length() == 0) continue;
    if (line == "t") {
      publishTelemetry();
    } else {
      int space = line.indexOf(' ');
      String target = space > 0 ? line.substring(0, space) : line;
      String action = space > 0 ? line.substring(space + 1) : "";
      action.trim();
      action.toUpperCase();
      char commandId[24];
      snprintf(commandId, sizeof(commandId), "LOCAL-%04lu", (unsigned long)++localSeq);
      JsonDocument doc;
      doc["commandId"] = commandId;
      doc["target"] = target;
      doc["action"] = action;
      doc["issuedBy"] = "serial";
      handleCommand(doc, millis());
    }
    line = "";
  }
}
#endif

// ---------------------------------------------------------------- setup / loop
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\n=== SmartOffice Node B | %s | fw %s ===\n", DEVICE_ID, FW_VERSION);

  prefs.begin("node-b", false);
  telemetryIntervalSec = constrain(prefs.getUInt("intervalSec", DEFAULT_TELEMETRY_INTERVAL_SEC), 1U, 3600U);
  servoOpenDeg = constrain(prefs.getInt("openDeg", DEFAULT_SERVO_OPEN_DEG), 0, 180);
  servoCloseDeg = constrain(prefs.getInt("closeDeg", DEFAULT_SERVO_CLOSE_DEG), 0, 180);

  actuatorsBegin(servoOpenDeg, servoCloseDeg);      // đèn/quạt/còi OFF, servo về vị trí đóng

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);
  Wire.setTimeOut(50);
  powerBegin();

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
  actuatorsLoop();
  netLoop();
#if ENABLE_SERIAL_CONSOLE
  serialConsoleLoop();
#endif

  uint32_t now = millis();
  bool stateChanged = actuatorsTakeChanged();      // cửa mở/đóng bằng tay, còi tự tắt
  if (netTakeJustConnected() || stateChanged) {
    publishStatus();                               // báo online ngay sau khi (tái) kết nối, ghi đè LWT retained
  } else if (netConnected() && now - lastStatusMs >= HEARTBEAT_INTERVAL_SEC * 1000UL) {
    publishStatus();
  }

  if (now - lastTelemetryMs >= telemetryIntervalSec * 1000UL) {
    publishTelemetry();
  }
  delay(2);
}
