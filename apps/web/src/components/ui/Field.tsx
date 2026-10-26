import { useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy =
    [hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-parchment">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} role="alert" className="text-xs text-rose">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-lg border border-line-strong bg-charcoal px-3 text-parchment placeholder:text-dim hover:border-copper focus-visible:border-teal";

export function TextInput(props: ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select {...rest} className={cn(inputClass, "pr-8", className)}>
      {children}
    </select>
  );
}
