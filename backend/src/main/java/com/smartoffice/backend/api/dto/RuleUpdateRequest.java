package com.smartoffice.backend.api.dto;

import java.util.Map;

/** PUT /api/rules/{id}: chỉ các field có mặt mới được cập nhật, không cho đổi type. */
public record RuleUpdateRequest(
        String name,
        Boolean enabled,
        Map<String, Object> params,
        Map<String, Object> action
) {
}
