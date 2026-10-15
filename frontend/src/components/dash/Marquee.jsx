import { Fragment } from "react";

export const Marquee = ({ items }) => {
  const row = (
    <div className="flex shrink-0 items-center gap-10 pr-10">
      {items.map((t, i) => (
        <Fragment key={i}>
          <span className="whitespace-nowrap">{t}</span>
          <span className="h-1 w-1 rounded-full bg-[#7FA6FF]" />
        </Fragment>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden bg-night py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-slate-300" data-testid="status-marquee">
      <div className="marquee-track flex w-max">
        {row}
        {row}
      </div>
    </div>
  );
};
