import { useEffect, useState, useCallback, useRef } from 'react';
import { FileText, Wand2, Pause, Play, RotateCcw, XCircle, RefreshCw, AlertCircle, Trash2 } from 'lucide-react';
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
  const { toast, confirm } = useToast();
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

  async function deleteTask(taskId: string) {
    const ok = await confirm(t('deleteConfirmTask'));
    if (!ok) {
      return;
    }
    try {
      await api(`/api/tasks/${taskId}`, { method: 'DELETE' });
      toast(t('deleteSuccess') || '删除成功', 'success');
      await load(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
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
        <div className="task-card-list">
          {loading && tasks.length === 0 ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="task-card animate-pulse">
                <div className="task-card-header">
                  <div className="task-card-meta flex-1">
                    <div className="task-card-icon-wrapper bg-secondary" />
                    <div className="flex-1 flex flex-col gap-2 pl-1">
                      <div className="h-4 bg-secondary rounded w-2/3" />
                      <div className="h-3 bg-secondary rounded w-1/2" />
                    </div>
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
                  className={`task-card status-${task.status}`}
                >
                  {/* Row 1: Header */}
                  <div className="task-card-header">
                    <div className="task-card-meta">
                      <div className="task-card-icon-wrapper">
                        {task.input_type === 'page_range' ? <FileText size={16} /> : <Wand2 size={16} />}
                      </div>
                      <div className="task-card-info">
                        <span className="task-card-title" title={task.source_pdf_name || '粘贴文本转换'}>
                          {task.input_type === 'page_range' ? task.source_pdf_name : '粘贴文本转换'}
                        </span>
                        <div className="task-card-subtitle">
                          <span>{task.input_type === 'page_range' ? `${t('pageRange')}: ${task.page_expression}` : t('selectedPastedText')}</span>
                          <span>·</span>
                          <span className="capitalize">{task.audio_mode === 'bilingual' ? t('bilingual') : task.audio_mode === 'english' ? t('englishOnly') : t('chineseOnly')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="task-card-status-info">
                      <span className={`status-badge is-${task.status} text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase`}>
                        {task.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-semibold">
                        {getStageLabel(task.stage, lang)}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Progress bar */}
                  {['running', 'pending', 'paused', 'canceling'].includes(task.status) && (
                    <div className="task-card-progress-wrapper">
                      <div className="task-card-progress-text">
                        <span className="text-ring ml-auto">{task.progress}%</span>
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
                    <div className="p-2.5 bg-destructive/10 text-destructive text-[11px] font-medium rounded border border-destructive/20 leading-normal">
                      {task.error_message}
                    </div>
                  )}

                  {/* Row 3: Action Buttons */}
                  <div className="task-card-actions">
                    {!['pending', 'running', 'canceling'].includes(task.status) && (
                      <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => deleteTask(task.id)}
                        title={t('deleteTask') || '删除任务'}
                        className="hover:text-destructive hover:bg-destructive/10 mr-auto text-muted-foreground"
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
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
