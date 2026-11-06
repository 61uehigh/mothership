import type { ReactNode } from "react";

/**
 * ### PageSection
 *
 * A group on a Settings page or a tab like it, with an optional button at
 * the right of its title. The page's own name is the page title above it,
 * so a page's only or first section leaves `title` out rather than repeat it.
 */
export function PageSection({ title, description, action, children }: { title?: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {title !== undefined && <h2 className="text-sm font-semibold">{title}</h2>}
          {description !== undefined && <p className={`${title === undefined ? "" : "mt-0.5 "}text-xs text-zinc-500`}>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
