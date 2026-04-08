const THEME_STORAGE_KEY = 'opslynk-theme';
let bgAnimationStarted = false;

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleSidebar() {
  document.body.classList.toggle('sidebar-collapsed');
}

try {
  setTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
} catch {
  setTheme('dark');
}

function initLiveBackground() {
  if (bgAnimationStarted) return;
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  bgAnimationStarted = true;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const particles = [];
  const particleCount = 42;
  let rafId = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;

  function readThemeParticles() {
    const styles = getComputedStyle(document.documentElement);
    return {
      r: Number(styles.getPropertyValue('--particle-r').trim()) || 212,
      g: Number(styles.getPropertyValue('--particle-g').trim()) || 167,
      b: Number(styles.getPropertyValue('--particle-b').trim()) || 69
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeParticle(resetY = false) {
    return {
      x: Math.random() * width,
      y: resetY ? (Math.random() * height) : (height + Math.random() * height * .2),
      r: 1 + Math.random() * 2.4,
      a: .08 + Math.random() * .2,
      vx: (Math.random() - .5) * .12,
      vy: -.12 - Math.random() * .26
    };
  }

  function refill() {
    particles.length = 0;
    for (let i = 0; i < particleCount; i += 1) particles.push(makeParticle(true));
  }

  function draw(time) {
    const theme = readThemeParticles();
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(width * .5, height * .12, 0, width * .5, height * .12, Math.max(width, height) * .8);
    gradient.addColorStop(0, `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0.06)`);
    gradient.addColorStop(1, `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    particles.forEach((p, index) => {
      p.x += p.vx + Math.sin((time * .00012) + index) * .03;
      p.y += p.vy;
      if (p.y < -12 || p.x < -24 || p.x > width + 24) Object.assign(p, makeParticle(false));
      ctx.beginPath();
      ctx.fillStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, ${p.a})`;
      ctx.arc(p.x, p.y, p.r + Math.sin((time * .0012) + index) * .35, 0, Math.PI * 2);
      ctx.fill();
    });

    rafId = window.requestAnimationFrame(draw);
  }

  function onVisibility() {
    if (document.hidden) {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }
    if (!rafId) rafId = window.requestAnimationFrame(draw);
  }

  resize();
  refill();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  rafId = window.requestAnimationFrame(draw);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLiveBackground, { once: true });
} else {
  initLiveBackground();
}
