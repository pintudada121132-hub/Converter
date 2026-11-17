/**
 * Android Binary Manifest (AXML) Builder Service (lib/services/axmlBuilderService.js)
 * Generates a valid binary AndroidManifest.xml with package name, app label, permissions, and theme.
 */

const ANDROID_NS = 'http://schemas.android.com/apk/res/android';

// Must stay sorted by resourceId ascending for canonical Android AXML layout
const ANDROID_ATTR_DEFS = [
  { name: 'theme', resId: 0x01010000 },
  { name: 'label', resId: 0x01010001 },
  { name: 'icon', resId: 0x01010002 },
  { name: 'name', resId: 0x01010003 },
  { name: 'exported', resId: 0x01010010 },
  { name: 'configChanges', resId: 0x0101001f },
  { name: 'minSdkVersion', resId: 0x0101020c },
  { name: 'versionCode', resId: 0x0101021b },
  { name: 'versionName', resId: 0x0101021c },
  { name: 'targetSdkVersion', resId: 0x01010270 },
  { name: 'usesCleartextTraffic', resId: 0x010104ec }
];

const TYPE_REFERENCE = 0x01;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_INT_BOOLEAN = 0x12;

function encodeStringPoolUtf16(strings) {
  const encodedStrings = [];
  const offsets = [];
  let cursor = 0;

  for (const str of strings) {
    offsets.push(cursor);
    const len = str.length;
    const buf = Buffer.alloc(2 + len * 2 + 2);
    buf.writeUInt16LE(len, 0);
    for (let i = 0; i < len; i++) {
      buf.writeUInt16LE(str.charCodeAt(i), 2 + i * 2);
    }
    buf.writeUInt16LE(0, 2 + len * 2);
    encodedStrings.push(buf);
    cursor += buf.length;
  }

  const rawStringBytes = Buffer.concat(encodedStrings);
  const padLen = (4 - (rawStringBytes.length % 4)) % 4;
  const paddedStrings = padLen
    ? Buffer.concat([rawStringBytes, Buffer.alloc(padLen)])
    : rawStringBytes;

  const headerSize = 28;
  const stringsStart = headerSize + strings.length * 4;
  const chunkSize = stringsStart + paddedStrings.length;

  const header = Buffer.alloc(stringsStart);
  header.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  header.writeUInt16LE(headerSize, 2);
  header.writeUInt32LE(chunkSize, 4);
  header.writeUInt32LE(strings.length, 8);
  header.writeUInt32LE(0, 12); // styleCount
  header.writeUInt32LE(0, 16); // flags: UTF-16
  header.writeUInt32LE(stringsStart, 20);
  header.writeUInt32LE(0, 24); // stylesStart

  for (let i = 0; i < offsets.length; i++) {
    header.writeUInt32LE(offsets[i], headerSize + i * 4);
  }

  return Buffer.concat([header, paddedStrings]);
}

function makeResourceMapChunk(resIds) {
  const size = 8 + resIds.length * 4;
  const buf = Buffer.alloc(size);
  buf.writeUInt16LE(0x0180, 0); // RES_XML_RESOURCE_MAP_TYPE
  buf.writeUInt16LE(8, 2);
  buf.writeUInt32LE(size, 4);
  for (let i = 0; i < resIds.length; i++) {
    buf.writeUInt32LE(resIds[i], 8 + i * 4);
  }
  return buf;
}

function makeNamespaceChunk(isStart, line, prefixIdx, uriIdx) {
  const buf = Buffer.alloc(24);
  buf.writeUInt16LE(isStart ? 0x0100 : 0x0101, 0);
  buf.writeUInt16LE(16, 2);
  buf.writeUInt32LE(24, 4);
  buf.writeUInt32LE(line, 8);
  buf.writeInt32LE(-1, 12);
  buf.writeInt32LE(prefixIdx, 16);
  buf.writeInt32LE(uriIdx, 20);
  return buf;
}

