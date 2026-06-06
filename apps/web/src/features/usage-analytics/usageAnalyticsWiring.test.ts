import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import layoutSource from '@/components/layout/MainLayout.tsx?raw';
import routesSource from '@/router/MainRoutes.tsx?raw';
import pageSource from './UsageAnalyticsPage.tsx?raw';

const getPath = (value: unknown, keyPath: string) =>
  keyPath.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);

const usageAnalyticsKeys = [
  'nav.usage_analytics',
  'usage_analytics.title',
  'usage_analytics.subtitle',
  'usage_analytics.tabs_label',
  'usage_analytics.tab_overview',
  'usage_analytics.tab_trends',
  'usage_analytics.tab_models',
  'usage_analytics.tab_apiKeys',
  'usage_analytics.tab_credentials',
  'usage_analytics.tab_heatmap',
  'usage_analytics.all',
  'usage_analytics.export',
  'usage_analytics.export_coming_soon',
  'usage_analytics.awaiting_refresh',
  'usage_analytics.favorite_view',
  'usage_analytics.save_view',
  'usage_analytics.favorite_views_title',
  'usage_analytics.favorite_empty',
  'usage_analytics.recent_views_title',
  'usage_analytics.clear_recent',
  'usage_analytics.recent_empty',
  'usage_analytics.updated_at',
  'usage_analytics.view_daily_board',
  'usage_analytics.view_daily_board_desc',
  'usage_analytics.view_high_cost_key',
  'usage_analytics.view_high_cost_key_desc',
  'usage_analytics.view_prod_credentials',
  'usage_analytics.view_prod_credentials_desc',
  'usage_analytics.view_team_weekly',
  'usage_analytics.view_team_weekly_desc',
  'usage_analytics.analysis_entry_trends',
  'usage_analytics.analysis_entry_trends_desc',
  'usage_analytics.analysis_entry_models',
  'usage_analytics.analysis_entry_models_desc',
  'usage_analytics.analysis_entry_api_keys',
  'usage_analytics.analysis_entry_api_keys_desc',
  'usage_analytics.analysis_entry_credentials',
  'usage_analytics.analysis_entry_credentials_desc',
  'usage_analytics.analysis_entry_heatmap',
  'usage_analytics.analysis_entry_heatmap_desc',
  'usage_analytics.filter_metric',
  'usage_analytics.filter_dimension',
  'usage_analytics.trend_metric_requestCount',
  'usage_analytics.trend_metric_totalTokens',
  'usage_analytics.trend_metric_estimatedCost',
  'usage_analytics.matrix_dimension_apiKeyModel',
  'usage_analytics.matrix_dimension_authFileModel',
  'usage_analytics.matrix_dimension_providerModel',
  'usage_analytics.matrix_metric_requestCount',
  'usage_analytics.matrix_metric_totalTokens',
  'usage_analytics.matrix_metric_estimatedCost',
  'usage_analytics.matrix_metric_failureRate',
  'usage_analytics.filter_time_range',
  'usage_analytics.range_24h',
  'usage_analytics.range_today',
  'usage_analytics.range_yesterday',
  'usage_analytics.range_7d',
  'usage_analytics.range_30d',
  'usage_analytics.range_custom',
  'usage_analytics.filter_granularity',
  'usage_analytics.granularity_auto',
  'usage_analytics.granularity_hour',
  'usage_analytics.granularity_day',
  'usage_analytics.resolved_granularity',
  'usage_analytics.filter_model',
  'usage_analytics.filter_api_key',
  'usage_analytics.filter_status',
  'usage_analytics.status_all',
  'usage_analytics.status_success',
  'usage_analytics.status_failed',
  'usage_analytics.custom_start',
  'usage_analytics.custom_end',
  'usage_analytics.apply_custom_range',
  'usage_analytics.show_advanced_filters',
  'usage_analytics.hide_advanced_filters',
  'usage_analytics.filter_provider',
  'usage_analytics.filter_auth_file',
  'usage_analytics.filter_request_type',
  'usage_analytics.filter_project_team',
  'usage_analytics.filter_request_id',
  'usage_analytics.not_available_yet',
  'usage_analytics.clear_all',
  'usage_analytics.error_title',
  'usage_analytics.empty_title',
  'usage_analytics.empty_body',
  'usage_analytics.summary_meta',
  'usage_analytics.summary_cost_meta',
  'usage_analytics.trend_title',
  'usage_analytics.trend_hint',
  'usage_analytics.chart_normalized_scale',
  'usage_analytics.chart_compare_scale',
  'usage_analytics.anomaly_title',
  'usage_analytics.anomaly_none',
  'usage_analytics.anomaly_request_spike',
  'usage_analytics.anomaly_cost_spike',
  'usage_analytics.anomaly_token_per_request_spike',
  'usage_analytics.anomaly_cache_hit_drop',
  'usage_analytics.anomaly_failure_rate_spike',
  'usage_analytics.anomaly_latency_spike',
  'usage_analytics.anomaly_unknown',
  'usage_analytics.possible_causes',
  'usage_analytics.cause_traffic',
  'usage_analytics.cause_batch',
  'usage_analytics.cause_cache',
  'usage_analytics.cause_request_spike',
  'usage_analytics.cause_request_drop',
  'usage_analytics.cause_cost_spike',
  'usage_analytics.cause_cost_drop',
  'usage_analytics.cause_token_per_request_spike',
  'usage_analytics.cause_cache_hit_drop',
  'usage_analytics.cause_cache_growth',
  'usage_analytics.cause_failure_rate_spike',
  'usage_analytics.cause_latency_spike',
  'usage_analytics.cause_no_clear_anomaly',
  'usage_analytics.view_monitoring_details',
  'usage_analytics.overview_trend_title',
  'usage_analytics.overview_trend_hint',
  'usage_analytics.health_trend_title',
  'usage_analytics.token_structure_title',
  'usage_analytics.token_structure_hint',
  'usage_analytics.entity_trend_title',
  'usage_analytics.entity_trend_hint',
  'usage_analytics.insights_title',
  'usage_analytics.insights_hint',
  'usage_analytics.insights_empty',
  'usage_analytics.insight_model_cost_high',
  'usage_analytics.insight_model_cost_high_body',
  'usage_analytics.insight_key_long_tail',
  'usage_analytics.insight_key_long_tail_body',
  'usage_analytics.insight_credential_success_drop',
  'usage_analytics.insight_credential_success_drop_body',
  'usage_analytics.insight_low_cost_room',
  'usage_analytics.insight_low_cost_room_body',
  'usage_analytics.insight_provider_concentration',
  'usage_analytics.insight_provider_concentration_body',
  'usage_analytics.insight_cache_room',
  'usage_analytics.insight_cache_room_body',
  'usage_analytics.anomaly_points_title',
  'usage_analytics.anomaly_points_hint',
  'usage_analytics.drilldown_preview_title',
  'usage_analytics.drilldown_preview_hint',
  'usage_analytics.drilldown_preview_empty',
  'usage_analytics.model_overview_title',
  'usage_analytics.api_key_overview_title',
  'usage_analytics.credential_overview_title',
  'usage_analytics.active_models',
  'usage_analytics.active_api_keys',
  'usage_analytics.active_credentials',
  'usage_analytics.total_cost',
  'usage_analytics.anomaly_keys',
  'usage_analytics.anomaly_credentials',
  'usage_analytics.anomaly_reason_cost_spike',
  'usage_analytics.anomaly_reason_error_rate',
  'usage_analytics.anomaly_reason_usage_skew',
  'usage_analytics.model_rank_title',
  'usage_analytics.cost_share_title',
  'usage_analytics.model_compare_title',
  'usage_analytics.api_key_keyword_placeholder',
  'usage_analytics.api_key_rank_title',
  'usage_analytics.api_key_warning_title',
  'usage_analytics.credential_rank_title',
  'usage_analytics.credential_warning_title',
  'usage_analytics.heatmap_title',
  'usage_analytics.heatmap_hint',
  'usage_analytics.heatmap_matrix_title',
  'usage_analytics.heatmap_matrix_hint',
  'usage_analytics.hot_combinations_title',
  'usage_analytics.abnormal_time_points_title',
  'usage_analytics.view_exception_combinations',
  'usage_analytics.active_only',
  'usage_analytics.active_credential_hint',
  'usage_analytics.provider_usage_share_title',
  'usage_analytics.provider_health_title',
  'usage_analytics.quota_status_title',
  'usage_analytics.quota_status_hint',
  'usage_analytics.quota_status_normal',
  'usage_analytics.quota_status_warning',
  'usage_analytics.quota_status_exhausted',
  'usage_analytics.view_all',
  'usage_analytics.warning_cost',
  'usage_analytics.warning_failure',
  'usage_analytics.view_request_details',
  'usage_analytics.col_rank',
  'usage_analytics.col_model',
  'usage_analytics.col_api_key',
  'usage_analytics.col_credential',
  'usage_analytics.col_time',
  'usage_analytics.col_severity',
  'usage_analytics.col_anomaly_type',
  'usage_analytics.col_action',
  'usage_analytics.col_dimension',
  'usage_analytics.col_reason',
  'usage_analytics.col_triggered_at',
  'usage_analytics.col_status',
  'usage_analytics.col_plan',
  'usage_analytics.col_used_quota',
  'usage_analytics.col_remaining_quota',
  'usage_analytics.col_reset_at',
  'usage_analytics.metric_request_count',
  'usage_analytics.metric_total_tokens',
  'usage_analytics.metric_input_tokens',
  'usage_analytics.metric_output_tokens',
  'usage_analytics.metric_cached_tokens',
  'usage_analytics.metric_reasoning_tokens',
  'usage_analytics.metric_estimated_cost',
  'usage_analytics.metric_average_cost_per_call',
  'usage_analytics.metric_failure_count',
  'usage_analytics.metric_average_latency',
  'usage_analytics.metric_p95_ttft',
  'usage_analytics.success_rate',
  'usage_analytics.failure_rate',
  'usage_analytics.share',
  'usage_analytics.trend',
  'usage_analytics.trend_unavailable',
  'usage_analytics.trend_pending_data',
  'usage_analytics.model_detail_title',
  'usage_analytics.api_key_detail_title',
  'usage_analytics.credential_detail_title',
  'usage_analytics.average_tokens_per_request',
  'usage_analytics.average_cost',
  'usage_analytics.related_model_distribution',
  'usage_analytics.severity_low',
  'usage_analytics.severity_medium',
  'usage_analytics.severity_high',
  'usage_analytics.weekday_sun',
  'usage_analytics.weekday_mon',
  'usage_analytics.weekday_tue',
  'usage_analytics.weekday_wed',
  'usage_analytics.weekday_thu',
  'usage_analytics.weekday_fri',
  'usage_analytics.weekday_sat',
];

