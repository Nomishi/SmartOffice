package com.smartoffice.backend.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartoffice.backend.domain.*;
import com.smartoffice.backend.repository.DeviceRepository;
import com.smartoffice.backend.repository.RuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Seed 2 node và 5 rule mặc định (contract mục 9.1) để dev/mock chạy được ngay. */
@Component
@RequiredArgsConstructor
public class DataSeeder implements ApplicationRunner {

    private final DeviceRepository deviceRepository;
    private final RuleRepository ruleRepository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedDevices();
        seedRules();
    }

    private void seedDevices() {
        if (deviceRepository.count() > 0) {
            return;
        }
        deviceRepository.save(device("office-env-01", "Node A - môi trường", DeviceType.ENV));
        deviceRepository.save(device("office-ctrl-01", "Node B - điều khiển", DeviceType.CONTROL));
    }

    private Device device(String id, String name, DeviceType type) {
        Device device = new Device();
        device.setDeviceId(id);
        device.setName(name);
        device.setType(type);
        device.setStatus(DeviceStatus.ACTIVE);
        device.setMode(Mode.AUTO);
        device.setRoomId("room-01");
        device.setFwVersion("1.0.0");
        device.setOnline(false);
        device.setRegisteredAt(Instant.now());
        return device;
    }

    private void seedRules() {
        if (ruleRepository.count() > 0) {
            return;
        }
        ruleRepository.save(rule("Nhiệt độ cao", RuleType.TEMP_HIGH,
                Map.of("thresholdC", 30, "consecutiveSamples", 3),
                Map.of("alert", true, "severity", "MEDIUM")));
        ruleRepository.save(rule("Không khí xấu", RuleType.AIR_BAD,
                Map.of("thresholdRaw", 2000, "consecutiveSamples", 3, "warmupSec", 180),
                Map.of("alert", true, "severity", "MEDIUM")));
        ruleRepository.save(rule("Phòng trống tắt đèn/quạt", RuleType.ABSENCE_OFF,
                Map.of("absenceMinutes", 10, "targets", List.of("light1", "fan1")),
                Map.of("alert", false)));
        ruleRepository.save(rule("Cửa mở quá lâu", RuleType.DOOR_OPEN_LIMIT,
                Map.of("openMinutes", 5),
                Map.of("alert", true, "severity", "MEDIUM")));
        ruleRepository.save(rule("Lãng phí điện", RuleType.ENERGY_WASTE,
                Map.of("absenceMinutes", 10, "powerThresholdW", 2),
                Map.of("alert", true, "severity", "MEDIUM")));
    }

    private Rule rule(String name, RuleType type, Map<String, Object> params, Map<String, Object> action) {
        Rule rule = new Rule();
        rule.setName(name);
        rule.setType(type);
        rule.setEnabled(true);
        try {
            rule.setParamsJson(objectMapper.writeValueAsString(new LinkedHashMap<>(params)));
            rule.setActionJson(objectMapper.writeValueAsString(new LinkedHashMap<>(action)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
        rule.setUpdatedAt(Instant.now());
        return rule;
    }
}
