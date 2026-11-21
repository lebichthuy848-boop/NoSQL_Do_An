import { describe, expect, it } from 'vitest';
import { normalizeCoverageRows } from '../features/statistics/StatisticsDashboard';

describe('coverage rows', () => {
  it('derives essential missing counts from covered and total without NaN', () => {
    const rows = normalizeCoverageRows([
      {
        career: 'Data analyst',
        essential: { covered: 7, total: 10, ratio: 0.7 },
        optional: { covered: 1, total: 4, ratio: 0.25 },
      },
      {
        career: 'Over-covered',
        essential: { covered: 11, total: 8, ratio: 1.375 },
      },
      {
        career: 'Malformed',
        essential: { covered: Number.NaN, ratio: Number.NaN },
      },
    ]);

    expect(rows[0].essential.missing).toBe(3);
    expect(rows[1].essential.missing).toBe(0);
    expect(rows[2].essential).toEqual({ covered: 0, total: 0, ratio: 0, missing: 0 });
    for (const row of rows) {
      for (const metric of [row.essential, row.optional]) {
        expect(Number.isFinite(metric.covered)).toBe(true);
        expect(Number.isFinite(metric.total)).toBe(true);
        expect(Number.isFinite(metric.ratio)).toBe(true);
      }
    }
  });
});