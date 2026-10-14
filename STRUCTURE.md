# Project Structure — wa-reminder-bot

Generated : 2026-10-12
Language  : TypeScript (strict)
Runtime   : Bun 1.4.2
Framework : Baileys (@whiskeysockets/baileys)
Related   : AGENTS.md / PROJECT_SPEC.md

## Directory Tree

wa-reminder-bot/
├─ src/
│  ├─ index.ts                 # Application bootstrap, instance locking, graceful shutdown
│  ├─ config/
│  │  └─ env.ts                # Environment loading and Zod schema validation
│  ├─ wa/                      # WhatsApp Baileys transport layer (isolated)
│  │  ├─ socket.ts             # Baileys socket creation, auth state, reconnect backoff
│  │  ├─ sqlite-auth.ts        # Custom SQLite auth state adapter (prepared stmts, transactions)
│  │  ├─ events.ts             # WhatsApp event listeners (messages.upsert, connection.update)
│  │  ├─ message-utils.ts      # Message payload extraction (text, sender, isGroup, quoted)
│  │  ├─ group-cache.ts        # Group metadata and participants cache with TTL
│  │  └─ sender.ts             # Throttled message queue and mention builder
│  ├─ cli/                     # Interactive terminal CLI console
│  │  └─ console.ts            # REPL console for status, stats, clear-auth, and exit
│  ├─ commands/                # Chat command routing and handlers
│  │  ├─ router.ts             # Command prefix parsing, routing, permission checks
│  │  ├─ types.ts              # CommandContext, CommandHandler interfaces
│  │  ├─ help.ts               # /help and /ping handlers
│  │  ├─ setnotification.ts    # /setnotification handler
│  │  ├─ adminonly.ts          # /adminonly toggle handler (group admin restrictions)
│  │  ├─ testnotif.ts          # /testnotif simulation handler (30s delay)
│  │  ├─ event.ts              # /event CRUD handler
│  │  ├─ matkul.ts             # /matkul CRUD handler
│  │  └─ tugas.ts              # /tugas CRUD handler
│  ├─ parsing/                 # Input parsing utilities
│  │  ├─ args.ts               # Pipe tokenizer and key=value flag parser
│  │  ├─ datetime.ts           # Natural Indonesian & ISO date parsing using Luxon
│  │  └─ offsets.ts            # Reminder offset parser (e.g. 1d,3h,30m -> minutes)
│  ├─ services/                # Business logic services (no Baileys dependency)
│  │  ├─ chat.service.ts       # Chat settings management
│  │  ├─ event.service.ts      # Event CRUD logic & reminder log synchronization
│  │  ├─ course.service.ts     # Course schedule logic
│  │  ├─ task.service.ts       # Task management & deadline tracking
│  │  └─ permission.service.ts # Admin and ownership authorization
│  ├─ reminders/               # Reminder calculation and scheduling
│  │  ├─ engine.ts             # Due reminder trigger evaluation with grace period
│  │  ├─ occurrences.ts        # Event/task/course occurrence expansion
│  │  ├─ scheduler.ts          # 60-second polling loop
│  │  └─ format.ts             # Reminder message text composer
│  ├─ db/                      # Database persistence layer (bun:sqlite)
│  │  ├─ client.ts             # SQLite database factory with WAL and foreign keys
│  │  ├─ migrate.ts            # SQL migration runner
│  │  ├─ migrations/           # Versioned migration scripts
│  │  │  ├─ 001_init.sql       # Initial database schema
│  │  │  ├─ 002_whatsapp_auth.sql # SQLite WhatsApp session auth table
│  │  │  ├─ 003_admin_only.sql # Admin-only group mode setting
│  │  │  └─ 004_separate_notifications.sql # Separate toggles & offsets for course, task, event
│  │  └─ repositories/         # Domain repositories with prepared statements
│  │     ├─ chat.repo.ts       # chat_settings repository
│  │     ├─ event.repo.ts      # events repository with per-chat seq
│  │     ├─ course.repo.ts     # courses repository with per-chat seq
│  │     ├─ task.repo.ts       # tasks repository with per-chat seq
│  │     └─ reminder-log.repo.ts # reminder_log repository for idempotency
│  ├─ lib/                     # Shared cross-cutting utilities
│  │  ├─ clock.ts              # Clock interface, SystemClock, and FakeClock
│  │  ├─ logger.ts             # Structured logging using Pino
│  │  └─ errors.ts             # UserError domain exception class
│  └─ formatters/              # User-facing list and message presentation
│     └─ lists.ts              # Table/list formatting for WhatsApp chats
├─ tests/                      # Mirror of src/ for unit and integration tests
├─ data/                       # Gitignored local storage (SQLite DB, auth files)
├─ docs/
│  └─ DECISIONS.md             # Architecture decisions record
├─ .env.example                # Template configuration
├─ bun.lock                    # Bun lockfile
├─ ecosystem.config.cjs        # PM2 process configuration (fork mode, Bun runtime)
├─ package.json                # Project manifest and scripts
├─ tsconfig.json               # Strict TypeScript configuration
├─ AGENTS.md                   # Engineering contract and protocols
└─ PROJECT_SPEC.md             # Functional and architectural specification

