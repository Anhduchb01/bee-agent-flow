/**
 * Tiêu đề trang. Nằm ở components/ chứ không ở features/ vì nó không biết gì về
 * nghiệp vụ — copy sang một sản phẩm khác vẫn biên dịch được.
 */
export function PageTitle({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
