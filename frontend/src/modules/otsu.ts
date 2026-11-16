export interface OtsuResult {
  threshold: number;
  separability: number;
  isBimodal: boolean;
  histogram: number[];
}

export function computeLuminanceHistogram(rgbaData: Uint8ClampedArray): number[] {
  const histogram = new Array<number>(256).fill(0);
  const totalPixels = rgbaData.length / 4;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const r = rgbaData[offset];
    const g = rgbaData[offset + 1];
    const b = rgbaData[offset + 2];
    const a = rgbaData[offset + 3];

    if (a < 128) {
      continue;
    }

    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    histogram[lum]++;
  }

  return histogram;
}

export function calculateOtsu(histogram: number[]): OtsuResult {
  let totalPixels = 0;
  let totalSum = 0;

  for (let i = 0; i < 256; i++) {
    totalPixels += histogram[i];
    totalSum += i * histogram[i];
  }

  if (totalPixels === 0) {
    return {
      threshold: 128,
      separability: 0,
      isBimodal: false,
      histogram
    };
  }

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maxVariance = 0;
  let optimalThreshold = 128;

  let totalVariance = 0;
  const meanTotal = totalSum / totalPixels;
  for (let i = 0; i < 256; i++) {
    totalVariance += Math.pow(i - meanTotal, 2) * (histogram[i] / totalPixels);
  }

  for (let t = 0; t < 256; t++) {
    backgroundWeight += histogram[t];
    if (backgroundWeight === 0) {
      continue;
    }

    const foregroundWeight = totalPixels - backgroundWeight;
    if (foregroundWeight === 0) {
      break;
    }

    backgroundSum += t * histogram[t];

    const meanBackground = backgroundSum / backgroundWeight;
    const meanForeground = (totalSum - backgroundSum) / foregroundWeight;

    const betweenClassVariance =
      (backgroundWeight / totalPixels) *
      (foregroundWeight / totalPixels) *
      Math.pow(meanBackground - meanForeground, 2);

    if (betweenClassVariance > maxVariance) {
      maxVariance = betweenClassVariance;
      optimalThreshold = t;
    }
  }

  const separability = totalVariance > 0 ? maxVariance / totalVariance : 0;

  let peak0 = 0;
  let peak0Idx = 0;
  for (let i = 0; i <= optimalThreshold; i++) {
    if (histogram[i] > peak0) {
      peak0 = histogram[i];
      peak0Idx = i;
    }
  }

  let peak1 = 0;
  let peak1Idx = optimalThreshold + 1;
  for (let i = optimalThreshold + 1; i < 256; i++) {
    if (histogram[i] > peak1) {
      peak1 = histogram[i];
      peak1Idx = i;
    }
  }

  const minPeak = Math.min(peak0, peak1);
  const valleyVal = histogram[optimalThreshold];
  const valleyRatio = minPeak > 0 ? valleyVal / minPeak : 1;
  const peakDistance = Math.abs(peak1Idx - peak0Idx);

  const hasDistinctBimodalValley = minPeak > 0 && valleyRatio < 0.6 && peakDistance > 30;

  let extremeCount = 0;
  for (let i = 0; i < 50; i++) extremeCount += histogram[i];
  for (let i = 206; i < 256; i++) extremeCount += histogram[i];
  const isHighContrast = extremeCount > totalPixels * 0.65;

  const isBimodal = hasDistinctBimodalValley || isHighContrast;

  return {
    threshold: optimalThreshold,
    separability,
    isBimodal,
    histogram
  };
}
