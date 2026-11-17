import './styles/main.css';
import { ContributionLevel, ProcessingMode, AppTheme, UserProfile } from './types';
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
let currentImage: HTMLImageElement | null = null;
let currentMode: ProcessingMode = 'auto';
let currentThreshold: number = 128;
let currentInvert: boolean = false;
let currentTheme: AppTheme = 'dark';
let currentViewMode: 'profile' | 'editor' = 'profile';
let highlightBounds: boolean = true;
let userProfileCalendar: ContributionLevel[][] | null = null;
let userTotalContributions: number | null = null;
let showProfileContributions: boolean = true;

const matrixStore = new MatrixStore(24);

const authStatusContainer = document.getElementById('auth-status-container') as HTMLElement;
const btnOpenAuth = document.getElementById('btn-open-auth') as HTMLButtonElement;

const uploadDropzone = document.getElementById('upload-dropzone') as HTMLElement;
const dropzoneEmpty = document.getElementById('dropzone-empty') as HTMLElement;
const dropzoneActive = document.getElementById('dropzone-active') as HTMLElement;
const dropzoneThumb = document.getElementById('dropzone-thumb') as HTMLImageElement;
const dropzoneFilename = document.getElementById('dropzone-filename') as HTMLElement;
const dropzoneDims = document.getElementById('dropzone-dims') as HTMLElement;
const btnClearImage = document.getElementById('btn-clear-image') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

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
const targetYearsContainer = document.getElementById('target-years-container') as HTMLElement;
const syncAllYearsCheckbox = document.getElementById('sync-all-years-checkbox') as HTMLInputElement;

const repoNameInput = document.getElementById('repo-name-input') as HTMLInputElement;
const repoStatusBadge = document.getElementById('repo-status-badge') as HTMLElement;
const btnDeploy = document.getElementById('btn-deploy') as HTMLButtonElement;
const deployStepsContainer = document.getElementById('deploy-steps-container') as HTMLElement;
const stepRepo = document.getElementById('step-repo') as HTMLElement;
const stepFiles = document.getElementById('step-files') as HTMLElement;
const stepDispatch = document.getElementById('step-dispatch') as HTMLElement;

const currentYear = new Date().getFullYear();
const availableYears: number[] = [
  currentYear,
  currentYear - 1,
  currentYear - 2,
  currentYear - 3,
  currentYear - 4
];
let selectedTargetYears: Set<number> = new Set([currentYear]);
let activePreviewYear: number = currentYear;
let syncAllYears: boolean = true;
const yearPatterns: Map<number, ContributionLevel[][]> = new Map();
const yearContributionsCache: Map<number, { matrix: ContributionLevel[][]; totalContributions: number }> = new Map();

function renderYearSelector() {
  if (!yearSelectorContainer) {
    return;
  }
  yearSelectorContainer.innerHTML = '';
  for (const yr of availableYears) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `year-pill ${yr === activePreviewYear ? 'active' : ''}`;
    btn.textContent = String(yr);
    btn.title = yr === currentYear ? `View rolling current year (${yr})` : `View calendar year ${yr}`;
    btn.addEventListener('click', async () => {
      if (yr === activePreviewYear) {
        return;
      }
      if (!syncAllYears) {
        yearPatterns.set(activePreviewYear, JSON.parse(JSON.stringify(matrixStore.getMatrix())));
      }
      activePreviewYear = yr;
      if (!syncAllYears && yearPatterns.has(yr)) {
        matrixStore.setMatrix(yearPatterns.get(yr)!);
      }
      renderYearSelector();
      await loadUserContributions(activePreviewYear);
      renderCurrentView(matrixStore.getMatrix());
    });
    yearSelectorContainer.appendChild(btn);
  }
}

