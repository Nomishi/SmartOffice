package com.smartoffice.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartoffice.backend.domain.*;
import com.smartoffice.backend.repository.CommandRepository;
import com.smartoffice.backend.repository.DeviceConfigRepository;
import com.smartoffice.backend.repository.DeviceRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/** Xử lý ACK từ M2 (command + config), cập nhật trạng thái lệnh và actuator. */
@Service
@RequiredArgsConstructor
public class AckService {

    private static final Logger log = LoggerFactory.getLogger(AckService.class);

    private final CommandRepository commandRepository;
    private final DeviceConfigRepository deviceConfigRepository;
    private final DeviceRepository deviceRepository;
    private final DeviceService deviceService;

    @Transactional
    public void handle(JsonNode ack) {
        if (ack.hasNonNull("commandId")) {
            handleCommandAck(ack);
        } else if (ack.hasNonNull("configId")) {
            handleConfigAck(ack);
        } else {
            log.warn("ACK thiếu commandId/configId: {}", ack);
        }
    }

    private void handleCommandAck(JsonNode ack) {
        String commandId = ack.get("commandId").asText();
        Command command = commandRepository.findByCommandId(commandId).orElse(null);
        if (command == null) {
            log.warn("ACK cho command không tồn tại: {}", commandId);
            return;
        }
        // ACK trùng (QoS 1) không được ghi đè kết quả cuối.
        if (command.getStatus() != CommandStatus.PENDING) {
            log.debug("Bỏ qua ACK trùng cho {} (status={})", commandId, command.getStatus());
            return;
        }

        CommandStatus status = "SUCCESS".equalsIgnoreCase(ack.path("status").asText())
                ? CommandStatus.SUCCESS : CommandStatus.FAILED;
        Instant now = Instant.now();
        command.setStatus(status);
        command.setAckAt(now);
        if (ack.hasNonNull("latencyMs")) {
            command.setLatencyMs(ack.get("latencyMs").asLong());
        } else {
            command.setLatencyMs(Duration.between(command.getIssuedAt(), now).toMillis());
        }
        if (ack.hasNonNull("message")) {
            command.setMessage(ack.get("message").asText());
        }
        log.info("ACK {} -> {} ({} ms)", commandId, status, command.getLatencyMs());

        if (status == CommandStatus.SUCCESS) {
            deviceRepository.findById(command.getDeviceId()).ifPresent(device -> {
                String state = ack.path("state").asText(null);
                if (state == null) {
                    state = switch (command.getAction()) {
                        case "CLOSE" -> "CLOSED";
                        case "OPEN" -> "OPEN";
                        default -> command.getAction();
                    };
                }
                deviceService.applyActuator(device, command.getTarget(), state);
            });
        }
    }

    private void handleConfigAck(JsonNode ack) {
        String configId = ack.get("configId").asText();
        DeviceConfig config = deviceConfigRepository.findByConfigId(configId).orElse(null);
        if (config == null) {
            log.warn("ACK cho config không tồn tại: {}", configId);
            return;
        }
        if (config.getStatus() != CommandStatus.PENDING) {
            return;
        }
        config.setStatus("SUCCESS".equalsIgnoreCase(ack.path("status").asText())
                ? CommandStatus.SUCCESS : CommandStatus.FAILED);
        config.setAckAt(Instant.now());
        log.info("ACK config {} -> {}", configId, config.getStatus());
    }
}
