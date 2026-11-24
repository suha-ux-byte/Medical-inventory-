import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Info, ShieldAlert, X, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils.ts';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      'bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500 shadow-xs focus-visible:ring-teal-500',
    secondary:
      'bg-[#0F2942] text-white hover:bg-[#163a5c] dark:bg-slate-800 dark:hover:bg-slate-700 focus-visible:ring-slate-500',
    outline:
      'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:ring-teal-500',
    ghost:
      'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white focus-visible:ring-slate-400',
    danger:
      'bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 focus-visible:ring-red-500',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  };

  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-600 dark:focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 dark:focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-600 dark:focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
      {children}
      {required && <span className="text-red-600 dark:text-red-400 ml-0.5">*</span>}
    </label>
  );
}

// Accessible, zero-pill semantic status indicator with icon + explicit text label
export function StatusText({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const s = status.toLowerCase();
  let tone = 'text-slate-600 dark:text-slate-300';
  let Icon = Info;

  if (
    s.includes('expired') ||
    s.includes('out of stock') ||
    s.includes('rejected') ||
    s.includes('suspended') ||
    s.includes('critical') ||
    s.includes('within 7') ||
    s.includes('quarantined') ||
    s.includes('damaged') ||
    s.includes('inactive')
  ) {
    tone = 'text-red-700 dark:text-red-400';
    Icon = s.includes('within 7') ? ShieldAlert : XCircle;
  } else if (
    s.includes('within 30') ||
    s.includes('low stock') ||
    s.includes('pending') ||
    s.includes('warning') ||
    s.includes('paused') ||
    s.includes('within 60')
  ) {
    tone = 'text-amber-700 dark:text-amber-400';
    Icon = s.includes('pending') ? Clock : AlertTriangle;
  } else if (s.includes('within 90') || s.includes('processing') || s.includes('demo') || s.includes('swap')) {
    tone = 'text-cyan-700 dark:text-cyan-400';
    Icon = Clock;
  } else if (
    s.includes('safe') ||
    s.includes('adequate') ||
    s.includes('surplus') ||
    s.includes('approved') ||
    s.includes('completed') ||
    s.includes('verified') ||
    s.includes('active') ||
    s.includes('optimal') ||
    s.includes('fulfilled')
  ) {
    tone = 'text-emerald-700 dark:text-emerald-400';
    Icon = CheckCircle2;
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap', tone, className)}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden',
          maxWidth
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-4">{description}</p>
      {action}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
          <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-3.5 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-800 rounded ml-auto" />
          <div className="h-3.5 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      ))}
    </div>
  );
}
