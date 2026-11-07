package com.smartoffice.backend.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CommandRequest(
        @NotBlank String target,
        @NotBlank String action
) {
}
