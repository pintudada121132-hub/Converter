/**
 * Android DEX (classes.dex) Binary Builder Service (lib/services/dexBuilderService.js)
 * Generates a spec-compliant Dalvik Executable (DEX 035) containing MainActivity and AppWebViewClient.
 */

import crypto from 'node:crypto';
import { AD_BLOCK_HOSTS } from '../ads/adBlockRulesService.js';

function encodeUleb128(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function encodeMutf8(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 0) {
      bytes.push(0xc0, 0x80);
    } else if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return Buffer.from(bytes);
}

function adler32(buf) {
  const MOD_ADLER = 65521;
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }
  return ((b << 16) | a) >>> 0;
}

function compareStringsCodePoint(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ca = a.charCodeAt(i);
    const cb = b.charCodeAt(i);
    if (ca !== cb) return ca - cb;
  }
  return a.length - b.length;
}

class DexAssembler {
  constructor() {
    this.strings = new Set();
    this.types = new Set();
    this.protos = new Map();
    this.fields = new Map();
    this.methods = new Map();
    this.classes = [];
  }

  addString(s) {
    this.strings.add(s);
    return s;
  }

  addType(desc) {
    this.addString(desc);
    this.types.add(desc);
    return desc;
  }

  addProto(returnType, paramTypes = []) {
    this.addType(returnType);
    for (const p of paramTypes) this.addType(p);
    const shorty =
      (returnType.length === 1 ? returnType : 'L') +
      paramTypes.map((p) => (p.length === 1 ? p : 'L')).join('');
    this.addString(shorty);
    const key = `${returnType}(${paramTypes.join('')})`;
    if (!this.protos.has(key)) {
      this.protos.set(key, { key, returnType, paramTypes, shorty });
    }
    return key;
  }

  addField(classType, name, fieldType) {
    this.addType(classType);
    this.addString(name);
    this.addType(fieldType);
    const key = `${classType}->${name}:${fieldType}`;
    if (!this.fields.has(key)) {
      this.fields.set(key, { key, classType, name, fieldType });
    }
    return key;
  }

  addMethod(classType, name, returnType, paramTypes = []) {
    this.addType(classType);
    this.addString(name);
    const protoKey = this.addProto(returnType, paramTypes);
    const key = `${classType}->${name}:${protoKey}`;
    if (!this.methods.has(key)) {
      this.methods.set(key, { key, classType, name, protoKey });
    }
    return key;
  }

  addClass(def) {
    this.addType(def.type);
    this.addType(def.superType);
    this.classes.push(def);
  }

