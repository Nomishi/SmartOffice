package com.smartoffice.backend.repository;

import com.smartoffice.backend.domain.Telemetry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;

public interface TelemetryRepository extends JpaRepository<Telemetry, Long> {

    Page<Telemetry> findByDeviceIdAndReceivedAtBetween(
            String deviceId, Instant from, Instant to, Pageable pageable);

    Optional<Telemetry> findFirstByDeviceIdOrderByReceivedAtDesc(String deviceId);

    long deleteByReceivedAtBefore(Instant before);
}
