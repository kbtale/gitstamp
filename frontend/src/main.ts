import './styles/main.css';
import { ArtworkItem, ContributionLevel, ProcessingMode, AppTheme, UserProfile } from './types';
import { MatrixStore } from './modules/matrix-state';
import { loadImageFromFile, processImageToMatrix } from './modules/image-processor';
import {
  initiatePkceLogin,
  handlePkceCallback,
  fetchUserProfile,
  getStoredToken,
  getStoredUser,
  clearAuth
} from './modules/auth-pkce';
import {
  checkRepoExists,
  createPublicRepo,
  getFile,
  putFile,
  triggerWorkflow,
  fetchExistingArt,
  starRepo,
  fetchUserContributions
} from './modules/github-api';
import {
  RENDER_MJS_TEMPLATE,
  RENDER_YML_TEMPLATE,
  generateReadme
} from './modules/templates';
import {
  createSegmentedControl,
  createSlider,
  createToggleSwitch,
  createBrushPalette
} from './modules/ui-components';

const DEFAULT_CLIENT_ID = (import.meta as any).env?.VITE_GITHUB_APP_CLIENT_ID || 'Iv23liETnS8etdqB3qHt';
const DEFAULT_APP_SLUG = (import.meta as any).env?.VITE_GITHUB_APP_SLUG || 'gitstamp';

let activeClientId: string = DEFAULT_CLIENT_ID;
let activeAppSlug: string = DEFAULT_APP_SLUG;

let currentUser: UserProfile | null = getStoredUser();
let currentTheme: AppTheme = 'dark';
let currentViewMode: 'profile' | 'editor' = 'profile';
let highlightBounds: boolean = true;
let userProfileCalendar: ContributionLevel[][] | null = null;
let userTotalContributions: number | null = null;
let showProfileContributions: boolean = true;
let flattenBackground: boolean = true;
let isSyncingMatrix: boolean = false;

const matrixStore = new MatrixStore(24);

const authStatusContainer = document.getElementById('auth-status-container') as HTMLElement;
const btnOpenAuth = document.getElementById('btn-open-auth') as HTMLButtonElement;

const btnAddArtwork = document.getElementById('btn-add-artwork') as HTMLButtonElement;
const artworkItemsList = document.getElementById('artwork-items-list') as HTMLElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
let pendingUploadArtworkId: string | null = null;

const modeContainer = document.getElementById('mode-control-container') as HTMLElement;
const thresholdContainer = document.getElementById('threshold-control-container') as HTMLElement;
const invertContainer = document.getElementById('invert-control-container') as HTMLElement;
const widthContainer = document.getElementById('width-control-container') as HTMLElement;
const viewModeContainer = document.getElementById('view-mode-container') as HTMLElement;
const btnThemeToggle = document.getElementById('btn-theme-toggle') as HTMLButtonElement;
const btnContributionSettings = document.getElementById('btn-contribution-settings') as HTMLButtonElement;
const settingsDropdownMenu = document.getElementById('settings-dropdown-menu') as HTMLElement;
const settingHighlightBounds = document.getElementById('setting-highlight-bounds') as HTMLInputElement;
const settingProfileContributions = document.getElementById('setting-profile-contributions') as HTMLInputElement;
const settingFlattenBackground = document.getElementById('setting-flatten-background') as HTMLInputElement;
const settingBtnResetArt = document.getElementById('setting-btn-reset-art') as HTMLButtonElement;
const targetRepoLink = document.getElementById('target-repo-link') as HTMLAnchorElement;
const dayLabelsCol = document.getElementById('day-labels-col') as HTMLElement;

const brushContainer = document.getElementById('brush-palette-container') as HTMLElement;
const btnClearGrid = document.getElementById('btn-clear-grid') as HTMLButtonElement;
const btnInvertGrid = document.getElementById('btn-invert-grid') as HTMLButtonElement;
const btnUndoGrid = document.getElementById('btn-undo-grid') as HTMLButtonElement;
const btnRedoGrid = document.getElementById('btn-redo-grid') as HTMLButtonElement;

const graphPreviewContainer = document.getElementById('graph-preview-container') as HTMLElement;
const monthLabelsRow = document.getElementById('month-labels-row') as HTMLElement;
const contributionMatrix = document.getElementById('contribution-matrix') as HTMLElement;
const graphDimensionsDisplay = document.getElementById('graph-dimensions-display') as HTMLElement;
const profileTotalCommits = document.getElementById('profile-total-commits') as HTMLElement;
const yearSelectorContainer = document.getElementById('year-selector-container') as HTMLElement;
const deployPlanContainer = document.getElementById('deploy-plan-container') as HTMLElement;

const repoNameInput = document.getElementById('repo-name-input') as HTMLInputElement;
const repoStatusBadge = document.getElementById('repo-status-badge') as HTMLElement;
const btnDeploy = document.getElementById('btn-deploy') as HTMLButtonElement;
const deployStepsContainer = document.getElementById('deploy-steps-container') as HTMLElement;
const stepRepo = document.getElementById('step-repo') as HTMLElement;
const stepFiles = document.getElementById('step-files') as HTMLElement;
const stepDispatch = document.getElementById('step-dispatch') as HTMLElement;

