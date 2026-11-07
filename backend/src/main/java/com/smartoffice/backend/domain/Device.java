package com.smartoffice.backend.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "devices")
@Getter
@Setter
@NoArgsConstructor
public class Device {

    @Id
    @Column(name = "device_id", length = 64)
    private String deviceId;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private DeviceType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private DeviceStatus status = DeviceStatus.ACTIVE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Mode mode = Mode.AUTO;

    @Column(name = "room_id", length = 64)
    private String roomId = "room-01";

    @Column(name = "fw_version", length = 32)
    private String fwVersion;

    @Column(nullable = false)
    private boolean online = false;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    @Column(name = "registered_at", nullable = false)
    private Instant registeredAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    // --- actuator state (chỉ Node B) ---
    @Column(length = 8)
    private String light1 = "OFF";
    @Column(length = 8)
    private String fan1 = "OFF";
    @Column(length = 8)
    private String buzzer1 = "OFF";
    @Column(length = 8)
    private String door1 = "CLOSED";

    // --- state nội bộ cho rule engine, không trả ra API ---
    @JsonIgnore
    @Column(name = "empty_since")
    private Instant emptySince;

    @JsonIgnore
    @Column(name = "door_open_since")
    private Instant doorOpenSince;

    @JsonIgnore
    @Column(name = "invalid_streak", nullable = false)
    private int invalidStreak = 0;

    @JsonIgnore
    @Column(name = "valid_streak", nullable = false)
    private int validStreak = 0;

    @JsonIgnore
    @Column(name = "temp_high_streak", nullable = false)
    private int tempHighStreak = 0;

    @JsonIgnore
    @Column(name = "air_bad_streak", nullable = false)
    private int airBadStreak = 0;

    @JsonIgnore
    @Column(name = "last_absence_action_at")
    private Instant lastAbsenceActionAt;

    @JsonIgnore
    @Column(name = "last_energy_action_at")
    private Instant lastEnergyActionAt;

    @Version
    @JsonIgnore
    private Long version;
}
