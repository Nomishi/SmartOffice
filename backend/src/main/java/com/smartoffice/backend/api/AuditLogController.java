package com.smartoffice.backend.api;

import com.smartoffice.backend.api.dto.PageResponse;
import com.smartoffice.backend.domain.AuditLog;
import com.smartoffice.backend.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/audit-logs")
@RequiredArgsConstructor
public class AuditLogController {

    private final AuditLogRepository auditLogRepository;

    @GetMapping
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public PageResponse<AuditLog> list(@RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "20") int size) {
        return PageResponse.of(auditLogRepository.findAllByOrderByTimestampDesc(
                PageRequest.of(page, Math.min(Math.max(size, 1), 100))));
    }
}
