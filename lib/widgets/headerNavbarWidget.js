/**
 * Header Navbar Widget (lib/widgets/headerNavbarWidget.js)
 */

export function renderHeaderNavbarWidget({ hasDetected }) {
  const header = document.createElement('header');
  header.className = 'navbar';

  const inner = document.createElement('div');
  inner.className = 'navbar-inner';

  const brand = document.createElement('div');
  brand.className = 'brand-group';

  const mark = document.createElement('div');
  mark.className = 'brand-mark';
  mark.textContent = 'APK';

  const textWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'brand-title';
  title.textContent = 'Website to APK Builder';

  const sub = document.createElement('div');
  sub.className = 'brand-subtitle';
  sub.textContent = 'Enter a link, auto-detect details, toggle switches, and build a signed APK';

  textWrap.append(title, sub);
  brand.append(mark, textWrap);

  const pill = document.createElement('span');
  pill.className = 'status-pill';
  pill.textContent = hasDetected ? 'Website Ready' : 'Step 1: Enter URL';

  inner.append(brand, pill);
  header.appendChild(inner);
  return header;
}
