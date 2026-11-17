/**
 * Build Signed APK Button Component (lib/buttons/buildApkButton.js)
 */

export function renderBuildApkButton({ disabled, isBuilding, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.disabled = Boolean(disabled || isBuilding);
  btn.textContent = isBuilding ? 'Building APK...' : 'Build Signed APK';
  btn.addEventListener('click', onClick);
  return btn;
}
