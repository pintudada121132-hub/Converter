/**
 * Confirm APK Build Popup (lib/popups/confirmBuildPopup.js)
 */

import { FEATURE_SWITCHES } from '../iap/featureConfigService.js';

export function renderConfirmBuildPopup({
  url,
  appName,
  packageName,
  switches,
  onConfirm,
  onCancel
}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal-card';

  const title = document.createElement('h3');
  title.className = 'modal-title';
  title.textContent = 'Confirm APK Build';

  const text = document.createElement('p');
  text.className = 'modal-text';
  text.textContent = 'Please review your app configuration below before building your signed APK.';

  const list = document.createElement('div');
  list.className = 'modal-summary-list';

  const enabledNames = FEATURE_SWITCHES.filter((f) => switches[f.key]).map((f) => f.title);

  const rows = [
    ['App Name:', appName],
    ['Website URL:', url],
    ['Package ID:', packageName],
    ['Active Switches:', enabledNames.length ? `${enabledNames.length} ON (${enabledNames.slice(0, 3).join(', ')}${enabledNames.length > 3 ? '...' : ''})` : 'All switches are OFF']
  ];

  for (const [k, v] of rows) {
    const line = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = `${k} `;
    const span = document.createElement('span');
    span.textContent = v;
    line.append(strong, span);
    list.appendChild(line);
  }

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', onCancel);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn-primary';
  confirmBtn.textContent = 'Confirm & Build APK';
  confirmBtn.addEventListener('click', onConfirm);

  actions.append(cancelBtn, confirmBtn);
  modal.append(title, text, list, actions);
  backdrop.appendChild(modal);
  return backdrop;
}
