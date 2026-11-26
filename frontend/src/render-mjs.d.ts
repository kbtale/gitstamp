declare module '../../../../templates/render.mjs' {
  export function sanitizeGitIdentity(value: unknown, fieldName: string): string;
  export function formatDate(date: Date): string;
  export function determineQuartileThresholds(
    calendar: {
      weeks?: Array<{
        contributionDays?: Array<{
          date: string;
          contributionCount: number;
          contributionLevel: string;
        }>;
      }>;
    },
    flattenBackground?: boolean
  ): {
    existingMap: Map<string, number>;
    thresholds: Record<number, number>;
  };
  export function buildYearCommits(params: {
    year: number;
    isRolling: boolean;
    yearMatrix: number[][];
    col0Sunday: Date;
    totalCols: number;
    existingMap: Map<string, number>;
    thresholds: Record<number, number>;
    processedDates: Set<string>;
  }): Array<{ dateStr: string; count: number }>;
}
