import { UserError } from "@/lib/errors.ts";

export function parse_offset_token(token: string): number {
  const trimmed = token.trim().toLowerCase();
  if (trimmed === "0" || trimmed === "0m" || trimmed === "0menit") {
    return 0;
  }

  const match = trimmed.match(/^(\d+)\s*(d|hari|h|jam|m|menit)?$/);
  if (!match || !match[1]) {
    throw new UserError(
      `Format offset "${token}" tidak valid. Contoh format: "1d", "3h", "30m", atau "0".`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2] ?? "m";

  if (unit === "d" || unit === "hari") {
    return value * 1440;
  }
  if (unit === "h" || unit === "jam") {
    return value * 60;
  }
  return value; // minutes
}

export function parse_offsets_string(input: string): number[] {
  const tokens = input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (tokens.length === 0) {
    throw new UserError(
      "Daftar offset tidak boleh kosong. Contoh: 1d,3h,30m"
    );
  }

  const offsets = tokens.map((token) => parse_offset_token(token));
  // Deduplicate and sort descending
  const unique_offsets = Array.from(new Set(offsets)).sort((a, b) => b - a);
  return unique_offsets;
}

export function format_offset_minutes(minutes: number): string {
  if (minutes === 0) {
    return "waktu kejadian tiba (0m)";
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} hari sebelum`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} jam sebelum`;
  }
  return `${minutes} menit sebelum`;
}
