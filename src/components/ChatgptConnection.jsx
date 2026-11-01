import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chatgptRequest } from '../ai/chatgptClient.js';

export function ChatgptConnection({ model, onModelChange, onConnectedChange, provider = 'chatgpt' }) {
  const { t } = useTranslation();
  const [connection, setConnection] = useState(null);
  const [models, setModels] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const catalogFor = useRef(null);
  useEffect(() => {
    let active = true;
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const status = await chatgptRequest('status', { provider });
        if (!active) return;
        setConnection(status); onConnectedChange(status.connected);
        window.dispatchEvent(new CustomEvent('sysreview-ai-connection', { detail: { provider, connectionId: status.connectionId } }));
        setError(status.error || '');
        if (status.connected && catalogFor.current !== `${provider}:${status.connectionId}`) {
          const catalog = await chatgptRequest('models', { provider });
          if (active) { setModels(catalog.models); catalogFor.current = `${provider}:${status.connectionId}`; }
        } else if (!status.connected) { setModels([]); catalogFor.current = null; }
      } catch (e) {
        if (active) {
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
  return <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
    <p>{t('assist.chatgptHint')}</p>
    <p role="status">{connection?.connected ? t('assist.chatgptConnected', { email: connection.email || provider }) : t('assist.aiDisconnected', { provider: 'ChatGPT' })}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={connect} disabled={busy || connection?.configured === false} className="px-3 py-2 rounded-lg border border-gray-400 disabled:opacity-50">{t('assist.chatgptContinue')}</button>
      {connection?.connected && <button type="button" onClick={disconnect} disabled={busy} className="px-3 py-2 rounded-lg border border-gray-400">{t('assist.chatgptDisconnect')}</button>}
    </div>
    <label className="block">{t('assist.model')}
      <select value={model || ''} onChange={e => onModelChange(e.target.value)} className="mt-1 w-full p-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-400">
        <option value="">{t('assist.chatgptChooseModel')}</option>
        {model && !models.some(m => m.slug === model) && <option value={model}>{model}</option>}
        {models.map(m => <option key={m.slug} value={m.slug}>{m.display_name}</option>)}
      </select>
    </label>
    {error && <p role="alert" className="text-red-600 dark:text-red-300">{error}</p>}
  </div>;
}
