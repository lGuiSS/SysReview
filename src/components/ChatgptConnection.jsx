import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chatgptRequest } from '../ai/chatgptClient.js';

export function ChatgptConnection({ model, onModelChange, onConnectedChange, provider = 'chatgpt' }) {
  const { t } = useTranslation();
  const [connection, setConnection] = useState(null);
  const [models, setModels] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Só libera o login com o serviço local respondendo; sem ele a aba de OAuth abriria e fecharia na hora
  const [serviceUp, setServiceUp] = useState(false);
  const catalogFor = useRef(null);
  // O retorno do OAuth só aceita 127.0.0.1: em localhost o serviço recusa o login
  const loopbackUrl = window.location.hostname === 'localhost' ? window.location.href.replace('//localhost', '//127.0.0.1') : null;
  useEffect(() => {
    let active = true;
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const status = await chatgptRequest('status', { provider });
        if (!active) return;
        setServiceUp(true);
        setConnection(status); onConnectedChange(status.connected);
        window.dispatchEvent(new CustomEvent('sysreview-ai-connection', { detail: { provider, connectionId: status.connectionId } }));
        setError(status.error || '');
        if (status.connected && catalogFor.current !== `${provider}:${status.connectionId}`) {
          const catalog = await chatgptRequest('models', { provider });
          if (active) { setModels(catalog.models); catalogFor.current = `${provider}:${status.connectionId}`; }
        } else if (!status.connected) { setModels([]); catalogFor.current = null; }
      } catch (e) {
        if (active) {
          if (e.code === 'ai-service') setServiceUp(false);
          setError(e.code === 'ai-service' ? t('assist.chatgptService') : e.message); onConnectedChange(false);
          if (['ai-auth', 'connection-changed'].includes(e.code)) {
            setConnection(previous => previous ? { ...previous, connected: false } : null);
            catalogFor.current = null; setModels([]);
            window.dispatchEvent(new CustomEvent('sysreview-ai-connection', { detail: { provider, connectionId: null } }));
          }
        }
      } finally { loading = false; }
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [onConnectedChange, t, provider]);
  const connect = async () => {
    // Open on the user gesture so browsers allow the OAuth tab.
    const popup = window.open('about:blank', '_blank');
    if (!popup) { setError(t('assist.chatgptPopup')); return; }
    popup.opener = null;
    setBusy(true); setError('');
    try {
      const { url } = await chatgptRequest('start', { body: {}, provider });
      popup.location.href = url;
    } catch (e) { popup.close(); setError(e.code === 'ai-service' ? t('assist.chatgptService') : e.message); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      await chatgptRequest('logout', { body: {}, provider });
      setConnection(null); setModels([]); onConnectedChange(false);
      window.dispatchEvent(new CustomEvent('sysreview-ai-connection', { detail: { provider, connectionId: null } }));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const isConnected = !!connection?.connected;
  const buttonCls = 'px-3 py-2 text-sm font-medium rounded-lg border-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return <div className="space-y-4 text-sm text-gray-700 dark:text-gray-200">
    <p className="text-xs text-gray-500 dark:text-gray-400">{t('assist.chatgptHint')}</p>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
      <p role="status" className="flex items-center gap-2 min-w-0">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-500'}`} />
        <span className="truncate">{isConnected ? t('assist.chatgptConnected', { email: connection.email || provider }) : t('assist.aiDisconnected', { provider: 'ChatGPT' })}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {!isConnected && <button type="button" onClick={connect} disabled={busy || !serviceUp || !!loopbackUrl || connection?.configured === false} className={`${buttonCls} bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-500 dark:hover:bg-indigo-600`}>{t('assist.chatgptContinue')}</button>}
        {isConnected && <button type="button" onClick={disconnect} disabled={busy} className={`${buttonCls} bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200`}>{t('assist.chatgptDisconnect')}</button>}
      </div>
    </div>
    {loopbackUrl && <p role="status" className="rounded-lg px-3 py-2.5 text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-900/30">
      {t('assist.chatgptUseLoopback')}{' '}
      <a href={loopbackUrl} className="font-medium underline">{loopbackUrl}</a>
    </p>}
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('assist.model')}
      <select value={model || ''} onChange={e => onModelChange(e.target.value)} className="mt-1.5 w-full px-3 py-2 text-sm font-normal rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
        <option value="">{t('assist.chatgptChooseModel')}</option>
        {model && !models.some(m => m.slug === model) && <option value={model}>{model}</option>}
        {models.map(m => <option key={m.slug} value={m.slug}>{m.display_name}</option>)}
      </select>
    </label>
    {error && <p role="alert" className="rounded-lg px-3 py-2 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30">{error}</p>}
  </div>;
}
