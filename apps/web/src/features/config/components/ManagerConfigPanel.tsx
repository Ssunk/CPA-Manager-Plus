import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconEye, IconEyeOff, IconPlus, IconTrash2, IconX } from '@/components/ui/icons';
import type { ManagerOpenCodeGoEntry } from '@/services/api/usageService';
import { AccountProcessingPolicySection } from './AccountProcessingPolicySection';
import styles from '../ConfigPage.module.scss';

type ManagerConfigPanelProps = {
  managerLoading: boolean;
  managerSaving: boolean;
  panelHostedByUsageService: boolean | null;
  detectedPanelBase: string;
  managerRuntimeModeLabel: string;
  managerHasBoundCPAManagementKey: boolean;
  managerCPABaseInput: string;
  managerCPAManagementKeyInput: string;
  managerCPAManagementKeyVisible: boolean;
  managerBoundCPABase: string;
  disableControls: boolean;
  canConfigureRequestMonitoring: boolean;
  managerRequestMonitoringEnabled: boolean;
  managerCollectorMode: string;
  managerCollectorModeOptions: Array<{ value: string; label: string }>;
  managerPollIntervalMs: string;
  managerBatchSize: string;
  managerQueryLimit: string;
  managerRetentionSeconds: number;
  managerConfigSourceLabel: string;
  managerUsageStatisticsEnabled: boolean;
  openCodeGoEntries: ManagerOpenCodeGoEntry[];
  onRefresh: () => void;
  onRequestMonitoringChange: (value: boolean) => void;
  onCPABaseInputChange: (value: string) => void;
  onCPAManagementKeyInputChange: (value: string) => void;
  onCPAManagementKeyClear: () => void;
  onCPAManagementKeyVisibilityToggle: () => void;
  onCollectorModeChange: (value: string) => void;
  onPollIntervalMsChange: (value: string) => void;
  onBatchSizeChange: (value: string) => void;
  onQueryLimitChange: (value: string) => void;
  onOpenCodeGoEntriesChange: (entries: ManagerOpenCodeGoEntry[]) => void;
};

