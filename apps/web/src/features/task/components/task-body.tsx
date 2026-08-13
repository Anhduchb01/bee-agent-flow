import { StatusDot } from "@/components/status-dot";

import { parseTaskBody } from "../lib/parse-body";

/**
 * Nội dung issue theo hợp đồng 5 mục, AC dạng checkbox.
 *
 * Checkbox ở đây **không bấm được**, và đó là cố ý: nguồn sự thật nằm ở body
 * issue trên GitHub. Một ô tick được nhưng không ghi đi đâu là lời nói dối tệ
 * hơn một ô không tick được.
 */
export function TaskBody({ body }: { body: string }) {
  const parsed = parseTaskBody(body);

  return (
    <div className="flex flex-col gap-7">
      {parsed.missing.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-card border border-warning/40 bg-card px-5 py-4">
          <StatusDot tone="warn" className="mt-1.5" />
          <div>
            <p className="text-sm font-medium tracking-title text-foreground">
              Incomplete contract
            </p>
            <p className="mt-1 text-sm text-body">
              Missing {parsed.missing.length} required section(s): {parsed.missing.join(" · ")}. The
              spec gatekeeper will ask back and the task waits another round.
            </p>
          </div>
        </div>
      ) : null}

      {parsed.preamble ? (
        <p className="text-sm whitespace-pre-wrap text-body">{parsed.preamble}</p>
      ) : null}

      {parsed.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-2.5">
          <h3 className="eyebrow">{section.heading}</h3>

          {section.heading === "Acceptance Criteria" && parsed.acceptance.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {parsed.acceptance.map((ac) => (
                <li key={ac.text} className="flex items-start gap-2.5 text-sm">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-control border border-border bg-card text-[10px] text-foreground"
                  >
                    {ac.done ? "✓" : ""}
                  </span>
                  <span className="sr-only">{ac.done ? "done:" : "not done:"}</span>
                  <span className={ac.done ? "text-faint line-through" : "text-body"}>
                    {ac.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm whitespace-pre-wrap text-body">{section.body}</p>
          )}
        </section>
      ))}
    </div>
  );
}
