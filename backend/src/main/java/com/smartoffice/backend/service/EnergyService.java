package com.smartoffice.backend.service;

import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.api.dto.EnergyResponse;
import com.smartoffice.backend.domain.PowerReading;
import com.smartoffice.backend.repository.PowerReadingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

@Service
@RequiredArgsConstructor
public class EnergyService {

    private final PowerReadingRepository powerReadingRepository;

    /**
     * Tính Wh từ công suất tức thời bằng tích phân hình chữ nhật.
     * dt giới hạn tối đa 5 phút để khoảng mất dữ liệu không tạo ra số liệu ảo.
     */
    public EnergyResponse compute(String deviceId, Instant from, Instant to, String bucketRaw) {
        if (from == null || to == null || !from.isBefore(to)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "from/to bắt buộc và from phải trước to");
        }
        if (Duration.between(from, to).compareTo(Duration.ofDays(7)) > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "Khoảng truy vấn tối đa 7 ngày");
        }
        Bucket bucket = Bucket.parse(bucketRaw);

        List<PowerReading> readings =
                powerReadingRepository.findByDeviceIdAndReceivedAtBetweenOrderByReceivedAtAsc(deviceId, from, to);
        Map<Instant, Accumulator> groups = new TreeMap<>();

        for (int i = 0; i < readings.size(); i++) {
            PowerReading current = readings.get(i);
            double dtSeconds;
            if (i + 1 < readings.size()) {
                dtSeconds = Math.min(300,
                        Math.max(1, Duration.between(current.getReceivedAt(),
                                readings.get(i + 1).getReceivedAt()).toSeconds()));
            } else {
                dtSeconds = 5; // xấp xỉ 1 chu kỳ telemetry
            }

            double lightW = current.getLight1PowerW() == null ? 0 : current.getLight1PowerW();
            double fanW = current.getFan1PowerW() == null ? 0 : current.getFan1PowerW();
            double factor = dtSeconds / 3600.0;

            Instant key = bucket.start(current.getReceivedAt());
            Accumulator acc = groups.computeIfAbsent(key, k -> new Accumulator());
            acc.lightWh += lightW * factor;
            acc.fanWh += fanW * factor;
            acc.lightWSum += lightW;
            acc.fanWSum += fanW;
            acc.samples++;
        }

        if (groups.size() > 1000) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "Số bucket vượt quá 1000, chọn bucket lớn hơn");
        }

        List<EnergyResponse.Bucket> buckets = new ArrayList<>();
        double total = 0;
        for (Map.Entry<Instant, Accumulator> entry : groups.entrySet()) {
            Accumulator acc = entry.getValue();
            double lightWh = round(acc.lightWh);
            double fanWh = round(acc.fanWh);
            total += lightWh + fanWh;
            buckets.add(new EnergyResponse.Bucket(entry.getKey(), lightWh, fanWh,
                    round(acc.lightWSum / acc.samples), round(acc.fanWSum / acc.samples)));
        }

        return new EnergyResponse(deviceId, from, to, "Wh", round(total), buckets);
    }

    private double round(double value) {
        return Math.round(value * 10_000.0) / 10_000.0;
    }

    private static final class Accumulator {
        double lightWh;
        double fanWh;
        double lightWSum;
        double fanWSum;
        int samples;
    }

    enum Bucket {
        RAW, MINUTE, HOUR, DAY;

        static Bucket parse(String raw) {
            if (raw == null || raw.isBlank()) {
                return HOUR;
            }
            try {
                return valueOf(raw.toUpperCase());
            } catch (IllegalArgumentException ex) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                        "bucket phải là raw|minute|hour|day");
            }
        }

        Instant start(Instant instant) {
            return switch (this) {
                case RAW -> instant;
                case MINUTE -> instant.truncatedTo(ChronoUnit.MINUTES);
                case HOUR -> instant.truncatedTo(ChronoUnit.HOURS);
                case DAY -> instant.atZone(ZoneOffset.UTC).truncatedTo(ChronoUnit.DAYS).toInstant();
            };
        }
    }
}
