import { useEffect, useState, useCallback, useRef } from 'react';
import { FileText, Pause, Play, RotateCcw, XCircle, RefreshCw, AlertCircle, Trash2, CheckCircle2, Circle } from 'lucide-react';
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

type TaskManagerPaneProps = {
  refreshKey?: number;
  active?: boolean;
};

export default function TaskManagerPane({ refreshKey = 0, active = true }: TaskManagerPaneProps) {
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
    if (refreshKey > 0) {
      load(false);
    }
  }, [refreshKey, load]);

  useEffect(() => {
    if (active) {
      load(true);
    }
  }, [active, load]);

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

  async function deleteTask(task: Task) {
    const isRunning = ['pending', 'running', 'canceling'].includes(task.status);
    const confirmMsg = isRunning
      ? (lang === 'zh'
        ? '该任务仍处于活跃或取消中状态。请先取消并等待任务停止后再删除。'
        : 'This task is still active or canceling. Cancel it first and wait for it to stop before deleting.')
      : t('deleteConfirmTask');

    const ok = await confirm(confirmMsg);
    if (!ok || isRunning) return;
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
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

  // Quick stats computed values
  const totalCount = tasks.length;
  const runningCount = tasks.filter(t => ['running', 'pending'].includes(t.status)).length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const failedCount = tasks.filter(t => t.status === 'failed').length;

  return (
    <div className="flex flex-col gap-4 h-full">
      {error && (
        <div className="p-3 bg-destructive/15 text-destructive text-xs font-bold rounded-lg flex items-center gap-2 animate-scaleUp">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Bar Overview Header */}
      {!loading && tasks.length > 0 && (
        <div className="task-metrics-bar">
          <div className="task-metric-item">
            <span className="task-metric-dot" />
            <span className="task-metric-label">{t('statTotal') || '总任务'}:</span>
            <span className="task-metric-value">{totalCount}</span>
          </div>
          <div className="task-metric-divider" />
          <div className="task-metric-item">
            <span className={`task-metric-dot ${runningCount > 0 ? 'is-running' : ''}`} />
            <span className="task-metric-label">{t('statRunning') || '进行中'}:</span>
            <span className="task-metric-value">{runningCount}</span>
          </div>
          <div className="task-metric-divider" />
          <div className="task-metric-item">
            <span className="task-metric-dot is-completed" />
            <span className="task-metric-label">{t('statCompleted') || '已完成'}:</span>
            <span className="task-metric-value">{completedCount}</span>
          </div>
          <div className="task-metric-divider" />
          <div className="task-metric-item">
            <span className="task-metric-dot is-failed" />
            <span className="task-metric-label">{t('statFailed') || '已失败'}:</span>
            <span className="task-metric-value">{failedCount}</span>
          </div>
        </div>
      )}

      {/* Task Dashboard List */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="task-dash-list">
          {loading && tasks.length === 0 ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="task-dash-row animate-pulse">
                <div className="task-dash-left">
                  <div className="task-status-indicator-dot bg-secondary" />
                  <div className="flex flex-col gap-2 flex-1 pl-1">
                    <div className="h-4 bg-secondary rounded w-2/3" />
                    <div className="h-3 bg-secondary rounded w-1/3" />
                  </div>
                </div>
                <div className="task-dash-console">
                  <div className="h-1.5 bg-secondary rounded w-full mb-2" />
                  <div className="h-4 bg-secondary rounded w-1/3" />
                </div>
              </div>
            ))
          ) : (
            tasks.map((task) => {
              const audio = getTaskAudio(task.id);
              const isAudioActive = audio && activeAudio?.id === audio.id;
              const isAudioPlaying = isAudioActive && isPlaying;

              // Format styling mode representation
              let styleLabel = '';
              if (task.output_style === 'faithful') styleLabel = t('faithful');
              else if (task.output_style === 'plain_explanation') styleLabel = t('plainExplanation');
              else if (task.output_style === 'child_friendly') styleLabel = t('childFriendly');
              else if (task.output_style === 'exam_english') styleLabel = t('examEnglish');
              else if (task.output_style === 'business_english') styleLabel = t('businessEnglish');

              return (
                <div key={task.id} className="task-dash-row">
                  {/* Left Column: Icon + Text details */}
                  <div className="task-dash-left">
                    <div className={`task-status-indicator-dot status-${task.status}`}>
                      {task.status === 'completed' ? (
                        <CheckCircle2 size={16} />
                      ) : task.status === 'running' ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : task.status === 'paused' ? (
                        <Pause size={15} />
                      ) : task.status === 'failed' ? (
                        <AlertCircle size={16} />
                      ) : (
                        <Circle size={15} />
                      )}
                    </div>

                    <div className="task-dash-info">
                      <span className="task-dash-title" title={task.custom_title || task.source_pdf_name || '粘贴文本转换'}>
                        {task.custom_title || (task.input_type === 'page_range' ? task.source_pdf_name : '粘贴文本转换')}
                      </span>
                      <div className="task-dash-chips">
                        <span className="task-chip">
                          {task.input_type === 'page_range' ? `${t('pages')}: ${task.page_expression}` : t('selectedPastedText')}
                        </span>
                        {styleLabel && <span className="task-chip">{styleLabel}</span>}
                        <span className="task-chip is-bilingual">
                          {task.audio_mode === 'bilingual' ? t('bilingual') : task.audio_mode === 'english' ? t('englishOnly') : t('chineseOnly')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Progress & Actions console */}
                  <div className="task-dash-console">
                    {/* Progress Bar (Full width of the console area) */}
                    {['running', 'pending', 'paused', 'canceling'].includes(task.status) && (
                      <div className="progress-bar-container h-1 rounded-full overflow-hidden bg-secondary w-full">
                        <div 
                          className={`progress-bar-fill h-full transition-all duration-500 rounded-full ${
                            task.status === 'paused' ? 'bg-amber-500' : 'bg-ring'
                          }`} 
                          style={{ width: `${task.progress}%` }} 
                        />
                      </div>
                    )}

                    {/* Status & Buttons (Same Row) */}
                    <div className="task-dash-status-actions-row">
                      {/* Left side: Status text / Stage label */}
                      <div className="task-dash-status-label-group">
                        {['running', 'pending', 'paused', 'canceling'].includes(task.status) ? (
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold">
                            <span className="task-dash-stage">{getStageLabel(task.stage, lang)}</span>
                            <span className="text-ring font-bold">{task.progress}%</span>
                          </div>
                        ) : task.status === 'completed' ? (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-ring" />
                            <span>{t('completed')}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-[10px] text-destructive font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                              <span>{task.status === 'failed' ? t('failed') : t('canceled')}</span>
                            </div>
                            {task.error_message && (
                              <span className="text-[9px] text-destructive/80 truncate max-w-[140px]" title={task.error_message}>
                                {task.error_message}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right side: Action buttons */}
                      <div className="task-dash-buttons-group">
                        {/* Delete Action */}
                        <Button
                          variant="ghost"
                          size="iconSm"
                          onClick={() => deleteTask(task)}
                          data-tooltip={t('deleteTask') || '删除任务'}
                          className="hover:text-destructive hover:bg-destructive/10 text-muted-foreground"
                        >
                          <Trash2 size={12.5} />
                        </Button>

                        {/* Active Controls */}
                        {['pending', 'running'].includes(task.status) && (
                          <>
                            <Button variant="secondary" size="iconSm" onClick={() => control(task, 'pause')} data-tooltip={t('pause') || '暂停'}>
                              <Pause size={12} />
                            </Button>
                            <Button variant="destructive" size="iconSm" onClick={() => control(task, 'cancel')} data-tooltip={t('cancel') || '取消'} className="hover:bg-destructive/90">
                              <XCircle size={12} />
                            </Button>
                          </>
                        )}

                        {task.status === 'paused' && (
                          <>
                            <Button variant="secondary" size="iconSm" onClick={() => control(task, 'resume')} data-tooltip={t('resume') || '继续'}>
                              <Play size={12} />
                            </Button>
                            <Button variant="destructive" size="iconSm" onClick={() => control(task, 'cancel')} data-tooltip={t('cancel') || '取消'} className="hover:bg-destructive/90">
                              <XCircle size={12} />
                            </Button>
                          </>
                        )}

                        {['failed', 'canceled'].includes(task.status) && (
                          <Button variant="secondary" size="iconSm" onClick={() => control(task, 'retry')} data-tooltip={t('retry') || '重试'}>
                            <RotateCcw size={12} />
                          </Button>
                        )}

                        {/* Play Action */}
                        {task.status === 'completed' && audio && (
                          <Button
                            variant={isAudioActive ? 'default' : 'secondary'}
                            size="sm"
                            className="flex items-center gap-1 text-[10px] h-7 px-2"
                            onClick={() => {
                              if (isAudioActive) {
                                togglePlay();
                              } else {
                                setActiveAudio(audio);
                              }
                            }}
                          >
                            {isAudioPlaying ? (
                              <Pause size={10} fill="currentColor" />
                            ) : (
                              <Play size={10} fill="currentColor" />
                            )}
                            <span className="hidden sm:inline">{isAudioPlaying ? t('pause') : t('play')}</span>
                          </Button>
                        )}

                        {/* Manual Status Refresh */}
                        {['pending', 'running', 'canceling'].includes(task.status) && (
                          <Button variant="ghost" size="iconSm" onClick={() => load(false)} data-tooltip={t('refreshStatus') || '刷新状态'}>
                            <RefreshCw size={11} className="text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {!loading && tasks.length === 0 && (
            <div className="empty-state p-8 text-center text-muted-foreground">
              <FileText size={32} className="mx-auto opacity-40 mb-2" />
              <h3 className="font-bold text-sm">暂无任务记录</h3>
              <p className="text-xs mb-3">所有的 PDF 和文本转换任务都将在此处展示。</p>
              <Button variant="secondary" size="sm" onClick={() => load(true)}>
                <RefreshCw size={13} /> {t('refreshStatus') || '刷新'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
