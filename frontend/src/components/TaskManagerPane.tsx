import { useEffect, useState, useCallback, useRef } from 'react';
import { FileText, Wand2, Pause, Play, RotateCcw, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import type { AudioFile, Task } from '../api/types';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';

// Helper to determine step name/milestone in Chinese or English
function getStageLabel(stage: string, lang: string): string {
  switch (stage) {
    case 'pending':
      return lang === 'zh' ? '排队中' : 'Queueing';
    case 'extracting_text':
      return lang === 'zh' ? '提取文本' : 'Extracting text';
    case 'text_ready':
      return lang === 'zh' ? '文本就绪' : 'Text ready';
    case 'generating_bilingual_text':
      return lang === 'zh' ? 'AI 翻译对齐' : 'Translating';
    case 'bilingual_text_ready':
      return lang === 'zh' ? '双语就绪' : 'Bilingual ready';
    case 'generating_tts_clips':
      return lang === 'zh' ? '分句朗读合成' : 'TTS synthesis';
    case 'clips_ready':
      return lang === 'zh' ? '分句音频就绪' : 'Audio clips ready';
    case 'merging_audio':
      return lang === 'zh' ? '拼接音频' : 'Merging audio';
    case 'normalizing_audio':
      return lang === 'zh' ? '音质优化' : 'Normalizing audio';
    case 'generating_subtitles':
      return lang === 'zh' ? '生成双语字幕' : 'Generating subtitles';
    case 'completed':
      return lang === 'zh' ? '已完成' : 'Completed';
    case 'canceled':
      return lang === 'zh' ? '已取消' : 'Canceled';
    default:
      return stage;
  }
}

export default function TaskManagerPane() {
  const { t, lang } = useT();
  const { toast } = useToast();
  const { activeAudio, setActiveAudio, isPlaying, togglePlay } = usePlayer();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [audios, setAudios] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Keep a ref of tasks to check if we should keep polling
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [tasksData, audiosData] = await Promise.all([
        api<Task[]>('/api/tasks?limit=50'),
        api<AudioFile[]>('/api/audios')
      ]);
      setTasks(tasksData);
      setAudios(audiosData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务列表失败');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  // Poll tasks if any are running/pending
  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    const hasActiveTasks = tasks.some(t => ['pending', 'running', 'canceling'].includes(t.status));
    if (!hasActiveTasks) return;

    const timer = setInterval(() => {
      load(false);
    }, 4000);

    return () => clearInterval(timer);
  }, [tasks, load]);

  async function control(task: Task, action: 'pause' | 'cancel' | 'resume' | 'retry') {
    try {
      await api(`/api/tasks/${task.id}/${action}`, { method: 'POST' });
      toast(t('controlSuccess') || '操作成功', 'success');
      await load(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    }
  }

  // Find associated audio if complete
  function getTaskAudio(taskId: string): AudioFile | null {
    return audios.find((a) => a.task_id === taskId) || null;
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {error && (
        <div className="p-3 bg-destructive/15 text-destructive text-xs font-bold rounded-lg flex items-center gap-2">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Task List Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="pdf-list-grid">
          {loading && tasks.length === 0 ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="pdf-card animate-pulse border border-border/50">
                <div className="pdf-card-info flex-1">
                  <div className="w-8 h-8 rounded bg-secondary flex-shrink-0" />
                  <div className="flex-1 flex flex-col gap-2 pl-3">
                    <div className="h-4 bg-secondary rounded w-2/3" />
                    <div className="h-3 bg-secondary rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))
          ) : (
            tasks.map((task) => {
              const audio = getTaskAudio(task.id);
              const isAudioActive = audio && activeAudio?.id === audio.id;
              const isAudioPlaying = isAudioActive && isPlaying;

              return (
                <div
                  key={task.id}
                  className={`pdf-card flex flex-col items-stretch gap-3 p-3.5 border-b border-border/40 ${
                    task.status === 'failed' ? 'border-l-2 border-l-destructive/55' : 
                    task.status === 'running' ? 'border-l-2 border-l-ring/55' : 
                    task.status === 'paused' ? 'border-l-2 border-l-amber-500/55' : ''
                  }`}
                >
                  {/* Row 1: Icon, Title and Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="pdf-card-icon w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0 text-muted-foreground">
                        {task.input_type === 'page_range' ? <FileText size={15} /> : <Wand2 size={15} />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="pdf-title font-semibold text-xs truncate" title={task.source_pdf_name || '粘贴文本转换'}>
                          {task.input_type === 'page_range' ? task.source_pdf_name : '粘贴文本转换'}
                        </span>
                        <div className="pdf-meta-row text-[10px] text-muted-foreground mt-0.5">
                          <span>{task.input_type === 'page_range' ? `${t('pageRange')}: ${task.page_expression}` : t('selectedPastedText')}</span>
                          <span>·</span>
                          <span className="capitalize">{task.audio_mode === 'bilingual' ? t('bilingual') : task.audio_mode === 'english' ? t('englishOnly') : t('chineseOnly')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0 gap-1">
                      <span className={`status-badge is-${task.status} text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase`}>
                        {task.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-semibold">
                        {getStageLabel(task.stage, lang)}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Progress bar (if not completed/failed/canceled) */}
                  {['running', 'pending', 'paused', 'canceling'].includes(task.status) && (
                    <div className="flex flex-col gap-1.5 mt-0.5">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-muted-foreground">{t('progress') || '进度'}</span>
                        <span className="text-ring">{task.progress}%</span>
                      </div>
                      <div className="progress-bar-container h-1.5 rounded-full overflow-hidden bg-secondary">
                        <div 
                          className={`progress-bar-fill h-full transition-all duration-500 rounded-full ${
                            task.status === 'paused' ? 'bg-amber-500' : 'bg-ring'
                          }`} 
                          style={{ width: `${task.progress}%` }} 
                        />
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {task.error_message && (
                    <div className="p-2 bg-destructive/10 text-destructive text-[11px] font-medium rounded border border-destructive/20 leading-normal">
                      {task.error_message}
                    </div>
                  )}

                  {/* Row 3: Action Buttons */}
                  <div className="flex items-center justify-end gap-1.5 mt-1 border-t border-border/30 pt-2">
                    {/* Running / Pending -> Pause, Cancel */}
                    {['pending', 'running'].includes(task.status) && (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => control(task, 'pause')} className="flex items-center gap-1 text-[10px]">
                          <Pause size={10} />
                          <span>{t('pause')}</span>
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => control(task, 'cancel')} className="flex items-center gap-1 text-[10px] hover:bg-destructive/90">
                          <XCircle size={10} />
                          <span>{t('cancel')}</span>
                        </Button>
                      </>
                    )}

                    {/* Paused -> Resume, Cancel */}
                    {task.status === 'paused' && (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => control(task, 'resume')} className="flex items-center gap-1 text-[10px]">
                          <Play size={10} />
                          <span>{t('resume')}</span>
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => control(task, 'cancel')} className="flex items-center gap-1 text-[10px] hover:bg-destructive/90">
                          <XCircle size={10} />
                          <span>{t('cancel')}</span>
                        </Button>
                      </>
                    )}

                    {/* Failed / Canceled -> Retry */}
                    {['failed', 'canceled'].includes(task.status) && (
                      <Button variant="secondary" size="sm" onClick={() => control(task, 'retry')} className="flex items-center gap-1 text-[10px]">
                        <RotateCcw size={10} />
                        <span>{t('retry')}</span>
                      </Button>
                    )}

                    {/* Completed -> Play Audio */}
                    {task.status === 'completed' && audio && (
                      <Button
                        variant={isAudioActive ? 'default' : 'secondary'}
                        size="sm"
                        className="flex items-center gap-1 text-[10px]"
                        onClick={() => {
                          if (isAudioActive) {
                            togglePlay();
                          } else {
                            setActiveAudio(audio);
                          }
                        }}
                      >
                        {isAudioPlaying ? (
                          <>
                            <Pause size={10} fill="currentColor" />
                            <span>{t('pause')}</span>
                          </>
                        ) : (
                          <>
                            <Play size={10} fill="currentColor" />
                            <span>{t('play')}</span>
                          </>
                        )}
                      </Button>
                    )}

                    {/* Manual Refresh */}
                    {['pending', 'running', 'canceling'].includes(task.status) && (
                      <Button variant="ghost" size="iconSm" onClick={() => load(false)} title={t('refreshStatus')}>
                        <RefreshCw size={11} className="text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {!loading && tasks.length === 0 && (
            <div className="empty-state p-8 text-center text-muted-foreground">
              <FileText size={32} className="mx-auto opacity-40 mb-2" />
              <h3 className="font-bold text-sm">暂无任务记录</h3>
              <p className="text-xs">所有的 PDF 和文本转换任务都将在此处展示。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
