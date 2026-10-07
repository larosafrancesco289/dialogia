import { useState } from 'react';
import { ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline';
import { copyText } from '@/lib/clipboard';
import { useT } from '@/lib/i18n';

/** Copies, then shows a check for a moment; a failure is the clipboard helper's notice. */
export function CopyButton({
  text,
  label,
  className = 'icon-button',
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      className={copied ? `${className} is-success` : className}
      aria-label={copied ? t('message.copied') : (label ?? t('message.copy'))}
      title={copied ? t('message.copied') : (label ?? t('message.copy'))}
      onClick={onCopy}
    >
      {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
    </button>
  );
}
