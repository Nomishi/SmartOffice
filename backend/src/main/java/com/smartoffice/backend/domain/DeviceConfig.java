package com.smartoffice.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** Lịch sử gửi config xuống thiết bị (topic office/{deviceId}/config). */
@Entity
@Table(name = "device_configs", indexes = {
        @Index(name = "idx_config_device_time", columnList = "device_id, issued_at")
})
@Getter
@Setter
@NoArgsConstructor
public class DeviceConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "config_id", unique = true, length = 32)
    private String configId;

    @Column(name = "device_id", nullable = false, length = 64)
    private String deviceId;

    @Column(name = "payload_json", columnDefinition = "text")
    private String payloadJson;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CommandStatus status = CommandStatus.PENDING;

    @Column(name = "issued_by", length = 64)
    private String issuedBy;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt = Instant.now();

    @Column(name = "ack_at")
    private Instant ackAt;

    @Column(name = "last_sent_at")
    private Instant lastSentAt;
}
