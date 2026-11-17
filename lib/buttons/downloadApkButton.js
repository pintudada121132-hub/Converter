/**
 * Download APK Button Component (lib/buttons/downloadApkButton.js)
 */

export function renderDownloadApkButton({ downloadUrl, fileName }) {
  const link = document.createElement('a');
  link.className = 'btn btn-success';
  link.href = downloadUrl;
  link.download = fileName || 'app.apk';
  link.textContent = `Download ${fileName || '.APK'}`;
  return link;
}
