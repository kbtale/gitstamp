import { describe, expect, it } from 'vitest';
import { calculateOtsu, computeLuminanceHistogram } from '../otsu';

describe('otsu thresholding', () => {
  it('skips transparent pixels in luminance histogram', () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 0,
      255, 255, 255, 255
    ]);
    const hist = computeLuminanceHistogram(rgba);
    expect(hist[0]).toBe(1);
    expect(hist[255]).toBe(1);
    expect(hist.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('finds clean separation for bimodal distributions', () => {
    const hist = new Array<number>(256).fill(0);
    hist[20] = 500;
    hist[230] = 500;
    const res = calculateOtsu(hist);
    expect(res.threshold).toBeGreaterThanOrEqual(20);
    expect(res.threshold).toBeLessThan(230);
    expect(res.isBimodal).toBe(true);
    expect(res.separability).toBeGreaterThan(0.95);
  });

  it('returns neutral fallback for empty histogram', () => {
    const hist = new Array<number>(256).fill(0);
    const res = calculateOtsu(hist);
    expect(res.threshold).toBe(128);
    expect(res.isBimodal).toBe(false);
    expect(res.separability).toBe(0);
  });
});
