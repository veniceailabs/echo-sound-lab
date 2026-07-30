// Minimal WAV reader/writer shared by the CLIs.
// Reads 16/24/32-bit PCM and 32-bit float; writes 16 or 24-bit PCM.
const fs = require('fs');

function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10),
              sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    } else if (id === 'data') { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz % 2);
  }
  if (!fmt || dataOff < 0) throw new Error('missing fmt/data chunk');

  const bytes = fmt.bits / 8;
  const frames = Math.floor(dataLen / (bytes * fmt.channels));
  const planes = Array.from({ length: fmt.channels }, () => new Float32Array(frames));

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const p = dataOff + (i * fmt.channels + c) * bytes;
      let v = 0;
      if (fmt.format === 3 && fmt.bits === 32) v = buf.readFloatLE(p);
      else if (fmt.bits === 16) v = buf.readInt16LE(p) / 32768;
      else if (fmt.bits === 24) { const x = buf.readUIntLE(p, 3); v = ((x & 0x800000) ? x - 0x1000000 : x) / 8388608; }
      else if (fmt.bits === 32) v = buf.readInt32LE(p) / 2147483648;
      else throw new Error(`unsupported bit depth ${fmt.bits}`);
      planes[c][i] = v;
    }
  }
  return { planes, sampleRate: fmt.sampleRate, channels: fmt.channels, bits: fmt.bits, frames };
}

// 16-bit output gets TPDF dither + first-order noise shaping. Truncating to
// 16 bits without dither produces correlated quantisation distortion that is
// audible on fades and quiet passages.
function writeWav(file, planes, sampleRate, bits = 24) {
  if (bits !== 16 && bits !== 24) throw new Error('bits must be 16 or 24');
  const channels = planes.length, frames = planes[0].length, bytes = bits / 8;
  const dataLen = frames * channels * bytes;
  const buf = Buffer.alloc(44 + dataLen);

  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytes, 28);
  buf.writeUInt16LE(channels * bytes, 32); buf.writeUInt16LE(bits, 34);
  buf.write('data', 36, 'ascii'); buf.writeUInt32LE(dataLen, 40);

  const full = bits === 16 ? 32767 : 8388607;
  const lsb = 1 / full;
  const err = new Float64Array(channels);

  let p = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      let s = planes[c][i];
      if (bits === 16) {
        s += err[c] * 0.5;                                   // noise shaping
        const d = (Math.random() - Math.random()) * lsb;      // TPDF dither
        const wanted = s + d;
        const q = Math.round(wanted * full) / full;
        err[c] = wanted - q;
        s = q;
      }
      s = Math.max(-1, Math.min(1, s));
      buf.writeIntLE(Math.round(s * full), p, bytes);
      p += bytes;
    }
  }
  fs.writeFileSync(file, buf);
}

module.exports = { readWav, writeWav };
