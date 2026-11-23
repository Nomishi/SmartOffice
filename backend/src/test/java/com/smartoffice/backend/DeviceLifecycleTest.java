package com.smartoffice.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Vòng đời thiết bị (Contract mục 7): chỉ cho chuyển trạng thái đúng luồng. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@WithMockUser(username = "admin", roles = {"ADMIN"})
class DeviceLifecycleTest {

    @Autowired
    private MockMvc mockMvc;

    private void register(String id) throws Exception {
        mockMvc.perform(post("/api/devices").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"deviceId\":\"" + id + "\",\"name\":\"Thu\",\"type\":\"ENV\",\"roomId\":\"room-01\"}"))
                .andExpect(status().isCreated());
    }

    private void expectStatus(String id, String op, String expected) throws Exception {
        mockMvc.perform(post("/api/devices/" + id + "/" + op))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(expected));
    }

    private void expectRejected(String id, String op) throws Exception {
        mockMvc.perform(post("/api/devices/" + id + "/" + op))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("INVALID_TRANSITION"));
    }

    @Test
    void lockThenUnlockKeepsDeviceUsable() throws Exception {
        register("lifecycle-01");
        expectStatus("lifecycle-01", "activate", "ACTIVE");
        expectStatus("lifecycle-01", "lock", "LOCKED");
        expectStatus("lifecycle-01", "activate", "ACTIVE");   // mở khóa
    }

    @Test
    void maintenanceEnterAndExit() throws Exception {
        register("lifecycle-02");
        expectRejected("lifecycle-02", "maintenance");          // chưa kích hoạt thì không bảo trì
        expectStatus("lifecycle-02", "activate", "ACTIVE");
        expectStatus("lifecycle-02", "maintenance", "MAINTENANCE");
        expectStatus("lifecycle-02", "activate", "ACTIVE");
    }

    @Test
    void decommissionOnlyFromLockedAndIsFinal() throws Exception {
        register("lifecycle-03");
        expectStatus("lifecycle-03", "activate", "ACTIVE");
        expectRejected("lifecycle-03", "decommission");         // đang ACTIVE: phải khóa trước
        expectStatus("lifecycle-03", "lock", "LOCKED");
        expectStatus("lifecycle-03", "decommission", "DECOMMISSIONED");
        expectRejected("lifecycle-03", "activate");             // không hoàn tác
        expectRejected("lifecycle-03", "lock");
    }

    @Test
    void unusedRegisteredDeviceCanBeDecommissioned() throws Exception {
        register("lifecycle-04");
        expectStatus("lifecycle-04", "decommission", "DECOMMISSIONED");
    }

    @Test
    void repeatingSameOperationIsHarmless() throws Exception {
        register("lifecycle-05");
        expectStatus("lifecycle-05", "activate", "ACTIVE");
        expectStatus("lifecycle-05", "activate", "ACTIVE");
    }

    @Test
    @WithMockUser(username = "operator1", roles = {"OPERATOR"})
    void operatorCannotChangeLifecycle() throws Exception {
        mockMvc.perform(post("/api/devices/office-env-01/maintenance")).andExpect(status().isForbidden());
    }
}
