import { describe, expect, it } from "bun:test";
import { load_env } from "@/config/env.ts";

describe("Environment configuration", () => {
  it("loads defaults when env is empty", () => {
    const loaded = load_env({});
    expect(loaded.NODE_ENV).toBe("production");
    expect(loaded.DATA_DIR).toBe("./data");
    expect(loaded.DEFAULT_TIMEZONE).toBe("Asia/Jakarta");
    expect(loaded.COMMAND_PREFIX).toBe("/");
    expect(loaded.ADMIN_JIDS).toEqual([]);
    expect(loaded.LOG_LEVEL).toBe("info");
    expect(loaded.SEND_DELAY_MS).toBe(1500);
    expect(loaded.REMINDER_GRACE_MINUTES).toBe(15);
  });

  it("parses ADMIN_JIDS comma separated list", () => {
    const loaded = load_env({
      ADMIN_JIDS: "628111@s.whatsapp.net, 628222@s.whatsapp.net , ",
    });
    expect(loaded.ADMIN_JIDS).toEqual([
      "628111@s.whatsapp.net",
      "628222@s.whatsapp.net",
    ]);
  });
});
