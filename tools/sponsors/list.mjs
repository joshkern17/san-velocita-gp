// Every sponsor that needs a logo: World Career SPONSOR_POOL (js/wcareer.js) + garage stickers (js/main.js).
// slug = folder under assets/sponsors/. Colors match the game's. sil = flat-shape brightness cut (neon logos: 110).
const S = (name, color, what, idea, extra = {}) => ({
  name, color, what, idea, slug: name.toLowerCase().replace(/&/g, 'and').replace(/['.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), ...extra,
});

export const SPONSORS = [
  // local businesses
  S("Dale's Tire & Lube", '#1F5C2A', 'a small-town tire shop and oil change garage', 'a chunky tire with tread, chrome block lettering'),
  S('Pinewood Feed & Seed', '#7A5A2A', 'a rural farm supply store', 'a pine tree over a seed sack or wheat stalks, wood-cut lettering'),
  S('Pine Hollow Credit Union', '#1D3F7A', 'a small local credit union', 'a stylised pine in a solid shield, stately serif with spaced caps sub-line'),
  S('Gulch Outlet Center', '#D8742A', 'a desert outlet shopping mall', 'a mesa/canyon silhouette with sunset stripes'),
  S('Mesa Pawn & Gold', '#C8A020', 'a pawn shop that buys gold', 'three pawnbroker balls, gold chrome lettering'),
  S('Desert Rose Motel', '#D04070', 'a roadside motel', 'a neon motel sign with a rose, neon tube script', { sil: 110 }),
  S('Metro Cab Co.', '#F2C21A', 'a city taxi company', 'a checker-band stripe, bold italic speed lettering'),
  S('Downtown Dental', '#2AA0C8', 'a city dental office', 'a sparkling tooth, clean rounded lettering'),
  S('Capital Self Storage', '#E0601A', 'a self storage facility', 'a roll-up storage door made of horizontal stripes'),
  S('Azure Marine Supply', '#1A6AB8', 'a boat and marine parts store', 'an anchor with wave stripes'),
  S('Harbour Fish Market', '#2A8A8A', 'a seaside fish market', 'a leaping fish over waves'),
  S('Port Azure Yacht Brokers', '#14284A', 'a posh yacht dealer', 'a sailboat sail as a triangle, elegant serif'),
  // bigger names
  S('Hotline Pizza', '#C8141C', 'a pizza delivery chain', 'a pizza slice with a coiled phone cord, script logotype'),
  S('Max Hardware', '#E08A1A', 'a hardware store chain', 'a hammer or wrench crossing a bold extruded MAX'),
  S('Sunrise Insurance', '#2A4FA0', 'an insurance company', 'a half sun rising over horizon stripes'),
  S('Volta Cola', '#D01818', 'a cola soft drink', 'a lightning-bolt swoosh through a script logotype'),
  S('Apex Energy', '#18C040', 'an energy company', 'an upward chevron / peak made of scan-line stripes'),
  S('Velocita State Lottery', '#F2D22A', 'a state lottery', 'a lucky star or lottery ball with sunburst rays'),
  S('Gold Coast Airlines', '#1A3A7A', 'an airline', 'a jet or wing over a sun on the coast, speed stripes'),
  S('Triton Watches', '#111111', 'a luxury Swiss-style watch brand', 'a trident in a fine circle, refined serif'),
  // story / temptation
  S('Volt Rush Energy', '#9AE01A', 'an over-the-top energy drink', 'a jagged lightning bolt, aggressive italic'),
  S('Cloud Nine Vapor', '#8A5AE0', 'a vape brand', 'a puffy cloud with the number 9, soft neon'),
  S('QuickCash Loans', '#1FA040', 'a payday loan shop', 'a dollar sign with speed lines'),
  S("Lucky Lou's Online Casino", '#E0B020', 'a sketchy online casino', 'a winking dice or horseshoe, flashy neon script'),
  S("Brian's Bathrooms & Kitchens", '#2A6AB8', 'a local bathroom and kitchen fitter', 'a tap/faucet with a water drop'),
  // garage stickers only (VOLTA, MESA, PINE reuse the career logos above)
  S('KOBRA', '#2A9A3A', 'a performance parts brand', 'a coiled cobra head forming the K'),
  S('NEON FM', '#E02A9A', 'a radio station', 'radio waves and neon tube lettering', { sil: 110 }),
  S('RAPID', '#1A8AE0', 'a performance oil brand', 'italic chrome lettering with speed stripes'),
  S('BURGER DUCK', '#F2A21A', 'a fast food burger chain', 'a cartoon duck holding a burger'),
  S('SUNSET', '#F06A2A', 'a sunglasses brand', 'a striped setting sun'),
  S('SVGP', '#C8141C', 'the Velocita Grand Prix', 'a checkered flag swoosh', { sub: 'GRAND PRIX' }),
  S('BAYSIDE', '#1AA0B8', 'a seaside resort', 'a palm tree over the bay'),
];
