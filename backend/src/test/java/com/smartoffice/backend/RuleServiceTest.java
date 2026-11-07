package com.smartoffice.backend;

import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.domain.RuleType;
import com.smartoffice.backend.service.RuleService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class RuleServiceTest {

    private final RuleService service = new RuleService(mock(com.smartoffice.backend.repository.RuleRepository.class),
            new ObjectMapper());

    @Test
    void tempThresholdOutOfRangeIsRejected() {
        assertThatThrownBy(() -> service.validateParams(RuleType.TEMP_HIGH,
                Map.of("thresholdC", 99)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("không hợp lệ");
    }

    @Test
    void absenceMinutesOutOfRangeIsRejected() {
        assertThatThrownBy(() -> service.validateParams(RuleType.ABSENCE_OFF,
                Map.of("absenceMinutes", 0)))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void validParamsPass() {
        service.validateParams(RuleType.TEMP_HIGH,
                Map.of("thresholdC", 32, "consecutiveSamples", 3));
        service.validateParams(RuleType.ENERGY_WASTE,
                Map.of("absenceMinutes", 10, "powerThresholdW", 2));
    }
}
