import { useEffect, useRef, useState } from 'react';
import { Download, FileDown, Headphones, Repeat2, SkipBack, SkipForward, Wifi, ListMusic, MoreVertical, Play, Pause } from 'lucide-react';
import { getPlayback, getSubtitlesByUrl, savePlayback } from '../api/audios';
import { getToken } from '../api/client';
import { findSubtitleIndexAtTime } from '../lib/subtitles';
import { OFFLINE_CACHE_NAME } from '../lib/storageKeys';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { formatTime } from '../lib/utils';

export default function GlobalPlayer() {
  const { t } = useT();
  const { toast } = useToast();
  const {
    activeAudio,
    isPlaying,
    setIsPlaying,
    isSubtitlesOpen,
    setIsSubtitlesOpen,
    subs,
    setSubs,
    activeSub,
    setActiveSub,
    seekTime,
    setSeekTime,
    hideEn,
    setHideEn,
    hideZh,
    setHideZh,
    dictation,
    setDictation,
    togglePlay,
  } = usePlayer();

  const [loop, setLoop] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [currentRate, setCurrentRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoPlayTriggered = useRef<string | null>(null);
  const activeAudioIdRef = useRef<string | null>(null);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    activeAudioIdRef.current = activeAudio?.id ?? null;
  }, [activeAudio?.id]);

  function changeSpeed(rate: number) {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      setCurrentRate(rate);
    }
  }

  // Cleanup audio resources on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        try {
          audioRef.current.load();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  // Sync displayedText with active subtitle line
  useEffect(() => {
    if (!activeAudio) {
      setDisplayedText('');
      return;
    }
    if (activeSub) {
      const isEnglish = activeSub.lang === 'english';
      if (dictation) {
        setDisplayedText('');
      } else if (isEnglish && hideEn) {
        setDisplayedText('');
      } else if (!isEnglish && hideZh) {
        setDisplayedText('');
      } else {
        setDisplayedText(activeSub.text);
      }
    } else {
      setDisplayedText('');
    }
  }, [activeSub, dictation, hideEn, hideZh, activeAudio?.id]);

  // Sync seek time from parent
  useEffect(() => {
    if (seekTime !== null && audioRef.current) {
      if (audioRef.current.readyState >= 1) {
        audioRef.current.currentTime = seekTime;
        audioRef.current.play().catch(() => undefined);
        setSeekTime(null);
      }
    }
  }, [seekTime]);

  // Control audio play/pause status when context isPlaying changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      if (audio.paused) {
        if (audio.ended || audio.currentTime >= audio.duration - 0.1) {
          audio.currentTime = 0;
        }
        audio.play().catch(() => {
          setIsPlaying(false);
        });
      }
    } else {
      if (!audio.paused) {
        audio.pause();
      }
    }
  }, [isPlaying]);

  // Load subtitles when audio file changes
  useEffect(() => {
    if (!activeAudio) {
      setSubs([]);
      setActiveSub(null);
      setDisplayedText('');
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const audioId = activeAudio.id;
    let canceled = false;
    setDisplayedText('');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    
    // Fetch subtitles JSON
    getSubtitlesByUrl(activeAudio.subtitle_json_url)
      .then((data) => {
        if (!canceled && activeAudioIdRef.current === audioId) {
          setSubs(data);
        }
      })
      .catch(() => {
        if (!canceled && activeAudioIdRef.current === audioId) {
          setSubs([]);
        }
      });

    // Fetch playback state
    getPlayback(audioId)
      .then((record) => {
        if (canceled || activeAudioIdRef.current !== audioId) return;
        if (audioRef.current) {
          audioRef.current.currentTime = record.current_time || 0;
          audioRef.current.playbackRate = record.playback_rate || 1;
        }
        setLoop(Boolean(record.loop_current_segment));
        setCurrentRate(record.playback_rate || 1);
      })
      .catch(() => undefined);

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: activeAudio.title,
        artist: activeAudio.source_pdf_name || 'PDF Audio',
      });
    }

    // Reset auto play trigger lock
    if (isFirstLoad.current) {
      autoPlayTriggered.current = audioId;
      isFirstLoad.current = false;
    } else {
      autoPlayTriggered.current = null;
    }

    return () => {
      canceled = true;
    };
  }, [activeAudio?.id]);

  // Periodic state save (every 10s)
  useEffect(() => {
    if (!isPlaying || !activeAudio) return;
    const timer = setInterval(() => {
      saveProgress();
    }, 10000);
    return () => clearInterval(timer);
  }, [isPlaying, activeAudio?.id, loop]);

  // Page hide / visibility change fallback
  useEffect(() => {
    const handleUnload = () => {
      saveProgress();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveProgress();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [activeAudio?.id, loop]);

  function onTime() {
    const audio = audioRef.current;
    if (!audio) return;
    const now = audio.currentTime;
    
    // Find active subtitle line using Binary Search
    const subIdx = findSubtitleIndexAtTime(subs, now);
    const entry = subIdx !== -1 ? subs[subIdx] : null;
    if (entry !== activeSub) {
      setActiveSub(entry);
    }

    // Subtitle segment updates are processed via activeSub state

    if (now === 0) {
      setDisplayedText('');
    }

    // Loop logic
    if (loop && entry && now >= entry.end - 0.05) {
      audio.currentTime = entry.start;
    }
  }

  function jump(delta: number) {
    if (!activeSub || subs.length === 0 || !audioRef.current) return;
    const idx = subs.findIndex((s) => s === activeSub);
    const target = subs[idx + delta];
    if (target) {
      audioRef.current.currentTime = target.start;
      audioRef.current.play().catch(() => undefined);
    }
  }

  async function saveProgress() {
    if (!activeAudio || !audioRef.current) return;
    const audioId = activeAudio.id;
    const current_time = audioRef.current.currentTime;
    const playback_rate = audioRef.current.playbackRate;
    const loop_current_segment = loop;
    await savePlayback(audioId, {
      current_time,
      playback_rate,
      loop_current_segment,
    }).catch(() => undefined);
  }

  async function saveOffline() {
    if (!activeAudio || !('caches' in window)) return;
    try {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      const headers = { 'X-Access-Token': getToken() };
      await cache.add(new Request(activeAudio.audio_url, { headers }));
      await cache.add(new Request(activeAudio.subtitle_json_url, { headers }));
      toast(t('offlineSuccess'), 'success');
    } catch {
      toast(t('offlineFailed'), 'error');
    }
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };



  const handleTimeUpdate = () => {
    onTime();
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      if (seekTime !== null) {
        audioRef.current.currentTime = seekTime;
        audioRef.current.play().catch(() => undefined);
        setSeekTime(null);
      }
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    saveProgress();
  };

  if (!activeAudio) return null;

  return (
    <div className="global-player-bar">
      {/* Dynamic Subtitle Display Row */}
      <div className="global-player-subtitle">
        {dictation ? (
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{t('dictationModeActive')}</span>
        ) : (
          <>
            {displayedText ? (
              <span className="text-foreground font-bold">{displayedText}</span>
            ) : (
              currentTime === 0 && !isPlaying ? (
                <span className="text-xs text-muted-foreground italic font-normal">
                  {t('pressPlayFollow')}
                </span>
              ) : (
                <span className="text-foreground font-bold">&nbsp;</span>
              )
            )}
          </>
        )}
      </div>

      {/* Control Bar Row */}
      <div className="global-player-controls">
        {/* Left Side Info */}
        <div className="flex items-center gap-3 min-w-0 max-w-[280px]">
          <div className="w-8 h-8 rounded bg-accent text-accent-foreground flex items-center justify-center flex-shrink-0">
            <Headphones size={15} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-xs truncate" title={activeAudio.title}>
              {activeAudio.title}
            </span>
            <span className="text-[10px] text-muted-foreground truncate">
              {activeAudio.source_pdf_name || 'PDF Audio'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            className={isSubtitlesOpen ? 'bg-secondary text-ring' : 'text-muted-foreground'}
            onClick={() => setIsSubtitlesOpen(!isSubtitlesOpen)}
            title={t('subtitleTranscript')}
          >
            <ListMusic size={15} />
          </Button>
        </div>

        {/* Center: Controls & Audio Timeline */}
        <div className="flex-1 max-w-xl flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="ghost" size="iconSm" onClick={() => jump(-1)} title="Prev Sentence">
              <SkipBack size={14} />
            </Button>
            
            <button
              onClick={togglePlay}
              className="play-pause-btn"
              title={isPlaying ? t('pause') : t('play')}
            >
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
            </button>

            <Button variant="ghost" size="iconSm" onClick={() => jump(1)} title="Next Sentence">
              <SkipForward size={14} />
            </Button>

            <Button
              variant={loop ? 'default' : 'ghost'}
              size="iconSm"
              onClick={() => setLoop(!loop)}
              title="Loop Sentence Toggle"
            >
              <Repeat2 size={14} />
            </Button>
          </div>

          <audio
            ref={audioRef}
            src={activeAudio.audio_url}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => {
              setIsPlaying(true);
            }}
            onPause={() => {
              handlePause();
            }}
            onEnded={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
              }
              handlePause();
            }}
            onCanPlay={() => {
              if (activeAudio && autoPlayTriggered.current !== activeAudio.id) {
                autoPlayTriggered.current = activeAudio.id;
                audioRef.current?.play().catch(() => undefined);
              }
            }}
          />

          <div className="flex-1 flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted-foreground font-mono w-8 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSliderChange}
              className="custom-timeline-slider"
              aria-label="Timeline"
            />
            <span className="text-[10px] font-bold text-muted-foreground font-mono w-8 text-left">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 relative">
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={showMoreMenu ? 'bg-secondary text-ring' : 'text-muted-foreground'}
            title="More Actions"
          >
            <MoreVertical size={16} />
          </Button>

          {showMoreMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
              <div className="player-more-menu-popover z-50">
                <span className="menu-section-title">{t('subtitleDisplay')}</span>
                <div className="flex flex-col gap-1.5 p-1.5 bg-secondary/35 rounded-lg border border-border/50">
                  <label className="flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideEn}
                      onChange={(e) => setHideEn(e.target.checked)}
                      className="w-3.5 h-3.5 accent-ring"
                    />
                    <span>{t('hideEnglish')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideZh}
                      onChange={(e) => setHideZh(e.target.checked)}
                      className="w-3.5 h-3.5 accent-ring"
                    />
                    <span>{t('hideChinese')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dictation}
                      onChange={(e) => setDictation(e.target.checked)}
                      className="w-3.5 h-3.5 accent-ring"
                    />
                    <span>{t('dictationMode')}</span>
                  </label>
                </div>

                <span className="menu-section-title">{t('playbackSpeed')}</span>
                <div className="speed-select-grid">
                  {[1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      className={`speed-grid-btn ${currentRate === rate ? 'is-active' : ''}`}
                      onClick={() => changeSpeed(rate)}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>

                <span className="menu-section-title">{t('actions')}</span>
                <button
                  className="menu-action-btn"
                  onClick={() => {
                    saveOffline();
                    setShowMoreMenu(false);
                  }}
                >
                  <Wifi size={14} className="text-muted-foreground" />
                  <span>{t('saveOffline')}</span>
                </button>

                <span className="menu-section-title">{t('downloads')}</span>
                <a
                  className="menu-action-btn"
                  href={activeAudio.audio_url}
                  download
                  onClick={() => setShowMoreMenu(false)}
                >
                  <Download size={14} className="text-muted-foreground" />
                  <span>{t('downloadMp3Audio')}</span>
                </a>
                <a
                  className="menu-action-btn"
                  href={activeAudio.subtitle_vtt_url}
                  download
                  onClick={() => setShowMoreMenu(false)}
                >
                  <FileDown size={14} className="text-muted-foreground" />
                  <span>{t('downloadVttSubtitles')}</span>
                </a>
                <a
                  className="menu-action-btn"
                  href={activeAudio.subtitle_srt_url}
                  download
                  onClick={() => setShowMoreMenu(false)}
                >
                  <FileDown size={14} className="text-muted-foreground" />
                  <span>{t('downloadSrtSubtitles')}</span>
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
