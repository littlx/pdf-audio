import { useState } from 'react';
import { Edit2 } from 'lucide-react';

type EditableTitleProps = {
  initialTitle: string;
  onSave: (newTitle: string) => Promise<void>;
  titleClassName?: string;
  inputClassName?: string;
  doubleClickTip?: string;
};

export default function EditableTitle({
  initialTitle,
  onSave,
  titleClassName = 'pdf-title',
  inputClassName = 'text-xs h-7 py-0 px-2 w-full min-w-0 font-semibold border border-ring focus:ring-1 focus:ring-ring rounded bg-card',
  doubleClickTip = '双击重命名 / Double-click to rename',
}: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialTitle);

  const save = async () => {
    if (!value.trim() || value.trim() === initialTitle) {
      setIsEditing(false);
      setValue(initialTitle);
      return;
    }
    try {
      await onSave(value.trim());
      setIsEditing(false);
    } catch (err) {
      console.error('Rename title failed:', err);
      setValue(initialTitle);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            setIsEditing(false);
            setValue(initialTitle);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        autoFocus
        className={inputClassName}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0 flex-1 group/editable">
      <span
        className={`${titleClassName} truncate`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        title={doubleClickTip}
        style={{ cursor: 'pointer' }}
      >
        {initialTitle}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        className="opacity-0 group-hover/editable:opacity-60 md:group-hover/editable:opacity-60 focus:opacity-100 hover:!opacity-100 transition-opacity text-muted-foreground p-0.5 rounded hover:bg-secondary cursor-pointer flex-shrink-0 edit-title-btn"
        aria-label="Rename"
      >
        <Edit2 size={11} />
      </button>
    </div>
  );
}
