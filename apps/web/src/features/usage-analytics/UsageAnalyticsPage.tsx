import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from 'echarts/components';
import type {
  BarSeriesOption,
  HeatmapSeriesOption,
  LineSeriesOption,
  PieSeriesOption,
} from 'echarts/charts';
import type { ComposeOption, ECElementEvent } from 'echarts/core';
import { EChartsView } from '@/components/charts/EChartsView';
import { Button } from '@/components/ui/Button';
import { Select, type SelectOption } from '@/components/ui/Select';
import {
  IconArrowDownToLine,
  IconArrowUpFromLine,
  IconChartLine,
  IconCheck,
  IconCopy,
  IconDatabaseZap,
  IconDownload,
  IconDollarSign,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconInbox,
  IconKey,
  IconLayoutDashboard,
  IconModelCluster,
  IconMoreVertical,
  IconRefreshCw,
  IconSearch,
  IconShield,
  IconTimer,
  IconTrendingUp,
} from '@/components/ui/icons';
import { downloadBlob } from '@/utils/download';
import {
  buildUsageHeatmapChartData,
  buildMonitoringDetailUrl,
  buildOptionValues,
  anomalyMetricLabelKey,
  DEFAULT_SELECTED_METRICS,
  formatDateTimeLocalValue,
  formatLocalDateTime,
  formatMetricValue,
  hasUsageData,
  maskApiKeyHash,
  parseDateTimeLocalValue,
  USAGE_ANALYTICS_TABS,
  USAGE_MATRIX_DIMENSIONS,
  USAGE_MATRIX_METRICS,
  USAGE_METRICS,
  USAGE_TIME_RANGES,
  type UsageAnalyticsTab,
  type UsageCredentialQuotaRow,
  type UsageEntityTrendSeries,
  type UsageInsight,
  type UsageAnalyticsGranularity,
  type UsageAnalyticsStatus,
  type UsageDrilldownEvent,
  type UsageHeatmapPoint,
  type UsageKeyAnomalyRow,
  type UsageMatrix,
  type UsageMatrixDimension,
  type UsageMatrixMetricKey,
  type UsageMetricKey,
  type UsageProviderRow,
  type UsageRankRow,
  type UsageServerAnomaly,
  type UsageTimelinePoint,
  type UsageTrendMetricKey,
} from './usageAnalyticsModel';
import { useUsageAnalytics } from './useUsageAnalytics';
import styles from './UsageAnalyticsPage.module.scss';

type SummaryCardConfig = {
  key: UsageMetricKey;
  icon: ReactNode;
  accent: string;
};

const summaryCards: SummaryCardConfig[] = [
  { key: 'requestCount', icon: <IconChartLine size={22} />, accent: 'blue' },
  { key: 'totalTokens', icon: <IconDatabaseZap size={22} />, accent: 'teal' },
  { key: 'inputTokens', icon: <IconArrowDownToLine size={22} />, accent: 'cyan' },
  { key: 'outputTokens', icon: <IconArrowUpFromLine size={22} />, accent: 'violet' },
  { key: 'cachedTokens', icon: <IconDatabaseZap size={22} />, accent: 'sky' },
  { key: 'estimatedCost', icon: <IconDollarSign size={22} />, accent: 'orange' },
];

const overviewSummaryCards: SummaryCardConfig[] = [
  { key: 'requestCount', icon: <IconChartLine size={22} />, accent: 'blue' },
  { key: 'totalTokens', icon: <IconDatabaseZap size={22} />, accent: 'teal' },
  { key: 'estimatedCost', icon: <IconDollarSign size={22} />, accent: 'orange' },
  { key: 'cachedTokens', icon: <IconDatabaseZap size={22} />, accent: 'sky' },
];

const trendMetricOptions: Array<{ value: UsageTrendMetricKey; labelKey: string }> = [
  { value: 'requestCount', labelKey: 'usage_analytics.trend_metric_requestCount' },
  { value: 'totalTokens', labelKey: 'usage_analytics.trend_metric_totalTokens' },
  { value: 'estimatedCost', labelKey: 'usage_analytics.trend_metric_estimatedCost' },
];

const pieColors = ['#2563eb', '#0ea5a7', '#8b5cf6', '#f97316', '#94a3b8'];
const chartHeight = 360;
const compactChartHeight = 220;

type UsageTrendChartOption = ComposeOption<
  | DataZoomComponentOption
  | GridComponentOption
  | LegendComponentOption
  | LineSeriesOption
  | TooltipComponentOption
>;

type CostShareChartOption = ComposeOption<
  LegendComponentOption | PieSeriesOption | TooltipComponentOption
>;

type HealthChartOption = ComposeOption<
  | BarSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | LineSeriesOption
  | TooltipComponentOption
>;

type TokenStructureChartOption = ComposeOption<
  | BarSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
>;

type EntityTrendChartOption = ComposeOption<
  | GridComponentOption
  | LegendComponentOption
  | LineSeriesOption
  | TooltipComponentOption
>;

type HeatmapChartOption = ComposeOption<
  | GridComponentOption
  | HeatmapSeriesOption
  | TooltipComponentOption
  | VisualMapComponentOption
>;

const usageChartAxisKeys = {
  requests: 0,
  tokens: 1,
  cost: 2,
} as const;

const usageChartAxisLabelColors = {
  requests: '#2563eb',
  tokens: '#0ea5a7',
  cost: '#f97316',
} as const;

const compactNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
};

const formatPercent = (value: number) =>
  `${(Number.isFinite(value) ? value * 100 : 0).toFixed(2)}%`;

