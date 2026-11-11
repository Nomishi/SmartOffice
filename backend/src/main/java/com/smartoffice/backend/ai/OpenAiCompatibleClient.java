package com.smartoffice.backend.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.config.SmartOfficeProperties;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Map;

/**
 * Client cho mọi API tương thích OpenAI Chat Completions:
 * OpenAI, Groq, Together, Ollama (/v1), LM Studio...
 * API key là tùy chọn để hỗ trợ provider local không yêu cầu auth.
 */
@Component
@RequiredArgsConstructor
public class OpenAiCompatibleClient implements AiClient {

    private static final Logger log = LoggerFactory.getLogger(OpenAiCompatibleClient.class);

    private final SmartOfficeProperties properties;

    @Override
    public String complete(String systemPrompt, String userPrompt) {
        SmartOfficeProperties.Ai ai = properties.getAi();
        String baseUrl = ai.getBaseUrl() == null || ai.getBaseUrl().isBlank()
                ? "https://api.openai.com/v1"
                : ai.getBaseUrl().replaceAll("/+$", "");
        String url = baseUrl + "/chat/completions";

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(ai.getTimeoutMs());
        factory.setReadTimeout(ai.getTimeoutMs());

        Map<String, Object> body = Map.of(
                "model", ai.getModel(),
                "temperature", 0.2,
                "max_tokens", 800,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)
                )
        );

        try {
            var request = RestClient.builder()
                    .requestFactory(factory)
                    .build()
                    .post()
                    .uri(url)
                    .contentType(MediaType.APPLICATION_JSON);

            if (ai.getApiKey() != null && !ai.getApiKey().isBlank()) {
                request = request.header(HttpHeaders.AUTHORIZATION, "Bearer " + ai.getApiKey());
            }

            JsonNode response = request
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);

            String answer = response == null ? null
                    : response.path("choices").path(0).path("message").path("content").asText(null);
            if (answer == null || answer.isBlank()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_UPSTREAM_ERROR",
                        "AI API không trả nội dung");
            }
            return answer;
        } catch (ApiException ex) {
            throw ex;
        } catch (RestClientResponseException ex) {
            log.warn("AI API trả lời {}: {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_UPSTREAM_ERROR",
                    "AI API trả lời " + ex.getStatusCode().value());
        } catch (Exception ex) {
            log.warn("Không gọi được AI API: {}", ex.getMessage());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_UPSTREAM_ERROR",
                    "Không gọi được AI API");
        }
    }
}
