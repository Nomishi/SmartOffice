package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.DeviceType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateDeviceRequest(
        @NotBlank(message = "deviceId không được để trống")
        @Size(max = 64, message = "deviceId tối đa 64 ký tự")
        String deviceId,

        @NotBlank(message = "name không được để trống")
        @Size(max = 255, message = "name tối đa 255 ký tự")
        String name,

        @NotNull(message = "type không được để trống")
        DeviceType type,

        @Size(max = 64, message = "roomId tối đa 64 ký tự")
        String roomId,

        @Size(max = 32, message = "fwVersion tối đa 32 ký tự")
        String fwVersion
) {
}
