import readline from "node:readline";
import type { Database } from "bun:sqlite";
import type { WhatsAppConnection } from "@/wa/socket.ts";
import type { ReminderScheduler } from "@/reminders/scheduler.ts";
import { env } from "@/config/env.ts";

export interface CLIContext {
  wa_conn: WhatsAppConnection;
  scheduler: ReminderScheduler;
  db: Database;
  shutdown: (signal: string) => void;
}

export interface CLICommandResult {
  output: string;
  should_exit?: boolean;
}

export class TerminalCLI {
  private rl: readline.Interface | null = null;
  private readonly start_time = Date.now();

  constructor(private readonly ctx: CLIContext) {}

  format_uptime(): string {
    const total_seconds = Math.floor((Date.now() - this.start_time) / 1000);
    const hours = Math.floor(total_seconds / 3600);
    const minutes = Math.floor((total_seconds % 3600) / 60);
    const seconds = total_seconds % 60;
    return `${hours}j ${minutes}m ${seconds}s`;
  }

  async execute_command(input: string): Promise<CLICommandResult> {
    const raw = input.trim();
    if (!raw) {
      return { output: "" };
    }

    const command = raw.toLowerCase().replace(/^\//, "");

    switch (command) {
      case "help":
      case "?": {
        const lines = [
          "-------------------------------------------------------------",
          " DAFTAR COMMAND TERMINAL CLI (SCHEDULEBOT)",
          "-------------------------------------------------------------",
          " status          : Cek status koneksi WA, nomor, dan scheduler",
          " stats           : Statistik total chat, event, matkul, dan tugas",
          " clear-auth      : Logout & hapus session login WhatsApp (clear auth)",
          " logout          : Alias dari clear-auth",
          " clear / cls     : Bersihkan layar terminal",
          " exit / quit     : Hentikan bot secara aman (graceful shutdown)",
          " help / ?        : Tampilkan bantuan ini",
          "-------------------------------------------------------------",
        ];
        return { output: lines.join("\n") };
      }

      case "status": {
        const sock = this.ctx.wa_conn.get_socket();
        const is_conn = this.ctx.wa_conn.is_connected() && Boolean(sock);
        const bot_jid = sock?.user?.id ?? "Belum terhubung";
        const bot_name = sock?.user?.name ?? "~";

        const lines = [
          "-------------------------------------------------------------",
          " STATUS BOT & KONEKSI WHATSAPP",
          "-------------------------------------------------------------",
          ` Status WA    : ${is_conn ? "✅ TERHUBUNG (CONNECTED)" : "❌ TERPUTUS (DISCONNECTED)"}`,
          ` Bot JID      : ${bot_jid}`,
          ` Nama Bot     : ${bot_name}`,
          ` Scheduler    : Aktif (Interval 60 detik)`,
          ` Uptime       : ${this.format_uptime()}`,
          ` Timezone     : ${env.DEFAULT_TIMEZONE}`,
          ` Node Env     : ${env.NODE_ENV}`,
          "-------------------------------------------------------------",
        ];
        return { output: lines.join("\n") };
      }

      case "stats": {
        try {
          const chats_row = this.ctx.db
            .query("SELECT COUNT(*) as count FROM chat_settings")
            .get() as { count: number };
          const events_row = this.ctx.db
            .query("SELECT COUNT(*) as count FROM events")
            .get() as { count: number };
          const courses_row = this.ctx.db
            .query("SELECT COUNT(*) as count FROM courses")
            .get() as { count: number };
          const tasks_row = this.ctx.db
            .query("SELECT COUNT(*) as count FROM tasks WHERE status = 'open'")
            .get() as { count: number };

          const lines = [
            "-------------------------------------------------------------",
            " STATISTIK DATABASE BOT",
            "-------------------------------------------------------------",
            ` Total Chat Terdaftar : ${chats_row.count}`,
            ` Total Event          : ${events_row.count}`,
            ` Total Mata Kuliah    : ${courses_row.count}`,
            ` Total Tugas Terbuka  : ${tasks_row.count}`,
            "-------------------------------------------------------------",
          ];
          return { output: lines.join("\n") };
        } catch (err) {
          return {
            output: `[CLI Error] Gagal mengambil statistik: ${String(err)}`,
          };
        }
      }

      case "logout":
      case "clear-auth": {
        await this.ctx.wa_conn.logout();
        const lines = [
          "-------------------------------------------------------------",
          " ✅ BERHASIL CLEAR AUTH & LOGOUT",
          "-------------------------------------------------------------",
          " Sesi WhatsApp telah diputus dan kredensial database telah dibersihkan.",
          " Bot akan dimatikan agar Anda dapat melakukan login ulang.",
          "-------------------------------------------------------------",
        ];
        setTimeout(() => this.ctx.shutdown("CLI_LOGOUT"), 1000);
        return { output: lines.join("\n"), should_exit: true };
      }

      case "clear":
      case "cls": {
        console.clear();
        return { output: "" };
      }

      case "exit":
      case "quit":
      case "stop": {
        const lines = [
          "-------------------------------------------------------------",
          " Menghentikan ScheduleBot secara aman...",
          "-------------------------------------------------------------",
        ];
        setTimeout(() => this.ctx.shutdown("CLI_EXIT"), 500);
        return { output: lines.join("\n"), should_exit: true };
      }

      default: {
        return {
          output: `Command tidak dikenal: '${raw}'. Ketik 'help' untuk daftar command.`,
        };
      }
    }
  }

  start(): void {
    if (!process.stdin.isTTY) {
      return;
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "schedulebot> ",
    });

    console.log("\n-------------------------------------------------------------");
    console.log(" ScheduleBot Interactive Terminal CLI Aktif");
    console.log(" Ketik 'help' untuk melihat daftar command terminal");
    console.log("-------------------------------------------------------------\n");

    this.rl.prompt();

    this.rl.on("line", async (line) => {
      const result = await this.execute_command(line);
      if (result.output) {
        console.log(result.output);
      }
      if (!result.should_exit && this.rl) {
        this.rl.prompt();
      }
    });

    this.rl.on("close", () => {
      // Input stream closed
    });
  }

  stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
