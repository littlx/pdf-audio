import { useEffect, useState } from 'react';
import {
  BookOpen,
  CircleHelp,
  FileAudio,
  LayoutDashboard,
  Library,
  LifeBuoy,
  Lock,
  Plus,
  Settings,
} from 'lucide-react';
import AccessGate from './components/AccessGate';
import LibraryPage from './pages/LibraryPage';
import ConvertPage from './pages/ConvertPage';
import PlayerPage from './pages/PlayerPage';
import SettingsPage from './pages/SettingsPage';
import PdfPreviewPage from './pages/PdfPreviewPage';
import type { PdfFile } from './api/types';
import { clearToken, getToken } from './api/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Route = 'library' | 'preview' | 'convert' | 'player' | 'settings';

type NavItem = {
  route: Route;
  label: string;
  icon: typeof LayoutDashboard;
};

const navItems: NavItem[] = [
  { route: 'player', label: 'Overview', icon: LayoutDashboard },
  { route: 'library', label: 'Library', icon: Library },
  { route: 'convert', label: 'Convert', icon: FileAudio },
  { route: 'settings', label: 'Setting', icon: Settings },
];

const routeTitles: Record<Route, string> = {
  player: 'Overview',
  library: 'Library',
  preview: 'Preview',
  convert: 'Convert',
  settings: 'Setting',
};

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
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-mark" aria-label="PDF Audio">
          <BookOpen size={22} strokeWidth={2.2} />
        </div>

        <nav className="side-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const selected = route === item.route || (item.route === 'library' && route === 'preview');
            return (
              <Button
                key={item.route}
                type="button"
                variant="ghost"
                size="sm"
                className={cn('side-nav-item', selected && 'is-active')}
                onClick={() => setRoute(item.route)}
              >
                <Icon size={16} strokeWidth={2} />
                <span>{item.label}</span>
              </Button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <Button variant="ghost" size="sm" className="side-nav-item muted-nav">
            <CircleHelp size={16} strokeWidth={2} />
            <span>User Guide</span>
          </Button>
          <Button variant="ghost" size="sm" className="side-nav-item muted-nav">
            <LifeBuoy size={16} strokeWidth={2} />
            <span>Support</span>
          </Button>
          <Button variant="ghost" size="sm" className="side-nav-item muted-nav" onClick={() => { clearToken(); setUnlocked(false); }}>
            <Lock size={16} strokeWidth={2} />
            <span>Lock</span>
          </Button>
        </div>
      </aside>

      <main className="workspace">
        {route !== 'convert' && route !== 'settings' && (
          <header className="topbar">
            <div className="topbar-title">
              <span>{routeTitles[route]}</span>
            </div>
            <Button className="admin-cta" size="sm" onClick={() => setRoute(selectedPdf ? 'convert' : 'library')}>
              <Plus size={14} strokeWidth={2.4} />
              {selectedPdf ? 'New Audio' : 'Add PDF'}
            </Button>
          </header>
        )}

        {route === 'library' && <LibraryPage openPreview={(pdf) => { setSelectedPdf(pdf); setRoute('preview'); }} openConvert={(pdf) => { setSelectedPdf(pdf); setSelectedText(undefined); setRoute('convert'); }} />}
        {route === 'preview' && selectedPdf && <PdfPreviewPage pdf={selectedPdf} convertSelection={(text) => { setSelectedText(text); setRoute('convert'); }} />}
        {route === 'convert' && <ConvertPage pdf={selectedPdf} selectedText={selectedText} />}
        {route === 'player' && <PlayerPage />}
        {route === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
