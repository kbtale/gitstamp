import './styles/main.css';
import { inject } from '@vercel/analytics';
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
  checkAppInstallation,
  fetchExistingArt,
  fetchUserContributions
} from './modules/github-api';
import {
  createSegmentedControl,
  createSlider,
  createToggleSwitch,
  createBrushPalette
} from './modules/ui-components';
import { renderTextToMatrix } from './modules/pixel-text';
import { STARTER_PRESETS, StarterPreset } from './modules/starter-presets';
import { parseArtMatrix, serializeArtMatrix } from './modules/art-io';
import { showToast } from './modules/toast';
import { showConfirmDialog } from './modules/confirm-dialog';
import {
  buildDeployArtPayload,
  deployArtworkToGithub,
  getAppInstallUrl,
  isAppInstallationError,
  StepStatus,
  unstampArtworkFromGithub
} from './modules/deploy-controller';
import { renderContributionPreview } from './modules/preview-renderer';

inject();

const DEFAULT_CLIENT_ID = (import.meta as any).env?.VITE_GITHUB_APP_CLIENT_ID || 'Iv23liETnS8etdqB3qHt';
const DEFAULT_APP_SLUG = (import.meta as any).env?.VITE_GITHUB_APP_SLUG || 'gitstamp-art';
const STUDIO_DRAFT_KEY = 'gitstamp_studio_draft_v1';

type SourceTab = 'text' | 'presets' | 'image';

let activeClientId: string = DEFAULT_CLIENT_ID;
let activeAppSlug: string = DEFAULT_APP_SLUG;
let currentUser: UserProfile | null = getStoredUser();
let isAppInstalled: boolean | null = null;
let currentTheme: AppTheme = 'dark';
let currentViewMode: 'profile' | 'editor' = 'profile';
let activeSourceTab: SourceTab = 'text';
let activeTextSpacing: number = 1;
let activePresetId: string | null = null;
let highlightBounds: boolean = true;
let userProfileCalendar: ContributionLevel[][] | null = null;
let userTotalContributions: number | null = null;
let showProfileContributions: boolean = true;
let flattenBackground: boolean = true;
let isSyncingMatrix: boolean = false;

const initialShowcaseMatrix = renderTextToMatrix('GITSTAMP', { shade: 4, spacing: 1, maxWidth: 53 });
const matrixStore = new MatrixStore(
  initialShowcaseMatrix[0].length,
  initialShowcaseMatrix,
  'GITSTAMP'
);

const authStatusContainer = document.getElementById('auth-status-container') as HTMLElement;
const btnOpenAuth = document.getElementById('btn-open-auth') as HTMLButtonElement;
const btnOpenDeploy = document.getElementById('btn-open-deploy') as HTMLButtonElement;
const btnOpenDeployPill = document.getElementById('btn-open-deploy-pill') as HTMLButtonElement;
const btnStageDeploy = document.getElementById('btn-stage-deploy') as HTMLButtonElement;
const headerRepoPillText = document.getElementById('header-repo-pill-text') as HTMLElement;
const headerRepoDot = document.getElementById('header-repo-dot') as HTMLElement;

const btnAddArtwork = document.getElementById('btn-add-artwork') as HTMLButtonElement;
const artworkItemsList = document.getElementById('artwork-items-list') as HTMLElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const imageDropzone = document.getElementById('image-dropzone') as HTMLButtonElement;
const dropzoneTitle = document.getElementById('dropzone-title') as HTMLElement;
const dropzoneSub = document.getElementById('dropzone-sub') as HTMLElement;
let pendingUploadArtworkId: string | null = null;

const sourceTabsContainer = document.getElementById('source-tabs-container') as HTMLElement;
const tabPanelText = document.getElementById('tab-panel-text') as HTMLElement;
const tabPanelPresets = document.getElementById('tab-panel-presets') as HTMLElement;
const tabPanelImage = document.getElementById('tab-panel-image') as HTMLElement;
const textSpacingContainer = document.getElementById('text-spacing-container') as HTMLElement;
const quickWordsRow = document.getElementById('quick-words-row') as HTMLElement;
const pixelTextInput = document.getElementById('pixel-text-input') as HTMLInputElement;
const presetGallery = document.getElementById('preset-gallery') as HTMLElement;

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
const btnNudgeLeft = document.getElementById('btn-nudge-left') as HTMLButtonElement;
const btnNudgeUp = document.getElementById('btn-nudge-up') as HTMLButtonElement;
const btnNudgeDown = document.getElementById('btn-nudge-down') as HTMLButtonElement;
const btnNudgeRight = document.getElementById('btn-nudge-right') as HTMLButtonElement;
const btnFlipH = document.getElementById('btn-flip-h') as HTMLButtonElement;
const btnFlipV = document.getElementById('btn-flip-v') as HTMLButtonElement;
const btnExportJson = document.getElementById('btn-export-json') as HTMLButtonElement;
const btnImportJson = document.getElementById('btn-import-json') as HTMLButtonElement;
const jsonImportInput = document.getElementById('json-import-input') as HTMLInputElement;

