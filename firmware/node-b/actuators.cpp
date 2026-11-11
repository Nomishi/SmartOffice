#include "actuators.h"
#include "config.h"

#if ESP_ARDUINO_VERSION_MAJOR < 3
#error "Firmware nay dung API LEDC cua Arduino-ESP32 core 3.x (ledcAttachChannel). Hay cap nhat board ESP32 len 3.x."
#endif

static bool lightOn = false, fanOn = false, buzzerOn = false;
static bool buzzerSounding = false;
static uint32_t buzzerSinceMs = 0;

static int servoOpenDeg = DEFAULT_SERVO_OPEN_DEG;
static int servoCloseDeg = DEFAULT_SERVO_CLOSE_DEG;
static bool doorTargetOpen = false;     // vị trí servo được lệnh gần nhất
static bool doorOpen = false;           // trạng thái cửa đã chống dội
static bool doorRawLast = false;
static uint32_t doorRawSinceMs = 0;
static bool changed = false;

// ---------------------------------------------------------------- đèn / quạt
void setLight(bool on) {
  lightOn = on;
  digitalWrite(PIN_LIGHT, on ? LIGHT_ON_LEVEL : !LIGHT_ON_LEVEL);
}

void setFan(bool on) {
  fanOn = on;
  digitalWrite(PIN_FAN, on ? FAN_ON_LEVEL : !FAN_ON_LEVEL);
}

bool lightIsOn() { return lightOn; }
bool fanIsOn() { return fanOn; }

// ---------------------------------------------------------------- còi
static void buzzerSound(bool sound) {
  if (sound == buzzerSounding) return;
  buzzerSounding = sound;
#if BUZZER_PASSIVE
  ledcWriteTone(PIN_BUZZER, sound ? BUZZER_FREQ_HZ : 0);
#else
  digitalWrite(PIN_BUZZER, sound ? HIGH : LOW);
#endif
}

void setBuzzer(bool on) {
  buzzerOn = on;
  buzzerSinceMs = millis();
  buzzerSound(on);
}

bool buzzerIsOn() { return buzzerOn; }

// ---------------------------------------------------------------- servo + công tắc từ
static void servoWrite(int angle) {
  angle = constrain(angle, 0, 180);
  uint32_t pulseUs = map(angle, 0, 180, SERVO_MIN_US, SERVO_MAX_US);
  uint32_t duty = (uint32_t)((uint64_t)pulseUs * (1UL << SERVO_RESOLUTION) / 20000UL);   // chu kỳ 20 ms
  ledcWrite(PIN_SERVO, duty);
}

static bool doorSensorOpenRaw() {
  return digitalRead(PIN_DOOR_SENSOR) == HIGH;   // LOW = nam châm ở gần = cửa đóng
}

bool doorIsOpen() { return doorOpen; }

bool doorMove(bool open) {
  doorTargetOpen = open;
  servoWrite(open ? servoOpenDeg : servoCloseDeg);

#if ENABLE_DOOR_SENSOR
  // Chờ công tắc từ báo đúng trạng thái và ổn định đủ thời gian chống dội.
  uint32_t startMs = millis(), stableSinceMs = 0;
  bool confirmed = false;
  while (millis() - startMs < DOOR_CONFIRM_TIMEOUT_MS) {
    if (doorSensorOpenRaw() == open) {
      if (stableSinceMs == 0) stableSinceMs = millis();
      // Cần ổn định, và với lệnh ĐÓNG phải chờ servo quay xong mới tin công tắc từ.
      bool moved = open || millis() - startMs >= SERVO_MOVE_MS;
      if (moved && millis() - stableSinceMs >= DOOR_DEBOUNCE_MS) { confirmed = true; break; }
    } else {
      stableSinceMs = 0;
    }
    delay(5);
  }
  doorOpen = doorSensorOpenRaw();
  doorRawLast = doorOpen;
  doorRawSinceMs = millis();
  return confirmed && doorOpen == open;
#else
  delay(SERVO_MOVE_MS);
  doorOpen = open;
  return true;
#endif
}