## Module Responsibilities

### src/wa/
Owns all WhatsApp Baileys transport interactions. Exclusively manages sockets, auth states, event subscription, participant caches, and rate-limited sending. Does not contain business logic or database queries.

### src/commands/
Owns command message routing, argument distribution, and response dispatching. Handlers are thin coordinators between incoming command contexts and domain services.

### src/services/
Owns application business rules, domain operations, validation, authorization, and reminder log cleanup. Decoupled from transport.

### src/db/
Owns database connectivity, schema migrations, and relational persistence. Repositories encapsulate all SQL queries using prepared statements and atomic transactions.

### src/reminders/
Owns occurrence generation, due-date offset math, grace-period evaluation, and idempotent notification scheduling.

## Data Flow
Inbound: Baileys Socket -> messages.upsert -> message-utils -> Command Router -> Command Handler -> Domain Service -> Database Repository -> SQLite.
Outbound Response: Domain Service -> Handler -> Command Router -> Rate-limited Sender -> Baileys Socket.
Reminder Loop: Scheduler (1 min tick) -> ReminderEngine -> Repositories -> Sender -> Baileys Socket -> reminder_log write.

## Key Conventions
- Runtime: Bun. Always use `bun` commands. Commit `bun.lock`.
- Strict TypeScript: No `any` type erasure. Use `import type` for type-only imports.
- Clock Abstraction: Inject `Clock` into all time-sensitive services; never call `Date.now()` directly in business logic.
- Atomic Per-Chat Seq: Items (events, courses, tasks) use consecutive `seq` per `chat_jid`, resolved within database transactions.
- Idempotent Reminders: Every sent notification is recorded in `reminder_log` with unique constraint on `(source_type, source_id, occurrence_at, offset_minutes)`.

## External Dependencies
| Package | Version | Purpose |
|---|---|---|
| @whiskeysockets/baileys | 7.0.0-rc14 | Multi-device WhatsApp protocol client |
| luxon | ^3.5.0 | Date and time manipulation with timezone support |
| pino | ^9.6.0 | Fast structured logger |
| qrcode-terminal | ^0.12.0 | Terminal QR code rendering for WhatsApp login |
| zod | ^3.24.2 | Schema validation for environment and parser outputs |
| typescript | ^5.7.3 | TypeScript compiler for static type checking |
| @types/bun | latest | Bun runtime type definitions |

## Environment Variables
| Variable | Required | Description |
|---|---|---|
| NODE_ENV | No | Environment mode: development, production, test (default: production) |
| DATA_DIR | No | Directory for SQLite DB and Baileys auth files (default: ./data) |
| DEFAULT_TIMEZONE | No | Default timezone identifier (default: Asia/Jakarta) |
| COMMAND_PREFIX | No | Command prefix character (default: /) |
| ADMIN_JIDS | No | Comma-separated list of WhatsApp JIDs with bot superadmin privileges |
| PAIRING_PHONE | No | Optional phone number for pairing code authentication |
| LOG_LEVEL | No | Pino logging severity level (default: info) |
| SEND_DELAY_MS | No | Anti-ban throttle delay between outbound messages (default: 1500) |
| REMINDER_GRACE_MINUTES | No | Maximum lateness window in minutes for overdue reminders (default: 15) |
