import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { create_database } from "@/db/client.ts";
import { useSQLiteAuthState } from "@/wa/sqlite-auth.ts";

describe("SQLite Auth State Adapter", () => {
  it("initializes credentials and persists to whatsapp_auth table", async () => {
    const db = create_database(":memory:");
    const auth = await useSQLiteAuthState(db, { sessionId: "test_session" });

    expect(auth.state.creds).toBeDefined();
    expect(auth.state.creds.noiseKey).toBeDefined();

    const row = db
      .query<{ value: string }, [string, string]>(
        "SELECT value FROM whatsapp_auth WHERE session = ? AND id = ?"
      )
      .get("test_session", "creds");

    expect(row).not.toBeNull();
    expect(row?.value).toContain("noiseKey");
  });

  it("reloads existing credentials on subsequent invocations", async () => {
    const db = create_database(":memory:");
    const auth1 = await useSQLiteAuthState(db, { sessionId: "test_session" });

    // Mutate a field and save
    auth1.state.creds.me = { id: "628123456789:0@s.whatsapp.net", name: "Bot" };
    await auth1.saveCreds();

    // Re-initialize from same database
    const auth2 = await useSQLiteAuthState(db, { sessionId: "test_session" });
    expect(auth2.state.creds.me?.id).toBe("628123456789:0@s.whatsapp.net");
    expect(auth2.state.creds.me?.name).toBe("Bot");
  });

  it("sets and gets signal keys correctly", async () => {
    const db = create_database(":memory:");
    const auth = await useSQLiteAuthState(db, { sessionId: "test_session" });

    // Set sample pre-keys
    await auth.state.keys.set({
      "pre-key": {
        "1": { keyPair: { public: Buffer.from("pub1"), private: Buffer.from("priv1") } } as any,
        "2": { keyPair: { public: Buffer.from("pub2"), private: Buffer.from("priv2") } } as any,
      },
    });

    // Get pre-keys
    const retrieved = await auth.state.keys.get("pre-key", ["1", "2", "3"]);
    expect(retrieved["1"]).toBeDefined();
    expect(retrieved["2"]).toBeDefined();
    expect(retrieved["3"]).toBeUndefined();

    // Verify buffer roundtrip
    const pk1 = retrieved["1"] as any;
    expect(Buffer.isBuffer(pk1.keyPair.public)).toBe(true);
    expect(pk1.keyPair.public.toString()).toBe("pub1");

    // Remove key by setting to null
    await auth.state.keys.set({
      "pre-key": {
        "1": null,
      },
    });

    const after_delete = await auth.state.keys.get("pre-key", ["1"]);
    expect(after_delete["1"]).toBeUndefined();
  });

  it("clears auth state completely on clearState", async () => {
    const db = create_database(":memory:");
    const auth = await useSQLiteAuthState(db, { sessionId: "test_session" });

    await auth.state.keys.set({
      "pre-key": {
        "1": { dummy: "data" } as any,
      },
    });

    const count_before = db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) as count FROM whatsapp_auth WHERE session = ?"
      )
      .get("test_session")?.count;

    expect(count_before).toBeGreaterThan(0);

    await auth.clearState();

    const count_after = db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) as count FROM whatsapp_auth WHERE session = ?"
      )
      .get("test_session")?.count;

    expect(count_after).toBe(0);
  });

  it("auto-migrates legacy json files if database table is empty", async () => {
    const tmp_dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa_auth_test_"));

    try {
      // Mock dummy creds and keys
      fs.writeFileSync(
        path.join(tmp_dir, "creds.json"),
        JSON.stringify({ dummyCreds: true, me: { id: "test@s.whatsapp.net" } })
      );
      fs.writeFileSync(
        path.join(tmp_dir, "pre-key-99.json"),
        JSON.stringify({ testPreKey: 99 })
      );

      const db = create_database(":memory:");
      const auth = await useSQLiteAuthState(db, {
        sessionId: "migrated_session",
        legacyAuthDir: tmp_dir,
      });

      expect(auth.state.creds.me?.id).toBe("test@s.whatsapp.net");

      const pk99 = await auth.state.keys.get("pre-key", ["99"]);
      expect((pk99["99"] as any)?.testPreKey).toBe(99);
    } finally {
      fs.rmSync(tmp_dir, { recursive: true, force: true });
    }
  });
});
