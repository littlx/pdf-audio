import { useState } from 'react';
import { api, setToken } from '../api/client';

export default function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [token, setLocalToken] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setToken(token);
    try {
      await api('/api/pdfs');
      onUnlock();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid access code');
    }
  }

  return (
    <main className="gate">
      <form className="card gate-card" onSubmit={submit}>
        <h1>Bilingual PDF Audio Player</h1>
        <p>Enter your access code to continue.</p>
        <input value={token} onChange={(e) => setLocalToken(e.target.value)} placeholder="Access code" type="password" autoFocus />
        {error && <p className="error">{error}</p>}
        <button type="submit">Unlock</button>
      </form>
    </main>
  );
}
