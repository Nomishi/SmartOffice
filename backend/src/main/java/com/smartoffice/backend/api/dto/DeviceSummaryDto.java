package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.Device;
import com.smartoffice.backend.domain.DeviceStatus;
import com.smartoffice.backend.domain.DeviceType;
import com.smartoffice.backend.domain.Mode;

import java.time.Instant;

public record DeviceSummaryDto(
        String deviceId,
        String name,
        DeviceType type,
        DeviceStatus status,
        Mode mode,
        String roomId,
        boolean online,
        String fwVersion,
        Instant lastSeenAt
) {
    public static DeviceSummaryDto from(Device d) {
        return new DeviceSummaryDto(d.getDeviceId(), d.getName(), d.getType(), d.getStatus(),
                d.getMode(), d.getRoomId(), d.isOnline(), d.getFwVersion(), d.getLastSeenAt());
    }
}
