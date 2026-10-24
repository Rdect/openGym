package ch.duartesantos.opengym;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** Full reporting-day boundaries, distinct from the partial interval actually queried. */
final class CalorieInterval {
    final Instant start, end, observedThrough;
    private CalorieInterval(Instant start, Instant end, Instant observedThrough) {
        this.start = start;
        this.end = end;
        this.observedThrough = observedThrough;
    }
    static CalorieInterval of(LocalDate date, ZoneId zone, Instant now) {
        Instant start = date.atStartOfDay(zone).toInstant();
        Instant end = date.plusDays(1).atStartOfDay(zone).toInstant();
        if (start.isAfter(now)) throw new IllegalArgumentException("Future reporting day");
        return new CalorieInterval(start, end, end.isAfter(now) ? now : end);
    }
}
