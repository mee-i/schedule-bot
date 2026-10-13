import { describe, expect, it } from "bun:test";
import { FakeClock, SystemClock } from "@/lib/clock.ts";

describe("Clock abstraction", () => {
  it("SystemClock returns current timestamp and Date", () => {
    const clock = new SystemClock();
    const now_ms = clock.now();
    const now_date = clock.nowDate();

    expect(typeof now_ms).toBe("number");
    expect(now_date instanceof Date).toBe(true);
    expect(Math.abs(now_date.getTime() - now_ms)).toBeLessThanOrEqual(5);
  });

  it("FakeClock advances time deterministically", () => {
    const start_time = 1_700_000_000_000;
    const clock = new FakeClock(start_time);

    expect(clock.now()).toBe(start_time);
    expect(clock.nowDate().getTime()).toBe(start_time);

    clock.advance_by_minutes(15);
    expect(clock.now()).toBe(start_time + 15 * 60 * 1000);

    clock.set_time(2_000_000_000_000);
    expect(clock.now()).toBe(2_000_000_000_000);
  });
});
