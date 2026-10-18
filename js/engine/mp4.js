// A minimal MP4 (ISO BMFF) writer for one H.264 video track, enough for the
// frames that WebCodecs produces. Everything lives in memory; the result is a Blob.

const enc = new TextEncoder();

function u8(n) { return new Uint8Array([n & 0xff]); }
function u16(n) { return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]); }
function u32(n) { return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]); }
function str(s) { return enc.encode(s); }
function concat(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function box(type, ...parts) {
  const body = concat(parts);
  return concat([u32(body.length + 8), str(type), body]);
}
function fullBox(type, version, flags, ...parts) {
  return box(type, u8(version), new Uint8Array([(flags >>> 16) & 0xff, (flags >>> 8) & 0xff, flags & 0xff]), ...parts);
}
const MATRIX = concat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

export class Mp4Writer {
  constructor({ width, height, fps }) {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.timescale = fps * 1000;
    this.samples = []; // { data, key }
    this.description = null;
  }

  /** Feed an EncodedVideoChunk and its metadata from VideoEncoder's output callback. */
  add(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description && !this.description) {
      const d = meta.decoderConfig.description;
      this.description = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.samples.push({ data, key: chunk.type === 'key' });
  }

  finish() {
    if (!this.description) throw new Error('No avcC description from the encoder');
    const { width, height, timescale } = this;
    const sampleDur = 1000; // timescale = fps * 1000
    const n = this.samples.length;
    const duration = n * sampleDur;

    const ftyp = box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str('avc1'), str('mp41'));
    let mdatSize = 8;
    for (const s of this.samples) mdatSize += s.data.length;

    const avcC = box('avcC', this.description);
    const avc1 = box('avc1',
      new Uint8Array(6), u16(1), // reserved, data reference index
      new Uint8Array(16), // pre-defined and reserved
      u16(width), u16(height),
      u32(0x00480000), u32(0x00480000), u32(0), u16(1),
      new Uint8Array(32), // compressor name
      u16(0x0018), u16(0xffff), avcC);
    const stsd = fullBox('stsd', 0, 0, u32(1), avc1);
    const stts = fullBox('stts', 0, 0, u32(1), u32(n), u32(sampleDur));
    const keys = [];
    this.samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
    const stss = fullBox('stss', 0, 0, u32(keys.length), ...keys.map(u32));
    const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1));
    const stsz = fullBox('stsz', 0, 0, u32(0), u32(n), ...this.samples.map((s) => u32(s.data.length)));

    // chunk offsets depend on the size of moov, which is written before mdat
    const build = (firstOffset) => {
      const offsets = [];
      let o = firstOffset;
      for (const s of this.samples) { offsets.push(u32(o)); o += s.data.length; }
      const stco = fullBox('stco', 0, 0, u32(n), ...offsets);
      const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco);
      const vmhd = fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0));
      const dref = fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1));
      const minf = box('minf', vmhd, box('dinf', dref), stbl);
      const hdlr = fullBox('hdlr', 0, 0, u32(0), str('vide'), u32(0), u32(0), u32(0), str('VideoHandler'), u8(0));
      const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0));
      const mdia = box('mdia', mdhd, hdlr, minf);
      const tkhd = fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(duration), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16));
      const trak = box('trak', tkhd, mdia);
      const mvhd = fullBox('mvhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0), MATRIX, new Uint8Array(24), u32(2));
      return box('moov', mvhd, trak);
    };
    let moov = build(0);
    moov = build(ftyp.length + moov.length + 8);
    const mdatHeader = concat([u32(mdatSize), str('mdat')]);
    return new Blob([ftyp, moov, mdatHeader, ...this.samples.map((s) => s.data)], { type: 'video/mp4' });
  }
}