const graphPreviewContainer = document.getElementById('graph-preview-container') as HTMLElement;
const monthLabelsRow = document.getElementById('month-labels-row') as HTMLElement;
const contributionMatrix = document.getElementById('contribution-matrix') as HTMLElement;
const graphDimensionsDisplay = document.getElementById('graph-dimensions-display') as HTMLElement;
const activeCellsStat = document.getElementById('active-cells-stat') as HTMLElement;
const profileTotalCommits = document.getElementById('profile-total-commits') as HTMLElement;
const yearSelectorContainer = document.getElementById('year-selector-container') as HTMLElement;
const stagePlanSummary = document.getElementById('stage-plan-summary') as HTMLElement;

const deployDrawerBackdrop = document.getElementById('deploy-drawer-backdrop') as HTMLElement;
const btnCloseDeployDrawer = document.getElementById('btn-close-deploy-drawer') as HTMLButtonElement;
const deployPlanContainer = document.getElementById('deploy-plan-container') as HTMLElement;
const repoNameInput = document.getElementById('repo-name-input') as HTMLInputElement;
const repoStatusBadge = document.getElementById('repo-status-badge') as HTMLElement;
const appInstallBanner = document.getElementById('app-install-banner') as HTMLElement;
const appInstallMessage = document.getElementById('app-install-message') as HTMLElement;
const btnInstallGithubApp = document.getElementById('btn-install-github-app') as HTMLButtonElement;
const btnDeploy = document.getElementById('btn-deploy') as HTMLButtonElement;
const btnUnstamp = document.getElementById('btn-unstamp') as HTMLButtonElement;
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

const UPLOAD_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>';

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
    imageDims: `7 × ${mat[0]?.length || 24} cols`,
    mode: 'auto',
    threshold: 128,
    isUserManualThreshold: false,
    invert: false,
    width: mat[0]?.length || 24,
    matrix: mat,
    years: new Set(years)
  };
}

let artworkItems: ArtworkItem[] = [createArtworkItem([currentYear], 'GITSTAMP', initialShowcaseMatrix)];
let activeArtworkId: string = artworkItems[0].id;

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

function hasArtworkContent(item: ArtworkItem): boolean {
  if (item.image) {
    return true;
  }
  return item.matrix.some((row) => row.some((lvl) => lvl > 0));
}

function countActiveCells(matrix: ContributionLevel[][]): number {
  let count = 0;
  for (const row of matrix) {
    for (const cell of row) {
      if (cell > 0) {
        count++;
      }
    }
  }
  return count;
}

function switchSourceTab(tab: SourceTab) {
  activeSourceTab = tab;
  tabPanelText.hidden = tab !== 'text';
  tabPanelPresets.hidden = tab !== 'presets';
  tabPanelImage.hidden = tab !== 'image';
}

const sourceTabsControl = createSegmentedControl<SourceTab>({
  container: sourceTabsContainer,
  options: [
    { label: 'Text', value: 'text' },
    { label: 'Presets', value: 'presets' },
    { label: 'Image', value: 'image' }
  ],
  initialValue: activeSourceTab,
  onChange: (tab) => {
    switchSourceTab(tab);
  }
});

createSegmentedControl<'1' | '2'>({
  container: textSpacingContainer,
  options: [
    { label: 'Compact (1px)', value: '1' },
    { label: 'Wide (2px)', value: '2' }
  ],
  initialValue: '1',
  onChange: (val) => {
    activeTextSpacing = Number(val);
    applyLivePixelText();
  }
});

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
  min: 1,
  max: 53,
  initialValue: initialShowcaseMatrix[0].length,
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

