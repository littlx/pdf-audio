import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useT } from './I18nContext';

type ToastType = 'success' | 'error' | 'info';

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextType = {
  toast: (message: string, type?: ToastType) => void;
  confirm: (message: string) => Promise<boolean>;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Custom confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    message: string;
    resolve: (val: boolean) => void;
  } | null>(null);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({
        isOpen: true,
        message,
        resolve: (val: boolean) => {
          setConfirmDialog(null);
          resolve(val);
        },
      });
    });
  }, []);

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}
      
      {/* Toast Overlay Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg flex items-start gap-2.5 transition-all duration-200 animate-slideLeft ${
              t.type === 'success'
                ? 'bg-accent/95 border-ring/40 text-accent-foreground'
                : t.type === 'error'
                ? 'bg-destructive/10 border-destructive/30 text-destructive'
                : 'bg-card border-border text-foreground'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 size={16} className="text-ring flex-shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle size={16} className="text-destructive flex-shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info size={16} className="text-muted-foreground flex-shrink-0 mt-0.5" />}
            <span className="text-xs font-semibold leading-relaxed flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-muted-foreground hover:text-foreground cursor-pointer flex-shrink-0 mt-0.5"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Custom Confirm Dialog Modal */}
      {confirmDialog && (
        <>
          <div className="fixed inset-0 bg-background/40 backdrop-blur-sm z-[9990]" />
          <div className="fixed inset-0 flex items-center justify-center p-4 z-[9991]">
            <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full p-5 flex flex-col gap-4 animate-scaleUp">
              <p className="text-xs font-bold leading-relaxed">{confirmDialog.message}</p>
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button variant="ghost" size="sm" onClick={() => confirmDialog.resolve(false)}>
                  {t('cancel')}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => confirmDialog.resolve(true)}>
                  {t('confirm')}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
