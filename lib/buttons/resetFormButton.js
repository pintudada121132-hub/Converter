/**
 * Reset Form Button Component (lib/buttons/resetFormButton.js)
 */

export function renderResetFormButton({ disabled, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary';
  btn.disabled = Boolean(disabled);
  btn.textContent = 'Reset All';
  btn.addEventListener('click', onClick);
  return btn;
}
