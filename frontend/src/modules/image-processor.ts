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
}

export interface ImageProcessingOptions {
  mode: ProcessingMode;
  threshold?: number;
  invert: boolean;
  customWidth?: number;
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

export function processImageToMatrix(
  img: HTMLImageElement,
  options: ImageProcessingOptions
): ProcessedImageResult {
  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;

  const height = 7;
  let width = options.customWidth;
  if (!width) {
    const ratio = originalWidth / Math.max(1, originalHeight);
    width = Math.round(height * ratio);
    width = Math.max(1, Math.min(44, width));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not create canvas 2d context');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const hasTransparency = detectTransparency(imageData);
  const histogram = computeLuminanceHistogram(data);
  const otsu = calculateOtsu(histogram);

  let activeMode: 'bicolor' | 'grayscale';
  if (options.mode === 'auto') {
    if (hasTransparency) {
      activeMode = 'bicolor';
    } else if (otsu.isBimodal || otsu.separability > 0.42) {
      activeMode = 'bicolor';
    } else {
      activeMode = 'grayscale';
    }
  } else {
    activeMode = options.mode;
  }

  const threshold = options.threshold !== undefined ? options.threshold : otsu.threshold;

  const matrix: ContributionLevel[][] = Array.from({ length: 7 }, () =>
    new Array<ContributionLevel>(width).fill(0)
  );

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = (row * width + col) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 128) {
        matrix[row][col] = options.invert ? 4 : 0;
        continue;
      }

      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

      if (activeMode === 'bicolor') {
        const isDark = lum < threshold;
        const active = options.invert ? !isDark : isDark;
        matrix[row][col] = active ? 4 : 0;
      } else {
        let norm = (255 - lum) / 255;
        if (options.invert) {
          norm = lum / 255;
        }

        let level: ContributionLevel = 0;
        if (norm >= 0.8) {
          level = 4;
        } else if (norm >= 0.55) {
          level = 3;
        } else if (norm >= 0.3) {
          level = 2;
        } else if (norm >= 0.1) {
          level = 1;
        } else {
          level = 0;
        }

        matrix[row][col] = level;
      }
    }
  }

  return {
    matrix,
    detectedMode: activeMode,
    calculatedThreshold: otsu.threshold,
    hasTransparency,
    width,
    height,
    separability: otsu.separability
  };
}
