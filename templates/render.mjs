import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function run(command, env = {}) {
  return execSync(command, {
    stdio: 'pipe',
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
}

function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchContributionCalendar(token) {
  const query = `
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

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'GitStamp-Renderer'
    },
    body: JSON.stringify({ query })
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

function determineQuartileThresholds(calendar) {
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

  for (const week of calendar.weeks) {
    for (const day of week.contributionDays) {
      existingMap.set(day.date, day.contributionCount);
      const lvl = levelMap[day.contributionLevel];
      if (lvl >= 1 && lvl <= 4) {
        if (day.contributionCount < minCounts[lvl]) {
          minCounts[lvl] = day.contributionCount;
        }
      }
    }
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

async function main() {
  const artContent = readFileSync('art.json', 'utf8');
  const art = JSON.parse(artContent);

  const { authorName, authorEmail, matrix } = art;
  if (!authorName || !authorEmail || !Array.isArray(matrix)) {
    throw new Error('Invalid art.json specification');
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const calendar = await fetchContributionCalendar(token);
  const { existingMap, thresholds } = determineQuartileThresholds(calendar);

  const now = new Date();
  const currentDayOfWeek = now.getUTCDay();
  const currentSunday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - currentDayOfWeek
  ));

  const col0Sunday = new Date(currentSunday.getTime() - 52 * 7 * 86400000);

  const matrixWidth = matrix[0]?.length || 0;
  if (matrixWidth === 0 || matrixWidth > 53) {
    throw new Error(`Invalid matrix width: ${matrixWidth}`);
  }

  const startCol = Math.floor((53 - matrixWidth) / 2);

  const commitsByDate = [];

  for (let c = 0; c < matrixWidth; c++) {
    const graphCol = startCol + c;
    if (graphCol < 0 || graphCol > 52) {
      continue;
    }

    for (let r = 0; r < 7; r++) {
      const level = matrix[r][c] || 0;
      if (level === 0) {
        continue;
      }

      const dayOffset = graphCol * 7 + r;
      const cellDate = new Date(col0Sunday.getTime() + dayOffset * 86400000);
      const dateStr = formatDate(cellDate);

      const desiredCommits = thresholds[level] || level;
      const existingCommits = existingMap.get(dateStr) || 0;
      const commitsToInject = Math.max(0, desiredCommits - existingCommits);

      if (commitsToInject > 0) {
        commitsByDate.push({
          dateStr,
          count: commitsToInject
        });
      }
    }
  }

  run(`git config user.name "${authorName}"`);
  run(`git config user.email "${authorEmail}"`);

  run('git checkout --orphan temp-render');
  run('git reset');
  run('git add -A');
  run('git commit -m "chore(gitstamp): base sync"');

  for (const item of commitsByDate) {
    const isoDate = `${item.dateStr}T12:00:00Z`;
    const env = {
      GIT_AUTHOR_DATE: isoDate,
      GIT_COMMITTER_DATE: isoDate,
      GIT_AUTHOR_NAME: authorName,
      GIT_AUTHOR_EMAIL: authorEmail,
      GIT_COMMITTER_NAME: authorName,
      GIT_COMMITTER_EMAIL: authorEmail
    };

    for (let i = 0; i < item.count; i++) {
      run('git commit --allow-empty -m "art: render"', env);
    }
  }

  run('git branch -M main');
  run('git push -f origin main');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
