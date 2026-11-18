export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export type ProcessingMode = 'auto' | 'bicolor' | 'grayscale';

export type AppTheme = 'light' | 'dark';

export interface YearPatternConfig {
  matrix: ContributionLevel[][];
  type: 'rolling' | 'calendar';
}

export interface ArtConfig {
  authorName: string;
  authorEmail: string;
  mode: 'bicolor' | 'grayscale';
  matrix: ContributionLevel[][];
  years?: number[];
  patterns?: Record<string, YearPatternConfig>;
  updatedAt: string;
}

export interface UserProfile {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
  noreply_email: string;
}

export interface RepoDetails {
  name: string;
  owner: string;
  html_url: string;
  default_branch: string;
}

export interface ExistingArtData {
  config: ArtConfig;
  sha: string;
}

export interface DeploymentStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
}

export interface UserContributionData {
  totalContributions: number;
  matrix: ContributionLevel[][];
}

export interface ArtworkItem {
  id: string;
  name: string;
  image: HTMLImageElement | null;
  imageThumbUrl: string | null;
  imageFilename: string | null;
  imageDims: string | null;
  mode: ProcessingMode;
  threshold: number;
  isUserManualThreshold: boolean;
  invert: boolean;
  width: number;
  matrix: ContributionLevel[][];
  years: Set<number>;
}
