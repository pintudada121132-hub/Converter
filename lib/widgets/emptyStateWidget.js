/**
 * Empty State Widget (lib/widgets/emptyStateWidget.js)
 */

const SAMPLE_SITES = [
  { label: 'Wikipedia', url: 'https://en.wikipedia.org' },
  { label: 'Example.com', url: 'https://example.com' },
  { label: 'GitHub', url: 'https://github.com' }
];

export function renderEmptyStateWidget({ onSelectSample }) {
  const card = document.createElement('section');
  card.className = 'card empty-state';

  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.textContent = 'URL';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = 'No Website Detected Yet';

  const desc = document.createElement('p');
  desc.className = 'card-subtitle';
  desc.textContent =
    'Enter your website link above and click "Auto-Detect Website", or try one of the sample sites below.';

  const chips = document.createElement('div');
  chips.className = 'sample-links';

  for (const sample of SAMPLE_SITES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'sample-chip';
    chip.textContent = sample.label;
    chip.addEventListener('click', () => onSelectSample(sample.url));
    chips.appendChild(chip);
  }

  card.append(icon, title, desc, chips);
  return card;
}
