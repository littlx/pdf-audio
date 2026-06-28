import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Pause, Play, RotateCcw, XCircle, RefreshCw, AlertCircle, Trash2, CheckCircle2, Circle, Eye, Volume2 } from 'lucide-react';
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
  const [detailTask, setDetailTask] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [playingClip, setPlayingClip] = useState<string | null>(null);
  const clipAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load task details dynamically
  const loadTaskDetail = async (taskId: string) => {
    setIsLoadingDetail(true);
    try {
      const data = await api<any>(`/api/tasks/${taskId}`);
      setDetailTask(data);
      setIsDetailOpen(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载任务详情失败', 'error');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Play inline audio clip
  const playClip = (taskId: string, clipKey: string) => {
    if (clipAudioRef.current) {
      clipAudioRef.current.pause();
    }
    
    if (playingClip === clipKey) {
      setPlayingClip(null);
      return;
    }
    
    // The browser will send the auth cookie automatically
    const audioUrl = `/api/tasks/${taskId}/clips/${clipKey}`;
    const audio = new Audio(audioUrl);
    clipAudioRef.current = audio;
    setPlayingClip(clipKey);
    
    audio.play().catch((err) => {
      console.error('Failed to play clip:', err);
      toast(lang === 'zh' ? '音频文件加载失败或正在生成' : 'Failed to load clip audio', 'error');
      setPlayingClip(null);
    });
    
    audio.onended = () => {
      setPlayingClip(null);
    };
  };

  // Stop audio on unmount or close
  useEffect(() => {
    return () => {
      if (clipAudioRef.current) {
        clipAudioRef.current.pause();
      }
    };
  }, []);
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
        ? '该任务目前处于活跃或未完成状态，删除它将会强力终止并清理所有临时文件。是否确定强制删除？'
        : 'This task is still active or incomplete. Deleting it will force-terminate and clean up all temporary files. Are you sure you want to force delete?')
      : (lang === 'zh'
        ? '确定要删除该任务吗？'
        : 'Are you sure you want to delete this task?');

    const ok = await confirm(confirmMsg);
    if (!ok) return;
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

                        {/* View Details Action */}
                        <Button
                          variant="ghost"
                          size="iconSm"
                          onClick={() => loadTaskDetail(task.id)}
                          data-tooltip={lang === 'zh' ? '查看中间过程与生成片段' : 'View intermediate clips'}
                          className="hover:bg-muted text-muted-foreground"
                          disabled={isLoadingDetail}
                        >
                          <Eye size={12.5} />
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

    {/* Task Details Modal */}
    {isDetailOpen && detailTask && createPortal(
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-[1080px] bg-card rounded-lg border border-border shadow-2xl flex flex-col max-h-[51vh] overflow-hidden">
          {/* Modal Header */}
          <div className="p-4 border-b border-border flex justify-between items-center bg-muted/40 shrink-0">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-semibold text-foreground m-0">
                {lang === 'zh' ? '任务执行过程详情' : 'Task Execution Details'}
              </h3>
              <span className="text-[10px] text-muted-foreground">
                ID: {detailTask.id} • {detailTask.source_pdf_name || (lang === 'zh' ? '自由输入文本' : 'Raw text input')}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsDetailOpen(false);
                if (clipAudioRef.current) clipAudioRef.current.pause();
                setPlayingClip(null);
              }}
              className="w-7 h-7 p-0 shrink-0"
            >
              <XCircle size={16} />
            </Button>
          </div>

          {/* Modal Body */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 min-h-0">
            {/* Task Progress Status Header */}
            <div className="p-3 rounded bg-muted/30 border border-border flex flex-col gap-2 shrink-0">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  {lang === 'zh' ? '当前进度' : 'Progress'}: {getStageLabel(detailTask.stage, lang)} ({detailTask.progress}%)
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                  detailTask.status === 'completed' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                  detailTask.status === 'failed' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                  detailTask.status === 'running' ? 'bg-primary/10 text-primary border-primary/20 animate-pulse' :
                  'bg-muted text-muted-foreground border-border'
                }`}>
                  {detailTask.status}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 rounded-full ${
                    detailTask.status === 'failed' ? 'bg-destructive' :
                    detailTask.status === 'completed' ? 'bg-green-500' : 'bg-primary'
                  }`} 
                  style={{ width: `${detailTask.progress}%` }} 
                />
              </div>
              {detailTask.error_message && (
                <div className="mt-1 text-[10px] p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {detailTask.error_message}
                </div>
              )}
            </div>

            {/* Tabs Content */}
            <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
              {/* 1. Raw Text Box */}
              <div className="flex flex-col gap-1.5 md:w-1/2 min-h-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                  {lang === 'zh' ? '1. 提取的原始文本' : '1. Raw Extracted Text'}
                </span>
                {detailTask.extracted_text ? (
                  <div className="flex-1 overflow-y-auto text-xs font-sans p-3 bg-muted/20 rounded border border-border/80 whitespace-pre-wrap text-muted-foreground leading-relaxed md:max-h-none max-h-36 text-justify">
                    {detailTask.extracted_text}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic p-2 bg-muted/10 rounded border border-border border-dashed shrink-0">
                    {lang === 'zh' ? '暂无提取的原始文本（可能正处于提取队列中）' : 'No raw text extracted yet.'}
                  </span>
                )}
              </div>

              {/* 2. Bilingual Segments & Audio Clips */}
              <div className="flex-1 flex flex-col gap-1.5 min-h-0 md:w-1/2">
                <div className="flex justify-between items-center shrink-0">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {lang === 'zh' ? '2. 双语对照句段与生成音频片段' : '2. Bilingual Segments & Audio Clips'}
                  </span>
                  <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                    {lang === 'zh' ? `已生成 ${detailTask.completed_clips.length} 个片段` : `${detailTask.completed_clips.length} clips ready`}
                  </span>
                </div>

                {detailTask.segments && detailTask.segments.length > 0 ? (
                  <div className="flex-1 overflow-y-auto border border-border rounded divide-y divide-border/60 bg-card">
                    {detailTask.segments.map((seg: any) => {
                      const engKey = `${String(seg.index).padStart(4, '0')}_english`;
                      const chiKey = `${String(seg.index).padStart(4, '0')}_chinese`;
                      const hasEngClip = detailTask.completed_clips.includes(engKey);
                      const hasChiClip = detailTask.completed_clips.includes(chiKey);
                      
                      return (
                        <div key={seg.index} className="p-3 hover:bg-muted/10 flex flex-row items-center gap-3 transition-colors">
                          {/* Left side: Segment index indicator (vertically centered) */}
                          <div className="w-8 shrink-0 text-center select-none font-mono">
                            <span className="text-[10px] font-bold text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                              #{seg.index}
                            </span>
                          </div>

                          {/* Right side: Bilingual text blocks & play buttons */}
                          <div className="flex-1 min-w-0 flex flex-col gap-2">
                            {/* English block */}
                            <div className="flex justify-between items-start gap-4 group">
                              <p className="text-[11px] leading-relaxed text-foreground m-0 flex-1 font-sans">
                                {seg.english}
                              </p>
                              {hasEngClip && (
                                <button
                                  type="button"
                                  onClick={() => playClip(detailTask.id, engKey)}
                                  className={`p-1 rounded cursor-pointer transition-all border shrink-0 ${
                                    playingClip === engKey
                                      ? 'bg-primary/20 text-primary border-primary/30 animate-pulse'
                                      : 'bg-muted/50 hover:bg-primary/10 border-border hover:border-primary/20 text-muted-foreground hover:text-primary'
                                  }`}
                                  title={lang === 'zh' ? '播放英文片段' : 'Play English clip'}
                                >
                                  <Volume2 size={11} className={playingClip === engKey ? 'scale-110' : ''} />
                                </button>
                              )}
                            </div>

                            {/* Chinese block */}
                            <div className="flex justify-between items-start gap-4 group">
                              <p className="text-[11px] leading-relaxed text-foreground m-0 flex-1 font-sans">
                                {seg.chinese}
                              </p>
                              {hasChiClip && (
                                <button
                                  type="button"
                                  onClick={() => playClip(detailTask.id, chiKey)}
                                  className={`p-1 rounded cursor-pointer transition-all border shrink-0 ${
                                    playingClip === chiKey
                                      ? 'bg-primary/20 text-primary border-primary/30 animate-pulse'
                                      : 'bg-muted/50 hover:bg-primary/10 border-border hover:border-primary/20 text-muted-foreground hover:text-primary'
                                  }`}
                                  title={lang === 'zh' ? '播放中文片段' : 'Play Chinese clip'}
                                >
                                  <Volume2 size={11} className={playingClip === chiKey ? 'scale-110' : ''} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center border border-border border-dashed rounded p-6 text-center text-muted-foreground bg-muted/5">
                    <Circle size={20} className="text-muted-foreground animate-spin opacity-40 mb-2" />
                    <span className="text-xs">
                      {lang === 'zh' ? '尚未生成对照句段（AI 翻译对齐进行中...）' : 'Translating and aligning segments...'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    </div>
  );
}
