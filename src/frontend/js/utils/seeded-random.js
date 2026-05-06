// Deterministic pseudo-random float [0,1] from a string seed (event id)
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return (h >>> 0) / 0xFFFFFFFF;
}
