// Durable run status per story (ADR 0002): whether a run was in flight or failed, so a
// restarted server can resume or offer "Try again". Story content stays in the checkpoints.
// Shares the checkpoint SQLite database; progress messages stay in memory.

import type { Database } from "better-sqlite3";
import { z } from "zod";

export const RunRecord = z.object({
  state: z.enum(["running", "failed"]),
  /** Short diagnostic for logs; the child sees a friendly message instead. */
  error: z.string().nullable(),
  /** Automatic resumes since the child last acted, so a crashing story can't loop. */
  resumes: z.number().int(),
});
export type RunRecord = z.infer<typeof RunRecord>;

export interface RunStore {
  get(storyId: string): RunRecord | undefined;
  /** `automatic` resumes count towards the limit; a child's action resets it. */
  markRunning(storyId: string, options: { readonly automatic: boolean }): void;
  markFailed(storyId: string, error: string): void;
  /** The run paused for the child or finished. */
  clear(storyId: string): void;
  running(): string[];
}

const Row = z.object({ state: z.string(), error: z.string().nullable(), resumes: z.number() });
const IdRow = z.object({ story_id: z.string() });

export class SqliteRunStore implements RunStore {
  constructor(private readonly db: Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS story_runs (
      story_id   TEXT PRIMARY KEY,
      state      TEXT NOT NULL,
      error      TEXT,
      resumes    INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);
  }

  get(storyId: string): RunRecord | undefined {
    const row: unknown = this.db.prepare("SELECT state, error, resumes FROM story_runs WHERE story_id = ?").get(storyId);
    return row === undefined ? undefined : RunRecord.parse(Row.parse(row));
  }

  markRunning(storyId: string, options: { readonly automatic: boolean }): void {
    this.db
      .prepare(
        `INSERT INTO story_runs (story_id, state, error, resumes, updated_at) VALUES (?, 'running', NULL, ?, ?)
         ON CONFLICT(story_id) DO UPDATE SET state = 'running', error = NULL, updated_at = excluded.updated_at,
           resumes = CASE WHEN ? THEN story_runs.resumes + 1 ELSE 0 END`,
      )
      .run(storyId, options.automatic ? 1 : 0, now(), options.automatic ? 1 : 0);
  }

  markFailed(storyId: string, error: string): void {
    this.db
      .prepare(
        `INSERT INTO story_runs (story_id, state, error, resumes, updated_at) VALUES (?, 'failed', ?, 0, ?)
         ON CONFLICT(story_id) DO UPDATE SET state = 'failed', error = excluded.error, updated_at = excluded.updated_at`,
      )
      .run(storyId, error.slice(0, 500), now());
  }

  clear(storyId: string): void {
    this.db.prepare("DELETE FROM story_runs WHERE story_id = ?").run(storyId);
  }

  running(): string[] {
    const rows: unknown[] = this.db.prepare("SELECT story_id FROM story_runs WHERE state = 'running'").all();
    return rows.map((row) => IdRow.parse(row).story_id);
  }
}

function now(): string {
  return new Date().toISOString();
}