function makeStartElementChunk(line, nameIdx, attrs) {
  const size = 36 + attrs.length * 20;
  const buf = Buffer.alloc(size);
  buf.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
  buf.writeUInt16LE(16, 2);
  buf.writeUInt32LE(size, 4);
  buf.writeUInt32LE(line, 8);
  buf.writeInt32LE(-1, 12);

  buf.writeInt32LE(-1, 16); // ns
  buf.writeInt32LE(nameIdx, 20);
  buf.writeUInt16LE(20, 24); // attributeStart
  buf.writeUInt16LE(20, 26); // attributeSize
  buf.writeUInt16LE(attrs.length, 28);
  buf.writeUInt16LE(0, 30); // idIndex
  buf.writeUInt16LE(0, 32); // classIndex
  buf.writeUInt16LE(0, 34); // styleIndex

  let off = 36;
  for (const attr of attrs) {
    buf.writeInt32LE(attr.nsIdx, off);
    buf.writeInt32LE(attr.nameIdx, off + 4);
    buf.writeInt32LE(attr.rawValueIdx, off + 8);
    buf.writeUInt16LE(8, off + 12); // typedValue.size
    buf.writeUInt8(0, off + 14);
    buf.writeUInt8(attr.dataType, off + 15);
    buf.writeUInt32LE(attr.data >>> 0, off + 16);
    off += 20;
  }
  return buf;
}

function makeEndElementChunk(line, nameIdx) {
  const buf = Buffer.alloc(24);
  buf.writeUInt16LE(0x0103, 0); // RES_XML_END_ELEMENT_TYPE
  buf.writeUInt16LE(16, 2);
  buf.writeUInt32LE(24, 4);
  buf.writeUInt32LE(line, 8);
  buf.writeInt32LE(-1, 12);
  buf.writeInt32LE(-1, 16);
  buf.writeInt32LE(nameIdx, 20);
  return buf;
}

