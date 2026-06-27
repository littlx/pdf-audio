import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AudioFile, SubtitleEntry } from '../api/types';
import { api } from '../api/client';

type PlayerContextType = {
  activeAudio: AudioFile | null;
  setActiveAudio: (audio: AudioFile | null) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  activeSub: SubtitleEntry | null;
  setActiveSub: (sub: SubtitleEntry | null) => void;
  subs: SubtitleEntry[];
  setSubs: (subs: SubtitleEntry[]) => void;
  isSubtitlesOpen: boolean;
  setIsSubtitlesOpen: (open: boolean) => void;
  seekTime: number | null;
  setSeekTime: (time: number | null) => void;
  hideEn: boolean;
  setHideEn: (val: boolean) => void;
  hideZh: boolean;
  setHideZh: (val: boolean) => void;
  dictation: boolean;
  setDictation: (val: boolean) => void;
  togglePlay: () => void;
};

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: React.ReactNode; unlocked: boolean }> = ({ children, unlocked }) => {
  const [activeAudio, setActiveAudioState] = useState<AudioFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSub, setActiveSub] = useState<SubtitleEntry | null>(null);
  const [subs, setSubs] = useState<SubtitleEntry[]>([]);
  const [isSubtitlesOpen, setIsSubtitlesOpen] = useState(false);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [hideEn, setHideEn] = useState(false);
  const [hideZh, setHideZh] = useState(false);
  const [dictation, setDictation] = useState(false);

  // Restore last played audio
  useEffect(() => {
    if (!unlocked) {
      setActiveAudioState(null);
      setIsPlaying(false);
      setActiveSub(null);
      setSubs([]);
      setIsSubtitlesOpen(false);
      setSeekTime(null);
      localStorage.removeItem('app-last-audio-id');
      return;
    }

    let canceled = false;
    const restoreLastAudio = async () => {
      try {
        const list = await api<AudioFile[]>('/api/audios');
        if (canceled) return;
        if (list && list.length > 0) {
          const lastId = localStorage.getItem('app-last-audio-id');
          const lastAudio = list.find((a) => a.id === lastId) || list[0];
          setActiveAudioState(lastAudio);
        }
      } catch (err) {
        if (!canceled) console.error('Restore last audio failed:', err);
      }
    };
    restoreLastAudio();
    return () => {
      canceled = true;
    };
  }, [unlocked]);

  const setActiveAudio = (audio: AudioFile | null) => {
    setActiveAudioState(audio);
    if (audio) {
      localStorage.setItem('app-last-audio-id', audio.id);
    } else {
      localStorage.removeItem('app-last-audio-id');
    }
  };

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  return (
    <PlayerContext.Provider
      value={{
        activeAudio,
        setActiveAudio,
        isPlaying,
        setIsPlaying,
        activeSub,
        setActiveSub,
        subs,
        setSubs,
        isSubtitlesOpen,
        setIsSubtitlesOpen,
        seekTime,
        setSeekTime,
        hideEn,
        setHideEn,
        hideZh,
        setHideZh,
        dictation,
        setDictation,
        togglePlay,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within PlayerProvider');
  return context;
};
