// Block definitions. Each block has distinct colors for top/side/bottom,
// giving a clean low-poly voxel look.
export const AIR = 0;

export const BLOCKS = {
  0: { name: '空气', top: [0,0,0], side: [0,0,0], bottom: [0,0,0], solid: false },
  1: { name: '草方块', top: [96,168,72], side: [110,90,60], bottom: [90,70,48] },
  2: { name: '泥土',   top: [132,102,72], side: [132,102,72], bottom: [120,92,64] },
  3: { name: '石头',   top: [125,125,130], side: [125,125,130], bottom: [118,118,124] },
  4: { name: '沙石',   top: [218,198,150], side: [218,198,150], bottom: [210,190,142] },
  5: { name: '沙子',   top: [222,204,150], side: [222,204,150], bottom: [216,198,144] },
  6: { name: '雪块',   top: [235,242,250], side: [228,236,246], bottom: [222,230,240] },
  7: { name: '木头',   top: [150,110,72], side: [116,84,56], bottom: [150,110,72] },
  8: { name: '树叶',   top: [58,132,62], side: [50,118,56], bottom: [44,106,50] },
  9: { name: '矿石',   top: [140,100,70], side: [150,134,74], bottom: [140,100,70] },
  10: { name: '铁矿',  top: [125,110,120], side: [170,150,160], bottom: [125,110,120] },
  11: { name: '金矿',  top: [140,120,70], side: [230,205,90], bottom: [140,120,70] },
  12: { name: '钻石矿', top: [120,140,160], side: [90,220,230], bottom: [120,140,160] },
  13: { name: '基岩',  top: [42,42,48], side: [42,42,48], bottom: [42,42,48] },
  14: { name: '发射金属', top: [180,190,200], side: [150,160,175], bottom: [180,190,200] },
  15: { name: '蓝色玻璃', top: [90,170,240], side: [90,170,240], bottom: [90,170,240], transparent: true },
  16: { name: '深空合金', top: [90,120,160], side: [70,100,140], bottom: [90,120,160] },
};

// Time of day / sky tuning per planet
export const PALETTES = [
  { name: '翡翠星', sky: 0x2a6f97, fog: 0x2a6f97, sun: 0xfff3c4, ground: 'green',  atmosphere: 0x83c8ff },
  { name: '红砂星', sky: 0x8a3c2f, fog: 0x8a3c2f, sun: 0xffd9a0, ground: 'desert', atmosphere: 0xffb37a },
  { name: '冰霜星', sky: 0x4a6a8a, fog: 0x4a6a8a, sun: 0xbcd9ff, ground: 'snow',   atmosphere: 0x9fc8ff },
  { name: '深渊星', sky: 0x241a3a, fog: 0x241a3a, sun: 0x8f7cff, ground: 'basalt', atmosphere: 0x7a6aef },
];

// Water height depends on planet type
export function biomeParams(biome) {
  switch (biome) {
    case 'green':  return { water: 14, topBlocks: [1, 2], hill: 1.0, feature: 'trees' };
    case 'desert': return { water: 4,  topBlocks: [5, 4], hill: 0.7, feature: 'none' };
    case 'snow':   return { water: 8,  topBlocks: [6, 2], hill: 1.3, feature: 'trees' };
    case 'basalt': return { water: 2,  topBlocks: [16, 3], hill: 1.6, feature: 'none' };
    default:       return { water: 12, topBlocks: [1, 2], hill: 1.0, feature: 'trees' };
  }
}