package com.smartoffice.backend.repository;

import com.smartoffice.backend.domain.Alert;
import com.smartoffice.backend.domain.AlertType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

public interface AlertRepository extends JpaRepository<Alert, Long>, JpaSpecificationExecutor<Alert> {

    Optional<Alert> findFirstByTypeAndDeviceIdAndResolvedAtIsNull(AlertType type, String deviceId);

    Optional<Alert> findFirstByTypeAndDeviceIdOrderByCreatedAtDesc(AlertType type, String deviceId);
}
