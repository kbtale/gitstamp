import { describe, expect, it } from 'vitest';
import { STARTER_PRESETS } from '../starter-presets';

describe('STARTER_PRESETS', () => {
  it('provides valid 7-row matrices within 1 to 53 columns', () => {
    expect(STARTER_PRESETS.length).toBeGreaterThanOrEqual(8);
    for (const preset of STARTER_PRESETS) {
      expect(preset.matrix).toHaveLength(7);
      const width = preset.matrix[0].length;
      expect(width).toBeGreaterThanOrEqual(1);
      expect(width).toBeLessThanOrEqual(53);
      for (const row of preset.matrix) {
        expect(row).toHaveLength(width);
        expect(row.every((v) => v >= 0 && v <= 4)).toBe(true);
      }
      expect(preset.matrix.flat().some((v) => v > 0)).toBe(true);
    }
  });
});
