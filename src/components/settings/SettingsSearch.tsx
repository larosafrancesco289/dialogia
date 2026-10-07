import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useT } from '@/lib/i18n';

export type SettingsSearchProps = {
  value: string;
  onChange: (query: string) => void;
  placeholder?: string;
};

export function SettingsSearch({
  value,
  onChange,
  placeholder: givenPlaceholder,
}: SettingsSearchProps) {
  const t = useT();
  const placeholder = givenPlaceholder ?? t('settings.search');
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onChange(newValue);
    }, 150);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
    inputRef.current?.focus();
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="settings-search">
      <MagnifyingGlassIcon className="settings-search-icon h-4 w-4" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        className="settings-search-input"
        placeholder={placeholder}
        aria-label={t('settings.search')}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && localValue) {
            e.preventDefault();
            handleClear();
          }
        }}
      />
      {localValue && (
        <button
          type="button"
          className="settings-search-clear"
          onClick={handleClear}
          aria-label={t('settings.clearSearch')}
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
