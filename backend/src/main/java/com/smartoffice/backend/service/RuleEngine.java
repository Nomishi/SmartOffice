package com.smartoffice.backend.service;

import com.smartoffice.backend.config.SmartOfficeProperties;
import com.smartoffice.backend.domain.*;
import com.smartoffice.backend.mqtt.TelemetryStoredEvent;
import com.smartoffice.backend.repository.DeviceRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Rule engine chạy đồng bộ sau mỗi telemetry đã lưu DB.
 * Chỉ dùng bản tin VALID cho TEMP_HIGH / AIR_BAD; SENSOR_FAULT đếm streak INVALID/VALID.
 */
@Service
@RequiredArgsConstructor
public class RuleEngine {

    private static final Logger log = LoggerFactory.getLogger(RuleEngine.class);

    private final RuleService ruleService;
    private final AlertService alertService;
    private final DeviceRepository deviceRepository;
    private final SmartOfficeProperties properties;

    @EventListener
    public void onTelemetry(TelemetryStoredEvent event) {
        Device device = deviceRepository.findById(event.deviceId()).orElse(null);
        if (device == null) {
            return;
        }
        if (device.getStatus() == DeviceStatus.DECOMMISSIONED) {
            return;
        }

        // Có bất kỳ dữ liệu mới => thiết bị online trở lại.
        alertService.resolve(AlertType.DEVICE_OFFLINE, device.getDeviceId());

        evaluateSensorFault(device, event.quality());

        if (event.deviceType() != DeviceType.ENV || event.quality() != Quality.VALID) {
            return;
        }
        evaluateTempHigh(device, event.temperature());
        evaluateAirBad(device, event.airRaw());
    }

    private void evaluateSensorFault(Device device, Quality quality) {
        if (quality == Quality.INVALID
                && device.getInvalidStreak() >= properties.getRules().getSensorFaultInvalidStreak()) {
            device.setStatus(DeviceStatus.FAULT);
            alertService.raise(AlertType.SENSOR_FAULT, AlertSeverity.HIGH, device.getDeviceId(),
                    device.getRoomId(), (double) device.getInvalidStreak(), null,
                    "Cảm biến lỗi: " + device.getInvalidStreak() + " bản tin INVALID liên tiếp");
        } else if (quality == Quality.VALID
                && device.getValidStreak() >= properties.getRules().getSensorFaultRecoverStreak()) {
            alertService.resolve(AlertType.SENSOR_FAULT, device.getDeviceId());
            if (device.getStatus() == DeviceStatus.FAULT) {
                device.setStatus(DeviceStatus.ACTIVE);
                log.info("Thiết bị {} hồi phục sau SENSOR_FAULT", device.getDeviceId());
            }
        }
    }

    private void evaluateTempHigh(Device device, Double temperature) {
        Rule rule = ruleService.enabledRule(RuleType.TEMP_HIGH).orElse(null);
        if (rule == null || temperature == null) {
            return;
        }
        Map<String, Object> params = ruleService.paramsOf(rule);
        double threshold = ruleService.doubleParam(params, "thresholdC", 30);
        int consecutive = ruleService.intParam(params, "consecutiveSamples", 3);

        if (temperature > threshold) {
            device.setTempHighStreak(device.getTempHighStreak() + 1);
        } else {
            device.setTempHighStreak(0);
            alertService.resolve(AlertType.TEMP_HIGH, device.getDeviceId());
        }

        if (device.getTempHighStreak() >= consecutive) {
            alertService.raise(AlertType.TEMP_HIGH, severity(rule), device.getDeviceId(),
                    device.getRoomId(), temperature, threshold,
                    "Nhiệt độ " + temperature + "°C vượt ngưỡng " + threshold + "°C");
        }
    }

    private void evaluateAirBad(Device device, Integer airRaw) {
        Rule rule = ruleService.enabledRule(RuleType.AIR_BAD).orElse(null);
        if (rule == null || airRaw == null) {
            return;
        }
        Map<String, Object> params = ruleService.paramsOf(rule);
        double threshold = ruleService.doubleParam(params, "thresholdRaw", 2000);
        int consecutive = ruleService.intParam(params, "consecutiveSamples", 3);

        if (airRaw > threshold) {
            device.setAirBadStreak(device.getAirBadStreak() + 1);
        } else {
            device.setAirBadStreak(0);
            alertService.resolve(AlertType.AIR_BAD, device.getDeviceId());
        }

        if (device.getAirBadStreak() >= consecutive) {
            alertService.raise(AlertType.AIR_BAD, severity(rule), device.getDeviceId(),
                    device.getRoomId(), (double) airRaw, threshold,
                    "Không khí xấu: airRaw " + airRaw + " vượt ngưỡng " + threshold);
        }
    }

    private AlertSeverity severity(Rule rule) {
        Object raw = ruleService.actionOf(rule).get("severity");
        if (raw != null) {
            try {
                return AlertSeverity.valueOf(String.valueOf(raw).toUpperCase());
            } catch (IllegalArgumentException ignored) {
                // fallback
            }
        }
        return AlertSeverity.MEDIUM;
    }
}
