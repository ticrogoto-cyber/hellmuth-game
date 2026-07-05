const GOLD = "rgba(232, 179, 58, ";
const GREEN = "rgba(74, 103, 65, ";
const COUNT = 48;

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  o: number;
  c: string;
  life: number;
  max: number;
}

function spawn(w: number, h: number): Mote {
  const gold = Math.random() > 0.4;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.15,
    vy: -(0.08 + Math.random() * 0.18),
    r: 0.6 + Math.random() * 1.4,
    o: 0,
    c: gold ? GOLD : GREEN,
    life: 0,
    max: 400 + Math.random() * 600,
  };
}

export function mountParticles(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  if (mq.matches) return () => {};

  let raf = 0;
  let active = true;
  const pool: Mote[] = [];

  const resize = (): void => {
    const r = devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * r;
    canvas.height = h * r;
    ctx.setTransform(r, 0, 0, r, 0, 0);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  for (let i = 0; i < COUNT; i++) {
    const m = spawn(canvas.clientWidth, canvas.clientHeight);
    m.life = Math.random() * m.max;
    pool.push(m);
  }

  const tick = (): void => {
    if (!active) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < pool.length; i++) {
      const m = pool[i];
      m.life++;
      if (m.life > m.max || m.y < -10 || m.x < -10 || m.x > w + 10) {
        pool[i] = spawn(w, h);
        pool[i].y = h + 4;
        continue;
      }
      m.x += m.vx;
      m.y += m.vy;
      const t = m.life / m.max;
      m.o = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
      m.o *= 0.45;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = m.c + m.o + ")";
      ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    active = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}
