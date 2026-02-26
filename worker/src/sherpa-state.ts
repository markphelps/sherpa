import { DurableObject } from "cloudflare:workers";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PENDING_TTL_MS = 2 * 60 * 1000; // 2 minutes — stale lock protection
const MAX_TEXT_BYTES = 512 * 1024; // 512KB max explanation size

const EntryStatus = {
  PENDING: "pending",
  READY: "ready",
} as const;

interface ExplanationRow {
  text: string | null;
  status: string;
  created_at: number;
}

function parseRow(raw: unknown): ExplanationRow {
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== "string" || typeof r.created_at !== "number") {
    throw new Error("Invalid row shape from SQL query");
  }
  return {
    text: r.text == null ? null : String(r.text),
    status: r.status,
    created_at: r.created_at,
  };
}

export class SherpaState extends DurableObject {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS explanations (
        key TEXT PRIMARY KEY,
        text TEXT,
        status TEXT NOT NULL DEFAULT 'ready',
        created_at INTEGER NOT NULL
      )
    `);
    // Schedule self-destruct alarm on first creation
    this.resetAlarm();
  }

  private async resetAlarm(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (!existing) {
      await this.ctx.storage.setAlarm(Date.now() + MAX_AGE_MS);
    }
  }

  async alarm(): Promise<void> {
    // Delete all storage — the DO will be garbage collected
    await this.ctx.storage.deleteAll();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key) return new Response("Missing key", { status: 400 });

    if (request.method === "GET") {
      const rows = this.sql
        .exec(
          "SELECT text, status, created_at FROM explanations WHERE key = ?",
          key,
        )
        .toArray();
      if (rows.length === 0) return new Response(null, { status: 404 });
      const row = parseRow(rows[0]);

      // Clean up expired ready entries
      if (
        row.status === EntryStatus.READY &&
        Date.now() - row.created_at > MAX_AGE_MS
      ) {
        this.sql.exec("DELETE FROM explanations WHERE key = ?", key);
        return new Response(null, { status: 404 });
      }

      // Pending — check for stale lock
      if (row.status === EntryStatus.PENDING) {
        if (Date.now() - row.created_at > PENDING_TTL_MS) {
          this.sql.exec("DELETE FROM explanations WHERE key = ?", key);
          return new Response(null, { status: 404 });
        }
        return Response.json({ status: EntryStatus.PENDING }, { status: 202 });
      }

      return Response.json({ text: row.text });
    }

    // POST = acquire generation lock
    if (request.method === "POST") {
      const rows = this.sql
        .exec(
          "SELECT text, status, created_at FROM explanations WHERE key = ?",
          key,
        )
        .toArray();

      if (rows.length > 0) {
        const row = parseRow(rows[0]);
        // Already have a completed result
        if (row.status === EntryStatus.READY && row.text) {
          return Response.json({ text: row.text }, { status: 200 });
        }
        // Someone else is generating and lock is still fresh
        if (
          row.status === EntryStatus.PENDING &&
          Date.now() - row.created_at < PENDING_TTL_MS
        ) {
          return Response.json(
            { status: EntryStatus.PENDING },
            { status: 409 },
          );
        }
        // Stale lock — allow re-acquisition
      }

      this.sql.exec(
        "INSERT OR REPLACE INTO explanations (key, text, status, created_at) VALUES (?, NULL, 'pending', ?)",
        key,
        Date.now(),
      );
      await this.ctx.storage.setAlarm(Date.now() + MAX_AGE_MS);
      return new Response(null, { status: 201 });
    }

    if (request.method === "PUT") {
      const body = (await request.json()) as { text: string };
      if (!body.text) return new Response("Missing text", { status: 400 });
      if (new TextEncoder().encode(body.text).length > MAX_TEXT_BYTES) {
        return new Response("Payload too large", { status: 413 });
      }
      this.sql.exec(
        "INSERT OR REPLACE INTO explanations (key, text, status, created_at) VALUES (?, ?, 'ready', ?)",
        key,
        body.text,
        Date.now(),
      );
      await this.ctx.storage.setAlarm(Date.now() + MAX_AGE_MS);
      return new Response(null, { status: 201 });
    }

    return new Response("Method not allowed", { status: 405 });
  }
}
