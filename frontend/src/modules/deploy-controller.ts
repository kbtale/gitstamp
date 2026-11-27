import { ArtConfig, ArtworkItem, ContributionLevel, UserProfile } from '../types';
import {
  checkRepoExists,
  createPublicRepo,
  getFile,
  putFile,
  starRepo,
  triggerWorkflow
} from './github-api';
import { generateReadme, RENDER_MJS_TEMPLATE, RENDER_YML_TEMPLATE } from './templates';

export type StepStatus = 'pending' | 'running' | 'success' | 'error';

export interface DeployCallbacks {
  onStep: (step: 'repo' | 'files' | 'dispatch', status: StepStatus, text?: string) => void;
}

export function isAppInstallationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('integration') ||
    lower.includes('403') ||
    lower.includes('forbidden') ||
    lower.includes('not found') ||
    lower.includes('must have admin rights')
  );
}

export function getAppInstallUrl(appSlug: string): string {
  const slug = appSlug.trim() || 'gitstamp';
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
}

export function buildDeployArtPayload(params: {
  user: UserProfile;
  sortedYears: number[];
  currentYear: number;
  getArtworkForYear: (year: number) => ArtworkItem | undefined;
  fallbackMatrix: ContributionLevel[][];
  flattenBackground: boolean;
}): ArtConfig {
  const { user, sortedYears, currentYear, getArtworkForYear, fallbackMatrix, flattenBackground } = params;
  const patterns: Record<string, { type: 'rolling' | 'calendar'; matrix: ContributionLevel[][] }> = {};
  let hasGrayscale = false;

  for (const yr of sortedYears) {
    const yearArtwork = getArtworkForYear(yr);
    if (!yearArtwork) {
      continue;
    }
    if (yearArtwork.mode === 'grayscale') {
      hasGrayscale = true;
    }
    patterns[String(yr)] = {
      type: yr === currentYear ? 'rolling' : 'calendar',
      matrix: yearArtwork.matrix
    };
  }

  const primaryMatrix = patterns[String(sortedYears[0])]?.matrix || fallbackMatrix;

  return {
    authorName: user.login,
    authorEmail: user.noreply_email,
    mode: hasGrayscale ? 'grayscale' : 'bicolor',
    matrix: primaryMatrix,
    years: sortedYears,
    patterns,
    flattenBackground,
    updatedAt: new Date().toISOString()
  };
}

export function buildUnstampArtPayload(user: UserProfile, currentYear: number): ArtConfig {
  const emptyMatrix: ContributionLevel[][] = Array.from({ length: 7 }, () => [0]);
  return {
    authorName: user.login,
    authorEmail: user.noreply_email,
    mode: 'bicolor',
    matrix: emptyMatrix,
    years: [currentYear],
    patterns: {
      [String(currentYear)]: {
        type: 'rolling',
        matrix: emptyMatrix
      }
    },
    flattenBackground: false,
    updatedAt: new Date().toISOString()
  };
}

