package com.smartoffice.backend;

import com.smartoffice.backend.ai.AiClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "smartoffice.ai.enabled=true",
        "smartoffice.ai.api-key=test-key",
        "smartoffice.ai.model=test-model"
})
class AiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AiClient aiClient;

    @Test
    @WithMockUser(username = "viewer1", roles = {"VIEWER"})
    void chatBuildsContextAndCallsAi() throws Exception {
        when(aiClient.complete(anyString(), anyString()))
                .thenReturn("Nhiệt độ hiện tại bình thường.");

        mockMvc.perform(post("/api/ai/chat")
                        .contentType("application/json")
                        .content("{\"message\":\"Nhiệt độ có bình thường không?\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").value("Nhiệt độ hiện tại bình thường."))
                .andExpect(jsonPath("$.model").value("test-model"));

        verify(aiClient).complete(
                org.mockito.ArgumentMatchers.contains("SmartOffice"),
                org.mockito.ArgumentMatchers.contains("office-env-01"));
    }
}
