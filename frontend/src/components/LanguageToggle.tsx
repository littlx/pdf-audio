import { Languages } from 'lucide-react';
import { useT } from '../context/I18nContext';

type LanguageToggleProps = {
  size?: 'sm' | 'xs';
  showIcon?: boolean;
  centered?: boolean;
};

export default function LanguageToggle({
  size = 'sm',
  showIcon = false,
  centered = false,
}: LanguageToggleProps) {
  const { lang, onLanguageChange } = useT();

  const isXs = size === 'xs';

  const handleToggle = () => {
    onLanguageChange(lang === 'zh' ? 'en' : 'zh');
  };

  const containerClass = centered
    ? `flex items-center justify-center gap-2 w-full ${isXs ? 'mt-4 pt-4 border-t border-border' : ''}`
    : 'flex items-center gap-2';

  return (
    <div className={containerClass}>
      {showIcon && <Languages size={isXs ? 13 : 14} className="text-muted-foreground" />}
      <span
        className={`font-semibold transition-colors ${
          isXs ? 'text-[10px]' : 'text-[11px]'
        } ${lang === 'zh' ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        简体中文
      </span>
      <button
        type="button"
        onClick={handleToggle}
        className={`relative inline-flex items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer ${
          isXs ? 'h-4 w-7' : 'h-5 w-9'
        } ${lang === 'en' ? 'bg-ring' : 'bg-secondary border border-border'}`}
        aria-label="Toggle Language"
      >
        <span
          className={`inline-block transform rounded-full bg-foreground transition-transform duration-200 ${
            isXs ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'
          } ${
            lang === 'en'
              ? isXs
                ? 'translate-x-[14.5px]'
                : 'translate-x-[18px]'
              : isXs
              ? 'translate-x-[1.5px]'
              : 'translate-x-[2px]'
          }`}
        />
      </button>
      <span
        className={`font-semibold transition-colors ${
          isXs ? 'text-[10px]' : 'text-[11px]'
        } ${lang === 'en' ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        English
      </span>
    </div>
  );
}
