// Data you can't read: text turned into plausible junk (channel codes, hex), the same junk for the same text every time.
// World Career, before you've hired a data engineer: the lap review and the computer's Telemetry app look like this.
const HEX = '0123456789ABCDEF';
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function garble(s) {
  s = String(s); if (!s.trim()) return s;
  let h = hash(s), out = '';
  for (const ch of s) {
    h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
    if (/[0-9]/.test(ch)) out += String(h % 10);
    else if (/[A-Za-z]/.test(ch)) out += h % 5 === 0 ? '_' : HEX[h % 16];
    else out += ch; // (spaces, dots and colons keep the shape)
  }
  return out;
}
// every text node under a root (not inside skip), garbled; run again after the root re-renders
export function garbleTree(root, skip) {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (tw.nextNode()) nodes.push(tw.currentNode);
  for (const n of nodes) if (!(skip && n.parentElement && n.parentElement.closest(skip)) && n.nodeValue !== n.__g) { n.nodeValue = garble(n.nodeValue); n.__g = n.nodeValue; }
}
// a canvas context whose text comes out garbled (the charts' labels)
export function garbleCanvas(g) {
  if (g.__garbled) return;
  const f = g.fillText.bind(g), st = g.strokeText.bind(g);
  g.fillText = (t, ...a) => f(g.__garbleOn ? garble(t) : t, ...a);
  g.strokeText = (t, ...a) => st(g.__garbleOn ? garble(t) : t, ...a);
  g.__garbled = true;
}
// a hex dump of some bytes (the Telemetry app's raw files)
export function hexDump(seed, rows = 18) {
  let h = hash(String(seed)), out = [];
  for (let r = 0; r < rows; r++) {
    let line = (r * 12).toString(16).toUpperCase().padStart(6, '0') + '  ';
    for (let i = 0; i < 12; i++) { h = Math.imul(h ^ (r * 31 + i), 2654435761) >>> 0; line += HEX[h & 15] + HEX[(h >>> 4) & 15] + (i === 5 ? '  ' : ' '); }
    out.push(line);
  }
  return out.join('\n');
}
