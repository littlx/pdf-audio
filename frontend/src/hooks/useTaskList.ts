import { useState, useEffect, useCallback } from 'react';
import { listTasks } from '../api/tasks';
import { listAudios } from '../api/audios';
import type { Task, AudioFile } from '../api/types';

export function useTaskList(refreshKey = 0, active = true) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [audios, setAudios] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [tasksData, audiosData] = await Promise.all([
        listTasks(50),
        listAudios()
      ]);
      setTasks(tasksData);
      setAudios(audiosData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task list');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) {
      load(true);
    }
  }, [active, load]);

  useEffect(() => {
    if (refreshKey > 0) {
      load(false);
    }
  }, [refreshKey, load]);

  useEffect(() => {
    const hasActiveTasks = tasks.some(t => ['pending', 'running', 'canceling'].includes(t.status));
    if (!hasActiveTasks) return;

    const timer = setInterval(() => {
      load(false);
    }, 4000);

    return () => clearInterval(timer);
  }, [tasks, load]);

  return {
    tasks,
    setTasks,
    audios,
    setAudios,
    loading,
    error,
    load,
  };
}