const currentYear = new Date().getFullYear();
let availableYears: number[] = [
  currentYear,
  currentYear - 1,
  currentYear - 2,
  currentYear - 3,
  currentYear - 4
];
let activePreviewYear: number = currentYear;
let artworkCounter = 1;
const yearContributionsCache: Map<number, { matrix: ContributionLevel[][]; totalContributions: number }> = new Map();

function createEmptyMatrix(width: number = 24): ContributionLevel[][] {
  return Array.from({ length: 7 }, () => new Array<ContributionLevel>(width).fill(0));
}

function cloneMatrix(matrix: ContributionLevel[][]): ContributionLevel[][] {
  return matrix.map((row) => [...row]);
}

function createArtworkItem(
  years: number[] = [],
  name?: string,
  matrix?: ContributionLevel[][]
): ArtworkItem {
  const index = artworkCounter++;
  const mat = matrix ? cloneMatrix(matrix) : createEmptyMatrix(24);
  return {
    id: `art-${Date.now()}-${index}`,
    name: name || `Artwork ${index}`,
    image: null,
    imageThumbUrl: null,
    imageFilename: null,
    imageDims: null,
    mode: 'auto',
    threshold: 128,
    isUserManualThreshold: false,
    invert: false,
    width: mat[0]?.length || 24,
    matrix: mat,
    years: new Set(years)
  };
}

let artworkItems: ArtworkItem[] = [createArtworkItem([currentYear])];
let activeArtworkId: string = artworkItems[0].id;

function setAvailableYears(userYears?: number[]) {
  const yearsSet = new Set<number>();
  yearsSet.add(currentYear);

  if (Array.isArray(userYears) && userYears.length > 0) {
    for (const yr of userYears) {
      if (Number.isFinite(yr)) {
        yearsSet.add(yr);
      }
    }
  } else {
    for (let i = 1; i <= 4; i++) {
      yearsSet.add(currentYear - i);
    }
  }

  if (typeof artworkItems !== 'undefined') {
    for (const item of artworkItems) {
      for (const yr of item.years) {
        yearsSet.add(yr);
      }
    }
  }

  availableYears = Array.from(yearsSet).sort((a, b) => b - a);
  if (!availableYears.includes(activePreviewYear)) {
    activePreviewYear = availableYears[0];
  }
  renderArtworkItemsList();
  renderYearSelector();
  renderDeployPlan();
}

function hasArtworkContent(item: ArtworkItem): boolean {
  if (item.image) {
    return true;
  }
  return item.matrix.some((row) => row.some((lvl) => lvl > 0));
}

function updateAddArtworkButtonVisibility() {
  if (!btnAddArtwork) {
    return;
  }
  const shouldShow = artworkItems.length > 1 || (artworkItems.length === 1 && hasArtworkContent(artworkItems[0]));
  btnAddArtwork.style.display = shouldShow ? 'flex' : 'none';
}

function getActiveArtwork(): ArtworkItem {
  return artworkItems.find((item) => item.id === activeArtworkId) || artworkItems[0];
}

function getArtworkForYear(year: number): ArtworkItem | undefined {
  return artworkItems.find((item) => item.years.has(year));
}

function getAllAssignedYears(): number[] {
  const years = new Set<number>();
  for (const item of artworkItems) {
    for (const yr of item.years) {
      years.add(yr);
    }
  }
  return Array.from(years).sort((a, b) => b - a);
}

const modeControl = createSegmentedControl<ProcessingMode>({
  container: modeContainer,
  options: [
    { label: 'Auto', value: 'auto' },
    { label: 'Bicolor', value: 'bicolor' },
    { label: '5-Level', value: 'grayscale' }
  ],
  initialValue: 'auto',
  onChange: (mode) => {
    const item = getActiveArtwork();
    item.mode = mode;
    if (mode === 'auto') {
      item.isUserManualThreshold = false;
    }
    reprocessCurrentImage();
  }
});

const thresholdSlider = createSlider({
  container: thresholdContainer,
  min: 0,
  max: 255,
  initialValue: 128,
  label: 'Threshold',
  onChange: (val) => {
    const item = getActiveArtwork();
    item.threshold = val;
    item.isUserManualThreshold = true;
    if (item.mode === 'auto') {
      item.mode = 'bicolor';
      modeControl.setValue('bicolor');
    }
    reprocessCurrentImage(undefined, true);
  }
});

const invertToggle = createToggleSwitch({
  container: invertContainer,
  label: 'Invert Colors',
  initialChecked: false,
  onChange: (checked) => {
    const item = getActiveArtwork();
    item.invert = checked;
    reprocessCurrentImage();
  }
});

const widthSlider = createSlider({
  container: widthContainer,
  min: 7,
  max: 44,
  initialValue: 24,
  label: 'Columns Width',
  onChange: (cols) => {
    const item = getActiveArtwork();
    item.width = cols;
    matrixStore.setWidth(cols);
    if (item.image) {
      reprocessCurrentImage(cols);
    }
    renderDeployPlan();
  }
});

const UPLOAD_ICON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>';

function triggerUploadForArtwork(id: string) {
  pendingUploadArtworkId = id;
  fileInput.value = '';
  fileInput.click();
}

