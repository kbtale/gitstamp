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

interface PolarityAnalysis {
  perimeterIsDark: boolean;
  hasAlphaBackground: boolean;
  hasUniformBorder: boolean;
  bgRgb: [number, number, number];
}

function analyzeImagePolarity(
  data: Uint8ClampedArray,
  w: number,
  h: number
): PolarityAnalysis {
  let transparentPerimeter = 0;
  const perimeterLuminances: number[] = [];
  const perimeterR: number[] = [];
  const perimeterG: number[] = [];
  const perimeterB: number[] = [];

  function samplePixel(idx: number) {
    if (data[idx + 3] < 128) {
      transparentPerimeter++;
    } else {
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      perimeterR.push(r);
      perimeterG.push(g);
      perimeterB.push(b);
      perimeterLuminances.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
    }
  }

  for (let x = 0; x < w; x++) {
    samplePixel(x * 4);
    if (h > 1) {
      samplePixel(((h - 1) * w + x) * 4);
    }
  }

  for (let y = 1; y < h - 1; y++) {
    samplePixel((y * w) * 4);
    if (w > 1) {
      samplePixel((y * w + (w - 1)) * 4);
    }
  }

  const totalPerimeter = Math.max(1, transparentPerimeter + perimeterLuminances.length);
  const hasAlphaBackground = transparentPerimeter > totalPerimeter * 0.35;

  let perimeterIsDark = false;
  let hasUniformBorder = false;
  let bgRgb: [number, number, number] = [255, 255, 255];

  if (!hasAlphaBackground && perimeterLuminances.length > 0) {
    const sortedLums = [...perimeterLuminances].sort((a, b) => a - b);
    const medianLum = sortedLums[Math.floor(sortedLums.length / 2)];
    perimeterIsDark = medianLum < 120;

    const sortedR = [...perimeterR].sort((a, b) => a - b);
    const sortedG = [...perimeterG].sort((a, b) => a - b);
    const sortedB = [...perimeterB].sort((a, b) => a - b);
    const mid = Math.floor(sortedR.length / 2);
    bgRgb = [sortedR[mid], sortedG[mid], sortedB[mid]];

    let matchingCount = 0;
    for (let i = 0; i < perimeterR.length; i++) {
      const dist = Math.abs(perimeterR[i] - bgRgb[0]) + Math.abs(perimeterG[i] - bgRgb[1]) + Math.abs(perimeterB[i] - bgRgb[2]);
      if (dist <= 36) {
        matchingCount++;
      }
    }
    hasUniformBorder = matchingCount >= perimeterR.length * 0.80;
  }

  return { perimeterIsDark, hasAlphaBackground, hasUniformBorder, bgRgb };
}

function detectContentBounds(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  hasAlphaBackground: boolean,
  hasUniformBorder: boolean,
  bgRgb: [number, number, number]
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!hasAlphaBackground && !hasUniformBorder) {
    return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 };
  }

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const a = data[idx + 3];
      let isContent = false;

      if (hasAlphaBackground) {
        isContent = a >= 24;
      } else if (a >= 128) {
        const dist = Math.abs(data[idx] - bgRgb[0]) + Math.abs(data[idx + 1] - bgRgb[1]) + Math.abs(data[idx + 2] - bgRgb[2]);
        isContent = dist > 36;
      }

      if (isContent) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY || (maxX - minX + 1) < 2 || (maxY - minY + 1) < 2) {
    return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 };
  }

  return { minX, minY, maxX, maxY };
}

function perceptualColorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const rMean = (r1 + r2) * 0.5;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const raw = Math.sqrt(
    (2 + rMean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rMean) / 256) * db * db
  );
  return Math.min(255, Math.round((raw / 765) * 255));
}

