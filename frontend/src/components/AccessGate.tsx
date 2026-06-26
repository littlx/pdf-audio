import { useState } from 'react';
import { Lock } from 'lucide-react';
import { api, clearOfflineCaches, clearToken, setToken } from '../api/client';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import LanguageToggle from './LanguageToggle';

export default function AccessGate({
  onUnlock,
}: {
  onUnlock: () => void;
}) {
  const { t } = useT();
  const [token, setLocalToken] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setToken(token);
    try {
      await api('/api/pdfs');
      onUnlock();
    } catch (err) {
      clearToken();
      clearOfflineCaches();
      setError(err instanceof Error ? err.message : t('invalidAccessCode'));
    }
  }

  return (
    <main className="gate-container">
      <form className="gate-minimal-form" onSubmit={submit}>
        <div className="gate-logo">
          <Lock size={20} />
        </div>
        
        <div className="text-center flex flex-col gap-1">
          <h1 className="text-lg font-extrabold tracking-tight">Bilingual PDF Audio</h1>
          <p className="text-xs text-muted-foreground">{t('enterAccessCode')}</p>
        </div>

        <div className="flex flex-col gap-1.5 text-left w-full mt-2">
          <label htmlFor="access-code" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">
            {t('accessCode')}
          </label>
          <input
            id="access-code"
            value={token}
            onChange={(e) => setLocalToken(e.target.value)}
            placeholder="••••••••"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(error)}
            autoFocus
            className="w-full h-10 text-xs text-center"
          />
        </div>

        {error && (
          <p className="text-xs font-bold text-destructive bg-destructive/10 p-2 rounded border border-destructive/20 w-full text-center" role="alert">
            {error}
          </p>
        )}
        
        <Button type="submit" className="btn-primary-gradient w-full h-10 text-xs font-bold mt-2">
          {t('unlockDashboard')}
        </Button>

        {/* Small Language Switcher Toggle */}
        <LanguageToggle size="xs" showIcon={true} centered={true} />
      </form>
    </main>
  );
}
