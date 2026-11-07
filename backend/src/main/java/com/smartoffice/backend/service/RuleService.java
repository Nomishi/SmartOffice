package com.smartoffice.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.api.dto.RuleDto;
import com.smartoffice.backend.api.dto.RuleUpdateRequest;
import com.smartoffice.backend.domain.Rule;
import com.smartoffice.backend.domain.RuleType;
import com.smartoffice.backend.repository.RuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
public class RuleService {

    private final RuleRepository ruleRepository;
    private final ObjectMapper objectMapper;

    public List<RuleDto> list() {
        return ruleRepository.findAllByOrderByRuleIdAsc().stream().map(this::toDto).toList();
    }

    public Optional<Rule> enabledRule(RuleType type) {
        return ruleRepository.findByType(type).filter(Rule::isEnabled);
    }

    public RuleDto toDto(Rule rule) {
        return new RuleDto(rule.getRuleId(), rule.getName(), rule.getType(), rule.isEnabled(),
                readMap(rule.getParamsJson()), readMap(rule.getActionJson()), rule.getUpdatedAt());
    }

    private Map<String, Object> readMap(String json) {
        try {
            JsonNode node = objectMapper.readTree(json == null ? "{}" : json);
            @SuppressWarnings("unchecked")
            Map<String, Object> map = objectMapper.convertValue(node, Map.class);
            return map;
        } catch (Exception ex) {
            return Map.of();
        }
    }

    @Transactional
    public RuleDto update(Long ruleId, RuleUpdateRequest request) {
        Rule rule = ruleRepository.findById(ruleId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND",
                        "Không thấy rule " + ruleId));

        if (request.name() != null && !request.name().isBlank()) {
            rule.setName(request.name().trim());
        }
        if (request.enabled() != null) {
            rule.setEnabled(request.enabled());
        }
        if (request.params() != null) {
            Map<String, Object> merged = new LinkedHashMap<>(readMap(rule.getParamsJson()));
            merged.putAll(request.params());
            validateParams(rule.getType(), merged);
            rule.setParamsJson(writeJson(merged));
        }
        if (request.action() != null) {
            rule.setActionJson(writeJson(request.action()));
        }
        rule.setUpdatedAt(Instant.now());
        return toDto(rule);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "JSON không hợp lệ");
        }
    }

    /** Validate theo contract mục 9.1. */
    public void validateParams(RuleType type, Map<String, Object> params) {
        List<Map<String, String>> errors = new ArrayList<>();
        switch (type) {
            case TEMP_HIGH -> {
                range(errors, params, "thresholdC", 0, 60);
                range(errors, params, "consecutiveSamples", 1, 20);
            }
            case AIR_BAD -> {
                range(errors, params, "thresholdRaw", 0, 4095);
                range(errors, params, "consecutiveSamples", 1, 20);
                range(errors, params, "warmupSec", 0, 600);
            }
            case ABSENCE_OFF -> {
                range(errors, params, "absenceMinutes", 1, 120);
                if (params.containsKey("targets") && !(params.get("targets") instanceof Collection)) {
                    errors.add(Map.of("field", "targets", "message", "phải là mảng target"));
                }
            }
            case DOOR_OPEN_LIMIT -> range(errors, params, "openMinutes", 1, 120);
            case ENERGY_WASTE -> {
                range(errors, params, "absenceMinutes", 1, 120);
                range(errors, params, "powerThresholdW", 0, 100);
            }
        }
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "Tham số rule không hợp lệ", errors);
        }
    }

    private void range(List<Map<String, String>> errors, Map<String, Object> params,
                       String field, double min, double max) {
        Object value = params.get(field);
        if (value == null) {
            return;
        }
        if (!(value instanceof Number number)) {
            errors.add(Map.of("field", field, "message", "phải là số"));
            return;
        }
        double v = number.doubleValue();
        if (v < min || v > max) {
            errors.add(Map.of("field", field, "message",
                    "phải trong khoảng " + min + ".." + max));
        }
    }

    public int intParam(Map<String, Object> params, String field, int defaultValue) {
        Object value = params.get(field);
        return value instanceof Number n ? n.intValue() : defaultValue;
    }

    public double doubleParam(Map<String, Object> params, String field, double defaultValue) {
        Object value = params.get(field);
        return value instanceof Number n ? n.doubleValue() : defaultValue;
    }

    @SuppressWarnings("unchecked")
    public List<String> stringListParam(Map<String, Object> params, String field, List<String> defaultValue) {
        Object value = params.get(field);
        if (value instanceof Collection<?> collection) {
            return collection.stream().map(String::valueOf).toList();
        }
        return defaultValue;
    }

    public Map<String, Object> paramsOf(Rule rule) {
        return readMap(rule.getParamsJson());
    }

    public Map<String, Object> actionOf(Rule rule) {
        return readMap(rule.getActionJson());
    }
}
