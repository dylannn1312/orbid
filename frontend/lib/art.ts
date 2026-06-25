// Deterministic procedural lot art: a layered orbital "nebula" rendered as an
// inline SVG data-URI. Fully self-contained (no external assets). Distinct per
// token_id - hue, ring geometry and node placement all derive from the id.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const enc = (s: string) =>
  s
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, "'")
    .replace(/\n/g, '')
    .replace(/\s{2,}/g, ' ');

export function lotArtDataUri(tokenId: number, size = 512): string {
  const rand = mulberry32(tokenId * 2654435761 + 17);
  const baseHue = (tokenId * 47) % 360;
  const hue2 = (baseHue + 40 + Math.floor(rand() * 40)) % 360;
  const c = size / 2;

  const nebula = `hsl(${baseHue} 70% 58%)`;
  const nebula2 = `hsl(${hue2} 75% 60%)`;
  const ringColor = `hsl(${(baseHue + 200) % 360} 60% 70%)`;

  // Concentric orbital rings.
  let rings = '';
  const ringCount = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < ringCount; i++) {
    const r = 60 + (i * (size * 0.42)) / ringCount + rand() * 14;
    const rot = Math.floor(rand() * 360);
    const ry = r * (0.32 + rand() * 0.5);
    const op = (0.12 + rand() * 0.22).toFixed(2);
    rings += `<ellipse cx='${c}' cy='${c}' rx='${r.toFixed(1)}' ry='${ry.toFixed(
      1,
    )}' fill='none' stroke='${ringColor}' stroke-width='${(0.8 + rand() * 1.4).toFixed(
      1,
    )}' opacity='${op}' transform='rotate(${rot} ${c} ${c})'/>`;
  }

  // Orbiting nodes / distant stars.
  let nodes = '';
  const nodeCount = 7 + Math.floor(rand() * 8);
  for (let i = 0; i < nodeCount; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = 50 + rand() * (size * 0.42);
    const nx = c + Math.cos(ang) * dist;
    const ny = c + Math.sin(ang) * dist * 0.7;
    const nr = (0.8 + rand() * 2.6).toFixed(1);
    const nop = (0.4 + rand() * 0.6).toFixed(2);
    nodes += `<circle cx='${nx.toFixed(1)}' cy='${ny.toFixed(
      1,
    )}' r='${nr}' fill='hsl(${(baseHue + 30) % 360} 90% 82%)' opacity='${nop}'/>`;
  }

  const svg = `
<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
  <defs>
    <radialGradient id='bg' cx='50%' cy='42%' r='75%'>
      <stop offset='0%' stop-color='#1A1E33'/>
      <stop offset='60%' stop-color='#0E1020'/>
      <stop offset='100%' stop-color='#070812'/>
    </radialGradient>
    <radialGradient id='neb' cx='50%' cy='44%' r='42%'>
      <stop offset='0%' stop-color='${nebula2}' stop-opacity='0.9'/>
      <stop offset='45%' stop-color='${nebula}' stop-opacity='0.5'/>
      <stop offset='100%' stop-color='${nebula}' stop-opacity='0'/>
    </radialGradient>
    <filter id='soft'><feGaussianBlur stdDeviation='14'/></filter>
  </defs>
  <rect width='${size}' height='${size}' fill='url(#bg)'/>
  <ellipse cx='${c}' cy='${c * 0.92}' rx='${size * 0.4}' ry='${
    size * 0.34
  }' fill='url(#neb)' filter='url(#soft)'/>
  ${rings}
  ${nodes}
  <circle cx='${c}' cy='${c * 0.9}' r='${(10 + rand() * 8).toFixed(
    1,
  )}' fill='hsl(${hue2} 95% 88%)' opacity='0.95'/>
  <circle cx='${c}' cy='${c * 0.9}' r='${(22 + rand() * 12).toFixed(
    1,
  )}' fill='none' stroke='hsl(${hue2} 95% 80%)' stroke-width='1' opacity='0.5'/>
</svg>`;

  return `data:image/svg+xml,${enc(svg)}`;
}