function computeDistanceHistogram(
  data: Uint8ClampedArray,
  bgRgb: [number, number, number]
): { histogram: number[]; minVal: number; maxVal: number } {
  const histogram = new Array<number>(256).fill(0);
  let minVal = 255;
  let maxVal = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) {
      continue;
    }
    const dist = perceptualColorDistance(data[i], data[i + 1], data[i + 2], bgRgb[0], bgRgb[1], bgRgb[2]);
    const inverted = 255 - dist;
    histogram[inverted]++;
    if (inverted < minVal) minVal = inverted;
    if (inverted > maxVal) maxVal = inverted;
  }

  return { histogram, minVal, maxVal };
}

function computeAnalysisDimensions(origW: number, origH: number): { w: number; h: number } {
  const maxLongDim = 512;
  const targetBase = 256;
  const minShortH = Math.min(origH, 56);

  let scale = Math.min(1, targetBase / Math.max(1, Math.max(origW, origH)));
  let h = Math.max(1, Math.round(origH * scale));
  if (h < minShortH) {
    scale = Math.min(1, minShortH / Math.max(1, origH));
  }

  let w = Math.max(1, Math.round(origW * scale));
  h = Math.max(1, Math.round(origH * scale));

  if (w > maxLongDim) {
    const clampScale = maxLongDim / w;
    w = maxLongDim;
    h = Math.max(1, Math.round(h * clampScale));
  }

  return { w, h };
}

function drawScaledToCanvas(
  img: HTMLImageElement,
  origW: number,
  origH: number,
  targetW: number,
  targetH: number
): HTMLCanvasElement {
  let source: CanvasImageSource = img;
  let curW = origW;
  let curH = origH;

  while (curW > targetW * 2 || curH > targetH * 2) {
    const nextW = Math.max(targetW, Math.round(curW / 2));
    const nextH = Math.max(targetH, Math.round(curH / 2));
    const stepCanvas = document.createElement('canvas');
    stepCanvas.width = nextW;
    stepCanvas.height = nextH;
    const stepCtx = stepCanvas.getContext('2d', { willReadFrequently: true });
    if (!stepCtx) {
      break;
    }
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(source, 0, 0, nextW, nextH);
    source = stepCanvas;
    curW = nextW;
    curH = nextH;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not create analysis canvas context');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return canvas;
}

function computeKMeansCutoffs(values: number[], k: number, fallback: number[]): number[] {
  if (values.length < k * 2) {
    return fallback;
  }

  const sorted = [...values].sort((a, b) => a - b);
  if (sorted[sorted.length - 1] - sorted[0] < 0.08) {
    return fallback;
  }

  const centroids: number[] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.min(sorted.length - 1, Math.floor(((i + 0.5) / k) * sorted.length));
    centroids.push(sorted[idx]);
  }

  for (let iter = 0; iter < 12; iter++) {
    const sums = new Array<number>(k).fill(0);
    const counts = new Array<number>(k).fill(0);

    for (let i = 0; i < sorted.length; i++) {
      const v = sorted[i];
      let bestIdx = 0;
      let bestDist = Math.abs(v - centroids[0]);
      for (let j = 1; j < k; j++) {
        const d = Math.abs(v - centroids[j]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = j;
        }
      }
      sums[bestIdx] += v;
      counts[bestIdx]++;
    }

    let moved = false;
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        const nextVal = sums[j] / counts[j];
        if (Math.abs(nextVal - centroids[j]) > 0.001) {
          moved = true;
        }
        centroids[j] = nextVal;
      }
    }

    if (!moved) {
      break;
    }
  }

  centroids.sort((a, b) => a - b);
  const cutoffs: number[] = [];
  for (let i = 0; i < k - 1; i++) {
    if (centroids[i + 1] - centroids[i] < 0.02) {
      return fallback;
    }
    cutoffs.push((centroids[i] + centroids[i + 1]) * 0.5);
  }

  return cutoffs;
}

