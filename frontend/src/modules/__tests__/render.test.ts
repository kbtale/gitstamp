import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RENDER_MJS_TEMPLATE, RENDER_YML_TEMPLATE } from '../templates';
import {
  buildYearCommits,
  determineQuartileThresholds,
  formatDate,
  sanitizeGitIdentity
} from '../../../../templates/render.mjs';

describe('render.mjs safety and scheduling', () => {
  it('keeps frontend templates identical to source template files and avoids execSync', () => {
    const diskMjs = readFileSync(resolve(__dirname, '../../../../templates/render.mjs'), 'utf8');
    const diskYml = readFileSync(resolve(__dirname, '../../../../templates/render.yml'), 'utf8');
    expect(RENDER_MJS_TEMPLATE).toBe(diskMjs);
    expect(RENDER_YML_TEMPLATE).toBe(diskYml);
    expect(diskMjs).not.toContain('execSync');
  });

  it('rejects control characters and angle brackets in git author identities', () => {
    expect(sanitizeGitIdentity('Jane Doe', 'authorName')).toBe('Jane Doe');
    expect(() => sanitizeGitIdentity('Jane\ncommitter evil', 'authorName')).toThrow();
    expect(() => sanitizeGitIdentity('bad<email>@example.com', 'authorEmail')).toThrow();
    expect(() => sanitizeGitIdentity('   ', 'authorName')).toThrow();
  });

  it('computes flattened and unflattened quartile thresholds cleanly', () => {
    const calendar = {
      weeks: [
        {
          contributionDays: [
            { date: '2026-01-01', contributionCount: 2, contributionLevel: 'FIRST_QUARTILE' },
            { date: '2026-01-02', contributionCount: 5, contributionLevel: 'SECOND_QUARTILE' },
            { date: '2026-01-03', contributionCount: 10, contributionLevel: 'THIRD_QUARTILE' },
            { date: '2026-01-04', contributionCount: 20, contributionLevel: 'FOURTH_QUARTILE' }
          ]
        }
      ]
    };

    const flat = determineQuartileThresholds(calendar, true);
    expect(flat.thresholds[2]).toBe(22);
    expect(flat.thresholds[3]).toBe(44);
    expect(flat.thresholds[4]).toBe(66);

    const natural = determineQuartileThresholds(calendar, false);
    expect(natural.thresholds[1]).toBe(2);
    expect(natural.thresholds[2]).toBe(5);
    expect(natural.thresholds[3]).toBe(10);
    expect(natural.thresholds[4]).toBe(20);
  });

  it('schedules centered commits minus existing activity and respects calendar year boundaries', () => {
    const matrix = Array.from({ length: 7 }, (_, r) => [r === 0 ? 4 : 0]);
    const col0Sunday = new Date(Date.UTC(2025, 11, 28));
    const existingMap = new Map<string, number>([['2026-07-05', 3]]);
    const thresholds = { 0: 0, 1: 1, 2: 5, 3: 10, 4: 15 };
    const processedDates = new Set<string>();

    const commits = buildYearCommits({
      year: 2026,
      isRolling: false,
      yearMatrix: matrix,
      col0Sunday,
      totalCols: 53,
      existingMap,
      thresholds,
      processedDates
    });

    expect(commits.length).toBe(1);
    expect(commits[0].dateStr).toBe(formatDate(new Date(Date.UTC(2025, 11, 28 + 26 * 7))));
    expect(commits[0].count).toBe(15);
  });
});
