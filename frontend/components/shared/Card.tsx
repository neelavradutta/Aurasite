interface Props {
  children: React.ReactNode;
  className?: string;
  title?: string;
  id?: string;
}

export default function Card({ children, className = '', title, id }: Props) {
  return (
    <section id={id} className={`glass-panel rounded-xl p-4 ${className}`}>
      {title && <h3 className="section-title mb-4">{title}</h3>}
      {children}
    </section>
  );
}