createSegmentedControl<'profile' | 'editor'>({
  container: viewModeContainer,
  options: [
    { label: '53-Week', value: 'profile' },
    { label: '7×N', value: 'editor' }
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

  for (const item of artworkItems) {
    for (const yr of item.years) {
      yearsSet.add(yr);
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

function syncSidebarToActiveArtwork() {
  const item = getActiveArtwork();
  modeControl.setValue(item.mode);
  thresholdSlider.setValue(item.threshold);
  invertToggle.setChecked(item.invert);
  widthSlider.setValue(item.width);
  if (item.image && item.imageFilename) {
    dropzoneTitle.textContent = item.imageFilename;
    dropzoneSub.textContent = item.imageDims || `7 × ${item.width} cols`;
  } else {
    dropzoneTitle.textContent = 'Drop or choose an image';
    dropzoneSub.textContent = 'PNG, JPG, SVG, or WEBP';
  }
}

function updateHistoryButtons() {
  btnUndoGrid.disabled = !matrixStore.canUndo();
  btnRedoGrid.disabled = !matrixStore.canRedo();
}

function renderCurrentView(matrix: ContributionLevel[][]) {
  renderContributionPreview({
    elements: {
      graphPreviewContainer,
      monthLabelsRow,
      dayLabelsCol,
      contributionMatrix,
      graphDimensionsDisplay,
      profileTotalCommits
    },
    matrix,
    matrixStore,
    activeItem: getActiveArtwork(),
    previewOwner: getArtworkForYear(activePreviewYear),
    activePreviewYear,
    currentYear,
    viewMode: currentViewMode,
    highlightBounds,
    showProfileContributions,
    flattenBackground,
    userProfileCalendar,
    userTotalContributions
  });
  const activeCount = countActiveCells(matrix);
  activeCellsStat.textContent = `${activeCount} active ${activeCount === 1 ? 'cell' : 'cells'}`;
  updateHistoryButtons();
}

function openDeployDrawer() {
  deployDrawerBackdrop.hidden = false;
  btnCloseDeployDrawer.focus();
}

function closeDeployDrawer() {
  deployDrawerBackdrop.hidden = true;
}

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
  item.imageDims = `7 × ${item.width} cols`;
  item.name = `Artwork ${artworkItems.indexOf(item) + 1}`;
  item.matrix = createEmptyMatrix(item.width);
  if (item.id === activeArtworkId) {
    isSyncingMatrix = true;
    matrixStore.setMatrix(item.matrix, item.name);
    isSyncingMatrix = false;
  }
  syncSidebarToActiveArtwork();
  renderArtworkItemsList();
  renderYearSelector();
  renderDeployPlan();
  renderCurrentView(matrixStore.getMatrix());
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
    thumbBtn.setAttribute('aria-label', item.image ? `Replace image for ${item.name}` : `Upload image for ${item.name}`);
    thumbBtn.title = item.image ? `Replace image for ${item.name}` : `Upload image for ${item.name}`;
    if (item.imageThumbUrl) {
      const img = document.createElement('img');
      img.src = item.imageThumbUrl;
      img.alt = item.name;
      img.width = 34;
      img.height = 34;
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
    nameEl.className = `artwork-item-name ${item.image || hasArtworkContent(item) ? '' : 'is-prompt'}`.trim();
    nameEl.textContent = item.image || hasArtworkContent(item) ? item.name : 'Click or drop image';

    const subEl = document.createElement('div');
    subEl.className = 'artwork-item-sub';
    subEl.textContent = item.imageDims || `7 × ${item.width} cols`;

    info.appendChild(nameEl);
    info.appendChild(subEl);

    const actions = document.createElement('div');
    actions.className = 'artwork-card-actions';

    if (artworkItems.length > 1) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-artwork-action danger';
      deleteBtn.setAttribute('aria-label', `Remove ${item.name}`);
      deleteBtn.title = `Remove ${item.name}`;
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteArtworkItem(item.id);
      });
      actions.appendChild(deleteBtn);
    } else if (item.image) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'btn-artwork-action danger';
      clearBtn.setAttribute('aria-label', 'Remove image');
      clearBtn.title = 'Remove image';
      clearBtn.textContent = '×';
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
      pill.title = isOwnedElsewhere && owner
        ? `Assigned to ${owner.name}. Click to move ${yr} here`
        : (yr === currentYear ? `${yr} (Rolling year)` : `${yr} calendar year`);

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
    btn.title = owner ? `${yr}: ${owner.name}` : `${yr}: no artwork assigned`;
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
    empty.textContent = 'No years assigned yet. Select at least one year on an artwork.';
    deployPlanContainer.appendChild(empty);
    btnDeploy.disabled = true;
    stagePlanSummary.textContent = 'Select a target year on any artwork to deploy.';
    return;
  }

  btnDeploy.disabled = false;
  stagePlanSummary.textContent = `${assignedYears.length} ${assignedYears.length === 1 ? 'year' : 'years'} assigned (${assignedYears.join(', ')}). Weekly self-centering workflow included.`;

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
      closeDeployDrawer();
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
  matrixStore.reset(next.matrix, next.name);
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

function applyMatrixToActiveArtwork(matrix: ContributionLevel[][], label?: string) {
  const item = getActiveArtwork();
  if (item.imageThumbUrl) {
    URL.revokeObjectURL(item.imageThumbUrl);
  }
  item.image = null;
  item.imageThumbUrl = null;
  item.imageFilename = null;
  item.imageDims = `7 × ${matrix[0]?.length || 1} cols`;
  if (label) {
    item.name = label;
  }
  item.width = matrix[0]?.length || 1;
  item.matrix = cloneMatrix(matrix);
  isSyncingMatrix = true;
  matrixStore.setMatrix(matrix, item.name);
  isSyncingMatrix = false;
  syncSidebarToActiveArtwork();
  renderArtworkItemsList();
  renderYearSelector();
  renderDeployPlan();
  renderCurrentView(matrixStore.getMatrix());
}

function applyLivePixelText() {
  const text = pixelTextInput.value.trim();
  if (!text) {
    return;
  }
  activePresetId = null;
  renderPresetGallery();
  const activeBrush = matrixStore.getActiveBrush();
  const shade: ContributionLevel = activeBrush > 0 ? activeBrush : 4;
  const matrix = renderTextToMatrix(text, { shade, spacing: activeTextSpacing, maxWidth: 53 });
  applyMatrixToActiveArtwork(matrix, text.toUpperCase());
}

function renderPresetGallery() {
  if (!presetGallery) {
    return;
  }
  presetGallery.innerHTML = '';

  STARTER_PRESETS.forEach((preset: StarterPreset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `preset-chip ${activePresetId === preset.id ? 'is-selected' : ''}`.trim();
    btn.title = `Load ${preset.name} preset`;

    const mini = document.createElement('span');
    mini.className = 'preset-mini-grid';
    mini.setAttribute('aria-hidden', 'true');
    const cols = Math.min(12, preset.matrix[0].length);
    mini.style.gridTemplateColumns = `repeat(${cols}, 3.5px)`;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < cols; c++) {
        const srcCol = Math.floor((c / cols) * preset.matrix[0].length);
        const dot = document.createElement('span');
        dot.className = `preset-dot cell-level-${preset.matrix[r][srcCol]}`;
        mini.appendChild(dot);
      }
    }

    const label = document.createElement('span');
    label.className = 'preset-chip-label';
    label.textContent = preset.name;

    btn.appendChild(mini);
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      activePresetId = preset.id;
      renderPresetGallery();
      applyMatrixToActiveArtwork(preset.matrix, preset.name);
      showToast(`Loaded "${preset.name}" preset`, 'info', 2000);
    });
    presetGallery.appendChild(btn);
  });
}

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
    activePresetId = null;

    isSyncingMatrix = true;
    matrixStore.setMatrix(result.matrix, targetItem.name);
    isSyncingMatrix = false;

    sourceTabsControl.setValue('image');
    switchSourceTab('image');
    syncSidebarToActiveArtwork();
    renderArtworkItemsList();
    renderPresetGallery();
    renderYearSelector();
    renderDeployPlan();
    await loadUserContributions(activePreviewYear);
    renderCurrentView(matrixStore.getMatrix());
  } catch (err: any) {
    showToast(`Could not load image: ${err.message || err}`, 'error');
  }
}

