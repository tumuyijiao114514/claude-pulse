#!/usr/bin/env node
/**
 * Antigravity-Pulse StatusLine for Claude Code
 * Inspired by Google Antigravity Dashboard (antigravity-pulse)
 * High-performance, zero-dependency, crash-proof status panel for Claude Code CLI
 */

const fs = require('fs');
const path = require('path');

// ANSI 256 Colors
const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';

const C = {
  gray: '\x1b[38;5;244m',
  darkGray: '\x1b[38;5;238m',
  cyan: '\x1b[38;5;39m',
  green: '\x1b[38;5;78m',
  yellow: '\x1b[38;5;220m',
  orange: '\x1b[38;5;208m',
  red: '\x1b[38;5;203m',
  purple: '\x1b[38;5;141m',
  magenta: '\x1b[38;5;213m',
  blue: '\x1b[38;5;75m',
  white: '\x1b[97m'
};

const CLAUDE_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude');
const TPS_CACHE_PATH = path.join(CLAUDE_DIR, 'last_tps.json');

function formatTokens(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e6) {
    const val = (n / 1e6).toFixed(1);
    return val.endsWith('.0') ? `${Math.round(n / 1e6)}M` : `${val}M`;
  }
  if (n >= 1e3) {
    const val = (n / 1e3).toFixed(1);
    return val.endsWith('.0') ? `${Math.round(n / 1e3)}k` : `${val}k`;
  }
  return String(Math.round(n));
}

