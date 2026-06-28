import { useState, useEffect } from 'react';
import { getDraftKey } from '../lib/storageKeys';
import { useToast } from '../context/ToastContext';
import { useT } from '../context/I18nContext';

export type DraftStatus = 'idle' | 'saving' | 'saved';

export function useDebouncedDraft(
  pdfId: string | undefined,
  pageExpression: string,
  mode: 'pages' | 'text',
  textToConvert: string,
  setTextToConvert: (val: string) => void,
  setEditableText: (val: string) => void,
  originalExtractedText: string,
  initialText: string
) {
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const { toast } = useToast();
  const { lang } = useT();

  // Debounced Auto-save to localStorage
  useEffect(() => {
    if (mode === 'text' && pdfId && textToConvert && textToConvert !== originalExtractedText) {
      setDraftStatus('saving');
      const timer = setTimeout(() => {
        localStorage.setItem(getDraftKey(pdfId, pageExpression), textToConvert);
        setDraftStatus('saved');
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [textToConvert, mode, pdfId, pageExpression, originalExtractedText]);

  // Load draft from localStorage on document/page change
  useEffect(() => {
    if (mode !== 'text' || !pdfId) {
      return;
    }
    const savedDraft = localStorage.getItem(getDraftKey(pdfId, pageExpression));
    if (savedDraft) {
      setTextToConvert(savedDraft);
      setEditableText(savedDraft);
      setDraftStatus('saved');
      toast(
        lang === 'zh' ? '已自动载入未保存的本地草稿。' : 'Auto-loaded uncommitted local draft.',
        'success'
      );
    } else if (!initialText && !originalExtractedText) {
      setDraftStatus('idle');
    }
  }, [pdfId, pageExpression, mode]);

  const clearDraft = () => {
    if (pdfId) {
      localStorage.removeItem(getDraftKey(pdfId, pageExpression));
    }
    setDraftStatus('idle');
  };

  return {
    draftStatus,
    setDraftStatus,
    clearDraft,
  };
}