export function processImageToMatrix(
  img: HTMLImageElement,
  options: ImageProcessingOptions
): ProcessedImageResult {
  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;
  const height = 7;

  const { w: analysisW, h: analysisH } = computeAnalysisDimensions(originalWidth, originalHeight);
  const analysisCanvas = drawScaledToCanvas(img, originalWidth, originalHeight, analysisW, analysisH);
  const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!analysisCtx) {
    throw new Error('Could not create analysis canvas context');
  }

  const analysisImageData = analysisCtx.getImageData(0, 0, analysisW, analysisH);
  const analysisData = analysisImageData.data;

  const hasTransparency = detectTransparency(analysisImageData);
  const { perimeterIsDark, hasAlphaBackground, hasUniformBorder, bgRgb } = analyzeImagePolarity(
    analysisData,
    analysisW,
    analysisH
  );

  const bounds = detectContentBounds(
    analysisData,
    analysisW,
    analysisH,
    hasAlphaBackground,
    hasUniformBorder,
    bgRgb
  );
  const cropW = bounds.maxX - bounds.minX + 1;
  const cropH = bounds.maxY - bounds.minY + 1;

  const trimmedNaturalW = (cropW / Math.max(1, analysisW)) * originalWidth;
  const trimmedNaturalH = (cropH / Math.max(1, analysisH)) * originalHeight;

  let width: number = options.customWidth || 0;
  if (!width) {
    const ratio = trimmedNaturalW / Math.max(1, trimmedNaturalH);
    width = Math.round(height * ratio);
    width = Math.max(1, Math.min(53, width));
  }

  const lumHistogram = computeLuminanceHistogram(analysisData);
  const lumOtsu = calculateOtsu(lumHistogram);

  let lumMin = 255;
  let lumMax = 0;
  for (let i = 0; i < 256; i++) {
    if (lumHistogram[i] > 0) {
      if (i < lumMin) lumMin = i;
      if (i > lumMax) lumMax = i;
    }
  }
  const lumRange = Math.max(0, lumMax - lumMin);

  const interiorOpaqueLums: number[] = [];
  const interiorRimLums: number[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const idx = (y * analysisW + x) * 4;
      if (analysisData[idx + 3] >= 128) {
        const l = Math.round(0.299 * analysisData[idx] + 0.587 * analysisData[idx + 1] + 0.114 * analysisData[idx + 2]);
        interiorOpaqueLums.push(l);
        if (
          y <= bounds.minY + 1 ||
          y >= bounds.maxY - 1 ||
          x <= bounds.minX + 1 ||
          x >= bounds.maxX - 1
        ) {
          interiorRimLums.push(l);
        }
      }
    }
  }

  let opaqueInteriorSpan = lumRange;
  let interiorRimIsDark = perimeterIsDark;
  if (interiorOpaqueLums.length > 10) {
    const sortedInterior = [...interiorOpaqueLums].sort((a, b) => a - b);
    const ip05 = sortedInterior[Math.floor(sortedInterior.length * 0.05)];
    const ip95 = sortedInterior[Math.min(sortedInterior.length - 1, Math.floor(sortedInterior.length * 0.95))];
    opaqueInteriorSpan = ip95 - ip05;
  }
  if (hasAlphaBackground && interiorRimLums.length > 0) {
    interiorRimLums.sort((a, b) => a - b);
    interiorRimIsDark = interiorRimLums[Math.floor(interiorRimLums.length / 2)] < 120;
  }

  const isSolidAlphaSilhouette = hasAlphaBackground && (opaqueInteriorSpan < 55 || lumOtsu.separability < 0.35);

  let useColorDistance = false;
  let otsu = lumOtsu;

  if (!hasAlphaBackground && hasUniformBorder) {
    const distData = computeDistanceHistogram(analysisData, bgRgb);
    const distRange = Math.max(0, distData.maxVal - distData.minVal);
    if (distRange > 35) {
      const distOtsu = calculateOtsu(distData.histogram);
      if (distRange > lumRange * 1.25 || distOtsu.separability > lumOtsu.separability + 0.08) {
        useColorDistance = true;
        otsu = distOtsu;
      }
    }
  }

  const suggestedInvert = isSolidAlphaSilhouette
    ? false
    : (!useColorDistance && (hasAlphaBackground ? interiorRimIsDark : perimeterIsDark));
  const effectiveInvert = options.autoDetectInvert
    ? suggestedInvert
    : (options.invert ?? false);

  let activeMode: 'bicolor' | 'grayscale';
  if (options.mode === 'auto') {
    const opaqueLums: number[] = [];
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const idx = (y * analysisW + x) * 4;
        if (analysisData[idx + 3] >= 128) {
          const val = useColorDistance
            ? 255 - perceptualColorDistance(analysisData[idx], analysisData[idx + 1], analysisData[idx + 2], bgRgb[0], bgRgb[1], bgRgb[2])
            : Math.round(0.299 * analysisData[idx] + 0.587 * analysisData[idx + 1] + 0.114 * analysisData[idx + 2]);
          opaqueLums.push(val);
        }
      }
    }

    let isMultishade = false;
    if (opaqueLums.length > 20) {
      opaqueLums.sort((a, b) => a - b);
      const p05 = opaqueLums[Math.floor(opaqueLums.length * 0.05)];
      const p95 = opaqueLums[Math.min(opaqueLums.length - 1, Math.floor(opaqueLums.length * 0.95))];
      const span = p95 - p05;

      if (span >= 40) {
        const lowBand = p05 + span * 0.20;
        const highBand = p95 - span * 0.20;
        let midtoneCount = 0;
        for (let i = 0; i < opaqueLums.length; i++) {
          if (opaqueLums[i] > lowBand && opaqueLums[i] < highBand) {
            midtoneCount++;
          }
        }
        const midtoneRatio = midtoneCount / opaqueLums.length;
        if (midtoneRatio >= 0.22 || (otsu.separability < 0.38 && span >= 55)) {
          isMultishade = true;
        }
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
    const relY0 = Math.floor((row * cropH) / 7);
    const relY1 = row === 6
      ? cropH
      : Math.max(relY0 + 1, Math.floor(((row + 1) * cropH) / 7));
    const y0 = bounds.minY + relY0;
    const y1 = Math.min(bounds.maxY + 1, bounds.minY + relY1);

    for (let col = 0; col < width; col++) {
      const relX0 = Math.floor((col * cropW) / width);
      const relX1 = col === width - 1
        ? cropW
        : Math.max(relX0 + 1, Math.floor(((col + 1) * cropW) / width));
      const x0 = bounds.minX + relX0;
      const x1 = Math.min(bounds.maxX + 1, bounds.minX + relX1);

      let opaqueSum = 0;
      let alphaSum = 0;
      let pixelCount = 0;
      const sampleLums: number[] = [];

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * analysisW + x) * 4;
          const a = analysisData[idx + 3];
          alphaSum += a;
          pixelCount++;

          if (a >= 128) {
            const l = useColorDistance
              ? 255 - perceptualColorDistance(analysisData[idx], analysisData[idx + 1], analysisData[idx + 2], bgRgb[0], bgRgb[1], bgRgb[2])
              : Math.round(
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
      cellEffectiveAlphas[row][col] = Math.round(avgAlpha);

      if (sampleLums.length === 0) {
        cellLuminances[row][col] = foregroundIsDark ? 255 : 0;
      } else {
        cellLuminances[row][col] = Math.round(opaqueSum / sampleLums.length);
      }
    }
  }

  const useAlphaMask = isSolidAlphaSilhouette && activeMode === 'bicolor';
  let activeThreshold = options.threshold !== undefined
    ? options.threshold
    : (useAlphaMask ? 128 : otsu.threshold);

  if (options.threshold === undefined && activeMode === 'bicolor') {
    let activeCount = 0;
    const totalCells = 7 * width;
    const sampleValues: number[] = [];

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < width; c++) {
        if (useAlphaMask) {
          const alphaVal = cellEffectiveAlphas[r][c];
          sampleValues.push(alphaVal);
          const isOpaque = alphaVal >= (255 - activeThreshold);
          if (effectiveInvert ? !isOpaque : isOpaque) {
            activeCount++;
          }
          continue;
        }
        if (cellEffectiveAlphas[r][c] < 128) {
          if (effectiveInvert) {
            activeCount++;
          }
          continue;
        }
        const lum = cellLuminances[r][c];
        sampleValues.push(lum);
        const isDark = lum < activeThreshold;
        if (effectiveInvert ? !isDark : isDark) {
          activeCount++;
        }
      }
    }

    const density = totalCells > 0 ? activeCount / totalCells : 0;
    if (sampleValues.length > 0 && (density < 0.05 || density > 0.90)) {
      sampleValues.sort((a, b) => a - b);
      const minVal = sampleValues[0];
      const maxVal = sampleValues[sampleValues.length - 1];

      if (maxVal - minVal > 4) {
        const targetRatio = density < 0.05 ? 0.15 : 0.78;
        if (useAlphaMask) {
          const idx = effectiveInvert
            ? Math.min(sampleValues.length - 1, Math.floor(sampleValues.length * targetRatio))
            : Math.max(0, Math.floor(sampleValues.length * (1 - targetRatio)));
          const targetAlpha = sampleValues[idx];
          if (targetAlpha > 0) {
            activeThreshold = Math.max(15, Math.min(240, 255 - targetAlpha + (effectiveInvert ? -1 : 1)));
          }
        } else {
          const idx = foregroundIsDark
            ? Math.min(sampleValues.length - 1, Math.floor(sampleValues.length * targetRatio))
            : Math.max(0, Math.floor(sampleValues.length * (1 - targetRatio)));
          const targetLum = sampleValues[idx];
          activeThreshold = Math.max(15, Math.min(240, targetLum + (foregroundIsDark ? 1 : -1)));
        }
      }
    }
  }

  let minLum = 255;
  let maxLum = 0;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < width; c++) {
      if (cellEffectiveAlphas[r][c] >= 128) {
        const l = cellLuminances[r][c];
        if (l < minLum) minLum = l;
        if (l > maxLum) maxLum = l;
      }
    }
  }

  const lumSpan = Math.max(1, maxLum - minLum);
  const useAlphaCoverageShading = isSolidAlphaSilhouette && activeMode === 'grayscale' && lumSpan < 24;
  if (useAlphaCoverageShading && options.threshold === undefined) {
    activeThreshold = 128;
  }
  const normalizedMid = Math.max(0.02, Math.min(0.98, (activeThreshold - minLum) / lumSpan));
  const targetMid = effectiveInvert ? normalizedMid : (1 - normalizedMid);
  const gamma = Math.log(0.5) / Math.log(targetMid);

  const coverageMid = Math.max(0.05, Math.min(0.95, 1 - (activeThreshold / 255)));
  const coverageGamma = Math.log(0.5) / Math.log(coverageMid);

  let levelCutoffs: number[] = hasTransparency ? [0.25, 0.50, 0.75] : [0.15, 0.35, 0.55, 0.80];
  if (activeMode === 'grayscale' && !useAlphaCoverageShading) {
    const normValues: number[] = [];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < width; c++) {
        if (cellEffectiveAlphas[r][c] >= 128) {
          const t = (cellLuminances[r][c] - minLum) / lumSpan;
          normValues.push(effectiveInvert ? t : (1 - t));
        }
      }
    }
    levelCutoffs = computeKMeansCutoffs(
      normValues,
      hasTransparency ? 4 : 5,
      levelCutoffs
    );
  }

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

      if (cellEffectiveAlphas[row][col] < 128) {
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
          if (adjustedNorm >= levelCutoffs[2]) {
            level = 4;
          } else if (adjustedNorm >= levelCutoffs[1]) {
            level = 3;
          } else if (adjustedNorm >= levelCutoffs[0]) {
            level = 2;
          } else {
            level = 1;
          }
        } else {
          if (adjustedNorm >= levelCutoffs[3]) {
            level = 4;
          } else if (adjustedNorm >= levelCutoffs[2]) {
            level = 3;
          } else if (adjustedNorm >= levelCutoffs[1]) {
            level = 2;
          } else if (adjustedNorm >= levelCutoffs[0]) {
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
