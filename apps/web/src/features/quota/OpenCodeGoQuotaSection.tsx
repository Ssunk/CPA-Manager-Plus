import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconRefreshCw } from '@/components/ui/icons';
import { QuotaProgressBar } from '@/components/quota/QuotaCard';
import { useNotificationStore } from '@/stores';
import {
  usageServiceApi,
  type ManagerOpenCodeGoEntry,
  type OpenCodeGoUsageResponse,
  type OpenCodeUsageWindow,
} from '@/services/api/usageService';
import { getStatusFromError } from '@/utils/quota';
import styles from './QuotaPage.module.scss';

type OpenCodeGoQuotaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: OpenCodeGoUsageResponse }
  | { status: 'error'; error: string; errorStatus?: number };

interface OpenCodeGoQuotaSectionProps {
  managerServiceBase: string;
  managementKey: string;
  disabled: boolean;
  searchQuery?: string;
  refreshToken?: number;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const formatResetDuration = (seconds: number, t: TFunction) => {
  const totalMinutes = Math.max(0, Math.ceil(seconds / 60));
  if (totalMinutes <= 0) return t('opencode_go_quota.reset_now');
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}m`);
  return t('opencode_go_quota.reset_in', { duration: parts.join(' ') || '<1m' });
};

const windowRows: Array<{
  key: keyof Pick<OpenCodeGoUsageResponse, 'rollingUsage' | 'weeklyUsage' | 'monthlyUsage'>;
  labelKey: string;
}> = [
  { key: 'rollingUsage', labelKey: 'opencode_go_quota.rolling_window' },
  { key: 'weeklyUsage', labelKey: 'opencode_go_quota.weekly_window' },
  { key: 'monthlyUsage', labelKey: 'opencode_go_quota.monthly_window' },
];

export function OpenCodeGoQuotaSection({
  managerServiceBase,
  managementKey,
  disabled,
  searchQuery = '',
  refreshToken = 0,
}: OpenCodeGoQuotaSectionProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [entries, setEntries] = useState<ManagerOpenCodeGoEntry[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState('');
  const [quotaStates, setQuotaStates] = useState<Record<string, OpenCodeGoQuotaState>>({});
  const [refreshingAll, setRefreshingAll] = useState(false);

  const enabledEntries = useMemo(
    () => entries.filter((entry) => entry.enabled),
    [entries]
  );
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const displayEntries = useMemo(() => {
    if (!normalizedSearch) return enabledEntries;
    return enabledEntries.filter((entry) =>
      [entry.label, entry.workspaceId, entry.baseUrl]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch))
    );
  }, [enabledEntries, normalizedSearch]);

  const loadConfig = useCallback(async () => {
    if (!managerServiceBase || !managementKey) {
      setEntries([]);
      setConfigError('');
      return;
    }
    setLoadingConfig(true);
    setConfigError('');
    try {
      const response = await usageServiceApi.getManagerConfig(managerServiceBase, managementKey);
      setEntries(response.config.openCodeGo?.entries ?? []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common.unknown_error');
      setConfigError(message);
    } finally {
      setLoadingConfig(false);
    }
  }, [managementKey, managerServiceBase, t]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig, refreshToken]);

  const refreshEntry = useCallback(
    async (entry: ManagerOpenCodeGoEntry, notify = true) => {
      if (disabled || !entry.enabled) return;
      setQuotaStates((current) => ({
        ...current,
        [entry.id]: { status: 'loading' },
      }));
      try {
        const data = await usageServiceApi.getOpenCodeGoUsage(
          managerServiceBase,
          managementKey,
          entry.id
        );
        setQuotaStates((current) => ({
          ...current,
          [entry.id]: { status: 'success', data },
        }));
        if (notify) {
          showNotification(
            t('auth_files.quota_refresh_success', {
              name: entry.label || entry.workspaceId,
            }),
            'success'
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : t('common.unknown_error');
        const status = getStatusFromError(error);
        setQuotaStates((current) => ({
          ...current,
          [entry.id]: { status: 'error', error: message, errorStatus: status },
        }));
        if (notify) {
          showNotification(
            t('auth_files.quota_refresh_failed', {
              name: entry.label || entry.workspaceId,
              message,
            }),
            'error'
          );
        }
      }
    },
    [disabled, managementKey, managerServiceBase, showNotification, t]
  );

  const refreshAll = useCallback(async () => {
    if (disabled || displayEntries.length === 0) return;
    setRefreshingAll(true);
    try {
      await Promise.all(displayEntries.map((entry) => refreshEntry(entry, false)));
    } finally {
      setRefreshingAll(false);
    }
  }, [disabled, displayEntries, refreshEntry]);

  const isRefreshing = refreshingAll || loadingConfig;
  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t('opencode_go_quota.title')}</span>
      {enabledEntries.length > 0 && <span className={styles.countBadge}>{displayEntries.length}</span>}
    </div>
  );

  return (
    <Card
      title={titleNode}
      extra={
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            className={styles.refreshAllButton}
            onClick={() => void refreshAll()}
            disabled={disabled || isRefreshing || displayEntries.length === 0}
            loading={isRefreshing}
            title={t('opencode_go_quota.refresh_all')}
            aria-label={t('opencode_go_quota.refresh_all')}
          >
            {!isRefreshing && <IconRefreshCw size={16} />}
            {t('opencode_go_quota.refresh_all')}
          </Button>
        </div>
      }
    >
      {configError ? <div className={styles.quotaError}>{configError}</div> : null}
      {loadingConfig ? (
        <div className={styles.quotaMessage}>{t('opencode_go_quota.loading')}</div>
      ) : enabledEntries.length === 0 ? (
        <EmptyState
          title={t('opencode_go_quota.empty_title')}
          description={t('opencode_go_quota.empty_desc')}
        />
      ) : displayEntries.length === 0 ? (
        <EmptyState
          title={t('quota_management.search_empty_title')}
          description={t('quota_management.search_empty_desc')}
        />
      ) : (
        <div className={styles.codexGrid}>
          {displayEntries.map((entry) => (
            <OpenCodeGoQuotaCard
              key={entry.id}
              entry={entry}
              state={quotaStates[entry.id] ?? { status: 'idle' }}
              disabled={disabled}
              onRefresh={() => void refreshEntry(entry)}
              t={t}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function OpenCodeGoQuotaCard({
  entry,
  state,
  disabled,
  onRefresh,
  t,
}: {
  entry: ManagerOpenCodeGoEntry;
  state: OpenCodeGoQuotaState;
  disabled: boolean;
  onRefresh: () => void;
  t: TFunction;
}) {
  const name = entry.label || entry.workspaceId || entry.id;
  return (
    <div className={`${styles.fileCard} ${styles.codexCard}`}>
      <div className={styles.cardHeader}>
        <span
          className={styles.typeBadge}
          style={{
            backgroundColor: 'rgba(14, 165, 233, 0.14)',
            color: 'var(--text-primary)',
            border: '1px solid rgba(14, 165, 233, 0.24)',
          }}
        >
          OpenCode
        </span>
        <span className={styles.fileName} title={entry.workspaceId}>
          {name}
        </span>
      </div>
      <div className={styles.quotaSection}>
        {state.status === 'loading' ? (
          <div className={styles.quotaMessage}>{t('opencode_go_quota.loading')}</div>
        ) : state.status === 'error' ? (
          <>
            <div className={styles.quotaError}>
              {t('opencode_go_quota.load_failed', { message: state.error })}
            </div>
            <QuotaActions disabled={disabled} onRefresh={onRefresh} t={t} />
          </>
        ) : state.status === 'success' ? (
          <>
            {windowRows.map((row) => (
              <OpenCodeGoWindowRow
                key={row.key}
                label={t(row.labelKey)}
                window={state.data[row.key]}
                t={t}
              />
            ))}
            <QuotaActions disabled={disabled} onRefresh={onRefresh} t={t} />
          </>
        ) : (
          <button
            type="button"
            className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
            onClick={onRefresh}
            disabled={disabled}
          >
            {t('opencode_go_quota.idle')}
          </button>
        )}
      </div>
    </div>
  );
}

function OpenCodeGoWindowRow({
  label,
  window,
  t,
}: {
  label: string;
  window: OpenCodeUsageWindow;
  t: TFunction;
}) {
  const used = clampPercent(window.usagePercent);
  const remaining = clampPercent(100 - used);
  return (
    <div className={styles.quotaRow}>
      <div className={styles.quotaRowHeader}>
        <span
          className={styles.quotaModel}
          title={t('opencode_go_quota.used_tooltip', { used })}
        >
          {label}
        </span>
        <div className={styles.quotaMeta}>
          <span className={styles.quotaPercent}>
            {t('opencode_go_quota.remaining_label', { remaining: Math.round(remaining) })}
          </span>
          <span className={styles.quotaReset}>
            {formatResetDuration(window.resetInSec, t)}
          </span>
        </div>
      </div>
      <QuotaProgressBar percent={remaining} highThreshold={70} mediumThreshold={30} />
    </div>
  );
}

function QuotaActions({
  disabled,
  onRefresh,
  t,
}: {
  disabled: boolean;
  onRefresh: () => void;
  t: TFunction;
}) {
  return (
    <div className={styles.quotaActions}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={styles.quotaActionButton}
        onClick={onRefresh}
        disabled={disabled}
      >
        {t('opencode_go_quota.refresh_button')}
      </Button>
    </div>
  );
}
