package com.smartoffice.backend.repository;

import com.smartoffice.backend.domain.Device;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface DeviceRepository extends JpaRepository<Device, String> {

    Page<Device> findAllByOrderByDeviceIdAsc(Pageable pageable);

    List<Device> findByStatusIn(List<com.smartoffice.backend.domain.DeviceStatus> statuses);

    List<Device> findByStatusAndLastSeenAtBefore(
            com.smartoffice.backend.domain.DeviceStatus status, Instant before);

    List<Device> findByType(com.smartoffice.backend.domain.DeviceType type);
}
