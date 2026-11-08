package com.smartoffice.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.config.SmartOfficeProperties;
import com.smartoffice.backend.domain.*;
import com.smartoffice.backend.repository.DeviceRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class DeviceService {

    private static final Logger log = LoggerFactory.getLogger(DeviceService.class);

    private final DeviceRepository deviceRepository;
    private final SmartOfficeProperties properties;

    public org.springframework.data.domain.Page<Device> list(
            org.springframework.data.domain.Pageable pageable) {
        return deviceRepository.findAll(pageable);
    }

    public Device getRequired(String deviceId) {
        return deviceRepository.findById(deviceId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND",
                        "Không thấy thiết bị " + deviceId));
    }

    /** Đăng ký thủ công (Admin). Thiết bị mới ở trạng thái REGISTERED, chờ activate. */
    @Transactional
    public Device register(com.smartoffice.backend.api.dto.CreateDeviceRequest request) {
        if (deviceRepository.existsById(request.deviceId())) {
            throw new ApiException(HttpStatus.CONFLICT, "DEVICE_EXISTS",
                    "Thiết bị đã tồn tại: " + request.deviceId());
        }
        Device device = new Device();
        device.setDeviceId(request.deviceId().trim());
        device.setName(request.name().trim());
        device.setType(request.type());
        device.setStatus(DeviceStatus.REGISTERED);
        device.setMode(Mode.AUTO);
        device.setRoomId(request.roomId() == null || request.roomId().isBlank()
                ? "room-01" : request.roomId().trim());
        device.setFwVersion(request.fwVersion());
        device.setOnline(false);
        device.setRegisteredAt(Instant.now());
        device.setUpdatedAt(Instant.now());
        log.info("Đăng ký thiết bị {} (type={})", device.getDeviceId(), device.getType());
        return deviceRepository.save(device);
    }

    /**
     * Thiết bị phải được đăng ký trước (contract mục 11). Flag auto-register chỉ dùng cho
     * giai đoạn mock/dev để M1/M3 chạy song song không cần M2.
     */
    @Transactional
    public Device getOrAutoRegister(String deviceId, boolean envLike) {
        return deviceRepository.findById(deviceId).orElseGet(() -> {
            if (!properties.getMqtt().isAutoRegisterUnknownDevices()) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND",
                        "Thiết bị chưa được đăng ký: " + deviceId);
            }
            Device device = new Device();
            device.setDeviceId(deviceId);
            device.setName(deviceId);
            device.setType(envLike ? DeviceType.ENV : DeviceType.CONTROL);
            device.setStatus(DeviceStatus.ACTIVE);
            device.setRoomId("room-01");
            device.setRegisteredAt(Instant.now());
            log.warn("Tự đăng ký thiết bị lạ {} (type={}) - dev mode", deviceId, device.getType());
            return deviceRepository.save(device);
        });
    }

    @Transactional
    public void recordSeen(Device device, Instant at) {
        device.setLastSeenAt(at);
        device.setOnline(true);
        device.setUpdatedAt(at);
        if (device.getStatus() == DeviceStatus.OFFLINE) {
            device.setStatus(DeviceStatus.ACTIVE);
            log.info("Thiết bị {} online trở lại", device.getDeviceId());
        }
    }

    @Transactional
    public void markOffline(Device device, Instant at) {
        device.setOnline(false);
        device.setUpdatedAt(at);
        if (device.getStatus() == DeviceStatus.ACTIVE) {
            device.setStatus(DeviceStatus.OFFLINE);
        }
        log.info("Thiết bị {} offline", device.getDeviceId());
    }

    /** Cập nhật streak chất lượng + trạng thái hiện diện (chỉ dùng dữ liệu VALID). */
    @Transactional
    public void applyTelemetry(Device device, Quality quality, Boolean presence, Instant at) {
        if (quality == Quality.INVALID) {
            device.setInvalidStreak(device.getInvalidStreak() + 1);
            device.setValidStreak(0);
        } else if (quality == Quality.VALID) {
            device.setValidStreak(device.getValidStreak() + 1);
            device.setInvalidStreak(0);
        } else {
            // SUSPECT phá chuỗi: không tính là VALID liên tiếp, cũng không phải INVALID liên tiếp.
            device.setInvalidStreak(0);
            device.setValidStreak(0);
        }

        if (quality == Quality.VALID && presence != null) {
            if (presence) {
                device.setEmptySince(null);
            } else if (device.getEmptySince() == null) {
                device.setEmptySince(at);
            }
        }
        device.setUpdatedAt(at);
    }

    @Transactional
    public void applyStatus(Device device, JsonNode node, Instant at) {
        if (node.hasNonNull("mode")) {
            try {
                device.setMode(Mode.valueOf(node.get("mode").asText()));
            } catch (IllegalArgumentException ignored) {
                log.warn("Mode lạ từ {}: {}", device.getDeviceId(), node.get("mode").asText());
            }
        }
        if (node.hasNonNull("fwVersion")) {
            device.setFwVersion(node.get("fwVersion").asText());
        }
        applyActuatorIfPresent(device, "light1", node);
        applyActuatorIfPresent(device, "fan1", node);
        applyActuatorIfPresent(device, "buzzer1", node);
        if (node.hasNonNull("door1")) {
            String door = node.get("door1").asText();
            device.setDoor1(door);
            if ("OPEN".equals(door)) {
                if (device.getDoorOpenSince() == null) {
                    device.setDoorOpenSince(at);
                }
            } else {
                device.setDoorOpenSince(null);
            }
        }
        device.setUpdatedAt(at);
    }

    private void applyActuatorIfPresent(Device device, String field, JsonNode node) {
        if (node.hasNonNull(field)) {
            applyActuator(device, field, node.get(field).asText());
        }
    }

    @Transactional
    public void applyActuator(Device device, String target, String state) {
        if (state == null) {
            return;
        }
        switch (target) {
            case "light1" -> device.setLight1(normalizeRelay(state));
            case "fan1" -> device.setFan1(normalizeRelay(state));
            case "buzzer1" -> device.setBuzzer1(normalizeRelay(state));
            case "door1" -> device.setDoor1(normalizeDoor(state));
            default -> log.debug("Actuator lạ: {}", target);
        }
        Instant at = Instant.now();
        if ("door1".equals(target)) {
            device.setDoorOpenSince("OPEN".equals(device.getDoor1()) ? at : null);
        }
        device.setUpdatedAt(at);
    }

    private String normalizeRelay(String state) {
        return "ON".equalsIgnoreCase(state) ? "ON" : "OFF";
    }

    private String normalizeDoor(String state) {
        return "OPEN".equalsIgnoreCase(state) ? "OPEN" : "CLOSED";
    }

    @Transactional
    public Device setMode(String deviceId, Mode mode) {
        Device device = getRequired(deviceId);
        device.setMode(mode);
        device.setUpdatedAt(Instant.now());
        return device;
    }

    public boolean isTimedOut(Device device, Instant now) {
        if (device.getLastSeenAt() == null) {
            return true;
        }
        return device.getLastSeenAt()
                .plusSeconds(properties.getRules().getOfflineTimeoutSeconds())
                .isBefore(now);
    }

    public Device save(Device device) {
        return deviceRepository.save(device);
    }
}
