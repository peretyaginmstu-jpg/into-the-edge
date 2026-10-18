// Renders one frame at a chosen size and position and returns it as a Blob.
// Used for the Open Graph image and for checking pictures level by level:
//   const { snapshot } = await import('./js/engine/snapshot.js');
//   await snapshot(app, { z: -4.82, width: 1200, height: 627, save: 'level-3.png' });
// `save` posts the file to tools/serve.py, which writes it into exports/.

export async function snapshot(app, {
  z, width = 1280, height = 800, dpr = 1, overlay = true, quality = 1,
  type = 'image/png', save = null, time = null, paint = null,
} = {}) {
  const comp = app.compositor;
  const prev = { adaptive: comp.adaptive, quality: comp.quality };
  comp.adaptive = false;
  comp.quality = quality;
  app.setViewport(width, height, dpr);
  if (typeof z === 'number') app.zoom.jump(z);
  const t = time ?? performance.now() / 1000;
  const view = app.makeView(t, 0);
  const layers = app.layersFor(view.z);
  comp.render(layers, view);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(comp.renderer.domElement, 0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (overlay) app.overlay.paint(ctx, view, layers, { fontScale: 1 });
  if (paint) paint(ctx, view);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
  comp.adaptive = prev.adaptive;
  comp.quality = prev.quality;
  app.resize();
  app.dirty = true;
  if (save) {
    const res = await fetch(`/__save?name=${encodeURIComponent(save)}`, { method: 'POST', body: blob });
    return res.text();
  }
  return blob;
}
