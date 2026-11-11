// Wi-Fi + MQTT cho ESP32 (thư viện "MQTT" của Joel Gaehwiler / 256dpi – hỗ trợ publish QoS 1).
// File này giống hệt nhau ở firmware/node-a và firmware/node-b.
#include "net_mqtt.h"
#include "config.h"

#include <WiFi.h>
#include <MQTT.h>
#include <time.h>

#if MQTT_USE_TLS
#include <WiFiClientSecure.h>
static WiFiClientSecure netClient;
#else
static WiFiClient netClient;
#endif

static MQTTClient mqtt(MQTT_BUFFER_SIZE);
static NetMessageHandler messageHandler = nullptr;

// ---- Hàng đợi bản tin đến ----
// Thư viện không cho publish bên trong callback, nên callback chỉ xếp hàng; netLoop() xử lý sau.
static const uint8_t INBOX_SIZE = 6;
struct InMessage {
  String topic;
  String payload;
  uint32_t receivedAtMs;
};
static InMessage inbox[INBOX_SIZE];
static uint8_t inboxHead = 0, inboxCount = 0;

// ---- Trạng thái kết nối ----
static bool wifiUp = false;
static bool mqttUp = false;
static bool justConnected = false;
static bool ntpStarted = false;
static uint32_t nextWifiTryMs = 0, wifiBackoffMs = WIFI_BACKOFF_MIN_MS;
static uint32_t nextMqttTryMs = 0, mqttBackoffMs = MQTT_BACKOFF_MIN_MS;
static uint32_t connectCount = 0, droppedCount = 0, publishFailCount = 0;

static bool due(uint32_t now, uint32_t deadline) {
  return (int32_t)(now - deadline) >= 0;  // an toàn khi millis() tràn
}

static void onMqttMessage(String &topic, String &payload) {
  if (inboxCount >= INBOX_SIZE) {
    Serial.println("[NET] Hang doi ban tin day, bo 1 ban tin");
    return;
  }
  InMessage &slot = inbox[(inboxHead + inboxCount) % INBOX_SIZE];
  slot.topic = topic;
  slot.payload = payload;
  slot.receivedAtMs = millis();
  inboxCount++;
}

static void updateLed(uint32_t now) {
#if STATUS_LED_PIN >= 0
  bool on;
  if (mqttUp) on = true;                       // sáng đứng: đã kết nối broker
  else if (wifiUp) on = (now / 500) % 2;       // nháy chậm: có Wi-Fi, chưa có MQTT
  else on = (now / 120) % 2;                   // nháy nhanh: mất Wi-Fi
  digitalWrite(STATUS_LED_PIN, on ? HIGH : LOW);
#endif
}

static void tryMqttConnect(uint32_t now) {
  Serial.printf("[NET] Ket noi MQTT %s:%d voi user %s ...\n", MQTT_HOST, MQTT_PORT, MQTT_USERNAME);
  // LWT: broker tự phát {"online":false} (retained) khi thiết bị mất kết nối đột ngột.
  mqtt.setWill(TOPIC_STATUS, LWT_PAYLOAD, true, 1);

  if (mqtt.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
    mqtt.subscribe(TOPIC_COMMAND, 1);
    mqtt.subscribe(TOPIC_CONFIG, 1);
    mqttUp = true;
    justConnected = true;
    connectCount++;
    mqttBackoffMs = MQTT_BACKOFF_MIN_MS;
    Serial.printf("[NET] MQTT da ket noi (lan thu %lu)\n", (unsigned long)connectCount);
    return;
  }

  int returnCode = (int)mqtt.returnCode();
  if (returnCode == 4 || returnCode == 5) {
    // 4 = sai username/password, 5 = không được phép: thiết bị bị khóa/thu hồi credential.
    Serial.printf("[NET] Broker TU CHOI dang nhap (ma %d): sai mat khau hoac thiet bi da bi thu hoi. Thu lai sau %d s\n",
                  returnCode, MQTT_AUTH_BACKOFF_MS / 1000);
    nextMqttTryMs = now + MQTT_AUTH_BACKOFF_MS;
    return;
  }
  Serial.printf("[NET] MQTT that bai (loi %d, ma %d). Thu lai sau %lu ms\n",
                (int)mqtt.lastError(), returnCode, (unsigned long)mqttBackoffMs);
  nextMqttTryMs = now + mqttBackoffMs;
  mqttBackoffMs = min<uint32_t>(mqttBackoffMs * 2, MQTT_BACKOFF_MAX_MS);
}

