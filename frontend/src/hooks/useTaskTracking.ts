import { useState, useEffect } from 'react';
import type { Task } from '../api/types';
import { getTask, getTaskEventsUrl } from '../api/tasks';
import { isTerminalTaskStatus, mergeTask } from '../lib/taskStatus';

export function useTaskTracking(initialTask: Task | null) {
  const [task, setTask] = useState<Task | null>(initialTask);

  useEffect(() => {
    setTask(initialTask);
  }, [initialTask?.id, initialTask?.status]);

  const isTerminal = task ? isTerminalTaskStatus(task.status) : true;

  useEffect(() => {
    if (!task || isTerminal) return;

    let timer: any = null;
    let isCleanedUp = false;
    const source = new EventSource(getTaskEventsUrl(task.id));

    const startPolling = () => {
      if (timer || isCleanedUp) return;
      timer = setInterval(async () => {
        try {
          const data = await getTask(task.id);
          if (isCleanedUp) return;

          setTask(prev => {
            const merged = mergeTask(prev, data);
            if (isTerminalTaskStatus(merged.status)) {
              clearInterval(timer);
              timer = null;
            }
            return merged;
          });
        } catch (err) {
          console.error('Task polling failed:', err);
        }
      }, 3000);
    };

    source.onmessage = (event) => {
      if (isCleanedUp) return;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      const data = JSON.parse(event.data);
      setTask(prev => {
        const merged = mergeTask(prev, data);
        if (isTerminalTaskStatus(merged.status)) {
          source.close();
        }
        return merged;
      });
    };

    source.onerror = () => {
      if (isCleanedUp) return;
      source.close();
      startPolling();
    };

    return () => {
      isCleanedUp = true;
      source.close();
      if (timer) clearInterval(timer);
    };
  }, [task?.id, isTerminal]);

  return {
    task,
    setTask,
  };
}
