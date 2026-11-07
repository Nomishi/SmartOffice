package com.smartoffice.backend.mqtt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartoffice.backend.config.SmartOfficeProperties;
import com.smartoffice.backend.domain.*;
import com.smartoffice.backend.repository.PowerReadingRepository;
import com.smartoffice.backend.repository.TelemetryRepository;
import com.smartoffice.backend.service.AckService;
import com.smartoffice.backend.service.AlertService;
import com.smartoffice.backend.service.DeviceService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Nhận bản tin MQTT, validate deviceId theo topic, lưu DB và bắn event cho rule engine.
 * Topic: office/{deviceId}/{telemetry|status|ack}
 */
@Service
@RequiredArgsConstructor
public class MqttIngestService {

    private static final Logger log = LoggerFactory.getLogger(MqttIngestService.class);

    private final ObjectMapper objectMapper;
    private final SmartOfficeProperties properties;
    private final DeviceService deviceService;
    private final AckService ackService;
    private final AlertService alertService;
    private final TelemetryRepository telemetryRepository;
    private final PowerReadingRepository powerReadingRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public void handle(String topic, String payloadJson) throws Exception {
        String[] parts = topic.split("/");
        if (parts.length != 3 || !"office".equals(parts[0])) {
            log.warn("Topic không đúng contract, bỏ qua: {}", topic);
            return;
        }
        String topicDeviceId = parts[1];
        String kind = parts[2];

        JsonNode node = objectMapper.readTree(payloadJson);

        // Contract mục 6: deviceId trong payload phải trùng deviceId trong topic.
        String payloadDeviceId = node.path("deviceId").asText(null);
        if (payloadDeviceId != null && !payloadDeviceId.equals(topicDeviceId)) {
            log.warn("deviceId payload ({}) khác topic ({}), bỏ bản tin",
                    payloadDeviceId, topicDeviceId);
            return;
        }

        switch (kind) {
            case "telemetry" -> handleTelemetry(topicDeviceId, node);
            case "status" -> handleStatus(topicDeviceId, node);
            case "ack" -> ackService.handle(node);
            default -> log.debug("Bỏ qua topic không hỗ trợ: {}", topic);
        }
    }

    private void handleTelemetry(String deviceId, JsonNode node) {
        boolean envLike = !node.has("busVoltageV") && !node.has("light1PowerW")
                && !node.has("fan1PowerW");
        Device device = deviceService.getOrAutoRegister(deviceId, envLike);
        if (device.getStatus() == DeviceStatus.LOCKED
                || device.getStatus() == DeviceStatus.DECOMMISSIONED) {
            log.warn("Nhận telemetry từ thiết bị {} đang {}", deviceId, device.getStatus());
            return;
        }

        Instant now = Instant.now();
        Quality quality = parseQuality(node);
        if (!node.hasNonNull("quality")) {
            log.warn("Telemetry từ {} thiếu quality, tạm coi VALID (firmware cũ)", deviceId);
        }

        if (device.getType() == DeviceType.ENV) {
            Telemetry telemetry = new Telemetry();
            telemetry.setDeviceId(deviceId);
            telemetry.setReceivedAt(now);
            telemetry.setDeviceTs(parseInstant(node.path("ts").asText(null)));
            telemetry.setTemperature(doubleOrNull(node, "temperature"));
            telemetry.setHumidity(doubleOrNull(node, "humidity"));
            telemetry.setLux(doubleOrNull(node, "lux"));
            telemetry.setPresence(boolOrNull(node, "presence"));
            telemetry.setQuality(quality);
            telemetry.setAirRaw(intOrNull(node, "airRaw"));
            telemetry.setDistanceCm(intOrNull(node, "distanceCm"));
            telemetry.setMovingEnergy(intOrNull(node, "movingEnergy"));
            telemetry.setStaticEnergy(intOrNull(node, "staticEnergy"));
            telemetry.setRssi(intOrNull(node, "rssi"));
            telemetryRepository.save(telemetry);

            deviceService.applyTelemetry(device, quality, telemetry.getPresence(), now);
            deviceService.recordSeen(device, now);

            eventPublisher.publishEvent(new TelemetryStoredEvent(deviceId, DeviceType.ENV, now,
                    quality, telemetry.getTemperature(), telemetry.getPresence(), telemetry.getAirRaw()));
        } else {
            PowerReading reading = new PowerReading();
            reading.setDeviceId(deviceId);
            reading.setReceivedAt(now);
            reading.setBusVoltageV(doubleOrNull(node, "busVoltageV"));
            reading.setLight1PowerW(doubleOrNull(node, "light1PowerW"));
            reading.setLight1CurrentMa(intOrNull(node, "light1CurrentMa"));
            reading.setFan1PowerW(doubleOrNull(node, "fan1PowerW"));
            reading.setFan1CurrentMa(intOrNull(node, "fan1CurrentMa"));
            reading.setQuality(quality);
            reading.setRssi(intOrNull(node, "rssi"));
            powerReadingRepository.save(reading);

            deviceService.applyTelemetry(device, quality, null, now);
            deviceService.recordSeen(device, now);

            eventPublisher.publishEvent(new TelemetryStoredEvent(deviceId, DeviceType.CONTROL, now,
                    quality, null, null, null));
        }
    }

    private void handleStatus(String deviceId, JsonNode node) {
        boolean envLike = deviceId.contains("env");
        Device device = deviceService.getOrAutoRegister(deviceId, envLike);
        Instant now = Instant.now();

        boolean online = node.path("online").asBoolean(true);
        if (!online) {
            deviceService.markOffline(device, now);
            alertService.raise(AlertType.DEVICE_OFFLINE, AlertSeverity.HIGH,
                    deviceId, device.getRoomId(), null,
                    (double) properties.getRules().getOfflineTimeoutSeconds(),
                    "Thiết bị gửi LWT offline / mất kết nối");
            return;
        }

        deviceService.applyStatus(device, node, now);
        deviceService.recordSeen(device, now);
    }

    private Quality parseQuality(JsonNode node) {
        String raw = node.path("quality").asText("VALID");
        try {
            return Quality.valueOf(raw.toUpperCase());
        } catch (IllegalArgumentException ex) {
            log.warn("quality lạ '{}', coi VALID", raw);
            return Quality.VALID;
        }
    }

    private Instant parseInstant(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(raw);
        } catch (Exception ex) {
            return null;
        }
    }

    private Double doubleOrNull(JsonNode node, String field) {
        return node.hasNonNull(field) && node.get(field).isNumber() ? node.get(field).asDouble() : null;
    }

    private Integer intOrNull(JsonNode node, String field) {
        return node.hasNonNull(field) && node.get(field).isNumber() ? node.get(field).asInt() : null;
    }

    private Boolean boolOrNull(JsonNode node, String field) {
        return node.hasNonNull(field) && node.get(field).isBoolean() ? node.get(field).asBoolean() : null;
    }
}