const formatDelta = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}%`;
};

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getMetricLabel = (key: UsageMetricKey, t: ReturnType<typeof useTranslation>['t']) => {
  const metric = USAGE_METRICS.find((item) => item.key === key);
  return metric ? t(metric.labelKey) : key;
};

const formatTrendMetricValue = (key: UsageTrendMetricKey, value: number) => {
  if (key === 'estimatedCost') return formatMetricValue('estimatedCost', value);
  if (key === 'totalTokens') return formatMetricValue('totalTokens', value);
  return formatMetricValue('requestCount', value);
};

const formatMatrixMetricValue = (key: UsageMatrixMetricKey, value: number) => {
  if (key === 'failureRate') return formatPercent(value);
  if (key === 'estimatedCost') return formatMetricValue('estimatedCost', value);
  if (key === 'totalTokens') return formatMetricValue('totalTokens', value);
  return formatMetricValue('requestCount', value);
};

const formatQuotaValue = (value: number) => formatMetricValue('estimatedCost', value);

const normalizeBlobFilenamePart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'usage';

const buildUsageExportFilename = (tab: string) => {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('');
  return `usage-analytics-${normalizeBlobFilenamePart(tab)}-${stamp}.json`;
};

const buildStableSelectOptions = (
  allLabel: string,
  values: Array<string | null | undefined>,
  currentValue?: string,
  currentLabel?: string
): SelectOption[] => {
  const normalizedCurrent = currentValue?.trim();
  const options = buildOptionValues([
    ...values,
    normalizedCurrent && normalizedCurrent !== 'all' ? normalizedCurrent : undefined,
  ]).map((value) => ({
    value,
    label: value === normalizedCurrent && currentLabel ? currentLabel : value,
  }));
  return [{ value: 'all', label: allLabel }, ...options];
};

type StableUsageOptionCache = {
  models: string[];
  providers: string[];
  authFiles: string[];
  projectIds: string[];
  requestTypes: string[];
  apiKeys: SelectOption[];
};

const emptyStableOptionCache = (): StableUsageOptionCache => ({
  models: [],
  providers: [],
  authFiles: [],
  projectIds: [],
  requestTypes: [],
  apiKeys: [],
});

const mergeSelectOptions = (options: SelectOption[]) =>
  Array.from(
    new Map(
      options
        .filter((option) => option.value.trim())
        .map((option) => [option.value, option] as const)
    ).values()
  ).sort((left, right) => left.label.localeCompare(right.label));

const mergeStableOptionCache = (
  current: StableUsageOptionCache,
  incoming: StableUsageOptionCache
): StableUsageOptionCache => ({
  models: buildOptionValues([...current.models, ...incoming.models]),
  providers: buildOptionValues([...current.providers, ...incoming.providers]),
  authFiles: buildOptionValues([...current.authFiles, ...incoming.authFiles]),
  projectIds: buildOptionValues([...current.projectIds, ...incoming.projectIds]),
  requestTypes: buildOptionValues([...current.requestTypes, ...incoming.requestTypes]),
  apiKeys: mergeSelectOptions([...current.apiKeys, ...incoming.apiKeys]),
});

const stableOptionCachesEqual = (
  left: StableUsageOptionCache,
  right: StableUsageOptionCache
) =>
  left.models.join('\n') === right.models.join('\n') &&
  left.providers.join('\n') === right.providers.join('\n') &&
  left.authFiles.join('\n') === right.authFiles.join('\n') &&
  left.projectIds.join('\n') === right.projectIds.join('\n') &&
  left.requestTypes.join('\n') === right.requestTypes.join('\n') &&
  left.apiKeys.map((option) => `${option.value}:${option.label}`).join('\n') ===
    right.apiKeys.map((option) => `${option.value}:${option.label}`).join('\n');

const metricValue = (point: UsageTimelinePoint, key: UsageMetricKey) => point[key];

const getMetricAxisIndex = (axis: (typeof USAGE_METRICS)[number]['axis']) =>
  usageChartAxisKeys[axis];

const getAxisValueFormatter = (axis: (typeof USAGE_METRICS)[number]['axis']) => {
  if (axis === 'cost') return (value: number) => formatMetricValue('estimatedCost', value);
  if (axis === 'requests') return (value: number) => compactNumber(value);
  return (value: number) => compactNumber(value);
};

const getUsageChartTooltipFormatter =
  (
    timeline: UsageTimelinePoint[],
    locale: string,
    t: ReturnType<typeof useTranslation>['t']
  ) =>
  (params: unknown) => {
    const items = Array.isArray(params) ? params : [params];
    const first = items[0] as { dataIndex?: number } | undefined;
    const point =
      typeof first?.dataIndex === 'number' ? timeline[first.dataIndex] : undefined;
    const rows = items
      .map((item) => {
        const entry = item as {
          color?: string;
          data?: number;
          marker?: string;
          seriesName?: string;
        };
        const metric = USAGE_METRICS.find((candidate) => t(candidate.labelKey) === entry.seriesName);
        const value =
          metric && typeof entry.data === 'number'
            ? formatMetricValue(metric.key, entry.data)
            : String(entry.data ?? '-');
        return `<div class="${styles.echartsTooltipRow}"><span>${entry.marker ?? ''}${escapeHtml(entry.seriesName)}</span><strong>${escapeHtml(value)}</strong></div>`;
      })
      .join('');

    return `<div class="${styles.echartsTooltip}"><b>${escapeHtml(
      point ? formatLocalDateTime(point.bucketMs, locale) : ''
    )}</b>${rows}</div>`;
  };

const buildUsageTrendChartOption = ({
  compact,
  locale,
  metrics,
  selectedBucket,
  t,
  timeline,
}: {
  compact: boolean;
  locale: string;
  metrics: typeof USAGE_METRICS;
  selectedBucket?: UsageTimelinePoint | null;
  t: ReturnType<typeof useTranslation>['t'];
  timeline: UsageTimelinePoint[];
}): UsageTrendChartOption => {
  const selectedLabel = selectedBucket?.label;
  const visibleAxisSet = new Set(metrics.map((metric) => metric.axis));
  const requestsVisible = visibleAxisSet.has('requests');
  const tokensVisible = visibleAxisSet.has('tokens');
  const costVisible = visibleAxisSet.has('cost');
  const tokensOnRight = tokensVisible && requestsVisible;
  const costOnRight = costVisible && (requestsVisible || tokensVisible);
  const rightAxisCount = Number(tokensOnRight) + Number(costOnRight);
  const splitLineAxis = requestsVisible ? 'requests' : tokensVisible ? 'tokens' : 'cost';
  const selectedLine =
    selectedLabel && metrics.length > 0
      ? {
          symbol: ['none', 'none'],
          label: { show: false },
          lineStyle: {
            color: '#64748b',
            type: 'dashed' as const,
            width: 1.5,
          },
          data: [{ xAxis: selectedLabel }],
          silent: true,
        }
      : undefined;

  return {
    animationDuration: compact ? 180 : 320,
    backgroundColor: 'transparent',
    color: metrics.map((metric) => metric.color),
    dataZoom:
      timeline.length > 12
        ? [
            {
              type: 'inside',
              xAxisIndex: 0,
              filterMode: 'none',
              minSpan: Math.min(100, Math.max(10, (6 / timeline.length) * 100)),
              zoomOnMouseWheel: true,
              moveOnMouseMove: true,
              moveOnMouseWheel: false,
            },
          ]
        : [],
    grid: {
      bottom: compact ? 34 : 44,
      containLabel: true,
      left: 10,
      right: rightAxisCount > 1 ? 104 : rightAxisCount === 1 ? 72 : 28,
      top: compact ? 16 : 28,
    },
    legend: {
      bottom: 0,
      icon: 'circle',
      itemGap: 16,
      itemHeight: 8,
      itemWidth: 8,
      selectedMode: false,
      textStyle: {
        color: '#64748b',
        fontSize: 12,
        fontWeight: 700,
      },
    },
    tooltip: {
      appendToBody: true,
      axisPointer: {
        lineStyle: {
          color: '#94a3b8',
          type: 'dashed',
          width: 1,
        },
        snap: true,
        type: 'line',
      },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#dbe3ef',
      borderRadius: 10,
      borderWidth: 1,
      className: styles.echartsTooltipWrapper,
      confine: true,
      extraCssText: 'box-shadow: 0 16px 36px rgba(15,23,42,0.14);',
      formatter: getUsageChartTooltipFormatter(timeline, locale, t),
      padding: 0,
      trigger: 'axis',
    },
    xAxis: {
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        fontWeight: 700,
        hideOverlap: true,
        margin: 14,
      },
      axisLine: {
        lineStyle: {
          color: '#e2e8f0',
        },
      },
      axisTick: { show: false },
      boundaryGap: false,
      data: timeline.map((point) => point.label),
      type: 'category',
    },
    yAxis: [
      {
        axisLabel: {
          color: usageChartAxisLabelColors.requests,
          formatter: getAxisValueFormatter('requests'),
          fontWeight: 700,
        },
        nameTextStyle: { color: usageChartAxisLabelColors.requests },
        position: 'left',
        scale: true,
        show: requestsVisible,
        splitLine: {
          show: splitLineAxis === 'requests',
          lineStyle: {
            color: '#e8edf5',
            type: 'dashed',
          },
        },
        type: 'value',
      },
      {
        axisLabel: {
          color: usageChartAxisLabelColors.tokens,
          formatter: getAxisValueFormatter('tokens'),
          fontWeight: 700,
        },
        offset: tokensOnRight && costOnRight ? 46 : 0,
        position: tokensOnRight ? 'right' : 'left',
        scale: true,
        show: tokensVisible,
        splitLine: {
          show: splitLineAxis === 'tokens',
          lineStyle: {
            color: '#e8edf5',
            type: 'dashed',
          },
        },
        type: 'value',
      },
      {
        axisLabel: {
          color: usageChartAxisLabelColors.cost,
          formatter: getAxisValueFormatter('cost'),
          fontWeight: 700,
        },
        position: costOnRight ? 'right' : 'left',
        scale: true,
        show: costVisible,
        splitLine: {
          show: splitLineAxis === 'cost',
          lineStyle: {
            color: '#e8edf5',
            type: 'dashed',
          },
        },
        type: 'value',
      },
    ],
    series: metrics.map((metric, index) => ({
      areaStyle:
        compact || index > 1
          ? undefined
          : {
              color: {
                colorStops: [
                  { color: `${metric.color}26`, offset: 0 },
                  { color: `${metric.color}00`, offset: 1 },
                ],
                x: 0,
                x2: 0,
                y: 0,
                y2: 1,
                type: 'linear',
              },
            },
      connectNulls: true,
      data: timeline.map((point) => metricValue(point, metric.key)),
      emphasis: {
        focus: 'series',
        lineStyle: { width: compact ? 2.6 : 3.2 },
      },
      lineStyle: {
        color: metric.color,
        width: compact ? 2 : 2.5,
      },
      markLine: index === 0 && selectedLine ? selectedLine : undefined,
      name: t(metric.labelKey),
      showSymbol: timeline.length <= 36,
      smooth: 0.25,
      symbol: 'circle',
      symbolSize: compact ? 5 : 6,
      type: 'line',
      yAxisIndex: getMetricAxisIndex(metric.axis),
    })),
  };
};

function UsageLineChart({
  timeline,
  selectedMetrics,
  selectedBucket,
  onSelectBucket,
  compact = false,
}: {
  timeline: UsageTimelinePoint[];
  selectedMetrics: UsageMetricKey[];
  selectedBucket?: UsageTimelinePoint | null;
  onSelectBucket?: (point: UsageTimelinePoint) => void;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const metrics = useMemo(
    () => USAGE_METRICS.filter((metric) => selectedMetrics.includes(metric.key)),
    [selectedMetrics]
  );
  const option = useMemo(
    () =>
      buildUsageTrendChartOption({
        compact,
        locale: i18n.language,
        metrics,
        selectedBucket,
        t,
        timeline,
      }),
    [compact, i18n.language, metrics, selectedBucket, t, timeline]
  );
  const handleClick = useCallback(
    (event: ECElementEvent) => {
      const dataIndex = typeof event.dataIndex === 'number' ? event.dataIndex : -1;
      const point = dataIndex >= 0 ? timeline[dataIndex] : undefined;
      if (point) onSelectBucket?.(point);
    },
    [onSelectBucket, timeline]
  );

  if (timeline.length === 0 || metrics.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }

  const height = compact ? compactChartHeight : chartHeight;

  return (
    <div className={styles.localChart}>
      <EChartsView
        option={option}
        className={styles.echartsCanvas}
        style={{ height }}
        role={onSelectBucket ? 'button' : 'img'}
        ariaLabel={t('usage_analytics.trend_title')}
        onClick={onSelectBucket ? handleClick : undefined}
      />
    </div>
  );
}

function MiniTrendPlaceholder() {
  const { t } = useTranslation();
  return (
    <span className={styles.sparklinePlaceholder} title={t('usage_analytics.trend_pending_data')}>
      <svg viewBox="0 0 58 18" aria-hidden="true">
        <path d="M2 13 L14 9 L26 11 L38 5 L56 7" />
      </svg>
      <em>{t('usage_analytics.trend_pending_data')}</em>
    </span>
  );
}

function CostShareChart({ rows }: { rows: UsageRankRow[] }) {
  const { t } = useTranslation();
  const totalCost = rows.reduce((sum, row) => sum + row.estimatedCost, 0);
  const chartRows = rows.filter((row) => row.estimatedCost > 0).slice(0, 5);

  if (totalCost <= 0 || chartRows.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{formatMetricValue('estimatedCost', 0)}</span>
      </div>
    );
  }

  const option: CostShareChartOption = {
    animationDuration: 260,
    backgroundColor: 'transparent',
    color: pieColors,
    legend: { show: false },
    tooltip: {
      appendToBody: true,
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#dbe3ef',
      borderRadius: 10,
      borderWidth: 1,
      className: styles.echartsTooltipWrapper,
      confine: true,
      extraCssText: 'box-shadow: 0 16px 36px rgba(15,23,42,0.14);',
      formatter: (params: unknown) => {
        const item = params as { data?: { value?: number }; marker?: string; name?: string };
        const value = Number(item.data?.value ?? 0);
        return `<div class="${styles.echartsTooltip}"><b>${escapeHtml(
          item.name
        )}</b><div class="${styles.echartsTooltipRow}"><span>${item.marker ?? ''}${escapeHtml(
          t('usage_analytics.total_cost')
        )}</span><strong>${escapeHtml(
          formatMetricValue('estimatedCost', value)
        )}</strong></div><div class="${styles.echartsTooltipRow}"><span>${escapeHtml(
          t('usage_analytics.share')
        )}</span><strong>${escapeHtml(formatPercent(value / totalCost))}</strong></div></div>`;
      },
      padding: 0,
      trigger: 'item',
    },
    series: [
      {
        avoidLabelOverlap: true,
        center: ['50%', '50%'],
        data: chartRows.map((row) => ({
          name: row.label,
          value: row.estimatedCost,
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 12,
            shadowColor: 'rgba(15,23,42,0.18)',
          },
          scaleSize: 4,
        },
        itemStyle: {
          borderColor: '#fff',
          borderRadius: 6,
          borderWidth: 3,
        },
        label: { show: false },
        labelLine: { show: false },
        radius: ['58%', '78%'],
        type: 'pie',
      },
    ],
  };

  return (
    <div className={styles.costShareChart}>
      <div className={styles.costShareDonut}>
        <EChartsView
          option={option}
          className={styles.echartsCanvas}
          style={{ height: 180 }}
          ariaLabel={t('usage_analytics.cost_share_title')}
        />
        <div className={styles.donutCenter} aria-hidden="true">
          <strong>{formatMetricValue('estimatedCost', totalCost)}</strong>
          <span>{t('usage_analytics.total_cost')}</span>
        </div>
      </div>
      <div className={styles.costShareLegend}>
        {chartRows.map((row, index) => (
          <span key={row.id}>
            <i style={{ backgroundColor: pieColors[index % pieColors.length] }} />
            <b>{row.label}</b>
            <em>{formatPercent(row.estimatedCost / totalCost)}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

const formatNullableMs = (value: number | null | undefined) =>
  value === null || value === undefined ? '-' : `${Math.round(value)}ms`;

const buildHealthChartOption = (
  timeline: UsageTimelinePoint[],
  t: ReturnType<typeof useTranslation>['t']
): HealthChartOption => ({
  animationDuration: 260,
  backgroundColor: 'transparent',
  color: ['#16a34a', '#ef4444', '#7c3aed'],
  grid: { bottom: 34, containLabel: true, left: 8, right: 58, top: 20 },
  legend: {
    bottom: 0,
    icon: 'circle',
    itemHeight: 8,
    itemWidth: 8,
    textStyle: { color: '#64748b', fontSize: 12, fontWeight: 700 },
  },
  tooltip: {
    appendToBody: true,
    axisPointer: { type: 'cross' },
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#dbe3ef',
    borderRadius: 10,
    borderWidth: 1,
    confine: true,
    extraCssText: 'box-shadow: 0 16px 36px rgba(15,23,42,0.14);',
    formatter: (params: unknown) => {
      const items = Array.isArray(params) ? params : [params];
      const first = items[0] as { dataIndex?: number } | undefined;
      const point =
        typeof first?.dataIndex === 'number' ? timeline[first.dataIndex] : undefined;
      const rows = items
        .map((item) => {
          const entry = item as { marker?: string; seriesName?: string; data?: number };
          const value =
            entry.seriesName === t('usage_analytics.metric_average_latency')
              ? formatNullableMs(Number(entry.data ?? 0))
              : formatPercent(Number(entry.data ?? 0));
          return `<div class="${styles.echartsTooltipRow}"><span>${entry.marker ?? ''}${escapeHtml(entry.seriesName)}</span><strong>${escapeHtml(value)}</strong></div>`;
        })
        .join('');
      return `<div class="${styles.echartsTooltip}"><b>${escapeHtml(point?.label)}</b>${rows}</div>`;
    },
    padding: 0,
    trigger: 'axis',
  },
  xAxis: {
    axisLabel: { color: '#64748b', fontSize: 11, fontWeight: 700, hideOverlap: true },
    axisLine: { lineStyle: { color: '#e2e8f0' } },
    axisTick: { show: false },
    data: timeline.map((point) => point.label),
    type: 'category',
  },
  yAxis: [
    {
      axisLabel: { color: '#64748b', formatter: (value: number) => `${Math.round(value * 100)}%` },
      max: 1,
      min: 0,
      splitLine: { lineStyle: { color: '#e8edf5', type: 'dashed' } },
      type: 'value',
    },
    {
      axisLabel: { color: '#7c3aed', formatter: (value: number) => `${Math.round(value)}ms` },
      position: 'right',
      scale: true,
      splitLine: { show: false },
      type: 'value',
    },
  ],
  series: [
    {
      data: timeline.map((point) => point.successRate),
      lineStyle: { width: 2.5 },
      name: t('usage_analytics.success_rate'),
      showSymbol: timeline.length <= 36,
      smooth: 0.25,
      type: 'line',
      yAxisIndex: 0,
    },
    {
      data: timeline.map((point) => point.failureRate),
      lineStyle: { width: 2.5 },
      name: t('usage_analytics.failure_rate'),
      showSymbol: timeline.length <= 36,
      smooth: 0.25,
      type: 'line',
      yAxisIndex: 0,
    },
    {
      barMaxWidth: 16,
      data: timeline.map((point) => point.averageLatencyMs ?? 0),
      name: t('usage_analytics.metric_average_latency'),
      type: 'bar',
      yAxisIndex: 1,
    },
  ],
});

function HealthTrendChart({ timeline }: { timeline: UsageTimelinePoint[] }) {
  const { t } = useTranslation();
  const option = useMemo(() => buildHealthChartOption(timeline, t), [timeline, t]);
  if (timeline.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }
  return (
    <EChartsView
      option={option}
      className={styles.echartsCanvas}
      style={{ height: 260 }}
      ariaLabel={t('usage_analytics.health_trend_title')}
    />
  );
}

const weekdayLabelKeys = [
  'usage_analytics.weekday_sun',
  'usage_analytics.weekday_mon',
  'usage_analytics.weekday_tue',
  'usage_analytics.weekday_wed',
  'usage_analytics.weekday_thu',
  'usage_analytics.weekday_fri',
  'usage_analytics.weekday_sat',
] as const;

function UsageHeatmapChart({ points }: { points: UsageHeatmapPoint[] }) {
  const { t } = useTranslation();
  const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
  const weekdays = weekdayLabelKeys.map((key) => t(key));
  const data = buildUsageHeatmapChartData(points);
  const maxValue = Math.max(1, ...data.map((point) => point[2]));
  const option: HeatmapChartOption = {
    animationDuration: 260,
    backgroundColor: 'transparent',
    grid: { bottom: 28, containLabel: true, left: 8, right: 14, top: 10 },
    tooltip: {
      appendToBody: true,
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#dbe3ef',
      borderRadius: 10,
      borderWidth: 1,
      confine: true,
      formatter: (params: unknown) => {
        const item = params as { value?: number[] };
        const [hour, weekday, calls, cost, failureRate] = item.value ?? [];
        return `<div class="${styles.echartsTooltip}"><b>${escapeHtml(
          `${weekdays[weekday] ?? ''} ${hours[hour] ?? ''}`
        )}</b><div class="${styles.echartsTooltipRow}"><span>${escapeHtml(
          t('usage_analytics.metric_request_count')
        )}</span><strong>${escapeHtml(
          compactNumber(calls ?? 0)
        )}</strong></div><div class="${styles.echartsTooltipRow}"><span>${escapeHtml(
          t('usage_analytics.metric_estimated_cost')
        )}</span><strong>${escapeHtml(
          formatMetricValue('estimatedCost', cost ?? 0)
        )}</strong></div><div class="${styles.echartsTooltipRow}"><span>${escapeHtml(
          t('usage_analytics.failure_rate')
        )}</span><strong>${escapeHtml(formatPercent(failureRate ?? 0))}</strong></div></div>`;
      },
      padding: 0,
    },
    visualMap: {
      bottom: 0,
      calculable: true,
      dimension: 2,
      inRange: { color: ['#e0f2fe', '#38bdf8', '#2563eb', '#7c3aed'] },
      left: 'center',
      max: maxValue,
      min: 0,
      orient: 'horizontal',
      textStyle: { color: '#64748b', fontSize: 11 },
    },
    xAxis: {
      axisLabel: { color: '#64748b', fontSize: 10 },
      axisTick: { show: false },
      data: hours,
      splitArea: { show: true },
      type: 'category',
    },
    yAxis: {
      axisLabel: { color: '#64748b', fontSize: 11, fontWeight: 700 },
      axisTick: { show: false },
      data: weekdays,
      splitArea: { show: true },
      type: 'category',
    },
    series: [
      {
        data,
        encode: { x: 0, y: 1, value: 2, tooltip: [2, 3, 4] },
        emphasis: { itemStyle: { borderColor: '#0f172a', borderWidth: 1 } },
        itemStyle: { borderColor: '#ffffff', borderWidth: 1 },
        label: { show: false },
        name: t('usage_analytics.heatmap_title'),
        type: 'heatmap',
      },
    ],
  };

  if (data.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }

  return (
    <EChartsView
      option={option}
      className={styles.echartsCanvas}
      style={{ height: 340 }}
      ariaLabel={t('usage_analytics.heatmap_title')}
    />
  );
}

function TokenStructureChart({ timeline }: { timeline: UsageTimelinePoint[] }) {
  const { t } = useTranslation();
  const option = useMemo<TokenStructureChartOption>(
    () => ({
      animationDuration: 260,
      backgroundColor: 'transparent',
      color: ['#2563eb', '#0ea5a7', '#8b5cf6', '#f97316'],
      grid: { bottom: 34, containLabel: true, left: 8, right: 18, top: 18 },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemHeight: 8,
        itemWidth: 8,
        textStyle: { color: '#64748b', fontSize: 12, fontWeight: 700 },
      },
      tooltip: {
        appendToBody: true,
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#dbe3ef',
        borderRadius: 10,
        borderWidth: 1,
        confine: true,
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [params];
          const first = items[0] as { dataIndex?: number } | undefined;
          const point =
            typeof first?.dataIndex === 'number' ? timeline[first.dataIndex] : undefined;
          const rows = items
            .map((item) => {
              const entry = item as { marker?: string; seriesName?: string; data?: number };
              return `<div class="${styles.echartsTooltipRow}"><span>${entry.marker ?? ''}${escapeHtml(entry.seriesName)}</span><strong>${escapeHtml(compactNumber(Number(entry.data ?? 0)))}</strong></div>`;
            })
            .join('');
          return `<div class="${styles.echartsTooltip}"><b>${escapeHtml(point?.label)}</b>${rows}</div>`;
        },
        padding: 0,
        trigger: 'axis',
      },
      xAxis: {
        axisLabel: { color: '#64748b', fontSize: 11, fontWeight: 700, hideOverlap: true },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisTick: { show: false },
        data: timeline.map((point) => point.label),
        type: 'category',
      },
      yAxis: {
        axisLabel: { color: '#64748b', formatter: compactNumber },
        splitLine: { lineStyle: { color: '#e8edf5', type: 'dashed' } },
        type: 'value',
      },
      series: [
        {
          data: timeline.map((point) => point.inputTokens),
          name: t('usage_analytics.metric_input_tokens'),
          stack: 'tokens',
          type: 'bar',
        },
        {
          data: timeline.map((point) => point.outputTokens),
          name: t('usage_analytics.metric_output_tokens'),
          stack: 'tokens',
          type: 'bar',
        },
        {
          data: timeline.map((point) => point.cachedTokens),
          name: t('usage_analytics.metric_cached_tokens'),
          stack: 'tokens',
          type: 'bar',
        },
        {
          data: timeline.map((point) => point.reasoningTokens),
          name: t('usage_analytics.metric_reasoning_tokens'),
          stack: 'tokens',
          type: 'bar',
        },
      ],
    }),
    [t, timeline]
  );

  if (timeline.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }

  return (
    <EChartsView
      option={option}
      className={styles.echartsCanvas}
      style={{ height: 260 }}
      ariaLabel={t('usage_analytics.token_structure_title')}
    />
  );
}

function EntityTrendChart({
  metric,
  series,
}: {
  metric: UsageTrendMetricKey;
  series: UsageEntityTrendSeries[];
}) {
  const { t } = useTranslation();
  const option = useMemo<EntityTrendChartOption>(
    () => ({
      animationDuration: 260,
      backgroundColor: 'transparent',
      color: series.map((item) => item.color),
      grid: { bottom: 34, containLabel: true, left: 8, right: 18, top: 18 },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemHeight: 8,
        itemWidth: 8,
        textStyle: { color: '#64748b', fontSize: 12, fontWeight: 700 },
      },
      tooltip: {
        appendToBody: true,
        axisPointer: { type: 'line' },
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#dbe3ef',
        borderRadius: 10,
        borderWidth: 1,
        confine: true,
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [params];
          const rows = items
            .map((item) => {
              const entry = item as { marker?: string; seriesName?: string; data?: number };
              return `<div class="${styles.echartsTooltipRow}"><span>${entry.marker ?? ''}${escapeHtml(entry.seriesName)}</span><strong>${escapeHtml(formatTrendMetricValue(metric, Number(entry.data ?? 0)))}</strong></div>`;
            })
            .join('');
          return `<div class="${styles.echartsTooltip}">${rows}</div>`;
        },
        padding: 0,
        trigger: 'axis',
      },
      xAxis: {
        axisLabel: { color: '#64748b', fontSize: 11, fontWeight: 700, hideOverlap: true },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisTick: { show: false },
        boundaryGap: false,
        data: series[0]?.points.map((point) => point.label) ?? [],
        type: 'category',
      },
      yAxis: {
        axisLabel: {
          color: '#64748b',
          formatter: (value: number) => formatTrendMetricValue(metric, value),
        },
        splitLine: { lineStyle: { color: '#e8edf5', type: 'dashed' } },
        type: 'value',
      },
      series: series.map((item) => ({
        data: item.points.map((point) => point.value),
        lineStyle: { color: item.color, width: 2.3 },
        name: item.label,
        showSymbol: item.points.length <= 36,
        smooth: 0.25,
        type: 'line',
      })),
    }),
    [metric, series]
  );

  if (series.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }

  return (
    <EChartsView
      option={option}
      className={styles.echartsCanvas}
      style={{ height: 260 }}
      ariaLabel={t('usage_analytics.entity_trend_title')}
    />
  );
}

function MatrixHeatmap({ matrix }: { matrix: UsageMatrix }) {
  const { t } = useTranslation();
  const cellMap = useMemo(
    () =>
      new Map(
        matrix.cells.map((cell) => [`${cell.rowLabel}\n${cell.columnLabel}`, cell] as const)
      ),
    [matrix.cells]
  );

  if (matrix.cells.length === 0) {
    return (
      <div className={styles.inlineEmpty}>
        <IconInbox size={22} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }

  return (
    <div
      className={styles.matrixHeatmap}
      style={
        {
          '--matrix-columns': matrix.columnLabels.length,
        } as CSSProperties
      }
    >
      <span className={styles.matrixCorner}>{t('usage_analytics.col_dimension')}</span>
      {matrix.columnLabels.map((label) => (
        <span key={label} className={styles.matrixAxisLabel} title={label}>
          {label}
        </span>
      ))}
      {matrix.rowLabels.map((rowLabel) => (
        <div key={rowLabel} className={styles.matrixRow}>
          <span className={styles.matrixAxisLabel} title={rowLabel}>
            {rowLabel}
          </span>
          {matrix.columnLabels.map((columnLabel) => {
            const cell = cellMap.get(`${rowLabel}\n${columnLabel}`);
            const intensity = cell ? Math.max(0.08, cell.value / matrix.maxValue) : 0;
            return (
              <span
                key={`${rowLabel}-${columnLabel}`}
                className={styles.matrixCell}
                style={{ '--matrix-intensity': `${Math.round(intensity * 42)}%` } as CSSProperties}
                title={`${rowLabel} / ${columnLabel}: ${formatMatrixMetricValue(
                  matrix.metric,
                  cell?.value ?? 0
                )}`}
              >
                {cell && cell.value > 0
                  ? formatMatrixMetricValue(matrix.metric, cell.value)
                  : '-'}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function InsightsPanel({
  insights,
  onOpen,
}: {
  insights: UsageInsight[];
  onOpen: (tab: UsageAnalyticsTab) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{t('usage_analytics.insights_title')}</h2>
          <p>{t('usage_analytics.insights_hint')}</p>
        </div>
      </div>
      {insights.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <IconCheck size={22} />
          <span>{t('usage_analytics.insights_empty')}</span>
        </div>
      ) : (
        <div className={styles.insightList}>
          {insights.map((insight) => (
            <button
              key={insight.id}
              type="button"
              className={`${styles.insightItem} ${styles[`insight${insight.tone}`]}`}
              onClick={() => insight.actionTab && onOpen(insight.actionTab)}
            >
              <span>
                <IconEye size={16} />
              </span>
              <strong>{t(insight.titleKey)}</strong>
              <em>{t(insight.bodyKey)}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewShortcutPanels({
  favoriteViews,
  recentViews,
  onClearRecent,
  onOpen,
  onToggleFavorite,
}: {
  favoriteViews: Array<{
    id: string;
    labelKey: string;
    descriptionKey: string;
    tab: UsageAnalyticsTab;
    favorite: boolean;
  }>;
  recentViews: Array<{
    id: string;
    labelKey: string;
    tab: UsageAnalyticsTab;
    viewedAtMs: number;
  }>;
  onClearRecent: () => void;
  onOpen: (tab: UsageAnalyticsTab) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const savedFavorites = favoriteViews.filter((view) => view.favorite);
  return (
    <section className={styles.shortcutGrid}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>{t('usage_analytics.favorite_views_title')}</h2>
          <IconMoreVertical size={17} />
        </div>
        <div className={styles.shortcutList}>
          {favoriteViews.map((view) => (
            <div key={view.id} className={styles.shortcutItem}>
              <button type="button" onClick={() => onOpen(view.tab)}>
                <strong>{t(view.labelKey)}</strong>
                <span>{t(view.descriptionKey)}</span>
              </button>
              <button
                type="button"
                className={view.favorite ? styles.favoriteToggleActive : styles.favoriteToggle}
                onClick={() => onToggleFavorite(view.id)}
                aria-label={t('usage_analytics.save_view')}
              >
                {view.favorite ? <IconCheck size={15} /> : <IconMoreVertical size={15} />}
              </button>
            </div>
          ))}
          {savedFavorites.length === 0 ? (
            <span className={styles.shortcutEmpty}>{t('usage_analytics.favorite_empty')}</span>
          ) : null}
        </div>
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>{t('usage_analytics.recent_views_title')}</h2>
          <button type="button" onClick={onClearRecent}>
            {t('usage_analytics.clear_recent')}
          </button>
        </div>
        <div className={styles.shortcutList}>
          {recentViews.length === 0 ? (
            <span className={styles.shortcutEmpty}>{t('usage_analytics.recent_empty')}</span>
          ) : (
            recentViews.map((view) => (
              <button
                key={view.id}
                type="button"
                className={styles.recentViewButton}
                onClick={() => onOpen(view.tab)}
              >
                <strong>{t(view.labelKey)}</strong>
                <span>
                  {t('usage_analytics.updated_at', {
                    time: formatLocalDateTime(view.viewedAtMs, i18n.language),
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function AnalysisEntryGrid({ onOpen }: { onOpen: (tab: UsageAnalyticsTab) => void }) {
  const { t } = useTranslation();
  const entries: Array<{
    tab: UsageAnalyticsTab;
    icon: ReactNode;
    titleKey: string;
    bodyKey: string;
  }> = [
    {
      tab: 'trends',
      icon: <IconChartLine size={18} />,
      titleKey: 'usage_analytics.analysis_entry_trends',
      bodyKey: 'usage_analytics.analysis_entry_trends_desc',
    },
    {
      tab: 'models',
      icon: <IconModelCluster size={18} />,
      titleKey: 'usage_analytics.analysis_entry_models',
      bodyKey: 'usage_analytics.analysis_entry_models_desc',
    },
    {
      tab: 'apiKeys',
      icon: <IconKey size={18} />,
      titleKey: 'usage_analytics.analysis_entry_api_keys',
      bodyKey: 'usage_analytics.analysis_entry_api_keys_desc',
    },
    {
      tab: 'credentials',
      icon: <IconFileText size={18} />,
      titleKey: 'usage_analytics.analysis_entry_credentials',
      bodyKey: 'usage_analytics.analysis_entry_credentials_desc',
    },
    {
      tab: 'heatmap',
      icon: <IconLayoutDashboard size={18} />,
      titleKey: 'usage_analytics.analysis_entry_heatmap',
      bodyKey: 'usage_analytics.analysis_entry_heatmap_desc',
    },
  ];

  return (
    <section className={styles.entryGrid}>
      {entries.map((entry) => (
        <button key={entry.tab} type="button" className={styles.entryCard} onClick={() => onOpen(entry.tab)}>
          <span>{entry.icon}</span>
          <strong>{t(entry.titleKey)}</strong>
          <em>{t(entry.bodyKey)}</em>
        </button>
      ))}
    </section>
  );
}

function KeyAnomalyTable({
  locale,
  rows,
}: {
  locale: string;
  rows: UsageKeyAnomalyRow[];
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.tableWrap}>
      <table className={styles.compactTable}>
        <thead>
          <tr>
            <th>{t('usage_analytics.col_api_key')}</th>
            <th>{t('usage_analytics.col_reason')}</th>
            <th>{t('usage_analytics.col_severity')}</th>
            <th>{t('usage_analytics.col_triggered_at')}</th>
            <th>{t('usage_analytics.metric_estimated_cost')}</th>
            <th>{t('usage_analytics.failure_rate')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>{t('usage_analytics.anomaly_none')}</td>
            </tr>
          ) : (
            rows.slice(0, 8).map((row) => (
              <tr key={row.id}>
                <td>{maskApiKeyHash(row.row.apiKeyHash || row.id)}</td>
                <td>{t(row.reasonKey)}</td>
                <td>
                  <span className={`${styles.severityBadge} ${styles[`severity${row.severity}`]}`}>
                    {t(`usage_analytics.severity_${row.severity}`)}
                  </span>
                </td>
                <td>
                  {row.triggeredAtMs ? formatLocalDateTime(row.triggeredAtMs, locale) : '-'}
                </td>
                <td>{formatMetricValue('estimatedCost', row.row.estimatedCost)}</td>
                <td>{formatPercent(row.row.failureCount / Math.max(row.row.requestCount, 1))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CredentialQuotaTable({
  locale,
  rows,
}: {
  locale: string;
  rows: UsageCredentialQuotaRow[];
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.tableWrap}>
      <table className={styles.compactTable}>
        <thead>
          <tr>
            <th>{t('usage_analytics.col_credential')}</th>
            <th>{t('usage_analytics.col_plan')}</th>
            <th>{t('usage_analytics.col_status')}</th>
            <th>{t('usage_analytics.col_used_quota')}</th>
            <th>{t('usage_analytics.col_remaining_quota')}</th>
            <th>{t('usage_analytics.col_reset_at')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>{t('usage_analytics.empty_title')}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                <td>{row.plan}</td>
                <td>
                  <span className={`${styles.quotaStatus} ${styles[`quota${row.status}`]}`}>
                    {t(`usage_analytics.quota_status_${row.status}`)}
                  </span>
                </td>
                <td>
                  <span className={styles.quotaMeter}>
                    <i style={{ width: `${Math.min(100, row.usedRate * 100)}%` }} />
                    <b>{formatQuotaValue(row.used)}</b>
                  </span>
                </td>
                <td>{formatQuotaValue(row.remaining)}</td>
                <td>{formatLocalDateTime(row.resetAtMs, locale)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ProviderHealthPanel({ rows }: { rows: UsageProviderRow[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.providerList}>
      {rows.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <IconInbox size={22} />
          <span>{t('usage_analytics.empty_title')}</span>
        </div>
      ) : (
        rows.slice(0, 6).map((row) => (
          <div key={row.id} className={styles.providerItem}>
            <div>
              <strong>{row.label}</strong>
              <span>{compactNumber(row.requestCount)} · {formatMetricValue('estimatedCost', row.estimatedCost)}</span>
            </div>
            <span className={styles.providerMeter}>
              <i style={{ width: `${Math.min(100, row.successRate * 100)}%` }} />
              <b>{formatPercent(row.successRate)}</b>
            </span>
            <span className={styles.providerMeter}>
              <i style={{ width: `${Math.min(100, row.cacheRate * 100)}%` }} />
              <b>{formatPercent(row.cacheRate)}</b>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function ProviderSharePanel({ rows }: { rows: UsageProviderRow[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.providerShareList}>
      {rows.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <IconInbox size={22} />
          <span>{t('usage_analytics.empty_title')}</span>
        </div>
      ) : (
        rows.slice(0, 6).map((row, index) => (
          <span key={row.id}>
            <i style={{ backgroundColor: pieColors[index % pieColors.length] }} />
            <b>{row.label}</b>
            <em>{formatPercent(row.share)}</em>
          </span>
        ))
      )}
    </div>
  );
}

function HotCombinationsPanel({ matrix }: { matrix: UsageMatrix }) {
  const { t } = useTranslation();
  const rows = [...matrix.cells].sort((left, right) => right.value - left.value).slice(0, 8);
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>{t('usage_analytics.hot_combinations_title')}</h2>
      </div>
      <div className={styles.hotCombinationList}>
        {rows.length === 0 ? (
          <span className={styles.shortcutEmpty}>{t('usage_analytics.empty_title')}</span>
        ) : (
          rows.map((row) => (
            <div key={`${row.rowLabel}-${row.columnLabel}`}>
              <span>
                <strong>{row.rowLabel}</strong>
                <em>{row.columnLabel}</em>
              </span>
              <b>{formatMatrixMetricValue(matrix.metric, row.value)}</b>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.emptyState}>
      <IconInbox size={28} />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function UsageAnalyticsPageInner() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const usage = useUsageAnalytics();
  const [selectedMetrics, setSelectedMetrics] = useState<UsageMetricKey[]>(DEFAULT_SELECTED_METRICS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customStartInput, setCustomStartInput] = useState(() =>
    formatDateTimeLocalValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  );
  const [customEndInput, setCustomEndInput] = useState(() => formatDateTimeLocalValue(new Date()));
  const [stableOptionCache, setStableOptionCache] = useState<StableUsageOptionCache>(() =>
    emptyStableOptionCache()
  );
  const allOptionLabel = t('usage_analytics.all');

  const incomingOptionCache = useMemo<StableUsageOptionCache>(() => {
    const apiKeys = mergeSelectOptions([
      ...(usage.filterOptions?.api_key_stats ?? []).map((row) => {
        const hash = row.api_key_hash || row.id;
        return { value: hash, label: maskApiKeyHash(hash) };
      }),
      ...usage.apiKeyRows.map((row) => {
        const hash = row.apiKeyHash || row.id;
        return { value: hash, label: row.label };
      }),
    ]);

    return {
      models: buildOptionValues([
        ...(usage.filterOptions?.model_stats ?? []).map((row) => row.model),
        ...usage.modelRows.map((row) => row.model || row.label),
      ]),
      providers: buildOptionValues([
        ...(usage.filterOptions?.providers ?? []),
        ...usage.modelRows.map((row) => row.provider),
        ...usage.apiKeyRows.map((row) => row.provider),
        ...usage.credentialRows.map((row) => row.provider),
      ]),
      authFiles: buildOptionValues([
        ...(usage.filterOptions?.auth_files ?? []),
        ...usage.credentialRows.map((row) => row.authFile),
      ]),
      projectIds: buildOptionValues([
        ...(usage.filterOptions?.project_ids ?? []),
        ...usage.credentialRows.map((row) => row.projectId),
      ]),
      requestTypes: buildOptionValues(usage.filterOptions?.request_types ?? []),
      apiKeys,
    };
  }, [
    usage.apiKeyRows,
    usage.credentialRows,
    usage.filterOptions?.api_key_stats,
    usage.filterOptions?.auth_files,
    usage.filterOptions?.model_stats,
    usage.filterOptions?.project_ids,
    usage.filterOptions?.providers,
    usage.filterOptions?.request_types,
    usage.modelRows,
  ]);

  const displayOptionCache = useMemo(
    () => mergeStableOptionCache(stableOptionCache, incomingOptionCache),
    [incomingOptionCache, stableOptionCache]
  );

  const rememberVisibleOptions = () => {
    setStableOptionCache((current) => {
      const next = mergeStableOptionCache(current, incomingOptionCache);
      return stableOptionCachesEqual(current, next) ? current : next;
    });
  };

  const updateFilters = (patch: Partial<typeof usage.filters>) => {
    rememberVisibleOptions();
    usage.setFilters(patch);
  };

  const modelOptions = useMemo<SelectOption[]>(
    () =>
      buildStableSelectOptions(
        allOptionLabel,
        displayOptionCache.models,
        usage.filters.model
      ),
    [allOptionLabel, displayOptionCache.models, usage.filters.model]
  );
  const apiKeyOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: allOptionLabel },
      ...mergeSelectOptions(
        [
          ...displayOptionCache.apiKeys,
          usage.filters.apiKeyHash !== 'all'
            ? {
                value: usage.filters.apiKeyHash,
                label: maskApiKeyHash(usage.filters.apiKeyHash),
              }
            : null,
        ].filter((option): option is SelectOption => Boolean(option?.value))
      ),
    ],
    [allOptionLabel, displayOptionCache.apiKeys, usage.filters.apiKeyHash]
  );
  const providerOptions = useMemo<SelectOption[]>(
    () =>
      buildStableSelectOptions(
        allOptionLabel,
        displayOptionCache.providers,
        usage.filters.provider
      ),
    [allOptionLabel, displayOptionCache.providers, usage.filters.provider]
  );
  const authFileOptions = useMemo<SelectOption[]>(
    () =>
      buildStableSelectOptions(
        allOptionLabel,
        displayOptionCache.authFiles,
        usage.filters.authFile
      ),
    [allOptionLabel, displayOptionCache.authFiles, usage.filters.authFile]
  );
  const projectOptions = useMemo<SelectOption[]>(
    () =>
      buildStableSelectOptions(
        allOptionLabel,
        displayOptionCache.projectIds,
        usage.filters.projectId
      ),
    [allOptionLabel, displayOptionCache.projectIds, usage.filters.projectId]
  );
  const requestTypeOptions = useMemo<SelectOption[]>(
    () =>
      buildStableSelectOptions(
        allOptionLabel,
        displayOptionCache.requestTypes,
        usage.filters.requestType
      ),
    [allOptionLabel, displayOptionCache.requestTypes, usage.filters.requestType]
  );
  const statusOptions: SelectOption[] = [
    { value: 'all', label: t('usage_analytics.status_all') },
    { value: 'success', label: t('usage_analytics.status_success') },
    { value: 'failed', label: t('usage_analytics.status_failed') },
  ];
  const trendMetricSelectOptions: SelectOption[] = trendMetricOptions.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }));
  const matrixDimensionOptions: SelectOption[] = USAGE_MATRIX_DIMENSIONS.map((dimension) => ({
    value: dimension,
    label: t(`usage_analytics.matrix_dimension_${dimension}`),
  }));
  const matrixMetricOptions: SelectOption[] = USAGE_MATRIX_METRICS.map((metric) => ({
    value: metric,
    label: t(`usage_analytics.matrix_metric_${metric}`),
  }));
  const shortcutSelectOptions: SelectOption[] = usage.favoriteViews.map((view) => ({
    value: view.id,
    label: t(view.labelKey),
  }));

  const noData = !usage.loading && !usage.error && !hasUsageData(usage.summary, usage.timeline);
  const visibleModelRows = usage.modelRows.slice(0, 8);
  const visibleApiKeyRows = usage.apiKeyRows.slice(0, 8);
  const visibleCredentialRows = usage.credentialRows.slice(0, 8);
  const abnormalApiKeyCount = usage.apiKeyRows.filter(
    (row) => row.failureCount > 0 || row.share > 0.3
  ).length;
  const abnormalCredentialCount = usage.credentialRows.filter(
    (row) => row.failureCount > 0 || row.share > 0.3
  ).length;
  const anomalyUrl = usage.anomalyAnalysis
    ? buildMonitoringDetailUrl(usage.anomalyAnalysis.point, usage.filters)
    : '';

  const toggleMetric = (key: UsageMetricKey) => {
    setSelectedMetrics((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const applyCustomRange = () => {
    const startMs = parseDateTimeLocalValue(customStartInput);
    const endMs = parseDateTimeLocalValue(customEndInput);
    if (startMs === null || endMs === null || startMs >= endMs) return;
    updateFilters({
      timeRange: 'custom',
      customRange: { startMs, endMs },
    });
  };

  const openShortcutView = (id: string) => {
    const view = usage.favoriteViews.find((item) => item.id === id);
    if (view) usage.setActiveTab(view.tab);
  };

  const exportUsageAnalytics = () => {
    const sanitizeApiKeyValue = (value: string | null | undefined) => {
      const normalized = String(value ?? '').trim();
      return normalized && normalized !== 'all' ? maskApiKeyHash(normalized) : normalized || 'all';
    };
    const sanitizeFilters = (filters: typeof usage.filters) => ({
      ...filters,
      apiKeyHash: sanitizeApiKeyValue(filters.apiKeyHash),
    });
    const sanitizeRows = (rows: UsageRankRow[]) =>
      rows.map((row) => ({
        ...row,
        id: row.apiKeyHash ? row.label : row.id,
        apiKeyHash: row.apiKeyHash ? row.label : row.apiKeyHash,
      }));
    const payload = {
      exportedAt: new Date().toISOString(),
      activeTab: usage.activeTab,
      filters: sanitizeFilters(usage.filters),
      bounds: usage.bounds,
      resolvedGranularity: usage.resolvedGranularity,
      summary: usage.summary,
      timeline: usage.timeline,
      modelRows: usage.modelRows,
      apiKeyRows: sanitizeRows(usage.apiKeyRows),
      credentialRows: usage.credentialRows,
      providerRows: usage.providerRows,
      matrix: usage.matrix,
      keyAnomalies: usage.keyAnomalies.map((row) => ({
        ...row,
        id: row.label,
        row: {
          ...row.row,
          id: row.label,
          apiKeyHash: row.label,
        },
      })),
      credentialQuotaRows: usage.credentialQuotaRows,
      drilldownPreview: usage.drilldownPreview.map((row) => ({
        ...row,
        apiKeyHash: maskApiKeyHash(row.apiKeyHash),
      })),
    };
    downloadBlob({
      filename: buildUsageExportFilename(usage.activeTab),
      blob: new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    });
  };

  return (
    <div className={styles.page}>
      <section className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span>
            <IconLayoutDashboard size={16} />
            {t('usage_analytics.title')}
          </span>
          <h1>{t('usage_analytics.title')}</h1>
          <p>{t('usage_analytics.subtitle')}</p>
          <em>
            {usage.lastRefreshedAt
              ? t('usage_analytics.updated_at', {
                  time: usage.lastRefreshedAt.toLocaleTimeString(i18n.language),
                })
              : t('usage_analytics.awaiting_refresh')}
          </em>
        </div>
        <div className={styles.headerActions}>
          <Select
            value=""
            options={shortcutSelectOptions}
            onChange={openShortcutView}
            placeholder={t('usage_analytics.favorite_view')}
            ariaLabel={t('usage_analytics.favorite_view')}
            triggerClassName={styles.headerSelectTrigger}
          />
          <Button variant="secondary" size="sm" onClick={usage.refresh} loading={usage.loading}>
            <IconRefreshCw size={15} />
            {t('common.refresh')}
          </Button>
          <Button size="sm" onClick={exportUsageAnalytics}>
            <IconDownload size={15} />
            {t('usage_analytics.export')}
          </Button>
        </div>
      </section>

      <nav className={styles.tabs} aria-label={t('usage_analytics.tabs_label')}>
        {USAGE_ANALYTICS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={usage.activeTab === tab ? styles.activeTab : ''}
            onClick={() => usage.setActiveTab(tab)}
          >
            {t(`usage_analytics.tab_${tab}`)}
          </button>
        ))}
      </nav>

      <section className={styles.filterPanel}>
        <div className={styles.controlBar}>
          <div
            className={styles.segmentedControl}
            aria-label={t('usage_analytics.filter_time_range')}
          >
            {USAGE_TIME_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                className={`${styles.segmentButton} ${
                  usage.filters.timeRange === range ? styles.segmentButtonActive : ''
                }`}
                onClick={() => updateFilters({ timeRange: range })}
              >
                {t(`usage_analytics.range_${range}`)}
              </button>
            ))}
          </div>

          <div
            className={styles.segmentedControl}
            aria-label={t('usage_analytics.filter_granularity')}
          >
            {(['auto', 'hour', 'day'] as UsageAnalyticsGranularity[]).map((granularity) => (
              <button
                key={granularity}
                type="button"
                className={`${styles.segmentButton} ${
                  usage.filters.granularity === granularity ? styles.segmentButtonActive : ''
                }`}
                onClick={() => updateFilters({ granularity })}
              >
                {t(`usage_analytics.granularity_${granularity}`)}
              </button>
            ))}
          </div>

          <div className={styles.refreshControls}>
            <span className={styles.filterMeta}>
              {t('usage_analytics.resolved_granularity', {
                granularity: usage.resolvedGranularity,
              })}
            </span>
            <button
              type="button"
              className={styles.filterActionButton}
              onClick={usage.resetFilters}
            >
              {t('usage_analytics.clear_all')}
            </button>
            <button
              type="button"
              className={styles.filterActionButton}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {advancedOpen
                ? t('usage_analytics.hide_advanced_filters')
                : t('usage_analytics.show_advanced_filters')}
            </button>
            <Button variant="secondary" size="sm" onClick={usage.refresh} loading={usage.loading}>
              <IconRefreshCw size={15} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>

        <div className={styles.filterBar}>
          <div className={styles.filterGrid}>
            <Select
              value={usage.filters.model}
              options={modelOptions}
              onChange={(model) => updateFilters({ model })}
              ariaLabel={t('usage_analytics.filter_model')}
              triggerClassName={styles.filterSelectTrigger}
            />
            <Select
              value={usage.filters.apiKeyHash}
              options={apiKeyOptions}
              onChange={(apiKeyHash) => updateFilters({ apiKeyHash })}
              ariaLabel={t('usage_analytics.filter_api_key')}
              triggerClassName={styles.filterSelectTrigger}
            />
            <Select
              value={usage.filters.provider}
              options={providerOptions}
              onChange={(provider) => updateFilters({ provider })}
              ariaLabel={t('usage_analytics.filter_provider')}
              triggerClassName={styles.filterSelectTrigger}
            />
            <Select
              value={usage.filters.status}
              options={statusOptions}
              onChange={(status) =>
                updateFilters({ status: status as UsageAnalyticsStatus })
              }
              ariaLabel={t('usage_analytics.filter_status')}
              triggerClassName={styles.filterSelectTrigger}
            />
          </div>
        </div>

        {usage.filters.timeRange === 'custom' ? (
          <div className={styles.customRangeRow}>
            <input
              type="datetime-local"
              value={customStartInput}
              onChange={(event) => setCustomStartInput(event.target.value)}
              aria-label={t('usage_analytics.custom_start')}
            />
            <input
              type="datetime-local"
              value={customEndInput}
              onChange={(event) => setCustomEndInput(event.target.value)}
              aria-label={t('usage_analytics.custom_end')}
            />
            <Button variant="secondary" size="sm" onClick={applyCustomRange}>
              {t('usage_analytics.apply_custom_range')}
            </Button>
          </div>
        ) : null}

        {advancedOpen ? (
          <div className={styles.advancedPanel}>
            <div className={styles.advancedGrid}>
              <label className={styles.filterGroup}>
                <span>{t('usage_analytics.filter_auth_file')}</span>
                <Select
                  value={usage.filters.authFile}
                  options={authFileOptions}
                  onChange={(authFile) => updateFilters({ authFile })}
                  ariaLabel={t('usage_analytics.filter_auth_file')}
                />
              </label>
              <label className={styles.filterGroup}>
                <span>{t('usage_analytics.filter_request_type')}</span>
                <Select
                  value={usage.filters.requestType}
                  options={requestTypeOptions}
                  onChange={(requestType) => updateFilters({ requestType })}
                  ariaLabel={t('usage_analytics.filter_request_type')}
                />
              </label>
              <label className={styles.filterGroup}>
                <span>{t('usage_analytics.filter_project_team')}</span>
                <Select
                  value={usage.filters.projectId}
                  options={projectOptions}
                  onChange={(projectId) => updateFilters({ projectId })}
                  ariaLabel={t('usage_analytics.filter_project_team')}
                />
              </label>
            </div>
          </div>
        ) : null}
      </section>

      {usage.error ? (
        <section className={styles.alertPanel}>
          <IconShield size={22} />
          <div>
            <strong>{t('usage_analytics.error_title')}</strong>
            <span>{usage.error}</span>
          </div>
        </section>
      ) : null}

      {noData ? (
        <EmptyState
          title={t('usage_analytics.empty_title')}
          body={t('usage_analytics.empty_body')}
        />
      ) : null}

      {usage.activeTab === 'overview' ? (
        <>
          <section className={styles.summaryGrid}>
            {overviewSummaryCards.map((card) => (
              <div key={card.key} className={`${styles.summaryCard} ${styles[card.accent]}`}>
                <span className={styles.summaryIcon}>{card.icon}</span>
                <span>{getMetricLabel(card.key, t)}</span>
                <strong>{formatMetricValue(card.key, usage.summary[card.key])}</strong>
                <em>
                  {card.key === 'estimatedCost'
                    ? t('usage_analytics.summary_cost_meta')
                    : t('usage_analytics.summary_meta')}
                </em>
              </div>
            ))}
            <AnalysisStat
              icon={<IconShield size={20} />}
              label={t('usage_analytics.success_rate')}
              value={formatPercent(usage.summary.successRate)}
            />
            <AnalysisStat
              icon={<IconModelCluster size={20} />}
              label={t('usage_analytics.active_models')}
              value={compactNumber(usage.modelRows.length)}
            />
          </section>

          <AnalysisEntryGrid onOpen={usage.setActiveTab} />

          <ViewShortcutPanels
            favoriteViews={usage.favoriteViews}
            recentViews={usage.recentViews}
            onClearRecent={usage.clearRecentViews}
            onOpen={usage.setActiveTab}
            onToggleFavorite={usage.toggleFavoriteView}
          />

          <section className={styles.overviewHeroGrid}>
            <div className={styles.chartPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.overview_trend_title')}</h2>
                  <p>{t('usage_analytics.overview_trend_hint')}</p>
                </div>
              </div>
              <UsageLineChart
                timeline={usage.timeline}
                selectedMetrics={DEFAULT_SELECTED_METRICS}
                selectedBucket={usage.selectedBucket}
                onSelectBucket={usage.selectBucket}
                compact
              />
            </div>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.health_trend_title')}</h2>
                </div>
              </div>
              <HealthTrendChart timeline={usage.timeline} />
            </div>
          </section>

          <section className={styles.overviewCards}>
            <OverviewCard
              title={t('usage_analytics.model_overview_title')}
              rows={usage.modelRows.slice(0, 3)}
              onViewAll={() => usage.setActiveTab('models')}
            />
            <OverviewCard
              title={t('usage_analytics.api_key_overview_title')}
              rows={usage.apiKeyRows.slice(0, 3)}
              onViewAll={() => usage.setActiveTab('apiKeys')}
            />
            <OverviewCard
              title={t('usage_analytics.credential_overview_title')}
              rows={usage.credentialRows.slice(0, 3)}
              onViewAll={() => usage.setActiveTab('credentials')}
            />
          </section>

          <section className={styles.analysisGrid}>
            <AnomalyPointsPanel
              rows={usage.anomalyPoints}
              onOpen={(row) => navigate(buildMonitoringDetailUrl(row, usage.filters))}
            />
            <InsightsPanel insights={usage.insights} onOpen={usage.setActiveTab} />
          </section>

          <DrilldownPreviewPanel rows={usage.drilldownPreview} locale={i18n.language} />
        </>
      ) : null}

      {usage.activeTab === 'trends' ? (
        <>
          <section className={styles.summaryGrid}>
            {summaryCards.map((card) => (
              <div key={card.key} className={`${styles.summaryCard} ${styles[card.accent]}`}>
                <span className={styles.summaryIcon}>{card.icon}</span>
                <span>{getMetricLabel(card.key, t)}</span>
                <strong>{formatMetricValue(card.key, usage.summary[card.key])}</strong>
                <em>
                  {card.key === 'estimatedCost'
                    ? t('usage_analytics.summary_cost_meta')
                    : t('usage_analytics.summary_meta')}
                </em>
              </div>
            ))}
          </section>

          <section className={styles.chartPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{t('usage_analytics.trend_title')}</h2>
                <p>{t('usage_analytics.trend_hint')}</p>
              </div>
            </div>
            <div className={styles.metricChips}>
              {USAGE_METRICS.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  className={selectedMetrics.includes(metric.key) ? styles.metricChipActive : ''}
                  style={{ '--metric-color': metric.color } as CSSProperties}
                  onClick={() => toggleMetric(metric.key)}
                >
                  <span />
                  {t(metric.labelKey)}
                </button>
              ))}
            </div>
            <div className={styles.chartCanvas}>
              <UsageLineChart
                timeline={usage.timeline}
                selectedMetrics={selectedMetrics}
                selectedBucket={usage.selectedBucket}
                onSelectBucket={usage.selectBucket}
              />
            </div>
          </section>

          <section className={styles.dualChartGrid}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.health_trend_title')}</h2>
                </div>
              </div>
              <HealthTrendChart timeline={usage.timeline} />
            </div>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.token_structure_title')}</h2>
                  <p>{t('usage_analytics.token_structure_hint')}</p>
                </div>
              </div>
              <TokenStructureChart timeline={usage.timeline} />
            </div>
          </section>

          <section className={styles.analysisSummaryGrid}>
            <AnalysisStat
              icon={<IconShield size={20} />}
              label={t('usage_analytics.success_rate')}
              value={formatPercent(usage.summary.successRate)}
            />
            <AnalysisStat
              icon={<IconShield size={20} />}
              label={t('usage_analytics.metric_failure_count')}
              value={compactNumber(usage.summary.failureCount)}
            />
            <AnalysisStat
              icon={<IconTimer size={20} />}
              label={t('usage_analytics.metric_p95_latency')}
              value={formatNullableMs(usage.summary.p95LatencyMs)}
            />
            <AnalysisStat
              icon={<IconTimer size={20} />}
              label={t('usage_analytics.metric_p95_ttft')}
              value={formatNullableMs(usage.summary.p95TtftMs)}
            />
            <AnalysisStat
              icon={<IconDatabaseZap size={20} />}
              label={t('usage_analytics.metric_cached_tokens')}
              value={formatMetricValue('cachedTokens', usage.summary.cachedTokens)}
            />
          </section>

          <section className={styles.dualChartGrid}>
            <AnomalyPointsPanel
              rows={usage.anomalyPoints}
              onOpen={(row) => navigate(buildMonitoringDetailUrl(row, usage.filters))}
            />
            <div className={styles.tablePanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.abnormal_time_points_title')}</h2>
                  <p>{t('usage_analytics.api_key_warning_title')}</p>
                </div>
              </div>
              <KeyAnomalyTable rows={usage.keyAnomalies} locale={i18n.language} />
            </div>
          </section>

          {usage.anomalyAnalysis ? (
            <section className={styles.anomalyPanel}>
              <div className={styles.anomalyMain}>
                <IconTrendingUp size={32} />
                <div>
                  <h2>{t('usage_analytics.anomaly_title')}</h2>
                  <p>
                    {formatLocalDateTime(usage.anomalyAnalysis.point.bucketMs, i18n.language)}
                  </p>
                  <div className={styles.anomalyTags}>
                    {usage.anomalyAnalysis.anomalies.length > 0 ? (
                      usage.anomalyAnalysis.anomalies.map((item) => (
                        <span key={item.key}>{t(item.labelKey)}</span>
                      ))
                    ) : (
                      <span>{t('usage_analytics.anomaly_none')}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className={styles.anomalyMetrics}>
                {(['requestCount', 'totalTokens', 'estimatedCost'] as UsageMetricKey[]).map(
                  (key) => (
                    <div key={key}>
                      <span>{getMetricLabel(key, t)}</span>
                      <strong>{formatMetricValue(key, usage.anomalyAnalysis!.point[key])}</strong>
                      <em>{formatDelta(usage.anomalyAnalysis!.changes[key])}</em>
                    </div>
                  )
                )}
              </div>
              <div className={styles.possibleCauses}>
                <h3>{t('usage_analytics.possible_causes')}</h3>
                <ul>
                  {usage.anomalyAnalysis.causeKeys.map((causeKey) => (
                    <li key={causeKey}>{t(causeKey)}</li>
                  ))}
                </ul>
              </div>
              <Button onClick={() => navigate(anomalyUrl)}>
                {t('usage_analytics.view_monitoring_details')}
              </Button>
            </section>
          ) : null}

          <DrilldownPreviewPanel rows={usage.drilldownPreview} locale={i18n.language} />

          <section className={styles.overviewCards}>
            <OverviewCard
              title={t('usage_analytics.model_overview_title')}
              rows={usage.modelRows.slice(0, 3)}
              onViewAll={() => usage.setActiveTab('models')}
            />
            <OverviewCard
              title={t('usage_analytics.api_key_overview_title')}
              rows={usage.apiKeyRows.slice(0, 3)}
              onViewAll={() => usage.setActiveTab('apiKeys')}
            />
          </section>
        </>
      ) : null}

      {usage.activeTab === 'models' ? (
        <>
          <section className={styles.analysisSummaryGrid}>
            <AnalysisStat
              icon={<IconModelCluster size={20} />}
              label={t('usage_analytics.active_models')}
              value={compactNumber(usage.modelRows.length)}
            />
            <AnalysisStat
              icon={<IconDatabaseZap size={20} />}
              label={t('usage_analytics.metric_total_tokens')}
              value={formatMetricValue('totalTokens', usage.summary.totalTokens)}
            />
            <AnalysisStat
              icon={<IconDollarSign size={20} />}
              label={t('usage_analytics.total_cost')}
              value={formatMetricValue('estimatedCost', usage.summary.estimatedCost)}
            />
            <AnalysisStat
              icon={<IconChartLine size={20} />}
              label={t('usage_analytics.metric_request_count')}
              value={formatMetricValue('requestCount', usage.summary.requestCount)}
            />
            <AnalysisStat
              icon={<IconDollarSign size={20} />}
              label={t('usage_analytics.metric_average_cost_per_call')}
              value={formatMetricValue('estimatedCost', usage.summary.averageCostPerCall)}
            />
          </section>
          <section className={styles.analysisGrid}>
            <div className={styles.tablePanel}>
              <div className={styles.panelHeader}>
                <h2>{t('usage_analytics.model_rank_title')}</h2>
              </div>
              <RankTable
                rows={visibleModelRows}
                type="model"
                selectedId={usage.selectedModel?.id}
                onSelect={(row) => usage.setSelectedModelId(row.id)}
              />
            </div>
            <div className={styles.sidePanels}>
              <div className={styles.panel}>
                <h2>{t('usage_analytics.cost_share_title')}</h2>
                <CostShareChart rows={usage.modelRows} />
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>{t('usage_analytics.model_compare_title')}</h2>
                    <p>{t('usage_analytics.entity_trend_hint')}</p>
                  </div>
                  <Select
                    value={usage.trendMetric}
                    options={trendMetricSelectOptions}
                    onChange={(value) => usage.setTrendMetric(value as UsageTrendMetricKey)}
                    ariaLabel={t('usage_analytics.filter_metric')}
                    triggerClassName={styles.compactSelectTrigger}
                  />
                </div>
                <EntityTrendChart
                  series={usage.modelTrendSeries}
                  metric={usage.trendMetric}
                />
              </div>
            </div>
            {usage.selectedModel ? <DetailPanel row={usage.selectedModel} type="model" /> : null}
            <InsightsPanel insights={usage.insights} onOpen={usage.setActiveTab} />
          </section>
        </>
      ) : null}

      {usage.activeTab === 'apiKeys' ? (
        <>
          <section className={styles.analysisSummaryGrid}>
            <AnalysisStat
              icon={<IconKey size={20} />}
              label={t('usage_analytics.active_api_keys')}
              value={compactNumber(usage.apiKeyRows.length)}
            />
            <AnalysisStat
              icon={<IconChartLine size={20} />}
              label={t('usage_analytics.metric_request_count')}
              value={formatMetricValue('requestCount', usage.summary.requestCount)}
            />
            <AnalysisStat
              icon={<IconDatabaseZap size={20} />}
              label={t('usage_analytics.metric_total_tokens')}
              value={formatMetricValue('totalTokens', usage.summary.totalTokens)}
            />
            <AnalysisStat
              icon={<IconDollarSign size={20} />}
              label={t('usage_analytics.metric_estimated_cost')}
              value={formatMetricValue('estimatedCost', usage.summary.estimatedCost)}
            />
            <AnalysisStat
              icon={<IconShield size={20} />}
              label={t('usage_analytics.anomaly_keys')}
              value={compactNumber(abnormalApiKeyCount)}
            />
          </section>
          <section className={styles.analysisGrid}>
            <div className={styles.apiSearchBar}>
              <IconSearch size={16} />
              <input
                value={usage.filters.apiKeyKeyword}
                onChange={(event) => updateFilters({ apiKeyKeyword: event.target.value })}
                placeholder={t('usage_analytics.api_key_keyword_placeholder')}
              />
            </div>
            <div className={styles.tablePanel}>
              <div className={styles.panelHeader}>
                <h2>{t('usage_analytics.api_key_rank_title')}</h2>
              </div>
              <RankTable
                rows={visibleApiKeyRows}
                type="apiKey"
                selectedId={usage.selectedApiKey?.apiKeyHash}
                onSelect={(row) => usage.setSelectedApiKeyHash(row.apiKeyHash || row.id)}
              />
            </div>
            <div className={styles.warningPanel}>
              <div className={styles.panelHeader}>
                <h2>{t('usage_analytics.api_key_warning_title')}</h2>
                <button type="button" onClick={() => usage.setActiveTab('heatmap')}>
                  {t('usage_analytics.view_exception_combinations')}
                </button>
              </div>
              <KeyAnomalyTable rows={usage.keyAnomalies} locale={i18n.language} />
            </div>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.entity_trend_title')}</h2>
                  <p>{t('usage_analytics.entity_trend_hint')}</p>
                </div>
                <Select
                  value={usage.trendMetric}
                  options={trendMetricSelectOptions}
                  onChange={(value) => usage.setTrendMetric(value as UsageTrendMetricKey)}
                  ariaLabel={t('usage_analytics.filter_metric')}
                  triggerClassName={styles.compactSelectTrigger}
                />
              </div>
              <EntityTrendChart series={usage.apiKeyTrendSeries} metric={usage.trendMetric} />
            </div>
            {usage.selectedApiKey ? (
              <DetailPanel
                row={usage.selectedApiKey}
                type="apiKey"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      navigate(
                        `/monitoring?api_key_hash=${encodeURIComponent(
                          usage.selectedApiKey?.apiKeyHash || ''
                        )}`
                      )
                    }
                  >
                    <IconExternalLink size={14} />
                    {t('usage_analytics.view_request_details')}
                  </Button>
                }
              />
            ) : null}
          </section>
        </>
      ) : null}

      {usage.activeTab === 'credentials' ? (
        <>
          <section className={styles.analysisSummaryGrid}>
            <AnalysisStat
              icon={<IconFileText size={20} />}
              label={t('usage_analytics.active_credentials')}
              value={compactNumber(usage.credentialRows.length)}
            />
            <AnalysisStat
              icon={<IconChartLine size={20} />}
              label={t('usage_analytics.metric_request_count')}
              value={formatMetricValue('requestCount', usage.summary.requestCount)}
            />
            <AnalysisStat
              icon={<IconDatabaseZap size={20} />}
              label={t('usage_analytics.metric_total_tokens')}
              value={formatMetricValue('totalTokens', usage.summary.totalTokens)}
            />
            <AnalysisStat
              icon={<IconDollarSign size={20} />}
              label={t('usage_analytics.metric_estimated_cost')}
              value={formatMetricValue('estimatedCost', usage.summary.estimatedCost)}
            />
            <AnalysisStat
              icon={<IconShield size={20} />}
              label={t('usage_analytics.anomaly_credentials')}
              value={compactNumber(abnormalCredentialCount)}
            />
          </section>
          <section className={styles.analysisGrid}>
            <div className={styles.tablePanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.credential_rank_title')}</h2>
                  <p>
                    {t('usage_analytics.active_credential_hint', {
                      active: usage.credentialRows.length,
                      total: usage.allCredentialRows.length,
                    })}
                  </p>
                </div>
                <label className={styles.toggleControl}>
                  <input
                    type="checkbox"
                    checked={usage.activeCredentialsOnly}
                    onChange={(event) => usage.setActiveCredentialsOnly(event.target.checked)}
                  />
                  <span>{t('usage_analytics.active_only')}</span>
                </label>
              </div>
              <RankTable
                rows={visibleCredentialRows}
                type="credential"
                selectedId={usage.selectedCredential?.id}
                onSelect={(row) => usage.setSelectedCredentialId(row.id)}
              />
            </div>
            <div className={styles.sidePanels}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2>{t('usage_analytics.provider_usage_share_title')}</h2>
                </div>
                <ProviderSharePanel rows={usage.providerRows} />
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2>{t('usage_analytics.provider_health_title')}</h2>
                </div>
                <ProviderHealthPanel rows={usage.providerRows} />
              </div>
            </div>
            {usage.selectedCredential ? (
              <DetailPanel
                row={usage.selectedCredential}
                type="credential"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      navigate(
                        `/monitoring?auth_file=${encodeURIComponent(
                          usage.selectedCredential?.authFile || ''
                        )}&project_id=${encodeURIComponent(
                          usage.selectedCredential?.projectId || ''
                        )}`
                      )
                    }
                  >
                    <IconExternalLink size={14} />
                    {t('usage_analytics.view_request_details')}
                  </Button>
                }
              />
            ) : null}
            <div className={styles.tablePanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.quota_status_title')}</h2>
                  <p>{t('usage_analytics.quota_status_hint')}</p>
                </div>
              </div>
              <CredentialQuotaTable rows={usage.credentialQuotaRows} locale={i18n.language} />
            </div>
            <InsightsPanel insights={usage.insights} onOpen={usage.setActiveTab} />
          </section>
        </>
      ) : null}

      {usage.activeTab === 'heatmap' ? (
        <>
          <section className={styles.analysisSummaryGrid}>
            <AnalysisStat
              icon={<IconChartLine size={20} />}
              label={t('usage_analytics.metric_request_count')}
              value={formatMetricValue('requestCount', usage.summary.requestCount)}
            />
            <AnalysisStat
              icon={<IconDatabaseZap size={20} />}
              label={t('usage_analytics.metric_total_tokens')}
              value={formatMetricValue('totalTokens', usage.summary.totalTokens)}
            />
            <AnalysisStat
              icon={<IconDollarSign size={20} />}
              label={t('usage_analytics.metric_estimated_cost')}
              value={formatMetricValue('estimatedCost', usage.summary.estimatedCost)}
            />
            <AnalysisStat
              icon={<IconShield size={20} />}
              label={t('usage_analytics.failure_rate')}
              value={formatPercent(usage.summary.requestCount > 0 ? usage.summary.failureCount / usage.summary.requestCount : 0)}
            />
          </section>
          <section className={styles.chartPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{t('usage_analytics.heatmap_title')}</h2>
                <p>{t('usage_analytics.heatmap_hint')}</p>
              </div>
            </div>
            <UsageHeatmapChart points={usage.heatmap} />
          </section>
          <section className={styles.chartPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{t('usage_analytics.heatmap_matrix_title')}</h2>
                <p>{t('usage_analytics.heatmap_matrix_hint')}</p>
              </div>
              <div className={styles.matrixControls}>
                <Select
                  value={usage.matrixDimension}
                  options={matrixDimensionOptions}
                  onChange={(value) => usage.setMatrixDimension(value as UsageMatrixDimension)}
                  ariaLabel={t('usage_analytics.filter_dimension')}
                  triggerClassName={styles.compactSelectTrigger}
                />
                <Select
                  value={usage.matrixMetric}
                  options={matrixMetricOptions}
                  onChange={(value) => usage.setMatrixMetric(value as UsageMatrixMetricKey)}
                  ariaLabel={t('usage_analytics.filter_metric')}
                  triggerClassName={styles.compactSelectTrigger}
                />
              </div>
            </div>
            <MatrixHeatmap matrix={usage.matrix} />
          </section>
          <section className={styles.analysisGrid}>
            <HotCombinationsPanel matrix={usage.matrix} />
            <InsightsPanel insights={usage.insights} onOpen={usage.setActiveTab} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function AnalysisStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className={styles.analysisStat}>
      <span>{icon}</span>
      <div>
        <em>{label}</em>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function OverviewCard({
  title,
  rows,
  onViewAll,
}: {
  title: string;
  rows: UsageRankRow[];
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.overviewCard}>
      <div className={styles.panelHeader}>
        <h2>{title}</h2>
        <button type="button" onClick={onViewAll}>
          {t('usage_analytics.view_all')}
        </button>
      </div>
      {rows.map((row) => (
        <div key={row.id} className={styles.overviewRow}>
          <span>{row.label}</span>
          <strong>{formatMetricValue('estimatedCost', row.estimatedCost)}</strong>
          <em>{formatPercent(row.share)}</em>
        </div>
      ))}
    </div>
  );
}

function AnomalyPointsPanel({
  rows,
  onOpen,
}: {
  rows: UsageServerAnomaly[];
  onOpen: (row: UsageServerAnomaly) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.tablePanel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{t('usage_analytics.anomaly_points_title')}</h2>
          <p>{t('usage_analytics.anomaly_points_hint')}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <IconInbox size={22} />
          <span>{t('usage_analytics.anomaly_none')}</span>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.anomalyTable}>
            <thead>
              <tr>
                <th>{t('usage_analytics.col_time')}</th>
                <th>{t('usage_analytics.col_severity')}</th>
                <th>{t('usage_analytics.metric_request_count')}</th>
                <th>{t('usage_analytics.metric_total_tokens')}</th>
                <th>{t('usage_analytics.metric_estimated_cost')}</th>
                <th>{t('usage_analytics.col_anomaly_type')}</th>
                <th>{t('usage_analytics.col_action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row) => (
                <tr key={`${row.bucketMs}-${row.metricKeys.join('-')}`}>
                  <td>{row.label}</td>
                  <td>
                    <span className={`${styles.severityBadge} ${styles[`severity${row.severity}`]}`}>
                      {t(`usage_analytics.severity_${row.severity}`, row.severity)}
                    </span>
                  </td>
                  <td>{compactNumber(row.requestCount)}</td>
                  <td>{compactNumber(row.totalTokens)}</td>
                  <td>{formatMetricValue('estimatedCost', row.estimatedCost)}</td>
                  <td>
                    <span className={styles.anomalyTypeList}>
                      {row.metricKeys.slice(0, 3).map((key) => (
                        <em key={key}>{t(anomalyMetricLabelKey(key))}</em>
                      ))}
                    </span>
                  </td>
                  <td>
                    <button type="button" className={styles.linkButton} onClick={() => onOpen(row)}>
                      {t('usage_analytics.view_monitoring_details')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DrilldownPreviewPanel({
  rows,
  locale,
}: {
  rows: UsageDrilldownEvent[];
  locale: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.tablePanel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{t('usage_analytics.drilldown_preview_title')}</h2>
          <p>{t('usage_analytics.drilldown_preview_hint')}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <IconInbox size={22} />
          <span>{t('usage_analytics.drilldown_preview_empty')}</span>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.drilldownTable}>
            <thead>
              <tr>
                <th>{t('usage_analytics.col_time')}</th>
                <th>{t('usage_analytics.filter_request_id')}</th>
                <th>{t('usage_analytics.col_model')}</th>
                <th>{t('usage_analytics.col_api_key')}</th>
                <th>{t('usage_analytics.metric_total_tokens')}</th>
                <th>{t('usage_analytics.metric_average_latency')}</th>
                <th>{t('usage_analytics.filter_status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.eventHash}>
                  <td>{formatLocalDateTime(row.timestampMs, locale)}</td>
                  <td className={styles.monoCell}>{row.requestId || row.eventHash.slice(0, 10)}</td>
                  <td>{row.model}</td>
                  <td>{maskApiKeyHash(row.apiKeyHash)}</td>
                  <td>{compactNumber(row.totalTokens)}</td>
                  <td>{formatNullableMs(row.latencyMs)}</td>
                  <td>
                    <span className={row.failed ? styles.statusFailed : styles.statusSuccess}>
                      {row.failed ? t('usage_analytics.status_failed') : t('usage_analytics.status_success')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RankTable({
  rows,
  type,
  selectedId,
  onSelect,
}: {
  rows: UsageRankRow[];
  type: 'model' | 'apiKey' | 'credential';
  selectedId?: string;
  onSelect: (row: UsageRankRow) => void;
}) {
  const { t } = useTranslation();
  const entityHeader =
    type === 'model'
      ? t('usage_analytics.col_model')
      : type === 'apiKey'
        ? t('usage_analytics.col_api_key')
        : t('usage_analytics.col_credential');
  return (
    <div className={styles.tableWrap}>
      <table className={type === 'apiKey' ? styles.apiKeyTable : styles.modelTable}>
        <thead>
          <tr>
            <th>{t('usage_analytics.col_rank')}</th>
            <th>{entityHeader}</th>
            <th>{t('usage_analytics.metric_request_count')}</th>
            <th>{t('usage_analytics.metric_total_tokens')}</th>
            <th>{t('usage_analytics.metric_input_tokens')}</th>
            <th>{t('usage_analytics.metric_output_tokens')}</th>
            <th>{t('usage_analytics.metric_cached_tokens')}</th>
            <th>{t('usage_analytics.metric_estimated_cost')}</th>
            <th>{t('usage_analytics.success_rate')}</th>
            <th>{t('usage_analytics.share')}</th>
            {type === 'apiKey' ? <th>{t('usage_analytics.trend')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const active = selectedId === (type === 'apiKey' ? row.apiKeyHash : row.id);
            return (
              <tr
                key={row.id}
                className={active ? styles.selectedRow : ''}
                onClick={() => onSelect(row)}
              >
                <td>{index + 1}</td>
                <td>
                  <span className={styles.entityCell}>
                    {type === 'apiKey' ? (
                      <IconKey size={16} />
                    ) : type === 'credential' ? (
                      <IconFileText size={16} />
                    ) : (
                      <IconModelCluster size={16} />
                    )}
                    {type === 'apiKey' ? maskApiKeyHash(row.apiKeyHash) : row.label}
                    {type === 'apiKey' ? <IconCopy size={13} /> : null}
                  </span>
                </td>
                <td>{compactNumber(row.requestCount)}</td>
                <td>{compactNumber(row.totalTokens)}</td>
                <td>{compactNumber(row.inputTokens)}</td>
                <td>{compactNumber(row.outputTokens)}</td>
                <td>{compactNumber(row.cachedTokens)}</td>
                <td>{formatMetricValue('estimatedCost', row.estimatedCost)}</td>
                <td>{formatPercent(row.successRate)}</td>
                <td>{formatPercent(row.share)}</td>
                {type === 'apiKey' ? (
                  <td>
                    <MiniTrendPlaceholder />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailPanel({
  row,
  type,
  action,
}: {
  row: UsageRankRow;
  type: 'model' | 'apiKey' | 'credential';
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  const title =
    type === 'model'
      ? t('usage_analytics.model_detail_title', { model: row.label })
      : type === 'apiKey'
        ? t('usage_analytics.api_key_detail_title', { key: row.label })
        : t('usage_analytics.credential_detail_title', { credential: row.label });
  return (
    <div className={styles.detailPanel}>
      <div className={styles.panelHeader}>
        <h2>{title}</h2>
        {action}
      </div>
      <div className={styles.detailMetrics}>
        {[
          ['requestCount', row.requestCount],
          ['totalTokens', row.totalTokens],
          ['inputTokens', row.inputTokens],
          ['outputTokens', row.outputTokens],
          ['estimatedCost', row.estimatedCost],
        ].map(([key, value]) => (
          <div key={String(key)}>
            <span>{getMetricLabel(key as UsageMetricKey, t)}</span>
            <strong>{formatMetricValue(key as UsageMetricKey, Number(value))}</strong>
          </div>
        ))}
        <div>
          <span>{t('usage_analytics.average_tokens_per_request')}</span>
          <strong>{compactNumber(row.requestCount > 0 ? row.totalTokens / row.requestCount : 0)}</strong>
        </div>
        <div>
          <span>{t('usage_analytics.average_cost')}</span>
          <strong>
            {formatMetricValue(
              'estimatedCost',
              row.requestCount > 0 ? row.estimatedCost / row.requestCount : 0
            )}
          </strong>
        </div>
        <div>
          <span>{t('usage_analytics.success_rate')}</span>
          <strong>{formatPercent(row.successRate)}</strong>
        </div>
      </div>
      {(type === 'apiKey' || type === 'credential') && row.models && row.models.length > 0 ? (
        <div className={styles.modelDistribution}>
          <h3>{t('usage_analytics.related_model_distribution')}</h3>
          <div>
            {row.models.slice(0, 4).map((model) => (
              <span key={model.id}>
                <i style={{ width: `${Math.max(8, Math.min(100, model.totalTokens / Math.max(row.totalTokens, 1) * 100))}%` }} />
                <b>{model.label}</b>
                <em>{formatPercent(model.totalTokens / Math.max(row.totalTokens, 1))}</em>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function UsageAnalyticsPage() {
  return <UsageAnalyticsPageInner />;
}
