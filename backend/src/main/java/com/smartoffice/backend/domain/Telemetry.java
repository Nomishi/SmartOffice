package com.smartoffice.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** Telemetry Node A (môi trường). */
@Entity
@Table(name = "telemetry", indexes = {
        @Index(name = "idx_telemetry_device_time", columnList = "device_id, received_at")
})
@Getter
@Setter
@NoArgsConstructor
public class Telemetry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "device_id", nullable = false, length = 64)
    private String deviceId;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    /** ts do thiết bị gửi (tùy chọn, ESP32 không có RTC). */
    @Column(name = "device_ts")
    private Instant deviceTs;

    private Double temperature;
    private Double humidity;
    private Double lux;
    private Boolean presence;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Quality quality = Quality.VALID;

    @Column(name = "air_raw")
    private Integer airRaw;

    @Column(name = "distance_cm")
    private Integer distanceCm;

    @Column(name = "moving_energy")
    private Integer movingEnergy;

    @Column(name = "static_energy")
    private Integer staticEnergy;

    private Integer rssi;
}
