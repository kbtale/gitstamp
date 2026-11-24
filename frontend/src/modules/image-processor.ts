import { ContributionLevel, ProcessingMode } from '../types';
import { calculateOtsu, computeLuminanceHistogram } from './otsu';

export interface ProcessedImageResult {
  matrix: ContributionLevel[][];
  detectedMode: 'bicolor' | 'grayscale';
  calculatedThreshold: number;
  hasTransparency: boolean;
  width: number;
  height: number;
  separability: number;
  suggestedInvert?: boolean;
}

export interface ImageProcessingOptions {
  mode: ProcessingMode;
  threshold?: number;
  invert?: boolean;
  customWidth?: number;
  autoDetectInvert?: boolean;
}

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function detectTransparency(imageData: ImageData): boolean {
  const data = imageData.data;
  const totalPixels = data.length / 4;
  let transparentPixels = 0;

  for (let i = 0; i < totalPixels; i++) {
    const alpha = data[i * 4 + 3];
    if (alpha < 240) {
      transparentPixels++;
    }
  }

  return transparentPixels > totalPixels * 0.02;
}

function analyzeImagePolarity(
  data: Uint8ClampedArray,
  w: number,
  h: number
): { perimeterIsDark: boolean; hasAlphaBackground: boolean } {
  let transparentPerimeter = 0;
  const perimeterLuminances: number[] = [];

  for (let x = 0; x < w; x++) {
    const topIdx = x * 4;
    const botIdx = ((h - 1) * w + x) * 4;

    if (data[topIdx + 3] < 128) {
      transparentPerimeter++;
    } else {
      perimeterLuminances.push(
        Math.round(0.299 * data[topIdx] + 0.587 * data[topIdx + 1] + 0.114 * data[topIdx + 2])
      );
    }

    if (data[botIdx + 3] < 128) {
      transparentPerimeter++;
    } else {
      perimeterLuminances.push(
        Math.round(0.299 * data[botIdx] + 0.587 * data[botIdx + 1] + 0.114 * data[botIdx + 2])
      );
    }
  }

  for (let y = 1; y < h - 1; y++) {
    const leftIdx = (y * w) * 4;
    const rightIdx = (y * w + (w - 1)) * 4;

    if (data[leftIdx + 3] < 128) {
      transparentPerimeter++;
    } else {
      perimeterLuminances.push(
        Math.round(0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2])
      );
    }

    if (data[rightIdx + 3] < 128) {
      transparentPerimeter++;
    } else {
      perimeterLuminances.push(
        Math.round(0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2])
      );
    }
  }

  const totalPerimeter = (w + h - 2) * 2;
  const hasAlphaBackground = transparentPerimeter > totalPerimeter * 0.35;

  let perimeterIsDark = false;
  if (!hasAlphaBackground && perimeterLuminances.length > 0) {
    perimeterLuminances.sort((a, b) => a - b);
    const medianLum = perimeterLuminances[Math.floor(perimeterLuminances.length / 2)];
    perimeterIsDark = medianLum < 120;
  }

  return { perimeterIsDark, hasAlphaBackground };
}

