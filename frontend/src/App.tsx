import { useEffect, useState } from 'react';
import { BookOpen, Lock, Settings, FileText, Headphones, Wand2 } from 'lucide-react';
import AccessGate from './components/AccessGate';
import LibraryPane from './components/LibraryPane';
import PdfReaderPane from './components/PdfReaderPane';
import ConvertPane from './components/ConvertPane';
import GlobalPlayer from './components/GlobalPlayer';
import SubtitleDrawer from './components/SubtitleDrawer';
import SettingsDrawer from './components/SettingsDrawer';
import MediaPane from './components/MediaPane';
import type { PdfFile, AudioFile } from './api/types';
import { clearOfflineCaches, clearToken, getToken } from './api/client';
import { Button } from '@/components/ui/button';

import { I18nProvider, useT } from './context/I18nContext';
import { SettingsProvider } from './context/SettingsContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';

function DashboardContent({
  unlocked,
  onUnlock,
  onLogout,
}: {
  unlocked: boolean;
  onUnlock: () => void;
  onLogout: () => void;
}) {
  const { t } = useT();
  const {
    activeAudio,
    setActiveAudio,
    setIsSubtitlesOpen,
  } = usePlayer();

  const [selectedPdf, setSelectedPdf] = useState<PdfFile | undefined>(undefined);
  const [leftTab, setLeftTab] = useState<'library' | 'media' | 'reader' | 'convert'>('library');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // If selectedPdf changes, sync left tab to 'reader'
  useEffect(() => {
    if (selectedPdf) {
      if (leftTab !== 'convert') {
        setLeftTab('reader');
      }
    } else {
      if (leftTab === 'reader' || leftTab === 'convert') {
        setLeftTab('library');
      }
    }
  }, [selectedPdf]);

  if (!unlocked) {
    return <AccessGate onUnlock={onUnlock} />;
  }

  function handleConversionComplete(audio: AudioFile) {
    setActiveAudio(audio);
    setIsSubtitlesOpen(true);
  }

  return (
    <div className="dashboard-container">
      {/* Header Bar */}
      <header className="dashboard-header">
        <div className="brand-section">
          <div className="brand-logo">
            <BookOpen size={16} strokeWidth={2.5} />
          </div>
          <span className="brand-title">Bilingual PDF Audio</span>
        </div>

        <div className="header-actions">
          <Button variant="ghost" size="sm" onClick={() => setIsSettingsOpen(true)} className="header-btn">
            <Settings size={14} />
            <span>{t('settings')}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onLogout} className="header-btn is-lock">
            <Lock size={14} />
            <span>{t('lock')}</span>
          </Button>
        </div>
      </header>

      {/* Workspace Grid */}
      <main className={`dashboard-workspace ${activeAudio ? 'has-player' : ''}`}>
        {/* Left Workspace Panel: Documents & Reader */}
        <section className="workspace-pane">
          <div className="pane-tabs">
            <div className="pane-tab-list">
              <button
                className={`pane-tab-btn ${leftTab === 'library' ? 'is-active' : ''}`}
                onClick={() => setLeftTab('library')}
              >
                <BookOpen size={13} />
                <span>{t('documents')}</span>
              </button>
              <button
                className={`pane-tab-btn ${leftTab === 'media' ? 'is-active' : ''}`}
                onClick={() => setLeftTab('media')}
              >
                <Headphones size={13} />
                <span>{t('mediaLibrary')}</span>
              </button>
              <button
                className={`pane-tab-btn ${leftTab === 'reader' ? 'is-active' : ''}`}
                onClick={() => {
                  if (selectedPdf) setLeftTab('reader');
                }}
                disabled={!selectedPdf}
                title={!selectedPdf ? t('uploadFirstError') : t('pdfReader')}
              >
                <FileText size={13} />
                <span>{t('pdfReader')}</span>
              </button>
              <button
                className={`pane-tab-btn mobile-only-tab-btn ${leftTab === 'convert' ? 'is-active' : ''}`}
                onClick={() => setLeftTab('convert')}
              >
                <Wand2 size={13} />
                <span>{t('convertPdf')}</span>
              </button>
            </div>
          </div>

          <div className="pane-content">
            <div style={{ display: leftTab === 'library' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }}>
              <LibraryPane
                activePdfId={selectedPdf?.id}
                onSelectPdf={setSelectedPdf}
                onOpenConvert={(pdf) => {
                  setSelectedPdf(pdf);
                  if (window.innerWidth < 1100) {
                    setLeftTab('convert');
                  }
                }}
              />
            </div>
            <div style={{ display: leftTab === 'media' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }}>
              <MediaPane />
            </div>
            {selectedPdf && (
              <div style={{ display: leftTab === 'reader' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }}>
                <PdfReaderPane pdf={selectedPdf} />
              </div>
            )}
            <div style={{ display: leftTab === 'convert' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }}>
              <ConvertPane
                pdf={selectedPdf}
                onConversionComplete={handleConversionComplete}
              />
            </div>
          </div>
        </section>

        {/* Right Workspace Panel: Convert Workspace (Dedicated) */}
        <section className="workspace-pane desktop-only-pane">
          <div className="pane-tabs">
            <div className="pane-tab-list">
              <span className="pane-tab-btn is-active">
                <Wand2 size={13} className="text-ring" />
                <span>{t('convertPdf')}</span>
              </span>
            </div>
          </div>

          <div className="pane-content">
            <ConvertPane
              pdf={selectedPdf}
              onConversionComplete={handleConversionComplete}
            />
          </div>
        </section>
      </main>

      {/* Global Bottom Audio Player */}
      <GlobalPlayer />

      {/* Drawer overlay for all subtitles */}
      <SubtitleDrawer />

      {/* Settings Panel */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

import { ToastProvider } from './context/ToastContext';

export default function App() {
  const [unlocked, setUnlocked] = useState(Boolean(getToken()));

  const handleUnlock = () => setUnlocked(true);
  const handleLogout = () => {
    clearToken();
    clearOfflineCaches();
    setUnlocked(false);
  };

  return (
    <I18nProvider>
      <SettingsProvider unlocked={unlocked}>
        <PlayerProvider unlocked={unlocked}>
          <ToastProvider>
            <DashboardContent
              unlocked={unlocked}
              onUnlock={handleUnlock}
              onLogout={handleLogout}
            />
          </ToastProvider>
        </PlayerProvider>
      </SettingsProvider>
    </I18nProvider>
  );
}
