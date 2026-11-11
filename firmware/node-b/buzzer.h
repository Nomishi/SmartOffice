#pragma once

#include <Arduino.h>

/**
 * Điều khiển còi buzzer1 trên Node B.
 * Hỗ trợ còi thụ động (PWM/tone) và còi chủ động (mức HIGH), cấu hình trong config.h.
 */
void buzzerInit();

/** Gọi trong loop() để xử lý tự tắt / nhịp kêu. */
void buzzerUpdate();

void buzzerOn();
void buzzerOff();

/** Kêu ngắt quãng: count lần, mỗi lần BUZZER_BEEP_MS. */
void buzzerBeep(uint8_t count);

/** Một tiếng dài (1,5 giây). */
void buzzerBeepLong();

/** Hú lặp tới khi OFF hoặc hết BUZZER_MAX_ON_SEC. */
void buzzerAlarm();

/** Trạng thái hiện tại: "ON" nếu đang phát âm, ngược lại "OFF". */
const char* buzzerState();
