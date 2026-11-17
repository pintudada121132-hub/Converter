/**
 * Android Resource Table (resources.arsc) & PNG Icon Generator (lib/services/arscBuilderService.js)
 * Builds a valid minimal resources.arsc pointing 0x7f010000 -> res/drawable/icon.png
 * and generates a crisp 96x96 PNG app icon if no custom PNG was uploaded.
 */

import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32Buffer(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeUtf16StringPool(strings) {
  const encoded = [];
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
    encoded.push(buf);
    cursor += buf.length;
  }

  const rawBytes = Buffer.concat(encoded);
  const pad = (4 - (rawBytes.length % 4)) % 4;
  const padded = pad ? Buffer.concat([rawBytes, Buffer.alloc(pad)]) : rawBytes;

  const headerSize = 28;
  const stringsStart = headerSize + strings.length * 4;
  const chunkSize = stringsStart + padded.length;

  const hdr = Buffer.alloc(stringsStart);
  hdr.writeUInt16LE(0x0001, 0);
  hdr.writeUInt16LE(headerSize, 2);
  hdr.writeUInt32LE(chunkSize, 4);
  hdr.writeUInt32LE(strings.length, 8);
  hdr.writeUInt32LE(0, 12);
  hdr.writeUInt32LE(0, 16); // UTF-16
  hdr.writeUInt32LE(stringsStart, 20);
  hdr.writeUInt32LE(0, 24);

  for (let i = 0; i < offsets.length; i++) {
    hdr.writeUInt32LE(offsets[i], headerSize + i * 4);
  }
  return Buffer.concat([hdr, padded]);
}

export function buildResourcesArsc(packageName) {
  const globalStrings = encodeUtf16StringPool(['res/drawable/icon.png']);
  const typeStrings = encodeUtf16StringPool(['drawable']);
  const keyStrings = encodeUtf16StringPool(['icon']);

  // ResTable_typeSpec (20 bytes)
  const typeSpec = Buffer.alloc(20);
  typeSpec.writeUInt16LE(0x0202, 0); // RES_TABLE_TYPE_SPEC_TYPE
  typeSpec.writeUInt16LE(16, 2);
  typeSpec.writeUInt32LE(20, 4);
  typeSpec.writeUInt8(1, 8); // id = 1 (drawable)
  typeSpec.writeUInt8(0, 9);
  typeSpec.writeUInt16LE(0, 10);
  typeSpec.writeUInt32LE(1, 12); // entryCount = 1
  typeSpec.writeUInt32LE(0, 16); // flags[0] = 0

  // ResTable_type (header 84 + offset table 4 + entry 16 = 104 bytes)
  const typeChunk = Buffer.alloc(104);
  typeChunk.writeUInt16LE(0x0201, 0); // RES_TABLE_TYPE_TYPE
  typeChunk.writeUInt16LE(84, 2);
  typeChunk.writeUInt32LE(104, 4);
  typeChunk.writeUInt8(1, 8); // id = 1
  typeChunk.writeUInt8(0, 9);
  typeChunk.writeUInt16LE(0, 10);
  typeChunk.writeUInt32LE(1, 12); // entryCount = 1
  typeChunk.writeUInt32LE(88, 16); // entriesStart = 84 + 4
  typeChunk.writeUInt32LE(64, 20); // ResTable_config.size = 64
  typeChunk.writeUInt32LE(0, 84); // offsets[0] = 0

  // ResTable_entry + Res_value at byte 88
  typeChunk.writeUInt16LE(8, 88); // entry.size
  typeChunk.writeUInt16LE(0, 90); // entry.flags
  typeChunk.writeUInt32LE(0, 92); // key.index = 0 ('icon')
  typeChunk.writeUInt16LE(8, 96); // value.size
  typeChunk.writeUInt8(0, 98); // value.res0
  typeChunk.writeUInt8(0x03, 99); // TYPE_STRING
  typeChunk.writeUInt32LE(0, 100); // globalStrings[0] = 'res/drawable/icon.png'

  const pkgHeaderSize = 288;
  const pkgBody = Buffer.concat([typeStrings, keyStrings, typeSpec, typeChunk]);
  const pkgHeader = Buffer.alloc(pkgHeaderSize);
  pkgHeader.writeUInt16LE(0x0200, 0); // RES_TABLE_PACKAGE_TYPE
  pkgHeader.writeUInt16LE(pkgHeaderSize, 2);
  pkgHeader.writeUInt32LE(pkgHeaderSize + pkgBody.length, 4);
  pkgHeader.writeUInt32LE(0x7f, 8); // package id

  const safePkg = String(packageName || 'com.web2apk.app').slice(0, 127);
  for (let i = 0; i < safePkg.length; i++) {
    pkgHeader.writeUInt16LE(safePkg.charCodeAt(i), 12 + i * 2);
  }

  pkgHeader.writeUInt32LE(pkgHeaderSize, 268); // typeStrings offset
  pkgHeader.writeUInt32LE(1, 272); // lastPublicType
  pkgHeader.writeUInt32LE(pkgHeaderSize + typeStrings.length, 276); // keyStrings offset
  pkgHeader.writeUInt32LE(1, 280); // lastPublicKey
  pkgHeader.writeUInt32LE(0, 284); // typeIdOffset

  const pkgChunk = Buffer.concat([pkgHeader, pkgBody]);

  const tableHeaderSize = 12;
  const totalSize = tableHeaderSize + globalStrings.length + pkgChunk.length;
  const tableHeader = Buffer.alloc(tableHeaderSize);
  tableHeader.writeUInt16LE(0x0002, 0); // RES_TABLE_TYPE
  tableHeader.writeUInt16LE(tableHeaderSize, 2);
  tableHeader.writeUInt32LE(totalSize, 4);
  tableHeader.writeUInt32LE(1, 8); // packageCount = 1

  return Buffer.concat([tableHeader, globalStrings, pkgChunk]);
}

function parseHexColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return { r: 37, g: 99, b: 235 }; // #2563EB
  const num = parseInt(m[1], 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function makePngChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32Buffer(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

export function generateAppIconPng(themeColor, customIconDataUrl) {
  if (typeof customIconDataUrl === 'string' && customIconDataUrl.startsWith('data:image/png;base64,')) {
    const raw = Buffer.from(customIconDataUrl.split(',')[1], 'base64');
    if (raw.length > 24 && raw.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      return raw;
    }
  }

  const size = 96;
  const { r, g, b } = parseHexColor(themeColor);
  const rawScanlines = Buffer.alloc(size * (1 + size * 4));
  const cornerRadius = 20;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    rawScanlines[rowStart] = 0; // filter None

    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;

      // Rounded square mask
      let dx = 0;
      let dy = 0;
      if (x < cornerRadius) dx = cornerRadius - x;
      else if (x >= size - cornerRadius) dx = x - (size - cornerRadius - 1);
      if (y < cornerRadius) dy = cornerRadius - y;
      else if (y >= size - cornerRadius) dy = y - (size - cornerRadius - 1);

      const insideRounded = dx * dx + dy * dy <= cornerRadius * cornerRadius;
      if (!insideRounded) {
        rawScanlines[px] = 0;
        rawScanlines[px + 1] = 0;
        rawScanlines[px + 2] = 0;
        rawScanlines[px + 3] = 0;
        continue;
      }

      // Draw crisp white inner window glyph (centered 44x44 box with top bar)
      const inBox = x >= 26 && x <= 70 && y >= 26 && y <= 70;
      const onBorder = inBox && (x <= 30 || x >= 66 || y <= 35 || y >= 66);
      const inCenterBar = x >= 36 && x <= 60 && y >= 46 && y <= 52;

      if (onBorder || inCenterBar) {
        rawScanlines[px] = 255;
        rawScanlines[px + 1] = 255;
        rawScanlines[px + 2] = 255;
        rawScanlines[px + 3] = 255;
      } else {
        rawScanlines[px] = r;
        rawScanlines[px + 1] = g;
        rawScanlines[px + 2] = b;
        rawScanlines[px + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(rawScanlines);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0))
  ]);
}
