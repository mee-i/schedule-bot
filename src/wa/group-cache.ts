import type { GroupMetadata, WASocket } from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger.ts";

interface CacheEntry {
  metadata: GroupMetadata;
  expires_at: number;
}

export class GroupCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttl_ms: number;

  constructor(ttl_minutes: number = 10) {
    this.ttl_ms = ttl_minutes * 60 * 1000;
  }

  async get_group_metadata(
    sock: WASocket,
    group_jid: string,
    force_refresh: boolean = false
  ): Promise<GroupMetadata | null> {
    const now = Date.now();
    const existing = this.cache.get(group_jid);

    if (!force_refresh && existing && existing.expires_at > now) {
      return existing.metadata;
    }

    try {
      const metadata = await sock.groupMetadata(group_jid);
      this.cache.set(group_jid, {
        metadata,
        expires_at: now + this.ttl_ms,
      });
      return metadata;
    } catch (error) {
      logger.error({
        event: "group_metadata_fetch_failed",
        group_jid,
        error: error instanceof Error ? error.message : String(error),
      });
      return existing?.metadata ?? null;
    }
  }

  invalidate(group_jid: string): void {
    this.cache.delete(group_jid);
  }

  get_cached(group_jid: string): GroupMetadata | null {
    const entry = this.cache.get(group_jid);
    if (!entry || entry.expires_at <= Date.now()) {
      return null;
    }
    return entry.metadata;
  }
}

export const group_cache = new GroupCache(10);
