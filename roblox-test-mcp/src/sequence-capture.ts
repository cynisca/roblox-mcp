import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';
import { captureScreenshot, CompressionLevel } from './screenshot.js';
import { IPC_PATHS } from './ipc.js';

export type LayoutType = 'horizontal' | 'vertical' | 'grid' | 'auto';

export interface SequenceCaptureOptions {
  frames?: number;           // Number of frames to capture (default: 6)
  interval?: number;         // Ms between frames (default: 1000)
  layout?: LayoutType;       // Layout type (default: 'auto')
  compression?: CompressionLevel;  // Compression level (default: 'high')
  labels?: boolean;          // Add frame numbers (default: true)
}

export interface SequenceCaptureResult {
  success: boolean;
  path?: string;
  sizeKB?: number;
  frames?: number;
  layout?: string;
  totalDuration?: string;
  error?: string;
}

interface LayoutDimensions {
  cols: number;
  rows: number;
  description: string;
}

/**
 * Calculate optimal grid layout based on frame count
 */
function calculateLayout(frameCount: number, layoutType: LayoutType): LayoutDimensions {
  if (layoutType === 'horizontal') {
    return { cols: frameCount, rows: 1, description: `${frameCount}x1` };
  }

  if (layoutType === 'vertical') {
    return { cols: 1, rows: frameCount, description: `1x${frameCount}` };
  }

  // Auto or grid - calculate best fit
  if (frameCount <= 3) {
    return { cols: frameCount, rows: 1, description: `${frameCount}x1` };
  }

  if (frameCount === 4) {
    return { cols: 2, rows: 2, description: '2x2' };
  }

  if (frameCount <= 6) {
    return { cols: 3, rows: 2, description: '3x2' };
  }

  if (frameCount <= 9) {
    return { cols: 3, rows: 3, description: '3x3' };
  }

  if (frameCount <= 12) {
    return { cols: 4, rows: 3, description: '4x3' };
  }

  if (frameCount <= 16) {
    return { cols: 4, rows: 4, description: '4x4' };
  }

  // For larger counts, calculate nearest square-ish grid
  const cols = Math.ceil(Math.sqrt(frameCount));
  const rows = Math.ceil(frameCount / cols);
  return { cols, rows, description: `${cols}x${rows}` };
}

/**
 * Add frame label to an image
 */
async function addLabelToImage(
  imagePath: string,
  frameNumber: number,
  outputPath: string
): Promise<void> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width || 800;
  const height = metadata.height || 600;

  // Create SVG overlay with frame number
  const fontSize = Math.max(24, Math.floor(width / 20));
  const padding = Math.floor(fontSize / 2);
  const boxWidth = fontSize * 2;
  const boxHeight = fontSize * 1.5;

  const svgOverlay = `
    <svg width="${width}" height="${height}">
      <rect x="${padding}" y="${padding}" width="${boxWidth}" height="${boxHeight}"
            fill="rgba(0,0,0,0.7)" rx="4"/>
      <text x="${padding + boxWidth/2}" y="${padding + boxHeight/2 + fontSize/3}"
            font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold"
            fill="white" text-anchor="middle">${frameNumber}</text>
    </svg>
  `;

  await image
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .toFile(outputPath);
}

/**
 * Stitch multiple images into a single grid/strip
 */
async function stitchImages(
  imagePaths: string[],
  layout: LayoutDimensions,
  outputPath: string
): Promise<void> {
  if (imagePaths.length === 0) {
    throw new Error('No images to stitch');
  }

  // Get dimensions from first image
  const firstImage = sharp(imagePaths[0]);
  const metadata = await firstImage.metadata();
  const frameWidth = metadata.width || 800;
  const frameHeight = metadata.height || 600;

  const gap = 4; // Gap between frames
  const totalWidth = layout.cols * frameWidth + (layout.cols - 1) * gap;
  const totalHeight = layout.rows * frameHeight + (layout.rows - 1) * gap;

  // Create composite inputs
  const compositeInputs: sharp.OverlayOptions[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const col = i % layout.cols;
    const row = Math.floor(i / layout.cols);
    const x = col * (frameWidth + gap);
    const y = row * (frameHeight + gap);

    compositeInputs.push({
      input: imagePaths[i],
      left: x,
      top: y
    });
  }

  // Create base image and composite all frames
  await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 3,
      background: { r: 32, g: 32, b: 32 } // Dark gray background
    }
  })
    .composite(compositeInputs)
    .jpeg({ quality: 70 })
    .toFile(outputPath);
}

/**
 * Capture a sequence of screenshots and stitch them together
 */
export async function captureSequence(
  options: SequenceCaptureOptions = {}
): Promise<SequenceCaptureResult> {
  const {
    frames = 6,
    interval = 1000,
    layout = 'auto',
    compression = 'high',
    labels = true
  } = options;

  // Validate options
  if (frames < 2 || frames > 16) {
    return { success: false, error: 'Frame count must be between 2 and 16' };
  }

  if (interval < 100 || interval > 10000) {
    return { success: false, error: 'Interval must be between 100ms and 10000ms' };
  }

  const timestamp = Date.now();
  const tempDir = path.join(IPC_PATHS.screenshots, `sequence-temp-${timestamp}`);
  const outputPath = path.join(IPC_PATHS.screenshots, `sequence-${timestamp}.jpg`);

  try {
    // Create temp directory for frames
    await fs.mkdir(tempDir, { recursive: true });

    const framePaths: string[] = [];
    const startTime = Date.now();

    // Capture frames
    for (let i = 0; i < frames; i++) {
      const frameFilename = `frame-${i + 1}.jpg`;
      const framePath = path.join(tempDir, frameFilename);

      // Capture screenshot
      const result = await captureScreenshot({
        filename: frameFilename,
        studioOnly: true,
        compression
      });

      if (!result.success || !result.path) {
        throw new Error(`Failed to capture frame ${i + 1}: ${result.error}`);
      }

      // Move to temp directory
      await fs.rename(result.path, framePath);

      // Add label if requested
      if (labels) {
        const labeledPath = path.join(tempDir, `labeled-${i + 1}.jpg`);
        await addLabelToImage(framePath, i + 1, labeledPath);
        await fs.unlink(framePath);
        framePaths.push(labeledPath);
      } else {
        framePaths.push(framePath);
      }

      // Wait for next frame (except after last frame)
      if (i < frames - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    const captureTime = Date.now() - startTime;

    // Calculate layout
    const layoutDims = calculateLayout(frames, layout);

    // Stitch images
    await stitchImages(framePaths, layoutDims, outputPath);

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    // Get final file size
    const stats = await fs.stat(outputPath);
    const sizeKB = Math.round(stats.size / 1024);

    return {
      success: true,
      path: outputPath,
      sizeKB,
      frames,
      layout: layoutDims.description,
      totalDuration: `${Math.round(captureTime / 1000)}s`
    };

  } catch (e) {
    // Clean up on error
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return {
      success: false,
      error: (e as Error).message
    };
  }
}
