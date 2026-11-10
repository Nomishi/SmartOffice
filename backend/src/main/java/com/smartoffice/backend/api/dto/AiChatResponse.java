package com.smartoffice.backend.api.dto;

import java.time.Instant;

public record AiChatResponse(
        String answer,
        String model,
        Instant generatedAt
) {
}
