package com.smartoffice.backend.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smartoffice.backend.config.SmartOfficeProperties;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.*;

/**
 * Giả lập M1 + M2 chạy cùng backend khi bật profile "mock".
 *
 *   mvn spring-boot:run -Dspring-boot.run.profiles=mock
 *
 * - Mỗi 5s publish telemetry Node A + Node B.
 * - Mỗi 30s publish status retained (heartbeat) cho cả 2 node.
 * - Subscribe command/config, đổi state và gửi ACK thật để test luồng command -> ACK.
 */
@Component
@Profile("mock")
@RequiredArgsConstructor
public class MockDeviceAgent {

    private static final Logger log = LoggerFactory.getLogger(MockDeviceAgent.class);

    private static final String ENV_ID = "office-env-01";
    private static final String CTRL_ID = "office-ctrl-01";

    private final SmartOfficeProperties properties;
    private final ObjectMapper objectMapper;

    private final ScheduledExecutorService executor =
            Executors.newScheduledThreadPool(2, r -> {
                Thread t = new Thread(r, "mock-device");
                t.setDaemon(true);
                return t;
            });

    private final java.util.concurrent.atomic.AtomicBoolean connected =
            new java.util.concurrent.atomic.AtomicBoolean(false);

    private volatile MqttAsyncClient client;

    // state của relay/servo
    private volatile String light1 = "OFF";
    private volatile String fan1 = "OFF";
    private volatile String buzzer1 = "OFF";
    private volatile String door1 = "CLOSED";

    @PostConstruct
    public void start() {
        executor.execute(this::ensureConnected);
        // telemetry 5s/lần
        executor.scheduleAtFixedRate(this::publishTelemetry, 2, 5, TimeUnit.SECONDS);
        // heartbeat status 30s/lần
        executor.scheduleAtFixedRate(this::publishStatus, 1, 30, TimeUnit.SECONDS);
    }

    private void ensureConnected() {
        try {
            if (client == null) {
                client = new MqttAsyncClient(properties.getMqtt().getBrokerUrl(),
                        "mock-device-ctrl", new MemoryPersistence());
                client.setCallback(new MqttCallback() {
                    @Override
                    public void connectionLost(Throwable cause) {
                        connected.set(false);
                        log.warn("[MOCK] mất kết nối broker: {}",
                                cause == null ? "?" : cause.getMessage());
                    }

                    @Override
                    public void messageArrived(String topic, MqttMessage message) {
                        handle(topic, new String(message.getPayload(), StandardCharsets.UTF_8));
                    }

                    @Override
                    public void deliveryComplete(IMqttDeliveryToken token) {
                    }
                });
            }
            if (!client.isConnected()) {
                MqttConnectOptions options = new MqttConnectOptions();
                options.setAutomaticReconnect(true);
                options.setCleanSession(true);
                client.connect(options).waitForCompletion(5_000);
                client.subscribe("office/" + CTRL_ID + "/command", 1).waitForCompletion(5_000);
                client.subscribe("office/" + CTRL_ID + "/config", 1).waitForCompletion(5_000);
                connected.set(true);
                log.info("[MOCK] đã kết nối broker, sẵn sàng giả lập 2 node");
            }
        } catch (Exception ex) {
            connected.set(false);
            log.warn("[MOCK] chưa kết nối được broker ({}), thử lại sau 5s", ex.getMessage());
            executor.schedule(this::ensureConnected, 5, TimeUnit.SECONDS);
        }
    }

    private void handle(String topic, String payload) {
        try {
            var node = objectMapper.readTree(payload);
            if (topic.endsWith("/command")) {
                String commandId = node.path("commandId").asText();
                String target = node.path("target").asText();
                String action = node.path("action").asText();
                log.info("[MOCK] nhận lệnh {} {} {}", commandId, target, action);

                applyCommand(target, action);

                executor.schedule(() -> publishAck(commandId, target, null),
                        180, TimeUnit.MILLISECONDS);
            } else if (topic.endsWith("/config")) {
                String configId = node.path("configId").asText();
                log.info("[MOCK] nhận config {}: {}", configId, payload);
                ObjectNode ack = objectMapper.createObjectNode();
                ack.put("configId", configId);
                ack.put("status", "SUCCESS");
                publish("office/" + CTRL_ID + "/ack", ack, false);
            }
        } catch (Exception ex) {
            log.warn("[MOCK] xử lý {} lỗi: {}", topic, ex.getMessage());
        }
    }

