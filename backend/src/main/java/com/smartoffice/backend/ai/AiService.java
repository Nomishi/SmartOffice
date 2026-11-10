package com.smartoffice.backend.ai;

import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.api.dto.AiChatRequest;
import com.smartoffice.backend.api.dto.AiChatResponse;
import com.smartoffice.backend.api.dto.RuleDto;
import com.smartoffice.backend.config.SmartOfficeProperties;
import com.smartoffice.backend.domain.Alert;
import com.smartoffice.backend.domain.Device;
import com.smartoffice.backend.domain.PowerReading;
import com.smartoffice.backend.domain.Telemetry;
import com.smartoffice.backend.repository.PowerReadingRepository;
import com.smartoffice.backend.repository.TelemetryRepository;
import com.smartoffice.backend.service.AlertService;
import com.smartoffice.backend.service.DeviceService;
import com.smartoffice.backend.service.RuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

/**
 * Tạo context ngắn từ DB và gọi AI provider. Không gửi raw telemetry 5s/lần;
 * chỉ gửi trạng thái mới nhất, alert đang mở, rule và cấu hình thiết bị.
 */
@Service
@RequiredArgsConstructor
public class AiService {

    private static final int MAX_CONTEXT_CHARS = 8000;

    private static final String SYSTEM_PROMPT = """
            Bạn là trợ lý vận hành cho hệ thống phòng làm việc thông minh SmartOffice.
            Chỉ trả lời dựa trên dữ liệu được cung cấp. Không bịa số liệu, không bịa deviceId.
            Nếu dữ liệu thiếu, nói rõ là thiếu. Trả lời ngắn gọn bằng tiếng Việt.
            Bạn có thể giải thích cảnh báo, trạng thái thiết bị, xu hướng nhiệt độ/độ ẩm/lux,
            công suất và gợi ý hành động an toàn. Không tự gửi lệnh điều khiển.
            """;

    private final SmartOfficeProperties properties;
    private final AiClient aiClient;
    private final DeviceService deviceService;
    private final TelemetryRepository telemetryRepository;
    private final PowerReadingRepository powerReadingRepository;
    private final AlertService alertService;
    private final RuleService ruleService;

    public AiChatResponse chat(AiChatRequest request) {        if (!properties.getAi().isEnabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE",
                    "AI chưa được bật (AI_ENABLED=false)");
        }
        if (properties.getAi().getApiKey() == null || properties.getAi().getApiKey().isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE",
                    "Chưa cấu hình AI_API_KEY");
        }

        String context = buildContext(request.deviceId());
        String userPrompt = "Dữ liệu hiện tại:\n" + context
                + "\n\nCâu hỏi của người dùng:\n" + request.message();

        String answer = aiClient.complete(SYSTEM_PROMPT, userPrompt);
        return new AiChatResponse(answer, properties.getAi().getModel(), Instant.now());
    }

    private String buildContext(String deviceId) {
        StringBuilder sb = new StringBuilder();
        sb.append("Thời gian hiện tại: ").append(Instant.now()).append('\n');

        if (deviceId != null && !deviceId.isBlank()) {
            appendDevice(sb, deviceService.getRequired(deviceId));
        } else {
            sb.append("\nDanh sách thiết bị:\n");
            deviceService.list(PageRequest.of(0, 10, Sort.by("deviceId")))
                    .forEach(device -> appendDevice(sb, device));
        }

        List<Alert> openAlerts = alertService.search(null, null,
                deviceId == null || deviceId.isBlank() ? null : deviceId,
                null, null, false,
                PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "createdAt")))
                .getContent();
        sb.append("\nAlert đang mở:\n");
        if (openAlerts.isEmpty()) {
            sb.append("- Không có\n");
        } else {
            openAlerts.forEach(alert -> sb.append("- ")
                    .append(alert.getType()).append(" / ").append(alert.getSeverity())
                    .append(" / device=").append(alert.getDeviceId())
                    .append(" / value=").append(alert.getValue())
                    .append(" / threshold=").append(alert.getThreshold())
                    .append(" / ").append(alert.getMessage())
                    .append('\n'));
        }

        List<RuleDto> rules = ruleService.list();
        sb.append("\nRule/ngưỡng:\n");
        rules.forEach(rule -> sb.append("- ")
                .append(rule.name()).append(" (").append(rule.type()).append(")")
                .append(" enabled=").append(rule.enabled())
                .append(" params=").append(rule.params())
                .append('\n'));

        if (sb.length() > MAX_CONTEXT_CHARS) {
            sb.setLength(MAX_CONTEXT_CHARS);
            sb.append("\n...[context bị cắt bớt]");
        }
        return sb.toString();
    }

    private void appendDevice(StringBuilder sb, Device device) {
        sb.append("\nThiết bị: ").append(device.getDeviceId())
                .append(" / ").append(device.getName())
                .append(" / type=").append(device.getType())
                .append(" / status=").append(device.getStatus())
                .append(" / mode=").append(device.getMode())
                .append(" / online=").append(device.isOnline())
                .append(" / lastSeen=").append(device.getLastSeenAt())
                .append('\n');
        if (device.getType() == com.smartoffice.backend.domain.DeviceType.CONTROL) {
            sb.append("  actuators: light1=").append(device.getLight1())
                    .append(", fan1=").append(device.getFan1())
                    .append(", buzzer1=").append(device.getBuzzer1())
                    .append(", door1=").append(device.getDoor1()).append('\n');
        }

        telemetryRepository.findFirstByDeviceIdOrderByReceivedAtDesc(device.getDeviceId())
                .ifPresent(t -> appendTelemetry(sb, t));
        powerReadingRepository.findFirstByDeviceIdOrderByReceivedAtDesc(device.getDeviceId())
                .ifPresent(p -> appendPower(sb, p));
    }

    private void appendTelemetry(StringBuilder sb, Telemetry t) {
        sb.append("  telemetry mới nhất: receivedAt=").append(t.getReceivedAt())
                .append(", temperature=").append(t.getTemperature())
                .append(", humidity=").append(t.getHumidity())
                .append(", lux=").append(t.getLux())
                .append(", presence=").append(t.getPresence())
                .append(", quality=").append(t.getQuality())
                .append(", airRaw=").append(t.getAirRaw())
                .append('\n');
    }

    private void appendPower(StringBuilder sb, PowerReading p) {
        sb.append("  power mới nhất: receivedAt=").append(p.getReceivedAt())
                .append(", busVoltageV=").append(p.getBusVoltageV())
                .append(", light1PowerW=").append(p.getLight1PowerW())
                .append(", fan1PowerW=").append(p.getFan1PowerW())
                .append(", quality=").append(p.getQuality())
                .append('\n');
    }
}