export function processImageToMatrix(
  img: HTMLImageElement,
  options: ImageProcessingOptions
): ProcessedImageResult {
  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;

  const height = 7;
  let width: number = options.customWidth || 0;
  if (!width) {
    const ratio = originalWidth / Math.max(1, originalHeight);
    width = Math.round(height * ratio);
    width = Math.max(1, Math.min(44, width));
  }

  const maxAnalysisDim = 256;
  let analysisW = originalWidth;
  let analysisH = originalHeight;
  if (originalWidth > maxAnalysisDim || originalHeight > maxAnalysisDim) {
    if (originalWidth >= originalHeight) {
      analysisW = maxAnalysisDim;
      analysisH = Math.max(1, Math.round(maxAnalysisDim * (originalHeight / originalWidth)));
    } else {
      analysisH = maxAnalysisDim;
      analysisW = Math.max(1, Math.round(maxAnalysisDim * (originalWidth / originalHeight)));
    }
  }

  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = analysisW;
  analysisCanvas.height = analysisH;
  const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!analysisCtx) {
    throw new Error('Could not create analysis canvas context');
  }

  analysisCtx.imageSmoothingEnabled = true;
  analysisCtx.imageSmoothingQuality = 'high';
  analysisCtx.drawImage(img, 0, 0, analysisW, analysisH);

  const analysisImageData = analysisCtx.getImageData(0, 0, analysisW, analysisH);
  const analysisData = analysisImageData.data;

  const hasTransparency = detectTransparency(analysisImageData);
  const { perimeterIsDark, hasAlphaBackground } = analyzeImagePolarity(analysisData, analysisW, analysisH);

  const suggestedInvert = (!hasTransparency && !hasAlphaBackground && perimeterIsDark);
  const effectiveInvert = options.autoDetectInvert
    ? suggestedInvert
    : (options.invert ?? false);

  const histogram = computeLuminanceHistogram(analysisData);
  const otsu = calculateOtsu(histogram);

  let activeMode: 'bicolor' | 'grayscale';
  if (options.mode === 'auto') {
    const opaqueLums: number[] = [];
    for (let i = 0; i < analysisData.length; i += 4) {
      if (analysisData[i + 3] >= 128) {
        opaqueLums.push(Math.round(0.299 * analysisData[i] + 0.587 * analysisData[i + 1] + 0.114 * analysisData[i + 2]));
      }
    }

    let isMultishade = false;
    if (opaqueLums.length > 20) {
      const mean = opaqueLums.reduce((a, b) => a + b, 0) / opaqueLums.length;
      const variance = opaqueLums.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / opaqueLums.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev > 45 && otsu.separability < 0.38) {
        isMultishade = true;
      }
    }

    activeMode = isMultishade ? 'grayscale' : 'bicolor';
  } else {
    activeMode = options.mode;
  }

  const cellLuminances: number[][] = Array.from({ length: 7 }, () => new Array<number>(width).fill(0));
  const cellAlphas: number[][] = Array.from({ length: 7 }, () => new Array<number>(width).fill(0));
  const cellEffectiveAlphas: number[][] = Array.from({ length: 7 }, () => new Array<number>(width).fill(0));

  const foregroundIsDark = !effectiveInvert;

  for (let row = 0; row < 7; row++) {
    const y0 = Math.floor((row * analysisH) / 7);
    const y1 = Math.max(y0 + 1, Math.ceil(((row + 1) * analysisH) / 7));

    for (let col = 0; col < width; col++) {
      const x0 = Math.floor((col * analysisW) / width);
      const x1 = Math.max(x0 + 1, Math.ceil(((col + 1) * analysisW) / width));

      let opaqueSum = 0;
      let alphaSum = 0;
      let pixelCount = 0;
      const sampleLums: number[] = [];
      const sampleAlphas: number[] = [];

      for (let y = y0; y < y1 && y < analysisH; y++) {
        for (let x = x0; x < x1 && x < analysisW; x++) {
          const idx = (y * analysisW + x) * 4;
          const a = analysisData[idx + 3];
          alphaSum += a;
          pixelCount++;
          sampleAlphas.push(a);

          if (a >= 128) {
            const l = Math.round(
              0.299 * analysisData[idx] +
              0.587 * analysisData[idx + 1] +
              0.114 * analysisData[idx + 2]
            );
            sampleLums.push(l);
            opaqueSum += l;
          }
        }
      }

      const avgAlpha = pixelCount > 0 ? alphaSum / pixelCount : 0;
      cellAlphas[row][col] = avgAlpha;

      if (sampleAlphas.length === 0) {
        cellEffectiveAlphas[row][col] = 0;
      } else {
        sampleAlphas.sort((a, b) => a - b);
        const alphaQ85 = sampleAlphas[Math.min(sampleAlphas.length - 1, Math.floor(sampleAlphas.length * 0.85))];
        cellEffectiveAlphas[row][col] = Math.round(0.45 * avgAlpha + 0.55 * alphaQ85);
      }

      if (sampleLums.length === 0) {
        cellLuminances[row][col] = foregroundIsDark ? 255 : 0;
      } else {
        const mean = opaqueSum / sampleLums.length;
        sampleLums.sort((a, b) => a - b);
        const pIndex = foregroundIsDark
          ? Math.floor(sampleLums.length * 0.15)
          : Math.min(sampleLums.length - 1, Math.floor(sampleLums.length * 0.85));
        const pVal = sampleLums[pIndex];
        cellLuminances[row][col] = Math.round(0.4 * mean + 0.6 * pVal);
      }
    }
  }

  const useAlphaMask = hasAlphaBackground && activeMode === 'bicolor';
  let activeThreshold = options.threshold !== undefined
    ? options.threshold
    : (useAlphaMask ? 128 : otsu.threshold);

  if (options.threshold === undefined) {
    function calculateDensity(t: number): number {
      let active = 0;
      let total = 0;
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < width; c++) {
          total++;
          if (useAlphaMask) {
            const isOpaque = cellEffectiveAlphas[r][c] >= (255 - t);
            const isCellActive = effectiveInvert ? !isOpaque : isOpaque;
            if (isCellActive) active++;
            continue;
          }
          if (cellEffectiveAlphas[r][c] < 64) {
            if (effectiveInvert) active++;
            continue;
          }
          const lum = cellLuminances[r][c];
          const isDark = lum < t;
          const isCellActive = effectiveInvert ? !isDark : isDark;
          if (isCellActive) active++;
        }
      }
      return total > 0 ? active / total : 0;
    }

    const densityIncreasesWithT = useAlphaMask ? !effectiveInvert : foregroundIsDark;
    let density = calculateDensity(activeThreshold);
    let guardSteps = 0;

    while (density < 0.12 && guardSteps < 4) {
      activeThreshold += densityIncreasesWithT ? 14 : -14;
      activeThreshold = Math.max(15, Math.min(240, activeThreshold));
      density = calculateDensity(activeThreshold);
      guardSteps++;
    }

    guardSteps = 0;
    while (density > 0.72 && guardSteps < 4) {
      activeThreshold += densityIncreasesWithT ? -14 : 14;
      activeThreshold = Math.max(15, Math.min(240, activeThreshold));
      density = calculateDensity(activeThreshold);
      guardSteps++;
    }
  }

  let minLum = 255;
  let maxLum = 0;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < width; c++) {
      if (cellEffectiveAlphas[r][c] >= 64) {
        const l = cellLuminances[r][c];
        if (l < minLum) minLum = l;
        if (l > maxLum) maxLum = l;
      }
    }
  }

  const lumSpan = Math.max(1, maxLum - minLum);
  const useAlphaCoverageShading = hasAlphaBackground && activeMode === 'grayscale' && lumSpan < 24;
  if (useAlphaCoverageShading && options.threshold === undefined) {
    activeThreshold = 128;
  }
  const normalizedMid = Math.max(0.02, Math.min(0.98, (activeThreshold - minLum) / lumSpan));
  const targetMid = effectiveInvert ? normalizedMid : (1 - normalizedMid);
  const gamma = Math.log(0.5) / Math.log(targetMid);

  const coverageMid = Math.max(0.05, Math.min(0.95, 1 - (activeThreshold / 255)));
  const coverageGamma = Math.log(0.5) / Math.log(coverageMid);

  const matrix: ContributionLevel[][] = Array.from({ length: 7 }, () =>
    new Array<ContributionLevel>(width).fill(0)
  );

  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < width; col++) {
      if (useAlphaMask) {
        const isOpaque = cellEffectiveAlphas[row][col] >= (255 - activeThreshold);
        const active = effectiveInvert ? !isOpaque : isOpaque;
        matrix[row][col] = active ? 4 : 0;
        continue;
      }

      if (useAlphaCoverageShading) {
        const rawCoverage = cellAlphas[row][col] / 255;
        const cov = effectiveInvert ? (1 - rawCoverage) : rawCoverage;
        const adjustedCov = Math.pow(Math.max(0, Math.min(1, cov)), coverageGamma);
        let level: ContributionLevel = 0;
        if (adjustedCov >= 0.80) {
          level = 4;
        } else if (adjustedCov >= 0.55) {
          level = 3;
        } else if (adjustedCov >= 0.30) {
          level = 2;
        } else if (adjustedCov >= 0.12) {
          level = 1;
        } else {
          level = 0;
        }
        matrix[row][col] = level;
        continue;
      }

      if (cellEffectiveAlphas[row][col] < 64) {
        matrix[row][col] = effectiveInvert ? 4 : 0;
        continue;
      }

      const lum = cellLuminances[row][col];

      if (activeMode === 'bicolor') {
        const isDark = lum < activeThreshold;
        const active = effectiveInvert ? !isDark : isDark;
        matrix[row][col] = active ? 4 : 0;
      } else {
        const t = (lum - minLum) / lumSpan;
        const norm = effectiveInvert ? t : (1 - t);
        const adjustedNorm = Math.pow(Math.max(0, Math.min(1, norm)), gamma);

        let level: ContributionLevel = 0;
        if (hasTransparency) {
          if (adjustedNorm >= 0.75) {
            level = 4;
          } else if (adjustedNorm >= 0.50) {
            level = 3;
          } else if (adjustedNorm >= 0.25) {
            level = 2;
          } else {
            level = 1;
          }
        } else {
          if (adjustedNorm >= 0.80) {
            level = 4;
          } else if (adjustedNorm >= 0.55) {
            level = 3;
          } else if (adjustedNorm >= 0.35) {
            level = 2;
          } else if (adjustedNorm >= 0.15) {
            level = 1;
          } else {
            level = 0;
          }
        }

        matrix[row][col] = level;
      }
    }
  }

  return {
    matrix,
    detectedMode: activeMode,
    calculatedThreshold: activeThreshold,
    hasTransparency,
    width,
    height: 7,
    separability: otsu.separability,
    suggestedInvert
  };
}
