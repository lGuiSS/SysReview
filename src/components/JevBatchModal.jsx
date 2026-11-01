import { useId } from 'react';
import { DialogPanel } from './Dialog.jsx';
import { useFormat } from '../i18n/format.js';
import { useTranslation } from 'react-i18next';
import { X, ListChecks, Minimize2, Settings } from 'lucide-react';
import { jevErrorMessage } from '../ai/messages.js';

const secondaryBtn = 'px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-40';
const primaryBtn = 'px-3 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-40';

const ModalShell = ({ title, onClose, children, footer, minimize = false }) => {
  const { t } = useTranslation();
  const titleId = useId();
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
    <DialogPanel onClose={onClose} labelledBy={titleId} fallbackFocus={() => document.querySelector('[data-evaluation-expand]')} className="w-full max-w-xl max-h-[90dvh] overflow-y-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl text-gray-800 dark:text-gray-200">
      <header className="flex items-center justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 id={titleId} className="font-semibold flex items-center gap-2"><ListChecks size={20} />{title}</h2>
        <button type="button" onClick={onClose} aria-label={t(minimize ? 'assist.minimize' : 'assist.close')} title={t(minimize ? 'assist.minimize' : 'assist.close')} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><X size={20} /></button>
      </header>
      <div className="p-4 space-y-4 text-sm">{children}</div>
      <footer className="p-4 flex flex-wrap justify-end gap-2">{footer}</footer>
    </DialogPanel>
  </div>;
};

export function ApplicationRulesSummary({ rule, onEditRules }) {
  const { t, i18n } = useTranslation();
  if (!rule) return null;
  const percent = value => new Intl.NumberFormat(i18n.language).format(value);
  return <section aria-label={t('assist.currentRules')} className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-3 space-y-2">
    <h3 className="font-semibold">{t('assist.currentRules')}</h3>
    {rule.mode === 'inclusive' ? <ul className="space-y-1">
      <li>{t('assist.summaryInclude', { value: percent(rule.includeAt) })}</li>
      <li>{t('assist.summaryExclude', { value: percent(rule.excludeAt) })}</li>
    </ul> : <p>{t('assist.summaryApply', { value: percent(rule.applyAt) })}</p>}
    <p className="text-xs text-gray-600 dark:text-gray-300">{t('assist.rulesExplain')}</p>
    {onEditRules && <button type="button" onClick={onEditRules} className={`${secondaryBtn} inline-flex items-center gap-2`}><Settings size={16} />{t('assist.editRules')}</button>}
  </section>;
}

