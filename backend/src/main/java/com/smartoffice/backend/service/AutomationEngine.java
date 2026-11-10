package com.smartoffice.backend.service;

import com.smartoffice.backend.config.SmartOfficeProperties;
import com.smartoffice.backend.domain.*;
import com.smartoffice.backend.repository.DeviceRepository;
import com.smartoffice.backend.repository.PowerReadingRepository;
import com.smartoffice.backend.repository.TelemetryRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

/**
 * Automation dựa trên thời gian: phòng trống, cửa mở lâu, lãng phí điện.
 * Không ghi đè lệnh tay: chỉ chạy khi device.mode = AUTO.
 */
@Service
@RequiredArgsConstructor
public class AutomationEngine {

    private static final Logger log = LoggerFactory.getLogger(AutomationEngine.class);
    private static final long ACTION_COOLDOWN_SECONDS = 60;

    private final DeviceRepository deviceRepository;
    private final TelemetryRepository telemetryRepository;
    private final PowerReadingRepository powerReadingRepository;
    private final RuleService ruleService;
    private final AlertService alertService;
    private final CommandService commandService;
    private final SmartOfficeProperties properties;

    @Scheduled(fixedDelayString = "${smartoffice.rules.automation-check-interval-ms:10000}")
    @Transactional
    public void run() {
        Instant now = Instant.now();
        List<Device> envDevices = deviceRepository.findByType(DeviceType.ENV);
        List<Device> controlDevices = deviceRepository.findByType(DeviceType.CONTROL);

        ruleService.enabledRule(RuleType.ABSENCE_OFF)
                .ifPresent(rule -> evaluateAbsence(envDevices, controlDevices, rule, now));
        ruleService.enabledRule(RuleType.DOOR_OPEN_LIMIT)
                .ifPresent(rule -> evaluateDoor(controlDevices, rule, now));
        ruleService.enabledRule(RuleType.ENERGY_WASTE)
                .ifPresent(rule -> evaluateEnergyWaste(envDevices, controlDevices, rule, now));
    }

    private void evaluateAbsence(List<Device> envDevices, List<Device> controlDevices,
                                 Rule rule, Instant now) {
        Map<String, Object> params = ruleService.paramsOf(rule);
        int absenceMinutes = ruleService.intParam(params, "absenceMinutes", 10);
        List<String> targets = ruleService.stringListParam(params, "targets",
                List.of("light1", "fan1"));

        for (Device env : envDevices) {
            if (!isRoomEmptyLongEnough(env, absenceMinutes, now)) {
                continue;
            }
            if (env.getLastAbsenceActionAt() != null
                    && env.getLastAbsenceActionAt().plusSeconds(ACTION_COOLDOWN_SECONDS).isAfter(now)) {
                continue;
            }

            boolean sent = false;
            for (Device control : controlDevices) {
                if (!isOnline(control, now) || control.getMode() != Mode.AUTO) {
                    continue;
                }
                for (String target : targets) {
                    if (!"OFF".equals(actuatorState(control, target))) {
                        log.info("AUTO: phòng trống {} phút, tắt {}/{}", absenceMinutes,
                                control.getDeviceId(), target);
                        try {
                            commandService.createAutomation(control.getDeviceId(), target, "OFF");
                            sent = true;
                        } catch (Exception ex) {
                            log.warn("Không gửi được lệnh tắt {}: {}", target, ex.getMessage());
                        }
                    }
                }
            }
            if (sent) {
                env.setLastAbsenceActionAt(now);
            }
        }
    }

    private void evaluateDoor(List<Device> controlDevices, Rule rule, Instant now) {
        int openMinutes = ruleService.intParam(ruleService.paramsOf(rule), "openMinutes", 5);
        for (Device control : controlDevices) {
            if (control.getDoorOpenSince() == null) {
                alertService.resolve(AlertType.DOOR_LEFT_OPEN, control.getDeviceId());
                continue;
            }
            long openFor = ChronoUnit.MINUTES.between(control.getDoorOpenSince(), now);
            if (openFor >= openMinutes && isOnline(control, now)) {
                alertService.raise(AlertType.DOOR_LEFT_OPEN, AlertSeverity.MEDIUM,
                        control.getDeviceId(), control.getRoomId(), (double) openFor,
                        (double) openMinutes,
                        "Cửa mở " + openFor + " phút (ngưỡng " + openMinutes + " phút)");
            } else {
                alertService.resolve(AlertType.DOOR_LEFT_OPEN, control.getDeviceId());
            }
        }
    }

