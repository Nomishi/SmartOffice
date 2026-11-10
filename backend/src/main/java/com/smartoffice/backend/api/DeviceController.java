package com.smartoffice.backend.api;

import com.smartoffice.backend.api.dto.*;
import com.smartoffice.backend.domain.*;
import com.smartoffice.backend.repository.PowerReadingRepository;
import com.smartoffice.backend.repository.TelemetryRepository;
import com.smartoffice.backend.service.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final DeviceService deviceService;
    private final TelemetryRepository telemetryRepository;
    private final PowerReadingRepository powerReadingRepository;
    private final CommandService commandService;
    private final ConfigService configService;
    private final EnergyService energyService;

    @PostMapping
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<DeviceSummaryDto> register(@Valid @RequestBody CreateDeviceRequest request) {
        Device device = deviceService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(DeviceSummaryDto.from(device));
    }

    @GetMapping
    public PageResponse<DeviceSummaryDto> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "deviceId,asc") String sort) {
        Pageable pageable = pageable(page, size, sort);
        Page<DeviceSummaryDto> result = deviceService.list(pageable).map(DeviceSummaryDto::from);
        return PageResponse.of(result);
    }

    @GetMapping("/{id}")
    public DeviceSummaryDto get(@PathVariable String id) {
        return DeviceSummaryDto.from(deviceService.getRequired(id));
    }

    @GetMapping("/{id}/status")
    public DeviceStatusResponse status(@PathVariable String id) {
        Device device = deviceService.getRequired(id);
        Object latest = null;
        Map<String, String> actuators = null;

        if (device.getType() == DeviceType.ENV) {
            latest = telemetryRepository.findFirstByDeviceIdOrderByReceivedAtDesc(id)
                    .map(this::toTelemetryDto).orElse(null);
        } else {
            latest = powerReadingRepository.findFirstByDeviceIdOrderByReceivedAtDesc(id)
                    .map(this::toPowerDto).orElse(null);
            actuators = new LinkedHashMap<>();
            actuators.put("light1", device.getLight1());
            actuators.put("fan1", device.getFan1());
            actuators.put("buzzer1", device.getBuzzer1());
            actuators.put("door1", device.getDoor1());
        }

        return new DeviceStatusResponse(device.getDeviceId(), device.getName(), device.getType(),
                device.getStatus(), device.getMode(), device.isOnline(), device.getLastSeenAt(),
                device.getFwVersion(), actuators, latest);
    }

    @GetMapping("/{id}/telemetry")
    public PageResponse<TelemetryDto> telemetry(
            @PathVariable String id,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        deviceService.getRequired(id);
        validateRange(from, to);
        Pageable pageable = PageRequest.of(page, clampSize(size),
                Sort.by(Sort.Direction.DESC, "receivedAt"));
        Page<TelemetryDto> result = telemetryRepository
                .findByDeviceIdAndReceivedAtBetween(id, from, to, pageable)
                .map(this::toTelemetryDto);
        return PageResponse.of(result);
    }

    @GetMapping("/{id}/energy")
    public EnergyResponse energy(
            @PathVariable String id,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "hour") String bucket) {
        deviceService.getRequired(id);
        return energyService.compute(id, from, to, bucket);
    }

    @GetMapping("/{id}/commands")
    public PageResponse<CommandDto> commands(
            @PathVariable String id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        deviceService.getRequired(id);
        Pageable pageable = PageRequest.of(page, clampSize(size),
                Sort.by(Sort.Direction.DESC, "issuedAt"));
        return commandService.listByDevice(id, pageable);
    }

    @PostMapping("/{id}/commands")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('ADMIN', 'OPERATOR')")
    public ResponseEntity<CommandDto> sendCommand(
            @PathVariable String id,
            @Valid @RequestBody CommandRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestParam(defaultValue = "false") boolean wait) {
        String issuedBy = com.smartoffice.backend.security.SecurityUtils.getIssuedBy();
        Command command = commandService.create(id, request.target(), request.action(),
                issuedBy, idempotencyKey);

        if (wait) {
            Command finished = commandService.awaitResult(command.getCommandId(), 10_000);
            return ResponseEntity.ok(CommandDto.from(finished));
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(CommandDto.from(command));
    }

    @PostMapping("/{id}/mode")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('ADMIN', 'OPERATOR')")
    public Map<String, Object> setMode(@PathVariable String id, @Valid @RequestBody ModeRequest request) {
        Device device = deviceService.setMode(id, request.mode());
        return Map.of("deviceId", device.getDeviceId(), "mode", device.getMode(),
                "updatedAt", device.getUpdatedAt());
    }

    @PutMapping("/{id}/config")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('ADMIN', 'OPERATOR')")
    public ConfigDto sendConfig(@PathVariable String id,
                                @Valid @RequestBody ConfigRequest request) {
        String issuedBy = com.smartoffice.backend.security.SecurityUtils.getIssuedBy();
        return configService.send(id, request, issuedBy);
    }

    @PostMapping("/{id}/activate")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> activate(@PathVariable String id) {
        return changeStatus(id, DeviceStatus.ACTIVE);
    }

    @PostMapping("/{id}/lock")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> lock(@PathVariable String id) {
        return changeStatus(id, DeviceStatus.LOCKED);
    }

    @PostMapping("/{id}/decommission")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> decommission(@PathVariable String id) {
        return changeStatus(id, DeviceStatus.DECOMMISSIONED);
    }

    private Map<String, Object> changeStatus(String id, DeviceStatus status) {
        Device device = deviceService.getRequired(id);
        device.setStatus(status);
        device.setUpdatedAt(Instant.now());
        deviceService.save(device);
        return Map.of("deviceId", id, "status", status);
    }

    private Pageable pageable(int page, int size, String sort) {
        String[] parts = sort.split(",");
        Sort.Direction direction = parts.length > 1 && "desc".equalsIgnoreCase(parts[1])
                ? Sort.Direction.DESC : Sort.Direction.ASC;
        return PageRequest.of(page, clampSize(size), Sort.by(direction, parts[0]));
    }

    private int clampSize(int size) {
        if (size < 1) {
            return 20;
        }
        return Math.min(size, 100);
    }

    private void validateRange(Instant from, Instant to) {
        if (from == null || to == null || !from.isBefore(to)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "from/to bắt buộc và from phải trước to");
        }
        if (Duration.between(from, to).compareTo(Duration.ofDays(7)) > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "Khoảng truy vấn tối đa 7 ngày");
        }
    }

    private TelemetryDto toTelemetryDto(Telemetry t) {
        return new TelemetryDto(t.getReceivedAt(), t.getTemperature(), t.getHumidity(), t.getLux(),
                t.getPresence(), t.getQuality(), t.getAirRaw(), t.getDistanceCm(),
                t.getMovingEnergy(), t.getStaticEnergy(), t.getRssi());
    }

    private PowerReadingDto toPowerDto(PowerReading p) {
        return new PowerReadingDto(p.getReceivedAt(), p.getBusVoltageV(), p.getLight1PowerW(),
                p.getLight1CurrentMa(), p.getFan1PowerW(), p.getFan1CurrentMa(),
                p.getQuality(), p.getRssi());
    }
}
