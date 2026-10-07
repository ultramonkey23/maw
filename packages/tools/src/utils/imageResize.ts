/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Metadata, Sharp } from 'sharp';
import { readSettingFlatOrNested } from './flatOrNestedSetting.js';

export interface ImageResizePolicy {
  readonly maxLongEdge?: number;
  readonly maxShortEdge?: number;
  readonly maxPixels?: number;
}

export interface ImageResizeSourceMetadata {
  readonly originalData: string;
  readonly originalMimeType: string;
  readonly transformation: {
    readonly policyId: 'image-resize';
    readonly policyVersion: 1;
    readonly parameters: Readonly<Record<string, number>>;
  };
}

export function createImageResizeSourceMetadata(
  original: Buffer,
  resized: Buffer,
  mimeType: string,
  policy: ImageResizePolicy | undefined,
): ImageResizeSourceMetadata | undefined {
  if (original === resized || policy === undefined) return undefined;
  const parameters = {
    ...(policy.maxLongEdge === undefined
      ? {}
      : { maxLongEdge: policy.maxLongEdge }),
    ...(policy.maxShortEdge === undefined
      ? {}
      : { maxShortEdge: policy.maxShortEdge }),
    ...(policy.maxPixels === undefined ? {} : { maxPixels: policy.maxPixels }),
  };
  return {
    originalData: original.toString('base64'),
    originalMimeType: mimeType,
    transformation: { policyId: 'image-resize', policyVersion: 1, parameters },
  };
}

export class ImageResizeError extends Error {
  constructor(displayName: string, reason: string) {
    super(`Unable to resize image ${displayName}: ${reason}`);
    this.name = 'ImageResizeError';
  }
}

interface ImageDimensions {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
}

const MIME_FORMATS: ReadonlyMap<string, string> = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
]);

function hasPngAnimationChunk(content: Buffer): boolean {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (
    content.length < signature.length ||
    !content.subarray(0, 8).equals(signature)
  ) {
    return false;
  }
  let offset = 8;
  while (offset + 12 <= content.length) {
    const length = content.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataEnd = typeStart + 4 + length;
    if (dataEnd + 4 > content.length) return false;
    const type = content.toString('ascii', typeStart, typeStart + 4);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset = dataEnd + 4;
  }
  return false;
}

function canUseBunImageResize(content: Buffer, mimeType: string): boolean {
  if (
    typeof Bun === 'undefined' ||
    typeof Bun.Image !== 'function' ||
    (mimeType !== 'image/jpeg' && mimeType !== 'image/png')
  ) {
    return false;
  }
  return mimeType !== 'image/png' || !hasPngAnimationChunk(content);
}

async function resizeWithBunImage(
  content: Buffer,
  mimeType: string,
  policy: ImageResizePolicy,
): Promise<Buffer> {
  const sourceFormat = MIME_FORMATS.get(mimeType);
  if (sourceFormat === undefined) {
    throw new Error(`resizing does not support ${mimeType} source`);
  }

  const input = new Bun.Image(content, { autoOrient: true });
  const metadata = await input.metadata();
  if (metadata.format !== sourceFormat) {
    throw new Error(
      `declared ${mimeType} does not match decoded ${metadata.format} container`,
    );
  }

  const dimensions: ImageDimensions = {
    width: metadata.width,
    height: metadata.height,
    frames: 1,
  };
  const scale = getScale(dimensions, policy);
  if (scale >= 1) {
    return content;
  }

  const targetWidth = Math.max(1, Math.floor(dimensions.width * scale));
  const targetHeight = Math.max(1, Math.floor(dimensions.height * scale));
  const pipeline = new Bun.Image(content, { autoOrient: true }).resize(
    targetWidth,
    targetHeight,
    {
      fit: 'inside',
      withoutEnlargement: true,
    },
  );
  const resized =
    mimeType === 'image/jpeg'
      ? Buffer.from(await pipeline.jpeg().bytes())
      : Buffer.from(await pipeline.png().bytes());

  const outputMetadata = await new Bun.Image(resized, {
    autoOrient: true,
  }).metadata();
  if (outputMetadata.format !== sourceFormat) {
    throw new Error(`output container changed from ${mimeType}`);
  }
  const outputDimensions: ImageDimensions = {
    width: outputMetadata.width,
    height: outputMetadata.height,
    frames: 1,
  };
  if (!satisfiesPolicy(outputDimensions, policy)) {
    throw new Error('output dimensions exceed the configured limits');
  }
  return resized;
}

async function tryResizeWithBunImage(
  content: Buffer,
  mimeType: string,
  policy: ImageResizePolicy,
): Promise<Buffer | undefined> {
  try {
    return await resizeWithBunImage(content, mimeType, policy);
  } catch {
    // Bun.Image is an optimization lane, not the compatibility authority.
    // Bun 1.3.14, for example, can read CMYK JPEG metadata but fail during
    // pixel decode. Fall through to sharp so previously supported inputs keep
    // working on hosts where its native addon is available.
    return undefined;
  }
}

function getDimensions(metadata: Metadata): ImageDimensions {
  const width = metadata.width;
  const height = metadata.pageHeight ?? metadata.height;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height)
  ) {
    throw new Error('image metadata is missing width or height');
  }
  const frames = metadata.pages ?? 1;
  const swapsAxes =
    metadata.orientation !== undefined && metadata.orientation >= 5;
  return swapsAxes
    ? { width: height, height: width, frames }
    : { width, height, frames };
}

