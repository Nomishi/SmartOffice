#include "buzzer.h"
#include "config.h"

#ifndef PIN_BUZZER
#define PIN_BUZZER 23
#endif
#ifndef BUZZER_PASSIVE
#define BUZZER_PASSIVE 1
#endif
#ifndef BUZZER_FREQ_HZ
#define BUZZER_FREQ_HZ 2000
#endif
#ifndef BUZZER_BEEP_MS
#define BUZZER_BEEP_MS 400
#endif
#ifndef BUZZER_MAX_ON_SEC
#define BUZZER_MAX_ON_SEC 120
#endif

namespace {

enum class Pattern : uint8_t { NONE, BEEP, LONG, ALARM };

Pattern pattern = Pattern::NONE;
uint32_t startedAt = 0;
uint8_t beepCount = 0;
bool output = false;

void setOutput(bool on) {
    if (on == output) {
        return;
    }
    output = on;
#if BUZZER_PASSIVE
    if (on) {
        tone(PIN_BUZZER, BUZZER_FREQ_HZ);
    } else {
        noTone(PIN_BUZZER);
    }
#else
    digitalWrite(PIN_BUZZER, on ? HIGH : LOW);
#endif
}

void stop() {
    pattern = Pattern::NONE;
    setOutput(false);
}

}  // namespace

void buzzerInit() {
    pinMode(PIN_BUZZER, OUTPUT);
#if BUZZER_PASSIVE
    noTone(PIN_BUZZER);
#else
    digitalWrite(PIN_BUZZER, LOW);
#endif
    output = false;
    pattern = Pattern::NONE;
}

void buzzerOn() {
    pattern = Pattern::NONE;
    setOutput(true);
}

void buzzerOff() {
    stop();
}

void buzzerBeep(uint8_t count) {
    if (count == 0) {
        stop();
        return;
    }
    beepCount = count;
    startedAt = millis();
    pattern = Pattern::BEEP;
    setOutput(true);
}

void buzzerBeepLong() {
    startedAt = millis();
    pattern = Pattern::LONG;
    setOutput(true);
}

void buzzerAlarm() {
    startedAt = millis();
    pattern = Pattern::ALARM;
    setOutput(true);
}

void buzzerUpdate() {
    if (pattern == Pattern::NONE) {
        return;
    }

    const uint32_t elapsed = millis() - startedAt;
    const uint32_t cycleMs = static_cast<uint32_t>(BUZZER_BEEP_MS) * 2U;

    if (pattern == Pattern::LONG) {
        if (elapsed >= 1500U) {
            stop();
        }
        return;
    }

    if (pattern == Pattern::ALARM) {
#if BUZZER_MAX_ON_SEC > 0
        if (elapsed >= static_cast<uint32_t>(BUZZER_MAX_ON_SEC) * 1000U) {
            stop();
            return;
        }
#endif
        setOutput((elapsed % cycleMs) < static_cast<uint32_t>(BUZZER_BEEP_MS));
        return;
    }

    if (pattern == Pattern::BEEP) {
        const uint8_t current = static_cast<uint8_t>(elapsed / cycleMs);
        if (current >= beepCount) {
            stop();
            return;
        }
        setOutput((elapsed % cycleMs) < static_cast<uint32_t>(BUZZER_BEEP_MS));
    }
}

const char* buzzerState() {
    return output ? "ON" : "OFF";
}