export async function deployArtworkToGithub(params: {
  token: string;
  user: UserProfile;
  repoName: string;
  artData: ArtConfig;
  webAppUrl: string;
  callbacks: DeployCallbacks;
}): Promise<void> {
  const { token, user, repoName, artData, webAppUrl, callbacks } = params;
  const owner = user.login;

  callbacks.onStep('repo', 'running', `1. Verifying repository @${owner}/${repoName}…`);
  callbacks.onStep('files', 'pending');
  callbacks.onStep('dispatch', 'pending');

  let repo = await checkRepoExists(token, owner, repoName);
  if (!repo) {
    callbacks.onStep('repo', 'running', `1. Creating public repository @${owner}/${repoName}…`);
    repo = await createPublicRepo(token, repoName);
  }
  callbacks.onStep('repo', 'success', `1. Repository @${owner}/${repoName} ready`);

  callbacks.onStep('files', 'running', '2. Committing engine files (art.json, render.mjs, workflow, README)…');

  const readmeContent = generateReadme(artData.matrix, owner, webAppUrl, artData.years);

  const artSha = (await getFile(token, owner, repoName, 'art.json'))?.sha;
  await putFile(
    token,
    owner,
    repoName,
    'art.json',
    JSON.stringify(artData, null, 2),
    'feat(gitstamp): configure contribution art',
    artSha
  );

  const mjsSha = (await getFile(token, owner, repoName, 'scripts/render.mjs'))?.sha;
  await putFile(
    token,
    owner,
    repoName,
    'scripts/render.mjs',
    RENDER_MJS_TEMPLATE,
    'feat(gitstamp): install automation engine',
    mjsSha
  );

  const ymlSha = (await getFile(token, owner, repoName, '.github/workflows/render.yml'))?.sha;
  await putFile(
    token,
    owner,
    repoName,
    '.github/workflows/render.yml',
    RENDER_YML_TEMPLATE,
    'feat(gitstamp): setup weekly self-centering workflow',
    ymlSha
  );

  const readmeSha = (await getFile(token, owner, repoName, 'README.md'))?.sha;
  await putFile(
    token,
    owner,
    repoName,
    'README.md',
    readmeContent,
    'docs(gitstamp): update artwork documentation',
    readmeSha
  );

  callbacks.onStep('files', 'success', '2. Engine files committed');

  callbacks.onStep('dispatch', 'running', '3. Dispatching render workflow…');
  await starRepo(token, 'kbtale', 'gitstamp');
  await triggerWorkflow(token, owner, repoName, 'render.yml', repo.default_branch);
  callbacks.onStep('dispatch', 'success', '3. Workflow dispatched. Profile graph updating.');
}

export async function unstampArtworkFromGithub(params: {
  token: string;
  user: UserProfile;
  repoName: string;
  currentYear: number;
  webAppUrl: string;
  callbacks: DeployCallbacks;
}): Promise<void> {
  const { token, user, repoName, currentYear, webAppUrl, callbacks } = params;
  const owner = user.login;

  callbacks.onStep('repo', 'running', `1. Checking @${owner}/${repoName}…`);
  callbacks.onStep('files', 'pending');
  callbacks.onStep('dispatch', 'pending');

  const repo = await checkRepoExists(token, owner, repoName);
  if (!repo) {
    throw new Error(`Repository @${owner}/${repoName} does not exist yet`);
  }
  callbacks.onStep('repo', 'success', `1. Connected to @${owner}/${repoName}`);

  callbacks.onStep('files', 'running', '2. Writing clean empty art.json…');
  const emptyArt = buildUnstampArtPayload(user, currentYear);

  const artSha = (await getFile(token, owner, repoName, 'art.json'))?.sha;
  await putFile(
    token,
    owner,
    repoName,
    'art.json',
    JSON.stringify(emptyArt, null, 2),
    'chore(gitstamp): clear contribution artwork',
    artSha
  );

  const mjsSha = (await getFile(token, owner, repoName, 'scripts/render.mjs'))?.sha;
  await putFile(
    token,
    owner,
    repoName,
    'scripts/render.mjs',
    RENDER_MJS_TEMPLATE,
    'chore(gitstamp): sync renderer engine',
    mjsSha
  );

  const readmeSha = (await getFile(token, owner, repoName, 'README.md'))?.sha;
  await putFile(
    token,
    owner,
    repoName,
    'README.md',
    generateReadme(emptyArt.matrix, owner, webAppUrl, [currentYear]),
    'docs(gitstamp): clear artwork preview',
    readmeSha
  );

  callbacks.onStep('files', 'success', '2. Artwork cleared in repository');

  callbacks.onStep('dispatch', 'running', '3. Triggering clean orphan sync…');
  await triggerWorkflow(token, owner, repoName, 'render.yml', repo.default_branch);
  callbacks.onStep('dispatch', 'success', '3. Unstamp workflow dispatched. Stamped commits will clear shortly.');
}
