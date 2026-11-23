package com.smartoffice.backend.repository;

import com.smartoffice.backend.domain.DeviceConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DeviceConfigRepository extends JpaRepository<DeviceConfig, Long> {

    Optional<DeviceConfig> findByConfigId(String configId);

    Optional<DeviceConfig> findFirstByDeviceIdAndStatus(
            String deviceId, com.smartoffice.backend.domain.CommandStatus status);

    List<DeviceConfig> findByDeviceIdAndStatusOrderByIssuedAtAsc(
            String deviceId, com.smartoffice.backend.domain.CommandStatus status);
}
