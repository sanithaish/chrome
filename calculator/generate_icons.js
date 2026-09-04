const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Utility to create a valid PNG buffer from RGBA pixels
function createPNG(width, height, rgbaBuffer) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression method: 0
  ihdr[11] = 0; // Filter method: 0
  ihdr[12] = 0; // Interlace method: 0

  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT raw scanlines (Filter type 0 for each line)
  const scanlineSize = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineSize);

  for (let y = 0; y < height; y++) {
    const lineOffset = y * scanlineSize;
    rawData[lineOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * 4;
      const dstOffset = lineOffset + 1 + x * 4;
      rawData[dstOffset] = rgbaBuffer[srcOffset];     // R
      rawData[dstOffset + 1] = rgbaBuffer[srcOffset + 1]; // G
      rawData[dstOffset + 2] = rgbaBuffer[srcOffset + 2]; // B
      rawData[dstOffset + 3] = rgbaBuffer[srcOffset + 3]; // A
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const buffer = Buffer.alloc(8 + length + 4);
  buffer.writeUInt32BE(length, 0);
  buffer.write(type, 4, 4, 'ascii');
  data.copy(buffer, 8);
  const crc = crc32(buffer.subarray(4, 8 + length));
  buffer.writeUInt32BE(crc >>> 0, 8 + length);
  return buffer;
}

// Standard CRC32 table & function for PNG
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return crc ^ -1;
}

// Generate calculator icon RGBA pixels (4-quadrant modern operator logo matching user image)
function renderCalculatorIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const pad = Math.max(1, Math.floor(size * 0.04));
  const radius = Math.floor(size * 0.26); // Curved squircle corner radius

  const mid = size / 2;
  const stroke = Math.max(1.5, Math.floor(size * 0.065)); // Thick white operator stroke
  const symbolRadius = size * 0.12; // Symbol size radius inside each quadrant

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Rounded squircle container bounds
      const inX = x >= pad && x < size - pad;
      const inY = y >= pad && y < size - pad;

      if (!inX || !inY) {
        buf[idx] = 0; buf[idx+1] = 0; buf[idx+2] = 0; buf[idx+3] = 0;
        continue;
      }

      // Check squircle corner rounding
      let isInside = true;
      const cx = x < pad + radius ? pad + radius : (x >= size - pad - radius ? size - pad - radius : x);
      const cy = y < pad + radius ? pad + radius : (y >= size - pad - radius ? size - pad - radius : y);
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist > radius) {
        isInside = false;
      }

      if (!isInside) {
        buf[idx] = 0; buf[idx+1] = 0; buf[idx+2] = 0; buf[idx+3] = 0;
        continue;
      }

      const isLeft = x < mid;
      const isTop = y < mid;

      // 1. Base Quadrant Background Colors
      let r, g, b;
      if (isLeft && isTop) {
        // Top-Left: Golden Yellow (#f1b810)
        r = 241; g = 184; b = 16;
      } else if (!isLeft && isTop) {
        // Top-Right: Darker Orange (#ea7e1e)
        r = 234; g = 126; b = 30;
      } else if (isLeft && !isTop) {
        // Bottom-Left: Medium Orange (#f08920)
        r = 240; g = 137; b = 32;
      } else {
        // Bottom-Right: Slate Blue (#4f5e82)
        r = 79; g = 94; b = 130;
      }

      // 2. White Operator Symbols Layer
      let isWhiteSymbol = false;

      if (isLeft && isTop) {
        // Top-Left Plus (+) centered at (size * 0.25, size * 0.25)
        const qcx = size * 0.25;
        const qcy = size * 0.25;
        const dx = Math.abs(x - qcx);
        const dy = Math.abs(y - qcy);
        if ((dx <= stroke && dy <= symbolRadius) || (dy <= stroke && dx <= symbolRadius)) {
          isWhiteSymbol = true;
        }
      } else if (!isLeft && isTop) {
        // Top-Right Minus (-) centered at (size * 0.75, size * 0.25)
        const qcx = size * 0.75;
        const qcy = size * 0.25;
        const dx = Math.abs(x - qcx);
        const dy = Math.abs(y - qcy);
        if (dy <= stroke && dx <= symbolRadius) {
          isWhiteSymbol = true;
        }
      } else if (isLeft && !isTop) {
        // Bottom-Left Multiply (×) centered at (size * 0.25, size * 0.75)
        const qcx = size * 0.25;
        const qcy = size * 0.75;
        const dx = x - qcx;
        const dy = y - qcy;
        const distDiag1 = Math.abs(dx - dy) / Math.SQRT2;
        const distDiag2 = Math.abs(dx + dy) / Math.SQRT2;
        const distCenter = Math.sqrt(dx * dx + dy * dy);
        if ((distDiag1 <= stroke || distDiag2 <= stroke) && distCenter <= symbolRadius) {
          isWhiteSymbol = true;
        }
      } else {
        // Bottom-Right Equals (=) centered at (size * 0.75, size * 0.75)
        const qcx = size * 0.75;
        const qcy = size * 0.75;
        const dx = Math.abs(x - qcx);
        const dy = y - qcy;
        const gap = stroke * 1.5;
        if ((Math.abs(dy - gap) <= stroke || Math.abs(dy + gap) <= stroke) && dx <= symbolRadius) {
          isWhiteSymbol = true;
        }
      }

      if (isWhiteSymbol) {
        buf[idx] = 255; buf[idx+1] = 255; buf[idx+2] = 255; buf[idx+3] = 255;
      } else {
        buf[idx] = r; buf[idx+1] = g; buf[idx+2] = b; buf[idx+3] = 255;
      }
    }
  }

  return createPNG(size, size, buf);
}



// Write icons to icons directory
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 32, 48, 128].forEach(size => {
  const pngBuf = renderCalculatorIcon(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), pngBuf);
  console.log(`Generated icon${size}.png (${pngBuf.length} bytes)`);
});
