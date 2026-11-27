import { ContributionLevel } from '../types';

export interface ExportedArtPayload {
  version: 1;
  name: string;
  width: number;
  height: 7;
  matrix: ContributionLevel[][];
}

export function serializeArtMatrix(matrix: ContributionLevel[][], name: string): string {
  const width = matrix[0]?.length || 1;
  const payload: ExportedArtPayload = {
    version: 1,
    name: name.trim() || 'GitStamp Artwork',
    width,
    height: 7,
    matrix: matrix.map((row) => [...row])
  };
  return JSON.stringify(payload, null, 2);
}

export function parseArtMatrix(raw: string): { matrix: ContributionLevel[][]; name?: string } {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const candidate = Array.isArray(parsed) ? parsed : parsed?.matrix;

  if (!Array.isArray(candidate) || candidate.length !== 7) {
    throw new Error('Matrix must have exactly 7 rows');
  }

  const firstRow = candidate[0];
  if (!Array.isArray(firstRow) || firstRow.length < 1 || firstRow.length > 53) {
    throw new Error('Matrix width must be between 1 and 53 columns');
  }

  const width = firstRow.length;
  const matrix: ContributionLevel[][] = [];

  for (let r = 0; r < 7; r++) {
    const row = candidate[r];
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error('All matrix rows must have equal length');
    }
    const cleanRow: ContributionLevel[] = [];
    for (let c = 0; c < width; c++) {
      const val = Number(row[c]);
      if (!Number.isInteger(val) || val < 0 || val > 4) {
        throw new Error('Matrix cells must be integers between 0 and 4');
      }
      cleanRow.push(val as ContributionLevel);
    }
    matrix.push(cleanRow);
  }

  const name = typeof parsed?.name === 'string' && parsed.name.trim()
    ? parsed.name.trim()
    : undefined;

  return { matrix, name };
}
