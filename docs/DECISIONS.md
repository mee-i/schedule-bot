# Architecture Decision Records (ADR)

## ADR-001: Runtime and SQLite Engine
- **Decision**: Use Bun 1.4+ as runtime, package manager, and test runner. Use `bun:sqlite` with WAL mode and `PRAGMA foreign_keys = ON;`.
- **Context**: Avoid external Node.js dependencies (`better-sqlite3`, `dotenv`, `jest`). `bun:sqlite` provides high performance synchronous SQLite access natively compiled into Bun.
- **Consequences**: Fast startup, zero compilation step, low footprint.

## ADR-002: Clock Abstraction
- **Decision**: Define `Clock` interface in `src/lib/clock.ts` and inject it into all domain services and the reminder engine.
- **Context**: Enables pure deterministic unit tests without mutating global `Date` or `setTimeout` mechanisms.
- **Consequences**: Time travel and edge-case testing (e.g. grace periods, recurrence rollouts) can be performed reliably with `FakeClock`.

## ADR-003: WhatsApp Baileys Layer Isolation
- **Decision**: Confine all imports of `@whiskeysockets/baileys` strictly within `src/wa/`.
- **Context**: Keep domain services, handlers, and repositories transport-agnostic.
- **Consequences**: Handlers operate purely on clean message context types; Baileys API changes only affect files inside `src/wa/`.

## ADR-004: Baileys Group Participant LID Handling
- **Decision**: In group caching and message sending, handle both `@s.whatsapp.net` (phone JID) and `@lid` (LID identity). When generating hidden/visible mentions, filter out the bot's own JID/LID and target valid participant JIDs.
- **Context**: Recent WhatsApp updates use LID identities in groups.
- **Consequences**: Ensures `@semua` mentions reach all participants regardless of whether the group uses LID or standard phone numbers.

## ADR-005: SQLite WhatsApp Auth State & Anti-Spam Decrypt Mitigation
- **Decision**: Replace `useMultiFileAuthState` with a custom `useSQLiteAuthState` storing session credentials in the `whatsapp_auth` table in `bot.sqlite`. Disable full history sync (`syncFullHistory: false`, `shouldSyncHistoryMessage: () => false`), implement `getMessage`, and proxy Baileys logger errors to filter decrypt errors.
- **Context**: Multi-file auth creates hundreds of separate `.json` files causing high filesystem I/O, file locking risks, and cluttered directories. When bots connect or reconnect, WhatsApp default history sync floods logs with `failed to decrypt message` for historical messages.
- **Consequences**: Blazing-fast in-process queries (<0.05 ms) via `bun:sqlite` prepared statements, atomic transactions for batch Signal keys, seamless one-time auto-migration from legacy `data/auth/`, and completely clean terminal logs without decrypt spam.
