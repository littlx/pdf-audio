type ProgressBarProps = {
  progress: number;
  status?: string;
  className?: string;
  heightClass?: string;
};

export default function ProgressBar({
  progress,
  status,
  className = '',
  heightClass = 'h-1',
}: ProgressBarProps) {
  const isPaused = status === 'paused';
  const fillBg = isPaused ? 'bg-amber-500' : 'bg-ring';

  return (
    <div className={`progress-bar-container rounded-full overflow-hidden bg-secondary w-full ${heightClass} ${className}`}>
      <div 
        className={`progress-bar-fill h-full transition-all duration-500 rounded-full ${fillBg}`} 
        style={{ width: `${progress}%` }} 
      />
    </div>
  );
}
