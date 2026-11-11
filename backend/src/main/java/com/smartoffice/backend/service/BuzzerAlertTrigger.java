package com.smartoffice.backend.service;

import com.smartoffice.backend.config.SmartOfficeProperties;
import com.smartoffice.backend.domain.Alert;
import com.smartoffice.backend.domain.AlertType;
import com.smartoffice.backend.domain.Device;
import com.smartoffice.backend.domain.DeviceStatus;
import com.smartoffice.backend.domain.DeviceType;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Kích còi khi có cảnh báo môi trường quan trọng.
 * Dùng còi sẵn có (buzzer1), không thêm phần cứng. Có cooldown để tránh hú liên tục.
 */
@Component
@RequiredArgsConstructor
public class BuzzerAlertTrigger {

    private static final Logger log = LoggerFactory.getLogger(BuzzerAlertTrigger.class);
    private static final Set<AlertType> TRIGGER_TYPES = Set.of(
            AlertType.TEMP_HIGH,
            AlertType.AIR_BAD,
            AlertType.DOOR_LEFT_OPEN,
            AlertType.ENERGY_WASTE
    );

    private final SmartOfficeProperties properties;
    private final DeviceService deviceService;
    private final CommandService commandService;

    private final Map<String, Instant> lastTriggered = new ConcurrentHashMap<>();

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onAlertRaised(AlertRaisedEvent event) {
        if (!properties.getBuzzer().isAutoAlertEnabled()) {
            return;
        }
        Alert alert = event.alert();
        if (alert == null || !TRIGGER_TYPES.contains(alert.getType())) {
            return;
        }

        Device control = findControlDevice(alert.getRoomId());
        if (control == null) {
            return;
        }

        Instant now = Instant.now();
        Instant last = lastTriggered.get(control.getDeviceId());
        if (last != null && last.plusSeconds(properties.getBuzzer().getCooldownSeconds()).isAfter(now)) {
            return;
        }

        try {
            commandService.createAutomation(control.getDeviceId(), "buzzer1", "ALARM");
            lastTriggered.put(control.getDeviceId(), now);
            log.info("Kích còi {} do alert {} ({})", control.getDeviceId(), alert.getType(), alert.getSeverity());
        } catch (Exception ex) {
            // Thiết bị offline/MQTT lỗi không được làm hỏng luồng alert.
            log.warn("Không kích được còi {}: {}", control.getDeviceId(), ex.getMessage());
        }
    }

    private Device findControlDevice(String roomId) {
        List<Device> devices = deviceService.list(PageRequest.of(0, 10, Sort.by("deviceId"))).getContent();
        return devices.stream()
                .filter(device -> device.getType() == DeviceType.CONTROL)
                .filter(device -> device.getStatus() == DeviceStatus.ACTIVE)
                .filter(Device::isOnline)
                .filter(device -> roomId == null || roomId.equals(device.getRoomId()))
                .findFirst()
                .orElseGet(() -> devices.stream()
                        .filter(device -> device.getType() == DeviceType.CONTROL)
                        .filter(device -> device.getStatus() == DeviceStatus.ACTIVE)
                        .filter(Device::isOnline)
                        .findFirst()
                        .orElse(null));
    }
}
