interface Props {
  children: React.ReactNode;
  tone?: 'cyan' | 'pink' | 'green' | 'purple' | 'white' | 'yellow' | 'red';
}

export default function Badge({ children, tone = 'cyan' }: Props) {
  const tones = {
    cyan: 'border-cyber-cyan/40 text-cyber-cyan bg-cyber-cyan/10',
    pink: 'border-cyber-pink/40 text-cyber-pink bg-cyber-pink/10',
    green: 'border-cyber-green/40 text-cyber-green bg-cyber-green/10',
    purple: 'border-cyber-purple/40 text-cyber-purple bg-cyber-purple/10',
    white: 'border-white/40 text-white bg-white/10',
    yellow: 'border-yellow-400/40 text-yellow-400 bg-yellow-400/10',
    red: 'border-red-500/40 text-red-500 bg-red-500/10',
  };

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}
