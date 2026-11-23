package com.smartoffice.backend;

import com.smartoffice.backend.domain.CommandStatus;
import com.smartoffice.backend.domain.DeviceConfig;
import com.smartoffice.backend.repository.DeviceConfigRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** GET /api/devices/{id}/config: cấu hình đang áp dụng = gộp các config đã ACK SUCCESS. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@WithMockUser(username = "viewer1", roles = {"VIEWER"})
class CurrentConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DeviceConfigRepository deviceConfigRepository;

    private void saveConfig(String deviceId, String configId, String payload, CommandStatus status, Instant issuedAt) {
        DeviceConfig config = new DeviceConfig();
        config.setDeviceId(deviceId);
        config.setConfigId(configId);
        config.setPayloadJson(payload);
        config.setStatus(status);
        config.setIssuedAt(issuedAt);
        config.setAckAt(status == CommandStatus.PENDING ? null : issuedAt.plusSeconds(1));
        deviceConfigRepository.save(config);
    }

    @Test
    void returnsFirmwareDefaultsWhenNeverConfigured() throws Exception {
        mockMvc.perform(get("/api/devices/office-env-01/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.telemetryIntervalSec").value(5))
                .andExpect(jsonPath("$.servoOpenDeg").doesNotExist())
                .andExpect(jsonPath("$.source").value("DEFAULT"));
    }

    @Test
    void mergesAckedConfigsAndIgnoresFailedOnes() throws Exception {
        Instant t0 = Instant.parse("2026-11-11T00:00:00Z");
        saveConfig("office-ctrl-01", "CFG-T001", "{\"telemetryIntervalSec\":10,\"servoOpenDeg\":80}",
                CommandStatus.SUCCESS, t0);
        saveConfig("office-ctrl-01", "CFG-T002", "{\"servoCloseDeg\":5}", CommandStatus.SUCCESS, t0.plusSeconds(60));
        saveConfig("office-ctrl-01", "CFG-T003", "{\"servoOpenDeg\":999}", CommandStatus.FAILED, t0.plusSeconds(120));
        saveConfig("office-ctrl-01", "CFG-T004", "{\"telemetryIntervalSec\":7}", CommandStatus.PENDING, t0.plusSeconds(180));

        mockMvc.perform(get("/api/devices/office-ctrl-01/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.telemetryIntervalSec").value(10))
                .andExpect(jsonPath("$.servoOpenDeg").value(80))
                .andExpect(jsonPath("$.servoCloseDeg").value(5))
                .andExpect(jsonPath("$.source").value("ACKED"))
                .andExpect(jsonPath("$.lastConfigId").value("CFG-T002"))
                .andExpect(jsonPath("$.pendingConfigId").value("CFG-T004"));
    }

    @Test
    void unknownDeviceIs404() throws Exception {
        mockMvc.perform(get("/api/devices/khong-ton-tai/config"))
                .andExpect(status().isNotFound());
    }
}
