// Driver aids: each one is a separate layer on top of the same physics (CarPhysics.aid), set per player.
// Presets set them all at once (plus the gearbox and racing line); touching one row makes it Custom.
// Turning aids off earns a Career prize bonus. Online, the host can limit what's allowed.

// key -> { label, short (HUD chip), values [[value, label]], bonus per value (Career prize %), desc }
export const AIDS = {
  abs: { label: 'ABS', short: 'ABS', values: [['on', 'On'], ['off', 'Off']], bonus: { off: 6 },
    desc: 'Anti-lock brakes. <b>Off</b>: press the brake too hard and the front wheels lock: they skid, stop you less well, and won\'t steer until you ease off. Squeeze the brake instead of stamping on it. Keep it on if you brake with a key.' },
  tc: { label: 'Traction Control', short: 'TC', values: [['high', 'High'], ['low', 'Low'], ['off', 'Off']], bonus: { low: 3, off: 6 },
    desc: 'Cuts power when the rear tyres start to spin. <b>Low</b> lets them slip a little, <b>Off</b> is all down to your right foot. In road and GT cars it switches to a drift mode once you\'re properly sideways (or just used the handbrake): the rears can spin enough to hold the angle, but not enough to spin you.' },
  stab: { label: 'Stability Control', short: 'SC', values: [['on', 'On'], ['off', 'Off']], bonus: { off: 6 },
    desc: 'Stops the car rotating faster than the tyres can hold and catches small slides. <b>Off</b>: a snap of oversteer is yours to catch.' },
  cs: { label: 'Counter-Steer Help', short: 'CS', values: [['strong', 'Strong'], ['light', 'Light'], ['off', 'Off']], bonus: { light: 2, off: 4 },
    desc: 'Turns the front wheels toward the slide for you when the rear steps out. It steps aside as soon as you counter-steer yourself.' },
  brake: { label: 'Braking Assist', short: 'BA', values: [['on', 'On'], ['off', 'Off']], bonus: { off: 5 },
    desc: 'Brakes for you when you arrive at a corner too fast. You can always brake harder yourself.' },
  steer: { label: 'Steering Assist', short: 'SA', values: [['on', 'On'], ['off', 'Off']], bonus: { off: 3 },
    desc: 'Stops you turning the front wheels past their grip, the most common cause of understeer.' },
};
export const AID_KEYS = Object.keys(AIDS);
// the gearbox and racing line are part of the presets too (and of the bonus)
export const EXTRA_BONUS = { gearbox: { manual: 3 }, racingLine: { brake: 1, off: 2 } };

export const PRESETS = {
  easy: { label: 'Easy', aids: { abs: 'on', tc: 'high', stab: 'on', cs: 'strong', brake: 'on', steer: 'on' }, gearbox: 'auto', racingLine: 'full',
    desc: 'Every aid on: the car brakes for corners and catches slides for you. Good for learning a circuit.' },
  standard: { label: 'Standard', aids: { abs: 'on', tc: 'high', stab: 'on', cs: 'light', brake: 'off', steer: 'off' }, gearbox: 'auto', racingLine: 'full',
    desc: 'ABS, traction and stability control on. You do the braking and steering.' },
  sim: { label: 'Sim', aids: { abs: 'off', tc: 'off', stab: 'off', cs: 'off', brake: 'off', steer: 'off' }, gearbox: 'manual', racingLine: 'off',
    desc: 'Nothing between you and the tyres. Manual gears, no line. The biggest prize bonus.' },
};
export const PRESET_VALS = [['easy', 'Easy'], ['standard', 'Standard'], ['sim', 'Sim'], ['custom', 'Custom']];

// the aids in effect from the saved settings (old saves had one on/off 'tc' switch)
export function aidsOf(settings) {
  if (settings.aids) return { ...PRESETS.standard.aids, ...settings.aids };
  return settings.tc === false ? { ...PRESETS.standard.aids, tc: 'off', stab: 'off' } : { ...PRESETS.standard.aids };
}
// which preset the settings match (else 'custom')
export function presetOf(settings) {
  const a = aidsOf(settings);
  for (const [k, p] of Object.entries(PRESETS))
    if (AID_KEYS.every(x => a[x] === p.aids[x]) && settings.gearbox === p.gearbox && settings.racingLine === p.racingLine) return k;
  return 'custom';
}
export function applyPreset(settings, k) {
  const p = PRESETS[k]; if (!p) return;
  settings.aids = { ...p.aids }; settings.gearbox = p.gearbox; settings.racingLine = p.racingLine;
}

// Career prize bonus (%) for the aids you race with
export function aidBonus(aids, gearbox, racingLine) {
  let b = 0;
  for (const k of AID_KEYS) b += AIDS[k].bonus[aids[k]] || 0;
  b += EXTRA_BONUS.gearbox[gearbox] || 0;
  b += EXTRA_BONUS.racingLine[racingLine] || 0;
  return b;
}

// online: what the host allows. 'any' = anything, 'noassist' = no braking / steering assist, 'sim' = everything off
export const AID_RULES = [['any', 'Anything'], ['noassist', 'No Auto-Brake / Steer'], ['sim', 'Sim Only']];
export const AID_RULE_DESC = 'Which driver aids players may use. <b>No Auto-Brake / Steer</b>: the two aids that drive the car for you are off. <b>Sim Only</b>: every aid off (gearbox and racing line are still your choice).';
export function limitAids(aids, rule) {
  if (rule === 'sim') return { ...PRESETS.sim.aids };
  if (rule === 'noassist') return { ...aids, brake: 'off', steer: 'off' };
  return { ...aids };
}

// what CarPhysics uses: numbers and flags (AI drivers use AI_AIDS, the handling they were tuned with)
export function physAids(a) {
  return { abs: a.abs !== 'off', tc: a.tc === 'off' ? 0 : a.tc === 'low' ? 0.5 : 1, stab: a.stab !== 'off',
    cs: a.cs === 'off' ? 0 : a.cs === 'strong' ? 2 : 1, steer: a.steer === 'on', brake: a.brake === 'on' };
}
export const AI_AIDS = physAids(PRESETS.standard.aids);
