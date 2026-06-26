import { useEffect, useRef, useState } from 'react';
import { Download, FileDown, Headphones, Repeat2, SkipBack, SkipForward, Wifi, ListMusic, ChevronUp, MoreVertical, Play, Pause } from 'lucide-react';
import { api, getToken } from '../api/client';
import type { AudioFile, SubtitleEntry } from '../api/types';
import { Button } from './ui/button';

type GlobalPlayerProps = {
  activeAudio: AudioFile | null;
  onOpenSubtitles: () => void;
  isSubtitlesOpen: boolean;
  onSubtitlesLoaded: (subs: SubtitleEntry[]) => void;
  activeSub: SubtitleEntry | null;
  setActiveSub: (sub: SubtitleEntry | null) => void;
  seekTime: number | null;
  onSeekReset: () => void;
  hideEn: boolean;
  hideZh: boolean;
  dictation: boolean;
  setHideEn: (val: boolean) => void;
  setHideZh: (val: boolean) => void;
  setDictation: (val: boolean) => void;
};

export default function GlobalPlayer({
  activeAudio,
  onOpenSubtitles,
  isSubtitlesOpen,
  onSubtitlesLoaded,
  activeSub,
  setActiveSub,
  seekTime,
  onSeekReset,
  hideEn,
  hideZh,
  dictation,
  setHideEn,
  setHideZh,
  setDictation,
}: GlobalPlayerProps) {
  const [subs, setSubs] = useState<SubtitleEntry[]>([]);
  const [loop, setLoop] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number | null>(null);
  const [displayedText, setDisplayedText] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [currentRate, setCurrentRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  function changeSpeed(rate: number) {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      setCurrentRate(rate);
    }
  }

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
    }
  }, [activeSub, dictation, hideEn, hideZh, activeAudio?.id]);

  // Sync seek time from parent
  useEffect(() => {
    if (seekTime !== null && audioRef.current) {
      audioRef.current.currentTime = seekTime;
      audioRef.current.play().catch(() => undefined);
      onSeekReset();
    }
  }, [seekTime]);

  // Listen for toggle play commands from Media Library
  useEffect(() => {
    const handleToggle = () => {
      togglePlay();
    };
    window.addEventListener('player-toggle-play', handleToggle);
    return () => window.removeEventListener('player-toggle-play', handleToggle);
  }, [isPlaying]);

  // Load subtitles when audio file changes
  useEffect(() => {
    if (!activeAudio) {
      setSubs([]);
      onSubtitlesLoaded([]);
      setActiveSub(null);
      setCurrentSegmentIndex(null);
      setDisplayedText('');
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    setCurrentSegmentIndex(null);
    setDisplayedText('');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    
    // Fetch subtitles JSON
    api<SubtitleEntry[]>(activeAudio.subtitle_json_url)
      .then((data) => {
        setSubs(data);
        onSubtitlesLoaded(data);
      })
      .catch(() => {
        setSubs([]);
        onSubtitlesLoaded([]);
      });

    // Fetch playback state
    api<any>(`/api/audios/${activeAudio.id}/playback`)
      .then((record) => {
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

    // Auto play when audio switches
    setTimeout(() => {
      audioRef.current?.play().catch(() => undefined);
    }, 150);
  }, [activeAudio?.id]);

  function onTime() {
    const audio = audioRef.current;
    if (!audio) return;
    const now = audio.currentTime;
    
    // Find active subtitle line
    const entry = subs.find((s) => now >= s.start && now <= s.end) || null;
    setActiveSub(entry);

    if (entry) {
      setCurrentSegmentIndex(entry.segment_index);
    } else if (subs.length > 0) {
      // Find the last segment that finished before 'now'
      const preceding = subs.filter((s) => s.end <= now);
      if (preceding.length > 0) {
        const sorted = preceding.sort((a, b) => b.end - a.end);
        setCurrentSegmentIndex(sorted[0].segment_index);
      } else {
        setCurrentSegmentIndex(null);
      }
    }

    if (now === 0) {
      setDisplayedText('');
    }

    // Loop logic: if loop segment is checked, loop current subtitle segment
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
    await api(`/api/audios/${activeAudio.id}/playback`, {
      method: 'PUT',
      body: JSON.stringify({
        current_time: audioRef.current.currentTime,
        playback_rate: audioRef.current.playbackRate,
        loop_current_segment: loop,
      }),
    }).catch(() => undefined);
  }

  async function saveOffline() {
    if (!activeAudio || !('caches' in window)) return;
    try {
      const cache = await caches.open('sub-pdf-offline-audio-v1');
      const headers = { 'X-Access-Token': getToken() };
      await cache.add(new Request(activeAudio.audio_url, { headers }));
      await cache.add(new Request(activeAudio.subtitle_json_url, { headers }));
      alert('Audio and subtitles saved for offline playback.');
    } catch {
      alert('Offline cache failed.');
    }
  }

  function formatTime(secs: number) {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      if (audio.ended || audio.currentTime >= audio.duration - 0.1) {
        audio.currentTime = 0;
        // Small delay to prevent browser seeking race condition
        setTimeout(() => {
          audio.play().catch(() => undefined);
        }, 50);
      } else {
        audio.play().catch(() => undefined);
      }
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
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Dictation Mode Active</span>
        ) : (
          <>
            {displayedText ? (
              <span className="text-foreground font-bold">{displayedText}</span>
            ) : (
              <span className="text-xs text-muted-foreground italic font-normal">
                Press Play to follow subtitle transcript
              </span>
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
            onClick={onOpenSubtitles}
            title="Toggle Subtitle Drawer"
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
              title={isPlaying ? 'Pause' : 'Play'}
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
              window.dispatchEvent(new CustomEvent('player-play'));
            }}
            onPause={() => {
              handlePause();
              window.dispatchEvent(new CustomEvent('player-pause'));
            }}
            onEnded={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
              }
              handlePause();
              window.dispatchEvent(new CustomEvent('player-pause'));
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
                <span className="menu-section-title">Subtitle Display</span>
                <div className="flex flex-col gap-1.5 p-1.5 bg-secondary/35 rounded-lg border border-border/50">
                  <label className="flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideEn}
                      onChange={(e) => setHideEn(e.target.checked)}
                      className="w-3.5 h-3.5 accent-ring"
                    />
                    <span>Hide English</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideZh}
                      onChange={(e) => setHideZh(e.target.checked)}
                      className="w-3.5 h-3.5 accent-ring"
                    />
                    <span>Hide Chinese</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dictation}
                      onChange={(e) => setDictation(e.target.checked)}
                      className="w-3.5 h-3.5 accent-ring"
                    />
                    <span>Dictation Mode</span>
                  </label>
                </div>

                <span className="menu-section-title">Playback Speed</span>
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

                <span className="menu-section-title">Actions</span>
                <button
                  className="menu-action-btn"
                  onClick={() => {
                    saveOffline();
                    setShowMoreMenu(false);
                  }}
                >
                  <Wifi size={14} className="text-muted-foreground" />
                  <span>Save Offline Cache</span>
                </button>

                <span className="menu-section-title">Downloads</span>
                <a
                  className="menu-action-btn"
                  href={activeAudio.audio_url}
                  download
                  onClick={() => setShowMoreMenu(false)}
                >
                  <Download size={14} className="text-muted-foreground" />
                  <span>Download MP3 Audio</span>
                </a>
                <a
                  className="menu-action-btn"
                  href={activeAudio.subtitle_vtt_url}
                  download
                  onClick={() => setShowMoreMenu(false)}
                >
                  <FileDown size={14} className="text-muted-foreground" />
                  <span>Download VTT Subtitles</span>
                </a>
                <a
                  className="menu-action-btn"
                  href={activeAudio.subtitle_srt_url}
                  download
                  onClick={() => setShowMoreMenu(false)}
                >
                  <FileDown size={14} className="text-muted-foreground" />
                  <span>Download SRT Subtitles</span>
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
