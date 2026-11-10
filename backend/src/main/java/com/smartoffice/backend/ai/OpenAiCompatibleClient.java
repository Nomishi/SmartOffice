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
 */
@Component
@RequiredArgsConstructor
public class OpenAiCompatibleClient implements AiClient {

    private static final Logger log = LoggerFactory.getLogger(OpenAiCompatibleClient.class);

    private final SmartOfficeProperties properties;

    @Override
    public String complete(String systemPrompt, String userPrompt) {
        SmartOfficeProperties.Ai ai = properties.getAi();
        if (ai.getApiKey() == null || ai.getApiKey().isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE",
                    "Chưa cấu hình AI_API_KEY");
        }

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
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)
                )
        );

        try {
            JsonNode response = RestClient.builder()
                    .requestFactory(factory)
                    .build()
                    .post()
                    .uri(url)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + ai.getApiKey())
                    .contentType(MediaType.APPLICATION_JSON)
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
            log.warn("AI API trả lỗi {}: {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_UPSTREAM_ERROR",
                    "AI API trả lỗi " + ex.getStatusCode().value());
        } catch (Exception ex) {
            log.warn("Không gọi được AI API: {}", ex.getMessage());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_UPSTREAM_ERROR",
                    "Không gọi được AI API");
        }
    }
}
