import { useState } from 'react';

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
  inputClassName = 'text-xs h-7 py-0 px-2 w-full font-semibold border border-ring focus:ring-1 focus:ring-ring rounded bg-card',
  doubleClickTip = 'Double-click to rename',
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
    } catch {
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
    <span
      className={titleClassName}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      title={doubleClickTip}
    >
      {initialTitle}
    </span>
  );
}
