#include "power.h"
#include "config.h"
#include <Wire.h>

const char *qualityName(Quality q) {
  switch (q) {
    case Q_VALID: return "VALID";
    case Q_SUSPECT: return "SUSPECT";
    default: return "INVALID";
  }
}

// Thanh ghi INA219
static const uint8_t REG_CONFIG = 0x00;
static const uint8_t REG_SHUNT_VOLTAGE = 0x01;   // int16, LSB = 10 µV
static const uint8_t REG_BUS_VOLTAGE = 0x02;     // 13 bit cao, LSB = 4 mV
// 32 V, PGA /8 (±320 mV), ADC 12 bit, đo liên tục shunt + bus (giá trị mặc định của chip)
static const uint16_t INA_CONFIG_DEFAULT = 0x399F;

static bool inaWrite(uint8_t address, uint8_t reg, uint16_t value) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  Wire.write((uint8_t)(value >> 8));
  Wire.write((uint8_t)(value & 0xFF));
  return Wire.endTransmission() == 0;
}

static bool inaRead(uint8_t address, uint8_t reg, uint16_t &value) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission() != 0) return false;
  if (Wire.requestFrom((int)address, 2) != 2) return false;
  value = ((uint16_t)Wire.read() << 8) | Wire.read();
  return true;
}

static void readChannel(uint8_t address, ChannelReading &channel) {
  channel = ChannelReading();
  uint16_t rawBus, rawShunt;
  if (!inaRead(address, REG_BUS_VOLTAGE, rawBus) || !inaRead(address, REG_SHUNT_VOLTAGE, rawShunt)) {
    return;   // ok = false, quality = INVALID
  }
  float busVoltage = (rawBus >> 3) * 0.004f;
  float shuntMilliVolt = (int16_t)rawShunt * 0.01f;
  float currentMa = fabsf(shuntMilliVolt / INA_SHUNT_OHM);   // trị tuyệt đối: không phụ thuộc chiều đấu Vin+/Vin-
  if (currentMa < 2.0f) currentMa = 0;                       // dưới 2 mA là nhiễu/offset của ADC

  channel.ok = true;
  channel.busVoltageV = busVoltage;
  channel.currentMa = currentMa;
  channel.powerW = busVoltage * currentMa / 1000.0f;
  // Ngoài dải đo của module (26 V / 3.2 A) hoặc cờ tràn -> đáng ngờ
  bool outOfRange = busVoltage > 26.0f || currentMa > 3200.0f || (rawBus & 0x0001);
  channel.quality = outOfRange ? Q_SUSPECT : Q_VALID;
}

void powerBegin() {
#if ENABLE_INA219
  inaWrite(I2C_ADDR_INA_LIGHT, REG_CONFIG, INA_CONFIG_DEFAULT);
  inaWrite(I2C_ADDR_INA_FAN, REG_CONFIG, INA_CONFIG_DEFAULT);
#endif
}

void powerRead(PowerReading &reading) {
  reading = PowerReading();
#if ENABLE_INA219
  readChannel(I2C_ADDR_INA_LIGHT, reading.light);
  readChannel(I2C_ADDR_INA_FAN, reading.fan);
#endif
}