    private void evaluateEnergyWaste(List<Device> envDevices, List<Device> controlDevices,
                                     Rule rule, Instant now) {
        Map<String, Object> params = ruleService.paramsOf(rule);
        int absenceMinutes = ruleService.intParam(params, "absenceMinutes", 10);
        double thresholdW = ruleService.doubleParam(params, "powerThresholdW", 2);

        boolean roomEmpty = envDevices.stream()
                .anyMatch(env -> isRoomEmptyLongEnough(env, absenceMinutes, now));

        for (Device control : controlDevices) {
            PowerReading latest = powerReadingRepository
                    .findFirstByDeviceIdOrderByReceivedAtDesc(control.getDeviceId()).orElse(null);
            boolean powerUsable = latest != null
                    && latest.getQuality() == Quality.VALID
                    && latest.getReceivedAt()
                    .plusSeconds(properties.getRules().getOfflineTimeoutSeconds()).isAfter(now);
            double totalW = !powerUsable ? 0
                    : nz(latest.getLight1PowerW()) + nz(latest.getFan1PowerW());

            if (roomEmpty && isOnline(control, now) && totalW > thresholdW) {
                alertService.raise(AlertType.ENERGY_WASTE, AlertSeverity.MEDIUM,
                        control.getDeviceId(), control.getRoomId(), totalW, thresholdW,
                        "Phòng trống nhưng công suất tải " + totalW + "W vượt " + thresholdW + "W");

                if (control.getMode() == Mode.AUTO
                        && (control.getLastEnergyActionAt() == null
                        || control.getLastEnergyActionAt().plusSeconds(ACTION_COOLDOWN_SECONDS).isBefore(now))) {
                    boolean sent = false;
                    for (String target : List.of("light1", "fan1")) {
                        if (!"OFF".equals(actuatorState(control, target))) {
                            try {
                                commandService.createAutomation(control.getDeviceId(), target, "OFF");
                                sent = true;
                            } catch (Exception ex) {
                                log.warn("Không tắt được {}: {}", target, ex.getMessage());
                            }
                        }
                    }
                    if (sent) {
                        control.setLastEnergyActionAt(now);
                    }
                }
            } else {
                alertService.resolve(AlertType.ENERGY_WASTE, control.getDeviceId());
            }
        }
    }

    private boolean isRoomEmptyLongEnough(Device env, int absenceMinutes, Instant now) {
        if (env.getMode() != Mode.AUTO || !isOnline(env, now) || env.getEmptySince() == null) {
            return false;
        }
        if (env.getEmptySince().plus(absenceMinutes, ChronoUnit.MINUTES).isAfter(now)) {
            return false;
        }
        Telemetry latest = telemetryRepository
                .findFirstByDeviceIdOrderByReceivedAtDesc(env.getDeviceId()).orElse(null);
        // Không có dữ liệu / INVALID / SUSPECT => không coi là phòng trống (contract mục 6).
        return latest != null
                && latest.getQuality() == Quality.VALID
                && Boolean.FALSE.equals(latest.getPresence());
    }

    private boolean isOnline(Device device, Instant now) {
        return device.isOnline() && !isTimedOut(device, now);
    }

    private boolean isTimedOut(Device device, Instant now) {
        return device.getLastSeenAt() == null
                || device.getLastSeenAt()
                .plusSeconds(properties.getRules().getOfflineTimeoutSeconds()).isBefore(now);
    }

    private String actuatorState(Device device, String target) {
        return switch (target) {
            case "light1" -> device.getLight1();
            case "fan1" -> device.getFan1();
            case "buzzer1" -> device.getBuzzer1();
            case "door1" -> device.getDoor1();
            default -> "OFF";
        };
    }

    private double nz(Double value) {
        return value == null ? 0 : value;
    }
}
