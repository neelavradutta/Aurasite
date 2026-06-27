type Props = {
  message: string;
  className?: string;
  /** Stretch to fill remaining panel space (dashboard / flex layouts). */
  fill?: boolean;
};

export default function PanelEmptyState({ message, className = '', fill = false }: Props) {
  return (
    <div
      className={`panel-empty-state flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 px-4 ${
        fill ? 'min-h-0 flex-1' : 'min-h-[8.5rem]'
      } ${className}`.trim()}
    >
      <p className="text-center text-sm text-slate-500">{message}</p>
    </div>
  );
}
