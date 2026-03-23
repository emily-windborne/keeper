type ScreenPlaceholderProps = {
  title: string;
  description: string;
};

export function ScreenPlaceholder({ title, description }: ScreenPlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-10">
        <h1 className="font-serif text-[26px] font-normal tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-muted">
          {description}
        </p>
      </header>
      <div className="rounded-[14px] border border-border bg-surface-raised p-6 shadow-soft sm:p-8">
        <p className="text-center text-[13px] text-ink-faint">Content coming soon</p>
      </div>
    </div>
  );
}
