import { useCallback, useMemo, useState } from 'react';
import { useMonitoringAnalytics } from '@/features/monitoring/hooks/useMonitoringAnalytics';
import {
  adaptUsageAnalyticsData,
  analyzeUsageBucket,
  buildCredentialQuotaRows,
  buildEntityTrendSeries,
  buildKeyAnomalies,
  buildUsageInsights,
  buildUsageMatrix,
  buildUsageAnalyticsFilters,
  buildUsageAnalyticsInclude,
  getUsageRangeBounds,
  resolveUsageGranularity,
  USAGE_ANALYTICS_DEFAULT_FILTERS,
  USAGE_VIEW_SHORTCUTS,
  type UsageMatrixDimension,
  type UsageMatrixMetricKey,
  type UsageTrendMetricKey,
  type UsageAnalyticsFiltersState,
  type UsageAnalyticsTab,
  type UsageSelectedFilterKey,
  type UsageAnomalyAnalysis,
  type UsageTimelinePoint,
} from './usageAnalyticsModel';

const FAVORITE_VIEWS_STORAGE_KEY = 'cpa-manager-plus:usage-analytics:favorite-views';
const RECENT_VIEWS_STORAGE_KEY = 'cpa-manager-plus:usage-analytics:recent-views';

export type UsageRecentView = {
  id: string;
  labelKey: string;
  tab: UsageAnalyticsTab;
  viewedAtMs: number;
};

const readStringArray = (key: string, fallback: string[]) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures; analytics remains usable without local shortcuts.
  }
};

const readRecentViews = (): UsageRecentView[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_VIEWS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is UsageRecentView =>
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.labelKey === 'string' &&
          typeof item.tab === 'string' &&
          typeof item.viewedAtMs === 'number'
      )
      .slice(0, 6);
  } catch {
    return [];
  }
};

