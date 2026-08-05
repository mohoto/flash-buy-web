export function PageHeader({
  title: _title,
  description,
}: {
  title: string;
  description?: string;
}) {
  if (!description) return null;

  return (
    <div className="mb-8">
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
