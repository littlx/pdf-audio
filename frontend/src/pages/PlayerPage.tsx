import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  Clock3,
  Copy,
  Download,
  Edit3,
  FileDown,
  Headphones,
  Play,
  RefreshCw,
  Repeat2,
  Search,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Wifi,
} from 'lucide-react';
import { api, getToken } from '../api/client';
import type { AudioFile, SubtitleEntry } from '../api/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function initials(title?: string) {
  return (title || 'PDF Audio')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || 'PA';
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

  function playAudio(audio: AudioFile) {
    setCurrent(audio);
    setTimeout(() => audioRef.current?.play().catch(() => undefined), 80);
  }

  const groups = groupSubtitles(subs).filter((g) => !query || `${g.english?.text || ''} ${g.chinese?.text || ''}`.toLowerCase().includes(query.toLowerCase()));
  const currentGroup = active ? groups.find((g) => g.index === active.segment_index) : null;
  const recent = audios.slice(0, 5);

  return (
    <section className="page admin-dashboard">
      <div className="admin-grid">
        <Card className="profile-panel">
          <Button variant="ghost" size="iconSm" className="panel-edit" aria-label="Edit overview"><Edit3 size={14} /></Button>
          <div className="profile-head">
            <div className="org-logo">
              <span>{initials(current?.source_pdf_name || current?.title)}</span>
              <BookOpen size={18} />
            </div>
            <div>
              <h2>{current?.source_pdf_name || 'PDF Audio Workspace'}</h2>
              <p>{current ? 'Active Audio' : 'Ready to convert'}</p>
            </div>
          </div>

          <div className="profile-meta">
            <div>
              <span>Audio files</span>
              <strong>{audios.length}</strong>
            </div>
            <div>
              <span>Subtitles</span>
              <strong>{subs.length}</strong>
            </div>
            <div>
              <span>Duration</span>
              <strong>{formatDuration(current?.duration)}</strong>
            </div>
          </div>

          <div className="info-section-title">Personal Information</div>
          <div className="profile-info-list">
            <div><span>Current title</span><strong>{current?.title || 'No audio selected'}</strong></div>
            <div><span>Source pages</span><strong>{current?.page_expression || 'Selection'}</strong></div>
            <div><span>Mode</span><strong>{current?.audio_mode || 'Bilingual'}</strong></div>
          </div>
        </Card>

        <Card className="activity-panel">
          <div className="activity-header">
            <h3>Activities details</h3>
            <Button variant="ghost" size="iconSm" aria-label="Edit activities"><Edit3 size={14} /></Button>
          </div>
          <div className="activity-subhead">Activity</div>
          <div className="activity-list">
            {recent.map((audio) => (
              <button key={audio.id} className="activity-row" onClick={() => playAudio(audio)}>
                <span className="activity-icon"><Headphones size={15} /></span>
                <span>
                  <strong>{audio.title}</strong>
                  <small>{audio.source_pdf_name || 'PDF Audio'} · {formatDuration(audio.duration)}</small>
                </span>
                <Play size={14} />
              </button>
            ))}
            {recent.length === 0 && <p className="muted empty-copy">No activities yet. Convert a PDF to start listening.</p>}
          </div>
        </Card>
      </div>

      <div className="stat-strip">
        <Card className="stat-card"><ShieldCheck size={18} /><span>Access</span><strong>Unlocked</strong></Card>
        <Card className="stat-card"><Activity size={18} /><span>Status</span><strong>{current ? 'Playing ready' : 'Idle'}</strong></Card>
        <Card className="stat-card"><Clock3 size={18} /><span>Last refresh</span><strong>Now</strong></Card>
        <Button variant="secondary" size="sm" onClick={loadAudios}><RefreshCw size={14} /> Refresh activity</Button>
      </div>

      <Card className="listen-card admin-player-card">
        {current ? <>
          <div className="listen-header">
            <div>
              <Badge variant="secondary">Now playing</Badge>
              <h3>{current.title}</h3>
              <p>{current.source_pdf_name} · Pages {current.page_expression || 'selection'}</p>
            </div>
            <Button variant={loop ? 'default' : 'secondary'} size="sm" onClick={() => setLoop(!loop)}><Repeat2 size={15} /> Loop</Button>
          </div>

          <div className="current-subtitle">
            {!dictation && !hideEn && <p className={active?.lang === 'english' ? 'active-line' : ''}>{currentGroup?.english?.text || 'Press play to follow the English subtitle.'}</p>}
            {!dictation && !hideZh && <p className={active?.lang === 'chinese' ? 'active-line' : ''}>{currentGroup?.chinese?.text || '播放后会在这里显示中文字幕。'}</p>}
            {dictation && <p>Dictation mode is on.</p>}
          </div>

          <audio ref={audioRef} controls src={current.audio_url} onTimeUpdate={onTime} onPause={saveProgress} onEnded={() => { saveProgress(); const idx = audios.findIndex((a) => a.id === current.id); if (audios[idx + 1]) setCurrent(audios[idx + 1]); }} />

          <div className="actions player-controls">
            <Button variant="secondary" size="sm" onClick={() => jump(-1)}><SkipBack size={14} /> Previous</Button>
            <Button variant="secondary" size="sm" onClick={() => jump(1)}><SkipForward size={14} /> Next</Button>
            {[1, 1.25, 1.5, 2].map((rate) => <Button variant="secondary" size="sm" key={rate} onClick={() => { if (audioRef.current) audioRef.current.playbackRate = rate; }}>{rate}x</Button>)}
            <Button variant="secondary" size="sm" onClick={saveOffline}><Wifi size={14} /> Offline</Button>
            <Button asChild variant="secondary" size="sm"><a href={current.audio_url}><Download size={14} /> MP3</a></Button>
            <Button asChild variant="secondary" size="sm"><a href={current.subtitle_vtt_url}><FileDown size={14} /> VTT</a></Button>
            <Button asChild variant="secondary" size="sm"><a href={current.subtitle_srt_url}><FileDown size={14} /> SRT</a></Button>
          </div>

          <div className="subtitle-toolbar">
            <label className="inline-search">
              <Search size={16} />
              <Input placeholder="Search subtitles" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label><input type="checkbox" checked={hideEn} onChange={(e) => setHideEn(e.target.checked)} /> Hide English</label>
            <label><input type="checkbox" checked={hideZh} onChange={(e) => setHideZh(e.target.checked)} /> Hide Chinese</label>
            <label><input type="checkbox" checked={dictation} onChange={(e) => setDictation(e.target.checked)} /> Dictation</label>
          </div>

          <div className="subtitle-list">
            {groups.map((group) => <div key={group.index} className={active?.segment_index === group.index ? 'segment active-segment' : 'segment'} onClick={() => seek(group.english || group.chinese)}>
              <span className="segment-index">{String(group.index + 1).padStart(2, '0')}</span>
              <div>
                {!hideEn && <p>{group.english?.text}</p>}
                {!hideZh && <p>{group.chinese?.text}</p>}
              </div>
              <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${group.english?.text || ''}\n${group.chinese?.text || ''}`); }}><Copy size={14} /> Copy</Button>
            </div>)}
          </div>
        </> : <p>No audio yet. Create one from the Convert page.</p>}
      </Card>
    </section>
  );
}