export function buildBinaryManifest({ packageName, appName, fullScreen }) {
  const strings = [];
  const stringMap = new Map();

  for (const def of ANDROID_ATTR_DEFS) {
    stringMap.set(def.name, strings.length);
    strings.push(def.name);
  }

  const intern = (s) => {
    const val = String(s);
    if (stringMap.has(val)) return stringMap.get(val);
    const idx = strings.length;
    stringMap.set(val, idx);
    strings.push(val);
    return idx;
  };

  const prefixIdx = intern('android');
  const nsIdx = intern(ANDROID_NS);
  const tagManifest = intern('manifest');
  const tagUsesSdk = intern('uses-sdk');
  const tagUsesPerm = intern('uses-permission');
  const tagApp = intern('application');
  const tagActivity = intern('activity');
  const tagIntentFilter = intern('intent-filter');
  const tagAction = intern('action');
  const tagCategory = intern('category');
  const attrPackage = intern('package');

  const valPkg = intern(packageName);
  const valVersionName = intern('1.0');
  const valAppName = intern(appName || 'Web2APK App');
  const valPermInternet = intern('android.permission.INTERNET');
  const valPermNetState = intern('android.permission.ACCESS_NETWORK_STATE');
  const valActivityName = intern(`${packageName}.MainActivity`);
  const valActionMain = intern('android.intent.action.MAIN');
  const valCatLauncher = intern('android.intent.category.LAUNCHER');

  const attrIdx = (name) => stringMap.get(name);
  const themeResId = fullScreen ? 0x01030007 : 0x01030006; // Theme.NoTitleBar(.Fullscreen)

  const chunks = [
    encodeStringPoolUtf16(strings),
    makeResourceMapChunk(ANDROID_ATTR_DEFS.map((d) => d.resId)),
    makeNamespaceChunk(true, 1, prefixIdx, nsIdx),

    // <manifest>
    makeStartElementChunk(2, tagManifest, [
      {
        nsIdx,
        nameIdx: attrIdx('versionCode'),
        rawValueIdx: -1,
        dataType: TYPE_INT_DEC,
        data: 1
      },
      {
        nsIdx,
        nameIdx: attrIdx('versionName'),
        rawValueIdx: valVersionName,
        dataType: TYPE_STRING,
        data: valVersionName
      },
      {
        nsIdx: -1,
        nameIdx: attrPackage,
        rawValueIdx: valPkg,
        dataType: TYPE_STRING,
        data: valPkg
      }
    ]),

    // <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="34" />
    makeStartElementChunk(3, tagUsesSdk, [
      {
        nsIdx,
        nameIdx: attrIdx('minSdkVersion'),
        rawValueIdx: -1,
        dataType: TYPE_INT_DEC,
        data: 21
      },
      {
        nsIdx,
        nameIdx: attrIdx('targetSdkVersion'),
        rawValueIdx: -1,
        dataType: TYPE_INT_DEC,
        data: 34
      }
    ]),
    makeEndElementChunk(3, tagUsesSdk),

    // <uses-permission android:name="android.permission.INTERNET" />
    makeStartElementChunk(4, tagUsesPerm, [
      {
        nsIdx,
        nameIdx: attrIdx('name'),
        rawValueIdx: valPermInternet,
        dataType: TYPE_STRING,
        data: valPermInternet
      }
    ]),
    makeEndElementChunk(4, tagUsesPerm),

    // <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    makeStartElementChunk(5, tagUsesPerm, [
      {
        nsIdx,
        nameIdx: attrIdx('name'),
        rawValueIdx: valPermNetState,
        dataType: TYPE_STRING,
        data: valPermNetState
      }
    ]),
    makeEndElementChunk(5, tagUsesPerm),

    // <application>
    makeStartElementChunk(6, tagApp, [
      {
        nsIdx,
        nameIdx: attrIdx('theme'),
        rawValueIdx: -1,
        dataType: TYPE_REFERENCE,
        data: themeResId
      },
      {
        nsIdx,
        nameIdx: attrIdx('label'),
        rawValueIdx: valAppName,
        dataType: TYPE_STRING,
        data: valAppName
      },
      {
        nsIdx,
        nameIdx: attrIdx('icon'),
        rawValueIdx: -1,
        dataType: TYPE_REFERENCE,
        data: 0x7f010000
      },
      {
        nsIdx,
        nameIdx: attrIdx('usesCleartextTraffic'),
        rawValueIdx: -1,
        dataType: TYPE_INT_BOOLEAN,
        data: 0xffffffff
      }
    ]),

    // <activity>
    makeStartElementChunk(7, tagActivity, [
      {
        nsIdx,
        nameIdx: attrIdx('label'),
        rawValueIdx: valAppName,
        dataType: TYPE_STRING,
        data: valAppName
      },
      {
        nsIdx,
        nameIdx: attrIdx('name'),
        rawValueIdx: valActivityName,
        dataType: TYPE_STRING,
        data: valActivityName
      },
      {
        nsIdx,
        nameIdx: attrIdx('exported'),
        rawValueIdx: -1,
        dataType: TYPE_INT_BOOLEAN,
        data: 0xffffffff
      },
      {
        nsIdx,
        nameIdx: attrIdx('configChanges'),
        rawValueIdx: -1,
        dataType: TYPE_INT_HEX,
        data: 0x04a0 // orientation | screenSize | keyboardHidden
      }
    ]),

    // <intent-filter>
    makeStartElementChunk(8, tagIntentFilter, []),
    makeStartElementChunk(9, tagAction, [
      {
        nsIdx,
        nameIdx: attrIdx('name'),
        rawValueIdx: valActionMain,
        dataType: TYPE_STRING,
        data: valActionMain
      }
    ]),
    makeEndElementChunk(9, tagAction),
    makeStartElementChunk(10, tagCategory, [
      {
        nsIdx,
        nameIdx: attrIdx('name'),
        rawValueIdx: valCatLauncher,
        dataType: TYPE_STRING,
        data: valCatLauncher
      }
    ]),
    makeEndElementChunk(10, tagCategory),
    makeEndElementChunk(11, tagIntentFilter),

    makeEndElementChunk(12, tagActivity),
    makeEndElementChunk(13, tagApp),
    makeEndElementChunk(14, tagManifest),
    makeNamespaceChunk(false, 15, prefixIdx, nsIdx)
  ];

  const body = Buffer.concat(chunks);
  const fileHeader = Buffer.alloc(8);
  fileHeader.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  fileHeader.writeUInt16LE(8, 2);
  fileHeader.writeUInt32LE(8 + body.length, 4);

  return Buffer.concat([fileHeader, body]);
}
