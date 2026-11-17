/**
 * Feature Switches Configuration Service (lib/iap/featureConfigService.js)
 * Defines all 9 optional switches, defaults, validation, and descriptions.
 */

export const FEATURE_SWITCHES = [
  {
    key: 'responsiveFit',
    title: 'Phone Responsive Auto-Fit',
    badge: 'Core',
    defaultValue: true,
    description:
      'Automatically scales and fits the website to match mobile phone screen width.'
  },
  {
    key: 'adBlocker',
    title: 'Built-in AdBlocker',
    badge: 'Protection',
    defaultValue: true,
    description:
      'Blocks banner ads, popups, and common tracking domains inside the APK.'
  },
  {
    key: 'redirectBlocker',
    title: 'Redirection Blocker',
    badge: 'Protection',
    defaultValue: true,
    description:
      'Prevents unwanted external domain redirects and spam new-tab popups.'
  },
  {
    key: 'desktopMode',
    title: 'Desktop Mode View',
    badge: 'Display',
    defaultValue: false,
    description:
      'Loads the website using a Desktop User-Agent and a 1280px desktop viewport.'
  },
  {
    key: 'swipeRefresh',
    title: 'Swipe Down to Refresh',
    badge: 'UX',
    defaultValue: true,
    description:
      'Reloads the current page when the user pulls down from the top (Pull-to-Refresh).'
  },
  {
    key: 'offlineScreen',
    title: 'Offline No-Internet Screen',
    badge: 'UX',
    defaultValue: true,
    description:
      'Displays a clean offline message with a Retry button instead of a raw browser error.'
  },
  {
    key: 'fileSupport',
    title: 'File Download & Upload Support',
    badge: 'System',
    defaultValue: true,
    description:
      'Enables file access, downloads, and file/camera uploads inside the APK.'
  },
  {
    key: 'fullScreen',
    title: 'Full Screen Mode',
    badge: 'Display',
    defaultValue: false,
    description:
      'Hides the Android top status bar for an edge-to-edge full-screen app layout.'
  },
  {
    key: 'customIdentity',
    title: 'Custom App Name & Icon Edit',
    badge: 'Identity',
    defaultValue: true,
    description:
      'Allows editing the auto-detected App Name, Package ID, Theme Color, and Icon.'
  }
];

export function getDefaultSwitchState() {
  const state = {};
  for (const item of FEATURE_SWITCHES) {
    state[item.key] = item.defaultValue;
  }
  return state;
}

export function sanitizeSwitchState(inputSwitches = {}) {
  const defaults = getDefaultSwitchState();
  const result = {};
  for (const item of FEATURE_SWITCHES) {
    const val = inputSwitches[item.key];
    result[item.key] = typeof val === 'boolean' ? val : defaults[item.key];
  }
  return result;
}
