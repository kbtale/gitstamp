export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export type ProcessingMode = 'auto' | 'bicolor' | 'grayscale';

export type AppTheme = 'light' | 'dark';

export interface ArtConfig {
  authorName: string;
  authorEmail: string;
  mode: 'bicolor' | 'grayscale';
  matrix: ContributionLevel[][];
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
