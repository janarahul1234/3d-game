/** Accessible modal dialog with backdrop blur (shadcn-style, hand-rolled). */

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

export function Dialog({ open, onClose, title, children, className, icon }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'glass w-full max-w-lg rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto scroll-thin animate-[riseFade_.35s_ease-out]',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-wide text-cyan-100 neon-text">
            {icon}
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
