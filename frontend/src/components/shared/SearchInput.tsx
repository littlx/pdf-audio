import React from 'react';
import { Search, X, ArrowRight } from 'lucide-react';

type SearchInputProps = {
  placeholder?: string;
  value: string;
  onChange: (val: string) => void;
  onClear?: () => void;
  onSubmit?: () => void;
  style?: React.CSSProperties;
  className?: string;
};

export default function SearchInput({
  placeholder,
  value,
  onChange,
  onClear,
  onSubmit,
  style,
  className = '',
}: SearchInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      onSubmit();
    }
  };

  return (
    <div className={`search-input-wrapper ${className}`} style={style}>
      <Search size={14} className="text-muted-foreground/60 shrink-0" />
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="search-clear-btn"
          title="Clear"
        >
          <X size={12} />
        </button>
      )}
      {onSubmit && (
        <button
          type="button"
          onClick={onSubmit}
          className="search-submit-btn"
          title="Search"
        >
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}
