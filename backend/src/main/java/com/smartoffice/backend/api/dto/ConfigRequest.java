package com.smartoffice.backend.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record ConfigRequest(
        @Min(1) @Max(3600) Integer telemetryIntervalSec,
        @Min(0) @Max(180) Integer servoOpenDeg,
        @Min(0) @Max(180) Integer servoCloseDeg
) {
}
