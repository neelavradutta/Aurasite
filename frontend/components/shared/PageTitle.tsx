import { ReactNode } from 'react';

type PageTitleProps = {
  title: string;
  subtitle?: string;
  className?: string;
  children?: ReactNode;
};

export default function PageTitle({ title, subtitle, className = '', children }: PageTitleProps) {
  return (
    <div className={`mobile-page-title ${className}`.trim()}>
      <div className="flex w-full flex-wrap items-center gap-3">
        <h2 className="page-title text-[1.75rem] text-white sm:text-3xl">{title}</h2>
        {children}
      </div>
      {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
    </div>
  );
}
