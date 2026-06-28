import { usePlayer } from '../context/PlayerContext';
import type { AudioFile } from '../api/types';

export function useActiveAudioControls() {
  const { activeAudio, setActiveAudio, isPlaying, togglePlay } = usePlayer();

  const playOrToggle = (audio: AudioFile) => {
    if (activeAudio?.id === audio.id) {
      togglePlay();
    } else {
      setActiveAudio(audio);
    }
  };

  const isAudioActive = (audioId: string) => {
    return activeAudio?.id === audioId;
  };

  const isAudioPlaying = (audioId: string) => {
    return activeAudio?.id === audioId && isPlaying;
  };

  return {
    activeAudio,
    isPlaying,
    setActiveAudio,
    togglePlay,
    playOrToggle,
    isAudioActive,
    isAudioPlaying,
  };
}
