package com.smartoffice.backend;

import com.smartoffice.backend.config.SmartOfficeProperties;
import com.smartoffice.backend.domain.Device;
import com.smartoffice.backend.domain.Quality;
import com.smartoffice.backend.repository.DeviceRepository;
import com.smartoffice.backend.service.DeviceService;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class DeviceServiceTest {

    private final DeviceService service = new DeviceService(mock(DeviceRepository.class),
            new SmartOfficeProperties());

    @Test
    void suspectBreaksBothStreaks() {
        Device device = new Device();
        device.setInvalidStreak(2);
        device.setValidStreak(5);
        device.setEmptySince(Instant.now().minusSeconds(600));

        service.applyTelemetry(device, Quality.SUSPECT, false, Instant.now());

        assertThat(device.getInvalidStreak()).isZero();
        assertThat(device.getValidStreak()).isZero();
        // SUSPECT không được reset emptySince (không coi là có người)
        assertThat(device.getEmptySince()).isNotNull();
    }

    @Test
    void validPresenceTrueClearsEmptySince() {
        Device device = new Device();
        device.setEmptySince(Instant.now().minusSeconds(600));
        device.setInvalidStreak(2);

        service.applyTelemetry(device, Quality.VALID, true, Instant.now());

        assertThat(device.getEmptySince()).isNull();
        assertThat(device.getValidStreak()).isEqualTo(1);
        assertThat(device.getInvalidStreak()).isZero();
    }
}
