package com.smartoffice.backend.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartoffice.backend.domain.*;
import com.smartoffice.backend.repository.DeviceRepository;
import com.smartoffice.backend.repository.RuleRepository;
import com.smartoffice.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Seed 2 node, 5 rule mặc định và 3 user dev (admin/operator1/viewer1). */
@Component
@RequiredArgsConstructor
@Slf4j
public class DataSeeder implements ApplicationRunner {

    private final DeviceRepository deviceRepository;
    private final RuleRepository ruleRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SmartOfficeProperties properties;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedDevices();
        seedRules();
        seedUsers();
    }

    private void seedUsers() {
        if (userRepository.count() > 0) {
            return;
        }
        var seedProps = properties.getSecurity().getSeed();
        log.warn("Seeding default dev users: admin, operator1, viewer1 (DEV ONLY)");

        userRepository.save(User.builder()
                .username("admin")
                .passwordHash(passwordEncoder.encode(seedProps.getAdminPassword()))
                .role(Role.ADMIN)
                .accountStatus(AccountStatus.ACTIVE)
                .createdAt(Instant.now())
                .build());

        userRepository.save(User.builder()
                .username("operator1")
                .passwordHash(passwordEncoder.encode(seedProps.getOperatorPassword()))
                .role(Role.OPERATOR)
                .accountStatus(AccountStatus.ACTIVE)
                .createdAt(Instant.now())
                .build());

        userRepository.save(User.builder()
                .username("viewer1")
                .passwordHash(passwordEncoder.encode(seedProps.getViewerPassword()))
                .role(Role.VIEWER)
                .accountStatus(AccountStatus.ACTIVE)
                .createdAt(Instant.now())
                .build());
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