export function JevBatchModal({ job, controller, rule, onEditRules }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  if (!job) return null;
  const active = ['preparing', 'ready', 'running'].includes(job.phase);
  const done = job.phase === 'done' || job.phase === 'stopped';
  const canResume = done && job.counts.cancelled > 0;
  const title = t('assist.batchTitle', { section: job.sectionTitle });
  const metadata = `${job.provider.toUpperCase()} · ${job.model} · ${t(`assist.effort.${job.effort}`, { defaultValue: job.effort })}`;
  const progress = t('assist.jobProgress', { done: job.processed, total: job.total });
  const details = <>
    <p className="text-xs text-gray-500 dark:text-gray-400 break-words">{metadata}</p>
    <p role="status" aria-live="polite">{progress} · {t(`assist.jobPhase.${job.phase}`)}</p>
    <div role="progressbar" aria-label={t('assist.progress')} aria-valuemin={0} aria-valuenow={job.processed} aria-valuemax={Math.max(1, job.total)}
      className="w-full h-3 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
      <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.min(100, Math.max(0, job.processed / Math.max(1, job.total) * 100))}%` }} />
    </div>
  </>;
  if (job.minimized) return <>
    <div className="h-44 sm:h-32" aria-hidden="true" />
    <aside aria-label={title} className="fixed bottom-3 left-3 right-3 sm:left-auto sm:w-[30rem] z-40 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-xl p-3 text-sm space-y-1">
      <p className="font-semibold">{title}</p>{details}
      {job.counts.error > 0 && <p className="text-red-600 dark:text-red-300">{t('assist.batchErrors', { count: job.counts.error })}</p>}
      <div className="flex flex-wrap gap-2 justify-end">
        <button data-evaluation-expand onClick={controller.expand} className={primaryBtn}>{t('assist.expand')}</button>
        {done && onEditRules && <button onClick={onEditRules} className={secondaryBtn}>{t('assist.editRules')}</button>}
        {canResume && <button onClick={controller.resume} className={primaryBtn}>{t('assist.batchResume')}</button>}
        {active ? <button onClick={controller.stop} className={secondaryBtn}>{t('assist.batchStop')}</button> : <button onClick={controller.dismiss} className={secondaryBtn}>{t('assist.close')}</button>}
      </div>
    </aside>
  </>;
  return <ModalShell title={title} onClose={active ? controller.minimize : controller.dismiss} minimize={active} footer={<>
    {active && <button onClick={controller.minimize} className={secondaryBtn}><Minimize2 size={16} className="inline mr-1" />{t('assist.minimize')}</button>}
    {job.phase === 'ready' && <button onClick={controller.start} className={primaryBtn} disabled={!job.total}>{t('assist.batchStart')}</button>}
    {active && <button onClick={controller.stop} className={secondaryBtn}>{t(job.phase === 'ready' ? 'assist.cancel' : 'assist.batchStop')}</button>}
    {done && job.errors.length > 0 && <button onClick={controller.retryErrors} className={secondaryBtn}>{t('assist.retryErrors')}</button>}
    {canResume && <button onClick={controller.resume} className={primaryBtn}>{t('assist.batchResume')}</button>}
    {done && <button onClick={controller.dismiss} className={primaryBtn}>{t('assist.batchClose')}</button>}
  </>}>
    {details}
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {['included', 'excluded', 'uncertain', 'needs-text', 'error', 'reused', 'queued', 'running', 'cancelled'].map(key => <div key={key} className="rounded-lg p-3 bg-gray-100 dark:bg-gray-700">
        <p className="text-xs">{t(`assist.jobCount.${key}`)}</p><p className="font-bold text-lg">{job.counts[key]}</p>
      </div>)}
    </div>
    {job.phase === 'ready' && <label className="flex gap-2 items-center"><input type="checkbox" onChange={e => controller.setReevaluate(e.target.checked)} />{t('assist.batchReevaluate')}</label>}
    <p>{t('assist.jobNoApply')}</p>
    {done && <p>{t('assist.jobApplicable', { count: job.applicable })}</p>}
    {done && <ApplicationRulesSummary rule={rule} onEditRules={onEditRules} />}
    {job.provider !== 'jev' && <p className="text-xs text-gray-500 dark:text-gray-400">{t('assist.generativeCaution')}</p>}
    {(job.error || job.errors.length > 0) && <div role="alert" className="rounded-lg bg-red-50 dark:bg-red-900/30 p-3 text-red-700 dark:text-red-300">
      {job.error && <p>{jevErrorMessage(t, job.error)}</p>}
      {job.errors.length > 0 && <details><summary>{t('assist.batchErrors', { count: job.errors.length })}</summary>
        <ul className="mt-2 space-y-2">{job.errors.map(e => <li key={e.id}><strong>{e.title}</strong><p>{jevErrorMessage(t, e.diagnostic)}</p></li>)}</ul>
      </details>}
    </div>}
    {done && <p className="text-xs">{t('assist.jobMetrics', { requests: fmt.num(job.requests), tokens: fmt.num(job.inputTokens), median: job.medianMs == null ? '—' : fmt.num(job.medianMs / 1000, 1), p95: job.p95Ms == null ? '—' : fmt.num(job.p95Ms / 1000, 1) })}</p>}
  </ModalShell>;
}

export function JevApplyModal({ sectionTitle, rule, preview, onConfirm, onClose, onEditRules }) {
  const { t } = useTranslation();
  const nothing = preview.include + preview.exclude === 0;

  return (
    <ModalShell
      title={t('assist.applyTitle', { section: sectionTitle })}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={secondaryBtn}>{t('assist.cancel')}</button>
          <button onClick={onConfirm} disabled={nothing} className={primaryBtn}>{t('assist.applyConfirm')}</button>
        </>
      }
    >
      <ApplicationRulesSummary rule={rule} onEditRules={onEditRules} />
      {nothing ? (
        <p className="font-medium">{t('assist.applyNothing')}</p>
      ) : (
        <ul className="space-y-1 list-disc pl-5">
          <li className="text-green-700 dark:text-green-300">{t('assist.applyInclude', { count: preview.include })}</li>
          <li className="text-red-700 dark:text-red-300">{t('assist.applyExclude', { count: preview.exclude })}</li>
          <li>{t('assist.applyRemaining', { count: preview.remaining })}</li>
        </ul>
      )}
    </ModalShell>
  );
}