function formatCountdown(targetTs) {
  if (!targetTs) return '';
  let sec = Number(targetTs);
  if (!Number.isFinite(sec)) {
    const parsed = Date.parse(String(targetTs));
    if (!Number.isFinite(parsed)) return '';
    sec = Math.floor(parsed / 1000);
  } else if (sec > 1e11) {
    sec = Math.floor(sec / 1000);
  }
  const now = Math.floor(Date.now() / 1000);
  const diff = sec - now;
  if (diff <= 0) return '0m';
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h${remMin > 0 ? remMin + 'm' : ''}`;
}

function writeJsonAtomic(filePath, obj) {
  const content = JSON.stringify(obj, null, 2);
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    try {
      fs.writeFileSync(filePath, content, 'utf8');
    } catch {}
  }
}

function formatModelName(raw) {
  if (!raw) return 'Claude';
  let m = raw.replace(/^claude-/i, '')
             .replace(/^anthropic\//i, '')
             .replace(/^go\//i, '')
             .replace(/^ali\//i, '')
             .replace(/-latest$/i, '');
  if (m.toLowerCase().includes('glm-5.3-prime')) return 'GLM 5.3 Prime';
  if (m.toLowerCase().includes('glm-5.3')) return 'GLM 5.3';
  if (m.toLowerCase().includes('deepseek-v4.1-flash')) return 'DeepSeek 4.1 Flash';
  m = m.replace(/([a-zA-Z]+)-(\d+)-(\d+)/g, (match, name, v1, v2) => {
    return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + v1 + '.' + v2;
  });
  m = m.replace(/([a-zA-Z]+)-(\d+\.\d+)/g, (match, name, v) => {
    return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + v;
  });
  if (m.toLowerCase().startsWith('gpt')) m = m.replace(/^gpt/i, 'GPT');
  return m;
}

const MODEL_CONTEXT_CACHE_PATH = path.join(CLAUDE_DIR, 'model_context_cache.json');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const CODEX_CATALOG_PATH = path.join(process.env.USERPROFILE || process.env.HOME || '', '.codex', 'cc-switch-model-catalog.json');

let cachedSettings = null;
function getClaudeSettings() {
  if (cachedSettings !== null) return cachedSettings;
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      cachedSettings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) || {};
      return cachedSettings;
    }
  } catch {}
  cachedSettings = {};
  return cachedSettings;
}

function toCanonicalClaudeId(name) {
  if (!name || typeof name !== 'string') return '';
  const s = name.toLowerCase().trim().replace(/\./g, '-').replace(/\s+/g, '-');
  if (/^(opus|sonnet|haiku)-/.test(s)) return `claude-${s}`;
  return s;
}

// Resolve thinking / reasoning effort level across Claude Code stdin JSON, env, and settings.json
function resolveEffortLevel(data, rawModel) {
  // 1. Direct from Claude Code v2.1.300+ statusLine JSON payload
  const direct = data.effort?.level
              || (typeof data.effort === 'string' ? data.effort : null)
              || data.reasoning_effort
              || data.effortLevel;
  if (direct && typeof direct === 'string') {
    return direct.toLowerCase().trim();
  }

  // 2. Explicit thinking disabled via payload or env
  if (data.thinking?.enabled === false) return 'off';
  if (process.env.MAX_THINKING_TOKENS === '0') return 'off';

  // 3. Environment variable override
  if (process.env.CLAUDE_CODE_EFFORT_LEVEL) {
    return process.env.CLAUDE_CODE_EFFORT_LEVEL.toLowerCase().trim();
  }

  // 4. Local ~/.claude/settings.json fallback (covers 3rd-party / gateway models)
  const settings = getClaudeSettings();
  if (settings.alwaysThinkingEnabled === false) return 'off';
  if (settings.env?.MAX_THINKING_TOKENS === '0') return 'off';
  if (settings.env?.CLAUDE_CODE_EFFORT_LEVEL) {
    return String(settings.env.CLAUDE_CODE_EFFORT_LEVEL).toLowerCase().trim();
  }
  if (typeof settings.effortLevel === 'string' && settings.effortLevel.trim()) {
    return settings.effortLevel.toLowerCase().trim();
  }

  const ms = settings.modelSettings;
  if (ms && typeof ms === 'object') {
    const candidates = [
      data.model?.id,
      toCanonicalClaudeId(data.model?.id),
      rawModel,
      toCanonicalClaudeId(rawModel),
      settings.model,
      toCanonicalClaudeId(settings.model),
      settings.model === 'fable' ? 'claude-opus-5-5' : null,
      settings.model === 'fable' ? 'claude-opus-5' : null
    ].filter(Boolean);

    for (const key of candidates) {
      if (Object.prototype.hasOwnProperty.call(ms, key)) {
        const lvl = ms[key]?.effortLevel;
        if (typeof lvl === 'string' && lvl.trim()) {
          return lvl.toLowerCase().trim();
        }
        // Key explicitly exists in modelSettings with empty object {} -> use Claude Code default ('high')
        if (key === toCanonicalClaudeId(data.model?.id) || key === toCanonicalClaudeId(rawModel)) {
          return 'high';
        }
      }
    }
  }

  // 5. Claude Code default effort level
  return 'high';
}

// Claude Code built-in /effort slider exact TrueColor RGB palette (from claude.exe dark theme S)
const EFFORT_RGB = {
  warning:           '\x1b[38;2;255;193;7m',   // low:    rgb(255, 193, 7)
  success:           '\x1b[38;2;78;186;101m',  // medium: rgb(78, 186, 101)
  permission:        '\x1b[38;2;177;185;249m', // high:   rgb(177, 185, 249)
  autoAccept:        '\x1b[38;2;175;135;255m', // xhigh base:    rgb(175, 135, 255)
  autoAcceptShimmer: '\x1b[38;2;208;180;255m', // xhigh shimmer: #d0b4ff / rgb(208, 180, 255)
  inactive:          '\x1b[38;2;153;153;153m'  // off:    rgb(153, 153, 153)
};

// Claude Code built-in rainbow-animated palette fU (from claude.exe Oj(t + f))
const RAINBOW_ANSI = [
  '\x1b[38;2;235;95;87m',   // rainbow_red:    rgb(235, 95, 87)
  '\x1b[38;2;245;139;87m',  // rainbow_orange: rgb(245, 139, 87)
  '\x1b[38;2;250;195;95m',  // rainbow_yellow: rgb(250, 195, 95)
  '\x1b[38;2;145;200;130m', // rainbow_green:  rgb(145, 200, 130)
  '\x1b[38;2;130;170;220m', // rainbow_blue:   rgb(130, 170, 220)
  '\x1b[38;2;155;130;200m', // rainbow_indigo: rgb(155, 130, 200)
  '\x1b[38;2;200;130;180m'  // rainbow_violet: rgb(200, 130, 180)
];

// Exact 100ms (10 FPS) clock matching claude.exe Sa(100) -> Math.floor(a / 100)
function nextAnimFrame() {
  return Math.floor(Date.now() / 100);
}

// No-op SGR boundary marker (\x1b[0;0m) so claude.exe Dce(h) can also re-render
// xhigh/max in-process at 100ms (10 FPS) via Sa(100) without spawning child processes
const ANIM_MARKER = '\x1b[0;0m';

// Exact port of claude.exe function he(d) (autoAccept-shimmer for "xhigh")
function renderAutoAcceptShimmer(text, frame) {
  const chars = [...text];
  const g = chars.length + 4;
  const i = frame % g;
  const body = chars.map((c, h) => {
    const L = h === i;
    const oe = h === i - 1 || h === i + 1;
    const color = L ? EFFORT_RGB.autoAcceptShimmer : EFFORT_RGB.autoAccept;
    const weight = (L || oe) ? bold : '\x1b[22m';
    return `${weight}${color}${c}`;
  }).join('') + reset;
  return `${ANIM_MARKER}${body}${ANIM_MARKER}`;
}

// Exact port of claude.exe function Pt(d) + Oj(t + f) (rainbow-animated for "max")
function renderRainbowAnimated(text, frame) {
  const chars = [...text];
  const body = chars.map((m, t) => {
    const color = RAINBOW_ANSI[(t + frame) % RAINBOW_ANSI.length];
    return `${bold}${color}${m}`;
  }).join('') + reset;
  return `${ANIM_MARKER}${body}${ANIM_MARKER}`;
}

function formatEffortBadge(effortRaw) {
  let lvl = String(effortRaw || 'high').toLowerCase().trim();
  if (lvl === 'med') lvl = 'medium';

  if (lvl === 'xhigh') {
    const frame = nextAnimFrame();
    return {
      level: 'xhigh',
      label: 'xhigh',
      text: renderAutoAcceptShimmer('xhigh', frame)
    };
  }

  if (lvl === 'max') {
    const frame = nextAnimFrame();
    return {
      level: 'max',
      label: 'max',
      text: renderRainbowAnimated('max', frame)
    };
  }

  const staticMap = {
    low:    { label: 'low',    color: EFFORT_RGB.warning },
    medium: { label: 'medium', color: EFFORT_RGB.success },
    high:   { label: 'high',   color: EFFORT_RGB.permission },
    auto:   { label: 'auto',   color: EFFORT_RGB.permission },
    off:    { label: 'off',    color: EFFORT_RGB.inactive }
  };

  const item = staticMap[lvl] || {
    label: lvl,
    color: EFFORT_RGB.permission
  };

  return {
    level: lvl,
    label: item.label,
    text: `${bold}${item.color}${item.label}${reset}`
  };
}

function computeAccurateHitRate(hitTokens, totalInputTokens) {
  if (typeof totalInputTokens !== 'number' || totalInputTokens <= 0) return null;
  if (typeof hitTokens !== 'number' || hitTokens <= 0) return 0;
  if (hitTokens >= totalInputTokens) return 100;
  const raw = (hitTokens / totalInputTokens) * 100;
  // Prevent Math.round from turning >=99.5% into a fake 100% when uncached/write tokens exist
  return Math.min(99.9, Number(raw.toFixed(1)));
}

// Standard context window tiers across LLM hardware / architectures
const CONTEXT_TIERS = [
  16000, 32000, 64000, 128000, 200000, 256000, 500000, 512000, 1000000, 2000000, 4000000, 10000000
];

function scaleToNextTier(usedTokens) {
  for (const tier of CONTEXT_TIERS) {
    if (tier >= usedTokens * 1.05) {
      return tier;
    }
  }
  return Math.ceil((usedTokens * 1.2) / 1000000) * 1000000;
}

// Persistent Learned Model Cache: automatically remembers any discovered or scaled models
let learnedCache = {};
try {
  if (fs.existsSync(MODEL_CONTEXT_CACHE_PATH)) {
    learnedCache = JSON.parse(fs.readFileSync(MODEL_CONTEXT_CACHE_PATH, 'utf8')) || {};
  }
} catch {}

function saveLearnedModel(modelKey, size) {
  if (!modelKey || !size || size <= 0) return;
  if (learnedCache[modelKey] === size) return;
  learnedCache[modelKey] = size;
  writeJsonAtomic(MODEL_CONTEXT_CACHE_PATH, learnedCache);
}

// Auto-discover local CC Switch / Codex model catalogs
function queryLocalCatalog(modelKey) {
  if (!modelKey) return 0;
  try {
    if (fs.existsSync(CODEX_CATALOG_PATH)) {
      const cat = JSON.parse(fs.readFileSync(CODEX_CATALOG_PATH, 'utf8'));
      if (Array.isArray(cat?.models)) {
        for (const m of cat.models) {
          const s = (m.slug || '').toLowerCase().trim();
          const d = (m.display_name || '').toLowerCase().trim();
          const exactMatch = (s && s === modelKey) || (d && d === modelKey);
          const fuzzyMatch = (s.length >= 4 && (modelKey.includes(s) || s.includes(modelKey)))
                          || (d.length >= 4 && (modelKey.includes(d) || d.includes(modelKey)));
          if (exactMatch || fuzzyMatch) {
            const sz = m.max_context_window || m.context_window;
            if (typeof sz === 'number' && sz > 0) return sz;
          }
        }
      }
    }
  } catch {}
  return 0;
}

// Universal Self-Learning Context Engine (Works for current & ANY future new models)
function resolveModelContext(rawModel, modelId, providedSize, usedTokens) {
  const m = (modelId || rawModel || '').toLowerCase().trim();
  const displayKey = (rawModel || '').toLowerCase().trim();
  const settings = getClaudeSettings();
  const envMaxCtx = parseInt(process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS || settings.env?.CLAUDE_CODE_MAX_CONTEXT_TOKENS || '0', 10);
  const effectiveProvided = (providedSize && providedSize > 0) ? providedSize : (envMaxCtx > 0 ? envMaxCtx : 0);

  // 1. Explicit 1M / 2M Declaration (e.g. CC Switch "声明支持 1M" checkbox or CLAUDE_CODE_MAX_CONTEXT_TOKENS)
  if (effectiveProvided >= 1000000) {
    const finalSize = usedTokens > effectiveProvided ? scaleToNextTier(usedTokens) : effectiveProvided;
    saveLearnedModel(m, finalSize);
    return finalSize;
  }

  // 2. Check Persistent Learned Cache first
  const cachedVal = learnedCache[m] || learnedCache[displayKey];
  if (typeof cachedVal === 'number' && cachedVal > 0) {
    let cached = Math.max(cachedVal, effectiveProvided || 0);
    if (usedTokens > cached) {
      cached = scaleToNextTier(usedTokens);
    }
    saveLearnedModel(m, cached);
    return cached;
  }

  // 3. Universal Name Suffix / Token Extraction (e.g. -128k, -200k, -256k, -512k, -1m, -2m, _1m, 1m)
  const nameMatch = m.match(/(?:^|[-_./])(\d+)(k|m)(?:$|[-_./])/i);
  if (nameMatch) {
    const num = parseInt(nameMatch[1], 10);
    const unit = nameMatch[2].toLowerCase();
    const extracted = unit === 'm' ? num * 1000000 : num * 1000;
    if (extracted >= 16000 && extracted <= 10000000) {
      let finalSize = Math.max(extracted, effectiveProvided || 0);
      if (usedTokens > finalSize) {
        finalSize = scaleToNextTier(usedTokens);
      }
      saveLearnedModel(m, finalSize);
      return finalSize;
    }
  }

  // 4. Query Local CC Switch / Codex Catalogs
  const catalogSize = queryLocalCatalog(m) || queryLocalCatalog(displayKey);
  if (catalogSize > 0) {
    let finalSize = Math.max(catalogSize, effectiveProvided || 0);
    if (usedTokens > finalSize) {
      finalSize = scaleToNextTier(usedTokens);
    }
    saveLearnedModel(m, finalSize);
    return finalSize;
  }

  // 5. Intelligent Model Family Baseline
  const combinedName = `${m} ${displayKey}`;
  let baseline = 0;
  if (/gemini-(?:1\.5|2\.0)-pro/i.test(combinedName)) {
    baseline = 2000000;
  } else if (/gemini|grok|sol|astra|glm-5\.3|qwen.*long|(?:claude|opus|sonnet|fable).*(?:4-7|4\.7|4-8|4\.8|5|5\.5)/i.test(combinedName)) {
    baseline = 1000000;
  } else if (/claude|opus|sonnet|haiku|o1|o3|o4|kimi|moonshot/i.test(combinedName)) {
    baseline = 200000;
  } else if (/deepseek|gpt-4|qwen|glm|mistral|codestral|yi/i.test(combinedName)) {
    baseline = 128000;
  } else {
    baseline = effectiveProvided > 0 ? effectiveProvided : 128000;
  }

  if (effectiveProvided > baseline) {
    baseline = effectiveProvided;
  }

  // 6. Dynamic Real-Time Auto-Scaling (If conversation grows past baseline, adapt ceiling automatically)
  if (usedTokens > baseline) {
    baseline = scaleToNextTier(usedTokens);
  }

  saveLearnedModel(m, baseline);
  return baseline;
}

function renderProgressBar(percentage, width = 8) {
  const p = Math.max(0, Math.min(100, percentage));
  const filled = Math.round((p / 100) * width);
  const empty = width - filled;

  let color = C.green;
  if (p >= 80) color = C.red;
  else if (p >= 60) color = C.yellow;

  return `${color}${'█'.repeat(filled)}${C.darkGray}${'░'.repeat(empty)}${reset}`;
}

// Buffer standard input
let rawInput = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  rawInput += chunk;
});

process.stdin.on('end', () => {
  try {
    render(rawInput.trim() ? JSON.parse(rawInput) : {});
  } catch {
    render({});
  }
});

function render(data) {
  const rawModel = data.model?.display_name || data.model?.id || 'claude-sonnet-5-5';
  const modelId = data.model?.id || rawModel;
  const modelName = formatModelName(rawModel);
  const effortBadge = formatEffortBadge(resolveEffortLevel(data, rawModel));

  // Context window & tokens (multi-model & multi-version telemetry support)
  const ctx = data.context_window || {};
  const curUsage = ctx.current_usage || ctx.usage || data.current_usage || data.usage || {};

  // Universal multi-protocol cache read extractor:
  // 1. Anthropic Native: cache_read_input_tokens / cache_read_tokens
  // 2. OpenAI Chat: prompt_tokens_details.cached_tokens / cached_tokens
  // 3. OpenAI Responses API: input_tokens_details.cached_tokens
  // 4. Gemini Native: cachedContentTokenCount / cached_content_token_count
  const cachedTokens = curUsage.cache_read_tokens 
                    || curUsage.cache_read_input_tokens 
                    || curUsage.cached_tokens 
                    || curUsage.cachedContentTokenCount
                    || curUsage.cached_content_token_count
                    || curUsage.prompt_tokens_details?.cached_tokens
                    || curUsage.input_tokens_details?.cached_tokens
                    || ctx.total_cached_tokens 
                    || ctx.cache_read_input_tokens
                    || data.tokens?.cached 
                    || data.tokens?.cache_read
                    || 0;

  // Cache creation (write) tokens — in Anthropic protocol these are uncached misses billed at write rate
  const cacheCreationTokens = curUsage.cache_creation_input_tokens
                           || curUsage.cache_creation_tokens
                           || curUsage.cacheCreationInputTokens
                           || ctx.cache_creation_input_tokens
                           || data.tokens?.cache_creation
                           || 0;

  // Universal uncached input / output extractor across Anthropic, OpenAI, and Gemini
  let inputTokens = 0;
  if (typeof curUsage.input_tokens === 'number') {
    inputTokens = curUsage.input_tokens;
  } else if (typeof curUsage.uncached_input_tokens === 'number') {
    inputTokens = curUsage.uncached_input_tokens;
  } else if (typeof curUsage.prompt_tokens === 'number') {
    // OpenAI prompt_tokens includes cached_tokens
    inputTokens = curUsage.prompt_tokens >= cachedTokens ? (curUsage.prompt_tokens - cachedTokens) : curUsage.prompt_tokens;
  } else if (typeof curUsage.promptTokenCount === 'number') {
    inputTokens = curUsage.promptTokenCount >= cachedTokens ? (curUsage.promptTokenCount - cachedTokens) : curUsage.promptTokenCount;
  } else if (typeof data.tokens?.input === 'number') {
    inputTokens = data.tokens.input;
  } else if (typeof ctx.total_input_tokens === 'number') {
    // Claude Code total_input_tokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
    inputTokens = Math.max(0, ctx.total_input_tokens - cachedTokens - cacheCreationTokens);
  }

  const outputTokens = curUsage.output_tokens 
                    || curUsage.completion_tokens
                    || curUsage.candidatesTokenCount
                    || ctx.total_output_tokens 
                    || data.tokens?.output 
                    || 0;

  // Check cumulative session cache metrics if turn-level is unpopulated
  let sessionCached = 0;
  let sessionInput = 0;
  if (data.modelUsage && typeof data.modelUsage === 'object') {
    for (const m of Object.values(data.modelUsage)) {
      const readToks = m.cacheReadInputTokens 
                    || m.cache_read_tokens 
                    || m.cached_tokens 
                    || m.cachedContentTokenCount
                    || m.cached_content_token_count
                    || m.prompt_tokens_details?.cached_tokens
                    || m.input_tokens_details?.cached_tokens
                    || 0;
      const writeToks = m.cacheCreationInputTokens
                     || m.cache_creation_input_tokens
                     || m.cache_creation_tokens
                     || 0;
      const inToks = m.inputTokens || m.input_tokens || m.prompt_tokens || m.promptTokenCount || 0;
      sessionCached += readToks;
      sessionInput += (inToks + writeToks + readToks);
    }
  }

  // Real conversation tokens in context (uncached + cache_creation + cache_read + output)
  const turnTotal = inputTokens + cacheCreationTokens + cachedTokens;
  let usedTokens = turnTotal + outputTokens;
  const maxCtx = resolveModelContext(rawModel, modelId, ctx.context_window_size, usedTokens);
  let ctxPct = 0;

  // Always compute ctxPct from (usedTokens / maxCtx) when usedTokens > 0 so percentage and (used/max) never contradict
  if (maxCtx > 0 && usedTokens > 0) {
    ctxPct = (usedTokens / maxCtx) * 100;
  } else if (typeof ctx.used_percentage === 'number' && ctx.used_percentage > 0) {
    ctxPct = ctx.used_percentage;
    if (usedTokens === 0 && maxCtx > 0) {
      usedTokens = Math.round((ctxPct / 100) * maxCtx);
    }
  }

  // Accurate per-turn API Speed (TPS: Tokens per second)
  // Uses delta of cost.total_api_duration_ms instead of session wall-clock total_duration_ms
  let prevTpsRecord = null;
  try {
    if (fs.existsSync(TPS_CACHE_PATH)) {
      prevTpsRecord = JSON.parse(fs.readFileSync(TPS_CACHE_PATH, 'utf8'));
    }
  } catch {}

  const totalApiMs = data.cost?.total_api_duration_ms || data.session?.total_api_duration_ms || 0;
  const sessionId = data.session_id || data.remote?.session_id || '';
  let currentTps = null;

  if (totalApiMs > 0 && outputTokens > 0) {
    let deltaApiMs = totalApiMs;
    if (
      prevTpsRecord &&
      typeof prevTpsRecord.totalApiMs === 'number' &&
      (!sessionId || !prevTpsRecord.sessionId || prevTpsRecord.sessionId === sessionId) &&
      totalApiMs >= prevTpsRecord.totalApiMs
    ) {
      deltaApiMs = totalApiMs - prevTpsRecord.totalApiMs;
    }
    if (deltaApiMs >= 200) {
      currentTps = ((outputTokens / deltaApiMs) * 1000).toFixed(1);
      writeJsonAtomic(TPS_CACHE_PATH, {
        tps: currentTps,
        totalApiMs,
        sessionId,
        time: Date.now()
      });
    }
  }

  // Ignore legacy corrupted TPS records that lacked totalApiMs (which divided by multi-hour wall clock)
  const validCachedTps = (prevTpsRecord && typeof prevTpsRecord.totalApiMs === 'number') ? prevTpsRecord.tps : null;
  const displayTps = currentTps || validCachedTps || '—';

  // Compute accurate Cache Hit Rate:
  // Formula: cache_read / (uncached_input + cache_creation + cache_read)
  // Never rounds <100% up to 100% when uncached or cache_creation tokens exist.
  let cacheHitRate = null;
  let displayCacheTokens = 0;

  if (turnTotal > 0) {
    cacheHitRate = computeAccurateHitRate(cachedTokens, turnTotal);
    displayCacheTokens = cachedTokens;
  } else if (sessionInput > 0) {
    cacheHitRate = computeAccurateHitRate(sessionCached, sessionInput);
    displayCacheTokens = sessionCached;
  } else if (typeof data.prompt_cache?.hit_ratio === 'number') {
    const ratio = data.prompt_cache.hit_ratio;
    cacheHitRate = ratio >= 1 ? 100 : Math.min(99.9, Number((ratio * 100).toFixed(1)));
  }

  // Export real-time cache stats atomically for Dinotty status bar & plugins
  const statsPayload = {
    cacheHitRate: cacheHitRate ?? 0,
    displayCacheTokens,
    cachedTokens,
    cacheCreationTokens,
    inputTokens,
    outputTokens,
    model: modelName,
    effort: effortBadge.label,
    effortLevel: effortBadge.level,
    usedTokens,
    maxCtx,
    ctxPct: Number(ctxPct.toFixed(1)),
    tps: displayTps,
    time: Date.now()
  };
  writeJsonAtomic(path.join(CLAUDE_DIR, 'cache_stats.json'), statsPayload);

  // Rate Limits / Quotas (5-hour, if present)
  const fiveHour = data.rate_limits?.five_hour;
  const fiveHourPct = fiveHour?.used_percentage;
  const fiveHourReset = fiveHour?.resets_at;

  // Divider
  const divider = `${C.darkGray} │ ${reset}`;
  const segments = [];

  // 1. Model Badge with 📦 icon
  segments.push({
    priority: 1,
    text: `${C.cyan}${bold}📦 ${modelName}${reset}`
  });

  // 2. Permanent Effort / Thinking Strength Level (Level name only)
  segments.push({
    priority: 1,
    text: effortBadge.text
  });

  // 3. Context Window Progress Bar & Capacity
  const bar = renderProgressBar(ctxPct, 8);
  let pctColor = C.green;
  if (ctxPct >= 80) pctColor = C.red;
  else if (ctxPct >= 60) pctColor = C.yellow;

  const ctxFormatted = `${formatTokens(usedTokens)}/${formatTokens(maxCtx)}`;
  segments.push({
    priority: 1,
    text: `${C.gray}Ctx ${bar} ${pctColor}${bold}${ctxPct.toFixed(1)}%${reset} ${C.gray}(${ctxFormatted})${reset}`
  });

  // 4. Cache Hit Rate Badge (Multi-model: Claude / DeepSeek / GPT / Gemini)
  if (cacheHitRate !== null) {
    let cacheColor = C.darkGray;
    if (cacheHitRate >= 80) cacheColor = C.green;
    else if (cacheHitRate >= 50) cacheColor = C.cyan;
    else if (cacheHitRate > 0) cacheColor = C.purple;
    const cacheTokensStr = displayCacheTokens > 0 ? ` (${formatTokens(displayCacheTokens)})` : '';
    segments.push({
      priority: 1,
      text: `${cacheColor}${bold}💾 Cache ${cacheHitRate}%${reset}${C.gray}${cacheTokensStr}${reset}`
    });
  }

  // 5. 5-Hour Quota / Reset Countdown (if available)
  if (typeof fiveHourPct === 'number' || fiveHourReset) {
    const quotaStr = typeof fiveHourPct === 'number' ? `${Math.round(fiveHourPct)}%` : '';
    const cd = formatCountdown(fiveHourReset);
    const resetStr = cd ? ` (${cd})` : '';
    segments.push({
      priority: 3,
      text: `${C.magenta}⏳ 5h: ${quotaStr}${resetStr}${reset}`
    });
  }

  // Responsive width handling (supports piped stdout via COLUMNS env)
  const termWidth = parseInt(process.env.COLUMNS || '0', 10) || process.stdout.columns || 120;
  const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, '');

  let out = segments.map(s => s.text).join(divider);
  let len = stripAnsi(out).length;

  if (len > termWidth) {
    // Drop priority 3
    out = segments.filter(s => s.priority <= 2).map(s => s.text).join(divider);
    len = stripAnsi(out).length;
  }
  if (len > termWidth) {
    // Drop priority 2
    out = segments.filter(s => s.priority <= 1).map(s => s.text).join(divider);
  }

  process.stdout.write(out);
}
