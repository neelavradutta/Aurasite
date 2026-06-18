import { AnalyticsSummary } from '@/types/analytics';

interface Props {
  summary: AnalyticsSummary | null;
}

const cards = [
  { key: 'total_detections', label: 'Total Detections', color: 'text-cyber-cyan', glow: 'shadow-neon' },
  { key: 'unique_plates', label: 'Unique Plates', color: 'text-cyber-purple', glow: 'shadow-neon-pink' },
  { key: 'avg_confidence', label: 'Avg Confidence', color: 'text-white', glow: 'shadow-neon-green' },
] as const;

export default function KPICards({ summary }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div key={card.key} className={`glass-panel rounded-xl p-5 ${card.glow}`}>
          <p className="text-xs uppercase tracking-widest text-slate-400">{card.label}</p>
          <p className={`mt-2 font-orbitron text-3xl font-bold ${card.color}`}>
            {summary != null ? summary[card.key] : '—'}
          </p>
        </div>
      ))}
    </div>
  );
}
