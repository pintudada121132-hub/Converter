/**
 * Success APK Ready Popup (lib/popups/successApkPopup.js)
 */

import { renderDownloadApkButton } from '../buttons/downloadApkButton.js';

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function renderSuccessApkPopup({ buildResult, onClose }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal-card';

  const badge = document.createElement('span');
  badge.className = 'badge badge-success';
  badge.textContent = buildResult.verified ? 'Signed & Verified APK' : 'APK Ready';
  badge.style.marginBottom = '10px';

  const title = document.createElement('h3');
  title.className = 'modal-title';
  title.textContent = 'Your APK Is Ready!';

  const text = document.createElement('p');
  text.className = 'modal-text';
  text.textContent = 'Click the Download button below to save the .apk file and install it on your Android phone.';

  const list = document.createElement('div');
  list.className = 'modal-summary-list';

  const rows = [
    ['File Name:', buildResult.fileName],
    ['App Name:', buildResult.appName],
    ['Package ID:', buildResult.packageName],
    ['File Size:', formatBytes(buildResult.fileSize)],
    ['Signature:', buildResult.verified ? 'APK Signature v1+v2+v3 (Verified)' : 'Unsigned']
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

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-secondary';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', onClose);

  const downloadBtn = renderDownloadApkButton({
    downloadUrl: buildResult.downloadUrl,
    fileName: buildResult.fileName
  });

  actions.append(closeBtn, downloadBtn);
  modal.append(badge, title, text, list, actions);
  backdrop.appendChild(modal);
  return backdrop;
}
