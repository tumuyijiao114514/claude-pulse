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
  const now = Math.floor(Date.now() / 1000);
  const diff = targetTs - now;
  if (diff <= 0) return '0m';
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h${remMin > 0 ? remMin + 'm' : ''}`;
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
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) || {};
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
          rawModel,
          data.model?.id,
          settings.model,
          settings.model === 'fable' ? 'claude-opus-5-5' : null,
          settings.model === 'fable' ? 'claude-opus-5' : null
        ].filter(Boolean);
        for (const key of candidates) {
          if (ms[key]?.effortLevel) {
            return String(ms[key].effortLevel).toLowerCase().trim();
          }
        }
        for (const val of Object.values(ms)) {
          if (val && typeof val.effortLevel === 'string' && val.effortLevel.trim()) {
            return val.effortLevel.toLowerCase().trim();
          }
        }
      }
    }
  } catch {}

  // 5. Claude Code default effort level
  return 'high';
}

function formatEffortBadge(effortRaw) {
  const lvl = String(effortRaw || 'high').toLowerCase().trim();
  const map = {
    low:    { label: 'Low',   color: C.green },
    medium: { label: 'Med',   color: C.blue },
    med:    { label: 'Med',   color: C.blue },
    high:   { label: 'High',  color: C.yellow },
    xhigh:  { label: 'XHigh', color: C.orange },
    max:    { label: 'Max',   color: C.magenta },
    auto:   { label: 'Auto',  color: C.cyan },
    off:    { label: 'Off',   color: C.gray }
  };
  const item = map[lvl] || {
    label: lvl.charAt(0).toUpperCase() + lvl.slice(1),
    color: C.yellow
  };
  return {
    level: lvl,
    label: item.label,
    text: `${item.color}${bold}🧠 Effort ${item.label}${reset}`
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
  try {
    fs.writeFileSync(MODEL_CONTEXT_CACHE_PATH, JSON.stringify(learnedCache, null, 2), 'utf8');
  } catch {}
}

// Auto-discover local CC Switch / Codex model catalogs
function queryLocalCatalog(modelKey) {
  try {
    if (fs.existsSync(CODEX_CATALOG_PATH)) {
      const cat = JSON.parse(fs.readFileSync(CODEX_CATALOG_PATH, 'utf8'));
      if (Array.isArray(cat?.models)) {
        for (const m of cat.models) {
          const s = (m.slug || '').toLowerCase();
          const d = (m.display_name || '').toLowerCase();
          if (s === modelKey || d === modelKey || modelKey.includes(s) || s.includes(modelKey)) {
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
function resolveModelContext(rawModel, providedSize, usedTokens) {
  const m = (rawModel || '').toLowerCase().trim();

  // 1. Explicit 1M / 2M Declaration (e.g. CC Switch "声明支持 1M" checkbox)
  if (providedSize && providedSize >= 1000000) {
    saveLearnedModel(m, providedSize);
    return providedSize;
  }

  // 2. Check Persistent Learned Cache first
  if (learnedCache[m] && typeof learnedCache[m] === 'number') {
    let cached = learnedCache[m];
    if (usedTokens > cached) {
      cached = scaleToNextTier(usedTokens);
      saveLearnedModel(m, cached);
    }
    return cached;
  }

  // 3. Universal Name Suffix / Token Extraction (e.g. -128k, -200k, -256k, -512k, -1m, -2m, _1m, 1m)
  // Automatically handles any future model named with its context size without needing code changes!
  const nameMatch = m.match(/(?:^|[-_./])(\d+)(k|m)(?:$|[-_./])/i);
  if (nameMatch) {
    const num = parseInt(nameMatch[1], 10);
    const unit = nameMatch[2].toLowerCase();
    const extracted = unit === 'm' ? num * 1000000 : num * 1000;
    if (extracted >= 16000 && extracted <= 10000000) {
      let finalSize = extracted;
      if (usedTokens > finalSize) {
        finalSize = scaleToNextTier(usedTokens);
      }
      saveLearnedModel(m, finalSize);
      return finalSize;
    }
  }

  // 4. Query Local CC Switch / Codex Catalogs
  const catalogSize = queryLocalCatalog(m);
  if (catalogSize > 0) {
    let finalSize = catalogSize;
    if (usedTokens > finalSize) {
      finalSize = scaleToNextTier(usedTokens);
    }
    saveLearnedModel(m, finalSize);
    return finalSize;
  }

  // 5. Intelligent Model Family Baseline
  let baseline = 0;
  if (/gemini-(?:1\.5|2\.0)-pro/i.test(m)) {
    baseline = 2000000;
  } else if (/gemini|grok|sol|astra|glm-5\.3|qwen.*long|claude.*(?:5|5\.5)/i.test(m)) {
    baseline = 1000000;
  } else if (/claude|o1|o3|o4|kimi|moonshot/i.test(m)) {
    baseline = 200000;
  } else if (/deepseek|gpt-4|qwen|glm|mistral|codestral|yi/i.test(m)) {
    baseline = 128000;
  } else {
    baseline = providedSize && providedSize > 0 ? providedSize : 128000;
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

// Git branch finder (upward traversal, supports worktrees & submodules, zero subprocess latency)
function getGitBranch(startDir) {
  if (!startDir) return null;
  let cur = path.resolve(startDir);
  const root = path.parse(cur).root;

  while (cur && cur !== root) {
    const gitPath = path.join(cur, '.git');
    try {
      if (fs.existsSync(gitPath)) {
        const stat = fs.statSync(gitPath);
        let headPath = '';
        if (stat.isDirectory()) {
          headPath = path.join(gitPath, 'HEAD');
        } else {
          const content = fs.readFileSync(gitPath, 'utf8').trim();
          if (content.startsWith('gitdir:')) {
            headPath = path.resolve(cur, content.slice(7).trim(), 'HEAD');
          }
        }
        if (headPath && fs.existsSync(headPath)) {
          const head = fs.readFileSync(headPath, 'utf8').trim();
          if (head.startsWith('ref: refs/heads/')) {
            return head.replace('ref: refs/heads/', '');
          }
          return head.slice(0, 7);
        }
      }
    } catch {}
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
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
  const cwd = data.cwd || data.workspace?.current_dir || process.cwd();
  const rawModel = data.model?.display_name || data.model?.id || 'claude-sonnet-5-5';
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
  const maxCtx = resolveModelContext(rawModel, ctx.context_window_size, usedTokens);
  let ctxPct = 0;

  if (typeof ctx.used_percentage === 'number' && ctx.used_percentage > 0) {
    ctxPct = ctx.used_percentage;
    if (usedTokens === 0) {
      usedTokens = Math.round((ctxPct / 100) * maxCtx);
    }
  } else if (maxCtx > 0 && usedTokens > 0) {
    ctxPct = (usedTokens / maxCtx) * 100;
  }

  // Speed (TPS: Tokens per second)
  let lastTps = null;
  try {
    if (fs.existsSync(TPS_CACHE_PATH)) {
      lastTps = JSON.parse(fs.readFileSync(TPS_CACHE_PATH, 'utf8')).tps;
    }
  } catch {}

  const durationMs = data.cost?.total_duration_ms || 0;
  let currentTps = null;
  if (durationMs >= 400 && outputTokens > 0) {
    currentTps = ((outputTokens / durationMs) * 1000).toFixed(1);
    try {
      fs.writeFileSync(TPS_CACHE_PATH, JSON.stringify({ tps: currentTps, time: Date.now() }), 'utf8');
    } catch {}
  }
  const displayTps = currentTps || lastTps || '—';

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

  // Export real-time cache stats for Dinotty status bar & plugins
  try {
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
    fs.writeFileSync(path.join(CLAUDE_DIR, 'cache_stats.json'), JSON.stringify(statsPayload, null, 2), 'utf8');
  } catch {}

  // Rate Limits / Quotas (5-hour and 7-day, if present)
  const fiveHour = data.rate_limits?.five_hour;
  const fiveHourPct = fiveHour?.used_percentage;
  const fiveHourReset = fiveHour?.resets_at;

  // Git Branch
  const branch = getGitBranch(cwd);

  // Divider
  const divider = `${C.darkGray} │ ${reset}`;
  const segments = [];

  // 1. Model Badge with 📦 icon
  segments.push({
    priority: 1,
    text: `${C.cyan}${bold}📦 ${modelName}${reset}`
  });

  // 2. Permanent Effort / Thinking Strength Badge (🧠 Effort)
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
    const resetStr = fiveHourReset ? ` (${formatCountdown(fiveHourReset)})` : '';
    segments.push({
      priority: 3,
      text: `${C.magenta}⏳ 5h: ${quotaStr}${resetStr}${reset}`
    });
  }

  // Responsive width handling
  const termWidth = process.stdout.columns || 120;
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
