// Cơ cấu chấp hành Node B: đèn, relay quạt, còi, servo cửa + công tắc từ xác nhận trạng thái cửa.
#pragma once
#include <Arduino.h>

void actuatorsBegin(int servoOpenDeg, int servoCloseDeg);   // đưa mọi đầu ra về trạng thái an toàn
void actuatorsLoop();                                       // nhịp còi, tự tắt còi, chống dội công tắc từ

void setLight(bool on);
void setFan(bool on);
void setBuzzer(bool on);
bool lightIsOn();
bool fanIsOn();
bool buzzerIsOn();

// Quay servo rồi chờ công tắc từ xác nhận. Trả true nếu trạng thái đọc được khớp với lệnh.
bool doorMove(bool open);
bool doorIsOpen();
void setServoAngles(int openDeg, int closeDeg);             // áp dụng cấu hình góc mới

// true đúng 1 lần khi trạng thái tự thay đổi (cửa bị mở/đóng bằng tay, còi tự tắt) -> cần publish status.
bool actuatorsTakeChanged();
