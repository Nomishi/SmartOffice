package com.smartoffice.backend.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AiChatRequest(
        @NotBlank(message = "message không được để trống")
        @Size(max = 2000, message = "message tối đa 2000 ký tự")
        String message,

        @Size(max = 64, message = "deviceId tối đa 64 ký tự")
        String deviceId
) {
}
