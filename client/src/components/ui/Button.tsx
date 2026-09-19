import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: "primary" | "secondary" | "outline" | "danger" | "ghost"; size?: "xs" | "sm" | "md" | "lg"; loading?: boolean; icon?: React.ReactNode; children?: React.ReactNode; }
const variants = {
  primary: "border border-slate-900 bg-slate-900 text-white shadow-[0_1px_2px_rgba(15,23,42,.18)] hover:border-slate-800 hover:bg-slate-800 active:bg-slate-950",
  secondary: "border border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
  outline: "border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,.04)] hover:border-slate-300 hover:bg-slate-50",
  danger: "border border-rose-600 bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  ghost: "border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
};
const sizes = { xs: "h-7 px-2.5 text-[11px] rounded-lg gap-1.5", sm: "h-8 px-3 text-xs rounded-lg gap-1.5", md: "h-9 px-3.5 text-sm rounded-lg gap-2", lg: "h-11 px-5 text-sm rounded-xl gap-2" };
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ variant = "primary", size = "md", loading = false, disabled, icon, children, className = "", ...props }, ref) => <button ref={ref} disabled={disabled || loading} className={["inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35 focus-visible:ring-offset-1", variants[variant], sizes[size], className].filter(Boolean).join(" ")} {...props}>{loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon ? <span className="shrink-0">{icon}</span> : null}{children}</button>);
Button.displayName = "Button";