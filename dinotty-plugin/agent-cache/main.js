export function activate(ctx) {
  const state = ctx.reactive({
    cacheHitRate: null,
    cachedTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    usedTokens: 0,
    maxCtx: 128000,
    ctxPct: 0,
    model: '',
    tps: '—',
    lastUpdate: 0,
    hasData: false,
  });

  function formatTokens(n) {
    if (!n || n <= 0) return '0';
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

  function formatAgo(ts) {
    if (!ts) return '未更新';
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 5) return '刚刚';
    if (diffSec < 60) return `${diffSec} 秒前`;
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min} 分钟前`;
    const hr = Math.floor(min / 60);
    return `${hr} 小时前`;
  }

  async function syncStats() {
    try {
      const res = await ctx.workspace.readFile('~/.claude/cache_stats.json');
      if (res && res.content) {
        const data = JSON.parse(res.content);
        if (data && typeof data === 'object') {
          if (typeof data.cacheHitRate === 'number') {
            state.cacheHitRate = data.cacheHitRate;
          }
          state.cachedTokens = data.displayCacheTokens || data.cachedTokens || 0;
          state.inputTokens = data.inputTokens || 0;
          state.outputTokens = data.outputTokens || 0;
          state.usedTokens = data.usedTokens || (state.inputTokens + state.outputTokens + state.cachedTokens);
          state.maxCtx = data.maxCtx || 128000;
          state.ctxPct = data.ctxPct != null ? data.ctxPct : Math.round((state.usedTokens / state.maxCtx) * 100);
          state.model = data.model || '';
          state.tps = data.tps || '—';
          state.lastUpdate = data.time || Date.now();
          state.hasData = true;
        }
      }
    } catch {
      // 容错处理
    }
  }

  syncStats();
  const timer = setInterval(syncStats, 1000);

  return {
    dispose() {
      clearInterval(timer);
    },
    monitor: {
      series: [
        {
          id: 'agent-cache:hit-rate',
          label: 'AI 缓存命中率与上下文',
          scale: 'percent',
          color: '#10b981',
          statusIcon: 'Zap',
          defaultVisible: true,
          current: () => {
            return state.cacheHitRate;
          },
          statusText: () => {
            if (!state.hasData || state.cacheHitRate === null) {
              return 'Cache —';
            }
            const tokStr = state.cachedTokens > 0 ? ` (${formatTokens(state.cachedTokens)})` : '';
            return `Cache ${state.cacheHitRate}%${tokStr}`;
          },
          detail: () => {
            const ctxStr = `${formatTokens(state.usedTokens)} / ${formatTokens(state.maxCtx)} (${state.ctxPct}%)`;
            return [
              {
                label: '缓存命中率',
                value: state.cacheHitRate !== null ? `${state.cacheHitRate}%` : '—',
              },
              {
                label: '已命中缓存',
                value: `${formatTokens(state.cachedTokens)} tokens`,
              },
              {
                label: '上下文容量',
                value: ctxStr,
              },
              {
                label: '输入消耗',
                value: `${formatTokens(state.inputTokens)} tokens`,
              },
              {
                label: '输出消耗',
                value: `${formatTokens(state.outputTokens)} tokens`,
              },
              {
                label: '活跃模型',
                value: state.model || 'Unknown',
              },
              {
                label: '生成速率',
                value: state.tps && state.tps !== '—' ? `${state.tps} TPS` : '—',
              },
              {
                label: '最近更新',
                value: formatAgo(state.lastUpdate),
              },
            ];
          },
        },
      ],
    },
  };
}