export function ManagerConfigPanel({
  managerLoading,
  managerSaving,
  panelHostedByUsageService,
  detectedPanelBase,
  managerRuntimeModeLabel,
  managerHasBoundCPAManagementKey,
  managerCPABaseInput,
  managerCPAManagementKeyInput,
  managerCPAManagementKeyVisible,
  managerBoundCPABase,
  disableControls,
  canConfigureRequestMonitoring,
  managerRequestMonitoringEnabled,
  managerCollectorMode,
  managerCollectorModeOptions,
  managerPollIntervalMs,
  managerBatchSize,
  managerQueryLimit,
  managerRetentionSeconds,
  managerConfigSourceLabel,
  managerUsageStatisticsEnabled,
  openCodeGoEntries,
  onRefresh,
  onRequestMonitoringChange,
  onCPABaseInputChange,
  onCPAManagementKeyInputChange,
  onCPAManagementKeyClear,
  onCPAManagementKeyVisibilityToggle,
  onCollectorModeChange,
  onPollIntervalMsChange,
  onBatchSizeChange,
  onQueryLimitChange,
  onOpenCodeGoEntriesChange,
}: ManagerConfigPanelProps) {
  const { t } = useTranslation();
  const [visibleOpenCodeCookies, setVisibleOpenCodeCookies] = useState<Record<string, boolean>>({});
  const connectionInputDisabled =
    disableControls || managerLoading || managerSaving || panelHostedByUsageService !== true;
  const openCodeControlsDisabled = disableControls || managerLoading || managerSaving;
  const openCodeEntryIds = useMemo(
    () => new Set(openCodeGoEntries.map((entry) => entry.id)),
    [openCodeGoEntries]
  );
  const updateOpenCodeEntry = (index: number, patch: Partial<ManagerOpenCodeGoEntry>) => {
    onOpenCodeGoEntriesChange(
      openCodeGoEntries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      )
    );
  };
  const addOpenCodeEntry = () => {
    let id = `opencode-${Date.now().toString(36)}`;
    let suffix = 1;
    while (openCodeEntryIds.has(id)) {
      suffix += 1;
      id = `opencode-${Date.now().toString(36)}-${suffix}`;
    }
    onOpenCodeGoEntriesChange([
      ...openCodeGoEntries,
      {
        id,
        label: '',
        workspaceId: '',
        authCookie: '',
        enabled: true,
        baseUrl: 'https://opencode.ai',
      },
    ]);
  };
  const removeOpenCodeEntry = (index: number) => {
    onOpenCodeGoEntriesChange(openCodeGoEntries.filter((_, entryIndex) => entryIndex !== index));
  };

  return (
    <div className={styles.managerConfigPanel}>
      <div className={styles.managerConfigHeader}>
        <div>
          <h2>{t('config_management.manager.title')}</h2>
          <p>{t('config_management.manager.boundary_hint')}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          loading={managerLoading}
          disabled={managerSaving}
        >
          {t('common.refresh')}
        </Button>
      </div>

      <section className={styles.managerSection}>
        <div className={styles.managerSectionHeader}>
          <div>
            <h3>{t('config_management.manager.runtime_title')}</h3>
            <p>
              {panelHostedByUsageService === true
                ? t('config_management.manager.runtime_embedded_hint')
                : t('config_management.manager.runtime_external_hint')}
            </p>
          </div>
          <span className={styles.managerRuntimeBadge}>{managerRuntimeModeLabel}</span>
        </div>

        <div className={styles.managerReadonlyGrid}>
          <div>
            <span>{t('config_management.manager.service_base')}</span>
            <strong>{detectedPanelBase}</strong>
          </div>
        </div>
      </section>

      <section className={styles.managerSection}>
        <div className={styles.managerSectionHeader}>
          <div>
            <h3>{t('config_management.manager.cpa_connection_section_title')}</h3>
            <p>{t('config_management.manager.cpa_connection_section_hint')}</p>
          </div>
          <span
            className={`${styles.managerKeyBindingBadge} ${
              managerHasBoundCPAManagementKey
                ? styles.managerKeyBindingBadgeBound
                : styles.managerKeyBindingBadgeUnbound
            }`}
          >
            {managerHasBoundCPAManagementKey
              ? t('config_management.manager.cpa_management_key_binding_bound')
              : t('config_management.manager.cpa_management_key_binding_unbound')}
          </span>
        </div>
        <div className={styles.managerConnectionGrid}>
          <Input
            label={t('config_management.manager.cpa_base_url_label')}
            value={managerCPABaseInput}
            placeholder={t('config_management.manager.cpa_base_url_placeholder')}
            onChange={(event) => onCPABaseInputChange(event.target.value)}
            disabled={connectionInputDisabled}
            hint={t('config_management.manager.cpa_base_url_hint', {
              boundBase: managerBoundCPABase || t('config_management.manager.not_bound'),
            })}
          />
          <Input
            label={t('config_management.manager.cpa_management_key_label')}
            name="manager-cpa-management-key-rotation"
            type={managerCPAManagementKeyVisible ? 'text' : 'password'}
            value={managerCPAManagementKeyInput}
            placeholder={t('config_management.manager.cpa_management_key_placeholder')}
            onChange={(event) => onCPAManagementKeyInputChange(event.target.value)}
            disabled={connectionInputDisabled}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            className={styles.managerCpaKeyInput}
            hint={t('config_management.manager.cpa_management_key_section_hint')}
            rightElement={
              <div className={styles.managerKeyInputActions}>
                <button
                  type="button"
                  className={styles.managerKeyIconButton}
                  onClick={onCPAManagementKeyVisibilityToggle}
                  disabled={connectionInputDisabled}
                  title={t(
                    managerCPAManagementKeyVisible
                      ? 'config_management.manager.cpa_management_key_hide'
                      : 'config_management.manager.cpa_management_key_reveal'
                  )}
                  aria-label={t(
                    managerCPAManagementKeyVisible
                      ? 'config_management.manager.cpa_management_key_hide'
                      : 'config_management.manager.cpa_management_key_reveal'
                  )}
                >
                  {managerCPAManagementKeyVisible ? (
                    <IconEyeOff size={16} />
                  ) : (
                    <IconEye size={16} />
                  )}
                </button>
                <button
                  type="button"
                  className={styles.managerKeyIconButton}
                  onClick={onCPAManagementKeyClear}
                  disabled={connectionInputDisabled || !managerCPAManagementKeyInput}
                  title={t('config_management.manager.cpa_management_key_clear')}
                  aria-label={t('config_management.manager.cpa_management_key_clear')}
                >
                  <IconX size={16} />
                </button>
              </div>
            }
          />
        </div>
        <div className={styles.managerConnectionRiskNote}>
          {t('config_management.manager.cpa_connection_risk_inline')}
        </div>
        {managerSaving && managerCPAManagementKeyInput.trim() ? (
          <div className={styles.managerKeySavingHint}>
            {t('config_management.manager.cpa_management_key_saving')}
          </div>
        ) : null}
      </section>

      <section className={styles.managerSection}>
        <div className={styles.managerSectionHeader}>
          <div>
            <h3>{t('config_management.manager.request_monitoring_title')}</h3>
            <p>{t('config_management.manager.request_monitoring_hint')}</p>
          </div>
          <ToggleSwitch
            label={t('config_management.manager.request_monitoring_enabled')}
            labelPosition="left"
            checked={managerRequestMonitoringEnabled}
            onChange={onRequestMonitoringChange}
            disabled={disableControls || managerLoading || !canConfigureRequestMonitoring}
          />
        </div>

        {!canConfigureRequestMonitoring ? (
          <div className={styles.managerDependencyNote}>
            {t('config_management.manager.request_monitoring_dependency')}
          </div>
        ) : null}

        <div className={styles.managerQueueNote}>
          {t('config_management.manager.request_monitoring_queue_note')}
        </div>

        <div className={styles.managerConfigGrid}>
          <div className={styles.managerField}>
            <span className={styles.managerFieldLabel}>
              {t('config_management.manager.collector_mode')}
            </span>
            <Select
              value={managerCollectorMode}
              options={managerCollectorModeOptions}
              triggerClassName={styles.managerSelectTrigger}
              onChange={onCollectorModeChange}
              disabled={
                disableControls ||
                managerLoading ||
                !managerRequestMonitoringEnabled ||
                !canConfigureRequestMonitoring
              }
              ariaLabel={t('config_management.manager.collector_mode')}
            />
          </div>
          <Input
            label={t('config_management.manager.poll_interval_ms')}
            type="number"
            min="1"
            placeholder="500"
            value={managerPollIntervalMs}
            onChange={(event) => onPollIntervalMsChange(event.target.value)}
            disabled={
              disableControls ||
              managerLoading ||
              !managerRequestMonitoringEnabled ||
              !canConfigureRequestMonitoring
            }
            hint={t('config_management.manager.poll_interval_hint', {
              seconds: managerRetentionSeconds,
            })}
          />
          <Input
            label={t('config_management.manager.batch_size')}
            type="number"
            min="1"
            placeholder="100"
            value={managerBatchSize}
            onChange={(event) => onBatchSizeChange(event.target.value)}
            disabled={
              disableControls ||
              managerLoading ||
              !managerRequestMonitoringEnabled ||
              !canConfigureRequestMonitoring
            }
          />
          <Input
            label={t('config_management.manager.query_limit')}
            type="number"
            min="1"
            placeholder="50000"
            value={managerQueryLimit}
            onChange={(event) => onQueryLimitChange(event.target.value)}
            disabled={
              disableControls ||
              managerLoading ||
              !managerRequestMonitoringEnabled ||
              !canConfigureRequestMonitoring
            }
          />
        </div>
      </section>

      <section className={styles.managerSection}>
        <div className={styles.managerSectionHeader}>
          <div>
            <h3>{t('config_management.manager.opencode_go_title')}</h3>
            <p>{t('config_management.manager.opencode_go_hint')}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addOpenCodeEntry}
            disabled={openCodeControlsDisabled}
          >
            <IconPlus size={16} />
            {t('config_management.manager.opencode_go_add')}
          </Button>
        </div>

        {openCodeGoEntries.length === 0 ? (
          <div className={styles.managerDependencyNote}>
            {t('config_management.manager.opencode_go_empty')}
          </div>
        ) : (
          <div className={styles.managerOpenCodeList}>
            {openCodeGoEntries.map((entry, index) => {
              const visible = visibleOpenCodeCookies[entry.id] ?? false;
              return (
                <div className={styles.managerOpenCodeItem} key={entry.id || index}>
                  <div className={styles.managerOpenCodeItemHeader}>
                    <ToggleSwitch
                      label={t('config_management.manager.opencode_go_enabled')}
                      checked={entry.enabled}
                      onChange={(enabled) => updateOpenCodeEntry(index, { enabled })}
                      disabled={openCodeControlsDisabled}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => removeOpenCodeEntry(index)}
                      disabled={openCodeControlsDisabled}
                      title={t('config_management.manager.opencode_go_delete')}
                    >
                      <IconTrash2 size={16} />
                      {t('config_management.manager.opencode_go_delete')}
                    </Button>
                  </div>
                  <div className={styles.managerOpenCodeGrid}>
                    <Input
                      label={t('config_management.manager.opencode_go_label')}
                      value={entry.label}
                      onChange={(event) => updateOpenCodeEntry(index, { label: event.target.value })}
                      disabled={openCodeControlsDisabled}
                      placeholder={t('config_management.manager.opencode_go_label_placeholder')}
                    />
                    <Input
                      label={t('config_management.manager.opencode_go_workspace_id')}
                      value={entry.workspaceId}
                      onChange={(event) =>
                        updateOpenCodeEntry(index, { workspaceId: event.target.value })
                      }
                      disabled={openCodeControlsDisabled}
                      placeholder="wrk_..."
                    />
                    <Input
                      label={t('config_management.manager.opencode_go_base_url')}
                      value={entry.baseUrl ?? ''}
                      onChange={(event) =>
                        updateOpenCodeEntry(index, { baseUrl: event.target.value })
                      }
                      disabled={openCodeControlsDisabled}
                      placeholder="https://opencode.ai"
                    />
                    <Input
                      label={t('config_management.manager.opencode_go_auth_cookie')}
                      type={visible ? 'text' : 'password'}
                      value={entry.authCookie ?? ''}
                      onChange={(event) =>
                        updateOpenCodeEntry(index, { authCookie: event.target.value })
                      }
                      disabled={openCodeControlsDisabled}
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      className={styles.managerCpaKeyInput}
                      rightElement={
                        <button
                          type="button"
                          className={styles.managerKeyIconButton}
                          onClick={() =>
                            setVisibleOpenCodeCookies((current) => ({
                              ...current,
                              [entry.id]: !visible,
                            }))
                          }
                          disabled={openCodeControlsDisabled}
                          title={t(
                            visible
                              ? 'config_management.manager.opencode_go_cookie_hide'
                              : 'config_management.manager.opencode_go_cookie_reveal'
                          )}
                          aria-label={t(
                            visible
                              ? 'config_management.manager.opencode_go_cookie_hide'
                              : 'config_management.manager.opencode_go_cookie_reveal'
                          )}
                        >
                          {visible ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.managerSection}>
        <AccountProcessingPolicySection />
      </section>

      <div className={styles.managerMetaGrid}>
        <div>
          <span>{t('config_management.manager.config_source')}</span>
          <strong>{managerConfigSourceLabel}</strong>
        </div>
        <div>
          <span>{t('config_management.manager.cpa_usage_enabled')}</span>
          <strong>{managerUsageStatisticsEnabled ? t('common.enabled') : t('common.disabled')}</strong>
        </div>
        <div>
          <span>{t('config_management.manager.cpa_retention')}</span>
          <strong>
            {t('config_management.manager.cpa_retention_value', {
              seconds: managerRetentionSeconds,
            })}
          </strong>
        </div>
      </div>
    </div>
  );
}
