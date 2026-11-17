/**
 * Detect URL Button Component (lib/buttons/detectUrlButton.js)
 */

export function renderDetectUrlButton({ isDetecting, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.disabled = Boolean(isDetecting);
  btn.textContent = isDetecting ? 'Detecting...' : 'Auto-Detect Website';
  btn.addEventListener('click', onClick);
  return btn;
}
