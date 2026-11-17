/**
 * Main Website-to-APK Builder Page Controller (lib/pages/homeBuilderPage.js)
 * Coordinates URL detection, app identity editing, 9 optional switches, live phone preview, and APK build popups.
 */

import { renderBuildApkButton } from '../buttons/buildApkButton.js';
import { renderResetFormButton } from '../buttons/resetFormButton.js';
import { FEATURE_SWITCHES, getDefaultSwitchState } from '../iap/featureConfigService.js';
import { renderConfirmBuildPopup } from '../popups/confirmBuildPopup.js';
import { renderErrorDialogPopup } from '../popups/errorDialogPopup.js';
import { renderLoadingProgressPopup } from '../popups/loadingProgressPopup.js';
import { renderSuccessApkPopup } from '../popups/successApkPopup.js';
import { renderAppIdentityCardWidget } from '../widgets/appIdentityCardWidget.js';
import { renderEmptyStateWidget } from '../widgets/emptyStateWidget.js';
import { renderHeaderNavbarWidget } from '../widgets/headerNavbarWidget.js';
import { renderPhonePreviewWidget } from '../widgets/phonePreviewWidget.js';
import { renderSwitchItemWidget } from '../widgets/switchItemWidget.js';
import { renderUrlInputCardWidget } from '../widgets/urlInputCardWidget.js';

const state = {
  urlInput: '',
  isDetecting: false,
  validationError: '',
  detectWarning: '',
  detected: null,
  appName: '',
  packageName: '',
  themeColor: '#2563EB',
  iconUrl: '',
  customIconDataUrl: '',
  switches: getDefaultSwitchState(),
  simulateOffline: false,
  refreshMessage: '',
  showConfirmModal: false,
  buildProgressStep: -1,
  buildResult: null,
  errorModal: null
};

const rootEl = document.getElementById('appRoot');
let previewMountEl = null;

function refreshPreviewOnly() {
  if (!previewMountEl || !state.detected) return;
  previewMountEl.innerHTML = '';
  previewMountEl.appendChild(
    renderPhonePreviewWidget({
      appName: state.appName,
      url: state.detected.finalUrl || state.urlInput,
      hostname: state.detected.hostname,
      themeColor: state.themeColor,
      switches: state.switches,
      simulateOffline: state.simulateOffline,
      refreshMessage: state.refreshMessage,
      onToggleOfflinePreview: () => {
        state.simulateOffline = !state.simulateOffline;
        refreshPreviewOnly();
      },
      onSimulateRefresh: () => {
        state.refreshMessage = 'Refreshing page... Done!';
        refreshPreviewOnly();
        setTimeout(() => {
          state.refreshMessage = '';
          refreshPreviewOnly();
        }, 1200);
      }
    })
  );
}

async function runDetectWebsite() {
  const raw = state.urlInput.trim();
  if (!raw) {
    state.validationError = 'Please enter a website URL (e.g. https://wikipedia.org).';
    render();
    return;
  }

  state.validationError = '';
  state.detectWarning = '';
  state.isDetecting = true;
  render();

  try {
    const res = await fetch('/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: raw })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      state.isDetecting = false;
      state.validationError = data.error || 'Could not detect website details.';
      render();
      return;
    }

    state.isDetecting = false;
    state.detected = data;
    state.urlInput = data.finalUrl || data.url;
    state.appName = data.appName;
    state.packageName = data.packageName;
    state.themeColor = data.themeColor || '#2563EB';
    state.iconUrl = data.iconUrl || '';
    state.customIconDataUrl = '';
    state.detectWarning = data.warning || '';
    state.buildResult = null;
    render();
  } catch {
    state.isDetecting = false;
    state.errorModal = {
      titleText: 'Auto-Detect Server Error',
      messageText: 'Could not connect to the server. You can Retry or continue with manual settings.',
      onRetry: () => {
        state.errorModal = null;
        runDetectWebsite();
      },
      onFallbackManual: () => {
        state.errorModal = null;
        const cleanHost = raw.replace(/^https?:\/\//i, '').split('/')[0] || 'example.com';
        const slug = cleanHost.split('.')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || 'webapp';
        state.detected = {
          finalUrl: /^https?:\/\//i.test(raw) ? raw : `https://${raw}`,
          hostname: cleanHost,
          isMobileOptimized: false
        };
        state.appName = slug.charAt(0).toUpperCase() + slug.slice(1);
        state.packageName = `com.web2apk.${slug}`;
        state.themeColor = '#2563EB';
        state.detectWarning = 'Manual fallback mode is active.';
        render();
      }
    };
    render();
  }
}

function validateBeforeBuild() {
  if (!state.detected) {
    state.validationError = 'Please enter a website URL and click Auto-Detect first.';
    render();
    return false;
  }
  if (!state.appName.trim()) {
    state.errorModal = {
      titleText: 'App Name Missing',
      messageText: 'Please enter an App Name before building the APK.',
      onRetry: null
    };
    render();
    return false;
  }
  const pkgRegex = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,4}$/;
  if (!pkgRegex.test(state.packageName.trim().toLowerCase())) {
    state.errorModal = {
      titleText: 'Invalid Android Package ID',
      messageText: 'Package ID must be lowercase and dot-separated (e.g. com.web2apk.mysite).',
      onRetry: null
    };
    render();
    return false;
  }
  return true;
}

