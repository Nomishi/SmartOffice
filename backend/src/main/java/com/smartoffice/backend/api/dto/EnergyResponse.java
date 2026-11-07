package com.smartoffice.backend.api.dto;

import java.time.Instant;
import java.util.List;

public record EnergyResponse(
        String deviceId,
        Instant from,
        Instant to,
        String unit,
        double totalWh,
        List<Bucket> buckets
) {
    public record Bucket(
            Instant start,
            double light1Wh,
            double fan1Wh,
            double light1AvgW,
            double fan1AvgW
    ) {
    }
}
