package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.DeviceConfig;

import java.time.Instant;

public record ConfigDto(
        String configId,
        String deviceId,
        String status,
        String issuedBy,
        Instant issuedAt,
        Instant ackAt
) {
    public static ConfigDto from(DeviceConfig config) {
        return new ConfigDto(
                config.getConfigId(),
                config.getDeviceId(),
                config.getStatus() != null ? config.getStatus().name() : null,
                config.getIssuedBy(),
                config.getIssuedAt(),
                config.getAckAt()
        );
    }
}
