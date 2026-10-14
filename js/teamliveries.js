// The rival teams' liveries: each one a nod to a famous real livery, carrying the game's own sponsors.
// A scheme is model-independent, like the patterns (livery.js): shapes per kind of panel, in its own along / across
// units: a = along the car (0 tail .. 1 nose), c = across (on the top 0 left .. 1 right; on a side, pod or cover 0 top
// .. 1 bottom). Shapes go on the base paint (the livery's main colour) in the order given; then the number + sponsor.
//   on:   panel roles it goes on ('top', 'side', 'pod', 'cover', 'end': a road car's nose / tail face, in its own
//         0..1 across x 0..1 down)
//   pts:  polygon [[a, c], ...]   col: colour
// wing / plate: the colours of the wings and endplates; num: the race number's colour; logo: the sponsor sticker's
// version ('auto': its brand colour, white or black, whichever stands out on the paint under it; or a tint colour);
// logoScale: how big it is against the usual sticker (2 unless said).
const band = (c0, c1, a0 = 0, a1 = 1) => [[a0, c0], [a1, c0], [a1, c1], [a0, c1]];

export const SCHEMES = {
  // Gulf: powder blue, an orange stripe down the middle, orange flanks with a navy pinstripe
  gulf: {
    shapes: [
      { on: ['top'], pts: band(0.36, 0.64), col: 0xf07a1a },
      { on: ['top'], pts: band(0.33, 0.36), col: 0x14306a }, { on: ['top'], pts: band(0.64, 0.67), col: 0x14306a },
      { on: ['side', 'pod'], pts: band(0.42, 0.66), col: 0xf07a1a },
      { on: ['side', 'pod'], pts: band(0.38, 0.42), col: 0x14306a },
      { on: ['end'], pts: band(0, 1, 0.36, 0.64), col: 0xf07a1a },
    ],
    wing: 0xf07a1a, plate: 0x14306a, num: 0x14306a, logo: 'auto',
  },
  // JPS: gloss black, fine gold pinstripes along the top and the flanks, gold lettering
  jps: {
    shapes: [
      { on: ['top'], pts: band(0.3, 0.315), col: 0xc9a23a }, { on: ['top'], pts: band(0.685, 0.7), col: 0xc9a23a },
      { on: ['side', 'pod', 'cover'], pts: band(0.1, 0.125), col: 0xc9a23a },
      { on: ['side', 'pod'], pts: band(0.86, 0.875), col: 0xc9a23a },
      { on: ['end'], pts: band(0.8, 0.83), col: 0xc9a23a },
    ],
    wing: 0x0a0a0c, plate: 0x0a0a0c, num: 0xc9a23a, logo: 0xc9a23a,
  },
  // Martini: white, the dark blue / light blue / red stripes sweeping along the flanks and over the top
  martini: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.36, 0.44), col: 0x0e2a55 },
      { on: ['side', 'pod', 'cover'], pts: band(0.44, 0.52), col: 0x3aa0e0 },
      { on: ['side', 'pod', 'cover'], pts: band(0.52, 0.6), col: 0xd0202a },
      { on: ['top'], pts: band(0.3, 0.38), col: 0x0e2a55 }, { on: ['top'], pts: band(0.38, 0.46), col: 0x3aa0e0 }, { on: ['top'], pts: band(0.46, 0.54), col: 0xd0202a },
      { on: ['end'], pts: band(0.3, 0.38), col: 0x0e2a55 }, { on: ['end'], pts: band(0.38, 0.46), col: 0x3aa0e0 }, { on: ['end'], pts: band(0.46, 0.54), col: 0xd0202a },
    ],
    wing: 0x0e2a55, plate: 0xd0202a, num: 0x0e2a55, logo: 'auto',
  },
  // Rothmans: white over dark blue, split by gold and red pinstripes
  rothmans: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.55, 1), col: 0x0e2a55 },
      { on: ['side', 'pod', 'cover'], pts: band(0.5, 0.53), col: 0xc9a23a },
      { on: ['side', 'pod', 'cover'], pts: band(0.53, 0.55), col: 0xd0202a },
      { on: ['top'], pts: band(0.4, 0.6, 0.55, 1), col: 0x0e2a55 },
      { on: ['top'], pts: band(0.37, 0.4, 0.55, 1), col: 0xc9a23a }, { on: ['top'], pts: band(0.6, 0.63, 0.55, 1), col: 0xc9a23a },
      { on: ['end'], pts: band(0.55, 1), col: 0x0e2a55 },
    ],
    wing: 0x0e2a55, plate: 0xffffff, num: 0x0e2a55, logo: 'auto',
  },
  // Marlboro: white on top, red underneath, the red coming up into a chevron over the nose
  marlboro: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: [[0, 0.55], [0.62, 0.55], [1, 0.05], [1, 1], [0, 1]], col: 0xd01818 },
      { on: ['top'], pts: [[1, 0], [0.62, 0], [0.82, 0.5], [0.62, 1], [1, 1]], col: 0xd01818 },
      { on: ['end'], pts: band(0.5, 1), col: 0xd01818 },
    ],
    wing: 0xd01818, plate: 0xffffff, num: 0x111114, logo: 'auto',
  },
  // Jägermeister: orange all over, the sponsor big on the flanks
  orange: {
    shapes: [],
    wing: 0xf06a1a, plate: 0xf06a1a, num: 0x111114, logo: 'auto', logoScale: 2.6,
  },
  // Ferrari 312T: red, a white band across behind the cockpit, white wings
  scuderia: {
    shapes: [
      { on: ['top'], pts: band(0, 1, 0.3, 0.36), col: 0xf4f4f2 },
      { on: ['side', 'pod', 'cover'], pts: band(0.86, 0.9), col: 0xf4f4f2 },
    ],
    wing: 0xf4f4f2, plate: 0xc8141c, num: 0xf4f4f2, logo: 'auto',
  },
  // Pepsi: royal blue, a white band and a red one along the flanks
  pepsi: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.45, 0.57), col: 0xf4f4f2 }, { on: ['side', 'pod', 'cover'], pts: band(0.57, 0.66), col: 0xd0202a },
      { on: ['top'], pts: band(0.42, 0.5), col: 0xf4f4f2 }, { on: ['top'], pts: band(0.5, 0.58), col: 0xd0202a },
      { on: ['end'], pts: band(0.45, 0.57), col: 0xf4f4f2 }, { on: ['end'], pts: band(0.57, 0.66), col: 0xd0202a },
    ],
    wing: 0xd0202a, plate: 0x1450b4, num: 0xf4f4f2, logo: 'auto',
  },
  // 7UP Jordan: bright green, white underneath with a blue line between
  jordan: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.7, 1), col: 0xf4f4f2 }, { on: ['side', 'pod', 'cover'], pts: band(0.66, 0.7), col: 0x1a4fb0 },
      { on: ['top'], pts: band(0, 1, 0.86, 1), col: 0xf4f4f2 },
      { on: ['end'], pts: band(0.7, 1), col: 0xf4f4f2 },
    ],
    wing: 0x1a8a3a, plate: 0xf4f4f2, num: 0xf4f4f2, logo: 'auto',
  },
  // Benetton: white, patched with green, yellow, blue and red blocks
  benetton: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.35, 1, 0, 0.26), col: 0x1c9a3a }, { on: ['side', 'pod', 'cover'], pts: band(0.35, 1, 0.26, 0.5), col: 0xf2c21a },
      { on: ['side', 'pod', 'cover'], pts: band(0.35, 1, 0.5, 0.74), col: 0x1a4fb0 }, { on: ['side', 'pod', 'cover'], pts: band(0.35, 1, 0.74, 1), col: 0xd0202a },
      { on: ['top'], pts: band(0, 0.5, 0.6, 1), col: 0x1a4fb0 }, { on: ['top'], pts: band(0.5, 1, 0.6, 1), col: 0xf2c21a },
      { on: ['top'], pts: band(0, 0.5, 0, 0.35), col: 0xd0202a }, { on: ['top'], pts: band(0.5, 1, 0, 0.35), col: 0x1c9a3a },
      { on: ['end'], pts: band(0.5, 1, 0, 0.5), col: 0x1a4fb0 }, { on: ['end'], pts: band(0.5, 1, 0.5, 1), col: 0xf2c21a },
    ],
    wing: 0x1c9a3a, plate: 0xd0202a, num: 0x111114, logo: 'auto',
  },
  // Shell: yellow over red
  shell: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.62, 1), col: 0xd01818 },
      { on: ['top'], pts: band(0.44, 0.56), col: 0xd01818 },
      { on: ['end'], pts: band(0.62, 1), col: 0xd01818 },
    ],
    wing: 0xd01818, plate: 0xf4c01a, num: 0xd01818, logo: 'auto',
  },
  // Calsonic: bright blue, a white wedge up from the front lower edge and a white nose
  calsonic: {
    shapes: [
      { on: ['side', 'pod'], pts: [[0.55, 1], [1, 0.45], [1, 1]], col: 0xf4f4f2 },
      { on: ['top'], pts: band(0, 1, 0.88, 1), col: 0xf4f4f2 },
      { on: ['end'], pts: band(0.6, 1), col: 0xf4f4f2 },
    ],
    wing: 0x1a5ad0, plate: 0xf4f4f2, num: 0xf4f4f2, logo: 'auto',
  },
  // Castrol: white, the green and red bands along the flanks and over the top
  castrol: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.5, 0.62), col: 0x007a3a }, { on: ['side', 'pod', 'cover'], pts: band(0.62, 0.7), col: 0xd0202a },
      { on: ['top'], pts: band(0.36, 0.48), col: 0x007a3a }, { on: ['top'], pts: band(0.48, 0.56), col: 0xd0202a },
      { on: ['end'], pts: band(0.5, 0.62), col: 0x007a3a }, { on: ['end'], pts: band(0.62, 0.7), col: 0xd0202a },
    ],
    wing: 0x007a3a, plate: 0xd0202a, num: 0x007a3a, logo: 'auto',
  },
  // Lotus 49: British racing green, a yellow nose band and a fine yellow stripe down the middle
  lotus: {
    shapes: [
      { on: ['top'], pts: band(0, 1, 0.9, 1), col: 0xf2d22a }, { on: ['top'], pts: band(0.48, 0.52), col: 0xf2d22a },
      { on: ['side', 'pod', 'cover'], pts: band(0.3, 0.33), col: 0xf2d22a },
      { on: ['end'], pts: band(0, 1, 0.47, 0.53), col: 0xf2d22a },
    ],
    wing: 0x0f3a24, plate: 0xf2d22a, num: 0xf4f4f2, logo: 0xf2d22a,
  },
  // Pennzoil: yellow over black
  pennzoil: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.62, 1), col: 0x111114 }, { on: ['side', 'pod', 'cover'], pts: band(0.58, 0.62), col: 0xd0202a },
      { on: ['end'], pts: band(0.62, 1), col: 0x111114 },
    ],
    wing: 0x111114, plate: 0xf2d21a, num: 0x111114, logo: 'auto',
  },
  // ADVAN: black, a red slash and a white one across the flanks, a red band over the top
  advan: {
    shapes: [
      { on: ['side', 'pod'], pts: [[0.5, 1], [0.64, 1], [0.84, 0], [0.7, 0]], col: 0xe0102a },
      { on: ['side', 'pod'], pts: [[0.66, 1], [0.7, 1], [0.9, 0], [0.86, 0]], col: 0xf4f4f2 },
      { on: ['top'], pts: band(0, 1, 0.66, 0.76), col: 0xe0102a },
      { on: ['end'], pts: band(0.4, 0.55), col: 0xe0102a },
    ],
    wing: 0x0a0a0a, plate: 0xe0102a, num: 0xf4f4f2, logo: 'auto',
  },
  // Miami Vice: teal, pink underneath with a white line, a pink stripe down the middle
  vice: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.7, 1), col: 0xff5a8a }, { on: ['side', 'pod', 'cover'], pts: band(0.66, 0.7), col: 0xf4f4f2 },
      { on: ['top'], pts: band(0.4, 0.6), col: 0xff5a8a },
      { on: ['end'], pts: band(0.7, 1), col: 0xff5a8a },
    ],
    wing: 0xff5a8a, plate: 0x14b3a8, num: 0xf4f4f2, logo: 'auto',
  },
  // Parmalat Brabham: white, navy underneath rising toward the tail, a navy tail on top
  brabham: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: [[0, 0.3], [0.4, 0.6], [1, 0.6], [1, 1], [0, 1]], col: 0x14306a },
      { on: ['top'], pts: band(0, 1, 0, 0.3), col: 0x14306a },
      { on: ['end'], pts: band(0.6, 1), col: 0x14306a },
    ],
    wing: 0x14306a, plate: 0xf4f4f2, num: 0x14306a, logo: 'auto',
  },
  // Mild Seven: sky blue, white low on the front of the flanks and on the nose
  mildseven: {
    shapes: [
      { on: ['side', 'pod'], pts: [[0.45, 1], [1, 0.5], [1, 1]], col: 0xf4f4f2 },
      { on: ['top'], pts: [[1, 0], [0.8, 0], [0.9, 0.5], [0.8, 1], [1, 1]], col: 0xf4f4f2 },
      { on: ['end'], pts: band(0.6, 1), col: 0xf4f4f2 },
    ],
    wing: 0x6ab8e8, plate: 0xf4f4f2, num: 0x14306a, logo: 'auto',
  },
  // Yardley McLaren: white, a burgundy V over the nose and a burgundy band with a gold line along the flanks
  yardley: {
    shapes: [
      { on: ['top'], pts: [[0.62, 0], [0.72, 0], [0.86, 0.5], [0.72, 1], [0.62, 1], [0.76, 0.5]], col: 0x7a1428 },
      { on: ['side', 'pod', 'cover'], pts: band(0.55, 0.65), col: 0x7a1428 }, { on: ['side', 'pod', 'cover'], pts: band(0.65, 0.68), col: 0xc9a23a },
      { on: ['end'], pts: band(0.55, 0.65), col: 0x7a1428 },
    ],
    wing: 0x7a1428, plate: 0xf4f4f2, num: 0x7a1428, logo: 'auto',
  },
  // Monster: black, three green claw marks down the flanks and over the top
  monster: {
    shapes: [0.52, 0.6, 0.68].flatMap(a => [
      { on: ['side', 'pod'], pts: [[a - 0.08, 1], [a - 0.06, 1], [a + 0.04, 0], [a + 0.02, 0]], col: 0x7dff3a },
      { on: ['top'], pts: [[a + 0.1, 0], [a + 0.12, 0], [a + 0.06, 1], [a + 0.04, 1]], col: 0x7dff3a },
    ]),
    wing: 0x111114, plate: 0x7dff3a, num: 0x7dff3a, logo: 'auto',
  },
  // Gold Leaf Lotus: red over white over red, with gold lines between
  goldleaf: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.45, 0.62), col: 0xf4f4f2 },
      { on: ['side', 'pod', 'cover'], pts: band(0.43, 0.45), col: 0xc9a23a }, { on: ['side', 'pod', 'cover'], pts: band(0.62, 0.64), col: 0xc9a23a },
      { on: ['top'], pts: band(0, 1, 0.5, 0.58), col: 0xf4f4f2 },
      { on: ['end'], pts: band(0.45, 0.62), col: 0xf4f4f2 },
    ],
    wing: 0xd0101a, plate: 0xf4f4f2, num: 0xf4f4f2, logo: 'auto',
  },
  // Elf Tyrrell: French blue, white along the bottom and twin white pinstripes on top
  tyrrell: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: band(0.76, 1), col: 0xf4f4f2 },
      { on: ['top'], pts: band(0.4, 0.43), col: 0xf4f4f2 }, { on: ['top'], pts: band(0.57, 0.6), col: 0xf4f4f2 },
      { on: ['end'], pts: band(0.76, 1), col: 0xf4f4f2 },
    ],
    wing: 0xf4f4f2, plate: 0x1a3a9a, num: 0xf4f4f2, logo: 'auto',
  },
  // STP: day-glo red, the sponsor big and white
  stp: {
    shapes: [{ on: ['side', 'pod', 'cover'], pts: band(0.86, 0.9), col: 0xf4f4f2 }],
    wing: 0xff3a1a, plate: 0xf4f4f2, num: 0xf4f4f2, logo: 'auto', logoScale: 2.4,
  },
  // Camel: yellow all over, a fine blue line, the sponsor big in blue
  camel: {
    shapes: [{ on: ['side', 'pod', 'cover'], pts: band(0.3, 0.32), col: 0x14306a }, { on: ['top'], pts: band(0.49, 0.51), col: 0x14306a }],
    wing: 0xf2d22a, plate: 0x14306a, num: 0x14306a, logo: 0x14306a, logoScale: 2.3,
  },
  // Brumos: white, red and blue stripes swooping up the front of the flanks and across the nose
  brumos: {
    shapes: [
      { on: ['side', 'pod'], pts: [[0.45, 0.62], [0.75, 0.62], [1, 0.3], [1, 0.38], [0.78, 0.68], [0.45, 0.68]], col: 0xd0202a },
      { on: ['side', 'pod'], pts: [[0.45, 0.68], [0.78, 0.68], [1, 0.38], [1, 0.46], [0.81, 0.74], [0.45, 0.74]], col: 0x14306a },
      { on: ['top'], pts: band(0, 1, 0.8, 0.85), col: 0xd0202a }, { on: ['top'], pts: band(0, 1, 0.85, 0.9), col: 0x14306a },
      { on: ['end'], pts: band(0.5, 0.58), col: 0xd0202a }, { on: ['end'], pts: band(0.58, 0.66), col: 0x14306a },
    ],
    wing: 0xf4f4f2, plate: 0xd0202a, num: 0x111114, logo: 'auto',
  },
  // Pink Pig: pink, the butcher's cuts lined out in dark red
  pinkpig: {
    shapes: [
      ...[0.22, 0.42, 0.62, 0.8].map(a => ({ on: ['side', 'pod'], pts: [[a, 0], [a + 0.012, 0], [a + 0.012, 1], [a, 1]], col: 0x8a1020 })),
      { on: ['side', 'pod'], pts: band(0.5, 0.52), col: 0x8a1020 },
      ...[0.3, 0.55, 0.78].map(a => ({ on: ['top'], pts: [[a, 0], [a + 0.012, 0], [a + 0.012, 1], [a, 1]], col: 0x8a1020 })),
      { on: ['top'], pts: band(0.495, 0.505), col: 0x8a1020 },
    ],
    wing: 0xf2a0b0, plate: 0x8a1020, num: 0x8a1020, logo: 0x8a1020,
  },
  // Leyton House: mint turquoise, a navy line low down, navy lettering
  leyton: {
    shapes: [{ on: ['side', 'pod', 'cover'], pts: band(0.84, 0.88), col: 0x14306a }, { on: ['end'], pts: band(0.84, 0.88), col: 0x14306a }],
    wing: 0x3ec8c0, plate: 0x14306a, num: 0x14306a, logo: 0x14306a, logoScale: 2.2,
  },
  // Silver Arrow: silver, a teal line along the bottom
  silver: {
    shapes: [{ on: ['side', 'pod', 'cover'], pts: band(0.8, 0.84), col: 0x00a19b }, { on: ['top'], pts: band(0, 1, 0.92, 1), col: 0x111114 }],
    wing: 0x111114, plate: 0xb8bcc4, num: 0x111114, logo: 'auto',
  },
  // Coca-Cola: red, the white ribbon waving along the flanks
  coke: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: [[0, 0.56], [0.25, 0.46], [0.5, 0.56], [0.75, 0.66], [1, 0.56], [1, 0.64], [0.75, 0.74], [0.5, 0.64], [0.25, 0.54], [0, 0.64]], col: 0xf4f4f2 },
      { on: ['top'], pts: [[0, 0.44], [0.33, 0.38], [0.66, 0.5], [1, 0.44], [1, 0.52], [0.66, 0.58], [0.33, 0.46], [0, 0.52]], col: 0xf4f4f2 },
    ],
    wing: 0xd81e2a, plate: 0xf4f4f2, num: 0xf4f4f2, logo: 'auto',
  },
  // Petronas: black, a teal band tapering to the nose, teal down the middle
  petronas: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: [[0.15, 0.6], [1, 0.62], [1, 0.66], [0.15, 0.72]], col: 0x00d2be },
      { on: ['top'], pts: band(0.46, 0.54), col: 0x00d2be },
      { on: ['end'], pts: band(0.6, 0.66), col: 0x00d2be },
    ],
    wing: 0x101418, plate: 0x00d2be, num: 0x00d2be, logo: 'auto',
  },
  // Renault: yellow nose, dark blue tail, cut on a slant
  renault: {
    shapes: [
      { on: ['side', 'pod', 'cover'], pts: [[0, 0], [0.42, 0], [0.56, 1], [0, 1]], col: 0x14306a },
      { on: ['top'], pts: [[0, 0], [0.45, 0], [0.5, 1], [0, 1]], col: 0x14306a },
    ],
    wing: 0x14306a, plate: 0xf2d21a, num: 0x14306a, logo: 'auto',
  },
  // Silk Cut Jaguar: purple, a white slash rising up the front of the flanks, a white nose
  silkcut: {
    shapes: [
      { on: ['side', 'pod'], pts: [[0.55, 1], [0.72, 1], [1, 0.4], [1, 0.12]], col: 0xf4f4f2 },
      { on: ['top'], pts: band(0, 1, 0.88, 1), col: 0xf4f4f2 },
      { on: ['end'], pts: band(0.55, 1), col: 0xf4f4f2 },
    ],
    wing: 0x5a1a8a, plate: 0xf4f4f2, num: 0xf4f4f2, logo: 'auto',
  },
  // BMW M: white, the light blue, violet and red stripes slanting across the flanks and the bonnet
  bmw: {
    shapes: [[0.3, 0x3aa0e0], [0.4, 0x2a2a8a], [0.5, 0xd0202a]].flatMap(([a, col]) => [
      { on: ['side', 'pod'], pts: [[a, 1], [a + 0.08, 1], [a + 0.24, 0], [a + 0.16, 0]], col },
      { on: ['top'], pts: band(0, 1, a + 0.36, a + 0.42), col },
    ]),
    wing: 0x2a2a8a, plate: 0xd0202a, num: 0x111114, logo: 'auto',
  },
  // Shelby Cobra: dark, twin cream stripes over the top, a cream stripe low on the flanks
  cobra: {
    shapes: [
      { on: ['top'], pts: band(0.36, 0.46), col: 0xf0e0b0 }, { on: ['top'], pts: band(0.54, 0.64), col: 0xf0e0b0 },
      { on: ['end'], pts: band(0, 1, 0.36, 0.46), col: 0xf0e0b0 }, { on: ['end'], pts: band(0, 1, 0.54, 0.64), col: 0xf0e0b0 },
      { on: ['side', 'pod'], pts: band(0.84, 0.9), col: 0xf0e0b0 },
    ],
    wing: 0x5a3a22, plate: 0xf0e0b0, num: 0xf0e0b0, logo: 'auto',
  },
};

