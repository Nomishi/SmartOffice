package com.smartoffice.backend.api;

import java.time.Instant;

public record ErrorResponse(ErrorBody error) {

    public static ErrorResponse of(String code, String message, Object details) {
        return new ErrorResponse(new ErrorBody(code, message, details, Instant.now()));
    }

    public record ErrorBody(String code, String message, Object details, Instant timestamp) {
    }
}
