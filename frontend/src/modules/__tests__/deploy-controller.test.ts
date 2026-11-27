import { describe, expect, it } from 'vitest';
import {
  buildDeployArtPayload,
  buildUnstampArtPayload,
  getAppInstallUrl,
  isAppInstallationError
} from '../deploy-controller';
import { ArtworkItem, ContributionLevel, UserProfile } from '../../types';

const mockUser: UserProfile = {
  login: 'octocat',
  avatar_url: 'https://example.com/avatar.png',
  name: 'Octocat',
  email: 'octocat@example.com',
  noreply_email: '1+octocat@users.noreply.github.com'
};

describe('deploy-controller payload builders', () => {
  it('builds an empty unstamp art payload with flattenBackground disabled', () => {
    const payload = buildUnstampArtPayload(mockUser, 2026);
    expect(payload.authorName).toBe('octocat');
    expect(payload.flattenBackground).toBe(false);
    expect(payload.years).toEqual([2026]);
    expect(payload.matrix).toHaveLength(7);
    expect(payload.matrix.flat().every((v) => v === 0)).toBe(true);
    expect(payload.patterns?.['2026']?.type).toBe('rolling');
  });

  it('builds multi-year deploy payload with rolling current year and calendar past years', () => {
    const matrix: ContributionLevel[][] = Array.from({ length: 7 }, () => [4, 2]);
    const artwork: ArtworkItem = {
      id: 'art-1',
      name: 'Heart',
      image: null,
      imageThumbUrl: null,
      imageFilename: null,
      imageDims: null,
      mode: 'grayscale',
      threshold: 128,
      isUserManualThreshold: false,
      invert: false,
      width: 2,
      matrix,
      years: new Set([2026, 2025])
    };

    const payload = buildDeployArtPayload({
      user: mockUser,
      sortedYears: [2026, 2025],
      currentYear: 2026,
      getArtworkForYear: () => artwork,
      fallbackMatrix: matrix,
      flattenBackground: true
    });

    expect(payload.mode).toBe('grayscale');
    expect(payload.flattenBackground).toBe(true);
    expect(payload.patterns?.['2026']?.type).toBe('rolling');
    expect(payload.patterns?.['2025']?.type).toBe('calendar');
  });

  it('identifies GitHub App installation and permission errors and builds install URL', () => {
    expect(isAppInstallationError('Resource not accessible by integration')).toBe(true);
    expect(isAppInstallationError('Failed to create repository: Forbidden')).toBe(true);
    expect(isAppInstallationError('HTTP 403 error')).toBe(true);
    expect(isAppInstallationError('Not Found')).toBe(true);
    expect(isAppInstallationError('Network timeout')).toBe(false);

    expect(getAppInstallUrl('gitstamp')).toBe('https://github.com/apps/gitstamp/installations/new');
    expect(getAppInstallUrl('')).toBe('https://github.com/apps/gitstamp/installations/new');
  });
});
