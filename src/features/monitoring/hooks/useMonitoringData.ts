import { useCallback, useEffect, useMemo, useState } from 'react';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import type {
  MonitoringAnalyticsChannelShareRow,
  MonitoringAnalyticsEventRow,
  MonitoringAnalyticsFailureSourceRow,
  MonitoringAnalyticsFilters,
  MonitoringAnalyticsHourlyPoint,
  MonitoringAnalyticsModelShareRow,
  MonitoringAnalyticsModelStat,
  MonitoringAnalyticsRecentFailure,
  MonitoringAnalyticsSummary,
  MonitoringAnalyticsTaskBucketRow,
  MonitoringAnalyticsTimelinePoint,
} from '@/services/api/usageService';
import type { Config } from '@/types/config';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import {
  calculateCost,
  collectUsageDetailsWithEndpoint,
  extractTotalTokens,
  normalizeAuthIndex,
  type ModelPrice,
  type UsageDetailWithEndpoint,
} from '@/utils/usage';
import {
  buildSearchText,
  extractArrayPayload,
  formatApiKeyHashLabel,
  joinUnique,
  maskAuthIndex,
  maskEmailLike,
  readString,
} from '../model/base';
import { buildApiKeyDisplayMap, sanitizeApiKeyDisplayText } from '../model/apiKeys';
import type { ApiKeyDisplayInfo } from '../model/apiKeys';
import { buildMonitoringAuthMetaMap, normalizeOpenAIChannel } from '../model/authMeta';
import {
  buildDayLabel,
  buildHourLabel,
  buildLocalDayKey,
  getRangeBounds,
  padNumber,
  shouldUseHourlyTimeline,
} from '../model/range';
import {
  buildMonitoringSummary,
  buildRangeFilteredRows,
  shouldIncludeInStats,
} from '../model/rowBuilders';
import type {
  MonitoringAuthMeta,
  MonitoringChannelMeta,
  MonitoringChannelRow,
  MonitoringCustomTimeRange,
  MonitoringEventRow,
  MonitoringFailureRow,
  MonitoringFailureSourceRow,
  MonitoringMetaPayload,
  MonitoringMetadata,
  MonitoringModelRow,
  MonitoringModelShareRow,
  MonitoringScopeFilters,
  MonitoringStatusChip,
  MonitoringSummary,
  MonitoringTaskBucketRow,
  MonitoringTimeRange,
  MonitoringTimelinePoint,
  UseMonitoringDataParams,
  UseMonitoringDataReturn,
} from '../model/types';
import { useMonitoringAnalytics } from './useMonitoringAnalytics';

export type {
  MonitoringAccountModelSpendRow,
  MonitoringAccountRow,
  MonitoringApiKeyModelSpendRow,
  MonitoringApiKeyRow,
  MonitoringChannelMeta,
  MonitoringChannelRow,
  MonitoringCustomTimeRange,
  MonitoringEventRow,
  MonitoringFailureRow,
  MonitoringFailureSourceRow,
  MonitoringKpi,
  MonitoringMetadata,
  MonitoringModelRow,
  MonitoringModelShareRow,
  MonitoringRealtimeRow,
  MonitoringScopeFilters,
  MonitoringStatusChip,
  MonitoringStatusTone,
  MonitoringSummary,
  MonitoringTaskBucketRow,
  MonitoringTimeRange,
  MonitoringTimelinePoint,
  UseMonitoringDataParams,
  UseMonitoringDataReturn,
} from '../model/types';
export { buildApiKeyDisplayMap } from '../model/apiKeys';
export { buildMonitoringAuthMetaMap } from '../model/authMeta';
export { getRangeBounds } from '../model/range';
export {
  buildAccountRows,
  buildApiKeyRows,
  buildMonitoringSummary,
  buildRangeFilteredRows,
  buildRealtimeMonitorRows,
} from '../model/rowBuilders';

const MONITORING_EVENTS_PAGE_LIMIT = 500;

interface MonitoringEventsPageState {
  scopeKey: string;
  beforeMs: number | null;
  items: MonitoringAnalyticsEventRow[];
  hasMore: boolean;
  loadingMore: boolean;
  lastPageKey: string;
}

const createEventsPageState = (scopeKey = ''): MonitoringEventsPageState => ({
  scopeKey,
  beforeMs: null,
  items: [],
  hasMore: false,
  loadingMore: false,
  lastPageKey: '',
});

const buildEventsPageKey = (
  scopeKey: string,
  beforeMs: number | null,
  pageItems: MonitoringAnalyticsEventRow[],
  nextBeforeMs: number
) =>
  [
    scopeKey,
    beforeMs ?? 'root',
    nextBeforeMs,
    pageItems.length,
    pageItems[0]?.event_hash ?? '',
    pageItems[pageItems.length - 1]?.event_hash ?? '',
  ].join(':');

const buildTimeline = (
  rows: MonitoringEventRow[],
  timeRange: MonitoringTimeRange,
  customTimeRange?: MonitoringCustomTimeRange | null
): { granularity: 'hour' | 'day'; points: MonitoringTimelinePoint[] } => {
  if (shouldUseHourlyTimeline(timeRange, customTimeRange)) {
    const map = new Map<string, MonitoringTimelinePoint>();

    for (let hour = 0; hour < 24; hour += 1) {
      const label = `${padNumber(hour)}:00`;
      map.set(label, { label, requests: 0, tokens: 0, cost: 0 });
    }

    rows.forEach((row) => {
      const bucket = map.get(row.hourLabel);
      if (!bucket) return;
      bucket.requests += 1;
      bucket.tokens += row.totalTokens;
      bucket.cost += row.totalCost;
    });

    return { granularity: 'hour', points: Array.from(map.values()) };
  }

  const grouped = new Map<string, MonitoringTimelinePoint>();

  rows.forEach((row) => {
    const existing = grouped.get(row.dayKey) ?? {
      label: buildDayLabel(row.dayKey),
      requests: 0,
      tokens: 0,
      cost: 0,
    };
    existing.requests += 1;
    existing.tokens += row.totalTokens;
    existing.cost += row.totalCost;
    grouped.set(row.dayKey, existing);
  });

  const sortedKeys = Array.from(grouped.keys()).sort((left, right) => left.localeCompare(right));
  const limitedKeys =
    sortedKeys.length > 30 ? sortedKeys.slice(sortedKeys.length - 30) : sortedKeys;

  return {
    granularity: 'day',
    points: limitedKeys.map((key) => grouped.get(key)!).filter(Boolean),
  };
};

