import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function runGit(args, env = {}, input) {
  const result = spawnSync('git', args, {
    input,
    stdio: input !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${(result.stderr || '').trim() || 'unknown error'}`);
  }
  return result.stdout || '';
}

export function sanitizeGitIdentity(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}`);
  }
  const trimmed = value.trim();
  if (!trimmed || /[\r\n<>]/.test(trimmed)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return trimmed;
}

export function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function fetchContributionCalendar(token, from, to) {
  let query;
  let variables = {};
  if (from && to) {
    query = `
      query($from: DateTime!, $to: DateTime!) {
        viewer {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              weeks {
                contributionDays {
                  date
                  contributionCount
                  contributionLevel
                }
              }
            }
          }
        }
      }
    `;
    variables = { from, to };
  } else {
    query = `
      query {
        viewer {
          contributionsCollection {
            contributionCalendar {
              weeks {
                contributionDays {
                  date
                  contributionCount
                  contributionLevel
                }
              }
            }
          }
        }
      }
    `;
  }

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'GitStamp-Renderer'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GraphQL query failed with status ${res.status}: ${errorText}`);
  }

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data.viewer.contributionsCollection.contributionCalendar;
}

export function determineQuartileThresholds(calendar, flattenBackground = true) {
  const levelMap = {
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4
  };

  const existingMap = new Map();
  const minCounts = {
    1: Infinity,
    2: Infinity,
    3: Infinity,
    4: Infinity
  };
  const activeCounts = [];

  for (const week of calendar.weeks || []) {
    for (const day of week.contributionDays || []) {
      existingMap.set(day.date, day.contributionCount);
      const lvl = levelMap[day.contributionLevel];
      if (day.contributionCount > 0) {
        activeCounts.push(day.contributionCount);
      }
      if (lvl >= 1 && lvl <= 4) {
        if (day.contributionCount < minCounts[lvl]) {
          minCounts[lvl] = day.contributionCount;
        }
      }
    }
  }

  if (flattenBackground) {
    activeCounts.sort((a, b) => a - b);
    let p95 = 0;
    if (activeCounts.length > 0) {
      const idx = Math.min(activeCounts.length - 1, Math.floor(activeCounts.length * 0.95));
      p95 = activeCounts[idx];
    }
    const q = Math.max(12, Math.min(50, p95 + 2));
    return {
      existingMap,
      thresholds: {
        0: 0,
        1: 1,
        2: q,
        3: 2 * q,
        4: 3 * q
      }
    };
  }

  if (!Number.isFinite(minCounts[1])) {
    minCounts[1] = 1;
  }
  if (!Number.isFinite(minCounts[2])) {
    minCounts[2] = Math.max(2, minCounts[1] + 1);
  }
  if (!Number.isFinite(minCounts[3])) {
    minCounts[3] = Math.max(3, minCounts[2] + 1);
  }
  if (!Number.isFinite(minCounts[4])) {
    minCounts[4] = Math.max(5, minCounts[3] + 2);
  }

  minCounts[1] = Math.max(1, minCounts[1]);
  minCounts[2] = Math.max(minCounts[1] + 1, minCounts[2]);
  minCounts[3] = Math.max(minCounts[2] + 1, minCounts[3]);
  minCounts[4] = Math.max(minCounts[3] + 1, minCounts[4]);

  return {
    existingMap,
    thresholds: {
      0: 0,
      1: minCounts[1],
      2: minCounts[2],
      3: minCounts[3],
      4: minCounts[4]
    }
  };
}

export function buildYearCommits({
  year,
  isRolling,
  yearMatrix,
  col0Sunday,
  totalCols,
  existingMap,
  thresholds,
  processedDates
}) {
  const commits = [];
  const matrixWidth = yearMatrix[0]?.length || 0;
  if (matrixWidth === 0 || matrixWidth > totalCols) {
    return commits;
  }

  const startCol = Math.floor((totalCols - matrixWidth) / 2);

  for (let c = 0; c < matrixWidth; c++) {
    const graphCol = startCol + c;
    if (graphCol < 0 || graphCol >= totalCols) {
      continue;
    }

    for (let r = 0; r < 7; r++) {
      const level = yearMatrix[r]?.[c] || 0;
      if (level === 0) {
        continue;
      }

      const dayOffset = graphCol * 7 + r;
      const cellDate = new Date(col0Sunday.getTime() + dayOffset * 86400000);
      if (!isRolling && cellDate.getUTCFullYear() !== year) {
        continue;
      }

      const dateStr = formatDate(cellDate);
      if (processedDates.has(dateStr)) {
        continue;
      }
      processedDates.add(dateStr);

      const desiredCommits = thresholds[level] || level;
      const existingCommits = existingMap.get(dateStr) || 0;
      const commitsToInject = Math.max(0, desiredCommits - existingCommits);

      if (commitsToInject > 0) {
        commits.push({
          dateStr,
          count: commitsToInject
        });
      }
    }
  }

  return commits;
}

export async function main() {
  const artContent = readFileSync('art.json', 'utf8');
  const art = JSON.parse(artContent);

  const { matrix } = art;
  if (!Array.isArray(matrix)) {
    throw new Error('Invalid art.json specification');
  }

  const authorName = sanitizeGitIdentity(art.authorName, 'authorName');
  const authorEmail = sanitizeGitIdentity(art.authorEmail, 'authorEmail');

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentDayOfWeek = now.getUTCDay();
  const currentSunday = new Date(Date.UTC(
    currentYear,
    now.getUTCMonth(),
    now.getUTCDate() - currentDayOfWeek
  ));

  const yearsToProcess = Array.isArray(art.years) && art.years.length > 0 ? art.years : [currentYear];
  const flattenBg = art.flattenBackground !== false;
  const commitsByDate = [];
  const processedDates = new Set();

  for (const yearNum of yearsToProcess) {
    const yr = Number(yearNum);
    if (!Number.isFinite(yr)) {
      continue;
    }

    const yearPattern = art.patterns && art.patterns[String(yr)];
    const yearMatrix = (yearPattern && Array.isArray(yearPattern.matrix)) ? yearPattern.matrix : matrix;
    const isRolling = (yearPattern && yearPattern.type === 'rolling') || (yr === currentYear && (!yearPattern || yearPattern.type === 'rolling'));

    let calendar;
    let col0Sunday;
    let totalCols;

    if (isRolling) {
      calendar = await fetchContributionCalendar(token);
      col0Sunday = new Date(currentSunday.getTime() - 52 * 7 * 86400000);
      totalCols = 53;
    } else {
      const from = `${yr}-01-01T00:00:00Z`;
      const to = `${yr}-12-31T23:59:59Z`;
      calendar = await fetchContributionCalendar(token, from, to);
      const jan1 = new Date(Date.UTC(yr, 0, 1));
      const jan1Day = jan1.getUTCDay();
      col0Sunday = new Date(Date.UTC(yr, 0, 1 - jan1Day));
      const dec31 = new Date(Date.UTC(yr, 11, 31));
      const totalDays = Math.floor((dec31.getTime() - col0Sunday.getTime()) / 86400000) + 1;
      totalCols = Math.ceil(totalDays / 7);
    }

    const { existingMap, thresholds } = determineQuartileThresholds(calendar, flattenBg);
    const yearCommits = buildYearCommits({
      year: yr,
      isRolling,
      yearMatrix,
      col0Sunday,
      totalCols,
      existingMap,
      thresholds,
      processedDates
    });
    commitsByDate.push(...yearCommits);
  }

  commitsByDate.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  runGit(['config', 'user.name', authorName]);
  runGit(['config', 'user.email', authorEmail]);

  runGit(['checkout', '--orphan', 'temp-render']);
  runGit(['reset']);
  runGit(['add', '-A']);
  runGit(['commit', '-m', 'chore(gitstamp): base sync']);

  if (commitsByDate.length > 0) {
    const baseSha = runGit(['rev-parse', 'HEAD']).trim();
    let input = '';
    let markId = 1;

    for (const item of commitsByDate) {
      const unixTimestamp = Math.floor(new Date(`${item.dateStr}T12:00:00Z`).getTime() / 1000);
      const authorHeader = `${authorName} <${authorEmail}> ${unixTimestamp} +0000`;
      for (let i = 0; i < item.count; i++) {
        input += `commit refs/heads/temp-render\nmark :${markId}\nauthor ${authorHeader}\ncommitter ${authorHeader}\ndata 11\nart: render\n`;
        if (markId === 1) {
          input += `from ${baseSha}\n`;
        }
        input += '\n';
        markId++;
      }
    }

    runGit(['fast-import', '--quiet'], {}, input);
    runGit(['reset', '--hard', 'refs/heads/temp-render']);
  }

  runGit(['branch', '-M', 'main']);
  runGit(['push', '-f', 'origin', 'main']);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
