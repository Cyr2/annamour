/** One long, loose curve across the room: the red thread, far behind everything. */
const THREAD = "M-40 640C140 560 260 700 430 650S700 470 860 520 1120 700 1280 610 1460 470 1520 500";

/**
 * « La salle obscure »: the backdrop behind every screen. A warm projector
 * glow from above, two pools drifting very slowly, a faint red thread and
 * film grain. It is marked as glisse's backdrop, so the glass floating over
 * it genuinely lenses the thread. Purely decorative; still under reduced motion.
 */
export function Ambient() {
  return (
    <div aria-hidden className="am-ambient" data-glisse-backdrop="">
      <div className="am-ambient-pool" data-tone="peach" />
      <div className="am-ambient-pool" data-tone="lilac" />
      <svg className="am-ambient-thread" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d={THREAD} />
      </svg>
      <div className="am-ambient-vignette" />
      <div className="am-ambient-grain" />
    </div>
  );
}
