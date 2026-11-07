package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.DeviceStatus;
import com.smartoffice.backend.domain.DeviceType;
import com.smartoffice.backend.domain.Mode;

import java.time.Instant;
import java.util.Map;

public record DeviceStatusResponse(
        String deviceId,
        String name,
        DeviceType type,
        DeviceStatus status,
        Mode mode,
        boolean online,
        Instant lastSeenAt,
        String fwVersion,
        Map<String, String> actuators,
        Object latestTelemetry
) {
}
