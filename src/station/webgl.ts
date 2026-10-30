/**
 * Whether this browser can draw the 3D station. three.js (r163 on) needs
 * WebGL 2, so a WebGL 1-only browser gets the static picture too.
 */
export function canRenderWebGL2(doc: Pick<Document, "createElement"> = document): boolean {
  try {
    const canvas = doc.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    // Hand the context back: browsers cap how many a page may hold.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
