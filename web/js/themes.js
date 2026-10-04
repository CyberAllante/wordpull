// Visual themes: unlocked with crowns. Each theme recolors letters, pool and background.
export const THEMES = [
  {
    id: 'lagoon', name: 'Lagoon', crowns: 0,
    palette: ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#63e6e2', '#ff8787', '#ffc078', '#a9e34b', '#3bc9db', '#9775fa', '#e599f7', '#ff922b', '#51cf66'],
    pool: ['#0d6fa8', '#0a4f8a', '#083a6b'], rim: ['#2b3f85', '#13204a'], bg: ['#0f1b3d', '#070b1c'], blobs: ['#4c6fff', '#38d9a9', '#da77f2'], ripple: '#bff3ff',
  },
  {
    id: 'candy', name: 'Candy Shop', crowns: 5,
    palette: ['#ff5c8a', '#ff8fab', '#ffb3c6', '#c77dff', '#9d4edd', '#5a189a', '#ffafcc', '#bde0fe', '#a2d2ff', '#cdb4db', '#ff7096', '#fb6f92', '#ffc8dd', '#e0aaff', '#7b2cbf', '#f72585', '#b5179e', '#ff85a1'],
    pool: ['#ff9ec4', '#f06292', '#c2185b'], rim: ['#ffd6e7', '#ad1457'], bg: ['#3a0f2d', '#1a0512'], blobs: ['#ff5c8a', '#ffd6e7', '#c77dff'], ripple: '#ffffff',
  },
  {
    id: 'lava', name: 'Lava Vent', crowns: 15,
    palette: ['#ffbe0b', '#fb5607', '#ff006e', '#ffd166', '#ef476f', '#f77f00', '#fcbf49', '#e63946', '#ff9f1c', '#ffb703', '#fb8500', '#d62828', '#ff4d6d', '#ff7b00', '#ffea00', '#ff5400', '#ff0054', '#ffbd00'],
    pool: ['#4a0f0f', '#2e0808', '#1a0404'], rim: ['#7a2e1e', '#2a0b05'], bg: ['#1b0a0a', '#050202'], blobs: ['#ff4d00', '#ffb703', '#d62828'], ripple: '#ff9a3c',
  },
  {
    id: 'neon', name: 'Midnight Neon', crowns: 30,
    palette: ['#00f5d4', '#00bbf9', '#fee440', '#f15bb5', '#9b5de5', '#4cc9f0', '#80ffdb', '#ff70a6', '#ffd670', '#e9ff70', '#72efdd', '#b8c0ff', '#ff9770', '#c8ff00', '#00ffa3', '#ff2ecc', '#3cf0ff', '#ffe600'],
    pool: ['#0b0f2a', '#070a1f', '#03040f'], rim: ['#1f2a6b', '#0a0d2e'], bg: ['#05061a', '#000004'], blobs: ['#00f5d4', '#f15bb5', '#9b5de5'], ripple: '#00f5d4',
  },
  {
    id: 'gold', name: 'Royal Gold', crowns: 60,
    palette: ['#ffd700', '#f4c430', '#e6b800', '#fff1a8', '#d4af37', '#c9a227', '#ffe066', '#f9d342', '#ffcc33', '#e0b422', '#ffdf80', '#f1c40f', '#f7dc6f', '#f4d03f', '#ffea70', '#d9b310', '#ffe599', '#e8c547'],
    pool: ['#1d1b4b', '#14123a', '#0b0a24'], rim: ['#6b5b1e', '#2a2410'], bg: ['#120f2e', '#05040f'], blobs: ['#ffd700', '#9b5de5', '#4c6fff'], ripple: '#ffe9a8',
  },
];
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
