/**
 * App Identity Card Widget (lib/widgets/appIdentityCardWidget.js)
 * Displays auto-detected App Name, Package ID, Theme Color, Responsive Status, and Custom Icon Upload.
 */

function fileToPngDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read the selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Please select a valid image file (PNG/JPG).'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 96, 96);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function renderAppIdentityCardWidget({
  appName,
  packageName,
  themeColor,
  iconPreviewUrl,
  isMobileOptimized,
  canEdit,
  onFieldChange
}) {
  const card = document.createElement('section');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'card-header';

  const titleWrap = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = '2. Auto-Detected App Identity';
  const sub = document.createElement('p');
  sub.className = 'card-subtitle';
  sub.textContent = canEdit
    ? 'You can customize the auto-detected App Name, Package ID, Theme Color, and Icon.'
    : 'Custom Identity switch is OFF — auto-detected details are locked.';
  titleWrap.append(title, sub);

  const respBadge = document.createElement('span');
  respBadge.className = isMobileOptimized ? 'badge badge-success' : 'badge badge-warn';
  respBadge.textContent = isMobileOptimized
    ? 'Site Mobile Ready'
    : 'Desktop-First (Auto-Fit Recommended)';

  header.append(titleWrap, respBadge);

  // Preview + Icon upload row
  const previewRow = document.createElement('div');
  previewRow.className = 'identity-preview-row';

  const iconBox = document.createElement('div');
  iconBox.className = 'app-icon-box';
  iconBox.style.backgroundColor = themeColor || '#2563EB';
  if (iconPreviewUrl) {
    const img = document.createElement('img');
    img.src = iconPreviewUrl;
    img.alt = 'App Icon';
    img.onerror = () => {
      iconBox.innerHTML = '';
      iconBox.textContent = (appName || 'A').charAt(0).toUpperCase();
    };
    iconBox.appendChild(img);
  } else {
    iconBox.textContent = (appName || 'A').charAt(0).toUpperCase();
  }

  const iconInfo = document.createElement('div');
  iconInfo.style.flex = '1';
  const iconTitle = document.createElement('div');
  iconTitle.className = 'field-label';
  iconTitle.textContent = appName || 'Web2APK App';
  const iconSub = document.createElement('div');
  iconSub.className = 'card-subtitle';
  iconSub.textContent = packageName || 'com.web2apk.app';
  iconInfo.append(iconTitle, iconSub);

  const uploadBtnLabel = document.createElement('label');
  uploadBtnLabel.className = 'btn btn-secondary btn-small';
  uploadBtnLabel.textContent = 'Upload Icon PNG';
  if (!canEdit) {
    uploadBtnLabel.style.opacity = '0.5';
    uploadBtnLabel.style.pointerEvents = 'none';
  }
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.className = 'hidden';
  fileInput.disabled = !canEdit;
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const pngUrl = await fileToPngDataUrl(file);
      onFieldChange('customIconDataUrl', pngUrl);
    } catch (err) {
      alert(err.message);
    }
  });
  uploadBtnLabel.appendChild(fileInput);

  previewRow.append(iconBox, iconInfo, uploadBtnLabel);

  // Fields
  const fieldsGrid = document.createElement('div');
  fieldsGrid.className = 'two-col-fields';

  const nameGroup = document.createElement('div');
  nameGroup.className = 'field-group';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'field-label';
  nameLabel.textContent = 'App Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'text-input';
  nameInput.maxLength = 32;
  nameInput.value = appName;
  nameInput.disabled = !canEdit;
  nameInput.addEventListener('input', (e) => onFieldChange('appName', e.target.value));
  nameGroup.append(nameLabel, nameInput);

  const pkgGroup = document.createElement('div');
  pkgGroup.className = 'field-group';
  const pkgLabel = document.createElement('label');
  pkgLabel.className = 'field-label';
  pkgLabel.textContent = 'Android Package ID';
  const pkgInput = document.createElement('input');
  pkgInput.type = 'text';
  pkgInput.className = 'text-input';
  pkgInput.value = packageName;
  pkgInput.disabled = !canEdit;
  pkgInput.addEventListener('input', (e) => onFieldChange('packageName', e.target.value));
  pkgGroup.append(pkgLabel, pkgInput);

  fieldsGrid.append(nameGroup, pkgGroup);

  const colorGroup = document.createElement('div');
  colorGroup.className = 'field-group';
  colorGroup.style.marginBottom = '0';
  const colorLabel = document.createElement('label');
  colorLabel.className = 'field-label';
  colorLabel.textContent = 'App Theme Color';
  const colorWrap = document.createElement('div');
  colorWrap.className = 'color-picker-wrap';
  const colorPicker = document.createElement('input');
  colorPicker.type = 'color';
  colorPicker.className = 'color-input';
  colorPicker.value = themeColor || '#2563EB';
  colorPicker.disabled = !canEdit;
  colorPicker.addEventListener('input', (e) => onFieldChange('themeColor', e.target.value));
  const colorCode = document.createElement('span');
  colorCode.className = 'card-subtitle';
  colorCode.textContent = (themeColor || '#2563EB').toUpperCase();
  colorWrap.append(colorPicker, colorCode);
  colorGroup.append(colorLabel, colorWrap);

  card.append(header, previewRow, fieldsGrid, colorGroup);
  return card;
}