const buildHourlyDistribution = (rows: MonitoringEventRow[]) => {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    label: `${padNumber(hour)}:00`,
    requests: 0,
    tokens: 0,
    cost: 0,
  }));

  rows.forEach((row) => {
    const hour = Number(row.hourLabel.slice(0, 2));
    const bucket = Number.isFinite(hour) ? buckets[hour] : null;
    if (!bucket) return;
    bucket.requests += 1;
    bucket.tokens += row.totalTokens;
    bucket.cost += row.totalCost;
  });

  return buckets;
};

const buildStatusChips = (metadata: MonitoringMetadata): MonitoringStatusChip[] => [
  {
    key: 'credentials',
    label: 'credentials',
    value: `${metadata.activeAuthFiles}/${metadata.totalAuthFiles}`,
    tone:
      metadata.totalAuthFiles === 0 ? 'warn' : metadata.unavailableAuthFiles > 0 ? 'warn' : 'good',
  },
  {
    key: 'channels',
    label: 'channels',
    value: `${metadata.enabledChannels}/${metadata.totalChannels}`,
    tone:
      metadata.enabledChannels === 0
        ? 'bad'
        : metadata.enabledChannels < metadata.totalChannels
          ? 'warn'
          : 'good',
  },
  {
    key: 'runtime_only',
    label: 'runtime_only',
    value: String(metadata.runtimeOnlyAuthFiles),
    tone: metadata.runtimeOnlyAuthFiles > 0 ? 'warn' : 'good',
  },
  {
    key: 'models',
    label: 'models',
    value: String(metadata.configuredModels),
    tone: metadata.configuredModels > 0 ? 'good' : 'warn',
  },
];

const buildModelShareRows = (rows: MonitoringEventRow[]) => {
  const grouped = new Map<
    string,
    { model: string; requests: number; failures: number; totalTokens: number; totalCost: number }
  >();

  rows.forEach((row) => {
    const existing = grouped.get(row.model) ?? {
      model: row.model,
      requests: 0,
      failures: 0,
      totalTokens: 0,
      totalCost: 0,
    };
    existing.requests += 1;
    existing.failures += row.failed ? 1 : 0;
    existing.totalTokens += row.totalTokens;
    existing.totalCost += row.totalCost;
    grouped.set(row.model, existing);
  });

  return Array.from(grouped.values())
    .map((item) => ({
      model: item.model,
      requests: item.requests,
      totalTokens: item.totalTokens,
      totalCost: item.totalCost,
      successRate: item.requests > 0 ? (item.requests - item.failures) / item.requests : 1,
    }))
    .sort((left, right) => right.requests - left.requests);
};

const buildChannelRows = (rows: MonitoringEventRow[]) => {
  const grouped = new Map<
    string,
    {
      id: string;
      label: string;
      host: string;
      provider: string;
      disabled: boolean;
      authLabels: Set<string>;
      planTypes: Set<string>;
      models: Set<string>;
      requests: number;
      failures: number;
      totalTokens: number;
      totalCost: number;
      latencySum: number;
      latencyCount: number;
    }
  >();

  rows.forEach((row) => {
    const key = `${row.channel}::${row.channelHost}`;
    const existing = grouped.get(key) ?? {
      id: key,
      label: row.channel,
      host: row.channelHost,
      provider: row.provider,
      disabled: row.channelDisabled,
      authLabels: new Set<string>(),
      planTypes: new Set<string>(),
      models: new Set<string>(),
      requests: 0,
      failures: 0,
      totalTokens: 0,
      totalCost: 0,
      latencySum: 0,
      latencyCount: 0,
    };
    existing.disabled = existing.disabled || row.channelDisabled;
    existing.authLabels.add(row.authLabel);
    if (row.planType && row.planType !== '-') {
      existing.planTypes.add(row.planType);
    }
    existing.models.add(row.model);
    existing.requests += 1;
    existing.failures += row.failed ? 1 : 0;
    existing.totalTokens += row.totalTokens;
    existing.totalCost += row.totalCost;
    if (row.latencyMs !== null) {
      existing.latencySum += row.latencyMs;
      existing.latencyCount += 1;
    }
    grouped.set(key, existing);
  });

  return Array.from(grouped.values())
    .map((item) => ({
      id: item.id,
      label: item.label,
      host: item.host,
      provider: item.provider,
      planTypes: Array.from(item.planTypes).sort(),
      disabled: item.disabled,
      authCount: item.authLabels.size,
      modelCount: item.models.size,
      requests: item.requests,
      failures: item.failures,
      successRate: item.requests > 0 ? (item.requests - item.failures) / item.requests : 1,
      totalTokens: item.totalTokens,
      totalCost: item.totalCost,
      averageLatencyMs: item.latencyCount > 0 ? item.latencySum / item.latencyCount : null,
      authLabels: Array.from(item.authLabels).sort(),
    }))
    .sort((left, right) => right.requests - left.requests);
};

const buildModelRows = (rows: MonitoringEventRow[]) => {
  const grouped = new Map<
    string,
    {
      model: string;
      requests: number;
      failures: number;
      totalTokens: number;
      totalCost: number;
      latencySum: number;
      latencyCount: number;
      sources: Set<string>;
      channels: Set<string>;
    }
  >();

  rows.forEach((row) => {
    const existing = grouped.get(row.model) ?? {
      model: row.model,
      requests: 0,
      failures: 0,
      totalTokens: 0,
      totalCost: 0,
      latencySum: 0,
      latencyCount: 0,
      sources: new Set<string>(),
      channels: new Set<string>(),
    };

    existing.requests += 1;
    existing.failures += row.failed ? 1 : 0;
    existing.totalTokens += row.totalTokens;
    existing.totalCost += row.totalCost;
    existing.sources.add(row.source);
    existing.channels.add(row.channel);
    if (row.latencyMs !== null) {
      existing.latencySum += row.latencyMs;
      existing.latencyCount += 1;
    }

    grouped.set(row.model, existing);
  });

  return Array.from(grouped.values())
    .map((item) => ({
      model: item.model,
      requests: item.requests,
      failures: item.failures,
      successRate: item.requests > 0 ? (item.requests - item.failures) / item.requests : 1,
      totalTokens: item.totalTokens,
      totalCost: item.totalCost,
      averageLatencyMs: item.latencyCount > 0 ? item.latencySum / item.latencyCount : null,
      sources: item.sources.size,
      channels: item.channels.size,
    }))
    .sort((left, right) => right.requests - left.requests);
};