function renderTargetYearsPills() {
  if (!targetYearsContainer) {
    return;
  }
  targetYearsContainer.innerHTML = '';
  for (const yr of availableYears) {
    const isSelected = selectedTargetYears.has(yr);
    const chip = document.createElement('label');
    chip.className = `target-year-chip ${isSelected ? 'selected' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedTargetYears.add(yr);
        if (syncAllYears) {
          yearPatterns.set(yr, JSON.parse(JSON.stringify(matrixStore.getMatrix())));
        }
      } else {
        if (selectedTargetYears.size <= 1) {
          checkbox.checked = true;
          return;
        }
        selectedTargetYears.delete(yr);
      }
      chip.classList.toggle('selected', checkbox.checked);
    });

    const labelSpan = document.createElement('span');
    labelSpan.textContent = yr === currentYear ? `${yr} (Rolling)` : String(yr);

    chip.appendChild(checkbox);
    chip.appendChild(labelSpan);
    targetYearsContainer.appendChild(chip);
  }
}

renderYearSelector();
renderTargetYearsPills();

if (syncAllYearsCheckbox) {
  syncAllYearsCheckbox.addEventListener('change', () => {
    syncAllYears = syncAllYearsCheckbox.checked;
    if (syncAllYears) {
      const currentCanvasMatrix = matrixStore.getMatrix();
      for (const yr of selectedTargetYears) {
        yearPatterns.set(yr, JSON.parse(JSON.stringify(currentCanvasMatrix)));
      }
    }
  });
}

let isUserManualThreshold = false;

const modeControl = createSegmentedControl<ProcessingMode>({
  container: modeContainer,
  options: [
    { label: 'Auto', value: 'auto' },
    { label: 'Bicolor', value: 'bicolor' },
    { label: '5-Level', value: 'grayscale' }
  ],
  initialValue: 'auto',
  onChange: (mode) => {
    currentMode = mode;
    if (mode === 'auto') {
      isUserManualThreshold = false;
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
    currentThreshold = val;
    isUserManualThreshold = true;
    if (currentMode === 'auto') {
      currentMode = 'bicolor';
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
    currentInvert = checked;
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
    matrixStore.setWidth(cols);
    if (currentImage) {
      reprocessCurrentImage(cols);
    }
  }
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
  if (!currentImage) {
    return;
  }
  const result = processImageToMatrix(currentImage, {
    mode: currentMode,
    threshold: currentThreshold,
    invert: currentInvert,
    customWidth: customWidth || matrixStore.getWidth()
  });

  matrixStore.setMatrix(result.matrix);
  if (currentMode === 'auto' && !isUserManualThreshold && !isManualThresholdChange) {
    currentThreshold = result.calculatedThreshold;
    thresholdSlider.setValue(result.calculatedThreshold);
  }
}

function updateHistoryButtons() {
  btnUndoGrid.disabled = !matrixStore.canUndo();
  btnRedoGrid.disabled = !matrixStore.canRedo();
}

function renderCurrentView(matrix: ContributionLevel[][]) {
  const artHeight = 7;
  const artWidth = matrix[0]?.length || 0;
  const startCol = Math.floor((53 - artWidth) / 2);

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
    graphPreviewContainer.classList.remove('editor-mode-wrapper');
    graphPreviewContainer.classList.toggle('highlight-bounds', highlightBounds);
    dayLabelsCol.innerHTML = '<span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>';
    monthLabelsRow.style.display = 'grid';
    renderMonthLabels(activePreviewYear);
    contributionMatrix.className = 'grid-53';
    contributionMatrix.style.gridTemplateColumns = 'repeat(53, var(--cell-size))';

    for (let c = 0; c < 53; c++) {
      const isArtworkCol = c >= startCol && c < startCol + artWidth;
      const artCol = isArtworkCol ? c - startCol : -1;

      for (let r = 0; r < 7; r++) {
        let level: ContributionLevel = 0;
        let isArtCell = false;

        if (isArtworkCol) {
          level = matrix[r][artCol] || 0;
          isArtCell = true;
        } else if (showProfileContributions && userProfileCalendar) {
          level = userProfileCalendar[c]?.[r] || 0;
        }
        totalCommits += weightMap[level] || 0;

        const cell = document.createElement('div');
        cell.className = `cell cell-level-${level} ${isArtCell ? 'cell-in-artwork' : ''}`;
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.setAttribute('role', 'gridcell');

        if (isArtCell) {
          cell.title = `Artwork [Row ${r + 1}, Col ${artCol + 1}]: Level ${level}`;
          cell.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            matrixStore.handlePointerDown(r, artCol);
          });
          cell.addEventListener('pointerenter', () => {
            matrixStore.handlePointerEnter(r, artCol);
          });
        } else {
          const bgLevel = userProfileCalendar ? (userProfileCalendar[c]?.[r] || 0) : 0;
          cell.title = bgLevel > 0 ? `Profile Activity: Level ${bgLevel}` : `Profile Background [Col ${c + 1}]`;
        }

        contributionMatrix.appendChild(cell);
      }
    }

    graphDimensionsDisplay.textContent = `Pattern: 7 × ${artWidth} (Centered in 53-Week Profile)`;

    const commitsLabel = activePreviewYear === currentYear
      ? 'contributions in the last year'
      : `contributions in ${activePreviewYear}`;

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
        const level = matrix[r][c];
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

    graphDimensionsDisplay.textContent = `Editor Mode: 7 × ${artWidth} (${7 * artWidth} cells)`;
  }

  const commitsLabel = activePreviewYear === currentYear
    ? 'contributions in the last year'
    : `contributions in ${activePreviewYear}`;
  profileTotalCommits.textContent = `${totalCommits.toLocaleString()} ${commitsLabel}`;
  updateHistoryButtons();
}

matrixStore.subscribe((matrix) => {
  if (syncAllYears) {
    for (const yr of selectedTargetYears) {
      yearPatterns.set(yr, JSON.parse(JSON.stringify(matrix)));
    }
  } else {
    yearPatterns.set(activePreviewYear, JSON.parse(JSON.stringify(matrix)));
  }
  renderCurrentView(matrix);
});

window.addEventListener('pointerup', () => {
  matrixStore.handlePointerUp();
});

btnClearGrid.addEventListener('click', () => matrixStore.clear());
btnInvertGrid.addEventListener('click', () => matrixStore.invert());
btnUndoGrid.addEventListener('click', () => matrixStore.undo());
btnRedoGrid.addEventListener('click', () => matrixStore.redo());

uploadDropzone.addEventListener('click', () => fileInput.click());

uploadDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadDropzone.classList.add('dragover');
});

uploadDropzone.addEventListener('dragleave', () => {
  uploadDropzone.classList.remove('dragover');
});

uploadDropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  uploadDropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (file) {
    handleFileUpload(file);
  }
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) {
    handleFileUpload(file);
  }
});

async function handleFileUpload(file: File) {
  try {
    const img = await loadImageFromFile(file);
    currentImage = img;

    dropzoneThumb.src = URL.createObjectURL(file);
    dropzoneFilename.textContent = file.name;
    dropzoneDims.textContent = `${img.naturalWidth} × ${img.naturalHeight} px (${Math.round(file.size / 1024)} KB)`;
    dropzoneEmpty.style.display = 'none';
    dropzoneActive.style.display = 'flex';

    const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
    let targetWidth = Math.round(7 * ratio);
    targetWidth = Math.max(1, Math.min(44, targetWidth));

    widthSlider.setValue(targetWidth);

    const result = processImageToMatrix(img, {
      mode: currentMode,
      threshold: currentThreshold,
      invert: currentInvert,
      customWidth: targetWidth
    });

    isUserManualThreshold = false;
    currentThreshold = result.calculatedThreshold;
    thresholdSlider.setValue(result.calculatedThreshold);

    if (currentMode === 'auto') {
      modeControl.setValue(result.detectedMode);
    }

    matrixStore.setMatrix(result.matrix);
  } catch (err: any) {
    alert(`Error loading image: ${err.message || err}`);
  }
}

btnClearImage.addEventListener('click', (e) => {
  e.stopPropagation();
  currentImage = null;
  fileInput.value = '';
  dropzoneEmpty.style.display = 'block';
  dropzoneActive.style.display = 'none';
  matrixStore.clear();
  renderCurrentView(matrixStore.getMatrix());
});

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

  try {
    const data = await fetchUserContributions(token, year === currentYear ? undefined : year);
    if (data) {
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
        if (Array.isArray(existing.config.years) && existing.config.years.length > 0) {
          selectedTargetYears = new Set(existing.config.years);
          renderTargetYearsPills();
        }
        if (existing.config.patterns) {
          for (const [yStr, cfg] of Object.entries(existing.config.patterns)) {
            if (Array.isArray(cfg.matrix)) {
              yearPatterns.set(Number(yStr), cfg.matrix);
            }
          }
        }
        if (existing.config.matrix) {
          matrixStore.setMatrix(existing.config.matrix);
          widthSlider.setValue(existing.config.matrix[0].length);
          invertToggle.setChecked(existing.config.mode === 'bicolor');
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

    const sortedYears = Array.from(selectedTargetYears).sort((a, b) => b - a);
    const currentCanvasMatrix = matrixStore.getMatrix();
    const patterns: Record<string, { type: 'rolling' | 'calendar'; matrix: ContributionLevel[][] }> = {};

    for (const yr of sortedYears) {
      const yrMatrix = (!syncAllYears && yearPatterns.has(yr)) ? yearPatterns.get(yr)! : currentCanvasMatrix;
      patterns[String(yr)] = {
        type: yr === currentYear ? 'rolling' : 'calendar',
        matrix: yrMatrix
      };
    }

    const artData = {
      authorName: currentUser.login,
      authorEmail: currentUser.noreply_email,
      mode: currentMode === 'grayscale' ? 'grayscale' : 'bicolor',
      matrix: currentCanvasMatrix,
      years: sortedYears,
      patterns,
      updatedAt: new Date().toISOString()
    };

    const readmeContent = generateReadme(
      currentCanvasMatrix,
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
    btnDeploy.disabled = false;
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
    }
  } catch (err: any) {
    console.error('PKCE callback error:', err);
  }

  updateAuthDisplay();
}

init();
