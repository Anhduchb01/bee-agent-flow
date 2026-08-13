import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
    <div className="flex flex-col gap-6">
      {parsed.missing.length > 0 ? (
        <Alert>
          <AlertTitle>Hợp đồng chưa đủ</AlertTitle>
          <AlertDescription>
            Thiếu {parsed.missing.length} mục bắt buộc: {parsed.missing.join(" · ")}. Spec
            gatekeeper sẽ hỏi ngược và task nằm chờ thêm một vòng.
          </AlertDescription>
        </Alert>
      ) : null}

      {parsed.preamble ? (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{parsed.preamble}</p>
      ) : null}

      {parsed.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold tracking-tight">{section.heading}</h3>

          {section.heading === "Acceptance Criteria" && parsed.acceptance.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {parsed.acceptance.map((ac) => (
                <li key={ac.text} className="flex items-start gap-2 text-sm">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-4 shrink-0 place-items-center rounded border text-[10px]"
                  >
                    {ac.done ? "✓" : ""}
                  </span>
                  <span className="sr-only">{ac.done ? "đã xong:" : "chưa xong:"}</span>
                  <span className={ac.done ? "text-muted-foreground line-through" : undefined}>
                    {ac.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{section.body}</p>
          )}
        </section>
      ))}
    </div>
  );
}