function getScale(
  dimensions: ImageDimensions,
  policy: ImageResizePolicy,
): number {
  const longEdge = Math.max(dimensions.width, dimensions.height);
  const shortEdge = Math.min(dimensions.width, dimensions.height);
  const scales = [
    1,
    policy.maxLongEdge === undefined ? 1 : policy.maxLongEdge / longEdge,
    policy.maxShortEdge === undefined ? 1 : policy.maxShortEdge / shortEdge,
    policy.maxPixels === undefined
      ? 1
      : Math.sqrt(
          policy.maxPixels /
            (dimensions.width * dimensions.height * dimensions.frames),
        ),
  ];
  return Math.min(...scales);
}

const MIME_ENCODERS: ReadonlyMap<string, (pipeline: Sharp) => Sharp> = new Map([
  ['image/jpeg', (pipeline) => pipeline.jpeg()],
  ['image/png', (pipeline) => pipeline.png()],
  ['image/gif', (pipeline) => pipeline.gif()],
  ['image/webp', (pipeline) => pipeline.webp()],
]);

function encodeSourceFormat(pipeline: Sharp, mimeType: string): Sharp {
  const encode = MIME_ENCODERS.get(mimeType);
  if (encode === undefined) {
    throw new Error(`resizing does not support ${mimeType} output`);
  }
  return encode(pipeline);
}

function isWithinLimit(value: number, limit: number | undefined): boolean {
  return limit === undefined || value <= limit;
}

function satisfiesPolicy(
  dimensions: ImageDimensions,
  policy: ImageResizePolicy,
): boolean {
  const longEdge = Math.max(dimensions.width, dimensions.height);
  const shortEdge = Math.min(dimensions.width, dimensions.height);
  const pixels = dimensions.width * dimensions.height * dimensions.frames;
  return (
    isWithinLimit(longEdge, policy.maxLongEdge) &&
    isWithinLimit(shortEdge, policy.maxShortEdge) &&
    isWithinLimit(pixels, policy.maxPixels)
  );
}

function hasLimits(
  policy: ImageResizePolicy | undefined,
): policy is ImageResizePolicy {
  return (
    policy !== undefined &&
    (policy.maxLongEdge !== undefined ||
      policy.maxShortEdge !== undefined ||
      policy.maxPixels !== undefined)
  );
}

function readPositiveInteger(
  settings: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  // Dotted keys reach us both flat and nested depending on the producer of
  // the settings map (see readSettingFlatOrNested), so never index directly.
  const value = readSettingFlatOrNested(settings, key);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Invalid image resize settings: ${key} must be a positive integer`,
    );
  }
  return value;
}

export function resolveImageResizePolicy(
  settings: Readonly<Record<string, unknown>>,
): ImageResizePolicy | undefined {
  const enabled = readSettingFlatOrNested(settings, 'image-resize.enabled');
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new Error(
      'Invalid image resize settings: image-resize.enabled must be a boolean',
    );
  }
  const policy: ImageResizePolicy = {
    maxLongEdge: readPositiveInteger(settings, 'image-resize.maxLongEdge'),
    maxShortEdge: readPositiveInteger(settings, 'image-resize.maxShortEdge'),
    maxPixels: readPositiveInteger(settings, 'image-resize.maxPixels'),
  };
  if (enabled === false) {
    return undefined;
  }
  if (!hasLimits(policy)) {
    if (enabled === true) {
      throw new Error(
        'Invalid image resize settings: enabled resizing requires at least one limit',
      );
    }
    return undefined;
  }
  return policy;
}

export async function resizeImageIfNeeded(
  content: Buffer,
  mimeType: string,
  displayName: string,
  policy?: ImageResizePolicy,
): Promise<Buffer> {
  if (!hasLimits(policy)) {
    return content;
  }

  try {
    // Bun 1.3.14+ ships a native image pipeline in the runtime itself. Prefer
    // it for static PNG/JPEG so Android/Termux does not depend on sharp's
    // unavailable native addon and other Bun hosts avoid an extra native hop.
    // Animated PNG stays on the sharp path because Bun.Image is a single-frame
    // pipeline for the formats where animation fidelity is not guaranteed.
    if (canUseBunImageResize(content, mimeType)) {
      const bunResized = await tryResizeWithBunImage(
        content,
        mimeType,
        policy,
      );
      if (bunResized !== undefined) {
        return bunResized;
      }
    }

    // Keep sharp as the compatibility/fidelity path for animated and other
    // supported containers, and for Node hosts where Bun.Image is unavailable.
    const { default: sharp } = await import('sharp');
    const metadata = await sharp(content, {
      animated: true,
      failOn: 'warning',
    }).metadata();
    const sourceFormat = MIME_FORMATS.get(mimeType);
    if (sourceFormat === undefined) {
      throw new Error(`resizing does not support ${mimeType} source`);
    }
    if (metadata.format !== sourceFormat) {
      throw new Error(
        `declared ${mimeType} does not match decoded ${metadata.format} container`,
      );
    }
    const dimensions = getDimensions(metadata);
    const scale = getScale(dimensions, policy);
    if (scale >= 1) {
      return content;
    }

    const targetWidth = Math.max(1, Math.floor(dimensions.width * scale));
    const targetHeight = Math.max(1, Math.floor(dimensions.height * scale));
    const pipeline = sharp(content, { animated: true, failOn: 'warning' })
      .rotate()
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });
    const resized = await encodeSourceFormat(pipeline, mimeType).toBuffer();
    const resizedMetadata = await sharp(resized, { animated: true }).metadata();
    const resizedDimensions = getDimensions(resizedMetadata);

    if (resizedMetadata.format !== sourceFormat) {
      throw new Error(`output container changed from ${mimeType}`);
    }
    if (!satisfiesPolicy(resizedDimensions, policy)) {
      throw new Error('output dimensions exceed the configured limits');
    }
    if ((metadata.pages ?? 1) !== (resizedMetadata.pages ?? 1)) {
      throw new Error('output animation frame count changed');
    }
    return resized;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ImageResizeError(displayName, reason);
  }
}