function clearArtworkImage(id: string) {
  const item = artworkItems.find((a) => a.id === id);
  if (!item) {
    return;
  }
  if (item.imageThumbUrl) {
    URL.revokeObjectURL(item.imageThumbUrl);
  }
  item.image = null;
  item.imageThumbUrl = null;
  item.imageFilename = null;
  item.imageDims = null;
  const idx = artworkItems.indexOf(item) + 1;
  item.name = `Artwork ${idx}`;
  item.matrix = createEmptyMatrix(item.width);
  if (item.id === activeArtworkId) {
    isSyncingMatrix = true;
    matrixStore.setMatrix(item.matrix);
    isSyncingMatrix = false;
  }
  syncSidebarToActiveArtwork();
  renderArtworkItemsList();
  renderYearSelector();
  renderDeployPlan();
  renderCurrentView(matrixStore.getMatrix());
}

function syncSidebarToActiveArtwork() {
  const item = getActiveArtwork();
  modeControl.setValue(item.mode);
  thresholdSlider.setValue(item.threshold);
  invertToggle.setChecked(item.invert);
  widthSlider.setValue(item.width);
}

function renderArtworkItemsList() {
  if (!artworkItemsList) {
    return;
  }
  artworkItemsList.innerHTML = '';

  for (const item of artworkItems) {
    const card = document.createElement('div');
    card.className = `artwork-item-card ${item.id === activeArtworkId ? 'active' : ''}`.trim();

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('dragover');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('dragover');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('dragover');
      const file = e.dataTransfer?.files[0];
      if (file) {
        handleFileUpload(file, item.id);
      }
    });

    const topRow = document.createElement('div');
    topRow.className = 'artwork-card-top';

    const thumbBtn = document.createElement('button');
    thumbBtn.type = 'button';
    thumbBtn.className = `artwork-item-thumb ${item.imageThumbUrl ? '' : 'empty'}`.trim();
    thumbBtn.title = item.image ? `Replace image for ${item.name}` : `Upload image for ${item.name}`;
    if (item.imageThumbUrl) {
      const img = document.createElement('img');
      img.src = item.imageThumbUrl;
      img.alt = item.name;
      thumbBtn.appendChild(img);
    } else {
      thumbBtn.innerHTML = UPLOAD_ICON_SVG;
    }
    thumbBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerUploadForArtwork(item.id);
    });

    const info = document.createElement('div');
    info.className = 'artwork-item-info';

    const nameEl = document.createElement('div');
    nameEl.className = `artwork-item-name ${item.image ? '' : 'is-prompt'}`.trim();
    nameEl.textContent = item.image ? item.name : 'Click or drop image';

    const subEl = document.createElement('div');
    subEl.className = 'artwork-item-sub';
    subEl.textContent = item.image ? (item.imageDims || `${item.width} cols`) : 'PNG, JPG, SVG, WEBP';

    if (!item.image) {
      info.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerUploadForArtwork(item.id);
      });
    }

    info.appendChild(nameEl);
    info.appendChild(subEl);

    const actions = document.createElement('div');
    actions.className = 'artwork-card-actions';

    if (item.image) {
      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'btn-artwork-action';
      uploadBtn.title = `Replace image`;
      uploadBtn.innerHTML = UPLOAD_ICON_SVG;
      uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerUploadForArtwork(item.id);
      });
      actions.appendChild(uploadBtn);
    }

    if (artworkItems.length > 1) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-artwork-action danger';
      deleteBtn.title = `Remove ${item.name}`;
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteArtworkItem(item.id);
      });
      actions.appendChild(deleteBtn);
    } else if (item.image) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'btn-artwork-action danger';
      clearBtn.title = 'Remove image';
      clearBtn.textContent = '✕';
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearArtworkImage(item.id);
      });
      actions.appendChild(clearBtn);
    }

    topRow.appendChild(thumbBtn);
    topRow.appendChild(info);
    topRow.appendChild(actions);

    const yearsRow = document.createElement('div');
    yearsRow.className = 'artwork-card-years';

    for (const yr of availableYears) {
      const owner = getArtworkForYear(yr);
      const isOwnedByThis = item.years.has(yr);
      const isOwnedElsewhere = Boolean(owner && owner.id !== item.id);

      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `artwork-year-pill ${isOwnedByThis ? 'selected' : ''} ${isOwnedElsewhere ? 'assigned-elsewhere' : ''}`.trim();
      pill.textContent = String(yr);
      if (isOwnedElsewhere && owner) {
        pill.title = `Assigned to ${owner.name} — click to move ${yr} here`;
      } else {
        pill.title = yr === currentYear ? `${yr} (Rolling year)` : `${yr} calendar year`;
      }

      pill.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isOwnedByThis) {
          item.years.delete(yr);
          renderArtworkItemsList();
          renderYearSelector();
          renderDeployPlan();
          renderCurrentView(matrixStore.getMatrix());
        } else {
          for (const other of artworkItems) {
            if (other.id !== item.id) {
              other.years.delete(yr);
            }
          }
          item.years.add(yr);
          activePreviewYear = yr;
          if (item.id !== activeArtworkId) {
            await selectArtworkItem(item.id, false);
          } else {
            renderArtworkItemsList();
            renderYearSelector();
            renderDeployPlan();
            await loadUserContributions(activePreviewYear);
            renderCurrentView(matrixStore.getMatrix());
          }
        }
      });

      yearsRow.appendChild(pill);
    }

    card.appendChild(topRow);
    card.appendChild(yearsRow);

    card.addEventListener('click', () => {
      if (item.id !== activeArtworkId) {
        selectArtworkItem(item.id, true);
      }
    });

    artworkItemsList.appendChild(card);
  }
  updateAddArtworkButtonVisibility();
}

