/**
 * Error & Retry/Fallback Dialog Popup (lib/popups/errorDialogPopup.js)
 */

export function renderErrorDialogPopup({
  titleText,
  messageText,
  onRetry,
  onFallbackManual,
  onClose
}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal-card';

  const badge = document.createElement('span');
  badge.className = 'badge badge-warn';
  badge.textContent = 'Action Needed';
  badge.style.marginBottom = '10px';

  const title = document.createElement('h3');
  title.className = 'modal-title';
  title.textContent = titleText || 'Something Went Wrong';

  const text = document.createElement('p');
  text.className = 'modal-text';
  text.textContent = messageText || 'Please check your internet connection or input values and try again.';

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-secondary';
  closeBtn.textContent = 'Dismiss';
  closeBtn.addEventListener('click', onClose);
  actions.appendChild(closeBtn);

  if (typeof onFallbackManual === 'function') {
    const fallbackBtn = document.createElement('button');
    fallbackBtn.type = 'button';
    fallbackBtn.className = 'btn btn-secondary';
    fallbackBtn.textContent = 'Continue Manually';
    fallbackBtn.addEventListener('click', onFallbackManual);
    actions.appendChild(fallbackBtn);
  }

  if (typeof onRetry === 'function') {
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn-primary';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', onRetry);
    actions.appendChild(retryBtn);
  }

  modal.append(badge, title, text, actions);
  backdrop.appendChild(modal);
  return backdrop;
}
