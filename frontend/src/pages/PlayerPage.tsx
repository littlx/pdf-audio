import { useEffect, useRef, useState } from 'react';
import { Copy, Download, FileDown, Headphones, Play, Repeat2, Search, SkipBack, SkipForward, Wifi } from 'lucide-react';
import { api, getToken } from '../api/client';
import type { AudioFile, SubtitleEntry, Task } from '../api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

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

function formatDuration(seconds?: number) {
  if (!seconds) return 'Pending';
  const mins = Math.round(seconds / 60);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function PlayerPage() {
  const [audios, setAudios] = useState<AudioFile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [current, setCurrent] = useState<AudioFile | null>(null);
  const [subs, setSubs] = useState<SubtitleEntry[]>([]);
  const [active, setActive] = useState<SubtitleEntry | null>(null);
  const [query, setQuery] = useState('');
  const [hideEn, setHideEn] = useState(false);
  const [hideZh, setHideZh] = useState(false);
  const [dictation, setDictation] = useState(false);
  const [loop, setLoop] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function load() {
    const [audioList, taskList] = await Promise.all([api<AudioFile[]>('/api/audios'), api<Task[]>('/api/tasks')]);
    setAudios(audioList);
    setTasks(taskList);
    if (!current && audioList[0]) setCurrent(audioList[0]);
  }

  useEffect(() => { load().catch(() => undefined); const timer = setInterval(() => load().catch(() => undefined), 5000); return () => clearInterval(timer); }, []);

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
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.source_pdf_name || 'PDF Audio' });
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

  function playAudio(audio: AudioFile) {
    setCurrent(audio);
    setTimeout(() => audioRef.current?.play().catch(() => undefined), 80);
  }

  const groups = groupSubtitles(subs).filter((g) => !query || `${g.english?.text || ''} ${g.chinese?.text || ''}`.toLowerCase().includes(query.toLowerCase()));
  const currentGroup = active ? groups.find((g) => g.index === active.segment_index) : null;
  const activeTasks = tasks.filter((task) => !['completed', 'canceled'].includes(task.status)).slice(0, 6);

  return (
    <section className="page listen-workspace compact-page">
      <aside className="audio-sidebar">
        <div className="sidebar-section-title">Audios</div>
        <div className="audio-list">
          {audios.map((audio) => <button key={audio.id} className={current?.id === audio.id ? 'audio-row is-active' : 'audio-row'} onClick={() => playAudio(audio)}><Headphones size={14} /><span><strong>{audio.title}</strong><small>{formatDuration(audio.duration)} · {audio.source_pdf_name || 'PDF Audio'}</small></span><Play size={13} /></button>)}
          {audios.length === 0 && <p className="muted empty-copy">No generated audio yet.</p>}
        </div>
        <div className="sidebar-section-title">Conversions</div>
        <div className="task-mini-list">
          {activeTasks.map((task) => <div className="task-mini-row" key={task.id}><span className={`status-badge is-${task.status}`}>{task.status}</span><strong>{task.source_pdf_name || task.input_type}</strong><small>{task.stage} · {task.progress}%</small></div>)}
          {activeTasks.length === 0 && <p className="muted empty-copy">No active tasks.</p>}
        </div>
      </aside>

      <main className="listen-main">
        <div className="player-topbar">
          <div>
            <Badge variant="secondary">Now playing</Badge>
            <h2>{current?.title || 'No audio selected'}</h2>
            <p>{current ? `${current.source_pdf_name || 'PDF Audio'} · Pages ${current.page_expression || 'selection'}` : 'Create audio from a PDF to start listening.'}</p>
          </div>
          {current && <Button variant={loop ? 'default' : 'secondary'} size="sm" onClick={() => setLoop(!loop)}><Repeat2 size={14} /> Loop</Button>}
        </div>

        {current ? <>
          <div className="current-subtitle compact-subtitle" aria-live="polite">
            {!dictation && !hideEn && <p className={active?.lang === 'english' ? 'active-line' : ''}>{currentGroup?.english?.text || 'Press play to follow the English subtitle.'}</p>}
            {!dictation && !hideZh && <p className={active?.lang === 'chinese' ? 'active-line' : ''}>{currentGroup?.chinese?.text || '播放后会在这里显示中文字幕。'}</p>}
            {dictation && <p>Dictation mode is on.</p>}
          </div>
          <audio ref={audioRef} controls src={current.audio_url} onTimeUpdate={onTime} onPause={saveProgress} onEnded={() => { saveProgress(); const idx = audios.findIndex((a) => a.id === current.id); if (audios[idx + 1]) setCurrent(audios[idx + 1]); }} />
          <div className="actions player-controls compact-actions">
            <Button variant="secondary" size="sm" onClick={() => jump(-1)}><SkipBack size={14} /> Prev</Button>
            <Button variant="secondary" size="sm" onClick={() => jump(1)}><SkipForward size={14} /> Next</Button>
            {[1, 1.25, 1.5, 2].map((rate) => <Button variant="secondary" size="sm" key={rate} onClick={() => { if (audioRef.current) audioRef.current.playbackRate = rate; }}>{rate}x</Button>)}
            <Button variant="secondary" size="sm" onClick={saveOffline}><Wifi size={14} /> Offline</Button>
            <Button asChild variant="secondary" size="sm"><a href={current.audio_url}><Download size={14} /> MP3</a></Button>
            <Button asChild variant="secondary" size="sm"><a href={current.subtitle_vtt_url}><FileDown size={14} /> VTT</a></Button>
            <Button asChild variant="secondary" size="sm"><a href={current.subtitle_srt_url}><FileDown size={14} /> SRT</a></Button>
          </div>
          <div className="subtitle-toolbar compact-toolbar-row">
            <label className="inline-search"><Search size={15} /><Input placeholder="Search subtitles" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <label><input type="checkbox" checked={hideEn} onChange={(e) => setHideEn(e.target.checked)} /> Hide English</label>
            <label><input type="checkbox" checked={hideZh} onChange={(e) => setHideZh(e.target.checked)} /> Hide Chinese</label>
            <label><input type="checkbox" checked={dictation} onChange={(e) => setDictation(e.target.checked)} /> Dictation</label>
          </div>
          <div className="subtitle-list dense-subtitle-list">
            {groups.map((group) => <div key={group.index} className={active?.segment_index === group.index ? 'segment active-segment' : 'segment'} role="button" tabIndex={0} onClick={() => seek(group.english || group.chinese)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); seek(group.english || group.chinese); } }}>
              <span className="segment-index">{String(group.index + 1).padStart(2, '0')}</span>
              <div>{!hideEn && <p>{group.english?.text}</p>}{!hideZh && <p>{group.chinese?.text}</p>}</div>
              <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${group.english?.text || ''}\n${group.chinese?.text || ''}`); }}><Copy size={14} /> Copy</Button>
            </div>)}
          </div>
        </> : <div className="empty-state"><h3>No audio yet</h3><p>Convert a PDF, then generated audio will appear here.</p></div>}
      </main>
    </section>
  );
}
