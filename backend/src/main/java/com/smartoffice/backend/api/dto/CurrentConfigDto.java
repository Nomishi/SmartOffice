package com.smartoffice.backend.api.dto;

import java.time.Instant;

/**
 * Cấu hình đang áp dụng trên thiết bị: gộp các config đã được thiết bị ACK SUCCESS (mới nhất thắng),
 * trường nào chưa từng được cấu hình thì lấy giá trị mặc định của firmware.
 *
 * @param source            ACKED nếu có ít nhất 1 config SUCCESS, DEFAULT nếu chưa từng cấu hình
 * @param lastConfigId      config SUCCESS gần nhất (null nếu chưa có)
 * @param lastAckAt         thời điểm thiết bị xác nhận config đó
 * @param pendingConfigId   config đang chờ ACK (null nếu không có)
 */
public record CurrentConfigDto(
        String deviceId,
        Integer telemetryIntervalSec,
        Integer servoOpenDeg,
        Integer servoCloseDeg,
        String source,
        String lastConfigId,
        Instant lastAckAt,
        String pendingConfigId
) {
}
