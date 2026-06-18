interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export default function Button({ variant = 'primary', className = '', children, ...props }: Props) {
  const variants = {
    primary: 'border-cyber-cyan/50 bg-cyber-cyan/10 text-cyber-cyan hover:bg-cyber-cyan/20 shadow-neon',
    secondary: 'border-cyber-purple/50 bg-cyber-purple/10 text-cyber-purple hover:bg-cyber-purple/20',
    danger: 'border-cyber-pink/50 bg-cyber-pink/10 text-cyber-pink hover:bg-cyber-pink/20',
  };

  return (
    <button
      className={`rounded-md border px-4 py-2 text-sm font-medium transition ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
