import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,border-color,color,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-copper text-charcoal hover:bg-gold border border-copper shadow-[0_8px_24px_-12px_rgb(212_154_98/0.7)]",
  secondary:
    "border border-line-strong bg-ink-2 text-parchment hover:border-copper hover:text-white",
  ghost: "border border-transparent text-muted hover:text-parchment hover:bg-ink-2",
  danger: "border border-rose-deep bg-transparent text-rose hover:bg-rose-deep/20",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-[0.95rem]",
  lg: "min-h-12 px-6 text-base",
};

export function buttonClass(
  variant: Variant = "secondary",
  size: Size = "md",
  extra?: string,
): string {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <Link href={href as never} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