describe('usage analytics app wiring', () => {
  it('registers /usage-analytics behind the request monitoring gate', () => {
    expect(routesSource).toContain("import { UsageAnalyticsPage } from '@/pages/UsageAnalyticsPage';");
    const usageRouteIndex = routesSource.indexOf("path: '/usage-analytics'");
    const usageRouteSource = routesSource.slice(usageRouteIndex, routesSource.indexOf("path: '/codex-inspection'"));

    expect(usageRouteIndex).toBeGreaterThanOrEqual(0);
    expect(usageRouteSource).toContain('<FeatureGate feature="requestMonitoring">');
    expect(usageRouteSource).toContain('<UsageAnalyticsPage />');
    expect(routesSource.indexOf("path: '/usage-analytics'")).toBeLessThan(
      routesSource.indexOf("path: '/monitoring'")
    );
  });

  it('places Usage Analytics in the top-level sidebar between dashboard and monitoring when monitoring is available', () => {
    const dashboardIndex = layoutSource.indexOf("path: '/', label: t('nav.dashboard')");
    const usageIndex = layoutSource.indexOf('...(usageAnalyticsNavItem ? [usageAnalyticsNavItem] : [])');
    const monitoringIndex = layoutSource.indexOf('...(monitoringNavItem ? [monitoringNavItem] : [])');

    expect(layoutSource).toContain('const usageAnalyticsNavItem = featureAvailability.requestMonitoringAvailable');
    expect(layoutSource).toContain("path: '/usage-analytics'");
    expect(layoutSource).toContain("label: t('nav.usage_analytics')");
    expect(dashboardIndex).toBeGreaterThanOrEqual(0);
    expect(usageIndex).toBeGreaterThan(dashboardIndex);
    expect(monitoringIndex).toBeGreaterThan(usageIndex);
  });

  it('escapes user-controlled chart tooltip labels before returning tooltip HTML', () => {
    expect(pageSource).toContain('const escapeHtml = (value: string | number | null | undefined)');
    expect(pageSource).not.toContain('<b>${item.name}</b>');
    expect(pageSource).toContain('escapeHtml(\n          item.name');
    expect(pageSource).toContain('${entry.marker ?? \'\'}${escapeHtml(entry.seriesName)}');
  });

  it('keeps Usage Analytics i18n keys present in every locale', () => {
    const locales = { en, ru, zhCN, zhTW };

    for (const [localeName, locale] of Object.entries(locales)) {
      for (const key of usageAnalyticsKeys) {
        expect(getPath(locale, key), `${localeName}:${key}`).toBeTypeOf('string');
      }
    }
  });
});
