package com.smartoffice.backend.mqtt;

import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.config.SmartOfficeProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Lõi MQTT của M3: giữ kết nối broker, subscribe telemetry/status/ack, publish command/config.
 *
 * Dùng Paho trực tiếp (thay vì Spring Integration) để thấy rõ luồng reconnect + QoS.
 * QoS 1 cho mọi topic nghiệp vụ, status/config retained theo contract mục 6.
 */
@Service
@RequiredArgsConstructor
public class MqttService implements MqttCallbackExtended {

    private static final Logger log = LoggerFactory.getLogger(MqttService.class);

    private static final String TELEMETRY_TOPIC = "office/+/telemetry";
    private static final String STATUS_TOPIC = "office/+/status";
    private static final String ACK_TOPIC = "office/+/ack";

    private final SmartOfficeProperties properties;
    private final MqttIngestService ingestService;
    private final ObjectMapper objectMapper;

    private final ScheduledExecutorService reconnectExecutor =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "mqtt-reconnect");
                t.setDaemon(true);
                return t;
            });

    private volatile MqttAsyncClient client;
    private volatile boolean connected = false;

    @PostConstruct
    public void init() {
        if (!properties.getMqtt().isEnabled()) {
            log.warn("MQTT bị tắt (smartoffice.mqtt.enabled=false) - chỉ dùng cho test");
            return;
        }
        reconnectExecutor.execute(this::tryConnect);
    }

    private void tryConnect() {
        if (connected) {
            return;
        }
        try {
            if (client == null) {
                client = new MqttAsyncClient(
                        properties.getMqtt().getBrokerUrl(),
                        properties.getMqtt().getClientId(),
                        new MemoryPersistence());
                client.setCallback(this);
            }

            MqttConnectOptions options = new MqttConnectOptions();
            options.setAutomaticReconnect(true);
            options.setCleanSession(false);
            options.setConnectionTimeout(10);
            options.setKeepAliveInterval(30);
            if (!properties.getMqtt().getUsername().isBlank()) {
                options.setUserName(properties.getMqtt().getUsername());
                options.setPassword(properties.getMqtt().getPassword().toCharArray());
            }

            log.info("Đang kết nối MQTT broker {} với clientId={}",
                    properties.getMqtt().getBrokerUrl(), properties.getMqtt().getClientId());
            client.connect(options).waitForCompletion(10_000);
        } catch (Exception ex) {
            log.warn("Kết nối MQTT thất bại: {}. Thử lại sau {} ms",
                    ex.getMessage(), properties.getMqtt().getReconnectDelayMs());
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        reconnectExecutor.schedule(this::tryConnect,
                properties.getMqtt().getReconnectDelayMs(), TimeUnit.MILLISECONDS);
    }

    @Override
    public void connectComplete(boolean reconnect, String serverURI) {
        connected = true;
        log.info("Đã kết nối MQTT {} (reconnect={})", serverURI, reconnect);
        subscribe(TELEMETRY_TOPIC);
        subscribe(STATUS_TOPIC);
        subscribe(ACK_TOPIC);
    }

    private void subscribe(String topic) {
        try {
            client.subscribe(topic, properties.getMqtt().getQos())
                    .waitForCompletion(5_000);
            log.info("Subscribe {}", topic);
        } catch (MqttException ex) {
            log.error("Subscribe {} thất bại: {}", topic, ex.getMessage());
        }
    }

    @Override
    public void connectionLost(Throwable cause) {
        connected = false;
        log.warn("Mất kết nối MQTT: {}", cause == null ? "unknown" : cause.getMessage());
    }

    @Override
    public void messageArrived(String topic, MqttMessage message) {
        String payload = new String(message.getPayload(), StandardCharsets.UTF_8);
        log.debug("Nhận MQTT [{}]: {}", topic, payload);
        try {
            ingestService.handle(topic, payload);
        } catch (Exception ex) {
            // Một bản tin lỗi không được làm chết callback thread của Paho.
            log.error("Xử lý MQTT [{}] thất bại: {} | payload={}", topic, ex.getMessage(), payload, ex);
        }
    }

    @Override
    public void deliveryComplete(IMqttDeliveryToken token) {
        // Không cần xử lý.
    }

    /**
     * Publish command/config. Trả về false nếu broker chưa sẵn sàng để caller xử lý.
     */
    public boolean publish(String topic, Object payload, boolean retained) {
        if (!connected || client == null || !client.isConnected()) {
            log.warn("Không publish được [{}]: MQTT chưa kết nối", topic);
            return false;
        }
        try {
            byte[] bytes = objectMapper.writeValueAsBytes(payload);
            MqttMessage message = new MqttMessage(bytes);
            message.setQos(properties.getMqtt().getQos());
            message.setRetained(retained);
            client.publish(topic, message).waitForCompletion(5_000);
            log.info("Đã publish [{}]: {}", topic, new String(bytes, StandardCharsets.UTF_8));
            return true;
        } catch (Exception ex) {
            log.error("Publish [{}] thất bại: {}", topic, ex.getMessage());
            return false;
        }
    }

    public void publishOrThrow(String topic, Object payload, boolean retained) {
        if (!publish(topic, payload, retained)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MQTT_UNAVAILABLE",
                    "Không kết nối được MQTT broker, thử lại sau");
        }
    }

    public boolean isConnected() {
        return connected && client != null && client.isConnected();
    }

    @PreDestroy
    public void shutdown() {
        reconnectExecutor.shutdownNow();
        if (client != null) {
            try {
                if (client.isConnected()) {
                    client.disconnect().waitForCompletion(2_000);
                }
                client.close();
            } catch (MqttException ex) {
                log.debug("Đóng MQTT client: {}", ex.getMessage());
            }
        }
    }
}
