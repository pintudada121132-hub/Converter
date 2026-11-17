/**
 * Interactive Phone / Desktop APK Preview Widget (lib/widgets/phonePreviewWidget.js)
 */

export function renderPhonePreviewWidget({
  appName,
  url,
  hostname,
  themeColor,
  switches,
  simulateOffline,
  refreshMessage,
  onToggleOfflinePreview,
  onSimulateRefresh
}) {
  const card = document.createElement('aside');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'card-header';
  const titleWrap = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = 'Live APK Phone Preview';
  const sub = document.createElement('p');
  sub.className = 'card-subtitle';
  sub.textContent = 'Toggle switches to see real-time changes inside the phone preview.';
  titleWrap.append(title, sub);
  header.appendChild(titleWrap);

  const toolbar = document.createElement('div');
  toolbar.className = 'preview-toolbar';

  const modePill = document.createElement('span');
  modePill.className = 'badge badge-info';
  modePill.textContent = switches.desktopMode
    ? 'Desktop View (1280px)'
    : switches.responsiveFit
      ? 'Phone Auto-Fit ON'
      : 'Unscaled Mobile View';

  const offlineBtn = document.createElement('button');
  offlineBtn.type = 'button';
  offlineBtn.className = 'btn btn-secondary btn-small';
  offlineBtn.textContent = simulateOffline ? 'Back to Online View' : 'Test Offline Screen';
  offlineBtn.addEventListener('click', onToggleOfflinePreview);

  toolbar.append(modePill, offlineBtn);

  // Phone Frame
  const frame = document.createElement('div');
  frame.className = 'phone-frame';

  if (!switches.fullScreen) {
    const statusBar = document.createElement('div');
    statusBar.className = 'phone-status-bar';
    statusBar.innerHTML = '<span>9:41</span><span>4G  100%</span>';
    frame.appendChild(statusBar);
  }

  const appBar = document.createElement('div');
  appBar.className = 'phone-app-header';
  const appBarTitle = document.createElement('strong');
  appBarTitle.textContent = appName || 'Web2APK App';
  const appBarHost = document.createElement('span');
  appBarHost.style.color = '#64748b';
  appBarHost.textContent = hostname || 'example.com';
  appBar.append(appBarTitle, appBarHost);
  frame.appendChild(appBar);

  const screen = document.createElement('div');
  screen.className = 'phone-screen';

  if (simulateOffline) {
    if (switches.offlineScreen) {
      const offCard = document.createElement('div');
      offCard.className = 'preview-offline-card';
      offCard.innerHTML = `
        <div style="font-weight:700;font-size:16px;margin-bottom:6px;">No Internet Connection</div>
        <div style="font-size:12px;color:#475569;margin-bottom:14px;">Custom Offline Screen is active.</div>
      `;
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'btn btn-primary btn-small';
      retryBtn.style.backgroundColor = themeColor || '#2563EB';
      retryBtn.textContent = 'Retry Connection';
      retryBtn.addEventListener('click', onToggleOfflinePreview);
      offCard.appendChild(retryBtn);
      screen.appendChild(offCard);
    } else {
      const rawErr = document.createElement('div');
      rawErr.className = 'preview-offline-card';
      rawErr.innerHTML = `
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">Webpage not available</div>
        <div style="font-size:12px;color:#64748b;">net::ERR_INTERNET_DISCONNECTED (Offline Screen switch is OFF)</div>
      `;
      screen.appendChild(rawErr);
    }
  } else {
    if (switches.swipeRefresh) {
      const ptr = document.createElement('div');
      ptr.className = 'ptr-banner';
      ptr.textContent = refreshMessage || 'Swipe down / Click here to simulate Pull-to-Refresh';
      ptr.addEventListener('click', onSimulateRefresh);
      screen.appendChild(ptr);
    }

    const viewportBox = document.createElement('div');
    if (switches.desktopMode) {
      viewportBox.className = 'phone-viewport-desktop';
    } else if (!switches.responsiveFit) {
      viewportBox.className = 'phone-viewport-unfit';
    }

    const siteCard = document.createElement('div');
    siteCard.className = 'preview-site-card';

    const siteTitle = document.createElement('div');
    siteTitle.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:6px;';
    siteTitle.style.color = themeColor || '#2563EB';
    siteTitle.textContent = appName || 'Your Website App';

    const siteUrl = document.createElement('div');
    siteUrl.style.cssText = 'font-size:12px;color:#475569;word-break:break-all;margin-bottom:10px;';
    siteUrl.textContent = url || 'https://example.com';

    const siteBody = document.createElement('div');
    siteBody.style.cssText = 'font-size:12px;color:#0f172a;';
    siteBody.textContent = switches.desktopMode
      ? 'Desktop Mode is active: Website is scaled to a 1280px desktop layout.'
      : switches.responsiveFit
        ? 'Responsive Auto-Fit is active: Content cleanly fits within phone screen width.'
        : 'Responsive Auto-Fit is OFF: Wide pages may require horizontal scrolling.';

    siteCard.append(siteTitle, siteUrl, siteBody);

    if (!switches.adBlocker) {
      const adSlot = document.createElement('div');
      adSlot.className = 'preview-ad-slot';
      adSlot.textContent = 'Ad Banner Slot (Visible when AdBlocker is OFF)';
      siteCard.appendChild(adSlot);
    }

    viewportBox.appendChild(siteCard);
    screen.appendChild(viewportBox);
  }

  frame.appendChild(screen);

  // Active Protection Summary Badges
  const badges = document.createElement('div');
  badges.className = 'preview-badges-grid';
  const statusBadges = [
    { label: 'AdBlocker', on: switches.adBlocker },
    { label: 'Redirect Guard', on: switches.redirectBlocker },
    { label: 'Swipe Refresh', on: switches.swipeRefresh },
    { label: 'File Support', on: switches.fileSupport },
    { label: 'Full Screen', on: switches.fullScreen }
  ];
  for (const b of statusBadges) {
    const span = document.createElement('span');
    span.className = b.on ? 'badge badge-success' : 'badge badge-neutral';
    span.textContent = `${b.label}: ${b.on ? 'ON' : 'OFF'}`;
    badges.appendChild(span);
  }

  card.append(header, toolbar, frame, badges);
  return card;
}
