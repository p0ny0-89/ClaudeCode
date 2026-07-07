import type { ToolcraftMediaAsset } from "@/toolcraft/runtime";

import {
  cellSampleGridFromImageData,
  computeArtworkPlacements,
  getRepeatPeriodCells,
  type ArtworkPlacementOptions,
  type ArtworkScaleMode,
  type CellSampleGrid,
  type RepeatPeriodCells,
} from "./sampling";

const decodedImageCache = new Map<string, Promise<HTMLImageElement>>();

function decodeImage(dataUrl: string): Promise<HTMLImageElement> {
  const cached = decodedImageCache.get(dataUrl);

  if (cached) {
    return cached;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode artwork image."));
    image.src = dataUrl;
  });

  if (decodedImageCache.size > 8) {
    decodedImageCache.clear();
  }

  decodedImageCache.set(dataUrl, promise);

  return promise;
}

function applyMediaTransform(
  image: HTMLImageElement,
  asset: ToolcraftMediaAsset,
): HTMLCanvasElement | HTMLImageElement {
  const transform = asset.transform;

  if (
    !transform ||
    ((transform.rotationDeg ?? 0) === 0 &&
      !transform.flipHorizontal &&
      !transform.flipVertical)
  ) {
    return image;
  }

  const rotation = transform.rotationDeg ?? 0;
  const swapAxes = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");

  canvas.width = swapAxes ? image.naturalHeight : image.naturalWidth;
  canvas.height = swapAxes ? image.naturalWidth : image.naturalHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    return image;
  }

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(transform.flipHorizontal ? -1 : 1, transform.flipVertical ? -1 : 1);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

  return canvas;
}

/**
 * GPU readback pipeline shared across samples. The composed cell-space
 * canvas is uploaded once as a texture and read back with gl.readPixels so
 * the per-cell averaging stays off the CPU 2D pixel path. Created lazily
 * outside React render and reused for every sample pass.
 */
class ArtworkSampleReader {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private texture: WebGLTexture | null = null;

  private ensureContext(): WebGLRenderingContext | null {
    if (this.gl && this.canvas) {
      return this.gl;
    }

    this.canvas = document.createElement("canvas");

    const gl = this.canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      stencil: false,
    });

    if (!gl) {
      return null;
    }

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    const program = gl.createProgram();

    if (!vertexShader || !fragmentShader || !program) {
      return null;
    }

    gl.shaderSource(
      vertexShader,
      [
        "attribute vec2 position;",
        "varying vec2 uv;",
        "void main() {",
        "  uv = position * 0.5 + 0.5;",
        "  gl_Position = vec4(position, 0.0, 1.0);",
        "}",
      ].join("\n"),
    );
    gl.compileShader(vertexShader);
    gl.shaderSource(
      fragmentShader,
      [
        "precision mediump float;",
        "uniform sampler2D source;",
        "varying vec2 uv;",
        // Sampling without a Y flip renders the image upside-down in the
        // framebuffer, so bottom-up readPixels rows come back in top-down
        // cell order.
        "void main() {",
        "  gl_FragColor = texture2D(source, uv);",
        "}",
      ].join("\n"),
    );
    gl.compileShader(fragmentShader);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return null;
    }

    gl.useProgram(program);

    const quadBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(program, "position");

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.gl = gl;

    return gl;
  }

  readCellPixels(composed: HTMLCanvasElement): Uint8ClampedArray | null {
    const gl = this.ensureContext();

    if (!gl || !this.canvas) {
      return null;
    }

    const { height, width } = composed;

    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, composed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const pixels = new Uint8Array(width * height * 4);

    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    return new Uint8ClampedArray(pixels.buffer);
  }
}

let sharedSampleReader: ArtworkSampleReader | null = null;

function getSharedSampleReader(): ArtworkSampleReader {
  sharedSampleReader ??= new ArtworkSampleReader();

  return sharedSampleReader;
}

export type SampleArtworkOptions = {
  asset: ToolcraftMediaAsset;
  columns: number;
  placement?: ArtworkPlacementOptions;
  rows: number;
  scaleMode: ArtworkScaleMode;
};

export type ArtworkSampleResult = {
  cellGrid: CellSampleGrid | null;
  /** Pattern period in cells when the placement mode is repeat. */
  repeatPeriod: RepeatPeriodCells | null;
};

/**
 * Downsamples the artwork into one averaged RGBA sample per tile cell by
 * drawing it into a columns x rows canvas with the requested placement mode
 * and reading the composed cells back through the shared WebGL reader.
 */
export async function sampleArtworkToCellGrid(
  options: SampleArtworkOptions,
): Promise<ArtworkSampleResult> {
  const { asset, columns, placement, rows, scaleMode } = options;
  const image = await decodeImage(asset.dataUrl);
  const source = applyMediaTransform(image, asset);
  const sourceWidth =
    source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  const sourceHeight =
    source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { cellGrid: null, repeatPeriod: null };
  }

  const repeatPeriod =
    scaleMode === "repeat"
      ? getRepeatPeriodCells(sourceWidth, sourceHeight, columns, rows, placement)
      : null;

  const sampleCanvas = document.createElement("canvas");

  sampleCanvas.width = columns;
  sampleCanvas.height = rows;

  const context = sampleCanvas.getContext("2d");

  if (!context) {
    return { cellGrid: null, repeatPeriod };
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const placements = computeArtworkPlacements(
    sourceWidth,
    sourceHeight,
    columns,
    rows,
    scaleMode,
    placement,
  );

  for (const rect of placements) {
    context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  }

  const pixels = getSharedSampleReader().readCellPixels(sampleCanvas);

  if (!pixels) {
    return { cellGrid: null, repeatPeriod };
  }

  return { cellGrid: cellSampleGridFromImageData(pixels, columns, rows), repeatPeriod };
}

export function getArtworkSampleCacheKey(
  asset: ToolcraftMediaAsset | undefined,
  columns: number,
  rows: number,
  scaleMode: ArtworkScaleMode,
  placement?: ArtworkPlacementOptions,
): string {
  const placementKey = `${placement?.scalePercent ?? 100}:${placement?.paddingCells ?? 0}:${placement?.spacingCells ?? 0}`;

  if (!asset) {
    return `none:${columns}x${rows}:${scaleMode}:${placementKey}`;
  }

  const transform = asset.transform;
  const transformKey = transform
    ? `${transform.rotationDeg ?? 0}:${transform.flipHorizontal ? 1 : 0}:${transform.flipVertical ? 1 : 0}`
    : "0:0:0";

  return `${asset.id}:${asset.dataUrl.length}:${transformKey}:${columns}x${rows}:${scaleMode}:${placementKey}`;
}
