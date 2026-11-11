// Lớp kết nối dùng chung cho Node A và Node B: Wi-Fi + MQTT (QoS 1, LWT, tự kết nối lại có backoff).
// File này giống hệt nhau ở firmware/node-a và firmware/node-b.
#pragma once
#include <Arduino.h>

// Được gọi từ netLoop() (KHÔNG phải trong callback của thư viện) nên được phép publish bên trong.
// receivedAtMs = millis() lúc bản tin tới, dùng để tính latencyMs của ACK.
typedef void (*NetMessageHandler)(const String &topic, const String &payload, uint32_t receivedAtMs);

void netBegin(NetMessageHandler handler);
void netLoop();

bool netConnected();                 // true khi MQTT đang kết nối
bool netTakeJustConnected();         // true đúng 1 lần sau mỗi lần (re)connect -> gửi lại status
bool netPublish(const char *topic, const char *payload, bool retained = false, int qos = 1);

int netRssi();
String netIp();
bool netTimeIso(char *buf, size_t len);   // ISO-8601 UTC nếu đã đồng bộ NTP, ngược lại trả false

uint32_t netConnectCount();          // số lần kết nối MQTT thành công (1 = lần đầu)
uint32_t netDroppedCount();          // số bản tin bỏ qua vì đang mất kết nối
uint32_t netPublishFailCount();      // số lần publish không nhận được PUBACK
