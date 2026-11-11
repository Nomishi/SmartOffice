package com.smartoffice.backend.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record AiChatRequest(
        @NotBlank(message = "message không được để trống")
        @Size(max = 2000, message = "message tối đa 2000 ký tự")
        String message,

        @Size(max = 64, message = "deviceId tối đa 64 ký tự")
        String deviceId,

        @Size(max = 10, message = "history tối đa 10 tin nhắn")
        List<@Valid HistoryMessage> history
) {
    public record HistoryMessage(
            @NotBlank(message = "role không được để trống")
            @Pattern(regexp = "user|assistant", message = "role phải là user hoặc assistant")
            String role,

            @NotBlank(message = "history content không được để trống")
            @Size(max = 2000, message = "history content tối đa 2000 ký tự")
            String content
    ) {
    }
}
