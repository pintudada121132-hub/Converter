/**
 * AdBlock & Redirection Guard Rules Service (lib/ads/adBlockRulesService.js)
 * Generates ad-domain blocklists, cosmetic CSS, and runtime JS protections injected into the APK WebView.
 */

export const AD_BLOCK_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'ads.pubmatic.com',
  'adnxs.com',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'exoclick.com',
  'taboola.com',
  'outbrain.com',
  'mgid.com',
  'revcontent.com',
  'criteo.com',
  'rubiconproject.com',
  'openx.net',
  'scorecardresearch.com',
  'zedo.com',
  'adcolony.com',
  'inmobi.com',
  'unityads.unity3d.com',
  'applovin.com',
  'adsafeprotected.com',
  'moatads.com'
];

/**
 * Builds the injected JavaScript payload executed by the APK WebView on page load/finish.
 * Implements optional switches cleanly without breaking site functionality when toggled off.
 */
export function buildInjectedWebViewScript({
  targetHost,
  responsiveFit,
  adBlocker,
  redirectBlocker,
  desktopMode,
  swipeRefresh
}) {
  const safeHost = String(targetHost || '').replace(/[^a-zA-Z0-9.-]/g, '');
  const hostsJson = JSON.stringify(AD_BLOCK_HOSTS);

  return `(function(){
  if (window.__web2apkInjected) return;
  window.__web2apkInjected = true;

  var cfg = {
    host: ${JSON.stringify(safeHost)},
    responsiveFit: ${Boolean(responsiveFit)},
    adBlocker: ${Boolean(adBlocker)},
    redirectBlocker: ${Boolean(redirectBlocker)},
    desktopMode: ${Boolean(desktopMode)},
    swipeRefresh: ${Boolean(swipeRefresh)}
  };

  // 1. Responsive Fit or Desktop Viewport
  try {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head && document.head.appendChild(meta);
    }
    if (cfg.desktopMode) {
      meta.content = 'width=1280, initial-scale=0.35, user-scalable=yes';
    } else if (cfg.responsiveFit) {
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0';
      var fitStyle = document.createElement('style');
      fitStyle.id = '__web2apk_fit_css';
      fitStyle.textContent = 'html, body { max-width: 100vw !important; overflow-x: hidden !important; } img, video, iframe, table { max-width: 100% !important; height: auto; }';
      document.head && document.head.appendChild(fitStyle);
    }
  } catch (e) {}

  // 2. Built-in AdBlocker (Cosmetic + Script/Frame Removal)
  if (cfg.adBlocker) {
    var blockedHosts = ${hostsJson};
    var adStyle = document.createElement('style');
    adStyle.id = '__web2apk_adblock_css';
    adStyle.textContent = [
      'ins.adsbygoogle, [id^="google_ads_"], [class*="adsbygoogle"],',
      '[id*="ad-banner"], [class*="ad-banner"], [class*="popup-ad"],',
      '[id*="taboola"], [id*="outbrain"], iframe[src*="doubleclick"],',
      'iframe[src*="googlesyndication"], iframe[src*="adnxs"],',
      'div[data-ad-slot], div[data-google-query-id] {',
      '  display: none !important; visibility: hidden !important; height: 0 !important;',
      '}'
    ].join(' ');
    document.head && document.head.appendChild(adStyle);

    var cleanAds = function() {
      var frames = document.querySelectorAll('iframe, script, img');
      for (var i = 0; i < frames.length; i++) {
        var el = frames[i];
        var src = (el.src || '').toLowerCase();
        if (!src) continue;
        for (var j = 0; j < blockedHosts.length; j++) {
          if (src.indexOf(blockedHosts[j]) !== -1) {
            el.remove();
            break;
          }
        }
      }
    };
    cleanAds();
    setInterval(cleanAds, 1800);
  }

  // 3. Redirection & Popup Blocker
  if (cfg.redirectBlocker) {
    window.open = function() {
      console.log('Web2APK blocked popup window');
      return null;
    };
    document.addEventListener('click', function(ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
      if (!a || !a.href) return;
      try {
        var linkHost = new URL(a.href, location.href).hostname.replace(/^www\\./, '');
        var baseHost = cfg.host.replace(/^www\\./, '');
        if (baseHost && linkHost && linkHost !== baseHost && !linkHost.endsWith('.' + baseHost)) {
          if (a.target === '_blank' || a.rel.indexOf('noopener') !== -1) {
            ev.preventDefault();
            ev.stopPropagation();
          }
        }
      } catch (err) {}
    }, true);
  }

  // 4. Swipe Down to Refresh (Pull-to-Refresh)
  if (cfg.swipeRefresh) {
    var startY = 0;
    var pulling = false;
    var pill = document.createElement('div');
    pill.style.cssText = 'position:fixed;top:-48px;left:50%;transform:translateX(-50%);background:#2563EB;color:#fff;padding:8px 16px;border-radius:999px;font-family:sans-serif;font-size:13px;font-weight:600;z-index:2147483647;transition:top 0.15s ease;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:none;';
    pill.textContent = 'Release to Refresh';
    document.body && document.body.appendChild(pill);

    document.addEventListener('touchstart', function(e) {
      if ((window.scrollY || document.documentElement.scrollTop || 0) <= 2 && e.touches && e.touches.length === 1) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      if (!pulling || !e.touches || !e.touches[0]) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 35) {
        pill.style.top = Math.min(20, dy - 40) + 'px';
        pill.textContent = dy > 105 ? 'Release to Refresh' : 'Pull down to refresh';
      }
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
      if (!pulling) return;
      pulling = false;
      var endY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : startY;
      var dy = endY - startY;
      pill.style.top = '-48px';
      if (dy > 105 && (window.scrollY || 0) <= 2) {
        location.reload();
      }
    }, { passive: true });
  }
})();`;
}
