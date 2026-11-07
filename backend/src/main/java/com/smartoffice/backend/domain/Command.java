package com.smartoffice.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "commands", indexes = {
        @Index(name = "idx_command_device_time", columnList = "device_id, issued_at")
})
@Getter
@Setter
@NoArgsConstructor
public class Command {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "command_id", unique = true, length = 32)
    private String commandId;

    @Column(name = "device_id", nullable = false, length = 64)
    private String deviceId;

    @Column(nullable = false, length = 16)
    private String target;

    @Column(nullable = false, length = 16)
    private String action;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CommandStatus status = CommandStatus.PENDING;

    @Column(name = "issued_by", nullable = false, length = 64)
    private String issuedBy;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt = Instant.now();

    @Column(name = "ack_at")
    private Instant ackAt;

    @Column(name = "latency_ms")
    private Long latencyMs;

    @Column(name = "idempotency_key", unique = true, length = 64)
    private String idempotencyKey;

    @Column(name = "last_sent_at")
    private Instant lastSentAt;

    @Column(nullable = false)
    private int retries = 0;

    @Column(length = 255)
    private String message;
}
