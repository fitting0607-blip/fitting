export type ImageTransformV1 = {
  v: 1;
  /** Original image pixel size (from picker/upload time). */
  imgW: number;
  imgH: number;
  /**
   * User zoom relative to cover-fit baseline.
   * scale = baseScale(cover) * zoom
   */
  zoom: number;
  /** Pan offsets normalized by viewport size at edit time. */
  ox: number; // offsetXRatio = translateX / viewportW
  oy: number; // offsetYRatio = translateY / viewportH
};

export function isImageTransformV1(v: unknown): v is ImageTransformV1 {
  if (!v || typeof v !== 'object') return false;
  const o = v as any;
  return (
    o.v === 1 &&
    typeof o.imgW === 'number' &&
    typeof o.imgH === 'number' &&
    typeof o.zoom === 'number' &&
    typeof o.ox === 'number' &&
    typeof o.oy === 'number'
  );
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Compute cover-fit baseline scale for given viewport.
 * The resulting image fully covers the viewport.
 */
export function coverBaseScale(args: {
  viewportW: number;
  viewportH: number;
  imgW: number;
  imgH: number;
}) {
  const { viewportW, viewportH, imgW, imgH } = args;
  if (viewportW <= 0 || viewportH <= 0 || imgW <= 0 || imgH <= 0) return 1;
  return Math.max(viewportW / imgW, viewportH / imgH);
}

/**
 * Clamp translation so the image never exposes empty space in the viewport.
 * This assumes we're rendering by scaling the image around its center with translateX/translateY.
 */
export function clampTranslate(args: {
  viewportW: number;
  viewportH: number;
  imgW: number;
  imgH: number;
  scale: number;
  tx: number;
  ty: number;
}) {
  const { viewportW, viewportH, imgW, imgH, scale, tx, ty } = args;

  const scaledW = imgW * scale;
  const scaledH = imgH * scale;

  const maxX = Math.max(0, (scaledW - viewportW) / 2);
  const maxY = Math.max(0, (scaledH - viewportH) / 2);

  return {
    tx: clamp(tx, -maxX, maxX),
    ty: clamp(ty, -maxY, maxY),
  };
}

/**
 * Given saved transform and a viewport, compute render transform.
 * Returned tx/ty are in px for the viewport; scale is absolute.
 */
export function resolveTransformForViewport(args: {
  viewportW: number;
  viewportH: number;
  transform: ImageTransformV1;
}) {
  const { viewportW, viewportH, transform } = args;
  const baseScale = coverBaseScale({
    viewportW,
    viewportH,
    imgW: transform.imgW,
    imgH: transform.imgH,
  });

  const zoom = transform.zoom > 0 ? transform.zoom : 1;
  const scale = baseScale * zoom;
  const rawTx = transform.ox * viewportW;
  const rawTy = transform.oy * viewportH;

  const { tx, ty } = clampTranslate({
    viewportW,
    viewportH,
    imgW: transform.imgW,
    imgH: transform.imgH,
    scale,
    tx: rawTx,
    ty: rawTy,
  });

  return { baseScale, scale, tx, ty };
}

