import { DurableObject } from "cloudflare:workers";
import { claimDueJobs, runClaimedJob } from "./jobs";
import type { Env } from "./types";

const BATCH = 10;

/**
 * Singleton timer for the D1-backed job queue (free-tier, SQLite-backed DO).
 * `wake()` arms the alarm for the next due job; `alarm()` drains a batch and
 * re-arms. All job execution flows through here, so the cron backstop only
 * needs to call wake() — no duplicated executor path, no double-send.
 */
export class Scheduler extends DurableObject<Env> {
  async wake(): Promise<void> {
    await this.scheduleNext();
  }

  async alarm(): Promise<void> {
    const jobs = await claimDueJobs(this.env, BATCH);
    for (const job of jobs) {
      await runClaimedJob(this.env, job);
    }
    await this.scheduleNext();
  }

  private async scheduleNext(): Promise<void> {
    const row = await this.env.DB.prepare(
      "SELECT CAST(MIN(strftime('%s', run_at)) AS INTEGER) AS next_s FROM jobs WHERE status = 'pending'",
    ).first<{ next_s: number | null }>();
    if (!row || row.next_s == null) return; // nothing pending → let any old alarm lapse
    const targetMs = row.next_s * 1000;
    await this.ctx.storage.setAlarm(Math.max(targetMs, Date.now()));
  }
}