function renderYearSelector() {
  if (!yearSelectorContainer) {
    return;
  }
  yearSelectorContainer.innerHTML = '';
  for (const yr of availableYears) {
    const owner = getArtworkForYear(yr);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `year-pill ${yr === activePreviewYear ? 'active' : ''} ${owner ? 'target-enabled' : ''}`.trim();
    btn.textContent = String(yr);
    btn.title = owner
      ? `${yr} — ${owner.name}`
      : `${yr} — no artwork assigned`;
    btn.addEventListener('click', async () => {
      if (yr === activePreviewYear) {
        return;
      }
      activePreviewYear = yr;
      const yearOwner = getArtworkForYear(yr);
      if (yearOwner && yearOwner.id !== activeArtworkId) {
        await selectArtworkItem(yearOwner.id, false);
        return;
      }
      renderYearSelector();
      await loadUserContributions(activePreviewYear);
      renderCurrentView(matrixStore.getMatrix());
    });
    yearSelectorContainer.appendChild(btn);
  }
}

function renderDeployPlan() {
  if (!deployPlanContainer) {
    return;
  }
  deployPlanContainer.innerHTML = '';
  const assignedYears = getAllAssignedYears();

  if (assignedYears.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'deploy-plan-empty';
    empty.textContent = 'No years assigned yet — select at least one year on an artwork above.';
    deployPlanContainer.appendChild(empty);
    btnDeploy.disabled = true;
    return;
  }

  btnDeploy.disabled = false;

  for (const yr of assignedYears) {
    const owner = getArtworkForYear(yr);
    if (!owner) {
      continue;
    }
    const row = document.createElement('div');
    row.className = 'deploy-plan-row';
    row.title = `Click to preview ${yr} (${owner.name})`;

    const yearEl = document.createElement('span');
    yearEl.className = 'deploy-plan-year';
    yearEl.textContent = yr === currentYear ? `${yr} (Rolling)` : String(yr);

    const artEl = document.createElement('span');
    artEl.className = 'deploy-plan-artwork';
    artEl.textContent = owner.name;

    const dimsEl = document.createElement('span');
    dimsEl.className = 'deploy-plan-dims';
    dimsEl.textContent = `7 × ${owner.matrix[0]?.length || 0}`;

    row.appendChild(yearEl);
    row.appendChild(artEl);
    row.appendChild(dimsEl);

    row.addEventListener('click', async () => {
      activePreviewYear = yr;
      await selectArtworkItem(owner.id, false);
    });

    deployPlanContainer.appendChild(row);
  }
}

async function selectArtworkItem(id: string, syncPreviewYear: boolean = true) {
  const prev = getActiveArtwork();
  if (prev) {
    prev.matrix = matrixStore.getMatrix();
    prev.width = prev.matrix[0]?.length || prev.width;
  }

  activeArtworkId = id;
  const next = getActiveArtwork();

  if (syncPreviewYear && next.years.size > 0 && !next.years.has(activePreviewYear)) {
    const sorted = Array.from(next.years).sort((a, b) => b - a);
    activePreviewYear = sorted[0];
  }

  isSyncingMatrix = true;
  matrixStore.setMatrix(next.matrix);
  isSyncingMatrix = false;

  syncSidebarToActiveArtwork();
  renderArtworkItemsList();
  renderYearSelector();
  renderDeployPlan();
  await loadUserContributions(activePreviewYear);
  renderCurrentView(matrixStore.getMatrix());
}

async function deleteArtworkItem(id: string) {
  if (artworkItems.length <= 1) {
    return;
  }
  const index = artworkItems.findIndex((item) => item.id === id);
  if (index === -1) {
    return;
  }
  const removed = artworkItems[index];
  if (removed.imageThumbUrl) {
    URL.revokeObjectURL(removed.imageThumbUrl);
  }
  artworkItems.splice(index, 1);

  if (activeArtworkId === id) {
    const fallback = artworkItems[Math.max(0, index - 1)];
    await selectArtworkItem(fallback.id, true);
  } else {
    renderArtworkItemsList();
    renderYearSelector();
    renderDeployPlan();
    renderCurrentView(matrixStore.getMatrix());
  }
}

btnAddArtwork.addEventListener('click', async () => {
  const unassignedYear = availableYears.find((yr) => !getArtworkForYear(yr));
  const newItem = createArtworkItem(unassignedYear !== undefined ? [unassignedYear] : []);
  artworkItems.push(newItem);
  await selectArtworkItem(newItem.id, true);
});

btnThemeToggle.addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  graphPreviewContainer.setAttribute('data-graph-theme', currentTheme);
  btnThemeToggle.classList.toggle('is-light', currentTheme === 'light');
});

createSegmentedControl<'profile' | 'editor'>({
  container: viewModeContainer,
  options: [
    { label: '53-Week Profile', value: 'profile' },
    { label: '7×N Canvas', value: 'editor' }
  ],
  initialValue: currentViewMode,
  onChange: (view) => {
    currentViewMode = view;
    renderCurrentView(matrixStore.getMatrix());
  }
});

