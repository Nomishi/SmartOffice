package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.Quality;

import java.time.Instant;

public record TelemetryDto(
        Instant receivedAt,
        Double temperature,
        Double humidity,
        Double lux,
        Boolean presence,
        Quality quality,
        Integer airRaw,
        Integer distanceCm,
        Integer movingEnergy,
        Integer staticEnergy,
        Integer rssi
) {
}
