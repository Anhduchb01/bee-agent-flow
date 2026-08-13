/**
 * Tiêu đề trang. Nằm ở components/ chứ không ở features/ vì nó không biết gì về
 * nghiệp vụ — copy sang một sản phẩm khác vẫn biên dịch được.
 *
 * 32px/600 với tracking âm chặt (`heading-lg` của Geist). Không dùng
 * `display-xl` 48px: cỡ đó là của hero marketing, mà app này không có.
 */
export function PageTitle({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[2rem] leading-10 font-semibold tracking-heading text-foreground">
        {title}
      </h1>
      {hint ? <p className="text-sm text-body">{hint}</p> : null}
    </div>
  );
}
