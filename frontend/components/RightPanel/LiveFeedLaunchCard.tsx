import Link from 'next/link';

export default function LiveFeedLaunchCard() {
  return (
    <Link
      href="/live"
      className="glass-panel group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/5 p-5 transition hover:border-cyber-cyan/30 hover:bg-white/[0.03]"
    >
      <div className="relative">
        <h3 className="section-title">Live Feed</h3>
      </div>

      <div className="relative mt-2 flex flex-1 items-center justify-center rounded-xl border border-cyber-cyan/20 bg-black/35">
        <div className="relative text-center">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-cyber-cyan">Awaiting Stream</p>
          <p className="mt-1 text-center text-sm text-slate-500">Select a camera or enter a url</p>
        </div>
      </div>
    </Link>
  );
}
