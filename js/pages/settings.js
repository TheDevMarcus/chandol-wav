
import { emit } from '../core/state.js';
import { getGlow, setGlow, getGlowColor, setGlowColor, getGlowSource, setGlowSource } from '../player/viz.js';

function getFlag(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === '1'; } catch (e) { return fallback; }
}
function setFlag(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) {}
}

export const getCensorLyrics = () => getFlag('chandol-censor', false);
export const getAllowMild = () => getFlag('chandol-censor-mild-ok', false);
export const getGroupVersions = () => getFlag('chandol-group-versions', true);
export const getAnimations = () => getFlag('chandol-animations', true);
export const getMatchCover = () => getFlag('chandol-cover-theme', false);
function applyAnimations(on) {
  document.documentElement.classList.toggle('no-anim', !on);
  if (!on) document.documentElement.classList.add('lite');
  else if (!document.documentElement.dataset.liteDevice) document.documentElement.classList.remove('lite');
}
applyAnimations(getAnimations());

export function getOverlayTrigger() {
  try { return localStorage.getItem('chandol-open') || 'title'; } catch (e) { return 'title'; }
}

export function setOverlayTrigger(val) {
  try { localStorage.setItem('chandol-open', val); } catch (e) {}
}

export function initSettings() {
  const radios = document.querySelectorAll('input[name="ovTrigger"]');
  const cur = getOverlayTrigger();
  radios.forEach((r) => { r.checked = r.value === cur; });
  radios.forEach((r) => {
    r.addEventListener('change', () => { if (r.checked) setOverlayTrigger(r.value); });
  });

  const animBox = document.getElementById('setAnim');
  animBox.checked = getAnimations();
  animBox.addEventListener('change', () => {
    setFlag('chandol-animations', animBox.checked);
    applyAnimations(animBox.checked);
  });

  const coverBox = document.getElementById('setCover');
  coverBox.checked = getMatchCover();
  coverBox.addEventListener('change', () => {
    setFlag('chandol-cover-theme', coverBox.checked);
    emit('coversetting');
  });

  const groupBox = document.getElementById('setGroup');
  groupBox.checked = getGroupVersions();
  groupBox.addEventListener('change', () => {
    setFlag('chandol-group-versions', groupBox.checked);
    emit('librarysettings');
  });

  const glowBox = document.getElementById('setGlow');
  const glowColor = document.getElementById('setGlowColor');
  const colorRow = document.getElementById('glowColorRow');
  const srcRadios = document.querySelectorAll('input[name="glowSrc"]');
  const srcRows = ['glowSrcCover', 'glowSrcTheme', 'glowSrcCustom'].map((id) => document.getElementById(id));
  const syncGlow = () => {
    const src = getGlowSource();
    srcRadios.forEach((r) => { r.disabled = !glowBox.checked; });
    srcRows.forEach((row) => row.classList.toggle('off', !glowBox.checked));
    glowColor.disabled = !glowBox.checked || src !== 'custom';
    colorRow.classList.toggle('off', glowColor.disabled);
  };
  glowBox.checked = getGlow();
  glowColor.value = getGlowColor();
  srcRadios.forEach((r) => { r.checked = r.value === getGlowSource(); });
  syncGlow();
  glowBox.addEventListener('change', () => { setGlow(glowBox.checked); syncGlow(); emit('glowsettings'); });
  srcRadios.forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    setGlowSource(r.value);
    syncGlow();
    emit('glowsettings');
  }));
  glowColor.addEventListener('input', () => { setGlowColor(glowColor.value); emit('glowsettings'); });

  const censorBox = document.getElementById('setCensor');
  const mildBox = document.getElementById('setMild');
  const mildRow = document.getElementById('mildRow');
  const syncMild = () => {
    mildBox.disabled = !censorBox.checked;
    mildRow.classList.toggle('off', !censorBox.checked);
  };
  censorBox.checked = getCensorLyrics();
  mildBox.checked = getAllowMild();
  syncMild();
  censorBox.addEventListener('change', () => {
    setFlag('chandol-censor', censorBox.checked);
    syncMild();
    emit('lyricsettings');
  });
  mildBox.addEventListener('change', () => {
    setFlag('chandol-censor-mild-ok', mildBox.checked);
    emit('lyricsettings');
  });
  const launcher = window.wavDesktop && window.wavDesktop.launcher;
  const lGroup = document.getElementById('launcherGroup');
  if (launcher && lGroup) {
    const lBox = document.getElementById('setLauncher');
    const lHint = document.getElementById('launcherHint');
    const sync = (st) => {
      lBox.checked = !!st.installed;
      lBox.disabled = !!st.installed && !st.ours;
      lHint.textContent = st.installed && !st.ours
        ? 'Already set up on this computer'
        : st.installed
          ? 'Added. Turn off to remove the launcher entry and icons'
          : 'Adds .wav to your app menu so you can find and pin it like any other app';
    };
    launcher.status().then((st) => {
      if (!st || !st.supported) return;
      lGroup.hidden = false;
      sync(st);
    }).catch(() => {});
    lBox.addEventListener('change', async () => {
      const want = lBox.checked;
      lBox.disabled = true;
      try {
        const r = await launcher.set(want);
        sync(r && typeof r.installed === 'boolean' ? r : await launcher.status());
        if (r && !r.ok) lHint.textContent = "Couldn't change that. Try again";
      } catch (e) {
        lBox.checked = !want;
        lBox.disabled = false;
        lHint.textContent = "Couldn't change that. Try again";
      }
    });
  }
}