createBrushPalette({
  container: brushContainer,
  initialBrush: 4,
  onChange: (brush) => {
    matrixStore.setActiveBrush(brush);
  }
});

function renderMonthLabels(year: number = activePreviewYear) {
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

function reprocessCurrentImage(customWidth?: number, isManualThresholdChange?: boolean) {
  const item = getActiveArtwork();
  if (!item.image) {
    return;
  }
  const result = processImageToMatrix(item.image, {
    mode: item.mode,
    threshold: item.isUserManualThreshold ? item.threshold : undefined,
    invert: item.invert,
    customWidth: customWidth || item.width
  });

  item.matrix = cloneMatrix(result.matrix);
  item.width = result.matrix[0]?.length || item.width;
  matrixStore.setMatrix(result.matrix);
  if (!item.isUserManualThreshold && !isManualThresholdChange) {
    item.threshold = result.calculatedThreshold;
    thresholdSlider.setValue(result.calculatedThreshold);
  }
  renderDeployPlan();
}

function updateHistoryButtons() {
  btnUndoGrid.disabled = !matrixStore.canUndo();
  btnRedoGrid.disabled = !matrixStore.canRedo();
}

function renderCurrentView(matrix: ContributionLevel[][]) {
  const activeItem = getActiveArtwork();
  const previewOwner = getArtworkForYear(activePreviewYear);
  const displayMatrix = currentViewMode === 'profile'
    ? (previewOwner ? (previewOwner.id === activeItem.id ? matrix : previewOwner.matrix) : matrix)
    : matrix;
  const artHeight = 7;
  const artWidth = displayMatrix[0]?.length || 0;
  const startCol = Math.floor((53 - artWidth) / 2);
  const commitsLabel = activePreviewYear === currentYear
    ? 'contributions in the last year'
    : `contributions in ${activePreviewYear}`;

  contributionMatrix.innerHTML = '';

  let totalCommits = 0;
  const weightMap: Record<ContributionLevel, number> = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 5
  };

  if (currentViewMode === 'profile') {
    const isYearAssigned = Boolean(previewOwner);
    const canPaintDirectly = Boolean(previewOwner && previewOwner.id === activeItem.id);

    graphPreviewContainer.classList.remove('editor-mode-wrapper');
    graphPreviewContainer.classList.toggle('highlight-bounds', highlightBounds && isYearAssigned);
    dayLabelsCol.innerHTML = '<span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>';
    monthLabelsRow.style.display = 'grid';
    renderMonthLabels(activePreviewYear);
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
        const isArtCell = isArtworkCol;
        const level = Math.max(artLevel, bgLevel) as ContributionLevel;
        totalCommits += weightMap[level] || 0;

        const cell = document.createElement('div');
        cell.className = `cell cell-level-${level} ${isArtCell ? 'cell-in-artwork' : ''}`;
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.setAttribute('role', 'gridcell');

        if (isArtCell && canPaintDirectly) {
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
        } else if (isArtCell && previewOwner) {
          cell.title = rawBgLevel > 0
            ? `${previewOwner.name} [Row ${r + 1}, Col ${artCol + 1}]: Art L${artLevel} · Profile L${rawBgLevel}`
            : `${previewOwner.name} [Row ${r + 1}, Col ${artCol + 1}]: Level ${artLevel}`;
        } else {
          cell.title = rawBgLevel > 0 ? `Profile Activity: Level ${rawBgLevel}` : `Profile Background [Col ${c + 1}]`;
        }

        contributionMatrix.appendChild(cell);
      }
    }

    if (previewOwner) {
      graphDimensionsDisplay.textContent = `${previewOwner.name}: 7 × ${artWidth} (${activePreviewYear} Profile)`;
    } else {
      graphDimensionsDisplay.textContent = `Year ${activePreviewYear} — No artwork assigned`;
    }

    if (userTotalContributions !== null && showProfileContributions) {
      profileTotalCommits.textContent = `${userTotalContributions.toLocaleString()} ${commitsLabel}`;
    } else {
      profileTotalCommits.textContent = `${totalCommits.toLocaleString()} ${commitsLabel}`;
    }
  } else {
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
        totalCommits += weightMap[level] || 0;

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

        contributionMatrix.appendChild(cell);
      }
    }

    graphDimensionsDisplay.textContent = `Editor (${activeItem.name}): 7 × ${artWidth} (${7 * artWidth} cells)`;
    profileTotalCommits.textContent = `${totalCommits.toLocaleString()} ${commitsLabel}`;
  }

  updateHistoryButtons();
}

matrixStore.subscribe((matrix) => {
  if (!isSyncingMatrix) {
    const item = getActiveArtwork();
    item.matrix = cloneMatrix(matrix);
    item.width = matrix[0]?.length || item.width;
    updateAddArtworkButtonVisibility();
    renderDeployPlan();
  }
  renderCurrentView(matrix);
});

syncSidebarToActiveArtwork();
renderArtworkItemsList();
renderYearSelector();
renderDeployPlan();

window.addEventListener('pointerup', () => {
  matrixStore.handlePointerUp();
});

