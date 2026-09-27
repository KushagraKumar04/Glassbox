interface Props {
  title: string;
  note: string;
}

export function PlaceholderPage({ title, note }: Props) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[880px] mx-auto px-6 pt-16 pb-10 text-center">
        <div className="glass rounded-2xl p-10 inline-block max-w-md">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted mb-3">
            {title}
          </div>
          <div className="text-[13px] text-muted/80 leading-relaxed">
            {note}
          </div>
        </div>
      </div>
    </div>
  );
}