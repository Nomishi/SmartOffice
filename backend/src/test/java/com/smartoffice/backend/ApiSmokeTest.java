package com.smartoffice.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import org.springframework.security.test.context.support.WithMockUser;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@WithMockUser(username = "admin", roles = {"ADMIN"})
class ApiSmokeTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void listsSeededDevices() throws Exception {
        mockMvc.perform(get("/api/devices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].deviceId").exists());
    }

    @Test
    void listsSeededRules() throws Exception {
        mockMvc.perform(get("/api/rules"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(5));
    }

    @Test
    void alertsEndpointWorks() throws Exception {
        mockMvc.perform(get("/api/alerts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
    }

    @Test
    void statusEndpointWorks() throws Exception {
        mockMvc.perform(get("/api/devices/office-ctrl-01/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deviceId").value("office-ctrl-01"))
                .andExpect(jsonPath("$.actuators.light1").value("OFF"));
    }

    @Test
    void telemetryRequiresFromTo() throws Exception {
        mockMvc.perform(get("/api/devices/office-env-01/telemetry"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void telemetryOfUnknownDeviceIs404() throws Exception {
        mockMvc.perform(get("/api/devices/khong-ton-tai/telemetry")
                        .queryParam("from", "2026-11-01T00:00:00Z")
                        .queryParam("to", "2026-11-02T00:00:00Z"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void telemetryDefaultsToPageSize20() throws Exception {
        mockMvc.perform(get("/api/devices/office-env-01/telemetry")
                        .queryParam("from", "2026-11-01T00:00:00Z")
                        .queryParam("to", "2026-11-02T00:00:00Z"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(20));
    }

    @Test
    void commandToOfflineDeviceIsRejected() throws Exception {
        mockMvc.perform(post("/api/devices/office-ctrl-01/commands")
                        .contentType("application/json")
                        .content("{\"target\":\"light1\",\"action\":\"ON\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("DEVICE_OFFLINE"));
    }
}
