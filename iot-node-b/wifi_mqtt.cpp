#include "wifi_mqtt.h"
#include "config.h"
#include "actuator.h"
#include <WiFi.h>
#include <ArduinoJson.h>

// Hàm callback xử lý khi nhận lệnh từ Backend (M3)
extern void processCommand(String commandId, String target, String action);

void setupWiFi() {
  delay(10);
  Serial.println();
  Serial.print("[WIFI] Đang kết nối tới: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WIFI] Đã kết nối! IP: " + WiFi.localIP().toString());
}

// Hàm nhận tin nhắn MQTT đến từ Broker
void internalMqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("[MQTT RX] Topic: ");
  Serial.print(topic);
  Serial.print(" | Payload: ");
  Serial.println(message);

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (error) {
    Serial.print("[ERROR] Parse JSON thất bại: ");
    Serial.println(error.c_str());
    return;
  }

  String commandId = doc["commandId"] | "";
  String target    = doc["target"]    | "";
  String action    = doc["action"]    | "";

  if (commandId != "") {
    processCommand(commandId, target, action);
  }
}

void reconnectMQTT(PubSubClient& client) {
  client.setCallback(internalMqttCallback);
  
  while (!client.connected()) {
    Serial.print("[MQTT] Đang kết nối Broker...");
    
    // Bản tin LWT (Last Will & Testament): Tự động báo offline nếu ESP32 mất nguồn đột ngột[cite: 4]
    StaticJsonDocument<150> lwtDoc;
    lwtDoc["online"] = false;
    char lwtBuffer[150];
    serializeJson(lwtDoc, lwtBuffer);

    if (client.connect(DEVICE_ID, TOPIC_STATUS, 1, true, lwtBuffer)) {
      Serial.println(" Thành công!");
      client.subscribe(TOPIC_COMMAND, 1);
    } else {
      Serial.print(" Thất bại, rc=");
      Serial.print(client.state());
      Serial.println(" Thử lại sau 5 giây...");
      delay(5000);
    }
  }
}

void handleMqttLoop(PubSubClient& client) {
  client.loop();
}