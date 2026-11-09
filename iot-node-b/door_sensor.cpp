#include "door_sensor.h"
#include "config.h"
#include "actuator.h"

int lastDoorReading = -1;

void initDoorSensor() {
#if ENABLE_DOOR_SENSOR
  pinMode(PIN_REED_SWITCH, INPUT_PULLUP);
  Serial.println("[DOOR MODULE] Đã khởi tạo Reed Switch tại GPIO " + String(PIN_REED_SWITCH));
#endif
}

void handleDoorSensor(PubSubClient& client) {
#if ENABLE_DOOR_SENSOR
  int reading = digitalRead(PIN_REED_SWITCH);
  if (reading != lastDoorReading) {
    delay(30); // Chống dội tín hiệu (Debounce)
    reading = digitalRead(PIN_REED_SWITCH);
    if (reading != lastDoorReading) {
      lastDoorReading = reading;
      door1State = (reading == LOW) ? "CLOSED" : "OPEN";
      
      Serial.print("[DOOR MODULE] Trạng thái cửa thay đổi: ");
      Serial.println(door1State);

      // Cập nhật lại status kèm trạng thái cửa mới
      publishStatus(client, true);
    }
  }
#endif
}