export function useUsageAnalytics() {
  const [filters, setFiltersState] = useState<UsageAnalyticsFiltersState>(
    USAGE_ANALYTICS_DEFAULT_FILTERS
  );
  const [activeTabState, setActiveTabState] = useState<UsageAnalyticsTab>('overview');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedBucketMs, setSelectedBucketMs] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedApiKeyHash, setSelectedApiKeyHash] = useState('');
  const [selectedCredentialId, setSelectedCredentialId] = useState('');
  const [trendMetric, setTrendMetric] = useState<UsageTrendMetricKey>('requestCount');
  const [matrixDimension, setMatrixDimension] =
    useState<UsageMatrixDimension>('apiKeyModel');
  const [matrixMetric, setMatrixMetric] = useState<UsageMatrixMetricKey>('requestCount');
  const [activeCredentialsOnly, setActiveCredentialsOnly] = useState(true);
  const [favoriteViewIds, setFavoriteViewIds] = useState<string[]>(() =>
    readStringArray(
      FAVORITE_VIEWS_STORAGE_KEY,
      USAGE_VIEW_SHORTCUTS.filter((view) => view.favorite).map((view) => view.id)
    )
  );
  const [recentViews, setRecentViews] = useState<UsageRecentView[]>(() => readRecentViews());

  const recordRecentView = useCallback((tab: UsageAnalyticsTab) => {
    const shortcut =
      USAGE_VIEW_SHORTCUTS.find((view) => view.tab === tab) ??
      USAGE_VIEW_SHORTCUTS.find((view) => view.id === 'daily-board');
    if (!shortcut) return;
    setRecentViews((current) => {
      const next = [
        {
          id: `${shortcut.id}:${tab}`,
          labelKey: shortcut.labelKey,
          tab,
          viewedAtMs: Date.now(),
        },
        ...current.filter((item) => item.tab !== tab),
      ].slice(0, 6);
      writeJson(RECENT_VIEWS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setActiveTab = useCallback(
    (tab: UsageAnalyticsTab) => {
      setActiveTabState(tab);
      recordRecentView(tab);
    },
    [recordRecentView]
  );

  const bounds = useMemo(() => getUsageRangeBounds(filters, nowMs), [filters, nowMs]);
  const resolvedGranularity = useMemo(
    () => resolveUsageGranularity(filters, nowMs),
    [filters, nowMs]
  );
  const analyticsFilters = useMemo(
    () => buildUsageAnalyticsFilters(filters),
    [filters]
  );
  const drilldownPreview = useMemo(() => {
    if (selectedBucketMs === null) return null;
    return {
      fromMs: selectedBucketMs,
      toMs:
        selectedBucketMs +
        (resolvedGranularity === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000),
      limit: 12,
    };
  }, [resolvedGranularity, selectedBucketMs]);
  const include = useMemo(
    () => buildUsageAnalyticsInclude(resolvedGranularity, drilldownPreview),
    [drilldownPreview, resolvedGranularity]
  );
  const dataScopeKey = useMemo(
    () =>
      JSON.stringify({
        bounds,
        drilldownPreview,
        filters: analyticsFilters,
        granularity: resolvedGranularity,
        keyword: filters.apiKeyKeyword,
        matrixDimension,
        matrixMetric,
        trendMetric,
      }),
    [
      analyticsFilters,
      bounds,
      drilldownPreview,
      filters.apiKeyKeyword,
      matrixDimension,
      matrixMetric,
      resolvedGranularity,
      trendMetric,
    ]
  );

  const analytics = useMonitoringAnalytics({
    fromMs: bounds?.fromMs,
    toMs: bounds?.toMs,
    nowMs,
    dataScopeKey,
    filters: analyticsFilters,
    include,
    throttleMs: 0,
  });

  const adapted = useMemo(
    () => adaptUsageAnalyticsData(analytics.data, resolvedGranularity, filters.apiKeyKeyword),
    [analytics.data, filters.apiKeyKeyword, resolvedGranularity]
  );

  const selectedBucket = useMemo(
    () =>
      selectedBucketMs === null
        ? null
        : (adapted.timeline.find((point) => point.bucketMs === selectedBucketMs) ?? null),
    [adapted.timeline, selectedBucketMs]
  );

  const anomalyAnalysis = useMemo<UsageAnomalyAnalysis | null>(
    () =>
      selectedBucketMs === null ? null : analyzeUsageBucket(adapted.timeline, selectedBucketMs),
    [adapted.timeline, selectedBucketMs]
  );

  const selectedModel =
    adapted.modelRows.find((row) => row.id === selectedModelId) ?? adapted.modelRows[0] ?? null;
  const selectedApiKey =
    adapted.apiKeyRows.find((row) => row.apiKeyHash === selectedApiKeyHash) ??
    adapted.apiKeyRows[0] ??
    null;
  const selectedCredential =
    adapted.credentialRows.find((row) => row.id === selectedCredentialId) ??
    adapted.credentialRows[0] ??
    null;

  const visibleCredentialRows = useMemo(
    () =>
      activeCredentialsOnly
        ? adapted.credentialRows.filter((row) => row.requestCount > 0)
        : adapted.credentialRows,
    [activeCredentialsOnly, adapted.credentialRows]
  );

  const modelTrendSeries = useMemo(
    () => buildEntityTrendSeries(adapted.modelRows, adapted.timeline, trendMetric, 4),
    [adapted.modelRows, adapted.timeline, trendMetric]
  );
  const apiKeyTrendSeries = useMemo(
    () => buildEntityTrendSeries(adapted.apiKeyRows, adapted.timeline, trendMetric, 4),
    [adapted.apiKeyRows, adapted.timeline, trendMetric]
  );
  const matrix = useMemo(
    () =>
      buildUsageMatrix({
        apiKeyRows: adapted.apiKeyRows,
        credentialRows: adapted.credentialRows,
        dimension: matrixDimension,
        metric: matrixMetric,
      }),
    [adapted.apiKeyRows, adapted.credentialRows, matrixDimension, matrixMetric]
  );
  const keyAnomalies = useMemo(
    () => buildKeyAnomalies(adapted.apiKeyRows),
    [adapted.apiKeyRows]
  );
  const credentialQuotaRows = useMemo(
    () => buildCredentialQuotaRows(visibleCredentialRows, nowMs),
    [nowMs, visibleCredentialRows]
  );
  const insights = useMemo(
    () =>
      buildUsageInsights({
        apiKeyRows: adapted.apiKeyRows,
        credentialRows: adapted.credentialRows,
        modelRows: adapted.modelRows,
        providerRows: adapted.providerRows,
        summary: adapted.summary,
      }),
    [
      adapted.apiKeyRows,
      adapted.credentialRows,
      adapted.modelRows,
      adapted.providerRows,
      adapted.summary,
    ]
  );
  const favoriteViews = useMemo(
    () =>
      USAGE_VIEW_SHORTCUTS.map((view) => ({
        ...view,
        favorite: favoriteViewIds.includes(view.id),
      })),
    [favoriteViewIds]
  );

  const toggleFavoriteView = useCallback((id: string) => {
    setFavoriteViewIds((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      writeJson(FAVORITE_VIEWS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const clearRecentViews = useCallback(() => {
    setRecentViews([]);
    writeJson(RECENT_VIEWS_STORAGE_KEY, []);
  }, []);

  const setFilters = useCallback((patch: Partial<UsageAnalyticsFiltersState>) => {
    setFiltersState((current) => ({ ...current, ...patch }));
    setSelectedBucketMs(null);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(USAGE_ANALYTICS_DEFAULT_FILTERS);
    setSelectedBucketMs(null);
  }, []);

  const clearFilter = useCallback((key: UsageSelectedFilterKey) => {
    setFiltersState((current) => ({
      ...current,
      [key]: 'all',
    }));
    setSelectedBucketMs(null);
  }, []);

  const selectBucket = useCallback((point: UsageTimelinePoint | null) => {
    setSelectedBucketMs(point?.bucketMs ?? null);
  }, []);

  const refresh = useCallback(() => {
    setNowMs(Date.now());
    void analytics.refresh({ force: true });
  }, [analytics]);

  return {
    filters,
    setFilters,
    resetFilters,
    clearFilter,
    activeTab: activeTabState,
    setActiveTab,
    bounds,
    resolvedGranularity,
    loading: analytics.loading,
    error: analytics.error,
    enabled: analytics.enabled,
    unavailableReason: analytics.unavailableReason,
    lastRefreshedAt: analytics.lastRefreshedAt,
    refresh,
    summary: adapted.summary,
    timeline: adapted.timeline,
    modelRows: adapted.modelRows,
    apiKeyRows: adapted.apiKeyRows,
    credentialRows: visibleCredentialRows,
    allCredentialRows: adapted.credentialRows,
    providerRows: adapted.providerRows,
    heatmap: adapted.heatmap,
    matrix,
    matrixDimension,
    setMatrixDimension,
    matrixMetric,
    setMatrixMetric,
    trendMetric,
    setTrendMetric,
    modelTrendSeries,
    apiKeyTrendSeries,
    keyAnomalies,
    credentialQuotaRows,
    activeCredentialsOnly,
    setActiveCredentialsOnly,
    insights,
    favoriteViews,
    toggleFavoriteView,
    recentViews,
    clearRecentViews,
    anomalyPoints: adapted.anomalyPoints,
    drilldownPreview: adapted.drilldownPreview,
    filterOptions: adapted.filterOptions,
    selectedBucket,
    selectBucket,
    anomalyAnalysis,
    selectedModel,
    setSelectedModelId,
    selectedApiKey,
    setSelectedApiKeyHash,
    selectedCredential,
    setSelectedCredentialId,
  };
}
