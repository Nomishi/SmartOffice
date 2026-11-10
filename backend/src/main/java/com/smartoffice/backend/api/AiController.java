package com.smartoffice.backend.api;

import com.smartoffice.backend.ai.AiService;
import com.smartoffice.backend.api.dto.AiChatRequest;
import com.smartoffice.backend.api.dto.AiChatResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiService aiService;

    @PostMapping("/chat")
    @PreAuthorize("isAuthenticated()")
    public AiChatResponse chat(@Valid @RequestBody AiChatRequest request) {
        return aiService.chat(request);
    }
}
