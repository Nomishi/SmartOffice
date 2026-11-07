package com.smartoffice.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "alerts", indexes = {
        @Index(name = "idx_alert_status_time", columnList = "status, created_at"),
        @Index(name = "idx_alert_device_type", columnList = "device_id, type")
})
@Getter
@Setter
@NoArgsConstructor
public class Alert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long alertId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private AlertType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AlertSeverity severity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AlertStatus status = AlertStatus.OPEN;

    @Column(name = "device_id", nullable = false, length = 64)
    private String deviceId;

    @Column(name = "room_id", length = 64)
    private String roomId;

    @Column(name = "alert_value")
    private Double value;

    @Column(name = "threshold_value")
    private Double threshold;

    @Column(length = 500)
    private String message;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "acknowledged_by")
    private Long acknowledgedBy;

    @Column(name = "acknowledged_at")
    private Instant acknowledgedAt;

    /** Alert tự đóng khi điều kiện hết (TEMP_HIGH, DEVICE_OFFLINE, SENSOR_FAULT...). */
    @Column(name = "resolved_at")
    private Instant resolvedAt;
}
