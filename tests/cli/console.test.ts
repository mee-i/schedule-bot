import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { TerminalCLI, type CLIContext } from "@/cli/console.ts";
import { run_migrations } from "@/db/migrate.ts";

function create_test_db(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  run_migrations(db);
  return db;
}

describe("Terminal CLI", () => {
  it("shows help commands", async () => {
    const db = create_test_db();
    let shutdown_called = false;

    const mock_wa = {
      get_socket: () => null,
      is_connected: () => false,
      logout: async () => {},
    } as unknown as CLIContext["wa_conn"];

    const mock_scheduler = {} as CLIContext["scheduler"];

    const cli = new TerminalCLI({
      wa_conn: mock_wa,
      scheduler: mock_scheduler,
      db,
      shutdown: () => {
        shutdown_called = true;
      },
    });

    const res = await cli.execute_command("help");
    expect(res.output).toContain("DAFTAR COMMAND TERMINAL CLI");
    expect(res.output).toContain("status");
    expect(res.output).toContain("clear-auth");
    expect(res.output).toContain("stats");
    expect(shutdown_called).toBe(false);
  });

  it("reports bot status correctly", async () => {
    const db = create_test_db();
    const mock_wa = {
      get_socket: () => ({
        user: { id: "628111222333@s.whatsapp.net", name: "ScheduleBot" },
      }),
      is_connected: () => true,
      logout: async () => {},
    } as unknown as CLIContext["wa_conn"];

    const cli = new TerminalCLI({
      wa_conn: mock_wa,
      scheduler: {} as CLIContext["scheduler"],
      db,
      shutdown: () => {},
    });

    const res = await cli.execute_command("status");
    expect(res.output).toContain("TERHUBUNG (CONNECTED)");
    expect(res.output).toContain("628111222333@s.whatsapp.net");
    expect(res.output).toContain("ScheduleBot");
  });

  it("fetches database statistics", async () => {
    const db = create_test_db();
    db.exec(`
      INSERT INTO chat_settings (chat_jid, chat_type, timezone, created_at, updated_at) 
      VALUES ('chat1@g.us', 'group', 'Asia/Jakarta', 1000, 1000);
      INSERT INTO events (seq, chat_jid, title, start_at, created_by, created_at, updated_at)
      VALUES (1, 'chat1@g.us', 'Ujian', 5000, 'u1', 1000, 1000);
    `);

    const cli = new TerminalCLI({
      wa_conn: {
        get_socket: () => null,
        is_connected: () => false,
        logout: async () => {},
      } as unknown as CLIContext["wa_conn"],
      scheduler: {} as CLIContext["scheduler"],
      db,
      shutdown: () => {},
    });

    const res = await cli.execute_command("stats");
    expect(res.output).toContain("Total Chat Terdaftar : 1");
    expect(res.output).toContain("Total Event          : 1");
    expect(res.output).toContain("Total Mata Kuliah    : 0");
  });

  it("handles logout and clear-auth", async () => {
    const db = create_test_db();
    let logout_called = false;

    const mock_wa = {
      get_socket: () => null,
      is_connected: () => false,
      logout: async () => {
        logout_called = true;
      },
    } as unknown as CLIContext["wa_conn"];

    const cli = new TerminalCLI({
      wa_conn: mock_wa,
      scheduler: {} as CLIContext["scheduler"],
      db,
      shutdown: () => {},
    });

    const res = await cli.execute_command("clear-auth");
    expect(logout_called).toBe(true);
    expect(res.should_exit).toBe(true);
    expect(res.output).toContain("BERHASIL CLEAR AUTH & LOGOUT");
  });

  it("handles exit command", async () => {
    const db = create_test_db();
    const cli = new TerminalCLI({
      wa_conn: {
        get_socket: () => null,
        is_connected: () => false,
        logout: async () => {},
      } as unknown as CLIContext["wa_conn"],
      scheduler: {} as CLIContext["scheduler"],
      db,
      shutdown: () => {},
    });

    const res = await cli.execute_command("exit");
    expect(res.should_exit).toBe(true);
    expect(res.output).toContain("Menghentikan ScheduleBot secara aman");
  });
});
