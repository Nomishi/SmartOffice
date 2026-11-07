package com.smartoffice.backend.repository;

import com.smartoffice.backend.domain.PowerReading;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface PowerReadingRepository extends JpaRepository<PowerReading, Long> {

    List<PowerReading> findByDeviceIdAndReceivedAtBetweenOrderByReceivedAtAsc(
            String deviceId, Instant from, Instant to);

    Optional<PowerReading> findFirstByDeviceIdOrderByReceivedAtDesc(String deviceId);

    long deleteByReceivedAtBefore(Instant before);
}
