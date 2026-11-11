// Đọc cảm biến Node A: AHT20, BH1750, LD2410C, MQ-135. Không dùng thư viện ngoài.
#pragma once
#include <Arduino.h>

// Thứ tự tăng dần theo mức độ xấu để lấy "mức xấu nhất" bằng max() (Contract mục 5.5).
enum Quality : uint8_t { Q_VALID = 0, Q_SUSPECT = 1, Q_INVALID = 2 };
const char *qualityName(Quality q);

struct EnvReading {
  // AHT20
  bool hasClimate = false;        // false = không đọc được -> không gửi temperature/humidity
  float temperature = 0, humidity = 0;
  Quality qClimate = Q_INVALID;
  // BH1750
  bool hasLux = false;
  float lux = 0;
  Quality qLux = Q_INVALID;
  // LD2410C
  bool hasPresence = false;       // false = radar im lặng -> KHÔNG được coi là phòng trống
  bool presence = false;
  uint16_t distanceCm = 0;
  uint8_t movingEnergy = 0, staticEnergy = 0;
  Quality qPresence = Q_INVALID;
  // MQ-135
  bool hasAir = false;
  int airRaw = 0;                 // 0..4095, giá trị ADC tương đối, không phải ppm
  Quality qAir = Q_INVALID;

  Quality overall() const;
};

void sensorsBegin();
void sensorsPoll();                       // gọi liên tục trong loop() để đọc UART của radar
void sensorsRead(EnvReading &reading);    // đọc một lượt đầy đủ (chặn khoảng 100 ms)
