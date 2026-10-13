import { describe, expect, it } from "bun:test";
import { DateTime } from "luxon";
import {
  extract_command_and_args,
  parse_key_value_flags,
  split_pipe_args,
} from "@/parsing/args.ts";
import {
  format_datetime,
  parse_datetime_input,
  parse_day_of_week,
  parse_time_range,
} from "@/parsing/datetime.ts";
import {
  format_offset_minutes,
  parse_offsets_string,
} from "@/parsing/offsets.ts";

describe("Args Parser", () => {
  it("splits pipe args correctly", () => {
    const result = split_pipe_args("Rapat Himpunan | besok 19:00 | Aula Barat | Bahas proker");
    expect(result).toEqual([
      "Rapat Himpunan",
      "besok 19:00",
      "Aula Barat",
      "Bahas proker",
    ]);
  });

  it("parses key=value flags and positional arguments", () => {
    const result = parse_key_value_flags("2 waktu=12-10-2026 08:00 lokasi=Lab 3");
    expect(result.positional).toEqual(["2", "08:00", "3"]);
    expect(result.flags.waktu).toBe("12-10-2026");
    expect(result.flags.lokasi).toBe("Lab");
  });

  it("extracts command and args with prefix", () => {
    const cmd1 = extract_command_and_args("/event add Rapat | besok 19:00");
    expect(cmd1?.command).toBe("event");
    expect(cmd1?.args_text).toBe("add Rapat | besok 19:00");

    const cmd2 = extract_command_and_args("/PING");
    expect(cmd2?.command).toBe("ping");
    expect(cmd2?.args_text).toBe("");

    const non_cmd = extract_command_and_args("hello there");
    expect(non_cmd).toBeNull();
  });
});

describe("Datetime Parser", () => {
  const tz = "Asia/Jakarta";
  // Fixed anchor: Monday, 12 Oct 2026 08:00:00 WIB
  const anchor_dt = DateTime.fromObject(
    { year: 2026, month: 10, day: 12, hour: 8, minute: 0, second: 0 },
    { zone: tz }
  );
  const anchor_date = anchor_dt.toJSDate();

  it("parses absolute date with year", () => {
    const ms1 = parse_datetime_input("12-10-2026 08:00", tz, anchor_date);
    expect(ms1).toBe(anchor_dt.toMillis());

    const ms2 = parse_datetime_input("15/10/2026 14:30", tz, anchor_date);
    const expected = DateTime.fromObject(
      { year: 2026, month: 10, day: 15, hour: 14, minute: 30 },
      { zone: tz }
    ).toMillis();
    expect(ms2).toBe(expected);
  });

  it("parses absolute date without year (auto year)", () => {
    const ms = parse_datetime_input("15-10 10:00", tz, anchor_date);
    const expected = DateTime.fromObject(
      { year: 2026, month: 10, day: 15, hour: 10, minute: 0 },
      { zone: tz }
    ).toMillis();
    expect(ms).toBe(expected);
  });

  it("parses relative terms: hari ini, besok, lusa", () => {
    const ms_today = parse_datetime_input("hari ini 20:00", tz, anchor_date);
    expect(DateTime.fromMillis(ms_today).setZone(tz).day).toBe(12);
    expect(DateTime.fromMillis(ms_today).setZone(tz).hour).toBe(20);

    const ms_besok = parse_datetime_input("besok 19:00", tz, anchor_date);
    expect(DateTime.fromMillis(ms_besok).setZone(tz).day).toBe(13);
    expect(DateTime.fromMillis(ms_besok).setZone(tz).hour).toBe(19);

    const ms_lusa = parse_datetime_input("lusa 07:30", tz, anchor_date);
    expect(DateTime.fromMillis(ms_lusa).setZone(tz).day).toBe(14);
    expect(DateTime.fromMillis(ms_lusa).setZone(tz).hour).toBe(7);
    expect(DateTime.fromMillis(ms_lusa).setZone(tz).minute).toBe(30);
  });

  it("parses day of week nearest in the future", () => {
    // anchor is Monday 08:00
    // "senin 10:00" is today at 10:00 because 10:00 is later than 08:00
    const ms_monday = parse_datetime_input("senin 10:00", tz, anchor_date);
    expect(DateTime.fromMillis(ms_monday).setZone(tz).day).toBe(12);

    // "rabu 09:00" should be Wednesday 14 Oct 2026
    const ms_wed = parse_datetime_input("rabu 09:00", tz, anchor_date);
    expect(DateTime.fromMillis(ms_wed).setZone(tz).day).toBe(14);
  });

  it("parses time only", () => {
    // anchor is 08:00. "19:00" should be today at 19:00
    const ms_today = parse_datetime_input("19:00", tz, anchor_date);
    expect(DateTime.fromMillis(ms_today).setZone(tz).day).toBe(12);

    // "07:00" has already passed today at 08:00, so it becomes tomorrow at 07:00
    const ms_tomorrow = parse_datetime_input("07:00", tz, anchor_date);
    expect(DateTime.fromMillis(ms_tomorrow).setZone(tz).day).toBe(13);
  });

  it("parses day of week and time range for courses", () => {
    expect(parse_day_of_week("senin")).toBe(1);
    expect(parse_day_of_week("jum")).toBe(5);
    expect(parse_day_of_week("7")).toBe(7);
    expect(() => parse_day_of_week("someday")).toThrow();

    const range1 = parse_time_range("08:00-10:30");
    expect(range1.start_time).toBe("08:00");
    expect(range1.end_time).toBe("10:30");

    const range2 = parse_time_range("14:00");
    expect(range2.start_time).toBe("14:00");
    expect(range2.end_time).toBeNull();
  });

  it("formats datetime to Indonesian format", () => {
    const formatted = format_datetime(anchor_dt.toMillis(), tz);
    expect(formatted).toContain("Senin");
    expect(formatted).toContain("12 Okt 2026");
    expect(formatted).toContain("08:00");
  });
});

describe("Offsets Parser", () => {
  it("parses and sorts offsets", () => {
    const offsets = parse_offsets_string("1d, 3h, 30m, 0");
    expect(offsets).toEqual([1440, 180, 30, 0]);
  });

  it("formats offset minutes to text", () => {
    expect(format_offset_minutes(1440)).toBe("1 hari sebelum");
    expect(format_offset_minutes(180)).toBe("3 jam sebelum");
    expect(format_offset_minutes(30)).toBe("30 menit sebelum");
    expect(format_offset_minutes(0)).toBe("waktu kejadian tiba (0m)");
  });
});
