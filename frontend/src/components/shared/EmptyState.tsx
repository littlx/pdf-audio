import React from 'react';

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty-state p-8 text-center text-muted-foreground ${className}`}>
      {icon && <div className="mx-auto mb-2 opacity-40">{icon}</div>}
      <h3 className="font-bold text-sm">{title}</h3>
      {description && <p className="text-xs mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
