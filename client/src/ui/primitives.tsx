/** Minimal shadcn/ui-style primitives, hand-rolled to avoid CLI codegen. */

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'magenta' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT_CLS: Record<Variant, string> = {
  primary: 'btn-neon text-cyan-100',
  magenta: 'btn-neon btn-magenta text-fuchsia-100',
  ghost: 'border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.09] transition-colors',
  danger: 'border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition-colors',
};

const SIZE_CLS: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-6 text-base rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold tracking-wide select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-not-allowed',
        VARIANT_CLS[variant],
        SIZE_CLS[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-xl border border-cyan-300/20 bg-[#081027]/80 px-3 text-sm text-cyan-50 placeholder:text-slate-500 outline-none focus:border-cyan-300/60 focus:shadow-[0_0_16px_rgba(34,211,238,0.25)] transition-shadow',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export function Label({ children, className, htmlFor }: { children: ReactNode; className?: string; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className={cn('text-xs font-medium uppercase tracking-widest text-cyan-200/70', className)}>{children}</label>;
}

/** Frosted panel used across the app. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('glass rounded-2xl', className)}>{children}</div>;
}
