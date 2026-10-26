import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Panel({
  title,
  eyebrow,
  aside,
  children,
  className,
  headingLevel = 2,
  ...rest
}: Omit<ComponentProps<"section">, "title"> & {
  title?: ReactNode;
  eyebrow?: ReactNode;
  aside?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={cn("panel p-5 sm:p-6", className)} {...rest}>
      {(title ?? eyebrow ?? aside) ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
            {title ? (
              <Heading className="text-xl leading-tight text-parchment sm:text-2xl">
                {title}
              </Heading>
            ) : null}
          </div>
          {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