const buildFailureSourceRows = (rows: MonitoringEventRow[]) => {
  const grouped = new Map<
    string,
    {
      id: string;
      label: string;
      channel: string;
      failures: number;
      totalRequests: number;
      lastSeenAt: number;
      latencySum: number;
      latencyCount: number;
    }
  >();

  rows.forEach((row) => {
    const key = `${row.source}::${row.channel}`;
    const existing = grouped.get(key) ?? {
      id: key,
      label: row.sourceMasked,
      channel: row.channel,
      failures: 0,
      totalRequests: 0,
      lastSeenAt: 0,
      latencySum: 0,
      latencyCount: 0,
    };

    existing.totalRequests += 1;
    existing.lastSeenAt = Math.max(existing.lastSeenAt, row.timestampMs);
    if (row.failed) {
      existing.failures += 1;
      if (row.latencyMs !== null) {
        existing.latencySum += row.latencyMs;
        existing.latencyCount += 1;
      }
    }

    grouped.set(key, existing);
  });

  return Array.from(grouped.values())
    .filter((item) => item.failures > 0)
    .map((item) => ({
      id: item.id,
      label: item.label,
      channel: item.channel,
      failures: item.failures,
      totalRequests: item.totalRequests,
      failureRate: item.totalRequests > 0 ? item.failures / item.totalRequests : 0,
      lastSeenAt: item.lastSeenAt,
      averageLatencyMs: item.latencyCount > 0 ? item.latencySum / item.latencyCount : null,
    }))
    .sort((left, right) => right.failures - left.failures || right.lastSeenAt - left.lastSeenAt);
};

const buildTaskBuckets = (rows: MonitoringEventRow[]) => {
  const grouped = new Map<
    string,
    {
      id: string;
      timestampMs: number;
      timestamp: string;
      source: string;
      sourceMasked: string;
      channel: string;
      authLabel: string;
      planType: string;
      calls: number;
      failedCalls: number;
      models: Set<string>;
      endpoints: Set<string>;
      totalTokens: number;
      totalCost: number;
      latencySum: number;
      latencyCount: number;
      maxLatencyMs: number | null;
    }
  >();

  rows.forEach((row) => {
    const existing = grouped.get(row.taskKey) ?? {
      id: row.taskKey,
      timestampMs: row.timestampMs,
      timestamp: row.timestamp,
      source: row.source,
      sourceMasked: row.sourceMasked,
      channel: row.channel,
      authLabel: row.authLabel,
      planType: row.planType,
      calls: 0,
      failedCalls: 0,
      models: new Set<string>(),
      endpoints: new Set<string>(),
      totalTokens: 0,
      totalCost: 0,
      latencySum: 0,
      latencyCount: 0,
      maxLatencyMs: null,
    };

    existing.calls += 1;
    existing.failedCalls += row.failed ? 1 : 0;
    existing.models.add(row.model);
    existing.endpoints.add(row.endpointPath || row.endpoint);
    existing.totalTokens += row.totalTokens;
    existing.totalCost += row.totalCost;
    if (row.latencyMs !== null) {
      existing.latencySum += row.latencyMs;
      existing.latencyCount += 1;
      existing.maxLatencyMs = Math.max(existing.maxLatencyMs ?? 0, row.latencyMs);
    }

    grouped.set(row.taskKey, existing);
  });

  return Array.from(grouped.values())
    .map((item) => ({
      id: item.id,
      timestampMs: item.timestampMs,
      timestamp: item.timestamp,
      source: item.source,
      sourceMasked: item.sourceMasked,
      channel: item.channel,
      authLabel: item.authLabel,
      planType: item.planType,
      calls: item.calls,
      failedCalls: item.failedCalls,
      failed: item.failedCalls > 0,
      modelsText: joinUnique(item.models, 3),
      totalTokens: item.totalTokens,
      totalCost: item.totalCost,
      averageLatencyMs: item.latencyCount > 0 ? item.latencySum / item.latencyCount : null,
      maxLatencyMs: item.maxLatencyMs,
      endpointsText: joinUnique(item.endpoints, 2),
    }))
    .sort((left, right) => right.timestampMs - left.timestampMs);
};

const buildFailureRows = (rows: MonitoringEventRow[]) =>
  rows
    .filter((row) => row.failed)
    .map((row) => ({
      id: row.id,
      timestampMs: row.timestampMs,
      timestamp: row.timestamp,
      model: row.model,
      source: row.sourceMasked,
      channel: row.channel,
      authIndex: row.authIndexMasked,
      latencyMs: row.latencyMs,
    }))
    .sort((left, right) => right.timestampMs - left.timestampMs)
    .slice(0, 8);

const isActiveFilterValue = (value: string | null | undefined) =>
  Boolean(value && value.trim() && value !== 'all');

