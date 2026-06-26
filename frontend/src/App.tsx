import { useEffect, useState } from 'react';
import { BookOpen, Lock, Settings, FileText, Headphones, Wand2, ShieldAlert } from 'lucide-react';
import AccessGate from './components/AccessGate';
import LibraryPane from './components/LibraryPane';
import PdfReaderPane from './components/PdfReaderPane';
import ConvertPane from './components/ConvertPane';
import GlobalPlayer from './components/GlobalPlayer';
import SubtitleDrawer from './components/SubtitleDrawer';
import SettingsDrawer from './components/SettingsDrawer';
import MediaPane from './components/MediaPane';
import type { PdfFile, Task, AudioFile, SubtitleEntry, AppSettings } from './api/types';
import { api, clearOfflineCaches, clearToken, getToken } from './api/client';
import { Button } from '@/components/ui/button';
import { translations } from './i18n';
import type { Language } from './i18n';

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('app-language') as Language) || 'zh';
  });

  const t = (key: keyof typeof translations['zh']) => {
    return translations[lang][key] || translations['en'][key] || key;
  };

  const handleLanguageChange = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('app-language', newLang);
  };

  const [unlocked, setUnlocked] = useState(Boolean(getToken()));
  const [selectedPdf, setSelectedPdf] = useState<PdfFile | undefined>(undefined);
  const [selectedText, setSelectedText] = useState('');
  const [activeAudio, setActiveAudio] = useState<AudioFile | null>(null);
  const [leftTab, setLeftTab] = useState<'library' | 'media' | 'reader'>('library');
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // Settings Drawer and Theme States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Global Player States
  const [activeSub, setActiveSub] = useState<SubtitleEntry | null>(null);
  const [subs, setSubs] = useState<SubtitleEntry[]>([]);
  const [isSubtitlesOpen, setIsSubtitlesOpen] = useState(false);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [hideEn, setHideEn] = useState(false);
  const [hideZh, setHideZh] = useState(false);
  const [dictation, setDictation] = useState(false);

  // Sync theme
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Load settings on unlock
  useEffect(() => {
    if (!unlocked) return;
    api<AppSettings>('/api/settings')
      .then((data) => {
        setIsDark(Boolean(data.dark_mode));
      })
      .catch(() => undefined);
  }, [unlocked]);

  // Periodically fetch global active tasks
  useEffect(() => {
    if (!unlocked) return;
    const loadTasks = () =>
      api<Task[]>('/api/tasks')
        .then(setTasks)
        .catch(() => undefined);
    loadTasks();
    const timer = setInterval(loadTasks, 5000);
    return () => clearInterval(timer);
  }, [unlocked]);

  // Load initial audio file
  useEffect(() => {
    if (!unlocked) return;
    api<AudioFile[]>('/api/audios')
      .then((list) => {
        if (list && list.length > 0) {
          setActiveAudio(list[0]);
        }
      })
      .catch(() => undefined);
  }, [unlocked]);

  // If selectedPdf changes, sync left tab to 'reader'
  useEffect(() => {
    if (selectedPdf) {
      setLeftTab('reader');
    } else {
      setLeftTab('library');
    }
  }, [selectedPdf]);

  if (!unlocked) {
    return (
      <AccessGate
        onUnlock={() => setUnlocked(true)}
        t={t}
        lang={lang}
        onLanguageChange={handleLanguageChange}
      />
    );
  }

  const activeTasks = tasks.filter((task) => !['completed', 'canceled'].includes(task.status));
  const failedTasks = tasks.filter((task) => task.status === 'failed');

  function handleSelectPdf(pdf: PdfFile) {
    setSelectedPdf(pdf);
  }

  function handleOpenConvert(pdf: PdfFile) {
    setSelectedPdf(pdf);
  }

  function handleSendToConvert(text: string) {
    setSelectedText(text);
  }

  function handleConversionComplete(audio: AudioFile) {
    // When conversion completes, load audio into player and auto-open subtitle drawer
    setActiveAudio(audio);
    setIsSubtitlesOpen(true);
  }

  function handleLogout() {
    clearToken();
    clearOfflineCaches();
    setUnlocked(false);
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
          <Button variant="ghost" size="sm" onClick={handleLogout} className="header-btn is-lock">
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
            </div>
            {selectedPdf && leftTab === 'reader' && (
              <div className="pane-header-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPdf(undefined)}
                  className="text-[11px] h-7 px-2"
                >
                  {t('closeFile')}
                </Button>
              </div>
            )}
          </div>

          <div className="pane-content">
            <div style={{ display: leftTab === 'library' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }}>
              <LibraryPane
                activePdfId={selectedPdf?.id}
                onSelectPdf={handleSelectPdf}
                onOpenConvert={handleOpenConvert}
                t={t}
              />
            </div>
            <div style={{ display: leftTab === 'media' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }}>
              <MediaPane
                activeAudio={activeAudio}
                onSelectAudio={setActiveAudio}
                t={t}
              />
            </div>
            {selectedPdf && (
              <div style={{ display: leftTab === 'reader' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }}>
                <PdfReaderPane pdf={selectedPdf} onSendToConvert={handleSendToConvert} />
              </div>
            )}
          </div>
        </section>

        {/* Right Workspace Panel: Convert Workspace (Dedicated) */}
        <section className="workspace-pane">
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
              initialText={selectedText}
              onConversionComplete={handleConversionComplete}
              t={t}
            />
          </div>
        </section>
      </main>

      {/* Global Bottom Audio Player */}
      <GlobalPlayer
        activeAudio={activeAudio}
        onOpenSubtitles={() => setIsSubtitlesOpen(!isSubtitlesOpen)}
        isSubtitlesOpen={isSubtitlesOpen}
        onSubtitlesLoaded={setSubs}
        activeSub={activeSub}
        setActiveSub={setActiveSub}
        seekTime={seekTime}
        onSeekReset={() => setSeekTime(null)}
        hideEn={hideEn}
        hideZh={hideZh}
        dictation={dictation}
        setHideEn={setHideEn}
        setHideZh={setHideZh}
        setDictation={setDictation}
        t={t}
      />

      {/* Drawer overlay for all subtitles */}
      <SubtitleDrawer
        isOpen={isSubtitlesOpen}
        onClose={() => setIsSubtitlesOpen(false)}
        subs={subs}
        activeSub={activeSub}
        onSeek={setSeekTime}
        hideEn={hideEn}
        hideZh={hideZh}
        dictation={dictation}
        setHideEn={setHideEn}
        setHideZh={setHideZh}
        setDictation={setDictation}
        t={t}
      />

      {/* Settings Panel */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onThemeChange={(dark) => setIsDark(dark)}
        lang={lang}
        onLanguageChange={handleLanguageChange}
        t={t}
      />
    </div>
  );
}
