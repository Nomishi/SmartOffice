package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.Quality;

import java.time.Instant;

public record PowerReadingDto(
        Instant receivedAt,
        Double busVoltageV,
        Double light1PowerW,
        Integer light1CurrentMa,
        Double fan1PowerW,
        Integer fan1CurrentMa,
        Quality quality,
        Integer rssi
) {
}