// Which team wears which (quick race TEAMS in car.js, World Career TEAM_POOL in wcareer.js): its scheme, the base
// colour it's painted on (also the team's own colours: suits, menus), and the title sponsor on it.
export const TEAM_LIVERIES = {
  'Volta Racing': { scheme: 'scuderia', main: 0xc8141c, accent: 0xf4f4f2, sponsor: 'VOLTA COLA' },
  'Kobra Oil GP': { scheme: 'jps', main: 0x0a0a0c, accent: 0xc9a23a, sponsor: 'KOBRA' },
  'Azure Motorsport': { scheme: 'pepsi', main: 0x1450b4, accent: 0xd0202a, sponsor: 'AZURE MARINE SUPPLY' },
  'Verde Corse': { scheme: 'jordan', main: 0x1a8a3a, accent: 0xf4f4f2, sponsor: 'PINEWOOD FEED & SEED' },
  'Neon FM Racing': { scheme: 'benetton', main: 0xf4f4f2, accent: 0x1c9a3a, sponsor: 'NEON FM' },
  'Sunset Motel': { scheme: 'orange', main: 0xf06a1a, accent: 0x111114, sponsor: 'SUNSET' },
  'Silverline': { scheme: 'martini', main: 0xf4f4f2, accent: 0x0e2a55, sponsor: 'TRITON WATCHES' },
  'Burger Duck': { scheme: 'shell', main: 0xf4c01a, accent: 0xd01818, sponsor: 'BURGER DUCK' },
  'Rapid Tyres': { scheme: 'rothmans', main: 0xf4f4f2, accent: 0x0e2a55, sponsor: 'RAPID' },
  'Bayside Blue': { scheme: 'calsonic', main: 0x1a5ad0, accent: 0xf4f4f2, sponsor: 'BAYSIDE' },
  'Mesa Energy': { scheme: 'castrol', main: 0xf4f4f2, accent: 0x007a3a, sponsor: 'MESA PAWN & GOLD' },
  'Pine Hollow': { scheme: 'lotus', main: 0x0f3a24, accent: 0xf2d22a, sponsor: 'PINE HOLLOW CREDIT UNION' },
  'Harbour Lights': { scheme: 'pennzoil', main: 0xf2d21a, accent: 0x111114, sponsor: 'HARBOUR FISH MARKET' },
  'Kanjo Works': { scheme: 'advan', main: 0x0a0a0a, accent: 0xe0102a, sponsor: "LUCKY LOU'S" },
  'Palm Bay Autosport': { scheme: 'vice', main: 0x14b3a8, accent: 0xff5a8a, sponsor: 'PORT AZURE' },
  'Redline Garage': { scheme: 'marlboro', main: 0xf4f4f2, accent: 0xd01818, sponsor: 'HOTLINE PIZZA' },
  'Northwind': { scheme: 'brabham', main: 0xf4f4f2, accent: 0x14306a, sponsor: 'SUNRISE INSURANCE' },
  'Coastline Racing': { scheme: 'mildseven', main: 0x6ab8e8, accent: 0xf4f4f2, sponsor: 'GOLD COAST AIRLINES' },
  'Maple Motorsport': { scheme: 'yardley', main: 0xf4f4f2, accent: 0x7a1428, sponsor: 'CAPITAL SELF STORAGE' },
  'Volt Arc': { scheme: 'monster', main: 0x111114, accent: 0x7dff3a, sponsor: 'VOLT RUSH' },
  'Copperhead': { scheme: 'goldleaf', main: 0xd0101a, accent: 0xf4f4f2, sponsor: 'VELOCITA STATE LOTTERY' },
  "Dave's Transmission": { scheme: 'tyrrell', main: 0x1a3a9a, accent: 0xf4f4f2, sponsor: "DALE'S TIRE & LUBE" },
  'Two Guys Racing': { scheme: 'stp', main: 0xff3a1a, accent: 0xf4f4f2, sponsor: 'METRO CAB CO.' },
  'Weekend Warriors': { scheme: 'camel', main: 0xf2d22a, accent: 0x14306a, sponsor: 'MAX HARDWARE' },
  'Lugnut Brothers': { scheme: 'brumos', main: 0xf4f4f2, accent: 0xd0202a, sponsor: 'GULCH OUTLET CENTER' },
  'Budget Box Motorsport': { scheme: 'pinkpig', main: 0xf2a0b0, accent: 0x8a1020, sponsor: 'QUICKCASH LOANS' },
  'Cul-de-Sac Racing': { scheme: 'leyton', main: 0x3ec8c0, accent: 0x14306a, sponsor: "BRIAN'S BATHROOMS" },
  'Gulfstream Racing': { scheme: 'gulf', main: 0x8fc8e8, accent: 0xf07a1a, sponsor: 'RAPID' },
  'Stonebridge Competition': { scheme: 'silver', main: 0xb8bcc4, accent: 0x00a19b, sponsor: 'TRITON WATCHES' },
  'Apex Customer Racing': { scheme: 'coke', main: 0xd81e2a, accent: 0xf4f4f2, sponsor: 'APEX ENERGY' },
  'Blackwater Engineering': { scheme: 'petronas', main: 0x101418, accent: 0x00d2be, sponsor: 'DOWNTOWN DENTAL' },
  'Lakeside Motorsport': { scheme: 'renault', main: 0xf2d21a, accent: 0x14306a, sponsor: 'DESERT ROSE MOTEL' },
  'Ridgeway GT': { scheme: 'silkcut', main: 0x5a1a8a, accent: 0xf4f4f2, sponsor: 'CLOUD NINE VAPOR' },
  'Crown Point Racing': { scheme: 'bmw', main: 0xf4f4f2, accent: 0x2a2a8a, sponsor: 'SVGP' },
  'Old Mill Garage': { scheme: 'cobra', main: 0x5a3a22, accent: 0xf0e0b0, sponsor: 'MAX HARDWARE' },
};

// a team with its livery's colours (its suits, its cars), whatever colours an older save gave it
export function teamColors(team) {
  const t = team && TEAM_LIVERIES[team.name];
  return t ? { ...team, main: t.main, accent: t.accent } : team;
}
// a team's livery on top of its generated one (teamCar), or nothing for a team without one
export function teamLivery(name) {
  const t = TEAM_LIVERIES[name]; if (!t) return null;
  const S = SCHEMES[t.scheme];
  return { scheme: t.scheme, main: t.main, accent: t.accent, sponsor: t.sponsor, sponsorLogo: typeof S.logo === 'number' ? 'tint' : S.logo, ...(typeof S.logo === 'number' ? { sponsorTint: S.logo } : {}) };
}
