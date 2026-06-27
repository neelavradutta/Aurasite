import { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  iconBg?: string;
  iconColor?: string;
  iconBoxClassName?: string;
  subtitleClassName?: string;
  titleClassName?: string;
  className?: string;
  useSectionTitle?: boolean;
}

function IconBox({
  icon,
  iconBg,
  iconColor,
  iconBoxClassName = 'h-8 w-8',
}: {
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  iconBoxClassName?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${iconBoxClassName} ${iconBg} ${iconColor}`}
    >
      {icon}
    </span>
  );
}

export default function PanelIconHeader({
  icon,
  title,
  subtitle,
  iconBg = 'bg-white/10',
  iconColor = 'text-white',
  iconBoxClassName,
  subtitleClassName = 'mt-0.5 text-[10px] leading-snug text-slate-500',
  titleClassName = '',
  className = '',
  useSectionTitle = true,
}: Props) {
  const titleClasses = `${useSectionTitle ? 'section-title' : ''} inline-flex items-center gap-3 whitespace-nowrap ${titleClassName}`.trim();

  if (!subtitle) {
    return (
      <header className={`mb-3 shrink-0 ${className}`.trim()}>
        <h3 className={titleClasses}>
          <IconBox icon={icon} iconBg={iconBg} iconColor={iconColor} iconBoxClassName={iconBoxClassName} />
          {title}
        </h3>
      </header>
    );
  }

  return (
    <header className={`mb-3 flex shrink-0 items-center gap-3 ${className}`.trim()}>
      <IconBox icon={icon} iconBg={iconBg} iconColor={iconColor} iconBoxClassName={iconBoxClassName} />
      <div className="min-w-0 flex-1">
        <h3 className={`${useSectionTitle ? 'section-title' : ''} whitespace-nowrap ${titleClassName}`.trim()}>
          {title}
        </h3>
        <p className={subtitleClassName}>{subtitle}</p>
      </div>
    </header>
  );
}