void setServoAngles(int openDeg, int closeDeg) {
  bool differs = openDeg != servoOpenDeg || closeDeg != servoCloseDeg;
  servoOpenDeg = constrain(openDeg, 0, 180);
  servoCloseDeg = constrain(closeDeg, 0, 180);
  if (differs) servoWrite(doorTargetOpen ? servoOpenDeg : servoCloseDeg);   // giữ nguyên trạng thái mở/đóng hiện tại
}

// ---------------------------------------------------------------- khởi tạo / vòng lặp
void actuatorsBegin(int openDeg, int closeDeg) {
  servoOpenDeg = constrain(openDeg, 0, 180);
  servoCloseDeg = constrain(closeDeg, 0, 180);

  // Trạng thái an toàn khi khởi động (Contract mục 6): relay OFF, còi OFF, servo ở vị trí đóng.
  // Ghi mức OFF trước khi đặt OUTPUT để relay không nháy.
  digitalWrite(PIN_FAN, !FAN_ON_LEVEL);
  pinMode(PIN_FAN, OUTPUT);
  digitalWrite(PIN_LIGHT, !LIGHT_ON_LEVEL);
  pinMode(PIN_LIGHT, OUTPUT);
  pinMode(PIN_DOOR_SENSOR, INPUT_PULLUP);

  ledcAttachChannel(PIN_SERVO, SERVO_FREQ_HZ, SERVO_RESOLUTION, SERVO_CHANNEL);
  servoWrite(servoCloseDeg);
  doorTargetOpen = false;

#if BUZZER_PASSIVE
  ledcAttachChannel(PIN_BUZZER, BUZZER_FREQ_HZ, 8, BUZZER_CHANNEL);
  ledcWriteTone(PIN_BUZZER, 0);
#else
  digitalWrite(PIN_BUZZER, LOW);
  pinMode(PIN_BUZZER, OUTPUT);
#endif

#if ENABLE_DOOR_SENSOR
  delay(SERVO_MOVE_MS);                  // chờ servo về vị trí đóng rồi mới đọc cửa
  doorOpen = doorSensorOpenRaw();
#else
  doorOpen = false;
#endif
  doorRawLast = doorOpen;
  doorRawSinceMs = millis();
}

void actuatorsLoop() {
  uint32_t now = millis();

  // Còi kêu ngắt quãng khi đang ON; tự tắt sau BUZZER_MAX_ON_SEC để không kêu mãi nếu mất lệnh OFF.
  if (buzzerOn) {
    if (BUZZER_MAX_ON_SEC > 0 && now - buzzerSinceMs >= (uint32_t)BUZZER_MAX_ON_SEC * 1000UL) {
      setBuzzer(false);
      changed = true;
      Serial.println("[BUZZER] Tu tat sau thoi gian toi da");
    } else {
      buzzerSound(((now - buzzerSinceMs) / BUZZER_BEEP_MS) % 2 == 0);
    }
  }

#if ENABLE_DOOR_SENSOR
  // Chống dội công tắc từ: chỉ nhận trạng thái mới khi ổn định đủ DOOR_DEBOUNCE_MS.
  bool raw = doorSensorOpenRaw();
  if (raw != doorRawLast) {
    doorRawLast = raw;
    doorRawSinceMs = now;
  } else if (raw != doorOpen && now - doorRawSinceMs >= DOOR_DEBOUNCE_MS) {
    doorOpen = raw;
    changed = true;                      // cửa bị mở/đóng bằng tay -> báo status ngay
    Serial.printf("[DOOR] Cua %s\n", doorOpen ? "OPEN" : "CLOSED");
  }
#endif
}

bool actuatorsTakeChanged() {
  if (!changed) return false;
  changed = false;
  return true;
}
