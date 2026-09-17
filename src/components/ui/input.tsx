import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, prefix, suffix, ...props }, ref) => {
  if (prefix || suffix) {
    return (
      <div className={cn("flex h-9 w-full items-center rounded-md border border-border-strong bg-input text-[13px] shadow-sm focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-accent", className)}>
        {prefix ? <span className="pl-3 pr-1 text-muted-foreground select-none">{prefix}</span> : null}
        <input
          type={type}
          ref={ref}
          className={cn("h-full w-full min-w-0 flex-1 bg-transparent px-2 outline-none placeholder:text-subtle disabled:cursor-not-allowed disabled:opacity-50", prefix ? "pl-0" : "pl-3", suffix ? "pr-0" : "pr-3", type === "number" && "tabular")}
          {...props}
        />
        {suffix ? <span className="pr-3 pl-1 text-muted-foreground select-none">{suffix}</span> : null}
      </div>
    );
  }
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-border-strong bg-input px-3 text-[13px] shadow-sm transition-colors placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        type === "number" && "tabular",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-md border border-border-strong bg-input px-3 py-2 text-[13px] shadow-sm placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }>(({ className, wrapperClassName, children, ...props }, ref) => (
  <div className={cn("relative min-w-0", wrapperClassName)}>
    <select
      ref={ref}
      className={cn(
        "flex h-9 w-full appearance-none rounded-md border border-border-strong bg-input pl-3 pr-8 text-[13px] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <svg className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  </div>
));
Select.displayName = "Select";

export { Input, Textarea, Select };
