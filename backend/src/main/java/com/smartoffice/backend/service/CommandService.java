package com.smartoffice.backend.service;

import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.api.dto.CommandDto;
import com.smartoffice.backend.api.dto.PageResponse;
import com.smartoffice.backend.config.SmartOfficeProperties;
import com.smartoffice.backend.domain.*;
import com.smartoffice.backend.mqtt.MqttService;
import com.smartoffice.backend.repository.CommandRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CommandService {

    private static final Logger log = LoggerFactory.getLogger(CommandService.class);

    private static final Set<String> RELAY_TARGETS = Set.of("light1", "fan1", "buzzer1");
    private static final Set<String> DOOR_TARGETS = Set.of("door1");

    private final CommandRepository commandRepository;
    private final DeviceService deviceService;
    private final MqttService mqttService;
    private final SmartOfficeProperties properties;
    private final AuditService auditService;

    @Transactional
    public Command create(String deviceId, String target, String action,
                          String issuedBy, String idempotencyKey) {
        Device device = deviceService.getRequired(deviceId);
        ensureControllable(device);
        validateTargetAction(target, action);

        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            Command existing = commandRepository.findByIdempotencyKey(idempotencyKey).orElse(null);
            if (existing != null) {
                if (!existing.getTarget().equals(target) || !existing.getAction().equals(action)) {
                    throw new ApiException(HttpStatus.CONFLICT, "COMMAND_DUPLICATE",
                            "Idempotency-Key đã dùng cho lệnh khác");
                }
                return existing;
            }
        }

        Command command = new Command();
        command.setDeviceId(deviceId);
        command.setTarget(target);
        command.setAction(action);
        command.setStatus(CommandStatus.PENDING);
        command.setIssuedBy(issuedBy);
        command.setIssuedAt(Instant.now());
        command.setIdempotencyKey(blankToNull(idempotencyKey));
        command.setLastSentAt(Instant.now());
        commandRepository.save(command);
        command.setCommandId(String.format("CMD-%04d", command.getId()));
        commandRepository.save(command);

        publishCommand(command);
        auditService.log(issuedBy, "COMMAND_SENT", deviceId + "/" + target, "PENDING");
        return command;
    }

    /** Dùng cho automation: không chịu ràng buộc idempotency, vẫn kiểm tra thiết bị ACTIVE. */
    public Command createAutomation(String deviceId, String target, String action) {
        return create(deviceId, target, action, "automation", null);
    }

    private void ensureControllable(Device device) {
        switch (device.getStatus()) {
            case LOCKED -> throw new ApiException(HttpStatus.CONFLICT, "DEVICE_LOCKED",
                    "Thiết bị đang bị khóa");
            case DECOMMISSIONED -> throw new ApiException(HttpStatus.CONFLICT, "DEVICE_DECOMMISSIONED",
                    "Thiết bị đã ngừng sử dụng");
            case ACTIVE -> { /* ok */ }
            case OFFLINE -> throw new ApiException(HttpStatus.CONFLICT, "DEVICE_OFFLINE",
                    "Thiết bị đang offline");
            default -> throw new ApiException(HttpStatus.CONFLICT, "DEVICE_NOT_ACTIVE",
                    "Thiết bị chưa ACTIVE (trạng thái hiện tại: " + device.getStatus() + ")");
        }
        if (device.getType() != DeviceType.CONTROL) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "Thiết bị " + device.getDeviceId() + " không phải node điều khiển");
        }
        if (deviceService.isTimedOut(device, Instant.now())) {
            throw new ApiException(HttpStatus.CONFLICT, "DEVICE_OFFLINE",
                    "Thiết bị quá 90 giây không gửi dữ liệu");
        }
    }

    private void validateTargetAction(String target, String action) {
        if (RELAY_TARGETS.contains(target)) {
            if (!Set.of("ON", "OFF").contains(action)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                        target + " chỉ nhận action ON/OFF");
            }
        } else if (DOOR_TARGETS.contains(target)) {
            if (!Set.of("OPEN", "CLOSE").contains(action)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                        "door1 chỉ nhận action OPEN/CLOSE");
            }
        } else {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "target không hợp lệ: " + target);
        }
    }

    private void publishCommand(Command command) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("commandId", command.getCommandId());
        payload.put("target", command.getTarget());
        payload.put("action", command.getAction());
        payload.put("issuedBy", command.getIssuedBy());

        String topic = "office/" + command.getDeviceId() + "/command";
        if (!mqttService.publish(topic, payload, false)) {
            command.setStatus(CommandStatus.FAILED);
            command.setMessage("MQTT_UNAVAILABLE");
            auditService.log(command.getIssuedBy(), "COMMAND_SENT",
                    command.getDeviceId() + "/" + command.getTarget(), "FAILED");
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MQTT_UNAVAILABLE",
                    "Không kết nối được MQTT broker");
        }
        command.setLastSentAt(Instant.now());
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public PageResponse<CommandDto> listByDevice(String deviceId, Pageable pageable) {
        return PageResponse.of(commandRepository.findByDeviceId(deviceId, pageable)
                .map(CommandDto::from));
    }

    public Command getByCommandId(String commandId) {        return commandRepository.findByCommandId(commandId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND",
                        "Không thấy command " + commandId));
    }

    /** Chờ ACK cho ?wait=true (tối đa 10 giây theo contract). */
    public Command awaitResult(String commandId, long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            Command command = getByCommandId(commandId);
            if (command.getStatus() != CommandStatus.PENDING) {
                return command;
            }
            try {
                Thread.sleep(150);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        Command command = getByCommandId(commandId);
        if (command.getStatus() == CommandStatus.PENDING) {
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "COMMAND_TIMEOUT",
                    "Hết thời gian chờ ACK cho " + commandId + " (" + command.getStatus() + ")");
        }
        return command;
    }

    /** Retry tối đa 2 lần rồi đánh TIMEOUT. */
    @Scheduled(fixedDelayString = "${smartoffice.rules.command-timeout-check-interval-ms:2000}")
    @Transactional
    public void handleTimeouts() {
        Instant now = Instant.now();
        List<Command> pending = commandRepository.findByStatus(CommandStatus.PENDING);
        for (Command command : pending) {
            Instant lastSent = command.getLastSentAt() != null
                    ? command.getLastSentAt() : command.getIssuedAt();
            long timeoutSeconds = "door1".equals(command.getTarget())
                    ? properties.getRules().getDoorCommandTimeoutSeconds()
                    : properties.getRules().getCommandTimeoutSeconds();

            if (lastSent.plusSeconds(timeoutSeconds).isAfter(now)) {
                continue;
            }
            if (command.getRetries() < properties.getRules().getCommandMaxRetries()) {
                command.setRetries(command.getRetries() + 1);
                command.setLastSentAt(now);
                log.warn("Retry {}/{} cho {}", command.getRetries(),
                        properties.getRules().getCommandMaxRetries(), command.getCommandId());
                try {
                    publishCommand(command);
                } catch (ApiException ex) {
                    log.warn("Không retry được {}: {}", command.getCommandId(), ex.getMessage());
                }
            } else {
                command.setStatus(CommandStatus.TIMEOUT);
                log.warn("Command {} TIMEOUT sau {} lần retry",
                        command.getCommandId(), command.getRetries());
                auditService.log(command.getIssuedBy(), "COMMAND_TIMEOUT",
                        command.getDeviceId() + "/" + command.getTarget(), "TIMEOUT");
            }
        }
    }

    public long latency(Command command) {
        if (command.getAckAt() == null) {
            return -1;
        }
        return Duration.between(command.getIssuedAt(), command.getAckAt()).toMillis();
    }
}