function setStepStatus(step: 'repo' | 'files' | 'dispatch', status: StepStatus, text?: string) {
  const stepEl = step === 'repo' ? stepRepo : step === 'files' ? stepFiles : stepDispatch;
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

function saveStudioDraft() {
  try {
    const active = getActiveArtwork();
    active.matrix = matrixStore.getMatrix();
    active.width = active.matrix[0]?.length || active.width;
    const payload = {
      repoName: repoNameInput.value.trim() || 'gitstamp-art',
      activePreviewYear,
      activeIndex: Math.max(0, artworkItems.findIndex((a) => a.id === activeArtworkId)),
      items: artworkItems.map((item) => ({
        name: item.name,
        mode: item.mode,
        matrix: item.matrix,
        years: Array.from(item.years)
      }))
    };
    sessionStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(payload));
  } catch {}
}

function restoreStudioDraft(): boolean {
  try {
    const raw = sessionStorage.getItem(STUDIO_DRAFT_KEY);
    if (!raw) {
      return false;
    }
    sessionStorage.removeItem(STUDIO_DRAFT_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return false;
    }
    const restored: ArtworkItem[] = [];
    artworkCounter = 1;
    for (const entry of parsed.items) {
      if (!Array.isArray(entry.matrix) || entry.matrix.length !== 7) {
        continue;
      }
      const years = Array.isArray(entry.years)
        ? entry.years.map(Number).filter((y: number) => Number.isFinite(y))
        : [];
      const item = createArtworkItem(years, typeof entry.name === 'string' ? entry.name : undefined, entry.matrix);
      if (entry.mode === 'grayscale' || entry.mode === 'bicolor' || entry.mode === 'auto') {
        item.mode = entry.mode;
      }
      restored.push(item);
    }
    if (restored.length === 0) {
      return false;
    }
    artworkItems = restored;
    const idx = Number.isInteger(parsed.activeIndex) && parsed.activeIndex >= 0 && parsed.activeIndex < restored.length
      ? parsed.activeIndex
      : 0;
    activeArtworkId = restored[idx].id;
    if (Number.isFinite(parsed.activePreviewYear)) {
      activePreviewYear = parsed.activePreviewYear;
    }
    if (typeof parsed.repoName === 'string' && parsed.repoName.trim()) {
      repoNameInput.value = parsed.repoName.trim();
    }
    isSyncingMatrix = true;
    matrixStore.reset(restored[idx].matrix, restored[idx].name);
    isSyncingMatrix = false;
    return true;
  } catch {
    return false;
  }
}

