import { ArtworkItem, ContributionLevel } from '../types';
import { MatrixStore } from './matrix-state';

export interface PreviewElements {
  graphPreviewContainer: HTMLElement;
  monthLabelsRow: HTMLElement;
  dayLabelsCol: HTMLElement;
  contributionMatrix: HTMLElement;
  graphDimensionsDisplay: HTMLElement;
  profileTotalCommits: HTMLElement;
}

export interface PreviewRenderParams {
  elements: PreviewElements;
  matrix: ContributionLevel[][];
  matrixStore: MatrixStore;
  activeItem: ArtworkItem;
  previewOwner: ArtworkItem | undefined;
  activePreviewYear: number;
  currentYear: number;
  viewMode: 'profile' | 'editor';
  highlightBounds: boolean;
  showProfileContributions: boolean;
  flattenBackground: boolean;
  userProfileCalendar: ContributionLevel[][] | null;
  userTotalContributions: number | null;
}

const COMMIT_WEIGHTS: Record<ContributionLevel, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 5
};

function renderMonthLabels(monthLabelsRow: HTMLElement, year: number, currentYear: number): void {
  monthLabelsRow.innerHTML = '';
  let col0Sunday: Date;

  if (year === currentYear) {
    const now = new Date();
    const currentDay = now.getUTCDay();
    const currentSunday = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - currentDay
    ));
    col0Sunday = new Date(currentSunday.getTime() - 52 * 7 * 86400000);
  } else {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const jan1Day = jan1.getUTCDay();
    col0Sunday = new Date(Date.UTC(year, 0, 1 - jan1Day));
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let lastMonth = -1;
  let lastPlacedCol = -10;

  for (let c = 0; c < 53; c++) {
    const weekDate = new Date(col0Sunday.getTime() + c * 7 * 86400000);
    const m = weekDate.getUTCMonth();
    if (m !== lastMonth && (c - lastPlacedCol >= 3 || c === 0)) {
      const span = document.createElement('span');
      span.className = 'month-label-item';
      span.style.setProperty('--month-col', String(c + 1));
      span.textContent = months[m];
      monthLabelsRow.appendChild(span);
      lastMonth = m;
      lastPlacedCol = c;
    }
  }
}

