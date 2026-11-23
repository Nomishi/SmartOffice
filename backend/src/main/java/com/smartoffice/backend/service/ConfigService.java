package com.smartoffice.backend.service;

import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.api.dto.ConfigDto;
import com.smartoffice.backend.api.dto.ConfigRequest;
import com.smartoffice.backend.api.dto.CurrentConfigDto;
import com.smartoffice.backend.domain.CommandStatus;
import com.smartoffice.backend.domain.Device;
import com.smartoffice.backend.domain.DeviceConfig;
import com.smartoffice.backend.domain.DeviceStatus;
import com.smartoffice.backend.domain.DeviceType;
import com.smartoffice.backend.mqtt.MqttService;
import com.smartoffice.backend.repository.DeviceConfigRepository;
import com.fasterxml.jackson.databind.JsonNode;
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

    // Giá trị mặc định của firmware (firmware/node-*/config.h) khi chưa từng gửi config.
    static final int DEFAULT_TELEMETRY_INTERVAL_SEC = 5;
    static final int DEFAULT_SERVO_OPEN_DEG = 90;
    static final int DEFAULT_SERVO_CLOSE_DEG = 0;

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

    /**
     * Cấu hình đang áp dụng: gộp các config thiết bị đã ACK SUCCESS theo thứ tự thời gian
     * (mỗi config có thể chỉ chứa một vài trường). Firmware lưu config vào flash và nhận lại config
     * retained khi khởi động, nên config SUCCESS mới nhất chính là giá trị thiết bị đang chạy.
     */
    @Transactional(readOnly = true)
    public CurrentConfigDto current(String deviceId) {
        Device device = deviceService.getRequired(deviceId);
        boolean control = device.getType() == DeviceType.CONTROL;

        Integer interval = DEFAULT_TELEMETRY_INTERVAL_SEC;
        Integer openDeg = control ? DEFAULT_SERVO_OPEN_DEG : null;
        Integer closeDeg = control ? DEFAULT_SERVO_CLOSE_DEG : null;
        DeviceConfig last = null;
        for (DeviceConfig config : deviceConfigRepository
                .findByDeviceIdAndStatusOrderByIssuedAtAsc(deviceId, CommandStatus.SUCCESS)) {
            JsonNode payload = readJson(config.getPayloadJson());
            if (payload == null) {
                continue;
            }
            interval = intOr(payload, "telemetryIntervalSec", interval);
            if (control) {
                openDeg = intOr(payload, "servoOpenDeg", openDeg);
                closeDeg = intOr(payload, "servoCloseDeg", closeDeg);
            }
            last = config;
        }
        String pendingId = deviceConfigRepository.findFirstByDeviceIdAndStatus(deviceId, CommandStatus.PENDING)
                .map(DeviceConfig::getConfigId).orElse(null);
        return new CurrentConfigDto(deviceId, interval, openDeg, closeDeg,
                last != null ? "ACKED" : "DEFAULT",
                last != null ? last.getConfigId() : null,
                last != null ? last.getAckAt() : null,
                pendingId);
    }

    private JsonNode readJson(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(json);
        } catch (Exception ex) {
            log.warn("Payload config hỏng: {}", ex.getMessage());
            return null;
        }
    }

    private static Integer intOr(JsonNode node, String field, Integer fallback) {
        JsonNode value = node.get(field);
        return value != null && value.canConvertToInt() ? Integer.valueOf(value.asInt()) : fallback;
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
