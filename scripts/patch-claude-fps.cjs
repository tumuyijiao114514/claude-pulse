#!/usr/bin/env node
/**
 * patch-claude-fps.cjs
 * Patches Claude Code's built-in statusLine renderer (Dce) to animate
 * `xhigh` (autoAccept-shimmer) and `max` (rainbow-animated) in-process at
 * Claude Code's native 100ms (10 FPS) `Sa(100)` clock rate without spawning
 * child processes, and reduces statusLine input-change debounce from 300ms to 10ms.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function findClaudeBinary(explicitPath) {
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;

  const candidates = [];
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    candidates.push(
      path.join(appData, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
      path.join(localAppData, 'Programs', 'claude', 'claude.exe'),
      path.join(userProfile, '.local', 'bin', 'claude.exe'),
      path.join(userProfile, '.claude', 'local', 'claude.exe')
    );
    try {
      const out = execFileSync('where.exe', ['claude.exe'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      for (const line of out.split(/\r?\n/)) {
        if (line.trim()) candidates.push(line.trim());
      }
    } catch {}
  } else {
    const home = process.env.HOME || '';
    candidates.push(
      path.join(home, '.local', 'bin', 'claude'),
      path.join(home, '.claude', 'local', 'claude'),
      '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude',
      '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/bin/claude'
    );
    try {
      const out = execFileSync('which', ['claude'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (out) {
        try {
          candidates.push(fs.realpathSync(out));
        } catch {
          candidates.push(out);
        }
      }
    } catch {}
  }

  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c) && fs.statSync(c).size > 20 * 1024 * 1024) {
        return c;
      }
    } catch {}
  }
  return null;
}

function writeBinarySafe(targetPath, buf) {
  const tmpPath = `${targetPath}.patch.${process.pid}`;
  const oldRunningPath = `${targetPath}.old`;
  fs.writeFileSync(tmpPath, buf);
  try {
    fs.renameSync(tmpPath, targetPath);
    return;
  } catch {
    // On Windows, a running .exe cannot be overwritten directly, but CAN be renamed while running
    try {
      if (fs.existsSync(oldRunningPath)) {
        try { fs.unlinkSync(oldRunningPath); } catch {}
      }
      fs.renameSync(targetPath, oldRunningPath);
      fs.renameSync(tmpPath, targetPath);
      try { fs.unlinkSync(oldRunningPath); } catch {}
      return;
    } catch (err) {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
      throw err;
    }
  }
}

function patchClaudeBinary(binPath) {
  const buf = fs.readFileSync(binPath);
  const magic = Buffer.from('\n---- Bun! ----\n', 'utf8');
  const magicPos = buf.lastIndexOf(magic);
  if (magicPos === -1 || magicPos < 64) {
    return { status: 'skipped', reason: 'Not a Bun standalone binary' };
  }

  const byteCount = Number(buf.readBigUInt64LE(magicPos - 32));
  const modOffset = buf.readUInt32LE(magicPos - 24);
  const modLength = buf.readUInt32LE(magicPos - 20);
  const bundleStart = magicPos - byteCount;
  const modStart = bundleStart + modOffset;
  const entrySize = 52;

  if (bundleStart < 0 || modStart < 0 || modLength % entrySize !== 0) {
    return { status: 'skipped', reason: 'Unrecognized Bun module graph layout' };
  }

  if (buf.includes('/*fps*/')) {
    return { status: 'already_patched', binPath };
  }

  const count = modLength / entrySize;
  let patchedDce = false;
  let patchedDebounce = false;
  let patchedSchema = false;

  const dceRegex = /(function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+)\)\{let [A-Za-z0-9_$]+=[A-Za-z0-9_$]+\(11\),\{text:[A-Za-z0-9_$]+\}=\3[\s\S]{10,300}?let [A-Za-z0-9_$]+=([A-Za-z0-9_$]+)\([A-Za-z0-9_$]+\);if\([A-Za-z0-9_$]+\.length===1\)\{const [A-Za-z0-9_$]+=([A-Za-z0-9_$]+)\([A-Za-z0-9_$]+,\{children:[A-Za-z0-9_$]+\}\)[\s\S]{10,300}?=([A-Za-z0-9_$]+);[A-Za-z0-9_$]+="column";[A-Za-z0-9_$]+=[A-Za-z0-9_$]+\.map\(([A-Za-z0-9_$]+)\)[\s\S]{10,300}?return [A-Za-z0-9_$]+\})var ([A-Za-z0-9_$]+)=\/\\x1b\\\[/;
  const debounceRegex = /(var [A-Za-z0-9_$]+=)300(,[A-Za-z0-9_$]+=1000;function [A-Za-z0-9_$]+\()/;
  const clampRegex = /(function [A-Za-z0-9_$]+\([A-Za-z0-9_$]+\)\{let [A-Za-z0-9_$]+=[A-Za-z0-9_$]+\?\.refreshInterval;return [A-Za-z0-9_$]+===void 0\?null:Math\.max\()1(,[A-Za-z0-9_$]+\)\*1000\})/;
  const schemaRegex = /(refreshInterval:[A-Za-z0-9_$]+\(\)\.min\()1(\)\.optional\(\)\.catch\(void 0\))/;

  for (let i = 0; i < count; i++) {
    const base = modStart + i * entrySize;
    const cOff = buf.readUInt32LE(base + 28);
    const cLen = buf.readUInt32LE(base + 32);
    const absStart = bundleStart + cOff;
    const absEnd = absStart + cLen;
    if (absStart < 0 || absEnd > buf.length) continue;

    const sub = buf.subarray(absStart, absEnd);
    let chunkModified = false;

    // 1. Patch Dce(h) statusLine React component for 100ms (10 FPS) Sa(100) animation
    if (!patchedDce && sub.includes('flexDirection') && sub.includes('truncate')) {
      const text = sub.toString('utf8');
      const m = text.match(dceRegex);
      if (m) {
        const [fullMatch, origFn, fnName, argName, fVeName, jsxName, boxName, iKtName, sKtName] = m;
        const saMatch = text.match(/\[[A-Za-z0-9_$]*,[A-Za-z0-9_$]+\]=([A-Za-z0-9_$]+)\([^)]*\?null:80\)/);
        const saName = saMatch ? saMatch[1] : 'Sa';

        const origByteLen = Buffer.byteLength(origFn, 'utf8');
        const newFnCore =
          `function ${fnName}(${argName}){/*fps*/let R=${argName}.text,a=R.includes("\\x1b[0;0m"),[,D]=${saName}(a?100:null),N=D/100|0;` +
          `if(a)R=R.replace(/\\x1b\\[0;0m(.*?)\\x1b\\[0;0m/g,(_,m)=>{let w=[...m.replace(${sKtName},"")],p=N%9;` +
          `return w.map((c,i)=>\`\\x1b[\${w[0]<"u"||(i-p)**2<2?1:22};38;2;\${w[0]<"u"?["235;95;87","245;139;87","250;195;95","145;200;130","130;170;220","155;130;200","200;130;180"][(i+N)%7]:(i===p?"208;180":"175;135")+";255"}m\${c}\`).join("")+"\\x1b[0m"});` +
          `let v=${fVeName}(R);return v.length<2?${iKtName}(R):${jsxName}(${boxName},{flexDirection:"column",children:v.map(${iKtName})})}`;

        const newByteLen = Buffer.byteLength(newFnCore, 'utf8');
        if (newByteLen <= origByteLen) {
          const paddedFn = newFnCore + ' '.repeat(origByteLen - newByteLen);
          const fnOffsetInChunk = sub.indexOf(origFn);
          if (fnOffsetInChunk !== -1) {
            buf.write(paddedFn, absStart + fnOffsetInChunk, origByteLen, 'utf8');
            patchedDce = true;
            chunkModified = true;
          }
        }
      }
    }

    // 2. Patch Ofr statusLine debounce (300ms -> 10ms) and refreshInterval clamp (1 -> 0)
    if (!patchedDebounce && sub.includes('tengu_status_line_')) {
      let text = sub.toString('utf8');
      let updated = text;
      if (debounceRegex.test(updated)) {
        updated = updated.replace(debounceRegex, '$110 $2');
      }
      if (clampRegex.test(updated)) {
        updated = updated.replace(clampRegex, '$10$2');
      }
      if (updated !== text && Buffer.byteLength(updated, 'utf8') === cLen) {
        buf.write(updated, absStart, cLen, 'utf8');
        patchedDebounce = true;
        chunkModified = true;
      }
    }

    // 3. Patch settings.json refreshInterval Zod schema (.min(1) -> .min(0))
    if (!patchedSchema && sub.includes('refreshInterval:')) {
      const text = sub.toString('utf8');
      if (schemaRegex.test(text)) {
        const updated = text.replace(schemaRegex, '$10$2');
        if (Buffer.byteLength(updated, 'utf8') === cLen) {
          buf.write(updated, absStart, cLen, 'utf8');
          patchedSchema = true;
          chunkModified = true;
        }
      }
    }

    if (chunkModified) {
      // Zero precompiled JSC bytecode pointer for this chunk so Bun executes our patched JS source
      buf.writeUInt32LE(0, base + 44);
      buf.writeUInt32LE(0, base + 48);
    }
  }

  if (!patchedDce) {
    return { status: 'skipped', reason: 'Target Dce component not found in binary' };
  }

  const bakPath = `${binPath}.bak`;
  if (!fs.existsSync(bakPath)) {
    try {
      fs.copyFileSync(binPath, bakPath);
    } catch {}
  }

  writeBinarySafe(binPath, buf);
  return {
    status: 'patched',
    binPath,
    bakPath,
    patchedDce,
    patchedDebounce,
    patchedSchema
  };
}

if (require.main === module) {
  const target = findClaudeBinary(process.argv[2]);
  if (!target) {
    console.log('[patch-claude-fps] Claude binary not found, skipping native 10 FPS patch.');
    process.exit(0);
  }
  try {
    const res = patchClaudeBinary(target);
    if (res.status === 'patched') {
      console.log(`[patch-claude-fps] Patched ${res.binPath} for native 100ms (10 FPS) xhigh/max animation.`);
    } else if (res.status === 'already_patched') {
      console.log(`[patch-claude-fps] ${res.binPath} is already patched for 100ms (10 FPS) animation.`);
    } else {
      console.log(`[patch-claude-fps] Skipped (${res.reason}).`);
    }
  } catch (err) {
    console.error(`[patch-claude-fps] Failed to patch ${target}: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { findClaudeBinary, patchClaudeBinary };
