import { useEffect, useState } from 'react';
import AccessGate from './components/AccessGate';
import LibraryPage from './pages/LibraryPage';
import ConvertPage from './pages/ConvertPage';
import PlayerPage from './pages/PlayerPage';
import SettingsPage from './pages/SettingsPage';
import PdfPreviewPage from './pages/PdfPreviewPage';
import type { PdfFile } from './api/types';
import { clearToken, getToken } from './api/client';

type Route = 'library' | 'preview' | 'convert' | 'player' | 'settings';

export default function App() {
  const [unlocked, setUnlocked] = useState(Boolean(getToken()));
  const [route, setRoute] = useState<Route>((location.pathname.replace('/', '') as Route) || 'player');
  const [selectedPdf, setSelectedPdf] = useState<PdfFile | undefined>();
  const [selectedText, setSelectedText] = useState<string | undefined>();

  useEffect(() => {
    history.replaceState(null, '', `/${route}`);
  }, [route]);

  if (!unlocked) return <AccessGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="app">
      <nav className="nav">
        <h1>PDF Audio</h1>
        <button className={route === 'player' ? 'selected' : ''} onClick={() => setRoute('player')}>Player</button>
        <button className={route === 'library' ? 'selected' : ''} onClick={() => setRoute('library')}>Library</button>
        <button className={route === 'settings' ? 'selected' : ''} onClick={() => setRoute('settings')}>Settings</button>
        <button onClick={() => { clearToken(); setUnlocked(false); }}>Lock</button>
      </nav>
      {route === 'library' && <LibraryPage openPreview={(pdf) => { setSelectedPdf(pdf); setRoute('preview'); }} openConvert={(pdf) => { setSelectedPdf(pdf); setSelectedText(undefined); setRoute('convert'); }} />}
      {route === 'preview' && selectedPdf && <PdfPreviewPage pdf={selectedPdf} convertSelection={(text) => { setSelectedText(text); setRoute('convert'); }} />}
      {route === 'convert' && <ConvertPage pdf={selectedPdf} selectedText={selectedText} />}
      {route === 'player' && <PlayerPage />}
      {route === 'settings' && <SettingsPage />}
    </div>
  );
}
