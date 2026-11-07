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
}