const shortHashLabel = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '-';
  return trimmed.length <= 12 ? trimmed : `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
};

const addAuthIndexConstraint = (
  current: Set<string> | null,
  values: Iterable<string>
): Set<string> | null => {
  const next = new Set(Array.from(values).map(normalizeAuthIndex).filter(Boolean) as string[]);
  if (next.size === 0) return current;
  if (current === null) return next;
  return new Set(Array.from(current).filter((value) => next.has(value)));
};

const buildAnalyticsFilters = (
  scopeFilters: MonitoringScopeFilters | undefined,
  authMetaMap: Map<string, MonitoringAuthMeta>,
  channels: MonitoringChannelMeta[]
): MonitoringAnalyticsFilters => {
  const filters: MonitoringAnalyticsFilters = {};
  if (!scopeFilters) return filters;

  if (isActiveFilterValue(scopeFilters.model)) {
    filters.models = [scopeFilters.model!.trim()];
  }
  if (isActiveFilterValue(scopeFilters.apiKeyHash)) {
    filters.api_key_hashes = [scopeFilters.apiKeyHash!.trim().toLowerCase()];
  }
  if (scopeFilters.status === 'success') {
    filters.include_failed = false;
  } else if (scopeFilters.status === 'failed') {
    filters.failed_only = true;
  }

  let authIndices: Set<string> | null = null;
  if (isActiveFilterValue(scopeFilters.account)) {
    const account = scopeFilters.account!.trim();
    authIndices = addAuthIndexConstraint(
      authIndices,
      Array.from(authMetaMap.entries())
        .filter(([, meta]) => meta.account === account)
        .map(([authIndex]) => authIndex)
    );
  }
  if (isActiveFilterValue(scopeFilters.provider)) {
    const provider = scopeFilters.provider!.trim();
    authIndices = addAuthIndexConstraint(
      authIndices,
      Array.from(authMetaMap.entries())
        .filter(([, meta]) => meta.provider === provider)
        .map(([authIndex]) => authIndex)
    );
  }
  if (isActiveFilterValue(scopeFilters.channel)) {
    const channel = scopeFilters.channel!.trim();
    authIndices = addAuthIndexConstraint(
      authIndices,
      channels.filter((item) => item.name === channel).flatMap((item) => item.authIndices)
    );
  }
  if (authIndices && authIndices.size > 0) {
    filters.auth_indices = Array.from(authIndices).sort();
  }

  return filters;
};

const buildSummaryFromAnalytics = (summary: MonitoringAnalyticsSummary): MonitoringSummary => ({
  totalCalls: summary.total_calls,
  successCalls: summary.success_calls,
  failureCalls: summary.failure_calls,
  successRate: summary.success_rate,
  inputTokens: summary.input_tokens,
  outputTokens: summary.output_tokens,
  reasoningTokens: summary.reasoning_tokens,
  cachedTokens: summary.cached_tokens,
  totalTokens: summary.total_tokens,
  totalCost: summary.total_cost,
  averageLatencyMs: summary.average_latency_ms,
  rpm30m: summary.rpm_30m,
  tpm30m: summary.tpm_30m,
  avgDailyRequests: summary.avg_daily_requests,
  avgDailyTokens: summary.avg_daily_tokens,
  approxTasks: summary.approx_tasks,
  approxTaskFailures: summary.approx_task_failures,
  approxTaskSuccessRate: summary.approx_task_success_rate,
  zeroTokenCalls: summary.zero_token_calls,
  zeroTokenModels: summary.zero_token_models,
});

const buildTimelineFromAnalytics = (
  points: MonitoringAnalyticsTimelinePoint[],
  granularity: 'hour' | 'day' | string
): MonitoringTimelinePoint[] =>
  points.map((point) => ({
    label:
      granularity === 'hour'
        ? buildHourLabel(point.bucket_ms)
        : buildDayLabel(buildLocalDayKey(point.bucket_ms)),
    requests: point.calls,
    tokens: point.tokens,
    cost: 0,
  }));

const buildHourlyDistributionFromAnalytics = (
  points: MonitoringAnalyticsHourlyPoint[]
): MonitoringTimelinePoint[] => {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    label: `${padNumber(hour)}:00`,
    requests: 0,
    tokens: 0,
    cost: 0,
  }));
  points.forEach((point) => {
    if (point.hour < 0 || point.hour > 23) return;
    buckets[point.hour] = {
      label: `${padNumber(point.hour)}:00`,
      requests: point.calls,
      tokens: point.tokens,
      cost: 0,
    };
  });
  return buckets;
};

const buildModelShareRowsFromAnalytics = (
  rows: MonitoringAnalyticsModelShareRow[],
  modelStats: MonitoringAnalyticsModelStat[] = []
): MonitoringModelShareRow[] => {
  const successRateByModel = new Map(modelStats.map((row) => [row.model, row.success_rate]));
  return rows.map((row) => ({
    model: row.model,
    requests: row.calls,
    totalTokens: row.tokens,
    totalCost: row.cost,
    successRate: successRateByModel.get(row.model) ?? 1,
  }));
};

const buildModelRowsFromAnalytics = (rows: MonitoringAnalyticsModelStat[]): MonitoringModelRow[] =>
  rows.map((row) => ({
    model: row.model,
    requests: row.calls,
    failures: row.failure_calls,
    successRate: row.success_rate,
    totalTokens: row.total_tokens,
    totalCost: row.cost,
    averageLatencyMs: null,
    sources: 0,
    channels: 0,
  }));

const resolveChannelMeta = (
  authIndex: string,
  authMetaMap: Map<string, MonitoringAuthMeta>,
  channelByAuthIndex: Map<string, MonitoringChannelMeta>
) => {
  const authMeta = authMetaMap.get(authIndex);
  const channelMeta =
    channelByAuthIndex.get(authIndex) ||
    (authMeta?.authIndex ? channelByAuthIndex.get(authMeta.authIndex) : undefined);
  return { authMeta, channelMeta };
};

const buildChannelRowsFromAnalytics = (
  rows: MonitoringAnalyticsChannelShareRow[],
  authMetaMap: Map<string, MonitoringAuthMeta>,
  channelByAuthIndex: Map<string, MonitoringChannelMeta>
): MonitoringChannelRow[] =>
  rows
    .map((row) => {
      const authIndex = row.auth_index || '-';
      const { authMeta, channelMeta } = resolveChannelMeta(
        authIndex,
        authMetaMap,
        channelByAuthIndex
      );
      const label = channelMeta?.name || authMeta?.provider || authIndex;
      return {
        id: authIndex,
        label,
        host: channelMeta?.host || '-',
        provider: authMeta?.provider || '-',
        planTypes: authMeta?.planType && authMeta.planType !== '-' ? [authMeta.planType] : [],
        disabled: channelMeta?.disabled || authMeta?.disabled || false,
        authCount: authIndex === '-' ? 0 : 1,
        modelCount: 0,
        requests: row.calls,
        failures: row.failure,
        successRate: row.calls > 0 ? row.success / row.calls : 1,
        totalTokens: row.tokens,
        totalCost: row.cost,
        averageLatencyMs: row.average_latency_ms,
        authLabels: authMeta?.label ? [authMeta.label] : [],
      } satisfies MonitoringChannelRow;
    })
    .sort((left, right) => right.requests - left.requests);

const buildFailureSourceRowsFromAnalytics = (
  rows: MonitoringAnalyticsFailureSourceRow[],
  authMetaMap: Map<string, MonitoringAuthMeta>,
  channelByAuthIndex: Map<string, MonitoringChannelMeta>
): MonitoringFailureSourceRow[] =>
  rows.map((row) => {
    const { authMeta, channelMeta } = resolveChannelMeta(
      row.auth_index || '-',
      authMetaMap,
      channelByAuthIndex
    );
    return {
      id: `${row.source_hash || '-'}::${row.auth_index || '-'}`,
      label: shortHashLabel(row.source_hash),
      channel: channelMeta?.name || authMeta?.provider || row.auth_index || '-',
      failures: row.failure,
      totalRequests: row.calls,
      failureRate: row.calls > 0 ? row.failure / row.calls : 0,
      lastSeenAt: row.last_seen_ms,
      averageLatencyMs: row.average_latency_ms,
    };
  });

const buildTaskBucketsFromAnalytics = (
  rows: MonitoringAnalyticsTaskBucketRow[],
  authMetaMap: Map<string, MonitoringAuthMeta>,
  authFileMap: Map<string, CredentialInfo>,
  sourceInfoMap: ReturnType<typeof buildSourceInfoMap>,
  channelByAuthIndex: Map<string, MonitoringChannelMeta>
): MonitoringTaskBucketRow[] =>
  rows.map((row) => {
    const authIndex = normalizeAuthIndex(row.auth_index) ?? '-';
    const authMeta = authMetaMap.get(authIndex);
    const sourceMeta = resolveSourceDisplay(row.source, authIndex, sourceInfoMap, authFileMap);
    const { channelMeta } = resolveChannelMeta(authIndex, authMetaMap, channelByAuthIndex);
    const sourceLabel =
      authMeta?.label || sourceMeta.displayName || shortHashLabel(row.source_hash);
    return {
      id: row.bucket_key,
      timestampMs: row.first_ms,
      timestamp: new Date(row.first_ms).toISOString(),
      source: sourceLabel,
      sourceMasked: maskEmailLike(sourceLabel),
      channel: channelMeta?.name || authMeta?.provider || sourceMeta.type || '-',
      authLabel: authMeta?.label || sourceLabel,
      planType: authMeta?.planType || '-',
      calls: row.total,
      failedCalls: row.failure,
      failed: row.failure > 0,
      modelsText: joinUnique(row.models, 3),
      totalTokens: row.total_tokens,
      totalCost: 0,
      averageLatencyMs: row.average_latency_ms,
      maxLatencyMs: row.max_latency_ms,
      endpointsText: joinUnique(row.endpoints, 2),
    };
  });

const buildFailureRowsFromAnalytics = (
  rows: MonitoringAnalyticsRecentFailure[],
  authMetaMap: Map<string, MonitoringAuthMeta>,
  channelByAuthIndex: Map<string, MonitoringChannelMeta>
): MonitoringFailureRow[] =>
  rows.map((row) => {
    const authIndex = normalizeAuthIndex(row.auth_index) ?? '-';
    const { authMeta, channelMeta } = resolveChannelMeta(
      authIndex,
      authMetaMap,
      channelByAuthIndex
    );
    return {
      id: `${row.timestamp_ms}-${row.source_hash}-${row.api_key_hash}-${row.model}`,
      timestampMs: row.timestamp_ms,
      timestamp: new Date(row.timestamp_ms).toISOString(),
      model: row.model,
      source: shortHashLabel(row.source_hash || row.api_key_hash),
      channel: channelMeta?.name || authMeta?.provider || '-',
      authIndex: maskAuthIndex(authIndex),
      latencyMs: row.duration_ms,
    };
  });

const buildAnalyticsEventKey = (item: MonitoringAnalyticsEventRow) =>
  item.event_hash ||
  [
    item.timestamp_ms,
    item.model,
    item.source_hash,
    item.api_key_hash,
    item.auth_index,
    item.endpoint,
  ].join(':');

const mergeAnalyticsEventItems = (
  previous: MonitoringAnalyticsEventRow[],
  next: MonitoringAnalyticsEventRow[]
) => {
  if (previous.length === 0) return next;
  const seen = new Set(previous.map(buildAnalyticsEventKey));
  const merged = previous.slice();
  next.forEach((item) => {
    const key = buildAnalyticsEventKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
};

const buildUsageDetailsFromAnalyticsEvents = (
  items: MonitoringAnalyticsEventRow[] = []
): UsageDetailWithEndpoint[] =>
  items.map((item) => ({
    timestamp: new Date(item.timestamp_ms).toISOString(),
    source: readString(item.source),
    auth_index: item.auth_index || null,
    api_key_hash: readString(item.api_key_hash),
    account_snapshot: readString(item.account_snapshot),
    auth_label_snapshot: readString(item.auth_label_snapshot),
    auth_provider_snapshot: readString(item.auth_provider_snapshot),
    latency_ms: item.latency_ms ?? undefined,
    tokens: {
      input_tokens: item.input_tokens,
      output_tokens: item.output_tokens,
      reasoning_tokens: item.reasoning_tokens,
      cached_tokens: item.cached_tokens,
      total_tokens: item.total_tokens,
    },
    failed: item.failed === true,
    __modelName: item.model,
    __endpoint: item.endpoint || `${item.method} ${item.path}`.trim(),
    __endpointMethod: item.method,
    __endpointPath: item.path,
    __timestampMs: item.timestamp_ms,
  }));

const buildEventRows = (
  details: UsageDetailWithEndpoint[],
  authMetaMap: Map<string, MonitoringAuthMeta>,
  authFileMap: Map<string, CredentialInfo>,
  sourceInfoMap: ReturnType<typeof buildSourceInfoMap>,
  channelByAuthIndex: Map<string, MonitoringChannelMeta>,
  modelPrices: Record<string, ModelPrice>,
  apiKeyDisplayMap: Map<string, ApiKeyDisplayInfo>
) =>
  details
    .map((detail, index) => {
      const timestampMs =
        typeof detail.__timestampMs === 'number' && detail.__timestampMs > 0
          ? detail.__timestampMs
          : Date.parse(detail.timestamp);
      if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
        return null;
      }

      const authIndex = normalizeAuthIndex(detail.auth_index) ?? '-';
      const authMeta = authMetaMap.get(authIndex);
      const sourceMeta = resolveSourceDisplay(
        detail.source,
        detail.auth_index,
        sourceInfoMap,
        authFileMap
      );
      const snapshotAccount = readString(detail.account_snapshot ?? detail.accountSnapshot);
      const snapshotLabel = readString(
        detail.auth_label_snapshot ??
          detail.authLabelSnapshot ??
          detail.auth_file_snapshot ??
          detail.authFileSnapshot
      );
      const snapshotProvider = readString(
        detail.auth_provider_snapshot ?? detail.authProviderSnapshot
      );
      const snapshotDisplay = snapshotAccount || snapshotLabel;
      const sourceLabel = authMeta?.label || snapshotDisplay || sourceMeta.displayName || authIndex;
      const sourceMasked = maskEmailLike(sourceLabel);
      const account = authMeta?.account || snapshotAccount || sourceLabel;
      const accountMasked = maskEmailLike(account);
      const apiKeyHash = readString(detail.api_key_hash ?? detail.apiKeyHash).toLowerCase();
      const apiKeyDisplay = apiKeyDisplayMap.get(apiKeyHash);
      const apiKeyLabel = sanitizeApiKeyDisplayText(
        apiKeyDisplay?.label || formatApiKeyHashLabel(apiKeyHash),
        formatApiKeyHashLabel(apiKeyHash)
      );
      const apiKeyMasked = sanitizeApiKeyDisplayText(
        apiKeyDisplay?.masked || apiKeyLabel,
        apiKeyLabel
      );
      const channelMeta =
        channelByAuthIndex.get(authIndex) ||
        (authMeta?.authIndex ? channelByAuthIndex.get(authMeta.authIndex) : undefined);
      const channelLabel =
        channelMeta?.name || authMeta?.provider || snapshotProvider || sourceMeta.type || '-';
      const endpoint = readString(detail.__endpoint) || '-';
      const endpointMethod = readString(detail.__endpointMethod) || '-';
      const endpointPath = readString(detail.__endpointPath) || endpoint;
      const inputTokens = Math.max(Number(detail.tokens?.input_tokens) || 0, 0);
      const outputTokens = Math.max(Number(detail.tokens?.output_tokens) || 0, 0);
      const reasoningTokens = Math.max(Number(detail.tokens?.reasoning_tokens) || 0, 0);
      const cachedTokens = Math.max(
        Math.max(Number(detail.tokens?.cached_tokens) || 0, 0),
        Math.max(Number(detail.tokens?.cache_tokens) || 0, 0)
      );
      const totalTokens = Math.max(
        Number(detail.tokens?.total_tokens) || 0,
        extractTotalTokens(detail)
      );
      const totalCost = calculateCost(detail, modelPrices);
      const statsIncluded = detail.failed === true || inputTokens > 0 || outputTokens > 0;
      const dayKey = buildLocalDayKey(timestampMs);
      const hourLabel = buildHourLabel(timestampMs);
      const sourceKey = sourceMeta.identityKey || `source:${sourceLabel}`;
      const taskKey = `${detail.timestamp}|${sourceKey}|${authIndex}`;

      return {
        id: `${detail.timestamp}-${detail.__modelName || '-'}-${sourceKey}-${authIndex}-${index}`,
        timestamp: detail.timestamp,
        timestampMs,
        dayKey,
        hourLabel,
        model: readString(detail.__modelName) || '-',
        endpoint,
        endpointMethod,
        endpointPath,
        sourceKey,
        source: sourceLabel,
        sourceMasked,
        account,
        accountMasked,
        authIndex,
        authIndexMasked: maskAuthIndex(authIndex),
        authLabel: authMeta?.label || snapshotLabel || sourceMasked,
        apiKeyHash,
        apiKeyLabel,
        apiKeyMasked,
        provider: authMeta?.provider || snapshotProvider || sourceMeta.type || '-',
        planType: authMeta?.planType || '-',
        channel: channelLabel,
        channelHost: channelMeta?.host || '-',
        channelDisabled: channelMeta?.disabled || false,
        failed: detail.failed === true,
        statsIncluded,
        latencyMs: typeof detail.latency_ms === 'number' ? detail.latency_ms : null,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
        totalTokens,
        totalCost,
        taskKey,
        searchText: buildSearchText(
          detail.__modelName,
          sourceLabel,
          authMeta?.account,
          authMeta?.label,
          authIndex,
          apiKeyHash,
          apiKeyLabel,
          apiKeyMasked,
          channelLabel,
          channelMeta?.host,
          endpointPath,
          endpointMethod,
          authMeta?.provider || snapshotProvider,
          authMeta?.planType
        ),
      } satisfies MonitoringEventRow;
    })
    .filter(Boolean) as MonitoringEventRow[];

const loadMonitoringMetaPayload = async (
  config: Config | null | undefined
): Promise<MonitoringMetaPayload> => {
  const [authResult, channelResult] = await Promise.allSettled([
    authFilesApi.list(),
    apiClient.get('/openai-compatibility'),
  ]);

  const authFiles =
    authResult.status === 'fulfilled' && Array.isArray(authResult.value.files)
      ? authResult.value.files
      : [];

  let channels: MonitoringChannelMeta[] = [];

  if (channelResult.status === 'fulfilled') {
    channels = extractArrayPayload(channelResult.value, 'openai-compatibility')
      .map((item, index) => normalizeOpenAIChannel(item, index))
      .filter(Boolean) as MonitoringChannelMeta[];
  } else if (config?.openaiCompatibility?.length) {
    channels = config.openaiCompatibility
      .map((item, index) =>
        normalizeOpenAIChannel(
          {
            ...item,
            'base-url': item.baseUrl,
            'api-key-entries': item.apiKeyEntries,
            models: item.models,
          },
          index
        )
      )
      .filter(Boolean) as MonitoringChannelMeta[];
  }

  const error = [authResult, channelResult]
    .filter((result) => result.status === 'rejected')
    .map((result) => (result.status === 'rejected' ? result.reason : null))
    .filter(Boolean)
    .map((err) => (err instanceof Error ? err.message : String(err)))
    .join('；');

  return { authFiles, channels, error };
};

export function useMonitoringData({
  usage,
  config,
  modelPrices,
  apiKeyAliases,
  timeRange,
  customTimeRange,
  searchQuery,
  searchApiKeyHash,
  scopeFilters,
}: UseMonitoringDataParams): UseMonitoringDataReturn {
  const [authFiles, setAuthFiles] = useState<AuthFileItem[]>([]);
  const [channels, setChannels] = useState<MonitoringChannelMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyticsNowMs, setAnalyticsNowMs] = useState(() => Date.now());
  const [eventsPageState, setEventsPageState] = useState<MonitoringEventsPageState>(() =>
    createEventsPageState()
  );

  const analyticsBounds = useMemo(() => {
    const bounds = getRangeBounds(timeRange, analyticsNowMs, customTimeRange);
    if (!bounds) return null;
    return {
      startMs: Number.isFinite(bounds.startMs) && bounds.startMs > 0 ? bounds.startMs : 1,
      endMs: Math.max(bounds.endMs, 1),
    };
  }, [analyticsNowMs, customTimeRange, timeRange]);

  const refreshMeta = useCallback(
    async (showLoading: boolean = true) => {
      if (showLoading) {
        setLoading(true);
        setError('');
      }

      const payload = await loadMonitoringMetaPayload(config);
      setAuthFiles(payload.authFiles);
      setChannels(payload.channels);
      setError(payload.error);
      setLoading(false);
      setAnalyticsNowMs(Date.now());
    },
    [config]
  );

  useEffect(() => {
    let cancelled = false;

    loadMonitoringMetaPayload(config).then((payload) => {
      if (cancelled) return;
      setAuthFiles(payload.authFiles);
      setChannels(payload.channels);
      setError(payload.error);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [config]);

  const authMetaMap = useMemo(() => buildMonitoringAuthMetaMap(authFiles), [authFiles]);

  const uniqueAuthMeta = useMemo(() => {
    const map = new Map<string, MonitoringAuthMeta>();
    authMetaMap.forEach((item) => {
      map.set(item.authIndex, item);
    });
    return Array.from(map.values());
  }, [authMetaMap]);

  const authFileMap = useMemo(() => {
    const map = new Map<string, CredentialInfo>();
    authFiles.forEach((entry) => {
      const authIndex = normalizeAuthIndex(entry['auth_index'] ?? entry.authIndex);
      if (!authIndex) return;
      map.set(authIndex, {
        name:
          readString(entry.label) ||
          readString(entry.name) ||
          readString(entry.email) ||
          readString(entry.account) ||
          authIndex,
        type: readString(entry.provider) || readString(entry.type),
      });
    });
    return map;
  }, [authFiles]);

  const sourceInfoMap = useMemo(
    () =>
      buildSourceInfoMap({
        geminiApiKeys: config?.geminiApiKeys || [],
        claudeApiKeys: config?.claudeApiKeys || [],
        codexApiKeys: config?.codexApiKeys || [],
        vertexApiKeys: config?.vertexApiKeys || [],
        openaiCompatibility: config?.openaiCompatibility || [],
      }),
    [config]
  );

  const channelByAuthIndex = useMemo(() => {
    const map = new Map<string, MonitoringChannelMeta>();
    channels.forEach((channel) => {
      channel.authIndices.forEach((authIndex) => {
        map.set(authIndex, channel);
      });
    });
    return map;
  }, [channels]);

  const apiKeyDisplayMap = useMemo(() => {
    return buildApiKeyDisplayMap(config?.apiKeys || [], apiKeyAliases || []);
  }, [apiKeyAliases, config?.apiKeys]);

  const analyticsFilters = useMemo(
    () => buildAnalyticsFilters(scopeFilters, authMetaMap, channels),
    [authMetaMap, channels, scopeFilters]
  );

  const analyticsGranularity = useMemo(
    () => (shouldUseHourlyTimeline(timeRange, customTimeRange) ? 'hour' : 'day'),
    [customTimeRange, timeRange]
  );

  const analyticsScopeKey = useMemo(
    () =>
      JSON.stringify({
        bounds: analyticsBounds,
        searchQuery,
        searchApiKeyHash,
        filters: analyticsFilters,
        granularity: analyticsGranularity,
      }),
    [analyticsBounds, analyticsFilters, analyticsGranularity, searchApiKeyHash, searchQuery]
  );

  const activeEventsPageState =
    eventsPageState.scopeKey === analyticsScopeKey
      ? eventsPageState
      : createEventsPageState(analyticsScopeKey);
  const eventsBeforeMs = activeEventsPageState.beforeMs;
  const eventItems = activeEventsPageState.items;
  const eventsHasMore = activeEventsPageState.hasMore;
  const eventsLoadingMore = activeEventsPageState.loadingMore;

  const analytics = useMonitoringAnalytics({
    fromMs: analyticsBounds?.startMs,
    toMs: analyticsBounds?.endMs,
    nowMs: analyticsNowMs,
    searchQuery,
    searchApiKeyHash,
    filters: analyticsFilters,
    include: {
      summary: true,
      timeline: true,
      hourly_distribution: true,
      model_share: true,
      channel_share: true,
      model_stats: true,
      failure_sources: true,
      task_buckets: true,
      recent_failures: 8,
      events_page: { limit: MONITORING_EVENTS_PAGE_LIMIT, before_ms: eventsBeforeMs },
      granularity: analyticsGranularity,
    },
    throttleMs: 1_000,
  });
  const analyticsData = analytics.data;

  useEffect(() => {
    const page = analyticsData?.events;
    if (!page) return;
    const requestBeforeMs = eventsBeforeMs;
    const pageKey = buildEventsPageKey(
      analyticsScopeKey,
      requestBeforeMs,
      page.items,
      page.next_before_ms
    );
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setEventsPageState((previous) => {
        const base =
          previous.scopeKey === analyticsScopeKey
            ? previous
            : createEventsPageState(analyticsScopeKey);
        if (base.lastPageKey === pageKey) return base;
        return {
          scopeKey: analyticsScopeKey,
          beforeMs: base.beforeMs,
          items: requestBeforeMs ? mergeAnalyticsEventItems(base.items, page.items) : page.items,
          hasMore: page.has_more,
          loadingMore: false,
          lastPageKey: pageKey,
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [analyticsData?.events, analyticsScopeKey, eventsBeforeMs]);

  useEffect(() => {
    if (analytics.error) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setEventsPageState((previous) =>
          previous.loadingMore ? { ...previous, loadingMore: false } : previous
        );
      });
      return () => {
        cancelled = true;
      };
    }
  }, [analytics.error]);

  const loadMoreEvents = useCallback(() => {
    if (analytics.loading || eventsLoadingMore || !eventsHasMore) return;
    const nextBeforeMs = analyticsData?.events?.next_before_ms;
    if (!nextBeforeMs) return;
    setEventsPageState((previous) => {
      const base =
        previous.scopeKey === analyticsScopeKey
          ? previous
          : createEventsPageState(analyticsScopeKey);
      if (base.loadingMore) return base;
      return { ...base, beforeMs: nextBeforeMs, loadingMore: true };
    });
  }, [
    analyticsData?.events?.next_before_ms,
    analytics.loading,
    analyticsScopeKey,
    eventsHasMore,
    eventsLoadingMore,
  ]);

  const allRows = useMemo(() => {
    const details = analyticsData
      ? buildUsageDetailsFromAnalyticsEvents(eventItems)
      : collectUsageDetailsWithEndpoint(usage);
    return buildEventRows(
      details,
      authMetaMap,
      authFileMap,
      sourceInfoMap,
      channelByAuthIndex,
      modelPrices,
      apiKeyDisplayMap
    ).sort((left, right) => right.timestampMs - left.timestampMs);
  }, [
    apiKeyDisplayMap,
    authFileMap,
    authMetaMap,
    channelByAuthIndex,
    analyticsData,
    eventItems,
    modelPrices,
    sourceInfoMap,
    usage,
  ]);

  const filteredRows = useMemo(
    () =>
      buildRangeFilteredRows(allRows, timeRange, customTimeRange, searchQuery, searchApiKeyHash),
    [allRows, customTimeRange, searchApiKeyHash, searchQuery, timeRange]
  );
  const statsRows = useMemo(() => filteredRows.filter(shouldIncludeInStats), [filteredRows]);

  const summary = useMemo(
    () =>
      analyticsData?.summary
        ? buildSummaryFromAnalytics(analyticsData.summary)
        : buildMonitoringSummary(statsRows),
    [analyticsData, statsRows]
  );
  const timelineData = useMemo(
    () =>
      analyticsData?.timeline
        ? {
            granularity:
              analyticsData.granularity === 'hour' ? ('hour' as const) : ('day' as const),
            points: buildTimelineFromAnalytics(analyticsData.timeline, analyticsData.granularity),
          }
        : buildTimeline(statsRows, timeRange, customTimeRange),
    [analyticsData, customTimeRange, statsRows, timeRange]
  );
  const hourlyDistribution = useMemo(
    () =>
      analyticsData?.hourly_distribution
        ? buildHourlyDistributionFromAnalytics(analyticsData.hourly_distribution)
        : buildHourlyDistribution(statsRows),
    [analyticsData, statsRows]
  );
  const modelShareRows = useMemo(
    () =>
      analyticsData?.model_share
        ? buildModelShareRowsFromAnalytics(analyticsData.model_share, analyticsData.model_stats)
        : buildModelShareRows(statsRows),
    [analyticsData, statsRows]
  );
  const channelRows = useMemo(
    () =>
      analyticsData?.channel_share
        ? buildChannelRowsFromAnalytics(analyticsData.channel_share, authMetaMap, channelByAuthIndex)
        : buildChannelRows(statsRows),
    [analyticsData, authMetaMap, channelByAuthIndex, statsRows]
  );
  const modelRows = useMemo(
    () =>
      analyticsData?.model_stats
        ? buildModelRowsFromAnalytics(analyticsData.model_stats)
        : buildModelRows(statsRows),
    [analyticsData, statsRows]
  );
  const failureSourceRows = useMemo(
    () =>
      analyticsData?.failure_sources
        ? buildFailureSourceRowsFromAnalytics(
            analyticsData.failure_sources,
            authMetaMap,
            channelByAuthIndex
          )
        : buildFailureSourceRows(statsRows),
    [analyticsData, authMetaMap, channelByAuthIndex, statsRows]
  );
  const taskBuckets = useMemo(
    () =>
      analyticsData?.task_buckets
        ? buildTaskBucketsFromAnalytics(
            analyticsData.task_buckets,
            authMetaMap,
            authFileMap,
            sourceInfoMap,
            channelByAuthIndex
          )
        : buildTaskBuckets(statsRows),
    [analyticsData, authFileMap, authMetaMap, channelByAuthIndex, sourceInfoMap, statsRows]
  );
  const recentFailures = useMemo(
    () =>
      analyticsData?.recent_failures
        ? buildFailureRowsFromAnalytics(
            analyticsData.recent_failures,
            authMetaMap,
            channelByAuthIndex
          )
        : buildFailureRows(statsRows),
    [analyticsData, authMetaMap, channelByAuthIndex, statsRows]
  );

  const metadata = useMemo<MonitoringMetadata>(() => {
    const planTypes = Array.from(
      new Set(uniqueAuthMeta.map((item) => item.planType).filter((item) => item && item !== '-'))
    ).sort();

    return {
      totalAuthFiles: authFiles.length,
      activeAuthFiles: uniqueAuthMeta.filter(
        (item) => !item.disabled && !item.unavailable && item.status === 'active'
      ).length,
      unavailableAuthFiles: uniqueAuthMeta.filter((item) => item.unavailable).length,
      runtimeOnlyAuthFiles: uniqueAuthMeta.filter((item) => item.runtimeOnly).length,
      totalChannels: channels.length,
      enabledChannels: channels.filter((item) => !item.disabled).length,
      configuredModels: Array.from(new Set(channels.flatMap((item) => item.modelNames))).length,
      planTypes,
    };
  }, [authFiles.length, channels, uniqueAuthMeta]);

  const statusChips = useMemo(() => buildStatusChips(metadata), [metadata]);

  return {
    loading: loading || analytics.loading,
    error: [error, analytics.error].filter(Boolean).join('；'),
    authFiles,
    channels,
    summary,
    metadata,
    statusChips,
    timeline: timelineData.points,
    timelineGranularity: timelineData.granularity,
    hourlyDistribution,
    modelShareRows,
    channelRows,
    modelRows,
    failureSourceRows,
    taskBuckets,
    recentFailures,
    filteredRows,
    eventsHasMore,
    eventsLoadingMore,
    lastRefreshedAt: analytics.lastRefreshedAt,
    refreshMeta,
    loadMoreEvents,
  };
}
