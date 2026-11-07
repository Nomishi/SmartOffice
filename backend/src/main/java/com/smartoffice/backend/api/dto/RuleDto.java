package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.RuleType;

import java.time.Instant;
import java.util.Map;

public record RuleDto(
        Long ruleId,
        String name,
        RuleType type,
        boolean enabled,
        Map<String, Object> params,
        Map<String, Object> action,
        Instant updatedAt
) {
}
