package com.smartoffice.backend.api.dto;

import java.time.Instant;

public record ConfigDto(
        String configId,
        String deviceId,
        String status,
        String issuedBy,
        Instant issuedAt,
        Instant ackAt
) {
}
