import { z } from "zod";

const env_schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("production"),
  DATA_DIR: z.string().default("./data"),
  DEFAULT_TIMEZONE: z.string().default("Asia/Jakarta"),
  COMMAND_PREFIX: z.string().default("/"),
  ADMIN_JIDS: z
    .string()
    .default("")
    .transform((val) =>
      val
        ? val
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : []
    ),
  PAIRING_PHONE: z.string().optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  SEND_DELAY_MS: z.coerce.number().default(1500),
  REMINDER_GRACE_MINUTES: z.coerce.number().default(15),
});

export type Env = z.infer<typeof env_schema>;

export function load_env(custom_env?: Record<string, string | undefined>): Env {
  const source = custom_env ?? process.env;
  const parsed = env_schema.safeParse(source);

  if (!parsed.success) {
    const error_messages = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${error_messages}`);
  }

  return parsed.data;
}

export const env = load_env();
