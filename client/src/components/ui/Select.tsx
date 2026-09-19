import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  sizeVariant?: 'sm' | 'md';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, sizeVariant = 'sm', className = '', children, ...props }, ref) => {
    const sizeCls = sizeVariant === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';

    return (
      <div className="relative inline-block w-full">
        {label && <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>}
        <div className="relative">
          <select
            ref={ref}
            className={[
              'w-full appearance-none rounded-lg border border-slate-200 bg-white pr-8 font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20',
              sizeCls,
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            {...props}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';