btnClearGrid.addEventListener('click', () => matrixStore.clear());
btnInvertGrid.addEventListener('click', () => matrixStore.invert());
btnUndoGrid.addEventListener('click', () => matrixStore.undo());
btnRedoGrid.addEventListener('click', () => matrixStore.redo());

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  const targetId = pendingUploadArtworkId || activeArtworkId;
  pendingUploadArtworkId = null;
  if (file) {
    handleFileUpload(file, targetId);
  }
});

async function handleFileUpload(file: File, targetId: string = activeArtworkId) {
  try {
    const img = await loadImageFromFile(file);
    const targetItem = artworkItems.find((a) => a.id === targetId) || getActiveArtwork();

    if (targetItem.id !== activeArtworkId) {
      const prev = getActiveArtwork();
      prev.matrix = matrixStore.getMatrix();
      prev.width = prev.matrix[0]?.length || prev.width;
      activeArtworkId = targetItem.id;
      if (targetItem.years.size > 0 && !targetItem.years.has(activePreviewYear)) {
        const sorted = Array.from(targetItem.years).sort((a, b) => b - a);
        activePreviewYear = sorted[0];
      }
    }

    if (targetItem.imageThumbUrl) {
      URL.revokeObjectURL(targetItem.imageThumbUrl);
    }

    targetItem.image = img;
    targetItem.imageThumbUrl = URL.createObjectURL(file);
    targetItem.imageFilename = file.name;
    targetItem.imageDims = `${img.naturalWidth} × ${img.naturalHeight} px · ${Math.round(file.size / 1024)} KB`;
    targetItem.name = file.name;

    const result = processImageToMatrix(img, {
      mode: targetItem.mode,
      threshold: undefined,
      invert: targetItem.invert,
      autoDetectInvert: true
    });

    targetItem.width = result.width;
    targetItem.isUserManualThreshold = false;
    targetItem.threshold = result.calculatedThreshold;
    thresholdSlider.setValue(result.calculatedThreshold);

    if (result.suggestedInvert !== undefined) {
      targetItem.invert = result.suggestedInvert;
      invertToggle.setChecked(result.suggestedInvert);
    }

    if (targetItem.mode === 'auto') {
      targetItem.mode = result.detectedMode;
      modeControl.setValue(result.detectedMode);
    }
    targetItem.matrix = cloneMatrix(result.matrix);

    isSyncingMatrix = true;
    matrixStore.setMatrix(result.matrix);
    isSyncingMatrix = false;

    syncSidebarToActiveArtwork();
    renderArtworkItemsList();
    renderYearSelector();
    renderDeployPlan();
    await loadUserContributions(activePreviewYear);
    renderCurrentView(matrixStore.getMatrix());
  } catch (err: any) {
    alert(`Error loading image: ${err.message || err}`);
  }
}

btnContributionSettings.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = settingsDropdownMenu.style.display === 'flex';
  settingsDropdownMenu.style.display = isOpen ? 'none' : 'flex';
  btnContributionSettings.setAttribute('aria-expanded', String(!isOpen));
});

document.addEventListener('click', (e) => {
  if (!settingsDropdownMenu.contains(e.target as Node) && e.target !== btnContributionSettings) {
    settingsDropdownMenu.style.display = 'none';
    btnContributionSettings.setAttribute('aria-expanded', 'false');
  }
});

settingHighlightBounds.addEventListener('change', () => {
  highlightBounds = settingHighlightBounds.checked;
  renderCurrentView(matrixStore.getMatrix());
});

if (settingProfileContributions) {
  settingProfileContributions.addEventListener('change', () => {
    showProfileContributions = settingProfileContributions.checked;
    renderCurrentView(matrixStore.getMatrix());
  });
}

if (settingFlattenBackground) {
  settingFlattenBackground.addEventListener('change', () => {
    flattenBackground = settingFlattenBackground.checked;
    renderCurrentView(matrixStore.getMatrix());
  });
}

settingBtnResetArt.addEventListener('click', () => {
  matrixStore.clear();
  settingsDropdownMenu.style.display = 'none';
});

function updateTargetRepoLink() {
  const repoName = repoNameInput.value.trim() || 'gitstamp-art';
  const username = currentUser ? currentUser.login : ':username';
  const url = `https://github.com/${username}/${repoName}`;
  targetRepoLink.href = url;
  targetRepoLink.textContent = url;
}
repoNameInput.addEventListener('input', updateTargetRepoLink);

async function loadUserContributions(year: number = activePreviewYear) {
  const token = getStoredToken();
  if (!token) {
    userProfileCalendar = null;
    userTotalContributions = null;
    renderCurrentView(matrixStore.getMatrix());
    return;
  }

  if (yearContributionsCache.has(year)) {
    const cached = yearContributionsCache.get(year)!;
    if (activePreviewYear === year) {
      userProfileCalendar = cached.matrix;
      userTotalContributions = cached.totalContributions;
      renderCurrentView(matrixStore.getMatrix());
    }
    return;
  }

  if (activePreviewYear === year) {
    userProfileCalendar = null;
    userTotalContributions = null;
    renderCurrentView(matrixStore.getMatrix());
  }

  try {
    const data = await fetchUserContributions(token, year === currentYear ? undefined : year);
    if (data) {
      if (Array.isArray(data.years) && data.years.length > 0) {
        setAvailableYears(data.years);
      }
      yearContributionsCache.set(year, data);
      if (activePreviewYear === year) {
        userProfileCalendar = data.matrix;
        userTotalContributions = data.totalContributions;
        renderCurrentView(matrixStore.getMatrix());
      }
    }
  } catch {}
}

