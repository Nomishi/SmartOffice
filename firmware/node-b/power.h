// Đo điện áp / dòng / công suất bằng 2 module INA219 (đọc thẳng thanh ghi, không dùng thư viện ngoài).
#pragma once
#include <Arduino.h>

enum Quality : uint8_t { Q_VALID = 0, Q_SUSPECT = 1, Q_INVALID = 2 };
const char *qualityName(Quality q);

struct ChannelReading {
  bool ok = false;        // false = không đọc được INA219 -> không gửi số liệu kênh này
  float busVoltageV = 0;  // điện áp phía tải (V)
  float currentMa = 0;    // dòng qua tải (mA)
  float powerW = 0;       // công suất (W) = V x I
  Quality quality = Q_INVALID;
};

struct PowerReading {
  ChannelReading light;   // địa chỉ I2C_ADDR_INA_LIGHT
  ChannelReading fan;     // địa chỉ I2C_ADDR_INA_FAN
};

void powerBegin();
void powerRead(PowerReading &reading);