function updateAppInstallBanner() {
  if (!currentUser || isAppInstalled !== false) {
    appInstallBanner.hidden = true;
    return;
  }
  appInstallMessage.textContent = `Install the GitStamp GitHub App on @${currentUser.login} so it can create and update your art repository.`;
  appInstallBanner.hidden = false;
}

async function refreshAppInstallationStatus() {
  const token = getStoredToken();
  if (!currentUser || !token) {
    isAppInstalled = null;
    updateAppInstallBanner();
    return;
  }
  isAppInstalled = await checkAppInstallation(token, currentUser.login);
  updateAppInstallBanner();
}

async function promptInstallGithubApp(reason?: string): Promise<boolean> {
  const repoName = repoNameInput.value.trim() || 'gitstamp-art';
  const username = currentUser ? `@${currentUser.login}` : 'your GitHub account';
  const confirmed = await showConfirmDialog({
    title: 'Install GitStamp GitHub App',
    message:
      reason ||
      `GitStamp needs the GitHub App installed on ${username} to create and update ${repoName}. Your current artwork will be saved while you authorize on GitHub.`,
    confirmLabel: 'Install GitHub App',
    cancelLabel: 'Not Now'
  });

  if (confirmed) {
    saveStudioDraft();
    window.location.href = getAppInstallUrl(activeAppSlug);
  }
  return confirmed;
}

function updateTargetRepoLink() {
  const repoName = repoNameInput.value.trim() || 'gitstamp-art';
  const username = currentUser ? currentUser.login : ':username';
  const url = `https://github.com/${username}/${repoName}`;
  targetRepoLink.href = url;
  targetRepoLink.textContent = url;
  headerRepoPillText.textContent = currentUser ? `${currentUser.login}/${repoName}` : repoName;
}

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
      repoStatusBadge.classList.add('is-connected');
      headerRepoDot.classList.add('is-online');

      const shouldLoad = await showConfirmDialog({
        title: 'Load existing GitStamp art?',
        message: `Found existing art configuration in @${currentUser.login}/${repoName}. Load it into the studio editor?`,
        confirmLabel: 'Load Artwork',
        cancelLabel: 'Keep Current'
      });

      if (shouldLoad) {
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
          settingFlattenBackground.checked = flattenBackground;
        }

        if (loadedItems.length > 0) {
          for (const old of artworkItems) {
            if (old.imageThumbUrl) {
              URL.revokeObjectURL(old.imageThumbUrl);
            }
          }
          artworkItems = loadedItems;
          await selectArtworkItem(artworkItems[0].id, true);
          showToast(`Loaded artwork from @${currentUser.login}/${repoName}`, 'success');
        }
      }
    } else {
      repoStatusBadge.textContent = 'New Repo';
      repoStatusBadge.classList.remove('is-connected');
      headerRepoDot.classList.remove('is-online');
    }
  } catch {
    repoStatusBadge.textContent = 'Public Repo';
    repoStatusBadge.classList.remove('is-connected');
    headerRepoDot.classList.remove('is-online');
  }
}

