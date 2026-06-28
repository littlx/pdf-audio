import React from 'react';
import { AlertCircle } from 'lucide-react';

type AlertProps = {
  message: string;
  type?: 'error' | 'warning' | 'info' | 'success';
  className?: string;
  icon?: React.ReactNode;
};

export default function Alert({
  message,
  type = 'error',
  className = '',
  icon,
}: AlertProps) {
  const isDestructive = type === 'error';
  const bgClass = isDestructive 
    ? 'bg-destructive/15 text-destructive border-destructive/20' 
    : 'bg-muted/50 text-muted-foreground border-border';
  
  return (
    <div className={`p-3 text-xs font-bold rounded-lg border flex items-center gap-2 ${bgClass} ${className}`}>
      {icon || <AlertCircle size={14} />}
      <span>{message}</span>
    </div>
  );
}
