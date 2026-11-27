import { describe, expect, it } from 'vitest';
import { renderTextToMatrix } from '../pixel-text';

describe('renderTextToMatrix', () => {
  it('renders uppercase text into a 7-row contribution matrix', () => {
    const matrix = renderTextToMatrix('hi', { shade: 3, spacing: 1 });
    expect(matrix).toHaveLength(7);
    expect(matrix[0].length).toBe(5 + 1 + 3);
    expect(matrix.flat().some((v) => v === 3)).toBe(true);
    expect(matrix.flat().every((v) => v === 0 || v === 3)).toBe(true);
  });

  it('clamps long strings to maxWidth', () => {
    const matrix = renderTextToMatrix('THE QUICK BROWN FOX JUMPS OVER', { maxWidth: 53 });
    expect(matrix).toHaveLength(7);
    expect(matrix[0].length).toBe(53);
  });

  it('returns an empty single-column matrix for blank input', () => {
    const matrix = renderTextToMatrix('   ');
    expect(matrix).toHaveLength(7);
    expect(matrix[0]).toEqual([0]);
  });
});
