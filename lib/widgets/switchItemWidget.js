/**
 * Single Feature Switch Item Widget (lib/widgets/switchItemWidget.js)
 */

export function renderSwitchItemWidget({ item, checked, onToggle }) {
  const row = document.createElement('div');
  row.className = 'switch-card';

  const meta = document.createElement('div');
  meta.className = 'switch-meta';

  const titleRow = document.createElement('div');
  titleRow.className = 'switch-title-row';

  const title = document.createElement('span');
  title.className = 'switch-title';
  title.textContent = item.title;

  const badge = document.createElement('span');
  badge.className = 'badge badge-neutral';
  badge.textContent = item.badge;

  titleRow.append(title, badge);

  const desc = document.createElement('p');
  desc.className = 'switch-desc';
  desc.textContent = item.description;

  meta.append(titleRow, desc);

  const label = document.createElement('label');
  label.className = 'toggle-switch';
  label.setAttribute('aria-label', item.title);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(checked);
  checkbox.addEventListener('change', (e) => onToggle(item.key, e.target.checked));

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';

  label.append(checkbox, slider);
  row.append(meta, label);
  return row;
}
