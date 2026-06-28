import { api, getToken, parseApiErrorMessage } from './client';
import type { PdfFile } from './types';

export type PdfSortKey = 'uploaded_at' | 'file_size' | 'original_name' | string;
export type TextExtractionMode = 'local' | 'ai';

export type OutlineItem = {
  level: number;
  title: string;
  page: number;
};

export function listPdfs(keyword = '', sort: PdfSortKey = 'uploaded_at') {
  return api<PdfFile[]>(`/api/pdfs?keyword=${encodeURIComponent(keyword)}&sort=${sort}`);
}

export function deletePdf(id: string) {
  return api(`/api/pdfs/${id}`, { method: 'DELETE' });
}

export function renamePdf(id: string, originalName: string) {
  return api<PdfFile>(`/api/pdfs/${id}/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ original_name: originalName }),
  });
}

export function getPdfFileUrl(id: string) {
  return `/api/pdfs/${id}/file`;
}

export function getPdfOutline(id: string) {
  return api<OutlineItem[]>(`/api/pdfs/${id}/outline`);
}

export function updateLastPdfPage(id: string, page: number) {
  return api(`/api/pdfs/${id}/last-page`, {
    method: 'PATCH',
    body: JSON.stringify({ page }),
  });
}

export function extractPdfText(id: string, pageExpression: string, mode: TextExtractionMode = 'local') {
  return api<{ text: string }>(`/api/pdfs/${id}/${mode === 'ai' ? 'extract-ai' : 'extract'}`, {
    method: 'POST',
    body: JSON.stringify({ page_expression: pageExpression }),
  });
}

export function uploadPdf(file: File, onProgress?: (progress: number) => void): Promise<PdfFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/pdfs', true);
    const token = getToken();
    if (token) {
      xhr.setRequestHeader('X-Access-Token', token);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as PdfFile);
        } catch {
          reject(new Error('Upload completed, but failed to parse response'));
        }
        return;
      }
      reject(new Error(parseApiErrorMessage(xhr.responseText, xhr.statusText) || `Upload failed with status ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
