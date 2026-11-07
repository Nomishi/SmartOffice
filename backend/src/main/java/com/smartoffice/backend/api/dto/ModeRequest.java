package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.Mode;
import jakarta.validation.constraints.NotNull;

public record ModeRequest(@NotNull Mode mode) {
}
