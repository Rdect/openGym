package ch.duartesantos.opengym;

import org.junit.Test;
import static org.junit.Assert.*;
import java.time.*;

public class CalorieIntervalTest {
    @Test public void daylightSavingDaysAreNotAssumedToBe24Hours() {
        ZoneId zone = ZoneId.of("America/Los_Angeles");
        Instant later = Instant.parse("2026-12-01T00:00:00Z");
        CalorieInterval spring = CalorieInterval.of(LocalDate.parse("2026-03-08"), zone, later);
        CalorieInterval fall = CalorieInterval.of(LocalDate.parse("2026-11-01"), zone, later);
        assertEquals(23, Duration.between(spring.start, spring.end).toHours());
        assertEquals(25, Duration.between(fall.start, fall.end).toHours());
    }
    @Test public void partialTodayKeepsItsFullReportingBoundary() {
        Instant now = Instant.parse("2026-10-24T22:30:00Z");
        CalorieInterval day = CalorieInterval.of(LocalDate.parse("2026-10-25"), ZoneId.of("Europe/Istanbul"), now);
        assertEquals(Instant.parse("2026-10-24T21:00:00Z"), day.start);
        assertEquals(Instant.parse("2026-10-25T21:00:00Z"), day.end);
        assertEquals(now, day.observedThrough);
    }
    @Test public void yesterdayUsesItsFullInterval() {
        CalorieInterval day = CalorieInterval.of(LocalDate.parse("2026-10-24"), ZoneId.of("Europe/Istanbul"), Instant.parse("2026-10-24T22:30:00Z"));
        assertEquals(day.end, day.observedThrough);
    }
}
