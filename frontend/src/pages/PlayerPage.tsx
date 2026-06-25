import { useEffect, useRef, useState } from 'react';
import { api, getToken } from '../api/client';
import type { AudioFile, SubtitleEntry } from '../api/types';

function groupSubtitles(entries: SubtitleEntry[]) {
  const groups = new Map<number, { english?: SubtitleEntry; chinese?: SubtitleEntry }>();
  entries.forEach((entry) => {
    const group = groups.get(entry.segment_index) || {};
    if (entry.lang === 'english') group.english = entry;
    if (entry.lang === 'chinese') group.chinese = entry;
    groups.set(entry.segment_index, group);
  });
  return Array.from(groups.entries()).map(([index, value]) => ({ index, ...value }));
}

export default function PlayerPage() {
  const [audios, setAudios] = useState<AudioFile[]>([]);
  const [current, setCurrent] = useState<AudioFile | null>(null);
  const [subs, setSubs] = useState<SubtitleEntry[]>([]);
  const [active, setActive] = useState<SubtitleEntry | null>(null);
  const [query, setQuery] = useState('');
  const [hideEn, setHideEn] = useState(false);
  const [hideZh, setHideZh] = useState(false);
  const [dictation, setDictation] = useState(false);
  const [loop, setLoop] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function loadAudios() {
    const list = await api<AudioFile[]>('/api/audios');
    setAudios(list);
    if (!current && list[0]) setCurrent(list[0]);
  }

  useEffect(() => { loadAudios().catch(() => undefined); }, []);

  useEffect(() => {
    if (!current) return;
    api<SubtitleEntry[]>(current.subtitle_json_url).then(setSubs).catch(() => setSubs([]));
    api<any>(`/api/audios/${current.id}/playback`).then((record) => {
      if (audioRef.current) {
        audioRef.current.currentTime = record.current_time || 0;
        audioRef.current.playbackRate = record.playback_rate || 1;
      }
      setLoop(Boolean(record.loop_current_segment));
    }).catch(() => undefined);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.source_pdf_name || 'PDF Audio' });
    }
  }, [current?.id]);

  function onTime() {
    const audio = audioRef.current;
    if (!audio) return;
    const now = audio.currentTime;
    const entry = subs.find((s) => now >= s.start && now <= s.end) || null;
    setActive(entry);
    if (loop && entry && now >= entry.end - 0.05) audio.currentTime = entry.start;
  }

  function seek(entry?: SubtitleEntry) {
    if (entry && audioRef.current) {
      audioRef.current.currentTime = entry.start;
      audioRef.current.play();
    }
  }

  function jump(delta: number) {
    if (!active || !audioRef.current) return;
    const idx = subs.findIndex((s) => s === active);
    const target = subs[idx + delta];
    if (target) seek(target);
  }

  async function saveProgress() {
    if (!current || !audioRef.current) return;
    await api(`/api/audios/${current.id}/playback`, { method: 'PUT', body: JSON.stringify({ current_time: audioRef.current.currentTime, playback_rate: audioRef.current.playbackRate, loop_current_segment: loop }) }).catch(() => undefined);
  }

  async function saveOffline() {
    if (!current || !('caches' in window)) return;
    const cache = await caches.open('sub-pdf-offline-audio-v1');
    const headers = { 'X-Access-Token': getToken() };
    await cache.add(new Request(current.audio_url, { headers }));
    await cache.add(new Request(current.subtitle_json_url, { headers }));
    alert('Saved for offline playback in this browser.');
  }

  const groups = groupSubtitles(subs).filter((g) => !query || `${g.english?.text || ''} ${g.chinese?.text || ''}`.toLowerCase().includes(query.toLowerCase()));
  const currentGroup = active ? groups.find((g) => g.index === active.segment_index) : null;

  return (
    <section className="page player-page">
      <div className="toolbar"><h2>Player</h2><button onClick={loadAudios}>Refresh</button></div>
      <div className="player-layout">
        <aside className="card playlist">
          <h3>Playlist</h3>
          {audios.map((audio) => <button key={audio.id} className={current?.id === audio.id ? 'selected' : ''} onClick={() => setCurrent(audio)}>{audio.title}</button>)}
        </aside>
        <main className="card player-main">
          {current ? <>
            <h3>{current.title}</h3>
            <p>{current.source_pdf_name} · Pages {current.page_expression || 'selection'}</p>
            <div className="current-subtitle">
              {!dictation && !hideEn && <p className={active?.lang === 'english' ? 'active-line' : ''}>{currentGroup?.english?.text}</p>}
              {!dictation && !hideZh && <p className={active?.lang === 'chinese' ? 'active-line' : ''}>{currentGroup?.chinese?.text}</p>}
              {dictation && <p>Dictation mode is on.</p>}
            </div>
            <audio ref={audioRef} controls src={current.audio_url} onTimeUpdate={onTime} onPause={saveProgress} onEnded={() => { saveProgress(); const idx = audios.findIndex((a) => a.id === current.id); if (audios[idx + 1]) setCurrent(audios[idx + 1]); }} />
            <div className="actions">
              <button onClick={() => jump(-1)}>Previous line</button><button onClick={() => jump(1)}>Next line</button>
              {[1, 1.25, 1.5, 2].map((rate) => <button key={rate} onClick={() => { if (audioRef.current) audioRef.current.playbackRate = rate; }}>{rate}x</button>)}
              <button className={loop ? 'selected' : ''} onClick={() => setLoop(!loop)}>Loop current</button>
              <button onClick={saveOffline}>Save for offline</button>
              <a href={current.audio_url}>Download MP3</a><a href={current.subtitle_vtt_url}>VTT</a><a href={current.subtitle_srt_url}>SRT</a>
            </div>
            <div className="toolbar"><input placeholder="Search subtitles" value={query} onChange={(e) => setQuery(e.target.value)} /><label><input type="checkbox" checked={hideEn} onChange={(e) => setHideEn(e.target.checked)} /> Hide English</label><label><input type="checkbox" checked={hideZh} onChange={(e) => setHideZh(e.target.checked)} /> Hide Chinese</label><label><input type="checkbox" checked={dictation} onChange={(e) => setDictation(e.target.checked)} /> Dictation</label></div>
            <div className="subtitle-list">
              {groups.map((group) => <div key={group.index} className={active?.segment_index === group.index ? 'segment active-segment' : 'segment'} onClick={() => seek(group.english || group.chinese)}>
                {!hideEn && <p>{group.english?.text}</p>}
                {!hideZh && <p>{group.chinese?.text}</p>}
                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${group.english?.text || ''}\n${group.chinese?.text || ''}`); }}>Copy</button>
              </div>)}
            </div>
          </> : <p>No audio yet. Create one from the Convert page.</p>}
        </main>
      </div>
    </section>
  );
}
