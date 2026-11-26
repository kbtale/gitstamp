import { describe, expect, it } from 'vitest';
import { parseArtMatrix, serializeArtMatrix } from '../art-io';
import { ContributionLevel } from '../../types';

describe('art-io serialization', () => {
  it('roundtrips exported art JSON cleanly', () => {
    const matrix: ContributionLevel[][] = Array.from({ length: 7 }, (_, r) => [
      (r % 5) as ContributionLevel,
      4
    ]);
    const serialized = serializeArtMatrix(matrix, 'Demo Art');
    const parsed = parseArtMatrix(serialized);
    expect(parsed.name).toBe('Demo Art');
    expect(parsed.matrix).toEqual(matrix);
  });

  it('rejects invalid row counts, widths, and cell values', () => {
    expect(() => parseArtMatrix(JSON.stringify({ matrix: [[1]] }))).toThrow();
    expect(() => parseArtMatrix(JSON.stringify({ matrix: Array.from({ length: 7 }, () => []) }))).toThrow();
    expect(() => parseArtMatrix(JSON.stringify({ matrix: Array.from({ length: 7 }, () => [9]) }))).toThrow();
  });
});
