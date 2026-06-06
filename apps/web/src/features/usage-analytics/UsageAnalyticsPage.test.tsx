import { act } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/Button';
import {
  USAGE_ANALYTICS_DEFAULT_FILTERS,
  type UsageRankRow,
  type UsageTimelinePoint,
} from './usageAnalyticsModel';
import { UsageAnalyticsPage } from './UsageAnalyticsPage';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    downloadBlob: vi.fn(),
    navigate: vi.fn(),
    usageState: null as unknown,
  },
}));

vi.mock('@/utils/download', () => ({
  downloadBlob: mocks.downloadBlob,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, options?: Record<string, unknown>) => {
      if (!options) return key;
      return Object.entries(options).reduce(
        (value, [name, replacement]) => value.replace(`{{${name}}}`, String(replacement)),
        key
      );
    },
  }),
}));

vi.mock('./useUsageAnalytics', () => ({
  useUsageAnalytics: () => mocks.usageState,
}));

const getText = (node: ReactTestInstance): string =>
  node.children
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      return getText(child);
    })
    .join('');

const renderPage = () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<UsageAnalyticsPage />);
  });
  return renderer;
};

const findHostButtonByText = (renderer: ReactTestRenderer, text: string) => {
  const button = renderer.root
    .findAllByType('button')
    .find((node) => getText(node).includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
};

const clickHostButton = (button: ReactTestInstance) => {
  const onClick = button.props.onClick as (() => void) | undefined;
  if (!onClick) throw new Error('Button onClick not found');
  act(() => {
    onClick();
  });
};

const createTimelinePoint = (overrides: Partial<UsageTimelinePoint> = {}): UsageTimelinePoint => ({
  bucketMs: 1_780_000_000_000,
  bucketEndMs: 1_780_003_600_000,
  label: '06/04 12:00',
  requestCount: 12,
  totalTokens: 1200,
  inputTokens: 700,
  outputTokens: 400,
  cachedTokens: 100,
  cacheReadTokens: 80,
  cacheCreationTokens: 20,
  reasoningTokens: 0,
  estimatedCost: 1.25,
  successCount: 11,
  failureCount: 1,
  successRate: 11 / 12,
  failureRate: 1 / 12,
  averageLatencyMs: 250,
  p95LatencyMs: 420,
  p95TtftMs: 180,
  cacheHitRate: 0.1,
  averageTokensPerRequest: 100,
  ...overrides,
});

const createRankRow = (overrides: Partial<UsageRankRow> = {}): UsageRankRow => ({
  id: 'gpt-4o',
  label: 'gpt-4o',
  model: 'gpt-4o',
  requestCount: 12,
  successCount: 11,
  failureCount: 1,
  successRate: 11 / 12,
  totalTokens: 1200,
  inputTokens: 700,
  outputTokens: 400,
  cachedTokens: 100,
  cacheReadTokens: 80,
  cacheCreationTokens: 20,
  estimatedCost: 1.25,
  averageLatencyMs: null,
  share: 1,
  ...overrides,
});

const createUsageState = (overrides: Record<string, unknown> = {}) => {
  const point = createTimelinePoint();
  const modelRow = createRankRow();
  const apiKeyRow = createRankRow({
    id: 'abcdef1234567890',
    label: 'sk-****7890',
    apiKeyHash: 'abcdef1234567890',
    model: undefined,
    models: [
      createRankRow({
        id: 'gpt-4o',
        label: 'gpt-4o',
        model: 'gpt-4o',
        share: 1,
      }),
    ],
  });
  const credentialRow = createRankRow({
    id: 'credential-prod',
    label: 'prod-auth',
    model: undefined,
    provider: 'openai',
    authFile: 'auth.json',
    projectId: 'project-a',
    models: [
      createRankRow({
        id: 'gpt-4o',
        label: 'gpt-4o',
        model: 'gpt-4o',
        share: 1,
      }),
    ],
  });

  return {
    filters: USAGE_ANALYTICS_DEFAULT_FILTERS,
    setFilters: vi.fn(),
    resetFilters: vi.fn(),
    clearFilter: vi.fn(),
    activeTab: 'overview',
    setActiveTab: vi.fn(),
    bounds: { fromMs: point.bucketMs, toMs: point.bucketEndMs },
    resolvedGranularity: 'hour',
    loading: false,
    error: '',
    enabled: true,
    unavailableReason: '',
    lastRefreshedAt: null,
    refresh: vi.fn(),
    summary: {
      requestCount: 12,
      totalTokens: 1200,
      inputTokens: 700,
      outputTokens: 400,
      cachedTokens: 100,
      cacheReadTokens: 80,
      cacheCreationTokens: 20,
      estimatedCost: 1.25,
      averageCostPerCall: 1.25 / 12,
      successRate: 11 / 12,
      failureCount: 1,
      averageLatencyMs: 250,
      p95LatencyMs: 420,
      p95TtftMs: 180,
      rpm30m: 0,
      tpm30m: 0,
    },
    timeline: [point],
    modelRows: [modelRow],
    apiKeyRows: [apiKeyRow],
    credentialRows: [credentialRow],
    allCredentialRows: [credentialRow],
    providerRows: [
      {
        id: 'openai',
        label: 'openai',
        requestCount: 12,
        successCount: 11,
        failureCount: 1,
        successRate: 11 / 12,
        cacheRate: 0.1,
        totalTokens: 1200,
        estimatedCost: 1.25,
        averageLatencyMs: 250,
        share: 1,
        models: [modelRow],
      },
    ],
    heatmap: [],
    matrix: {
      dimension: 'apiKeyModel',
      metric: 'requestCount',
      rowLabels: ['sk-****7890'],
      columnLabels: ['gpt-4o'],
      cells: [
        {
          rowId: 'sk-****7890',
          rowLabel: 'sk-****7890',
          columnId: 'gpt-4o',
          columnLabel: 'gpt-4o',
          requestCount: 12,
          successCount: 11,
          failureCount: 1,
          totalTokens: 1200,
          estimatedCost: 1.25,
          failureRate: 1 / 12,
          value: 12,
          share: 1,
        },
      ],
      maxValue: 12,
      totalValue: 12,
    },
    matrixDimension: 'apiKeyModel',
    setMatrixDimension: vi.fn(),
    matrixMetric: 'requestCount',
    setMatrixMetric: vi.fn(),
    trendMetric: 'requestCount',
    setTrendMetric: vi.fn(),
    modelTrendSeries: [
      {
        id: 'gpt-4o',
        label: 'gpt-4o',
        color: '#2563eb',
        points: [{ bucketMs: point.bucketMs, label: point.label, value: 12 }],
      },
    ],
    apiKeyTrendSeries: [
      {
        id: 'abcdef1234567890',
        label: 'sk-****7890',
        color: '#2563eb',
        points: [{ bucketMs: point.bucketMs, label: point.label, value: 12 }],
      },
    ],
    keyAnomalies: [
      {
        id: 'abcdef1234567890',
        label: 'sk-****7890',
        severity: 'medium',
        reasonKey: 'usage_analytics.anomaly_reason_error_rate',
        triggeredAtMs: point.bucketMs,
        row: apiKeyRow,
      },
    ],
    credentialQuotaRows: [
      {
        id: 'credential-prod',
        label: 'prod-auth',
        plan: 'Pay as You Go',
        used: 1.25,
        limit: 50,
        remaining: 48.75,
        usedRate: 0.025,
        resetAtMs: point.bucketEndMs,
        status: 'normal',
        refreshedAtMs: point.bucketMs,
      },
    ],
    activeCredentialsOnly: true,
    setActiveCredentialsOnly: vi.fn(),
    insights: [
      {
        id: 'cache-room',
        tone: 'info',
        titleKey: 'usage_analytics.insight_cache_room',
        bodyKey: 'usage_analytics.insight_cache_room_body',
        actionTab: 'trends',
      },
    ],
    favoriteViews: [
      {
        id: 'daily-board',
        labelKey: 'usage_analytics.view_daily_board',
        descriptionKey: 'usage_analytics.view_daily_board_desc',
        tab: 'overview',
        favorite: true,
      },
      {
        id: 'high-cost-key-monitor',
        labelKey: 'usage_analytics.view_high_cost_key',
        descriptionKey: 'usage_analytics.view_high_cost_key_desc',
        tab: 'apiKeys',
        favorite: true,
      },
    ],
    toggleFavoriteView: vi.fn(),
    recentViews: [
      {
        id: 'daily-board:overview',
        labelKey: 'usage_analytics.view_daily_board',
        tab: 'overview',
        viewedAtMs: point.bucketMs,
      },
    ],
    clearRecentViews: vi.fn(),
    anomalyPoints: [
      {
        bucketMs: point.bucketMs,
        bucketEndMs: point.bucketEndMs,
        label: point.label,
        severity: 'medium',
        metricKeys: ['request_spike'],
        requestCount: 12,
        totalTokens: 1200,
        estimatedCost: 1.25,
        failureRate: 1 / 12,
        requestChange: 0,
        costChange: 0,
        tokensPerRequestChange: 0,
        cacheHitRateChange: 0,
        failureRateChange: 0,
        latencyP95Change: 0,
      },
    ],
    drilldownPreview: [],
    filterOptions: {
      models: ['gpt-4o'],
      api_key_hashes: ['abcdef1234567890'],
      providers: ['openai'],
      auth_files: ['auth.json'],
      project_ids: ['project-a'],
      request_types: [],
    },
    selectedBucket: point,
    selectBucket: vi.fn(),
    anomalyAnalysis: {
      point,
      previousPoint: null,
      anomalies: [],
      changes: {
        requestCount: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        cacheCreationTokens: 0,
        estimatedCost: 0,
        cacheHitRate: 0,
        averageTokensPerRequest: 0,
        failureRate: 0,
        averageLatencyMs: 0,
      },
      causeKeys: ['usage_analytics.cause_no_clear_anomaly'],
    },
    selectedModel: modelRow,
    setSelectedModelId: vi.fn(),
    selectedApiKey: apiKeyRow,
    setSelectedApiKeyHash: vi.fn(),
    selectedCredential: credentialRow,
    setSelectedCredentialId: vi.fn(),
    ...overrides,
  };
};

beforeEach(() => {
  mocks.downloadBlob.mockReset();
  mocks.navigate.mockReset();
  mocks.usageState = createUsageState();
});

describe('UsageAnalyticsPage', () => {
  it('renders overview as the default tab with shortcuts and insight panels', () => {
    const renderer = renderPage();
    const text = getText(renderer.root);

    expect(text).toContain('usage_analytics.tab_overview');
    expect(text).toContain('usage_analytics.analysis_entry_trends');
    expect(text).toContain('usage_analytics.favorite_views_title');
    expect(text).toContain('usage_analytics.insights_title');
    expect(text).not.toContain('usage_analytics.model_rank_title');
  });

  it('shows empty and error states from the analytics hook', () => {
    mocks.usageState = createUsageState({
      summary: {
        requestCount: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        estimatedCost: 0,
        averageCostPerCall: 0,
        successRate: 0,
        failureCount: 0,
        averageLatencyMs: null,
        p95LatencyMs: null,
        p95TtftMs: null,
        rpm30m: 0,
        tpm30m: 0,
      },
      timeline: [],
      selectedBucket: null,
      anomalyAnalysis: null,
    });
    let renderer = renderPage();
    expect(getText(renderer.root)).toContain('usage_analytics.empty_title');
    renderer.unmount();

    mocks.usageState = createUsageState({
      error: 'analytics failed',
    });
    renderer = renderPage();
    expect(getText(renderer.root)).toContain('usage_analytics.error_title');
    expect(getText(renderer.root)).toContain('analytics failed');
  });

  it('navigates to request monitoring details for a selected anomaly bucket', () => {
    const renderer = renderPage();
    clickHostButton(findHostButtonByText(renderer, 'usage_analytics.view_monitoring_details'));

    expect(mocks.navigate).toHaveBeenCalledWith(
      '/monitoring?from_ms=1780000000000&to_ms=1780003600000'
    );
  });

  it('renders available advanced filters without unavailable placeholders', () => {
    const renderer = renderPage();

    clickHostButton(findHostButtonByText(renderer, 'usage_analytics.show_advanced_filters'));

    const text = getText(renderer.root);
    expect(text).toContain('usage_analytics.filter_auth_file');
    expect(text).toContain('usage_analytics.filter_request_type');
    expect(text).toContain('usage_analytics.filter_project_team');
    expect(text).not.toContain('usage_analytics.common_views_title');
    expect(text).not.toContain('usage_analytics.filter_cache_status');
    expect(text).not.toContain('usage_analytics.selected_filters');
  });

  it('keeps API key values masked in the API Key tab', () => {
    mocks.usageState = createUsageState({ activeTab: 'apiKeys' });
    const renderer = renderPage();
    const text = getText(renderer.root);

    expect(text).toContain('sk-****7890');
    expect(text).not.toContain('abcdef1234567890');
    expect(text).toContain('usage_analytics.trend_pending_data');
  });

  it('offers time range and status controls that update usage filters', () => {
    const usageState = createUsageState();
    mocks.usageState = usageState;
    const renderer = renderPage();

    clickHostButton(findHostButtonByText(renderer, 'usage_analytics.range_24h'));

    expect(usageState.setFilters).toHaveBeenCalledWith({ timeRange: '24h' });
  });

  it('renders the page header with export and refresh actions', () => {
    const renderer = renderPage();
    const text = getText(renderer.root);

    expect(text).toContain('usage_analytics.title');
    expect(text).toContain('usage_analytics.subtitle');
    expect(text).toContain('usage_analytics.export');
    expect(
      renderer.root.findAllByType(Button).some((button) => getText(button).includes('common.refresh'))
    ).toBe(true);
  });

  it('exports usage analytics JSON without raw API key hashes', async () => {
    mocks.usageState = createUsageState({
      filters: {
        ...USAGE_ANALYTICS_DEFAULT_FILTERS,
        apiKeyHash: 'abcdef1234567890',
      },
    });
    const renderer = renderPage();

    clickHostButton(findHostButtonByText(renderer, 'usage_analytics.export'));

    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1);
    const options = mocks.downloadBlob.mock.calls[0][0] as { blob: Blob; filename: string };
    const exported = await options.blob.text();
    expect(options.filename).toMatch(/^usage-analytics-overview-\d+\.json$/);
    expect(exported).toContain('sk-****7890');
    expect(exported).not.toContain('abcdef1234567890');
  });
});
