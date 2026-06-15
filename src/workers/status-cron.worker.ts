/**
 * Status-cron background worker.
 * Polls every 60 s and runs automatic hackathon status transitions.
 * Follows the same pattern as src/workers/reminder.worker.ts.
 * NOT started in test environment (NODE_ENV === 'test').
 */
import { runStatusTransitions } from '../services/status-transition.service';

const POLL_INTERVAL_MS = 60_000;

async function tick(): Promise<void> {
  try {
    await runStatusTransitions();
  } catch (err) {
    console.error('[status-cron] tick error:', err);
  }
}

export function startStatusCronWorker(): void {
  void tick(); // run immediately on startup to catch any missed transitions
  setInterval(() => void tick(), POLL_INTERVAL_MS);
  console.info('[status-cron] Started — polling every 60 s');
}