async function runBuildApk() {
  state.showConfirmModal = false;
  state.buildProgressStep = 0;
  render();

  const timer1 = setTimeout(() => {
    if (state.buildProgressStep >= 0) {
      state.buildProgressStep = 1;
      render();
    }
  }, 2000);

  const timer2 = setTimeout(() => {
    if (state.buildProgressStep >= 0) {
      state.buildProgressStep = 2;
      render();
    }
  }, 5500);

  try {
    const res = await fetch('/api/build-apk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: state.detected.finalUrl || state.urlInput,
        appName: state.appName.trim(),
        packageName: state.packageName.trim().toLowerCase(),
        themeColor: state.themeColor,
        customIconDataUrl: state.customIconDataUrl,
        switches: state.switches
      })
    });

    clearTimeout(timer1);
    clearTimeout(timer2);
    const data = await res.json();

    state.buildProgressStep = -1;
    if (!res.ok || !data.success) {
      state.errorModal = {
        titleText: 'APK Build Failed',
        messageText: data.error || 'Could not build the APK. Please try again.',
        onRetry: () => {
          state.errorModal = null;
          runBuildApk();
        }
      };
      render();
      return;
    }

    state.buildResult = data;
    render();
  } catch {
    clearTimeout(timer1);
    clearTimeout(timer2);
    state.buildProgressStep = -1;
    state.errorModal = {
      titleText: 'Network Error During Build',
      messageText: 'Could not reach the build server. Please check the server and click Retry.',
      onRetry: () => {
        state.errorModal = null;
        runBuildApk();
      }
    };
    render();
  }
}

function resetAll() {
  state.urlInput = '';
  state.isDetecting = false;
  state.validationError = '';
  state.detectWarning = '';
  state.detected = null;
  state.appName = '';
  state.packageName = '';
  state.themeColor = '#2563EB';
  state.iconUrl = '';
  state.customIconDataUrl = '';
  state.switches = getDefaultSwitchState();
  state.simulateOffline = false;
  state.refreshMessage = '';
  state.showConfirmModal = false;
  state.buildProgressStep = -1;
  state.buildResult = null;
  state.errorModal = null;
  render();
}

function renderSwitchesSection() {
  const card = document.createElement('section');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'card-header';
  const titleWrap = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = '3. Optional Feature Switches';
  const sub = document.createElement('p');
  sub.className = 'card-subtitle';
  sub.textContent = 'Every feature is optional — toggle any switch ON or OFF based on your needs.';
  titleWrap.append(title, sub);
  header.appendChild(titleWrap);

  const list = document.createElement('div');
  list.className = 'switches-list';

  for (const item of FEATURE_SWITCHES) {
    list.appendChild(
      renderSwitchItemWidget({
        item,
        checked: state.switches[item.key],
        onToggle: (key, val) => {
          state.switches[key] = val;
          // Keep Desktop Mode and Responsive Fit clear if user toggles Desktop Mode ON
          if (key === 'customIdentity') {
            render();
          } else {
            refreshPreviewOnly();
          }
        }
      })
    );
  }

  const actions = document.createElement('div');
  actions.className = 'action-bar';
  actions.style.marginTop = '18px';

  actions.append(
    renderResetFormButton({
      disabled: state.buildProgressStep >= 0,
      onClick: resetAll
    }),
    renderBuildApkButton({
      disabled: !state.detected,
      isBuilding: state.buildProgressStep >= 0,
      onClick: () => {
        if (validateBeforeBuild()) {
          state.showConfirmModal = true;
          render();
        }
      }
    })
  );

  card.append(header, list, actions);
  return card;
}

