export const TOKEN_KEY = 'sub_pdf_access_token';
export const OFFLINE_CACHE_NAME = 'sub-pdf-offline-audio-v1';
export const DRAFT_PREFIX = 'pdf_audio_draft_';
export const LAST_AUDIO_KEY = 'app-last-audio-id';
export const THEME_DARK_KEY = 'theme_dark';

export function getDraftKey(pdfId: string, pageExpression: string) {
  return `${DRAFT_PREFIX}${pdfId}_${pageExpression}`;
}
