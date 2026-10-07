/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */

import { resizeImageIfNeeded } from '../packages/tools/src/utils/imageResize.js';
import { transcodeImageToSupportedFormat } from '../packages/tools/src/utils/imageFormat.js';

function fail(message: string): never {
  throw new Error(`MAW Termux image smoke failed: ${message}`);
}

function makeBmp(width = 64, height = 48): Buffer {
  const bitsPerPixel = 24;
  const bytesPerPixel = bitsPerPixel / 8;
  const rowSize = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  const pixelDataSize = rowSize * height;
  const headerSize = 14 + 40;
  const buffer = Buffer.alloc(headerSize + pixelDataSize);

  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(headerSize, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(bitsPerPixel, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelDataSize, 34);

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const offset = headerSize + row * rowSize + col * bytesPerPixel;
      buffer[offset] = 40;
      buffer[offset + 1] = 30;
      buffer[offset + 2] = 200;
    }
  }

  return buffer;
}

function assertDimensions(
  label: string,
  metadata: { width: number; height: number },
  width: number,
  height: number,
): void {
  if (metadata.width !== width || metadata.height !== height) {
    fail(
      `${label} dimensions were ${metadata.width}x${metadata.height}; expected ${width}x${height}`,
    );
  }
}

if (typeof Bun.Image !== 'function') {
  fail(`Bun.Image is unavailable under Bun ${Bun.version}`);
}

const bmp = makeBmp();
const png = await transcodeImageToSupportedFormat(bmp, 'image/bmp');
if (png === null) {
  fail('BMP to PNG normalization returned no image');
}
const pngMetadata = await new Bun.Image(png).metadata();
if (pngMetadata.format !== 'png') {
  fail(`BMP normalization produced ${pngMetadata.format} instead of png`);
}
assertDimensions('BMP to PNG', pngMetadata, 64, 48);

const resizedPng = await resizeImageIfNeeded(
  png,
  'image/png',
  'termux-smoke.png',
  { maxLongEdge: 32 },
);
const resizedPngMetadata = await new Bun.Image(resizedPng).metadata();
if (resizedPngMetadata.format !== 'png') {
  fail(`PNG resize produced ${resizedPngMetadata.format} instead of png`);
}
assertDimensions('PNG resize', resizedPngMetadata, 32, 24);

const jpeg = Buffer.from(await new Bun.Image(png).jpeg().bytes());
const resizedJpeg = await resizeImageIfNeeded(
  jpeg,
  'image/jpeg',
  'termux-smoke.jpg',
  { maxLongEdge: 16 },
);
const resizedJpegMetadata = await new Bun.Image(resizedJpeg).metadata();
if (resizedJpegMetadata.format !== 'jpeg') {
  fail(
    `JPEG resize produced ${resizedJpegMetadata.format} instead of jpeg`,
  );
}
assertDimensions('JPEG resize', resizedJpegMetadata, 16, 12);

console.log(`MAW Termux image smoke: Bun ${Bun.version}`);
console.log('BMP -> PNG: 64x48');
console.log('PNG resize: 32x24');
console.log('JPEG resize: 16x12');
console.log('PASS: Bun.Image native image path is operational');
