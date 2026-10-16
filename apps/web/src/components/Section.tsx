import type { ReactNode } from "react";

/** A settings section: title and one-line purpose on the left, controls on the right. */
export function Section({
  id,
  title,
  lede,
  children,
}: {
  id?: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section" id={id}>
      <div>
        <h2>{title}</h2>
        <p className="lede">{lede}</p>
      </div>
      <div className="settings-body">{children}</div>
    </section>
  );
}
