import Link from 'next/link';

export default function LiveFeedLaunchCard() {
  return (
    <Link
      href="/live"
      className="glass-panel group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-cyber-cyan/20 p-5 transition hover:border-cyber-cyan/50 hover:shadow-neon"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,247,255,0.18),transparent_38%)] opacity-70 transition group-hover:opacity-100" />
      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyber-cyan">Live Feed</p>
        </div>
        <span className="h-3 w-3 rounded-full bg-cyber-green live-dot" />
      </div>

      <div className="relative mt-5 flex flex-1 items-center justify-center rounded-xl border border-cyber-cyan/20 bg-black/35">
        <div className="relative text-center">
          <div className="mx-auto h-16 w-16 rounded-full border border-cyber-cyan/40 bg-cyber-cyan/10 shadow-[0_0_36px_rgba(0,247,255,0.28)]" />
          <p className="mt-4 text-sm text-slate-300">Open live camera and source detection</p>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyber-pink">Click to launch</p>
        </div>
      </div>
    </Link>
  );
}
