#include "sensors.h"
#include "config.h"
#include <Wire.h>

const char *qualityName(Quality q) {
  switch (q) {
    case Q_VALID: return "VALID";
    case Q_SUSPECT: return "SUSPECT";
    default: return "INVALID";
  }
}

Quality EnvReading::overall() const {
  Quality worst = max(qClimate, max(qLux, qPresence));
#if ENABLE_MQ135
  worst = max(worst, qAir);
#endif
  return worst;
}

// ====================== I2C ======================
static bool i2cPresent(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

// ====================== AHT20 ======================
static bool ahtReady = false;

// CRC-8 của AHT20: đa thức 0x31, giá trị đầu 0xFF, tính trên 6 byte đầu.
static uint8_t ahtCrc(const uint8_t *data, size_t length) {
  uint8_t crc = 0xFF;
  for (size_t i = 0; i < length; i++) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; bit++) crc = (crc & 0x80) ? (crc << 1) ^ 0x31 : (crc << 1);
  }
  return crc;
}

static bool ahtRead(float &temperature, float &humidity) {
  if (!ahtReady) {
    if (!i2cPresent(I2C_ADDR_AHT20)) return false;
    Wire.beginTransmission(I2C_ADDR_AHT20);
    Wire.write(0xBE); Wire.write(0x08); Wire.write(0x00);   // khởi tạo + hiệu chuẩn
    if (Wire.endTransmission() != 0) return false;
    delay(20);
    ahtReady = true;
  }
  Wire.beginTransmission(I2C_ADDR_AHT20);
  Wire.write(0xAC); Wire.write(0x33); Wire.write(0x00);     // kích hoạt đo
  if (Wire.endTransmission() != 0) { ahtReady = false; return false; }
  delay(85);

  uint8_t data[7];
  if (Wire.requestFrom((int)I2C_ADDR_AHT20, 7) != 7) { ahtReady = false; return false; }
  for (uint8_t i = 0; i < 7; i++) data[i] = Wire.read();
  if (data[0] & 0x80) return false;                         // cảm biến còn bận
  if (ahtCrc(data, 6) != data[6]) return false;             // sai CRC -> coi như đọc lỗi

  uint32_t rawHumidity = ((uint32_t)data[1] << 12) | ((uint32_t)data[2] << 4) | (data[3] >> 4);
  uint32_t rawTemperature = ((uint32_t)(data[3] & 0x0F) << 16) | ((uint32_t)data[4] << 8) | data[5];
  humidity = rawHumidity * 100.0f / 1048576.0f;
  temperature = rawTemperature * 200.0f / 1048576.0f - 50.0f;
  return true;
}

// ====================== BH1750 ======================
static bool bhReady = false;

static bool bhRead(float &lux, bool &saturated) {
  if (!bhReady) {
    if (!i2cPresent(I2C_ADDR_BH1750)) return false;
    Wire.beginTransmission(I2C_ADDR_BH1750); Wire.write(0x01); Wire.endTransmission();  // power on
    Wire.beginTransmission(I2C_ADDR_BH1750); Wire.write(0x10);                          // đo liên tục, độ phân giải cao
    if (Wire.endTransmission() != 0) return false;
    delay(180);
    bhReady = true;
  }
  if (Wire.requestFrom((int)I2C_ADDR_BH1750, 2) != 2) { bhReady = false; return false; }
  uint16_t raw = ((uint16_t)Wire.read() << 8) | Wire.read();
  saturated = (raw == 0xFFFF);
  lux = raw / 1.2f;
  return true;
}

// ====================== LD2410C ======================
// Frame báo cáo: F4 F3 F2 F1 | len(2, LE) | 02 AA state movDist(2) movE statDist(2) statE detDist(2) 55 00 | F8 F7 F6 F5
static const uint8_t RADAR_HEAD[4] = {0xF4, 0xF3, 0xF2, 0xF1};
static const uint8_t RADAR_TAIL[4] = {0xF8, 0xF7, 0xF6, 0xF5};
static uint8_t radarBuffer[64];
static size_t radarLength = 0;

static bool radarEverSeen = false;
static uint32_t radarLastFrameMs = 0;
static uint8_t radarState = 0, radarMovingEnergy = 0, radarStaticEnergy = 0;
static uint16_t radarDistanceCm = 0;
static bool radarPresentSinceRead = false;   // có người ở bất kỳ frame nào kể từ lần đọc trước

