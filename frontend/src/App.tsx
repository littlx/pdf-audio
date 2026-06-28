import { useEffect, useState } from 'react';
import { BookOpen, Lock, Settings, FileText, Headphones, Volume2, List, Download } from 'lucide-react';
import AccessGate from './components/AccessGate';
import LibraryPane from './components/LibraryPane';
import PdfReaderPane from './components/PdfReaderPane';
import ConvertPane from './components/ConvertPane';
import TaskManagerPane from './components/TaskManagerPane';
import GlobalPlayer from './components/GlobalPlayer';
import SubtitleDrawer from './components/SubtitleDrawer';
import SettingsDrawer from './components/SettingsDrawer';
import MediaPane from './components/MediaPane';
import type { PdfFile, AudioFile, Task } from './api/types';
import { clearLocalAppState, clearOfflineCaches, clearToken, getToken } from './api/client';
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
  const { t, lang } = useT();
  const {
    activeAudio,
    setActiveAudio,
    setIsSubtitlesOpen,
  } = usePlayer();

  const [selectedPdf, setSelectedPdf] = useState<PdfFile | undefined>(undefined);
  const [leftTab, setLeftTab] = useState<'library' | 'media' | 'reader' | 'convert' | 'tasks'>('library');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [taskListVersion, setTaskListVersion] = useState(0);
  const [pdfJumpTrigger, setPdfJumpTrigger] = useState<{ page: number; ts: number } | undefined>(undefined);

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone);

  const handleJumpToPdfPage = (page: number) => {
    setPdfJumpTrigger({ page, ts: Date.now() });
    setLeftTab('reader');
  };

  // Handle PWA installation prompt
  useEffect(() => {
    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

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

  function handleTaskCreated(_task: Task) {
    setTaskListVersion((version) => version + 1);
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
          {installPrompt && (
            <Button variant="ghost" size="sm" onClick={handleInstallClick} className="header-btn text-ring">
              <Download size={14} />
              <span>{t('installApp') || '安装应用'}</span>
            </Button>
          )}
          {isIOS && !isStandalone && (
            <Button variant="ghost" size="sm" onClick={() => setShowIosGuide(true)} className="header-btn text-ring">
              <Download size={14} />
              <span>{t('installApp') || '安装应用'}</span>
            </Button>
          )}
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
              {selectedPdf && (
                <button
                  className={`pane-tab-btn ${leftTab === 'reader' ? 'is-active' : ''}`}
                  onClick={() => setLeftTab('reader')}
                >
                  <FileText size={13} />
                  <span>{t('pdfReader')}</span>
                </button>
              )}
              <button
                className={`pane-tab-btn mobile-only-tab-btn ${leftTab === 'convert' ? 'is-active' : ''}`}
                onClick={() => setLeftTab('convert')}
              >
                <Volume2 size={13} />
                <span>{t('tts') || 'TTS'}</span>
              </button>
              <button
                className={`pane-tab-btn ${leftTab === 'tasks' ? 'is-active' : ''}`}
                onClick={() => setLeftTab('tasks')}
              >
                <List size={13} />
                <span>{t('taskManager') || '任务管理'}</span>
              </button>
            </div>
          </div>

          <div className={`pane-content ${leftTab === 'reader' ? 'no-scroll-layout' : ''}`}>
            <div style={{ display: leftTab === 'library' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }} className="pane-fade-in">
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
            <div style={{ display: leftTab === 'media' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }} className="pane-fade-in">
              <MediaPane />
            </div>
             {selectedPdf && (
              <div style={{ display: leftTab === 'reader' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} className="pane-fade-in">
                <PdfReaderPane key={selectedPdf.id} pdf={selectedPdf} jumpPageTrigger={pdfJumpTrigger} />
              </div>
            )}
            <div style={{ display: leftTab === 'convert' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }} className="pane-fade-in">
              <ConvertPane
                key={selectedPdf?.id ?? 'no-pdf-mobile'}
                pdf={selectedPdf}
                onConversionComplete={handleConversionComplete}
                onTaskCreated={handleTaskCreated}
                onJumpToPdfPage={handleJumpToPdfPage}
              />
            </div>
            <div style={{ display: leftTab === 'tasks' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }} className="pane-fade-in">
              <TaskManagerPane refreshKey={taskListVersion} active={leftTab === 'tasks'} />
            </div>
          </div>
        </section>

        {/* Right Workspace Panel: Convert Workspace (Dedicated) */}
        <section className="workspace-pane desktop-only-pane">
          <div className="pane-tabs">
            <div className="pane-tab-list">
              <span className="pane-tab-btn is-active">
                <Volume2 size={13} className="text-ring" />
                <span>{t('tts') || 'TTS'}</span>
              </span>
            </div>
          </div>

          <div className="pane-content">
            <ConvertPane
              key={selectedPdf?.id ?? 'no-pdf-desktop'}
              pdf={selectedPdf}
              onConversionComplete={handleConversionComplete}
              onTaskCreated={handleTaskCreated}
              onJumpToPdfPage={handleJumpToPdfPage}
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

      {/* iOS PWA Installation Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Download size={18} className="text-ring" />
              {lang === 'zh' ? '安装到主屏幕' : 'Add to Home Screen'}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {lang === 'zh' 
                ? '在 iOS Safari 上，您可以将应用添加到主屏幕以获得原生的全屏体验和离线学习支持。' 
                : 'On iOS Safari, you can install the app to your Home Screen for a native full-screen experience and offline support.'}
            </p>
            <div className="flex flex-col gap-3 my-2 text-xs">
              <div className="flex items-start gap-3 bg-muted/40 p-3 rounded-lg border border-border/40">
                <span className="flex items-center justify-center bg-ring/10 text-ring w-5 h-5 rounded-full font-mono text-[10px] shrink-0 font-bold">1</span>
                <div>
                  <p className="font-semibold text-foreground">
                    {lang === 'zh' ? '在 Safari 浏览器中点击“分享”按钮' : 'Tap the "Share" button in Safari'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    {lang === 'zh' ? '通常位于屏幕底部，图标为：' : 'Usually at the bottom of the screen, icon looks like: '}
                    <svg className="w-4 h-4 inline-block text-ring" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 10.742l1.506 3.012 3.012-1.506-1.506-3.012A3 3 0 118.684 10.742z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 2v12m0-12l-4 4m4-4l4 4" />
                    </svg>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-muted/40 p-3 rounded-lg border border-border/40">
                <span className="flex items-center justify-center bg-ring/10 text-ring w-5 h-5 rounded-full font-mono text-[10px] shrink-0 font-bold">2</span>
                <div>
                  <p className="font-semibold text-foreground">
                    {lang === 'zh' ? '在弹出的菜单中选择“添加到主屏幕”' : 'Select "Add to Home Screen" from the menu'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {lang === 'zh' ? '向下滑动找到带有“➕”图标的选项。' : 'Scroll down to find the option with the "➕" icon.'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-muted/40 p-3 rounded-lg border border-border/40">
                <span className="flex items-center justify-center bg-ring/10 text-ring w-5 h-5 rounded-full font-mono text-[10px] shrink-0 font-bold">3</span>
                <div>
                  <p className="font-semibold text-foreground">
                    {lang === 'zh' ? '点击右上角的“添加”按钮确认' : 'Click the "Add" button in the top right'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {lang === 'zh' ? '应用图标将出现在您的 iPhone/iPad 桌面上。' : 'The app icon will then appear on your home screen.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button onClick={() => setShowIosGuide(false)} className="btn-primary-gradient w-full py-2 text-xs font-semibold">
                {lang === 'zh' ? '我知道了' : 'Got it'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { ToastProvider } from './context/ToastContext';

export default function App() {
  const [unlocked, setUnlocked] = useState(Boolean(getToken()));

  const handleUnlock = () => setUnlocked(true);
  const handleLogout = async () => {
    await clearToken();
    clearLocalAppState();
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
