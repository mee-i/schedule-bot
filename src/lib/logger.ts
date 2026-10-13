import { Writable } from "node:stream";
import pino from "pino";
import { env } from "@/config/env.ts";

export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",

  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
};

export function get_log_timestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${hours}:${minutes}:${seconds}`;
}

function get_level_badge(level: number): string {
  switch (level) {
    case 10:
      return `${colors.gray}[TRACE]${colors.reset}`;
    case 20:
      return `${colors.dim}${colors.cyan}[DEBUG]${colors.reset}`;
    case 30:
      return `${colors.bold}${colors.green}[INFO ]${colors.reset}`;
    case 40:
      return `${colors.bold}${colors.yellow}[WARN ]${colors.reset}`;
    case 50:
      return `${colors.bold}${colors.red}[ERROR]${colors.reset}`;
    case 60:
      return `${colors.bgRed}${colors.white}${colors.bold}[FATAL]${colors.reset}`;
    default:
      return `${colors.gray}[LEVEL ${level}]${colors.reset}`;
  }
}

function format_pino_record(raw: Record<string, unknown>): string {
  const level = typeof raw.level === "number" ? raw.level : 30;
  const time_val = raw.time;
  const date = typeof time_val === "number" ? new Date(time_val) : new Date();
  const time_str = `${colors.gray}[${get_log_timestamp(date)}]${colors.reset}`;
  const badge = get_level_badge(level);

  const parts: string[] = [time_str, badge];

  if (raw.module && typeof raw.module === "string") {
    parts.push(`${colors.magenta}[${raw.module}]${colors.reset}`);
  }

  // Event name or msg
  if (raw.event && typeof raw.event === "string") {
    parts.push(`${colors.bold}${colors.cyan}${raw.event}${colors.reset}`);
  }
  if (raw.msg && typeof raw.msg === "string") {
    parts.push(`${colors.white}${raw.msg}${colors.reset}`);
  }

  // Extra keys to display
  const ignored = new Set([
    "level",
    "time",
    "pid",
    "hostname",
    "msg",
    "event",
    "module",
    "error",
    "err",
  ]);

  const extras: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!ignored.has(key) && value !== undefined) {
      const val_str =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      extras.push(
        `${colors.gray}${key}=${colors.reset}${colors.yellow}${val_str}${colors.reset}`
      );
    }
  }

  if (extras.length > 0) {
    parts.push(extras.join(" "));
  }

  // Error details if present
  const err = raw.error ?? raw.err;
  if (err) {
    const err_str =
      typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
    parts.push(`\n  ${colors.red}↳ Error: ${err_str}${colors.reset}`);
  }

  return parts.join(" ");
}

const pretty_stream = new Writable({
  write(chunk: Buffer | string, _encoding, callback) {
    const text = chunk.toString();
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "level" in parsed
        ) {
          process.stdout.write(format_pino_record(parsed) + "\n");
        } else {
          process.stdout.write(trimmed + "\n");
        }
      } catch {
        process.stdout.write(trimmed + "\n");
      }
    }
    callback();
  },
});

export const logger = pino(
  {
    level: env.LOG_LEVEL,
  },
  pretty_stream
);

export interface ChatLogIncoming {
  is_group: boolean;
  chat_jid: string;
  group_name?: string | null;
  sender_jid: string;
  sender_name?: string | null;
  text: string;
}

export interface ChatLogOutgoing {
  is_group: boolean;
  chat_jid: string;
  group_name?: string | null;
  target_name?: string | null;
  text: string;
}

function clean_phone(jid: string): string {
  return jid.split("@")[0]?.split(":")[0] ?? jid;
}

export const chat_logger = {
  incoming(data: ChatLogIncoming): void {
    const time = `${colors.gray}[${get_log_timestamp()}]${colors.reset}`;
    const type_badge = data.is_group
      ? `${colors.bold}${colors.brightCyan}[GC]${colors.reset}`
      : `${colors.bold}${colors.brightMagenta}[PC]${colors.reset}`;

    const parts: string[] = [time, type_badge];

    if (data.is_group) {
      const g_label = data.group_name || clean_phone(data.chat_jid);
      parts.push(`${colors.yellow}[${g_label}]${colors.reset}`);
    }

    const phone = clean_phone(data.sender_jid);
    if (data.sender_name) {
      parts.push(
        `${colors.brightGreen}[${data.sender_name} (${phone})]${colors.reset}:`
      );
    } else {
      parts.push(`${colors.brightGreen}[${phone}]${colors.reset}:`);
    }

    const is_command = data.text.startsWith("/");
    if (is_command) {
      parts.push(
        `${colors.bold}${colors.brightYellow}👉 ${data.text}${colors.reset}`
      );
    } else {
      parts.push(`${colors.white}"${data.text}"${colors.reset}`);
    }

    console.log(parts.join(" "));
  },

  outgoing(data: ChatLogOutgoing): void {
    const time = `${colors.gray}[${get_log_timestamp()}]${colors.reset}`;
    const bot_badge = `${colors.bold}${colors.green}[BOT]${colors.reset}`;
    const arrow = `${colors.gray}➜${colors.reset}`;

    const type_badge = data.is_group
      ? `${colors.bold}${colors.brightCyan}[GC]${colors.reset}`
      : `${colors.bold}${colors.brightMagenta}[PC]${colors.reset}`;

    const parts: string[] = [time, bot_badge, arrow, type_badge];

    if (data.is_group) {
      const g_label = data.group_name || clean_phone(data.chat_jid);
      parts.push(`${colors.yellow}[${g_label}]${colors.reset}:`);
    } else {
      const target = data.target_name
        ? `${data.target_name} (${clean_phone(data.chat_jid)})`
        : clean_phone(data.chat_jid);
      parts.push(`${colors.brightGreen}[${target}]${colors.reset}:`);
    }

    const lines = data.text.split("\n").filter((l) => l.trim().length > 0);
    const first_line = lines[0] ?? "";
    if (lines.length > 1) {
      parts.push(
        `${colors.brightGreen}${first_line}${colors.reset} ${colors.gray}(+${lines.length - 1} baris)${colors.reset}`
      );
    } else {
      parts.push(`${colors.brightGreen}${first_line}${colors.reset}`);
    }

    console.log(parts.join(" "));
  },
};