    private void applyCommand(String target, String action) {
        switch (target) {
            case "light1" -> light1 = action;
            case "fan1" -> fan1 = action;
            case "buzzer1" -> buzzer1 = action;
            case "door1" -> door1 = "OPEN".equals(action) ? "OPEN" : "CLOSED";
            default -> { }
        }
    }

    private void publishAck(String commandId, String target, String error) {
        try {
            ObjectNode ack = objectMapper.createObjectNode();
            ack.put("commandId", commandId);
            ack.put("target", target);
            ack.put("status", error == null ? "SUCCESS" : "FAILED");
            ack.put("state", currentState(target));
            ack.put("latencyMs", 180);
            if (error != null) {
                ack.put("message", error);
            }
            publish("office/" + CTRL_ID + "/ack", ack, false);
            // báo lại status mới ngay sau ACK
            publishControlStatus();
        } catch (Exception ex) {
            log.warn("[MOCK] gửi ACK lỗi: {}", ex.getMessage());
        }
    }

    private String currentState(String target) {
        return switch (target) {
            case "light1" -> light1;
            case "fan1" -> fan1;
            case "buzzer1" -> buzzer1;
            case "door1" -> door1;
            default -> "OFF";
        };
    }

    private void publishTelemetry() {
        if (!connected.get()) {
            ensureConnected();
            return;
        }
        try {
            long minute = (System.currentTimeMillis() / 60_000) % 5;
            boolean presence = minute < 3; // 3 phút có người, 2 phút vắng (để test automation)

            ObjectNode env = objectMapper.createObjectNode();
            env.put("deviceId", ENV_ID);
            env.put("temperature", round(26 + Math.random() * 7));
            env.put("humidity", round(55 + Math.random() * 20));
            env.put("lux", round(150 + Math.random() * 450));
            env.put("presence", presence);
            env.put("quality", "VALID");
            env.put("airRaw", 900 + (int) (Math.random() * 900));
            env.put("rssi", -55 - (int) (Math.random() * 15));
            publish("office/" + ENV_ID + "/telemetry", env, false);

            ObjectNode ctrl = objectMapper.createObjectNode();
            ctrl.put("deviceId", CTRL_ID);
            ctrl.put("busVoltageV", 12.1);
            ctrl.put("light1PowerW", "ON".equals(light1) ? 4.8 : 0.0);
            ctrl.put("light1CurrentMa", "ON".equals(light1) ? 397 : 0);
            ctrl.put("fan1PowerW", "ON".equals(fan1) ? 2.1 : 0.0);
            ctrl.put("fan1CurrentMa", "ON".equals(fan1) ? 173 : 0);
            ctrl.put("quality", "VALID");
            ctrl.put("rssi", -61);
            publish("office/" + CTRL_ID + "/telemetry", ctrl, false);
        } catch (Exception ex) {
            log.warn("[MOCK] publish telemetry lỗi: {}", ex.getMessage());
        }
    }

    private void publishStatus() {
        if (!connected.get()) {
            return;
        }
        try {
            ObjectNode env = objectMapper.createObjectNode();
            env.put("online", true);
            env.put("fwVersion", "mock-1.0.0");
            env.put("mode", "AUTO");
            publish("office/" + ENV_ID + "/status", env, true);
            publishControlStatus();
        } catch (Exception ex) {
            log.warn("[MOCK] publish status lỗi: {}", ex.getMessage());
        }
    }

    private void publishControlStatus() {
        ObjectNode ctrl = objectMapper.createObjectNode();
        ctrl.put("online", true);
        ctrl.put("light1", light1);
        ctrl.put("fan1", fan1);
        ctrl.put("buzzer1", buzzer1);
        ctrl.put("door1", door1);
        ctrl.put("mode", "AUTO");
        ctrl.put("fwVersion", "mock-1.0.0");
        publish("office/" + CTRL_ID + "/status", ctrl, true);
    }

    private void publish(String topic, ObjectNode payload, boolean retained) {
        try {
            MqttMessage message = new MqttMessage(objectMapper.writeValueAsBytes(payload));
            message.setQos(1);
            message.setRetained(retained);
            client.publish(topic, message);
        } catch (Exception ex) {
            log.warn("[MOCK] publish {} lỗi: {}", topic, ex.getMessage());
        }
    }

    private double round(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    @PreDestroy
    public void stop() {
        executor.shutdownNow();
        try {
            if (client != null && client.isConnected()) {
                client.disconnect().waitForCompletion(1000);
                client.close();
            }
        } catch (Exception ignored) {
            // shutdown
        }
    }
}
