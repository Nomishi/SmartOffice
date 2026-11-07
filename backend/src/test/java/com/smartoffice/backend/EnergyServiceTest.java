package com.smartoffice.backend;

import com.smartoffice.backend.api.dto.EnergyResponse;
import com.smartoffice.backend.domain.PowerReading;
import com.smartoffice.backend.domain.Quality;
import com.smartoffice.backend.repository.PowerReadingRepository;
import com.smartoffice.backend.service.EnergyService;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EnergyServiceTest {

    @Test
    void computesWhFromPowerReadings() {
        PowerReadingRepository repo = mock(PowerReadingRepository.class);
        EnergyService service = new EnergyService(repo);

        Instant t0 = Instant.parse("2026-10-24T10:00:00Z");
        PowerReading r1 = reading(t0, 10.0, 0.0);
        PowerReading r2 = reading(t0.plusSeconds(60), 10.0, 0.0);
        when(repo.findByDeviceIdAndReceivedAtBetweenOrderByReceivedAtAsc(
                eq("office-ctrl-01"), any(), any())).thenReturn(List.of(r1, r2));

        EnergyResponse response = service.compute("office-ctrl-01",
                t0, t0.plusSeconds(120), "hour");

        // 10W trong 60s = 10 * 60/3600 = 0.1667 Wh; bản ghi cuối cộng thêm 5s.
        assertThat(response.totalWh()).isBetween(0.16, 0.19);
        assertThat(response.buckets()).hasSize(1);
        assertThat(response.buckets().get(0).light1AvgW()).isEqualTo(10.0);
    }

    private PowerReading reading(Instant at, double lightW, double fanW) {
        PowerReading r = new PowerReading();
        r.setDeviceId("office-ctrl-01");
        r.setReceivedAt(at);
        r.setLight1PowerW(lightW);
        r.setFan1PowerW(fanW);
        r.setQuality(Quality.VALID);
        return r;
    }
}
