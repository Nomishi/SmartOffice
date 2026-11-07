package com.smartoffice.backend.service;

import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.api.dto.ConfigDto;
import com.smartoffice.backend.api.dto.ConfigRequest;
import com.smartoffice.backend.domain.CommandStatus;
import com.smartoffice.backend.domain.Device;
import com.smartoffice.backend.domain.DeviceConfig;
import com.smartoffice.backend.domain.DeviceStatus;
import com.smartoffice.backend.mqtt.MqttService;
import com.smartoffice.backend.repository.DeviceConfigRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ConfigService {

    private static final Logger log = LoggerFactory.getLogger(ConfigService.class);

    private final DeviceConfigRepository deviceConfigRepository;
    private final DeviceService deviceService;
    private final MqttService mqttService;
    private final ObjectMapper objectMapper;
    private final AuditService auditService;

    @Transactional
    public ConfigDto send(String deviceId, ConfigRequest request, String issuedBy) {
        Device device = deviceService.getRequired(deviceId);
        if (device.getStatus() != DeviceStatus.ACTIVE) {
            throw new ApiException(HttpStatus.CONFLICT, "DEVICE_NOT_ACTIVE",
                    "Thiết bị chưa ACTIVE");
        }
        deviceConfigRepository.findFirstByDeviceIdAndStatus(deviceId, CommandStatus.PENDING)
                .ifPresent(pending -> {
                    throw new ApiException(HttpStatus.CONFLICT, "CONFIG_CONFLICT",
                            "Đang có config chờ ACK: " + pending.getConfigId());
                });

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("configId", null); // điền sau khi có id
        if (request.telemetryIntervalSec() != null) {
            payload.put("telemetryIntervalSec", request.telemetryIntervalSec());
        }
        if (request.servoOpenDeg() != null) {
            payload.put("servoOpenDeg", request.servoOpenDeg());
        }
        if (request.servoCloseDeg() != null) {
            payload.put("servoCloseDeg", request.servoCloseDeg());
        }
        payload.put("issuedBy", issuedBy);

        DeviceConfig config = new DeviceConfig();
        config.setDeviceId(deviceId);
        config.setPayloadJson(writeJson(payload));
        config.setIssuedBy(issuedBy);
        config.setIssuedAt(Instant.now());
        config.setLastSentAt(Instant.now());
        deviceConfigRepository.save(config);
        config.setConfigId(String.format("CFG-%04d", config.getId()));

        payload.put("configId", config.getConfigId());
        config.setPayloadJson(writeJson(payload));
        deviceConfigRepository.save(config);

        String topic = "office/" + deviceId + "/config";
        if (!mqttService.publish(topic, payload, true)) {
            config.setStatus(CommandStatus.FAILED);
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MQTT_UNAVAILABLE",
                    "Không kết nối được MQTT broker");
        }
        auditService.log(issuedBy, "CONFIG_SENT", deviceId, "PENDING");
        return toDto(config);
    }

    @Transactional
    @Scheduled(fixedDelayString = "${smartoffice.rules.command-timeout-check-interval-ms:2000}")
    public void handleTimeouts() {
        Instant threshold = Instant.now().minusSeconds(10);
        List<DeviceConfig> pending = deviceConfigRepository.findAll().stream()
                .filter(c -> c.getStatus() == CommandStatus.PENDING)
                .filter(c -> (c.getLastSentAt() != null ? c.getLastSentAt() : c.getIssuedAt())
                        .isBefore(threshold))
                .toList();
        for (DeviceConfig config : pending) {
            config.setStatus(CommandStatus.TIMEOUT);
            log.warn("Config {} TIMEOUT", config.getConfigId());
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                    "Không serialize được config");
        }
    }

    private ConfigDto toDto(DeviceConfig config) {        return new ConfigDto(config.getConfigId(), config.getDeviceId(),
                config.getStatus().name(), config.getIssuedBy(),
                config.getIssuedAt(), config.getAckAt());
    }
}
