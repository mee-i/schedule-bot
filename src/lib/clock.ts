export interface Clock {
  now(): number;
  nowDate(): Date;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  nowDate(): Date {
    return new Date();
  }
}

export class FakeClock implements Clock {
  private current_time_ms: number;

  constructor(initial_time_ms: number | Date = 0) {
    this.current_time_ms =
      typeof initial_time_ms === "number"
        ? initial_time_ms
        : initial_time_ms.getTime();
  }

  now(): number {
    return this.current_time_ms;
  }

  nowDate(): Date {
    return new Date(this.current_time_ms);
  }

  set_time(time_ms: number | Date): void {
    this.current_time_ms =
      typeof time_ms === "number" ? time_ms : time_ms.getTime();
  }

  advance_by_ms(delta_ms: number): void {
    this.current_time_ms += delta_ms;
  }

  advance_by_minutes(minutes: number): void {
    this.advance_by_ms(minutes * 60 * 1000);
  }
}