function updateAuthDisplay() {
  if (currentUser) {
    btnOpenAuth.style.display = 'none';
    authStatusContainer.innerHTML = `
      <div class="user-profile-badge">
        <img src="${currentUser.avatar_url}" alt="${currentUser.login}" width="22" height="22" class="user-avatar" />
        <a href="https://github.com/${currentUser.login}" target="_blank" rel="noopener noreferrer" style="color: inherit; font-weight: 600;">@${currentUser.login}</a>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-logout">Logout</button>
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
      updateTargetRepoLink();
      renderCurrentView(matrixStore.getMatrix());
    });
    checkExistingUserRepo();
    refreshAppInstallationStatus();
    updateTargetRepoLink();
    loadUserContributions();
  } else {
    authStatusContainer.innerHTML = '';
    btnOpenAuth.style.display = 'inline-flex';
    repoStatusBadge.textContent = 'Public Repo';
    repoStatusBadge.classList.remove('is-connected');
    headerRepoDot.classList.remove('is-online');
    isAppInstalled = null;
    updateAppInstallBanner();
    userProfileCalendar = null;
    userTotalContributions = null;
    yearContributionsCache.clear();
    updateTargetRepoLink();
    renderCurrentView(matrixStore.getMatrix());
  }
}

matrixStore.subscribe((matrix) => {
  if (!isSyncingMatrix) {
    const item = getActiveArtwork();
    const prevWidth = item.width;
    const prevName = item.name;
    const nextWidth = matrix[0]?.length || item.width;
    const snapshotLabel = matrixStore.getLabel();

    item.matrix = cloneMatrix(matrix);
    item.width = nextWidth;
    item.imageDims = item.image ? item.imageDims : `7 × ${item.width} cols`;
    if (snapshotLabel && !item.image) {
      item.name = snapshotLabel;
    }

    if (item.width !== prevWidth) {
      widthSlider.setValue(item.width);
    }
    if (item.width !== prevWidth || item.name !== prevName) {
      renderArtworkItemsList();
      renderYearSelector();
    }
    renderDeployPlan();
  }
  renderCurrentView(matrix);
});

btnOpenDeploy.addEventListener('click', openDeployDrawer);
btnOpenDeployPill.addEventListener('click', openDeployDrawer);
btnStageDeploy.addEventListener('click', openDeployDrawer);
btnCloseDeployDrawer.addEventListener('click', closeDeployDrawer);
deployDrawerBackdrop.addEventListener('click', (e) => {
  if (e.target === deployDrawerBackdrop) {
    closeDeployDrawer();
  }
});

btnAddArtwork.addEventListener('click', async () => {
  const unassignedYear = availableYears.find((yr) => !getArtworkForYear(yr));
  const newItem = createArtworkItem(unassignedYear !== undefined ? [unassignedYear] : []);
  artworkItems.push(newItem);
  await selectArtworkItem(newItem.id, true);
});

imageDropzone.addEventListener('click', () => triggerUploadForArtwork(activeArtworkId));
imageDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  imageDropzone.classList.add('dragover');
});
imageDropzone.addEventListener('dragleave', () => {
  imageDropzone.classList.remove('dragover');
});
imageDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  imageDropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (file) {
    handleFileUpload(file, activeArtworkId);
  }
});

pixelTextInput.addEventListener('input', () => {
  applyLivePixelText();
});

quickWordsRow.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.word-pill');
  if (!target?.dataset.word) {
    return;
  }
  pixelTextInput.value = target.dataset.word;
  applyLivePixelText();
});

btnThemeToggle.addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  graphPreviewContainer.setAttribute('data-graph-theme', currentTheme);
  btnThemeToggle.classList.toggle('is-light', currentTheme === 'light');
});

window.addEventListener('pointerup', () => matrixStore.handlePointerUp());
btnClearGrid.addEventListener('click', () => matrixStore.clear());
btnInvertGrid.addEventListener('click', () => matrixStore.invert());
btnUndoGrid.addEventListener('click', () => matrixStore.undo());
btnRedoGrid.addEventListener('click', () => matrixStore.redo());
btnNudgeLeft.addEventListener('click', () => matrixStore.nudge(-1, 0));
btnNudgeUp.addEventListener('click', () => matrixStore.nudge(0, -1));
btnNudgeDown.addEventListener('click', () => matrixStore.nudge(0, 1));
btnNudgeRight.addEventListener('click', () => matrixStore.nudge(1, 0));
btnFlipH.addEventListener('click', () => matrixStore.flipHorizontal());
btnFlipV.addEventListener('click', () => matrixStore.flipVertical());

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  const targetId = pendingUploadArtworkId || activeArtworkId;
  pendingUploadArtworkId = null;
  if (file) {
    handleFileUpload(file, targetId);
  }
});

btnExportJson.addEventListener('click', () => {
  const item = getActiveArtwork();
  const json = serializeArtMatrix(matrixStore.getMatrix(), item.name);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${item.name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') || 'gitstamp-art'}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Exported artwork JSON', 'success', 2400);
});

btnImportJson.addEventListener('click', () => {
  jsonImportInput.value = '';
  jsonImportInput.click();
});

jsonImportInput.addEventListener('change', async () => {
  const file = jsonImportInput.files?.[0];
  if (!file) {
    return;
  }
  try {
    const raw = await file.text();
    const { matrix, name } = parseArtMatrix(raw);
    activePresetId = null;
    renderPresetGallery();
    applyMatrixToActiveArtwork(matrix, name || file.name.replace(/\.json$/i, ''));
    showToast('Imported artwork JSON', 'success', 2400);
  } catch (err: any) {
    showToast(`Invalid art JSON: ${err.message || err}`, 'error');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !deployDrawerBackdrop.hidden) {
    e.preventDefault();
    closeDeployDrawer();
    return;
  }
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) {
    return;
  }
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault();
    matrixStore.undo();
  } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault();
    matrixStore.redo();
  }
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

settingProfileContributions.addEventListener('change', () => {
  showProfileContributions = settingProfileContributions.checked;
  renderCurrentView(matrixStore.getMatrix());
});

settingFlattenBackground.addEventListener('change', () => {
  flattenBackground = settingFlattenBackground.checked;
  renderCurrentView(matrixStore.getMatrix());
});

settingBtnResetArt.addEventListener('click', () => {
  matrixStore.clear();
  settingsDropdownMenu.style.display = 'none';
});

repoNameInput.addEventListener('input', updateTargetRepoLink);

btnInstallGithubApp.addEventListener('click', () => {
  saveStudioDraft();
  window.location.href = getAppInstallUrl(activeAppSlug);
});

btnOpenAuth.addEventListener('click', async () => {
  saveStudioDraft();
  const redirectUri = window.location.origin + window.location.pathname;
  await initiatePkceLogin({
    clientId: activeClientId,
    redirectUri
  });
});

btnDeploy.addEventListener('click', async () => {
  const token = getStoredToken();
  if (!currentUser || !token) {
    saveStudioDraft();
    const redirectUri = window.location.origin + window.location.pathname;
    await initiatePkceLogin({
      clientId: activeClientId,
      redirectUri
    });
    return;
  }

  if (isAppInstalled === false) {
    await promptInstallGithubApp();
    return;
  }

  const activeItem = getActiveArtwork();
  activeItem.matrix = matrixStore.getMatrix();

  const sortedYears = getAllAssignedYears();
  if (sortedYears.length === 0) {
    showToast('Assign at least one year to an artwork before deploying.', 'error');
    return;
  }

  const repoName = repoNameInput.value.trim() || 'gitstamp-art';
  deployStepsContainer.style.display = 'flex';
  btnDeploy.disabled = true;
  btnUnstamp.disabled = true;
  btnDeploy.textContent = 'Deploying…';

  try {
    const artData = buildDeployArtPayload({
      user: currentUser,
      sortedYears,
      currentYear,
      getArtworkForYear,
      fallbackMatrix: activeItem.matrix,
      flattenBackground
    });

    await deployArtworkToGithub({
      token,
      user: currentUser,
      repoName,
      artData,
      webAppUrl: window.location.href,
      callbacks: { onStep: setStepStatus }
    });

    isAppInstalled = true;
    updateAppInstallBanner();
    showToast(`Deployed to @${currentUser.login}/${repoName}. Render workflow running.`, 'success', 5500);
  } catch (err: any) {
    const msg = err.message || String(err);
    if (stepRepo.className.includes('running')) {
      setStepStatus('repo', 'error', `1. Repository failed: ${msg}`);
    } else if (stepFiles.className.includes('running')) {
      setStepStatus('files', 'error', `2. File sync failed: ${msg}`);
    } else {
      setStepStatus('dispatch', 'error', `3. Workflow dispatch failed: ${msg}`);
    }
    if (isAppInstallationError(msg)) {
      isAppInstalled = false;
      updateAppInstallBanner();
      await promptInstallGithubApp(
        `GitStamp does not have permission to access @${currentUser.login}/${repoName} yet. Install or grant repository access to the GitStamp GitHub App, then return here to deploy.`
      );
    } else {
      showToast(`Deployment failed: ${msg}`, 'error', 6000);
    }
  } finally {
    btnDeploy.disabled = getAllAssignedYears().length === 0;
    btnUnstamp.disabled = false;
    btnDeploy.textContent = 'Deploy to My GitHub Profile';
  }
});

btnUnstamp.addEventListener('click', async () => {
  const token = getStoredToken();
  if (!currentUser || !token) {
    showToast('Sign in with GitHub first to unstamp an art repository.', 'info');
    return;
  }

  const repoName = repoNameInput.value.trim() || 'gitstamp-art';
  const confirmed = await showConfirmDialog({
    title: `Unstamp @${currentUser.login}/${repoName}?`,
    message: 'This clears art.json and triggers an orphan history sync so all GitStamp commits are removed from your contribution graph. Your other repositories are untouched.',
    confirmLabel: 'Unstamp Art',
    cancelLabel: 'Cancel',
    danger: true
  });

  if (!confirmed) {
    return;
  }

  deployStepsContainer.style.display = 'flex';
  btnDeploy.disabled = true;
  btnUnstamp.disabled = true;
  btnUnstamp.textContent = 'Unstamping…';

  try {
    await unstampArtworkFromGithub({
      token,
      user: currentUser,
      repoName,
      currentYear,
      webAppUrl: window.location.href,
      callbacks: { onStep: setStepStatus }
    });
    showToast(`Unstamp triggered on @${currentUser.login}/${repoName}`, 'success', 5500);
  } catch (err: any) {
    const msg = err.message || String(err);
    if (stepRepo.className.includes('running')) {
      setStepStatus('repo', 'error', `1. Repository check failed: ${msg}`);
    } else if (stepFiles.className.includes('running')) {
      setStepStatus('files', 'error', `2. Clear failed: ${msg}`);
    } else {
      setStepStatus('dispatch', 'error', `3. Workflow dispatch failed: ${msg}`);
    }
    if (isAppInstallationError(msg)) {
      isAppInstalled = false;
      updateAppInstallBanner();
      await promptInstallGithubApp(
        `GitStamp needs permission on @${currentUser.login}/${repoName} to unstamp it. Install or update the GitStamp GitHub App access, then return here.`
      );
    } else {
      showToast(`Unstamp failed: ${msg}`, 'error', 6000);
    }
  } finally {
    btnDeploy.disabled = getAllAssignedYears().length === 0;
    btnUnstamp.disabled = false;
    btnUnstamp.textContent = 'Unstamp Art';
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
  const restoredDraft = restoreStudioDraft();
  if (restoredDraft) {
    setAvailableYears();
  }
  switchSourceTab(activeSourceTab);
  syncSidebarToActiveArtwork();
  renderArtworkItemsList();
  renderPresetGallery();
  renderYearSelector();
  renderDeployPlan();
  updateTargetRepoLink();
  renderCurrentView(matrixStore.getMatrix());

  await loadServerConfig();

  const urlParams = new URLSearchParams(window.location.search);
  const setupAction = urlParams.get('setup_action');
  const returnedFromAppInstall = setupAction === 'install' || setupAction === 'update';
  if (setupAction === 'install' && !getStoredToken()) {
    saveStudioDraft();
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

  if (returnedFromAppInstall) {
    window.history.replaceState({}, document.title, window.location.pathname);
    if (currentUser) {
      openDeployDrawer();
      showToast('GitStamp GitHub App connected. Ready to deploy.', 'success', 4500);
    }
  }
}

init();