void netBegin(NetMessageHandler handler) {
  messageHandler = handler;
#if STATUS_LED_PIN >= 0
  pinMode(STATUS_LED_PIN, OUTPUT);
#endif

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);   // tự quản lý kết nối lại để có backoff rõ ràng
  WiFi.setSleep(WIFI_POWER_SAVE ? true : false);
  WiFi.setHostname(DEVICE_ID);

#if MQTT_USE_TLS
  netClient.setCACert(MQTT_CA_CERT);
#endif
  mqtt.begin(MQTT_HOST, MQTT_PORT, netClient);
  mqtt.setKeepAlive(MQTT_KEEPALIVE_SEC);
  mqtt.setCleanSession(true);
  mqtt.setTimeout(MQTT_TIMEOUT_MS);
  mqtt.onMessage(onMqttMessage);

  nextWifiTryMs = millis();
}

void netLoop() {
  uint32_t now = millis();
  updateLed(now);

  // ---------- Wi-Fi ----------
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiUp) {
      wifiUp = false;
      mqttUp = false;
      wifiBackoffMs = WIFI_BACKOFF_MIN_MS;
      nextWifiTryMs = now;
      Serial.println("[NET] Mat ket noi Wi-Fi");
    }
    if (due(now, nextWifiTryMs)) {
      Serial.printf("[NET] Ket noi Wi-Fi \"%s\" (thu lai sau %lu ms neu chua duoc)\n",
                    WIFI_SSID, (unsigned long)wifiBackoffMs);
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      nextWifiTryMs = now + wifiBackoffMs;
      wifiBackoffMs = min<uint32_t>(wifiBackoffMs * 2, WIFI_BACKOFF_MAX_MS);
    }
    return;
  }
  if (!wifiUp) {
    wifiUp = true;
    wifiBackoffMs = WIFI_BACKOFF_MIN_MS;
    mqttBackoffMs = MQTT_BACKOFF_MIN_MS;
    nextMqttTryMs = now;
    Serial.printf("[NET] Wi-Fi OK, IP %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    if (!ntpStarted) {
      configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);  // UTC, đồng bộ nền
      ntpStarted = true;
    }
  }

  // ---------- MQTT ----------
  if (!mqtt.connected()) {
    if (mqttUp) {
      mqttUp = false;
      mqttBackoffMs = MQTT_BACKOFF_MIN_MS;
      nextMqttTryMs = now + MQTT_BACKOFF_MIN_MS;
      Serial.printf("[NET] Mat ket noi MQTT (loi %d)\n", (int)mqtt.lastError());
    }
    if (due(now, nextMqttTryMs)) tryMqttConnect(now);
    return;
  }

  mqtt.loop();

  // Xử lý bản tin đã xếp hàng (ngoài callback nên handler được phép publish ACK).
  while (inboxCount > 0) {
    InMessage message = inbox[inboxHead];
    inbox[inboxHead].topic = "";
    inbox[inboxHead].payload = "";
    inboxHead = (inboxHead + 1) % INBOX_SIZE;
    inboxCount--;
    if (messageHandler) messageHandler(message.topic, message.payload, message.receivedAtMs);
  }
}

bool netConnected() {
  return mqttUp && mqtt.connected();
}

bool netTakeJustConnected() {
  if (!justConnected) return false;
  justConnected = false;
  return true;
}

bool netPublish(const char *topic, const char *payload, bool retained, int qos) {
  if (!netConnected()) {
    droppedCount++;   // không lưu lại để gửi bù: dữ liệu cũ gửi muộn sẽ làm sai rule/automation
    return false;
  }
  if (!mqtt.publish(topic, payload, retained, qos)) {
    publishFailCount++;
    Serial.printf("[NET] Publish that bai [%s] (loi %d)\n", topic, (int)mqtt.lastError());
    return false;
  }
  return true;
}

int netRssi() {
  return WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
}

String netIp() {
  return WiFi.localIP().toString();
}

bool netTimeIso(char *buf, size_t len) {
  time_t now = time(nullptr);
  if (now < 1700000000) return false;   // chưa đồng bộ NTP
  struct tm utc;
  gmtime_r(&now, &utc);
  return strftime(buf, len, "%Y-%m-%dT%H:%M:%SZ", &utc) > 0;
}

uint32_t netConnectCount() { return connectCount; }
uint32_t netDroppedCount() { return droppedCount; }
uint32_t netPublishFailCount() { return publishFailCount; }
