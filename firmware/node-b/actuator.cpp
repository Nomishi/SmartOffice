#include "actuator.h"
#include "config.h"
#include <ArduinoJson.h>

String light1State = "OFF";
String fan1State   = "OFF";
String door1State  = "CLOSED";

void initActuators() {
  pinMode(PIN_RELAY_LIGHT, OUTPUT);
  pinMode(PIN_RELAY_FAN, OUTPUT);
  digitalWrite(PIN_RELAY_LIGHT, RELAY_OFF);
  digitalWrite(PIN_RELAY_FAN, RELAY_OFF);
}

void sendAck(String commandId, String target, String status, String state, PubSubClient& client) {
  StaticJsonDocument<256> ackDoc;
  ackDoc["commandId"] = commandId;
  ackDoc["target"]    = target;
  ackDoc["status"]    = status; // SUCCESS / FAILED
  ackDoc["state"]     = state;  // ON / OFF / OPEN / CLOSED
  ackDoc["latencyMs"] = 150;

  char buffer[256];
  serializeJson(ackDoc, buffer);
  client.publish(TOPIC_ACK, buffer, 1);
  
  Serial.print("[ACK SENT] ");
  Serial.println(buffer);
}

void executeCommand(String commandId, String target, String action, PubSubClient& client) {
  bool success = false;
  String currentState = "OFF";

  if (target == "light1") {
    if (action == "ON") {
      digitalWrite(PIN_RELAY_LIGHT, RELAY_ON);
      light1State = "ON";
      success = true;
    } else if (action == "OFF") {
      digitalWrite(PIN_RELAY_LIGHT, RELAY_OFF);
      light1State = "OFF";
      success = true;
    }
    currentState = light1State;
  } 
  else if (target == "fan1") {
    if (action == "ON") {
      digitalWrite(PIN_RELAY_FAN, RELAY_ON);
      fan1State = "ON";
      success = true;
    } else if (action == "OFF") {
      digitalWrite(PIN_RELAY_FAN, RELAY_OFF);
      fan1State = "OFF";
      success = true;
    }
    currentState = fan1State;
  }
  else if (target == "door1") {
    if (action == "OPEN") {
      door1State = "OPEN";
      success = true;
    } else if (action == "CLOSE") {
      door1State = "CLOSED";
      success = true;
    }
    currentState = door1State;
  }

  if (success) {
    sendAck(commandId, target, "SUCCESS", currentState, client);
    publishStatus(client, true);
  } else {
    sendAck(commandId, target, "FAILED", currentState, client);
  }
}

void publishStatus(PubSubClient& client, bool online) {
  StaticJsonDocument<256> statusDoc;
  statusDoc["online"]    = online;
  statusDoc["light1"]    = light1State;
  statusDoc["fan1"]      = fan1State;
  statusDoc["buzzer1"]   = "OFF";
  statusDoc["door1"]     = door1State;
  statusDoc["mode"]      = "AUTO";
  statusDoc["fwVersion"] = "1.0.0";

  char buffer[256];
  serializeJson(statusDoc, buffer);
  client.publish(TOPIC_STATUS, buffer, 1, true); // Retained = true
}

void publishTelemetry(PubSubClient& client) {
  StaticJsonDocument<256> telDoc;
  telDoc["deviceId"]        = DEVICE_ID;
  telDoc["busVoltageV"]     = 12.1;
  telDoc["light1PowerW"]    = (light1State == "ON") ? 4.8 : 0.0;
  telDoc["light1CurrentMa"] = (light1State == "ON") ? 397 : 0;
  telDoc["fan1PowerW"]      = (fan1State == "ON") ? 2.1 : 0.0;
  telDoc["fan1CurrentMa"]   = (fan1State == "ON") ? 173 : 0;
  telDoc["quality"]         = "VALID";
  telDoc["rssi"]            = -61;

  char buffer[256];
  serializeJson(telDoc, buffer);
  client.publish(TOPIC_TELEMETRY, buffer, 1);
}