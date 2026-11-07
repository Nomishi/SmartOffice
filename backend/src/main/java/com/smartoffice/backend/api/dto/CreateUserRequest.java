package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.Role;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
        @NotBlank(message = "Username không được để trống")
        @Size(min = 3, max = 50, message = "Username từ 3 đến 50 ký tự")
        String username,

        @NotBlank(message = "Password không được để trống")
        @Size(min = 6, message = "Mật khẩu tối thiểu 6 ký tự")
        String password,

        @NotNull(message = "Role không được để trống")
        Role role
) {}