  compile() {
    // 1. Sort string_ids
    const sortedStrings = Array.from(this.strings).sort(compareStringsCodePoint);
    const strIdx = new Map(sortedStrings.map((s, i) => [s, i]));

    // 2. Sort type_ids by descriptor string index
    const sortedTypes = Array.from(this.types).sort((a, b) => strIdx.get(a) - strIdx.get(b));
    const typeIdx = new Map(sortedTypes.map((t, i) => [t, i]));

    // 3. Sort proto_ids by returnType index, then parameter type indices
    const sortedProtos = Array.from(this.protos.values()).sort((a, b) => {
      const rDiff = typeIdx.get(a.returnType) - typeIdx.get(b.returnType);
      if (rDiff !== 0) return rDiff;
      const minLen = Math.min(a.paramTypes.length, b.paramTypes.length);
      for (let i = 0; i < minLen; i++) {
        const pDiff = typeIdx.get(a.paramTypes[i]) - typeIdx.get(b.paramTypes[i]);
        if (pDiff !== 0) return pDiff;
      }
      return a.paramTypes.length - b.paramTypes.length;
    });
    const protoIdx = new Map(sortedProtos.map((p, i) => [p.key, i]));

    // 4. Sort field_ids by (class_idx, name_idx, type_idx)
    const sortedFields = Array.from(this.fields.values()).sort((a, b) => {
      return (
        typeIdx.get(a.classType) - typeIdx.get(b.classType) ||
        strIdx.get(a.name) - strIdx.get(b.name) ||
        typeIdx.get(a.fieldType) - typeIdx.get(b.fieldType)
      );
    });
    const fieldIdx = new Map(sortedFields.map((f, i) => [f.key, i]));

    // 5. Sort method_ids by (class_idx, name_idx, proto_idx)
    const sortedMethods = Array.from(this.methods.values()).sort((a, b) => {
      return (
        typeIdx.get(a.classType) - typeIdx.get(b.classType) ||
        strIdx.get(a.name) - strIdx.get(b.name) ||
        protoIdx.get(a.protoKey) - protoIdx.get(b.protoKey)
      );
    });
    const methodIdx = new Map(sortedMethods.map((m, i) => [m.key, i]));

    const ctx = { strIdx, typeIdx, protoIdx, fieldIdx, methodIdx };

    // Calculate ID section offsets
    const headerSize = 0x70;
    const stringIdsOff = headerSize;
    const typeIdsOff = stringIdsOff + sortedStrings.length * 4;
    const protoIdsOff = typeIdsOff + sortedTypes.length * 4;
    const fieldIdsOff = protoIdsOff + sortedProtos.length * 12;
    const methodIdsOff = fieldIdsOff + sortedFields.length * 8;
    const classDefsOff = methodIdsOff + sortedMethods.length * 8;
    const dataOff = classDefsOff + this.classes.length * 32;

    // Build data section sequentially
    const dataChunks = [];
    let cursor = dataOff;
    const align4 = () => {
      const pad = (4 - (cursor % 4)) % 4;
      if (pad > 0) {
        dataChunks.push(Buffer.alloc(pad));
        cursor += pad;
      }
    };

    // Data 1: code_items (4-byte aligned)
    const codeOffsets = new Map();
    const codeEntries = [];
    for (const cls of this.classes) {
      for (const m of [...cls.directMethods, ...cls.virtualMethods]) {
        align4();
        const insns = m.buildInsns(ctx);
        const codeBuf = Buffer.alloc(16 + insns.length * 2);
        codeBuf.writeUInt16LE(m.registersSize, 0);
        codeBuf.writeUInt16LE(m.insSize, 2);
        codeBuf.writeUInt16LE(m.outsSize, 4);
        codeBuf.writeUInt16LE(0, 6); // tries_size
        codeBuf.writeUInt32LE(0, 8); // debug_info_off
        codeBuf.writeUInt32LE(insns.length, 12);
        for (let i = 0; i < insns.length; i++) {
          codeBuf.writeUInt16LE(insns[i] & 0xffff, 16 + i * 2);
        }
        codeOffsets.set(m.methodKey, cursor);
        codeEntries.push(codeBuf);
        dataChunks.push(codeBuf);
        cursor += codeBuf.length;
      }
    }
    const codeSectionOff = codeEntries.length > 0 ? dataOff : 0;

    // Data 2: type_lists for protos with parameters (4-byte aligned)
    align4();
    const typeListOff = cursor;
    const protoParamOffsets = new Map();
    let typeListCount = 0;
    for (const p of sortedProtos) {
      if (p.paramTypes.length === 0) continue;
      align4();
      protoParamOffsets.set(p.key, cursor);
      const tlBuf = Buffer.alloc(4 + p.paramTypes.length * 2);
      tlBuf.writeUInt32LE(p.paramTypes.length, 0);
      for (let i = 0; i < p.paramTypes.length; i++) {
        tlBuf.writeUInt16LE(typeIdx.get(p.paramTypes[i]), 4 + i * 2);
      }
      dataChunks.push(tlBuf);
      cursor += tlBuf.length;
      typeListCount++;
    }

    // Data 3: string_data_items
    const stringDataOff = cursor;
    const stringDataOffsets = [];
    for (const s of sortedStrings) {
      stringDataOffsets.push(cursor);
      const uleb = encodeUleb128(s.length);
      const mutf8 = encodeMutf8(s);
      const item = Buffer.concat([uleb, mutf8, Buffer.from([0])]);
      dataChunks.push(item);
      cursor += item.length;
    }

    // Data 4: class_data_items
    const classDataOffStart = cursor;
    const classDataOffsets = [];
    for (const cls of this.classes) {
      classDataOffsets.push(cursor);
      const staticFields = cls.staticFields || [];
      const instanceFields = [...(cls.instanceFields || [])].sort(
        (a, b) => fieldIdx.get(a.fieldKey) - fieldIdx.get(b.fieldKey)
      );
      const directMethods = [...cls.directMethods].sort(
        (a, b) => methodIdx.get(a.methodKey) - methodIdx.get(b.methodKey)
      );
      const virtualMethods = [...cls.virtualMethods].sort(
        (a, b) => methodIdx.get(a.methodKey) - methodIdx.get(b.methodKey)
      );

      const parts = [
        encodeUleb128(staticFields.length),
        encodeUleb128(instanceFields.length),
        encodeUleb128(directMethods.length),
        encodeUleb128(virtualMethods.length)
      ];

      let prevField = 0;
      for (const f of instanceFields) {
        const idx = fieldIdx.get(f.fieldKey);
        parts.push(encodeUleb128(idx - prevField), encodeUleb128(f.accessFlags));
        prevField = idx;
      }

      let prevDirect = 0;
      for (const m of directMethods) {
        const idx = methodIdx.get(m.methodKey);
        parts.push(
          encodeUleb128(idx - prevDirect),
          encodeUleb128(m.accessFlags),
          encodeUleb128(codeOffsets.get(m.methodKey))
        );
        prevDirect = idx;
      }

      let prevVirtual = 0;
      for (const m of virtualMethods) {
        const idx = methodIdx.get(m.methodKey);
        parts.push(
          encodeUleb128(idx - prevVirtual),
          encodeUleb128(m.accessFlags),
          encodeUleb128(codeOffsets.get(m.methodKey))
        );
        prevVirtual = idx;
      }

      const cdBuf = Buffer.concat(parts);
      dataChunks.push(cdBuf);
      cursor += cdBuf.length;
    }

    // Data 5: map_list (4-byte aligned)
    align4();
    const mapOff = cursor;
    const mapItems = [
      { type: 0x0000, size: 1, offset: 0 }, // HEADER_ITEM
      { type: 0x0001, size: sortedStrings.length, offset: stringIdsOff },
      { type: 0x0002, size: sortedTypes.length, offset: typeIdsOff },
      { type: 0x0003, size: sortedProtos.length, offset: protoIdsOff }
    ];
    if (sortedFields.length > 0) {
      mapItems.push({ type: 0x0004, size: sortedFields.length, offset: fieldIdsOff });
    }
    if (sortedMethods.length > 0) {
      mapItems.push({ type: 0x0005, size: sortedMethods.length, offset: methodIdsOff });
    }
    if (this.classes.length > 0) {
      mapItems.push({ type: 0x0006, size: this.classes.length, offset: classDefsOff });
    }
    if (codeEntries.length > 0) {
      mapItems.push({ type: 0x2001, size: codeEntries.length, offset: codeSectionOff });
    }
    if (typeListCount > 0) {
      mapItems.push({ type: 0x1001, size: typeListCount, offset: typeListOff });
    }
    mapItems.push({ type: 0x2002, size: sortedStrings.length, offset: stringDataOff });
    if (this.classes.length > 0) {
      mapItems.push({ type: 0x2000, size: this.classes.length, offset: classDataOffStart });
    }
    mapItems.push({ type: 0x1000, size: 1, offset: mapOff });

    const mapBuf = Buffer.alloc(4 + mapItems.length * 12);
    mapBuf.writeUInt32LE(mapItems.length, 0);
    for (let i = 0; i < mapItems.length; i++) {
      const off = 4 + i * 12;
      mapBuf.writeUInt16LE(mapItems[i].type, off);
      mapBuf.writeUInt16LE(0, off + 2);
      mapBuf.writeUInt32LE(mapItems[i].size, off + 4);
      mapBuf.writeUInt32LE(mapItems[i].offset, off + 8);
    }
    dataChunks.push(mapBuf);
    cursor += mapBuf.length;

    const fileSize = cursor;
    const dataSize = fileSize - dataOff;

    // Assemble IDs & header buffer
    const prefixBuf = Buffer.alloc(dataOff);
    // Header magic: dex\n035\0
    Buffer.from('dex\n035\0', 'ascii').copy(prefixBuf, 0);
    prefixBuf.writeUInt32LE(fileSize, 32);
    prefixBuf.writeUInt32LE(headerSize, 36);
    prefixBuf.writeUInt32LE(0x12345678, 40); // ENDIAN_CONSTANT
    prefixBuf.writeUInt32LE(0, 44); // link_size
    prefixBuf.writeUInt32LE(0, 48); // link_off
    prefixBuf.writeUInt32LE(mapOff, 52);
    prefixBuf.writeUInt32LE(sortedStrings.length, 56);
    prefixBuf.writeUInt32LE(stringIdsOff, 60);
    prefixBuf.writeUInt32LE(sortedTypes.length, 64);
    prefixBuf.writeUInt32LE(typeIdsOff, 68);
    prefixBuf.writeUInt32LE(sortedProtos.length, 72);
    prefixBuf.writeUInt32LE(protoIdsOff, 76);
    prefixBuf.writeUInt32LE(sortedFields.length, 80);
    prefixBuf.writeUInt32LE(sortedFields.length ? fieldIdsOff : 0, 84);
    prefixBuf.writeUInt32LE(sortedMethods.length, 88);
    prefixBuf.writeUInt32LE(sortedMethods.length ? methodIdsOff : 0, 92);
    prefixBuf.writeUInt32LE(this.classes.length, 96);
    prefixBuf.writeUInt32LE(this.classes.length ? classDefsOff : 0, 100);
    prefixBuf.writeUInt32LE(dataSize, 104);
    prefixBuf.writeUInt32LE(dataOff, 108);

    // Fill string_ids
    for (let i = 0; i < stringDataOffsets.length; i++) {
      prefixBuf.writeUInt32LE(stringDataOffsets[i], stringIdsOff + i * 4);
    }

    // Fill type_ids
    for (let i = 0; i < sortedTypes.length; i++) {
      prefixBuf.writeUInt32LE(strIdx.get(sortedTypes[i]), typeIdsOff + i * 4);
    }

    // Fill proto_ids
    for (let i = 0; i < sortedProtos.length; i++) {
      const p = sortedProtos[i];
      const off = protoIdsOff + i * 12;
      prefixBuf.writeUInt32LE(strIdx.get(p.shorty), off);
      prefixBuf.writeUInt32LE(typeIdx.get(p.returnType), off + 4);
      prefixBuf.writeUInt32LE(protoParamOffsets.get(p.key) || 0, off + 8);
    }

    // Fill field_ids
    for (let i = 0; i < sortedFields.length; i++) {
      const f = sortedFields[i];
      const off = fieldIdsOff + i * 8;
      prefixBuf.writeUInt16LE(typeIdx.get(f.classType), off);
      prefixBuf.writeUInt16LE(typeIdx.get(f.fieldType), off + 2);
      prefixBuf.writeUInt32LE(strIdx.get(f.name), off + 4);
    }

    // Fill method_ids
    for (let i = 0; i < sortedMethods.length; i++) {
      const m = sortedMethods[i];
      const off = methodIdsOff + i * 8;
      prefixBuf.writeUInt16LE(typeIdx.get(m.classType), off);
      prefixBuf.writeUInt16LE(protoIdx.get(m.protoKey), off + 2);
      prefixBuf.writeUInt32LE(strIdx.get(m.name), off + 4);
    }

    // Fill class_defs
    for (let i = 0; i < this.classes.length; i++) {
      const cls = this.classes[i];
      const off = classDefsOff + i * 32;
      prefixBuf.writeUInt32LE(typeIdx.get(cls.type), off);
      prefixBuf.writeUInt32LE(cls.accessFlags, off + 4);
      prefixBuf.writeUInt32LE(typeIdx.get(cls.superType), off + 8);
      prefixBuf.writeUInt32LE(0, off + 12); // interfaces_off
      prefixBuf.writeUInt32LE(0xffffffff, off + 16); // source_file_idx (NO_INDEX)
      prefixBuf.writeUInt32LE(0, off + 20); // annotations_off
      prefixBuf.writeUInt32LE(classDataOffsets[i], off + 24);
      prefixBuf.writeUInt32LE(0, off + 28); // static_values_off
    }

    const fullDex = Buffer.concat([prefixBuf, ...dataChunks]);

    // Compute SHA-1 signature (bytes 32..end) and Adler32 checksum (bytes 12..end)
    const sha1 = crypto.createHash('sha1').update(fullDex.subarray(32)).digest();
    sha1.copy(fullDex, 12);
    const sum = adler32(fullDex.subarray(12));
    fullDex.writeUInt32LE(sum, 8);

    return fullDex;
  }
}

