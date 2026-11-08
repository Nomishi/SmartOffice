package com.smartoffice.backend;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartoffice.backend.api.dto.ChangePasswordRequest;
import com.smartoffice.backend.api.dto.CommandRequest;
import com.smartoffice.backend.api.dto.CreateUserRequest;
import com.smartoffice.backend.api.dto.LoginRequest;
import com.smartoffice.backend.domain.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void unauthenticatedRequestReturns401() throws Exception {
        mockMvc.perform(get("/api/devices"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void loginSuccessReturnsTokenAndUser() throws Exception {
        LoginRequest req = new LoginRequest("admin", "adminPassword123!");
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(3600))
                .andExpect(jsonPath("$.user.username").value("admin"))
                .andExpect(jsonPath("$.user.role").value("ADMIN"));
    }

    @Test
    void loginWrongPasswordReturns401() throws Exception {
        LoginRequest req = new LoginRequest("admin", "wrongPassword");
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    @WithMockUser(username = "viewer1", roles = {"VIEWER"})
    void viewerCanReadDevices() throws Exception {
        mockMvc.perform(get("/api/devices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
    }

    @Test
    @WithMockUser(username = "viewer1", roles = {"VIEWER"})
    void viewerCannotSendCommandForbidden() throws Exception {
        CommandRequest cmd = new CommandRequest("light1", "ON");
        mockMvc.perform(post("/api/devices/office-ctrl-01/commands")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cmd)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    @WithMockUser(username = "operator1", roles = {"OPERATOR"})
    void operatorCanSendCommand() throws Exception {
        // office-ctrl-01 mặc định online=false nên sendCommand sẽ trả 409 DEVICE_OFFLINE sau khi qua được check role OPERATOR
        CommandRequest cmd = new CommandRequest("light1", "ON");
        mockMvc.perform(post("/api/devices/office-ctrl-01/commands")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cmd)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("DEVICE_OFFLINE"));
    }

    @Test
    @WithMockUser(username = "operator1", roles = {"OPERATOR"})
    void operatorCannotListUsersForbidden() throws Exception {
        mockMvc.perform(get("/api/users"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    @WithMockUser(username = "viewer1", roles = {"VIEWER"})
    void viewerCannotRegisterDeviceForbidden() throws Exception {
        mockMvc.perform(post("/api/devices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"deviceId":"office-viewer-test","name":"X","type":"ENV"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void adminCanCreateAndListUsers() throws Exception {
        CreateUserRequest req = new CreateUserRequest("testuser1", "secret123", Role.OPERATOR);
        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("testuser1"))
                .andExpect(jsonPath("$.role").value("OPERATOR"));

        mockMvc.perform(get("/api/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
    }

    @Test
    void realJwtTokensValidateRoles() throws Exception {
        // 1. Login lấy real token của viewer1
        LoginRequest viewerLogin = new LoginRequest("viewer1", "viewerPassword123!");
        String viewerRes = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(viewerLogin)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String viewerToken = objectMapper.readTree(viewerRes).get("token").asText();

        // 2. Viewer dùng real token đọc devices -> OK
        mockMvc.perform(get("/api/devices")
                        .header("Authorization", "Bearer " + viewerToken))
                .andExpect(status().isOk());

        // 3. Viewer dùng real token gửi command -> 403 FORBIDDEN
        CommandRequest cmd = new CommandRequest("light1", "ON");
        mockMvc.perform(post("/api/devices/office-ctrl-01/commands")
                        .header("Authorization", "Bearer " + viewerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cmd)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));

        // 4. Login lấy real token của operator1
        LoginRequest opLogin = new LoginRequest("operator1", "operatorPassword123!");
        String opRes = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(opLogin)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String opToken = objectMapper.readTree(opRes).get("token").asText();

        // 5. Operator dùng real token gửi command -> qua được Auth/RBAC (trả 409 DEVICE_OFFLINE vì device dev offline)
        mockMvc.perform(post("/api/devices/office-ctrl-01/commands")
                        .header("Authorization", "Bearer " + opToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cmd)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("DEVICE_OFFLINE"));

        // 6. Header param ?token= bị từ chối với API thông thường (chỉ chấp nhận Bearer)
        mockMvc.perform(get("/api/devices?token=" + viewerToken))
                .andExpect(status().isUnauthorized());
    }
}

