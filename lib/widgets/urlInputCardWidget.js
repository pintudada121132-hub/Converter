/**
 * URL Input Card Widget (lib/widgets/urlInputCardWidget.js)
 */

import { renderDetectUrlButton } from '../buttons/detectUrlButton.js';

export function renderUrlInputCardWidget({
  urlValue,
  isDetecting,
  validationError,
  detectWarning,
  detectedHost,
  onUrlChange,
  onDetect
}) {
  const card = document.createElement('section');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'card-header';

  const titleWrap = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = '1. Enter Website URL';
  const sub = document.createElement('p');
  sub.className = 'card-subtitle';
  sub.textContent = 'Automatically detects the website Title, Icon, Theme Color, and mobile responsiveness.';
  titleWrap.append(title, sub);
  header.appendChild(titleWrap);

  if (detectedHost) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-success';
    badge.textContent = `Detected: ${detectedHost}`;
    header.appendChild(badge);
  }

  const field = document.createElement('div');
  field.className = 'field-group';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = 'websiteUrlInput';
  label.textContent = 'Website URL';

  const row = document.createElement('div');
  row.className = 'input-row';

  const input = document.createElement('input');
  input.id = 'websiteUrlInput';
  input.type = 'url';
  input.className = 'text-input';
  input.placeholder = 'https://example.com or wikipedia.org';
  input.value = urlValue;
  input.disabled = Boolean(isDetecting);
  input.addEventListener('input', (e) => onUrlChange(e.target.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !isDetecting) {
      e.preventDefault();
      onDetect();
    }
  });

  const detectBtn = renderDetectUrlButton({ isDetecting, onClick: onDetect });
  row.append(input, detectBtn);
  field.append(label, row);

  card.append(header, field);

  if (validationError) {
    const errBanner = document.createElement('div');
    errBanner.className = 'banner banner-error';
    errBanner.textContent = validationError;
    card.appendChild(errBanner);
  } else if (detectWarning) {
    const warnBanner = document.createElement('div');
    warnBanner.className = 'banner banner-warn';
    warnBanner.textContent = detectWarning;
    card.appendChild(warnBanner);
  }

  return card;
}
