import { DateTime } from "luxon";
import { UserError } from "@/lib/errors.ts";

const DAY_NAME_TO_ISO: Record<string, number> = {
  senin: 1,
  sen: 1,
  "1": 1,
  selasa: 2,
  sel: 2,
  "2": 2,
  rabu: 3,
  rab: 3,
  "3": 3,
  kamis: 4,
  kam: 4,
  "4": 4,
  jumat: 5,
  jum: 5,
  "5": 5,
  sabtu: 6,
  sab: 6,
  "6": 6,
  minggu: 7,
  min: 7,
  "7": 7,
};

const ISO_TO_INDONESIAN_DAY: Record<number, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
};

export function parse_day_of_week(input: string): number {
  const normalized = input.trim().toLowerCase();
  const day = DAY_NAME_TO_ISO[normalized];
  if (!day) {
    throw new UserError(
      `Hari "${input}" tidak valid. Gunakan nama hari (senin..minggu), singkatan (sen..min), atau angka 1..7.`
    );
  }
  return day;
}

export function format_day_of_week(iso_day: number): string {
  return ISO_TO_INDONESIAN_DAY[iso_day] ?? "Tidak diketahui";
}

export function parse_time_range(input: string): {
  start_time: string;
  end_time: string | null;
} {
  const parts = input.split("-").map((s) => s.trim());
  const time_regex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!time_regex.test(parts[0] ?? "")) {
    throw new UserError(
      `Format jam mulai "${parts[0]}" tidak valid. Gunakan format HH:mm (contoh: 08:00).`
    );
  }

  const start_time = parts[0]!;
  let end_time: string | null = null;

  if (parts.length > 1 && parts[1]) {
    if (!time_regex.test(parts[1])) {
      throw new UserError(
        `Format jam selesai "${parts[1]}" tidak valid. Gunakan format HH:mm (contoh: 10:30).`
      );
    }
    end_time = parts[1];
  }

  return { start_time, end_time };
}

