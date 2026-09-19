import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  dot?: boolean;
  children?: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  brand: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  warning: 'bg-amber-50 text-amber-800 border-amber-200/60',
  danger: 'bg-rose-50 text-rose-700 border-rose-200/60',
  info: 'bg-sky-50 text-sky-700 border-sky-200/60',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200/60',
};

const dotColors: Record<string, string> = {
  brand: 'bg-indigo-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  neutral: 'bg-slate-400',
};

export function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...props
}: BadgeProps) {
  const sizeCls = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  const vStyle = variantStyles[variant] || variantStyles.neutral;
  const dColor = dotColors[variant] || dotColors.neutral;

  return (
    <span
      className={['inline-flex items-center gap-1.5 font-medium rounded-full border', sizeCls, vStyle, className].filter(Boolean).join(' ')}
      {...props}
    >
      {dot && <span className={['h-1.5 w-1.5 rounded-full shrink-0', dColor].join(' ')} />}
      {children}
    </span>
  );
}
