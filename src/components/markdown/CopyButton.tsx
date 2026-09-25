import { useState } from 'react';
import { ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline';
import { copyText } from '@/lib/clipboard';

/** Copies, then shows a check for a moment; a failure is the clipboard helper's notice. */
export function CopyButton({
  text,
  label = 'Copy',
  className = 'icon-button',
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      className={className}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      onClick={onCopy}
    >
      {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
    </button>
  );
}