// Dalvik opcode helpers
const op = {
  returnVoid: () => [0x000e],
  returnReg: (vA) => [((vA & 0xff) << 8) | 0x0f],
  moveResult: (vA) => [((vA & 0xff) << 8) | 0x0a],
  moveResultObject: (vA) => [((vA & 0xff) << 8) | 0x0c],
  const4: (vA, val) => [(((val & 0xf) << 12) | ((vA & 0xf) << 8) | 0x12) & 0xffff],
  constString: (vAA, strIndex) => [((vAA & 0xff) << 8) | 0x1a, strIndex & 0xffff],
  newInstance: (vAA, typeIndex) => [((vAA & 0xff) << 8) | 0x22, typeIndex & 0xffff],
  ifEqz: (vAA, branchOffset) => [((vAA & 0xff) << 8) | 0x38, branchOffset & 0xffff],
  ifGez: (vAA, branchOffset) => [((vAA & 0xff) << 8) | 0x3d, branchOffset & 0xffff],
  ifLtz: (vAA, branchOffset) => [((vAA & 0xff) << 8) | 0x3b, branchOffset & 0xffff],
  igetObject: (vA, vB, fieldIndex) => [((vB & 0xf) << 12) | ((vA & 0xf) << 8) | 0x54, fieldIndex & 0xffff],
  iputObject: (vA, vB, fieldIndex) => [((vB & 0xf) << 12) | ((vA & 0xf) << 8) | 0x5b, fieldIndex & 0xffff],
  invoke35c: (opcode, args, methodIndex) => {
    const count = args.length;
    const c = args[0] || 0;
    const d = args[1] || 0;
    const e = args[2] || 0;
    const f = args[3] || 0;
    const g = args[4] || 0;
    return [
      ((count & 0xf) << 12) | ((g & 0xf) << 8) | opcode,
      methodIndex & 0xffff,
      ((f & 0xf) << 12) | ((e & 0xf) << 8) | ((d & 0xf) << 4) | (c & 0xf)
    ];
  }
};