function updateAuthDisplay() {
  if (currentUser) {
    btnOpenAuth.style.display = 'none';
    authStatusContainer.innerHTML = `
      <div class="user-profile-badge">
        <img src="${currentUser.avatar_url}" alt="${currentUser.login}" class="user-avatar" />
        <a href="https://github.com/${currentUser.login}" target="_blank" rel="noopener noreferrer" style="color: inherit; font-weight: 500;">@${currentUser.login}</a>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-logout" style="padding: 0.125rem 0.375rem; margin-left: 0.25rem;">Logout</button>
      </div>
    `;
    const btnLogout = document.getElementById('btn-logout');
    btnLogout?.addEventListener('click', () => {
      clearAuth();
      currentUser = null;
      userProfileCalendar = null;
      userTotalContributions = null;
      yearContributionsCache.clear();
      setAvailableYears();
      updateAuthDisplay();
      checkExistingUserRepo();
      updateTargetRepoLink();
      renderCurrentView(matrixStore.getMatrix());
    });
    checkExistingUserRepo();
    updateTargetRepoLink();
    loadUserContributions();
  } else {
    authStatusContainer.innerHTML = '';
    btnOpenAuth.style.display = 'inline-flex';
    repoStatusBadge.textContent = 'Public Repo';
    userProfileCalendar = null;
    userTotalContributions = null;
    yearContributionsCache.clear();
    updateTargetRepoLink();
    renderCurrentView(matrixStore.getMatrix());
  }
}

btnOpenAuth.addEventListener('click', async () => {
  const redirectUri = window.location.origin + window.location.pathname;
  await initiatePkceLogin({
    clientId: activeClientId,
    redirectUri
  });
});

async function checkExistingUserRepo() {
  if (!currentUser) {
    return;
  }
  const token = getStoredToken();
  if (!token) {
    return;
  }

  const repoName = repoNameInput.value.trim() || 'gitstamp-art';
  try {
    const existing = await fetchExistingArt(token, currentUser.login, repoName);
    if (existing) {
      repoStatusBadge.textContent = 'Repo Connected';
      repoStatusBadge.style.backgroundColor = '#1f6feb';
      repoStatusBadge.style.color = '#ffffff';

      const promptLoad = confirm(
        `Found existing GitStamp art in @${currentUser.login}/${repoName}. Would you like to load it into the editor?`
      );
      if (promptLoad) {
        const loadedItems: ArtworkItem[] = [];
        artworkCounter = 1;

        if (existing.config.patterns && Object.keys(existing.config.patterns).length > 0) {
          const groupedByMatrix = new Map<string, { matrix: ContributionLevel[][]; years: number[] }>();
          const yearsList = Array.isArray(existing.config.years) && existing.config.years.length > 0
            ? existing.config.years
            : Object.keys(existing.config.patterns).map(Number);

          for (const yr of yearsList) {
            const cfg = existing.config.patterns[String(yr)];
            if (!cfg || !Array.isArray(cfg.matrix)) {
              continue;
            }
            const key = JSON.stringify(cfg.matrix);
            const entry = groupedByMatrix.get(key);
            if (entry) {
              entry.years.push(yr);
            } else {
              groupedByMatrix.set(key, { matrix: cfg.matrix, years: [yr] });
            }
          }

          for (const entry of groupedByMatrix.values()) {
            const item = createArtworkItem(entry.years, undefined, entry.matrix);
            item.mode = existing.config.mode === 'grayscale' ? 'grayscale' : 'bicolor';
            loadedItems.push(item);
          }
        } else if (existing.config.matrix) {
          const yearsList = Array.isArray(existing.config.years) && existing.config.years.length > 0
            ? existing.config.years
            : [currentYear];
          const item = createArtworkItem(yearsList, undefined, existing.config.matrix);
          item.mode = existing.config.mode === 'grayscale' ? 'grayscale' : 'bicolor';
          loadedItems.push(item);
        }

        if (existing.config.flattenBackground !== undefined) {
          flattenBackground = existing.config.flattenBackground;
          if (settingFlattenBackground) {
            settingFlattenBackground.checked = flattenBackground;
          }
        }

        if (loadedItems.length > 0) {
          for (const old of artworkItems) {
            if (old.imageThumbUrl) {
              URL.revokeObjectURL(old.imageThumbUrl);
            }
          }
          artworkItems = loadedItems;
          await selectArtworkItem(artworkItems[0].id, true);
        }
      }
    } else {
      repoStatusBadge.textContent = 'New Repo';
      repoStatusBadge.style.backgroundColor = 'var(--color-border)';
      repoStatusBadge.style.color = 'var(--color-text-muted)';
    }
  } catch {
    repoStatusBadge.textContent = 'Public Repo';
  }
}

function setStepStatus(stepEl: HTMLElement, status: 'pending' | 'running' | 'success' | 'error', text?: string) {
  stepEl.className = `step-item step-${status}`;
  const icon = stepEl.querySelector('.step-icon') as HTMLElement;
  const label = stepEl.querySelector('.step-label') as HTMLElement;

  if (status === 'pending') icon.textContent = '○';
  if (status === 'running') icon.textContent = '◐';
  if (status === 'success') icon.textContent = '✓';
  if (status === 'error') icon.textContent = '✕';

  if (text) {
    label.textContent = text;
  }
}

