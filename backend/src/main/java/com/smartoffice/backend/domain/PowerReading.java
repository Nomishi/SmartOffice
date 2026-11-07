package com.smartoffice.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** Telemetry Node B (công suất INA219). */
@Entity
@Table(name = "power_reading", indexes = {
        @Index(name = "idx_power_device_time", columnList = "device_id, received_at")
})
@Getter
@Setter
@NoArgsConstructor
public class PowerReading {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "device_id", nullable = false, length = 64)
    private String deviceId;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    @Column(name = "bus_voltage_v")
    private Double busVoltageV;

    @Column(name = "light1_power_w")
    private Double light1PowerW;

    @Column(name = "light1_current_ma")
    private Integer light1CurrentMa;

    @Column(name = "fan1_power_w")
    private Double fan1PowerW;

    @Column(name = "fan1_current_ma")
    private Integer fan1CurrentMa;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Quality quality = Quality.VALID;

    private Integer rssi;
}
