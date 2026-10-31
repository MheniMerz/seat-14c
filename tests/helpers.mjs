// Shared helpers for scripted runs against the managed browser.

export const SAMPLE_TASKS = [
  { id: 't-1', title: 'Write Devpost description', status: 'open',
    subtasks: [{ title: 'Inspiration', done: false }, { title: 'How it was built', done: false }, { title: 'What is next', done: false }] },
  { id: 't-2', title: 'Review flight dial design', status: 'open', subtasks: [] },
  { id: 't-3', title: 'Reply to playtest volunteers', status: 'open',
    subtasks: [{ title: 'Pick three dates', done: false }] },
];

export function reporter() {
  const results = [];
  const check = (name, pass, detail = '') =>
    results.push(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  return { check, report: () => results.join('\n') };
}

/** Seed storage, reload, and board so the test starts in XR. */
export async function boardWithSampleTasks(page, frame, progress) {
  await frame.evaluate(
    ([tasks, progress]) => {
      localStorage.setItem('seat14c.tasks.v1', JSON.stringify(tasks));
      // Default: a user who has done the boarding tutorial but flown nothing.
      const seeded = progress ?? {
        version: 1, totalMiles: 0, streakDays: 0, lastFlightDate: '',
        postcards: [], themes: [], boardingDone: true, settings: {},
      };
      if (progress === 'first-launch') localStorage.removeItem('seat14c.progress.v1');
      else localStorage.setItem('seat14c.progress.v1', JSON.stringify(seeded));
    },
    [SAMPLE_TASKS, progress ?? null],
  );
  await frame.evaluate(() => location.reload());
  await page.waitForTimeout(500);
  const app = await findAppFrame(page);
  await app.getByRole('button', { name: 'Board' }).click({ timeout: 15000 });
  await app.waitForFunction(() => window.seat14c.phase !== 'checkin', null, { timeout: 10000 });
  return app;
}

export async function findAppFrame(page) {
  for (let i = 0; i < 120; i++) {
    for (const frame of page.frames()) {
      try {
        if (await frame.evaluate(() => window.seat14c != null)) return frame;
      } catch {}
    }
    await page.waitForTimeout(250);
  }
  throw new Error('app frame with window.seat14c not found');
}

export const near = (a, b, tol = 0.01) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
