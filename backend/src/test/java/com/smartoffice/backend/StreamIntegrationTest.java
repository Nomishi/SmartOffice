package com.smartoffice.backend;

import com.smartoffice.backend.realtime.RealtimeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class StreamIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RealtimeService realtimeService;

    @Autowired
    private com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    @Test
    void unauthenticatedSseReturns401() throws Exception {
        mockMvc.perform(get("/api/stream"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "viewer1", roles = {"VIEWER"})
    void authenticatedUserCanConnectToStream() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/stream"))
                .andExpect(status().isOk())
                .andExpect(request().asyncStarted())
                .andReturn();

        assertNotNull(result);
        assertTrue(realtimeService.getActiveSubscriberCount() > 0);
    }

    @Test
    void connectToStreamWithRealTokenQueryParam() throws Exception {
        com.smartoffice.backend.api.dto.LoginRequest req =
                new com.smartoffice.backend.api.dto.LoginRequest("operator1", "operatorPassword123!");
        String loginRes = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/login")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = objectMapper.readTree(loginRes).get("token").asText();

        MvcResult result = mockMvc.perform(get("/api/stream").queryParam("token", token))
                .andExpect(status().isOk())
                .andExpect(request().asyncStarted())
                .andReturn();

        assertNotNull(result);
    }
}

