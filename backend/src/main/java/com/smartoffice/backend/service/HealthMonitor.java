package com.smartoffice.backend.service;

import com.smartoffice.backend.config.SmartOfficeProperties;
import com.smartoffice.backend.domain.AlertSeverity;
import com.smartoffice.backend.domain.AlertType;
import com.smartoffice.backend.domain.Device;
import com.smartoffice.backend.domain.DeviceStatus;
import com.smartoffice.backend.repository.DeviceRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/** Phát hiện mất heartbeat: quá 90 giây không có status/telemetry -> OFFLINE + alert. */
@Service
@RequiredArgsConstructor
public class HealthMonitor {

    private static final Logger log = LoggerFactory.getLogger(HealthMonitor.class);

    private final DeviceRepository deviceRepository;
    private final DeviceService deviceService;
    private final AlertService alertService;
    private final SmartOfficeProperties properties;

    @Scheduled(fixedDelayString = "${smartoffice.rules.offline-check-interval-ms:15000}")
    @Transactional
    public void checkHeartbeats() {
        Instant now = Instant.now();
        List<Device> devices = deviceRepository.findAll();

        for (Device device : devices) {
            if (device.getStatus() == DeviceStatus.DECOMMISSIONED
                    || device.getStatus() == DeviceStatus.MAINTENANCE
                    || device.getStatus() == DeviceStatus.LOCKED) {
                continue;
            }

            boolean timedOut = deviceService.isTimedOut(device, now);
            boolean neverSeen = device.getLastSeenAt() == null;

            if (timedOut && !neverSeen) {
                if (device.isOnline()) {
                    log.warn("Mất heartbeat thiết bị {} (lastSeen={})",
                            device.getDeviceId(), device.getLastSeenAt());
                    deviceService.markOffline(device, now);
                }
                alertService.raise(AlertType.DEVICE_OFFLINE, AlertSeverity.HIGH,
                        device.getDeviceId(), device.getRoomId(), null,
                        (double) properties.getRules().getOfflineTimeoutSeconds(),
                        "Thiết bị mất heartbeat quá "
                                + properties.getRules().getOfflineTimeoutSeconds() + " giây");
            } else if (!timedOut) {
                alertService.resolve(AlertType.DEVICE_OFFLINE, device.getDeviceId());
            }
        }
    }
}
