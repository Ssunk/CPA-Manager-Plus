import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import { usePanelFeatureAvailability } from '@/hooks/usePanelFeatureAvailability';
import { usageServiceApi, type AutomationStatus } from '@/services/api/usageService';
import { useAuthStore, useNotificationStore } from '@/stores';
import styles from './AutomationSettingsPage.module.scss';

type CapabilityKey = 'quotaCooldown' | 'accountActions' | 'accountActionsAutoDisable';

export function AutomationSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const managementKey = useAuthStore((state) => state.managementKey);
  const { showNotification } = useNotificationStore();
  const featureAvailability = usePanelFeatureAvailability();
  const managerBase = featureAvailability.managerServiceBase;

  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!managerBase || !managementKey) return;
    setLoading(true);
    setError('');
    try {
      const data = await usageServiceApi.getAutomationStatus(managerBase, managementKey);
      setStatus(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || 'request failed');
      setError(message);
      showNotification(
        t('automation.load_failed', { message, defaultValue: `Load failed: ${message}` }),
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [managerBase, managementKey, showNotification, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const renderCapabilityCard = (key: CapabilityKey) => {
    const capability = status?.[key];
    if (!capability) return null;
    const enabled = Boolean(capability.enabled);
    const dependencyUnmet = Boolean(
      key === 'accountActionsAutoDisable' && status && !status.accountActions.enabled
    );

    return (
      <section className={styles.card} key={key}>
        <header className={styles.cardHeader}>
          <div className={styles.cardHeading}>
            <h2 className={styles.cardTitle}>{t(`automation.${key}_title`)}</h2>
            <span
              className={`${styles.badge} ${enabled ? styles.badgeOn : styles.badgeOff}`}
              data-testid={`automation-${key}-badge`}
            >
              {enabled
                ? t('automation.state_on', { defaultValue: 'On' })
                : t('automation.state_off', { defaultValue: 'Off' })}
            </span>
          </div>
          <p className={styles.cardDescription}>{t(`automation.${key}_description`)}</p>
        </header>

        <dl className={styles.metaList}>
          <div className={styles.metaRow}>
            <dt>{t('automation.meta_config_key', { defaultValue: 'Config key' })}</dt>
            <dd>
              <code>{capability.configFileKey}</code>
            </dd>
          </div>
          <div className={styles.metaRow}>
            <dt>{t('automation.meta_env_key', { defaultValue: 'Environment variable' })}</dt>
            <dd>
              <code>{capability.envKey}</code>
            </dd>
          </div>
        </dl>

        <ul className={styles.behaviorList}>
          {(
            t(`automation.${key}_behavior`, {
              returnObjects: true,
              defaultValue: [],
            }) as string[]
          ).map((line: string, idx: number) => (
            <li key={`${key}-behavior-${idx}`}>{line}</li>
          ))}
        </ul>

        {dependencyUnmet ? (
          <p className={styles.dependencyNote}>
            {t('automation.accountActionsAutoDisable_dependency_note')}
          </p>
        ) : null}

        {key === 'accountActions' ? (
          <div className={styles.cardActions}>
            <Button variant="ghost" size="sm" onClick={() => navigate('/monitoring/account-actions')}>
              {t('automation.open_pending_accounts', { defaultValue: 'Open Pending Accounts' })}
            </Button>
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <p className={styles.kicker}>{t('automation.eyebrow', { defaultValue: 'Automation' })}</p>
          <h1 className={styles.title}>{t('automation.title')}</h1>
          <p className={styles.description}>{t('automation.description')}</p>
        </div>
        <div className={styles.heroActions}>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <IconRefreshCw size={14} />
            {t('automation.refresh', { defaultValue: 'Refresh' })}
          </Button>
        </div>
      </section>

      <section className={styles.note}>
        {t('automation.readonly_note', {
          defaultValue:
            'These switches are read-only here. Configure them via environment variables or config.json and restart the service.',
        })}
      </section>

      {error ? (
        <div className={styles.errorState}>
          <strong>{t('automation.load_failed_title', { defaultValue: 'Load failed' })}</strong>
          <span>{error}</span>
        </div>
      ) : (
        <div className={styles.cards}>
          {(['quotaCooldown', 'accountActions', 'accountActionsAutoDisable'] as CapabilityKey[]).map(
            renderCapabilityCard
          )}
        </div>
      )}
    </div>
  );
}
