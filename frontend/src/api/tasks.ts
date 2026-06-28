import { api } from './client';
import type { Task } from './types';
import type { TaskControlAction } from '../lib/taskStatus';

export type CreateTaskPayload = {
  pdf_id?: string;
  input_type: 'selected_text' | 'page_range' | string;
  selected_text?: string;
  page_expression?: string;
  bilingual_format: string;
  output_style: string;
  audio_mode: string;
  custom_title?: string;
  extract_mode?: 'auto' | 'manual' | string;
};

export function listTasks(limit = 50) {
  return api<Task[]>(`/api/tasks?limit=${limit}`);
}

export function getTask<T = Task>(id: string) {
  return api<T>(`/api/tasks/${id}`);
}

export function createTask(payload: CreateTaskPayload) {
  return api<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function controlTask(id: string, action: TaskControlAction) {
  return api<Task>(`/api/tasks/${id}/${action}`, { method: 'POST' });
}

export function deleteTask(id: string) {
  return api(`/api/tasks/${id}`, { method: 'DELETE' });
}

export function updateTaskText(id: string, text: string) {
  return api(`/api/tasks/${id}/text`, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  });
}

export function getTaskEventsUrl(id: string) {
  return `/api/tasks/${id}/events`;
}

export function getTaskClipUrl(id: string, clipKey: string) {
  return `/api/tasks/${id}/clips/${clipKey}`;
}