function render() {
  rootEl.innerHTML = '';
  rootEl.appendChild(renderHeaderNavbarWidget({ hasDetected: Boolean(state.detected) }));

  const main = document.createElement('main');
  main.className = 'container';

  const grid = document.createElement('div');
  grid.className = 'builder-grid';

  const leftCol = document.createElement('div');
  leftCol.className = 'left-column';

  leftCol.appendChild(
    renderUrlInputCardWidget({
      urlValue: state.urlInput,
      isDetecting: state.isDetecting,
      validationError: state.validationError,
      detectWarning: state.detectWarning,
      detectedHost: state.detected?.hostname || '',
      onUrlChange: (val) => {
        state.urlInput = val;
        state.validationError = '';
      },
      onDetect: runDetectWebsite
    })
  );

  if (!state.detected) {
    leftCol.appendChild(
      renderEmptyStateWidget({
        onSelectSample: (sampleUrl) => {
          state.urlInput = sampleUrl;
          runDetectWebsite();
        }
      })
    );
  } else {
    leftCol.appendChild(
      renderAppIdentityCardWidget({
        appName: state.appName,
        packageName: state.packageName,
        themeColor: state.themeColor,
        iconPreviewUrl: state.customIconDataUrl || state.iconUrl,
        isMobileOptimized: Boolean(state.detected.isMobileOptimized),
        canEdit: Boolean(state.switches.customIdentity),
        onFieldChange: (field, val) => {
          state[field] = val;
          if (field === 'customIconDataUrl' || field === 'themeColor') {
            render();
          } else {
            refreshPreviewOnly();
          }
        }
      })
    );
    leftCol.appendChild(renderSwitchesSection());
  }

  const rightCol = document.createElement('div');
  rightCol.className = 'right-column';
  previewMountEl = document.createElement('div');
  rightCol.appendChild(previewMountEl);

  if (state.detected) {
    refreshPreviewOnly();
  } else {
    const infoCard = document.createElement('aside');
    infoCard.className = 'card';
    const title = document.createElement('h2');
    title.className = 'card-title';
    title.textContent = 'How the APK Builder Works';
    const list = document.createElement('div');
    list.className = 'modal-summary-list';
    list.style.marginTop = '12px';
    list.style.marginBottom = '0';
    const steps = [
      'Step 1: Enter any website link — App Name, Icon, and Mobile Fit are auto-detected.',
      'Step 2: Toggle switches such as AdBlocker, Redirect Blocker, Desktop Mode, and Swipe Refresh.',
      'Step 3: Check the Live Phone Preview and download your signed .APK file.'
    ];
    for (const s of steps) {
      const p = document.createElement('div');
      p.textContent = s;
      list.appendChild(p);
    }
    infoCard.append(title, list);
    previewMountEl.appendChild(infoCard);
  }

  grid.append(leftCol, rightCol);
  main.appendChild(grid);
  rootEl.appendChild(main);

  // Active Modals
  if (state.showConfirmModal) {
    rootEl.appendChild(
      renderConfirmBuildPopup({
        url: state.detected.finalUrl || state.urlInput,
        appName: state.appName,
        packageName: state.packageName,
        switches: state.switches,
        onCancel: () => {
          state.showConfirmModal = false;
          render();
        },
        onConfirm: runBuildApk
      })
    );
  }

  if (state.buildProgressStep >= 0) {
    rootEl.appendChild(
      renderLoadingProgressPopup({ activeStepIndex: state.buildProgressStep })
    );
  }

  if (state.buildResult) {
    rootEl.appendChild(
      renderSuccessApkPopup({
        buildResult: state.buildResult,
        onClose: () => {
          state.buildResult = null;
          render();
        }
      })
    );
  }

  if (state.errorModal) {
    rootEl.appendChild(
      renderErrorDialogPopup({
        titleText: state.errorModal.titleText,
        messageText: state.errorModal.messageText,
        onRetry: state.errorModal.onRetry,
        onFallbackManual: state.errorModal.onFallbackManual,
        onClose: () => {
          state.errorModal = null;
          render();
        }
      })
    );
  }
}

render();
