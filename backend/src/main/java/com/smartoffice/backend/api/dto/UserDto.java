package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.AccountStatus;
import com.smartoffice.backend.domain.Role;
import com.smartoffice.backend.domain.User;

import java.time.Instant;

public record UserDto(
        Long userId,
        String username,
        Role role,
        AccountStatus accountStatus,
        Instant createdAt,
        Instant lastLoginAt
) {
    public static UserDto from(User user) {
        return new UserDto(
                user.getUserId(),
                user.getUsername(),
                user.getRole(),
                user.getAccountStatus(),
                user.getCreatedAt(),
                user.getLastLoginAt()
        );
    }
}

