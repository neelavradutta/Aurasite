import { AnalyticsSummary } from '@/types/analytics';
import { kpiCardIcons } from '@/components/NavIcons';

interface Props {
  summary: AnalyticsSummary | null;
}

const cards = [
  {
    key: 'total_detections',
    label: 'Total Detections',
    color: 'text-cyber-cyan',
    glow: 'shadow-neon',
    iconBg: 'bg-white/10',
    iconColor: 'text-white',
  },
  {
    key: 'unique_plates',
    label: 'Unique Plates',
    color: 'text-cyber-purple',
    glow: 'shadow-neon-pink',
    iconBg: 'bg-white/10',
    iconColor: 'text-white',
  },
  {
    key: 'avg_confidence',
    label: 'Avg Confidence',
    color: 'text-white',
    glow: 'shadow-neon-green',
    iconBg: 'bg-white/10',
    iconColor: 'text-white',
  },
] as const;

export default function KPICards({ summary }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const Icon = kpiCardIcons[card.key];
        return (
          <div key={card.key} className={`glass-panel flex items-center gap-4 rounded-xl p-5 ${card.glow}`}>
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg} ${card.iconColor}`}
            >
              <Icon
                className={`shrink-0 ${card.key === 'avg_confidence' ? 'h-7 w-7' : 'h-6 w-6'}`}
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-slate-400">{card.label}</p>
              <p className={`mt-0.5 font-orbitron text-2xl font-bold ${card.color}`}>
                {summary != null ? summary[card.key] : '—'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
