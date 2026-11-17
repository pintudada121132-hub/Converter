/**
 * Loading Progress Popup (lib/popups/loadingProgressPopup.js)
 */

const BUILD_STEPS = [
  '1. Generating Kotlin source files & compiling resources (aapt2)',
  '2. Compiling Kotlin code (kotlinc) & building DEX bytecode (d8)',
  '3. Aligning (zipalign) & signing APK with v1/v2/v3 schemes (apksigner)'
];

export function renderLoadingProgressPopup({ activeStepIndex }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal-card';

  const title = document.createElement('h3');
  title.className = 'modal-title';
  title.textContent = 'Building Your APK...';

  const text = document.createElement('p');
  text.className = 'modal-text';
  text.textContent = 'Please wait while your signed Android APK package is being generated.';

  const list = document.createElement('div');
  list.className = 'step-list';

  BUILD_STEPS.forEach((stepLabel, idx) => {
    const item = document.createElement('div');
    let stateClass = '';
    let stateText = 'Waiting';
    if (idx < activeStepIndex) {
      stateClass = 'done';
      stateText = 'Done';
    } else if (idx === activeStepIndex) {
      stateClass = 'active';
      stateText = 'Running...';
    }
    item.className = `step-item ${stateClass}`.trim();

    const left = document.createElement('span');
    left.textContent = stepLabel;
    const right = document.createElement('span');
    right.textContent = stateText;

    item.append(left, right);
    list.appendChild(item);
  });

  modal.append(title, text, list);
  backdrop.appendChild(modal);
  return backdrop;
}
