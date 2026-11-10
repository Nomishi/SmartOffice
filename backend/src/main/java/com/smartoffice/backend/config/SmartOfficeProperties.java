package com.smartoffice.backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "smartoffice")
public class SmartOfficeProperties {

    private Mqtt mqtt = new Mqtt();
    private Rules rules = new Rules();
    private Cors cors = new Cors();
    private Security security = new Security();
    private Ai ai = new Ai();

    @Getter
    @Setter
    public static class Ai {
        private boolean enabled = false;
        /** OpenAI-compatible base URL, ví dụ https://api.openai.com/v1 */
        private String baseUrl = "https://api.openai.com/v1";
        private String apiKey = "";
        private String model = "gpt-4o-mini";
        private int timeoutMs = 20000;
    }

    @Getter
    @Setter
    public static class Security {
        private String jwtSecret = "";
        private long jwtExpirationSeconds = 3600;
        private boolean seedDevUsers = false;
        private UserSeed seed = new UserSeed();

        @Getter
        @Setter
        public static class UserSeed {
            private String adminPassword = "adminPassword123!";
            private String operatorPassword = "operatorPassword123!";
            private String viewerPassword = "viewerPassword123!";
        }
    }

    @Getter
    @Setter
    public static class Mqtt {
        private boolean enabled = true;
        private String brokerUrl = "tcp://localhost:1883";
        private String clientId = "smartoffice-backend";
        private String username = "";
        private String password = "";
        private int qos = 1;
        private long reconnectDelayMs = 5000;
        private boolean autoRegisterUnknownDevices = true;
    }

    @Getter
    @Setter
    public static class Rules {
        private long offlineTimeoutSeconds = 90;
        private long offlineCheckIntervalMs = 15000;
        private long commandTimeoutSeconds = 5;
        private long doorCommandTimeoutSeconds = 10;
        private int commandMaxRetries = 2;
        private long commandTimeoutCheckIntervalMs = 2000;
        private int sensorFaultInvalidStreak = 3;
        private int sensorFaultRecoverStreak = 3;
        private long automationCheckIntervalMs = 10000;
    }

    @Getter
    @Setter
    public static class Cors {
        private String allowedOrigins = "http://localhost:5173,http://localhost:3000";
    }
}
