package com.smartoffice.backend.mqtt;

import com.smartoffice.backend.domain.DeviceType;
import com.smartoffice.backend.domain.Quality;

import java.time.Instant;

/** Bắn sau khi telemetry đã lưu DB, để rule engine chạy mà không tạo vòng phụ thuộc MQTT. */
public record TelemetryStoredEvent(
        String deviceId,
        DeviceType deviceType,
        Instant receivedAt,
        Quality quality,
        Double temperature,
        Boolean presence,
        Integer airRaw
) {
}
