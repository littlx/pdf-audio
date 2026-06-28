import { useState, useEffect, useRef } from 'react';

export function useEphemeralAudio() {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingKey(null);
  };

  const play = async (
    key: string,
    urlOrGetter: string | (() => Promise<string>),
    onPlayError?: (err: any) => void
  ) => {
    if (playingKey === key) {
      stop();
      return;
    }

    stop();

    try {
      let finalUrl = '';
      let isBlobUrl = false;
      if (typeof urlOrGetter === 'function') {
        finalUrl = await urlOrGetter();
        isBlobUrl = finalUrl.startsWith('blob:');
      } else {
        finalUrl = urlOrGetter;
      }

      const audio = new Audio(finalUrl);
      audioRef.current = audio;
      setPlayingKey(key);

      const cleanup = () => {
        if (isBlobUrl) {
          try {
            URL.revokeObjectURL(finalUrl);
          } catch (e) {
            console.error('Failed to revoke object URL:', e);
          }
        }
        if (audioRef.current === audio) {
          audioRef.current = null;
          setPlayingKey(null);
        }
      };

      audio.onended = cleanup;
      audio.onerror = (e) => {
        cleanup();
        onPlayError?.(e);
      };

      await audio.play();
    } catch (err) {
      if (onPlayError) {
        onPlayError(err);
      } else {
        console.error('Failed to play ephemeral audio:', err);
      }
      setPlayingKey(null);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return {
    playingKey,
    play,
    stop,
  };
}