static void radarParseFrame() {
  uint16_t dataLength = radarBuffer[4] | (radarBuffer[5] << 8);
  const uint8_t *data = radarBuffer + 6;
  if (dataLength + 10 != radarLength || dataLength < 13) return;
  if ((data[0] != 0x02 && data[0] != 0x01) || data[1] != 0xAA) return;   // 02 = cơ bản, 01 = kỹ thuật

  radarState = data[2] & 0x03;                      // 0 không ai, 1 chuyển động, 2 đứng yên, 3 cả hai
  uint16_t movingDistance = data[3] | (data[4] << 8);
  radarMovingEnergy = min<uint8_t>(data[5], 100);
  uint16_t staticDistance = data[6] | (data[7] << 8);
  radarStaticEnergy = min<uint8_t>(data[8], 100);
  uint16_t detectDistance = data[9] | (data[10] << 8);
  if (radarState == 0) radarDistanceCm = 0;
  else if (detectDistance > 0) radarDistanceCm = detectDistance;
  else radarDistanceCm = (radarState & 1) ? movingDistance : staticDistance;

  if (radarState != 0) radarPresentSinceRead = true;
  radarEverSeen = true;
  radarLastFrameMs = millis();
}

static void radarFeed(uint8_t value) {
  if (radarLength < 4) {                            // đang dò header
    if (value == RADAR_HEAD[radarLength]) {
      radarBuffer[radarLength++] = value;
    } else {
      radarLength = (value == RADAR_HEAD[0]) ? 1 : 0;
      if (radarLength) radarBuffer[0] = value;
    }
    return;
  }
  if (radarLength >= sizeof(radarBuffer)) { radarLength = 0; return; }
  radarBuffer[radarLength++] = value;
  if (radarLength >= 10 && memcmp(radarBuffer + radarLength - 4, RADAR_TAIL, 4) == 0) {
    radarParseFrame();
    radarLength = 0;
  }
}

// ====================== MQ-135 ======================
static int mqReadRaw() {
  uint32_t sum = 0;
  for (uint8_t i = 0; i < 16; i++) sum += analogRead(PIN_MQ135);
  return (int)(sum / 16);
}

// ====================== API ======================
void sensorsBegin() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);
  Wire.setTimeOut(50);

  Serial2.setRxBufferSize(1024);
  Serial2.begin(RADAR_BAUD, SERIAL_8N1, PIN_RADAR_RX, PIN_RADAR_TX);

#if ENABLE_MQ135
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_MQ135, ADC_11db);
#endif
}

void sensorsPoll() {
  while (Serial2.available()) radarFeed((uint8_t)Serial2.read());
}

void sensorsRead(EnvReading &reading) {
  reading = EnvReading();

  // --- AHT20 ---
  float temperature, humidity;
  if (ahtRead(temperature, humidity)) {
    reading.hasClimate = true;
    reading.temperature = temperature;
    reading.humidity = constrain(humidity, 0.0f, 100.0f);
    bool inRange = temperature >= TEMP_MIN_C && temperature <= TEMP_MAX_C && humidity >= 0.0f && humidity <= 100.0f;
    reading.qClimate = inRange ? Q_VALID : Q_SUSPECT;
  }
  sensorsPoll();   // AHT20 chặn ~85 ms, tranh thủ đọc UART để không tràn bộ đệm

  // --- BH1750 ---
  float lux;
  bool saturated = false;
  if (bhRead(lux, saturated)) {
    reading.hasLux = true;
    reading.lux = lux;
    reading.qLux = saturated ? Q_SUSPECT : Q_VALID;
  }
  sensorsPoll();

  // --- LD2410C ---
  if (radarEverSeen && millis() - radarLastFrameMs < RADAR_STALE_MS) {
    reading.hasPresence = true;
    reading.presence = radarPresentSinceRead || radarState != 0;
    reading.distanceCm = radarDistanceCm;
    reading.movingEnergy = radarMovingEnergy;
    reading.staticEnergy = radarStaticEnergy;
    reading.qPresence = Q_VALID;
  }
  radarPresentSinceRead = false;

  // --- MQ-135 ---
#if ENABLE_MQ135
  reading.hasAir = true;
  reading.airRaw = mqReadRaw();
  bool warmingUp = millis() < (uint32_t)MQ135_WARMUP_SEC * 1000UL;
  bool outOfRange = reading.airRaw >= 4000 || reading.airRaw < 5;   // kịch trần (sai cầu phân áp) hoặc không có tín hiệu
  reading.qAir = (warmingUp || outOfRange) ? Q_SUSPECT : Q_VALID;
#endif
}
