// The sponsors' logos (assets/sponsors/<slug>/<version>.webp, made by tools/sponsors): each one in full color and as
// flat one-color versions of the same shape (its brand color, black, white). The single-file build carries them in
// window.__SVGP_SPONSORS. livery.js registers them as image assets 'sp:<slug>:<version>'.
export const LOGO_VERSIONS = { color: 'Full color', main: 'Brand color', black: 'Black', white: 'White' };
export const SPONSOR_LOGOS = {
  'dales-tire-and-lube': "Dale's Tire & Lube", 'pinewood-feed-and-seed': 'Pinewood Feed & Seed', 'pine-hollow-credit-union': 'Pine Hollow Credit Union',
  'gulch-outlet-center': 'Gulch Outlet Center', 'mesa-pawn-and-gold': 'Mesa Pawn & Gold', 'desert-rose-motel': 'Desert Rose Motel',
  'metro-cab-co': 'Metro Cab Co.', 'downtown-dental': 'Downtown Dental', 'capital-self-storage': 'Capital Self Storage',
  'azure-marine-supply': 'Azure Marine Supply', 'harbour-fish-market': 'Harbour Fish Market', 'port-azure-yacht-brokers': 'Port Azure Yacht Brokers',
  'hotline-pizza': 'Hotline Pizza', 'max-hardware': 'Max Hardware', 'sunrise-insurance': 'Sunrise Insurance', 'volta-cola': 'Volta Cola',
  'apex-energy': 'Apex Energy', 'velocita-state-lottery': 'Velocita State Lottery', 'gold-coast-airlines': 'Gold Coast Airlines',
  'triton-watches': 'Triton Watches', 'volt-rush-energy': 'Volt Rush Energy', 'cloud-nine-vapor': 'Cloud Nine Vapor', 'quickcash-loans': 'QuickCash Loans',
  'lucky-lous-online-casino': "Lucky Lou's Online Casino", 'brians-bathrooms-and-kitchens': "Brian's Bathrooms & Kitchens",
  kobra: 'Kobra', 'neon-fm': 'Neon FM', rapid: 'Rapid', 'burger-duck': 'Burger Duck', sunset: 'Sunset', svgp: 'SVGP', bayside: 'Bayside',
};
// each one's brand colour (its 'main' version is drawn in it; tools/sponsors/list.mjs)
export const LOGO_COLORS = { 'dales-tire-and-lube': 0x1f5c2a, 'pinewood-feed-and-seed': 0x7a5a2a, 'pine-hollow-credit-union': 0x1d3f7a, 'gulch-outlet-center': 0xd8742a, 'mesa-pawn-and-gold': 0xc8a020, 'desert-rose-motel': 0xd04070, 'metro-cab-co': 0xf2c21a, 'downtown-dental': 0x2aa0c8, 'capital-self-storage': 0xe0601a, 'azure-marine-supply': 0x1a6ab8, 'harbour-fish-market': 0x2a8a8a, 'port-azure-yacht-brokers': 0x14284a, 'hotline-pizza': 0xc8141c, 'max-hardware': 0xe08a1a, 'sunrise-insurance': 0x2a4fa0, 'volta-cola': 0xd01818, 'apex-energy': 0x18c040, 'velocita-state-lottery': 0xf2d22a, 'gold-coast-airlines': 0x1a3a7a, 'triton-watches': 0x111111, 'volt-rush-energy': 0x9ae01a, 'cloud-nine-vapor': 0x8a5ae0, 'quickcash-loans': 0x1fa040, 'lucky-lous-online-casino': 0xe0b020, 'brians-bathrooms-and-kitchens': 0x2a6ab8, kobra: 0x2a9a3a, 'neon-fm': 0xe02a9a, rapid: 0x1a8ae0, 'burger-duck': 0xf2a21a, sunset: 0xf06a2a, svgp: 0xc8141c, bayside: 0x1aa0b8 };
export const logoUrl = (slug, v = 'color') => ((typeof window !== 'undefined' && window.__SVGP_SPONSORS) || {})[`${slug}/${v}`] || `assets/sponsors/${slug}/${v}.webp`;
export const logoAsset = (slug, v = 'color') => `sp:${slug}:${v}`;
export const parseLogoAsset = (id) => { const m = /^sp:([a-z0-9-]+):(\w+)$/.exec(id || ''); return m && SPONSOR_LOGOS[m[1]] ? { slug: m[1], v: m[2] } : null; };

// The logo for a sponsor's name as it's written on a car ('VOLTA', 'DALES TIRE &', "Volta Cola"), or null.
// Short sticker names that would fit more than one take the one they always meant.
const key = (s) => String(s || '').toUpperCase().replace(/'S\b/g, 'S').replace(/&/g, 'AND').replace(/[^A-Z0-9]/g, '');
const ALIAS = { PINE: 'pinewood-feed-and-seed', NEON: 'neon-fm' };
const KEYS = Object.entries(SPONSOR_LOGOS).map(([slug, name]) => [slug, key(name)]);
export function logoForName(text) {
  const k = key(text);
  if (k.length < 4) return null;
  if (ALIAS[k]) return ALIAS[k];
  const hits = KEYS.filter(([, n]) => n === k || n.startsWith(k));
  return hits.length === 1 ? hits[0][0] : hits.find(([, n]) => n === k)?.[0] || null;
}
