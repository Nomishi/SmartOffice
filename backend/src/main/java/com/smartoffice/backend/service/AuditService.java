package com.smartoffice.backend.service;

import com.smartoffice.backend.domain.AuditLog;
import com.smartoffice.backend.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    public void log(String issuedBy, String action, String target, String result) {
        AuditLog entry = new AuditLog();
        entry.setUserId(parseUserId(issuedBy));
        entry.setAction(action);
        entry.setTarget(target);
        entry.setResult(result);
        auditLogRepository.save(entry);
    }

    public static Long parseUserId(String issuedBy) {
        if (issuedBy == null) {
            return null;
        }
        if (issuedBy.startsWith("user-")) {
            try {
                return Long.parseLong(issuedBy.substring("user-".length()));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
}