export function renderContributionPreview(params: PreviewRenderParams): void {
  const {
    elements,
    matrix,
    matrixStore,
    activeItem,
    previewOwner,
    activePreviewYear,
    currentYear,
    viewMode,
    highlightBounds,
    showProfileContributions,
    flattenBackground,
    userProfileCalendar,
    userTotalContributions
  } = params;

  const {
    graphPreviewContainer,
    monthLabelsRow,
    dayLabelsCol,
    contributionMatrix,
    graphDimensionsDisplay,
    profileTotalCommits
  } = elements;

  const displayMatrix = viewMode === 'profile'
    ? (previewOwner ? (previewOwner.id === activeItem.id ? matrix : previewOwner.matrix) : matrix)
    : matrix;
  const artHeight = 7;
  const artWidth = displayMatrix[0]?.length || 0;
  const startCol = Math.floor((53 - artWidth) / 2);
  const commitsLabel = activePreviewYear === currentYear
    ? 'contributions in the last year'
    : `contributions in ${activePreviewYear}`;

  contributionMatrix.innerHTML = '';
  const fragment = document.createDocumentFragment();
  let totalCommits = 0;

  if (viewMode === 'profile') {
    const isYearAssigned = Boolean(previewOwner);
    const canPaintDirectly = Boolean(previewOwner && previewOwner.id === activeItem.id);

    graphPreviewContainer.classList.remove('editor-mode-wrapper');
    graphPreviewContainer.classList.toggle('highlight-bounds', highlightBounds && isYearAssigned);
    dayLabelsCol.innerHTML = '<span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>';
    monthLabelsRow.style.display = 'grid';
    renderMonthLabels(monthLabelsRow, activePreviewYear, currentYear);
    contributionMatrix.className = 'grid-53';
    contributionMatrix.style.gridTemplateColumns = 'repeat(53, var(--cell-size))';

    for (let c = 0; c < 53; c++) {
      const isArtworkCol = isYearAssigned && c >= startCol && c < startCol + artWidth;
      const artCol = isArtworkCol ? c - startCol : -1;

      for (let r = 0; r < 7; r++) {
        const rawBgLevel: ContributionLevel = (showProfileContributions && userProfileCalendar)
          ? (userProfileCalendar[c]?.[r] || 0)
          : 0;
        const bgLevel: ContributionLevel = (flattenBackground && rawBgLevel > 0)
          ? 1
          : rawBgLevel;
        const artLevel: ContributionLevel = isArtworkCol
          ? (displayMatrix[r][artCol] || 0)
          : 0;
        const level = Math.max(artLevel, bgLevel) as ContributionLevel;
        totalCommits += COMMIT_WEIGHTS[level] || 0;

        const cell = document.createElement('div');
        cell.className = `cell cell-level-${level} ${isArtworkCol ? 'cell-in-artwork' : ''}`;
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.setAttribute('role', 'gridcell');

        if (isArtworkCol && canPaintDirectly) {
          cell.title = rawBgLevel > 0
            ? `${activeItem.name} [Row ${r + 1}, Col ${artCol + 1}]: Art L${artLevel} · Profile L${rawBgLevel}`
            : `${activeItem.name} [Row ${r + 1}, Col ${artCol + 1}]: Level ${artLevel}`;
          cell.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            matrixStore.handlePointerDown(r, artCol);
          });
          cell.addEventListener('pointerenter', () => {
            matrixStore.handlePointerEnter(r, artCol);
          });
        } else if (isArtworkCol && previewOwner) {
          cell.title = rawBgLevel > 0
            ? `${previewOwner.name} [Row ${r + 1}, Col ${artCol + 1}]: Art L${artLevel} · Profile L${rawBgLevel}`
            : `${previewOwner.name} [Row ${r + 1}, Col ${artCol + 1}]: Level ${artLevel}`;
        } else {
          cell.title = rawBgLevel > 0 ? `Profile Activity: Level ${rawBgLevel}` : `Profile Background [Col ${c + 1}]`;
        }

        fragment.appendChild(cell);
      }
    }

    contributionMatrix.appendChild(fragment);

    if (previewOwner) {
      graphDimensionsDisplay.textContent = `${previewOwner.name} · 7 × ${artWidth} (${activePreviewYear})`;
    } else {
      graphDimensionsDisplay.textContent = `${activePreviewYear} · No artwork assigned`;
    }

    if (userTotalContributions !== null && showProfileContributions) {
      profileTotalCommits.textContent = `${userTotalContributions.toLocaleString()} ${commitsLabel}`;
    } else {
      profileTotalCommits.textContent = `${totalCommits.toLocaleString()} ${commitsLabel}`;
    }
    return;
  }

  graphPreviewContainer.classList.add('editor-mode-wrapper');
  graphPreviewContainer.classList.remove('highlight-bounds');
  dayLabelsCol.innerHTML = '<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>';
  monthLabelsRow.style.display = 'flex';
  monthLabelsRow.innerHTML = '';
  for (let c = 0; c < artWidth; c++) {
    const colLabel = document.createElement('div');
    colLabel.className = 'col-number-label';
    colLabel.textContent = (c === 0 || (c + 1) % 5 === 0 || c === artWidth - 1) ? String(c + 1) : '';
    monthLabelsRow.appendChild(colLabel);
  }

  contributionMatrix.className = 'contribution-matrix';
  contributionMatrix.style.gridTemplateColumns = `repeat(${artWidth}, 24px)`;

  for (let c = 0; c < artWidth; c++) {
    for (let r = 0; r < artHeight; r++) {
      const level = displayMatrix[r][c];
      totalCommits += COMMIT_WEIGHTS[level] || 0;

      const cell = document.createElement('div');
      cell.className = `cell editor-cell cell-level-${level}`;
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `Row ${r + 1}, Col ${c + 1}, Level ${level}`);
      cell.title = `Cell [Row ${r + 1}, Col ${c + 1}]: Level ${level}`;

      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        matrixStore.handlePointerDown(r, c);
      });
      cell.addEventListener('pointerenter', () => {
        matrixStore.handlePointerEnter(r, c);
      });

      fragment.appendChild(cell);
    }
  }

  contributionMatrix.appendChild(fragment);
  graphDimensionsDisplay.textContent = `Editor · ${activeItem.name} · 7 × ${artWidth} (${7 * artWidth} cells)`;
  profileTotalCommits.textContent = `${totalCommits.toLocaleString()} ${commitsLabel}`;
}
