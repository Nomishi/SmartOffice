package com.smartoffice.backend.api;

import com.smartoffice.backend.api.dto.PageResponse;
import com.smartoffice.backend.domain.Alert;
import com.smartoffice.backend.domain.AlertStatus;
import com.smartoffice.backend.domain.AlertType;
import com.smartoffice.backend.service.AlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/alerts")
@RequiredArgsConstructor
public class AlertController {

    private final AlertService alertService;

    @GetMapping
    public PageResponse<Alert> list(
            @RequestParam(required = false) AlertStatus status,
            @RequestParam(required = false) AlertType type,
            @RequestParam(required = false) String deviceId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "false") boolean includeResolved,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, Math.min(Math.max(size, 1), 100),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Alert> result = alertService.search(status, type, deviceId, from, to,
                includeResolved, pageable);
        return PageResponse.of(result);
    }

    @PatchMapping("/{id}/acknowledge")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('ADMIN', 'OPERATOR')")
    public Map<String, Object> acknowledge(@PathVariable Long id) {
        Long userId = com.smartoffice.backend.security.SecurityUtils.getCurrentUserId();
        Alert alert = alertService.acknowledge(id, userId != null ? userId : 0L);
        return Map.of(
                "alertId", alert.getAlertId(),
                "status", alert.getStatus(),
                "acknowledgedBy", alert.getAcknowledgedBy() == null ? 0 : alert.getAcknowledgedBy(),
                "acknowledgedAt", alert.getAcknowledgedAt());
    }
}
