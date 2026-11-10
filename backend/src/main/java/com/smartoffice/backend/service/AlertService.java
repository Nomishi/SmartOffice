package com.smartoffice.backend.service;

import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.domain.*;
import com.smartoffice.backend.repository.AlertRepository;
import com.smartoffice.backend.realtime.RealtimeService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.criteria.Predicate;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AlertService {

    private static final Logger log = LoggerFactory.getLogger(AlertService.class);

    private final AlertRepository alertRepository;
    private final RealtimeService realtimeService;

    /**
     * Mỗi (type, deviceId) chỉ có tối đa 1 alert đang mở để tránh spam mỗi 5 giây.
     */
    @Transactional
    public Alert raise(AlertType type, AlertSeverity severity, String deviceId, String roomId,
                       Double value, Double threshold, String message) {
        return alertRepository.findFirstByTypeAndDeviceIdAndResolvedAtIsNull(type, deviceId)
                .map(existing -> {
                    existing.setValue(value);
                    existing.setThreshold(threshold);
                    existing.setMessage(message);
                    existing.setSeverity(severity);
                    return existing;
                })
                .orElseGet(() -> {
                    Alert alert = new Alert();
                    alert.setType(type);
                    alert.setSeverity(severity);
                    alert.setStatus(AlertStatus.OPEN);
                    alert.setDeviceId(deviceId);
                    alert.setRoomId(roomId);
                    alert.setValue(value);
                    alert.setThreshold(threshold);
                    alert.setMessage(message);
                    alert.setCreatedAt(Instant.now());
                    log.info("Tạo cảnh báo {} cho {}: {}", type, deviceId, message);
                    Alert saved = alertRepository.save(alert);
                    realtimeService.broadcast("alert", saved);
                    return saved;
                });
    }

    @Transactional
    public void resolve(AlertType type, String deviceId) {
        alertRepository.findFirstByTypeAndDeviceIdAndResolvedAtIsNull(type, deviceId)
                .ifPresent(alert -> {
                    alert.setResolvedAt(Instant.now());
                    log.info("Tự đóng cảnh báo {} của {}", type, deviceId);
                    realtimeService.broadcast("alert", alert);
                });
    }

    @Transactional
    public Alert acknowledge(Long alertId, Long userId) {
        Alert alert = alertRepository.findById(alertId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND",
                        "Không thấy cảnh báo " + alertId));
        if (alert.getStatus() == AlertStatus.OPEN) {
            alert.setStatus(AlertStatus.ACKNOWLEDGED);
            alert.setAcknowledgedBy(userId);
            alert.setAcknowledgedAt(Instant.now());
            realtimeService.broadcast("alert", alert);
        }
        return alert;
    }

    public Page<Alert> search(AlertStatus status, AlertType type, String deviceId,
                              Instant from, Instant to, boolean includeResolved, Pageable pageable) {
        Specification<Alert> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (type != null) {
                predicates.add(cb.equal(root.get("type"), type));
            }
            if (deviceId != null && !deviceId.isBlank()) {
                predicates.add(cb.equal(root.get("deviceId"), deviceId));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("createdAt"), to));
            }
            if (!includeResolved) {
                predicates.add(cb.isNull(root.get("resolvedAt")));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        return alertRepository.findAll(spec, pageable);
    }
}
