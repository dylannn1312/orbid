'use client';

// The signature: an orbital system viewed at a tilt - sealed bids orbiting a
// molten proof-star. Pure CSS 3D (perspective + rotateX); no assets. Reduced
// motion is honoured globally (globals.css freezes all animation).
//
// Each track is a circle the size of its ring; spinning the track sweeps its
// single node around the rim. Durations differ so the nodes never align -
// a small, living constellation.

interface Track {
  size: number; // px diameter of the ring/track
  dur: number; // seconds per orbit
  tone: 'azure' | 'violet' | 'gold';
  reverse?: boolean;
}

const TRACKS: Track[] = [
  { size: 200, dur: 14, tone: 'azure' },
  { size: 300, dur: 22, tone: 'violet', reverse: true },
  { size: 400, dur: 30, tone: 'gold' },
];

export function HeroOrbit() {
  return (
    <div className="orbit-scene" aria-hidden>
      <div className="orbit-plane">
        {TRACKS.map((t) => (
          <div
            key={t.size}
            className="orbit-ring"
            style={{ width: t.size, height: t.size }}
          />
        ))}
        {TRACKS.map((t) => (
          <div
            key={`track-${t.size}`}
            className="orbit-track"
            style={{
              width: t.size,
              height: t.size,
              animationDuration: `${t.dur}s`,
              animationDirection: t.reverse ? 'reverse' : 'normal',
            }}
          >
            <span className={`orbit-node ${t.tone}`} />
          </div>
        ))}
      </div>
      <div className="orbit-core" />
    </div>
  );
}
