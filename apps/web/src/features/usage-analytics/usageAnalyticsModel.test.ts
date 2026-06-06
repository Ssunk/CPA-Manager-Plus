import { describe, expect, it } from 'vitest';
import type { MonitoringAnalyticsResponse } from '@/services/api/usageService';
import {
  analyzeUsageBucket,
  buildApiKeyRows,
  buildDrilldownPreview,
  buildKeyAnomalies,
  buildMonitoringDetailUrl,
  buildUsageMatrix,
  buildUsageAnalyticsFilters,
  buildUsageAnalyticsInclude,
  buildUsageAnomalyCauseKeys,
  buildUsageHeatmapChartData,
  buildUsageTimeline,
  getUsageRangeBounds,
  maskApiKeyHash,
  resolveUsageGranularity,
  USAGE_ANALYTICS_DEFAULT_FILTERS,
} from './usageAnalyticsModel';

const NOW_MS = Date.UTC(2026, 5, 4, 12, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('usage analytics request model', () => {
  it('resolves time ranges and default granularity rules', () => {
    expect(
      getUsageRangeBounds({ timeRange: '24h', customRange: null }, NOW_MS)
    ).toEqual({
      fromMs: NOW_MS - DAY_MS,
      toMs: NOW_MS,
    });
    expect(resolveUsageGranularity({ ...USAGE_ANALYTICS_DEFAULT_FILTERS, timeRange: '24h' }, NOW_MS)).toBe(
      'hour'
    );
    expect(resolveUsageGranularity({ ...USAGE_ANALYTICS_DEFAULT_FILTERS, timeRange: '7d' }, NOW_MS)).toBe(
      'hour'
    );
    expect(resolveUsageGranularity({ ...USAGE_ANALYTICS_DEFAULT_FILTERS, timeRange: '30d' }, NOW_MS)).toBe(
      'day'
    );
    expect(
      resolveUsageGranularity(
        {
          ...USAGE_ANALYTICS_DEFAULT_FILTERS,
          timeRange: 'custom',
          customRange: { startMs: NOW_MS - 8 * DAY_MS, endMs: NOW_MS },
        },
        NOW_MS
      )
    ).toBe('day');
  });

  it('maps model, API key, status, and granularity to analytics request fields', () => {
    expect(
      buildUsageAnalyticsFilters({
        model: 'gpt-4o',
        apiKeyHash: ' ABCDEF1234 ',
        status: 'success',
      })
    ).toEqual({
      models: ['gpt-4o'],
      api_key_hashes: ['abcdef1234'],
      include_failed: false,
    });
    expect(
      buildUsageAnalyticsFilters({
        model: 'all',
        apiKeyHash: 'all',
        status: 'failed',
      })
    ).toEqual({
      failed_only: true,
    });
    expect(buildUsageAnalyticsInclude('day')).toMatchObject({
      summary: true,
      timeline: true,
      model_stats: true,
      api_key_stats: true,
      filter_options: true,
      granularity: 'day',
    });
  });
});

describe('usage analytics adapters', () => {
  it('builds heatmap chart data from non-empty valid request buckets only', () => {
    expect(
      buildUsageHeatmapChartData([
        {
          weekday: 2,
          hour: 1,
          requestCount: 128,
          successCount: 126,
          failureCount: 2,
          totalTokens: 1000,
          estimatedCost: 3.25,
          failureRate: 2 / 128,
        },
        {
          weekday: 2,
          hour: 2,
          requestCount: 0,
          successCount: 0,
          failureCount: 0,
          totalTokens: 0,
          estimatedCost: 0,
          failureRate: 0,
        },
        {
          weekday: 9,
          hour: 1,
          requestCount: 12,
          successCount: 12,
          failureCount: 0,
          totalTokens: 100,
          estimatedCost: 0.5,
          failureRate: 0,
        },
      ])
    ).toEqual([[1, 2, 128, 3.25, 2 / 128]]);
  });

  it('keeps detailed token and cost fields from backend timeline buckets', () => {
    const points = buildUsageTimeline(
      [
        {
          bucket_ms: NOW_MS,
          label: '',
          calls: 3,
          tokens: 111,
          total_tokens: 120,
          success: 2,
          failure: 1,
          input_tokens: 80,
          output_tokens: 30,
          cached_tokens: 10,
          cache_read_tokens: 8,
          cache_creation_tokens: 4,
          cost: 0.42,
          average_latency_ms: 250,
        },
      ],
      'hour'
    );

    expect(points[0]).toMatchObject({
      requestCount: 3,
      totalTokens: 120,
      inputTokens: 80,
      outputTokens: 30,
      cachedTokens: 10,
      cacheReadTokens: 8,
      cacheCreationTokens: 4,
      estimatedCost: 0.42,
      failureCount: 1,
      successRate: 2 / 3,
      averageLatencyMs: 250,
    });
  });

  it('filters API key rows by keyword and never exposes a raw key value', () => {
    const data: Pick<MonitoringAnalyticsResponse, 'api_key_stats'> = {
      api_key_stats: [
        {
          id: 'hash-a',
          api_key_hash: 'abcdef1234567890',
          account_snapshot: 'team-alpha',
          auth_label_snapshot: 'prod',
          calls: 10,
          success_calls: 9,
          failure_calls: 1,
          success_rate: 0.9,
          input_tokens: 100,
          output_tokens: 20,
          cached_tokens: 5,
          cache_read_tokens: 3,
          cache_creation_tokens: 2,
          total_tokens: 120,
          cost: 1.25,
          average_latency_ms: null,
          last_seen_ms: NOW_MS,
        },
      ],
    };

    const rows = buildApiKeyRows(data.api_key_stats, undefined, 'team-alpha');

    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('sk-****7890');
    expect(rows[0].label).not.toContain('abcdef1234567890');
    expect(maskApiKeyHash('sk-live-raw-secret-value')).toBe('sk-****alue');
  });

  it('builds API key/model matrices and key anomaly rows from ranked usage rows', () => {
    const apiKeyRows = buildApiKeyRows(
      [
        {
          id: 'hash-a',
          api_key_hash: 'abcdef1234567890',
          account_snapshot: 'team-alpha',
          calls: 100,
          success_calls: 92,
          failure_calls: 8,
          success_rate: 0.92,
          input_tokens: 1000,
          output_tokens: 500,
          cached_tokens: 120,
          cache_read_tokens: 90,
          cache_creation_tokens: 30,
          total_tokens: 1500,
          cost: 9,
          average_latency_ms: 300,
          last_seen_ms: NOW_MS,
          models: [
            {
              model: 'gpt-4o',
              calls: 80,
              success_calls: 74,
              failure_calls: 6,
              success_rate: 0.925,
              input_tokens: 900,
              output_tokens: 400,
              cached_tokens: 100,
              cache_read_tokens: 80,
              cache_creation_tokens: 20,
              total_tokens: 1300,
              cost: 8,
              last_seen_ms: NOW_MS,
            },
          ],
        },
      ],
      undefined
    );

    const matrix = buildUsageMatrix({
      apiKeyRows,
      credentialRows: [],
      dimension: 'apiKeyModel',
      metric: 'requestCount',
    });
    const anomalies = buildKeyAnomalies(apiKeyRows);

    expect(matrix.rowLabels).toEqual(['sk-****7890']);
    expect(matrix.columnLabels).toEqual(['gpt-4o']);
    expect(matrix.cells[0]).toMatchObject({
      rowLabel: 'sk-****7890',
      columnLabel: 'gpt-4o',
      requestCount: 80,
      failureRate: 6 / 80,
      value: 80,
    });
    expect(anomalies[0]).toMatchObject({
      id: 'abcdef1234567890',
      label: 'sk-****7890',
      severity: 'high',
      reasonKey: 'usage_analytics.anomaly_reason_cost_spike',
    });
  });

  it('estimates drilldown preview cost from model cost per token', () => {
    const rows = buildDrilldownPreview(
      [
        {
          event_hash: 'event-a',
          timestamp_ms: NOW_MS,
          model: 'gpt-4o',
          endpoint: '/v1/chat/completions',
          method: 'POST',
          path: '/v1/chat/completions',
          auth_index: '0',
          source: 'codex',
          source_hash: 'source-a',
          api_key_hash: 'abcdef1234567890',
          account_snapshot: 'team-alpha',
          auth_label_snapshot: 'prod',
          auth_provider_snapshot: 'openai',
          input_tokens: 60,
          output_tokens: 40,
          cached_tokens: 0,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          reasoning_tokens: 0,
          total_tokens: 100,
          latency_ms: 250,
          failed: false,
        },
      ],
      [
        {
          id: 'gpt-4o',
          label: 'gpt-4o',
          model: 'gpt-4o',
          requestCount: 10,
          successCount: 10,
          failureCount: 0,
          successRate: 1,
          totalTokens: 1000,
          inputTokens: 700,
          outputTokens: 300,
          cachedTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          estimatedCost: 2,
          averageLatencyMs: null,
          share: 1,
        },
      ]
    );

    expect(rows[0]).toMatchObject({
      eventHash: 'event-a',
      model: 'gpt-4o',
      estimatedCost: 0.2,
    });
  });
});

describe('usage anomaly drilldown', () => {
  it('detects request, cost, average-token, and cache-hit anomalies', () => {
    const timeline = buildUsageTimeline(
      [
        {
          bucket_ms: NOW_MS,
          label: '',
          calls: 10,
          tokens: 100,
          success: 10,
          failure: 0,
          input_tokens: 100,
          output_tokens: 0,
          cache_read_tokens: 80,
          cost: 1,
        },
        {
          bucket_ms: NOW_MS + HOUR_MS,
          label: '',
          calls: 25,
          tokens: 500,
          success: 24,
          failure: 1,
          input_tokens: 500,
          output_tokens: 0,
          cache_read_tokens: 100,
          cost: 3,
        },
      ],
      'hour'
    );

    const analysis = analyzeUsageBucket(timeline, NOW_MS + HOUR_MS);

    expect(analysis?.anomalies.map((item) => item.key)).toEqual([
      'request_spike',
      'cost_spike',
      'token_per_request_spike',
      'cache_hit_drop',
    ]);
    expect(analysis?.causeKeys).toEqual([
      'usage_analytics.cause_request_spike',
      'usage_analytics.cause_cost_spike',
      'usage_analytics.cause_token_per_request_spike',
      'usage_analytics.cause_cache_hit_drop',
    ]);
  });

  it('uses direction-aware anomaly cause copy', () => {
    expect(
      buildUsageAnomalyCauseKeys({
        requestCount: -0.8,
        totalTokens: -0.8,
        inputTokens: -0.8,
        outputTokens: -0.8,
        cachedTokens: 0,
        cacheCreationTokens: 0,
        estimatedCost: -0.7,
        cacheHitRate: 0,
        averageTokensPerRequest: 0,
      })
    ).toEqual(['usage_analytics.cause_request_drop', 'usage_analytics.cause_cost_drop']);
  });

  it('builds stable monitoring detail query parameters', () => {
    const point = buildUsageTimeline(
      [
        {
          bucket_ms: NOW_MS,
          label: '',
          calls: 1,
          tokens: 1,
          success: 1,
          failure: 0,
        },
      ],
      'hour'
    )[0];

    expect(
      buildMonitoringDetailUrl(point, {
        model: 'gpt-4o',
        apiKeyHash: ' ABCDEF1234 ',
        provider: 'OpenAI',
        authFile: 'codex-auth.json',
        projectId: 'project-1',
        requestType: 'codex',
        status: 'failed',
      })
    ).toBe(
      `/monitoring?from_ms=${NOW_MS}&to_ms=${NOW_MS + HOUR_MS}&model=gpt-4o&api_key_hash=abcdef1234&provider=openai&auth_file=codex-auth.json&project_id=project-1&request_type=codex&status=failed`
    );
  });
});