btnDeploy.addEventListener('click', async () => {
  const token = getStoredToken();
  if (!currentUser || !token) {
    const redirectUri = window.location.origin + window.location.pathname;
    await initiatePkceLogin({
      clientId: activeClientId,
      redirectUri
    });
    return;
  }

  const activeItem = getActiveArtwork();
  activeItem.matrix = matrixStore.getMatrix();

  const sortedYears = getAllAssignedYears();
  if (sortedYears.length === 0) {
    alert('Please assign at least one year to an artwork before deploying.');
    return;
  }

  const repoName = repoNameInput.value.trim() || 'gitstamp-art';
  const owner = currentUser.login;

  deployStepsContainer.style.display = 'flex';
  btnDeploy.disabled = true;
  btnDeploy.textContent = 'Deploying...';

  setStepStatus(stepRepo, 'running', `1. Verifying repository @${owner}/${repoName}...`);
  setStepStatus(stepFiles, 'pending');
  setStepStatus(stepDispatch, 'pending');

  try {
    let repo = await checkRepoExists(token, owner, repoName);
    if (!repo) {
      setStepStatus(stepRepo, 'running', `1. Creating public repository @${owner}/${repoName}...`);
      repo = await createPublicRepo(token, repoName);
    }
    setStepStatus(stepRepo, 'success', `1. Repository @${owner}/${repoName} ready`);

    setStepStatus(stepFiles, 'running', '2. Committing engine files (art.json, render.mjs, workflow, README)...');

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

    const primaryMatrix = patterns[String(sortedYears[0])]?.matrix || activeItem.matrix;

    const artData = {
      authorName: currentUser.login,
      authorEmail: currentUser.noreply_email,
      mode: hasGrayscale ? 'grayscale' : 'bicolor',
      matrix: primaryMatrix,
      years: sortedYears,
      patterns,
      flattenBackground,
      updatedAt: new Date().toISOString()
    };

    const readmeContent = generateReadme(
      primaryMatrix,
      currentUser.login,
      window.location.href,
      sortedYears
    );

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

    setStepStatus(stepFiles, 'success', '2. Engine files committed successfully');

    setStepStatus(stepDispatch, 'running', '3. Dispatching render workflow for first execution...');
    await starRepo(token, 'kbtale', 'gitstamp');
    await triggerWorkflow(token, owner, repoName, 'render.yml', repo.default_branch);
    setStepStatus(stepDispatch, 'success', '3. Workflow dispatched! History rendering in progress');

    btnDeploy.textContent = 'Deployment Complete!';
    alert(`Success! GitStamp deployed to https://github.com/${owner}/${repoName}. The initial render workflow has been triggered and your logo will appear on your profile shortly!`);
  } catch (err: any) {
    if (err.message && (err.message.includes('integration') || err.message.includes('403') || err.message.includes('Not Found'))) {
      alert(`Deployment failed: ${err.message}. If you have not yet installed the GitStamp GitHub App on your account, please install it at https://github.com/apps/${activeAppSlug}/installations/new`);
    } else {
      alert(`Deployment failed: ${err.message || err}`);
    }
    if (stepRepo.className.includes('running')) {
      setStepStatus(stepRepo, 'error', `1. Repository failed: ${err.message}`);
    } else if (stepFiles.className.includes('running')) {
      setStepStatus(stepFiles, 'error', `2. File sync failed: ${err.message}`);
    } else {
      setStepStatus(stepDispatch, 'error', `3. Workflow dispatch failed: ${err.message}`);
    }
  } finally {
    btnDeploy.disabled = getAllAssignedYears().length === 0;
    btnDeploy.textContent = 'Deploy to My GitHub Profile';
  }
});

async function loadServerConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.clientId) {
        activeClientId = cfg.clientId;
      }
      if (cfg.appSlug) {
        activeAppSlug = cfg.appSlug;
      }
    }
  } catch {}
}

window.addEventListener('gitstamp:auth-expired', () => {
  currentUser = null;
  userProfileCalendar = null;
  userTotalContributions = null;
  yearContributionsCache.clear();
  setAvailableYears();
  updateAuthDisplay();
  renderCurrentView(matrixStore.getMatrix());
});

async function init() {
  await loadServerConfig();

  const urlParams = new URLSearchParams(window.location.search);
  const setupAction = urlParams.get('setup_action');
  if (setupAction === 'install' && !getStoredToken()) {
    const redirectUri = window.location.origin + window.location.pathname;
    await initiatePkceLogin({
      clientId: activeClientId,
      redirectUri
    });
    return;
  }

  const redirectUri = window.location.origin + window.location.pathname;
  try {
    const token = await handlePkceCallback({
      clientId: activeClientId,
      redirectUri
    });
    if (token) {
      currentUser = await fetchUserProfile(token);
    } else {
      const storedToken = getStoredToken();
      if (storedToken) {
        try {
          currentUser = await fetchUserProfile(storedToken);
        } catch {
          clearAuth();
          currentUser = null;
        }
      }
    }
  } catch (err: any) {
    console.error('PKCE callback error:', err);
  }

  updateAuthDisplay();
}

init();
