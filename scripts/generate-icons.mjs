import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIZE = 1024;
const OUT = path.resolve('assets');
fs.mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}
function writePng(file, pixels) {
  const rows = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const row = y * (SIZE * 4 + 1); rows[row] = 0;
    pixels.copy(rows, row + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}
function canvas(transparent) {
  const p = Buffer.alloc(SIZE * SIZE * 4);
  const bg = transparent ? [0,0,0,0] : [11,11,13,255];
  for (let i = 0; i < SIZE * SIZE; i++) p.set(bg, i * 4);
  return p;
}
function put(p, x, y, c) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  p.set(c, (y * SIZE + x) * 4);
}
function rect(p, x1, y1, x2, y2, c) {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) put(p, x, y, c);
}
function circle(p, cx, cy, r, c) {
  for (let y = cy-r; y <= cy+r; y++) for (let x = cx-r; x <= cx+r; x++) if ((x-cx)**2 + (y-cy)**2 <= r*r) put(p,x,y,c);
}
function thickLine(p, x1, y1, x2, y2, w, c) {
  const n = Math.max(Math.abs(x2-x1), Math.abs(y2-y1));
  for (let i = 0; i <= n; i++) {
    const t = i / n; circle(p, Math.round(x1+(x2-x1)*t), Math.round(y1+(y2-y1)*t), Math.floor(w/2), c);
  }
}
function polygon(p, pts, c) {
  const minY = Math.min(...pts.map(q=>q[1])), maxY = Math.max(...pts.map(q=>q[1]));
  for (let y = minY; y <= maxY; y++) {
    const xs=[];
    for (let i=0,j=pts.length-1;i<pts.length;j=i++) {
      const [xi,yi]=pts[i],[xj,yj]=pts[j];
      if ((yi>y)!==(yj>y)) xs.push(Math.round(xi+(y-yi)*(xj-xi)/(yj-yi)));
    }
    xs.sort((a,b)=>a-b);
    for (let i=0;i<xs.length;i+=2) rect(p,xs[i],y,xs[i+1],y,c);
  }
}
function draw(transparent) {
  const p = canvas(transparent), amber=[245,166,35,255], cyan=[46,211,219,255], dark=[11,11,13,255];
  thickLine(p, 650, 220, 430, 505, 70, amber);
  circle(p, 430, 505, 48, amber);
  polygon(p, [[300,540],[485,500],[540,700],[245,770]], amber);
  for (const x of [305,360,415,470]) thickLine(p, x, 565, x-25, 730, 14, dark);
  thickLine(p, 555, 600, 805, 600, 34, cyan);
  thickLine(p, 510, 680, 750, 680, 34, cyan);
  thickLine(p, 580, 760, 830, 760, 34, cyan);
  return p;
}
writePng(path.join(OUT, 'app-icon.png'), draw(false));
writePng(path.join(OUT, 'adaptive-icon.png'), draw(true));
console.log('Generated Expo launcher icon assets.');