export function buildClassesDex({
  packageName,
  targetUrl,
  targetHost,
  injectedJs,
  switches
}) {
  const dex = new DexAssembler();
  const pkgPath = String(packageName || 'com.web2apk.app').replace(/\./g, '/');
  const mainType = `L${pkgPath}/MainActivity;`;
  const clientType = `L${pkgPath}/AppWebViewClient;`;

  const T_ACTIVITY = 'Landroid/app/Activity;';
  const T_BUNDLE = 'Landroid/os/Bundle;';
  const T_CONTEXT = 'Landroid/content/Context;';
  const T_VIEW = 'Landroid/view/View;';
  const T_WEBVIEW = 'Landroid/webkit/WebView;';
  const T_SETTINGS = 'Landroid/webkit/WebSettings;';
  const T_CLIENT = 'Landroid/webkit/WebViewClient;';
  const T_CHROME = 'Landroid/webkit/WebChromeClient;';
  const T_CALLBACK = 'Landroid/webkit/ValueCallback;';
  const T_STRING = 'Ljava/lang/String;';

  // Register constants as DEX strings
  const S_URL = dex.addString(targetUrl);
  const S_HOST = dex.addString(String(targetHost || '').replace(/^www\./, ''));
  const S_INJECT_JS = dex.addString(injectedJs);
  const S_ASSET_PREFIX = dex.addString('file:///android_asset/');
  const S_OFFLINE_URL = dex.addString('file:///android_asset/offline.html');
  const S_DESKTOP_UA = dex.addString(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );
  const adDomainsSubset = AD_BLOCK_HOSTS.slice(0, 8);
  for (const host of adDomainsSubset) dex.addString(host);

  // Fields
  const F_WEBVIEW = dex.addField(mainType, 'webView', T_WEBVIEW);

  // External methods
  const M_ACT_INIT = dex.addMethod(T_ACTIVITY, '<init>', 'V', []);
  const M_ACT_ONCREATE = dex.addMethod(T_ACTIVITY, 'onCreate', 'V', [T_BUNDLE]);
  const M_ACT_SETCONTENT = dex.addMethod(T_ACTIVITY, 'setContentView', 'V', [T_VIEW]);
  const M_ACT_ONBACK = dex.addMethod(T_ACTIVITY, 'onBackPressed', 'V', []);

  const M_WV_INIT = dex.addMethod(T_WEBVIEW, '<init>', 'V', [T_CONTEXT]);
  const M_WV_GETSETTINGS = dex.addMethod(T_WEBVIEW, 'getSettings', T_SETTINGS, []);
  const M_WV_SETCLIENT = dex.addMethod(T_WEBVIEW, 'setWebViewClient', 'V', [T_CLIENT]);
  const M_WV_SETCHROME = dex.addMethod(T_WEBVIEW, 'setWebChromeClient', 'V', [T_CHROME]);
  const M_WV_LOADURL = dex.addMethod(T_WEBVIEW, 'loadUrl', 'V', [T_STRING]);
  const M_WV_EVALJS = dex.addMethod(T_WEBVIEW, 'evaluateJavascript', 'V', [T_STRING, T_CALLBACK]);
  const M_WV_CANGOBACK = dex.addMethod(T_WEBVIEW, 'canGoBack', 'Z', []);
  const M_WV_GOBACK = dex.addMethod(T_WEBVIEW, 'goBack', 'V', []);

  const M_WS_JS = dex.addMethod(T_SETTINGS, 'setJavaScriptEnabled', 'V', ['Z']);
  const M_WS_DOM = dex.addMethod(T_SETTINGS, 'setDomStorageEnabled', 'V', ['Z']);
  const M_WS_ZOOM = dex.addMethod(T_SETTINGS, 'setSupportZoom', 'V', ['Z']);
  const M_WS_WIDE = dex.addMethod(T_SETTINGS, 'setUseWideViewPort', 'V', ['Z']);
  const M_WS_OVERVIEW = dex.addMethod(T_SETTINGS, 'setLoadWithOverviewMode', 'V', ['Z']);
  const M_WS_FILE = dex.addMethod(T_SETTINGS, 'setAllowFileAccess', 'V', ['Z']);
  const M_WS_UA = dex.addMethod(T_SETTINGS, 'setUserAgentString', 'V', [T_STRING]);

  const M_CLIENT_INIT = dex.addMethod(T_CLIENT, '<init>', 'V', []);
  const M_CLIENT_ONFINISHED = dex.addMethod(T_CLIENT, 'onPageFinished', 'V', [T_WEBVIEW, T_STRING]);
  const M_CLIENT_ONERROR = dex.addMethod(T_CLIENT, 'onReceivedError', 'V', [
    T_WEBVIEW,
    'I',
    T_STRING,
    T_STRING
  ]);
  const M_CHROME_INIT = dex.addMethod(T_CHROME, '<init>', 'V', []);

  const M_STR_STARTSWITH = dex.addMethod(T_STRING, 'startsWith', 'Z', [T_STRING]);
  const M_STR_INDEXOF = dex.addMethod(T_STRING, 'indexOf', 'I', [T_STRING]);

  // Own methods
  const M_OWN_CLIENT_INIT = dex.addMethod(clientType, '<init>', 'V', []);
  const M_OWN_CLIENT_FINISH = dex.addMethod(clientType, 'onPageFinished', 'V', [T_WEBVIEW, T_STRING]);
  const M_OWN_CLIENT_OVERRIDE = dex.addMethod(clientType, 'shouldOverrideUrlLoading', 'Z', [
    T_WEBVIEW,
    T_STRING
  ]);
  const M_OWN_CLIENT_ERROR = dex.addMethod(clientType, 'onReceivedError', 'V', [
    T_WEBVIEW,
    'I',
    T_STRING,
    T_STRING
  ]);

  const M_MAIN_INIT = dex.addMethod(mainType, '<init>', 'V', []);
  const M_MAIN_ONCREATE = dex.addMethod(mainType, 'onCreate', 'V', [T_BUNDLE]);
  const M_MAIN_ONBACK = dex.addMethod(mainType, 'onBackPressed', 'V', []);

  // Class 1: AppWebViewClient
  dex.addClass({
    type: clientType,
    superType: T_CLIENT,
    accessFlags: 0x0001, // public
    instanceFields: [],
    directMethods: [
      {
        methodKey: M_OWN_CLIENT_INIT,
        accessFlags: 0x10001, // public constructor
        registersSize: 1,
        insSize: 1,
        outsSize: 1,
        buildInsns: (ctx) => [
          ...op.invoke35c(0x70, [0], ctx.methodIdx.get(M_CLIENT_INIT)),
          ...op.returnVoid()
        ]
      }
    ],
    virtualMethods: [
      {
        // onPageFinished(WebView p1=v3, String p2=v4); locals: v0, v1, v2; p0=v2? Wait: locals=2 (v0,v1), ins=3 (v2=this,v3=view,v4=url)
        methodKey: M_OWN_CLIENT_FINISH,
        accessFlags: 0x0001,
        registersSize: 5,
        insSize: 3,
        outsSize: 3,
        buildInsns: (ctx) => [
          ...op.invoke35c(0x6f, [2, 3, 4], ctx.methodIdx.get(M_CLIENT_ONFINISHED)),
          ...op.constString(0, ctx.strIdx.get(S_INJECT_JS)),
          ...op.const4(1, 0),
          ...op.invoke35c(0x6e, [3, 0, 1], ctx.methodIdx.get(M_WV_EVALJS)),
          ...op.returnVoid()
        ]
      },
      {
        // shouldOverrideUrlLoading(WebView p1=v3, String p2=v4)Z; locals=2 (v0,v1), ins=3 (v2=this,v3=view,v4=url)
        methodKey: M_OWN_CLIENT_OVERRIDE,
        accessFlags: 0x0001,
        registersSize: 5,
        insSize: 3,
        outsSize: 2,
        buildInsns: (ctx) => {
          if (!switches.adBlocker && !switches.redirectBlocker) {
            return [...op.const4(0, 0), ...op.returnReg(0)];
          }
          const bodyChecks = [];
          if (switches.adBlocker) {
            for (const domain of adDomainsSubset) {
              bodyChecks.push(...op.constString(0, ctx.strIdx.get(domain)));
              bodyChecks.push(...op.invoke35c(0x6e, [4, 0], ctx.methodIdx.get(M_STR_INDEXOF)));
              bodyChecks.push(...op.moveResult(1));
              // if v1 >= 0 -> jump to blockReturn (marker placeholder)
              bodyChecks.push({ jumpTo: 'BLOCK', op: (off) => op.ifGez(1, off) });
            }
          }
          if (switches.redirectBlocker && S_HOST) {
            bodyChecks.push(...op.constString(0, ctx.strIdx.get(S_HOST)));
            bodyChecks.push(...op.invoke35c(0x6e, [4, 0], ctx.methodIdx.get(M_STR_INDEXOF)));
            bodyChecks.push(...op.moveResult(1));
            bodyChecks.push({ jumpTo: 'BLOCK', op: (off) => op.ifLtz(1, off) });
          }

          // Assemble flat instruction list with two labels: ALLOW and BLOCK
          const seq = [
            ...op.constString(0, ctx.strIdx.get(S_ASSET_PREFIX)),
            ...op.invoke35c(0x6e, [4, 0], ctx.methodIdx.get(M_STR_STARTSWITH)),
            ...op.moveResult(1),
            // if v1 == 0, continue (offset = 3 -> skip 1 unit? No, skip 2 units: const4(1)+returnReg(1) = 2 units, so offset = 4 from ifEqz!)
            ...op.ifEqz(1, 4),
            ...op.const4(0, 0),
            ...op.returnReg(0)
          ];

          // Flatten bodyChecks with placeholders
          const checkStartPos = seq.length;
          let expandedLen = 0;
          for (const item of bodyChecks) {
            expandedLen += typeof item === 'number' ? 1 : 2;
          }
          // After checks comes ALLOW (2 units), then BLOCK (2 units)
          const allowPos = checkStartPos + expandedLen;
          const blockPos = allowPos + 2;

          let curPos = checkStartPos;
          for (const item of bodyChecks) {
            if (typeof item === 'number') {
              seq.push(item);
              curPos += 1;
            } else {
              const target = item.jumpTo === 'BLOCK' ? blockPos : allowPos;
              seq.push(...item.op(target - curPos));
              curPos += 2;
            }
          }

          // ALLOW label
          seq.push(...op.const4(0, 0), ...op.returnReg(0));
          // BLOCK label
          seq.push(...op.const4(0, 1), ...op.returnReg(0));
          return seq;
        }
      },
      {
        // onReceivedError(WebView p1=v2, int p2=v3, String p3=v4, String p4=v5); locals=1 (v0), ins=5 (v1=this,v2..v5)
        methodKey: M_OWN_CLIENT_ERROR,
        accessFlags: 0x0001,
        registersSize: 6,
        insSize: 5,
        outsSize: 5,
        buildInsns: (ctx) => {
          if (switches.offlineScreen) {
            return [
              ...op.constString(0, ctx.strIdx.get(S_OFFLINE_URL)),
              ...op.invoke35c(0x6e, [2, 0], ctx.methodIdx.get(M_WV_LOADURL)),
              ...op.returnVoid()
            ];
          }
          return [
            ...op.invoke35c(0x6f, [1, 2, 3, 4, 5], ctx.methodIdx.get(M_CLIENT_ONERROR)),
            ...op.returnVoid()
          ];
        }
      }
    ]
  });

  // Class 2: MainActivity
  dex.addClass({
    type: mainType,
    superType: T_ACTIVITY,
    accessFlags: 0x0001,
    instanceFields: [{ fieldKey: F_WEBVIEW, accessFlags: 0x0001 }],
    directMethods: [
      {
        methodKey: M_MAIN_INIT,
        accessFlags: 0x10001,
        registersSize: 1,
        insSize: 1,
        outsSize: 1,
        buildInsns: (ctx) => [
          ...op.invoke35c(0x70, [0], ctx.methodIdx.get(M_ACT_INIT)),
          ...op.returnVoid()
        ]
      }
    ],
    virtualMethods: [
      {
        // onCreate(Bundle p1=v5); locals=4 (v0..v3), ins=2 (v4=this, v5=bundle)
        methodKey: M_MAIN_ONCREATE,
        accessFlags: 0x0004, // protected
        registersSize: 6,
        insSize: 2,
        outsSize: 2,
        buildInsns: (ctx) => {
          const wideVal = switches.responsiveFit || switches.desktopMode ? 1 : 0;
          const fileVal = switches.fileSupport ? 1 : 0;
          const seq = [
            ...op.invoke35c(0x6f, [4, 5], ctx.methodIdx.get(M_ACT_ONCREATE)),
            ...op.newInstance(0, ctx.typeIdx.get(T_WEBVIEW)),
            ...op.invoke35c(0x70, [0, 4], ctx.methodIdx.get(M_WV_INIT)),
            ...op.iputObject(0, 4, ctx.fieldIdx.get(F_WEBVIEW)),
            ...op.invoke35c(0x6e, [0], ctx.methodIdx.get(M_WV_GETSETTINGS)),
            ...op.moveResultObject(1),

            ...op.const4(2, 1),
            ...op.invoke35c(0x6e, [1, 2], ctx.methodIdx.get(M_WS_JS)),
            ...op.invoke35c(0x6e, [1, 2], ctx.methodIdx.get(M_WS_DOM)),
            ...op.invoke35c(0x6e, [1, 2], ctx.methodIdx.get(M_WS_ZOOM)),

            ...op.const4(2, wideVal),
            ...op.invoke35c(0x6e, [1, 2], ctx.methodIdx.get(M_WS_WIDE)),
            ...op.invoke35c(0x6e, [1, 2], ctx.methodIdx.get(M_WS_OVERVIEW)),

            ...op.const4(2, fileVal),
            ...op.invoke35c(0x6e, [1, 2], ctx.methodIdx.get(M_WS_FILE))
          ];

          if (switches.desktopMode) {
            seq.push(
              ...op.constString(2, ctx.strIdx.get(S_DESKTOP_UA)),
              ...op.invoke35c(0x6e, [1, 2], ctx.methodIdx.get(M_WS_UA))
            );
          }

          seq.push(
            ...op.newInstance(2, ctx.typeIdx.get(clientType)),
            ...op.invoke35c(0x70, [2], ctx.methodIdx.get(M_OWN_CLIENT_INIT)),
            ...op.invoke35c(0x6e, [0, 2], ctx.methodIdx.get(M_WV_SETCLIENT)),

            ...op.newInstance(2, ctx.typeIdx.get(T_CHROME)),
            ...op.invoke35c(0x70, [2], ctx.methodIdx.get(M_CHROME_INIT)),
            ...op.invoke35c(0x6e, [0, 2], ctx.methodIdx.get(M_WV_SETCHROME)),

            ...op.invoke35c(0x6e, [4, 0], ctx.methodIdx.get(M_ACT_SETCONTENT)),
            ...op.constString(2, ctx.strIdx.get(S_URL)),
            ...op.invoke35c(0x6e, [0, 2], ctx.methodIdx.get(M_WV_LOADURL)),
            ...op.returnVoid()
          );

          return seq;
        }
      },
      {
        // onBackPressed()V; locals=2 (v0, v1), ins=1 (v2=this)
        methodKey: M_MAIN_ONBACK,
        accessFlags: 0x0001,
        registersSize: 3,
        insSize: 1,
        outsSize: 1,
        buildInsns: (ctx) => [
          // 0: iget-object v0, v2, F_WEBVIEW (2 units)
          ...op.igetObject(0, 2, ctx.fieldIdx.get(F_WEBVIEW)),
          // 2: if-eqz v0, +12 (to offset 14 = super_back) (2 units)
          ...op.ifEqz(0, 12),
          // 4: invoke-virtual {v0}, canGoBack (3 units)
          ...op.invoke35c(0x6e, [0], ctx.methodIdx.get(M_WV_CANGOBACK)),
          // 7: move-result v1 (1 unit)
          ...op.moveResult(1),
          // 8: if-eqz v1, +6 (to offset 14 = super_back) (2 units)
          ...op.ifEqz(1, 6),
          // 10: invoke-virtual {v0}, goBack (3 units)
          ...op.invoke35c(0x6e, [0], ctx.methodIdx.get(M_WV_GOBACK)),
          // 13: returnVoid (1 unit)
          ...op.returnVoid(),
          // 14: invoke-super {v2}, onBackPressed (3 units)
          ...op.invoke35c(0x6f, [2], ctx.methodIdx.get(M_ACT_ONBACK)),
          // 17: returnVoid (1 unit)
          ...op.returnVoid()
        ]
      }
    ]
  });

  return dex.compile();
}