export function parse_datetime_input(
  raw_input: string,
  timezone: string,
  now_anchor?: Date
): number {
  const trimmed = raw_input.trim().toLowerCase();
  const now_dt = now_anchor
    ? DateTime.fromJSDate(now_anchor).setZone(timezone)
    : DateTime.now().setZone(timezone);

  if (!now_dt.isValid) {
    throw new UserError(`Zona waktu "${timezone}" tidak valid.`);
  }

  // 1. Time only: "HH:mm" (e.g. "19:00")
  const time_only_match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (time_only_match && time_only_match[1] && time_only_match[2]) {
    const hour = parseInt(time_only_match[1], 10);
    const minute = parseInt(time_only_match[2], 10);
    let target = now_dt.set({ hour, minute, second: 0, millisecond: 0 });

    if (target.toMillis() <= now_dt.toMillis()) {
      target = target.plus({ days: 1 });
    }
    return target.toMillis();
  }

  // 2. Relative keywords: "hari ini HH:mm", "besok HH:mm", "lusa HH:mm"
  const relative_match = trimmed.match(
    /^(hari\s+ini|besok|lusa)\s+([01]\d|2[0-3]):([0-5]\d)$/
  );
  if (
    relative_match &&
    relative_match[1] &&
    relative_match[2] &&
    relative_match[3]
  ) {
    const keyword = relative_match[1].replace(/\s+/g, " ");
    const hour = parseInt(relative_match[2], 10);
    const minute = parseInt(relative_match[3], 10);

    let days_to_add = 0;
    if (keyword === "besok") {
      days_to_add = 1;
    } else if (keyword === "lusa") {
      days_to_add = 2;
    }

    const target = now_dt
      .plus({ days: days_to_add })
      .set({ hour, minute, second: 0, millisecond: 0 });

    return target.toMillis();
  }

  // 3. Weekday name: e.g. "senin 10:00"
  const weekday_match = trimmed.match(/^([a-z]+)\s+([01]\d|2[0-3]):([0-5]\d)$/);
  if (
    weekday_match &&
    weekday_match[1] &&
    weekday_match[2] &&
    weekday_match[3] &&
    DAY_NAME_TO_ISO[weekday_match[1]]
  ) {
    const target_iso_day = DAY_NAME_TO_ISO[weekday_match[1]]!;
    const hour = parseInt(weekday_match[2], 10);
    const minute = parseInt(weekday_match[3], 10);

    let days_ahead = target_iso_day - now_dt.weekday;
    if (days_ahead < 0) {
      days_ahead += 7;
    }

    let target = now_dt
      .plus({ days: days_ahead })
      .set({ hour, minute, second: 0, millisecond: 0 });

    // If target day is today and time has already passed, advance to next week
    if (days_ahead === 0 && target.toMillis() <= now_dt.toMillis()) {
      target = target.plus({ days: 7 });
    }

    return target.toMillis();
  }

  // 4. Absolute with Year: "DD-MM-YYYY HH:mm" or "DD/MM/YYYY HH:mm"
  const full_date_match = trimmed.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+([01]\d|2[0-3]):([0-5]\d)$/
  );
  if (
    full_date_match &&
    full_date_match[1] &&
    full_date_match[2] &&
    full_date_match[3] &&
    full_date_match[4] &&
    full_date_match[5]
  ) {
    const day = parseInt(full_date_match[1], 10);
    const month = parseInt(full_date_match[2], 10);
    const year = parseInt(full_date_match[3], 10);
    const hour = parseInt(full_date_match[4], 10);
    const minute = parseInt(full_date_match[5], 10);

    const target = DateTime.fromObject(
      { year, month, day, hour, minute, second: 0, millisecond: 0 },
      { zone: timezone }
    );

    if (!target.isValid) {
      throw new UserError(
        `Tanggal "${raw_input}" tidak valid (contoh: 12-10-2026 08:00).`
      );
    }
    return target.toMillis();
  }

  // 5. Absolute without Year: "DD-MM HH:mm" or "DD/MM HH:mm" (Auto year)
  const short_date_match = trimmed.match(
    /^(\d{1,2})[-/](\d{1,2})\s+([01]\d|2[0-3]):([0-5]\d)$/
  );
  if (
    short_date_match &&
    short_date_match[1] &&
    short_date_match[2] &&
    short_date_match[3] &&
    short_date_match[4]
  ) {
    const day = parseInt(short_date_match[1], 10);
    const month = parseInt(short_date_match[2], 10);
    const hour = parseInt(short_date_match[3], 10);
    const minute = parseInt(short_date_match[4], 10);

    let year = now_dt.year;
    let target = DateTime.fromObject(
      { year, month, day, hour, minute, second: 0, millisecond: 0 },
      { zone: timezone }
    );

    if (!target.isValid) {
      throw new UserError(
        `Tanggal "${raw_input}" tidak valid (contoh: 12-10 08:00).`
      );
    }

    // If month/day already passed in the current year, use next year
    if (target.toMillis() < now_dt.toMillis() - 24 * 60 * 60 * 1000) {
      year += 1;
      target = DateTime.fromObject(
        { year, month, day, hour, minute, second: 0, millisecond: 0 },
        { zone: timezone }
      );
    }

    return target.toMillis();
  }

  throw new UserError(
    `Format waktu "${raw_input}" tidak dikenali.\n` +
      `Format yang didukung:\n` +
      `• Absolut: "12-10-2026 08:00" atau "12-10 08:00"\n` +
      `• Relatif: "hari ini 20:00", "besok 19:00", "lusa 07:30"\n` +
      `• Hari: "senin 10:00"\n` +
      `• Jam saja: "19:00"`
  );
}

export function format_datetime(
  epoch_ms: number,
  timezone: string = "Asia/Jakarta"
): string {
  const dt = DateTime.fromMillis(epoch_ms).setZone(timezone).setLocale("id");
  const indonesian_day = ISO_TO_INDONESIAN_DAY[dt.weekday] ?? "";
  const date_formatted = dt.toFormat("d LLL yyyy • HH:mm");
  const tz_name =
    timezone === "Asia/Jakarta"
      ? "WIB"
      : timezone === "Asia/Makassar"
        ? "WITA"
        : timezone === "Asia/Jayapura"
          ? "WIT"
          : (dt.offsetNameShort ?? "");
  return `${indonesian_day}, ${date_formatted} ${tz_name}`.trim();
}
