// Reports the check-in page state and stored data after a flight.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate(() => ({
    phase: window.seat14c.phase,
    checkinVisible: !document.getElementById('checkin').hidden,
    stats: document.getElementById('stats').textContent,
    titles: [...document.querySelectorAll('.task-title')].map((i) => i.value),
    progress: JSON.parse(localStorage.getItem('seat14c.progress.v1')),
    tasks: JSON.parse(localStorage.getItem('seat14c.tasks.v1')).map((t) => `${t.title}:${t.status}`),
  })));
}
