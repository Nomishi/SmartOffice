package com.smartoffice.backend.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
@Slf4j
public class RealtimeService {

    private final ObjectMapper objectMapper;
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public RealtimeService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public SseEmitter subscribe() {
        // Timeout 30 phút, heartbeat 15 giây giữ kết nối
        SseEmitter emitter = new SseEmitter(1800_000L);
        emitters.add(emitter);

        emitter.onCompletion(() -> {
            emitters.remove(emitter);
            log.debug("SSE client completed. Total remaining: {}", emitters.size());
        });
        emitter.onTimeout(() -> {
            emitters.remove(emitter);
            emitter.complete();
            log.debug("SSE client timed out. Total remaining: {}", emitters.size());
        });
        emitter.onError(e -> {
            emitters.remove(emitter);
            log.debug("SSE client error: {}. Total remaining: {}", e.getMessage(), emitters.size());
        });

        try {
            // Gửi initial connected event
            Map<String, Object> connectedData = Map.of(
                    "type", "connected",
                    "timestamp", Instant.now().toString(),
                    "message", "SSE stream established"
            );
            emitter.send(SseEmitter.event()
                    .name("connected")
                    .data(connectedData, MediaType.APPLICATION_JSON));
        } catch (IOException e) {
            emitters.remove(emitter);
        }

        return emitter;
    }

    public void broadcast(String type, Object data) {
        if (emitters.isEmpty()) {
            return;
        }

        Map<String, Object> message = Map.of(
                "type", type,
                "data", data,
                "timestamp", Instant.now().toString()
        );

        List<SseEmitter> deadEmitters = new CopyOnWriteArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name(type)
                        .data(message, MediaType.APPLICATION_JSON));
            } catch (Exception e) {
                deadEmitters.add(emitter);
            }
        }
        if (!deadEmitters.isEmpty()) {
            emitters.removeAll(deadEmitters);
            log.debug("Removed {} dead SSE emitters", deadEmitters.size());
        }
    }

    @Scheduled(fixedRate = 15000)
    public void sendHeartbeat() {
        if (emitters.isEmpty()) {
            return;
        }
        List<SseEmitter> deadEmitters = new CopyOnWriteArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().comment("ping"));
            } catch (Exception e) {
                deadEmitters.add(emitter);
            }
        }
        if (!deadEmitters.isEmpty()) {
            emitters.removeAll(deadEmitters);
        }
    }

    public int getActiveSubscriberCount() {
        return emitters.size();
    }
}

