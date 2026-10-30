// What a device is (the "device" event createAnalytics sends once per startup), from Waddleberg (Cube, 25 Oct 2026).
// Hardware categories only: never send the full UA, serials or device IDs.
// Use the game's existing GL context; don't allocate another renderer at startup.
type DeviceNavigator = {
  userAgent: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgentData?: { getHighEntropyValues(hints: string[]): Promise<{ model?: string; platform?: string; platformVersion?: string }> };
};
type Props = Record<string, string | number>;

export async function deviceProps(
  gl: Pick<WebGLRenderingContext, "getExtension" | "getParameter">,
  nav: DeviceNavigator,
  display: { width: number; height: number; ratio: number },
): Promise<Props> {
  const props: Props = {};
  const put = (key: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) props[key] = value.trim().slice(0, 200);
    if (typeof value === "number" && Number.isFinite(value) && value > 0) props[key] = value;
  };
  try {
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    if (debug) put("gpu", gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
  } catch { /* Browser privacy controls may block GPU information. */ }
  const android = nav.userAgent.match(/Android\s+([\d.]+)([^)]*)/);
  if (android) {
    const parts = android[2].split(";").map(p => p.trim()).filter(p => p && p !== "wv" && !/^[a-z]{2}[-_][A-Z]{2}$/.test(p));
    // (not parts.at(-1): Android WebViews before Chrome 92 lack it, and those are the phones we most need to see)
    const model = parts[parts.length - 1]?.split(/\s+Build\//)[0].trim();
    // Chromium's reduced UA reports Android 10 / K, not the actual hardware.
    if (model !== "K") {
      put("os", android[1]);
      put("model", model);
    }
  }
  // the browser engine's version (Android's WebView is Chrome): old ones lack features the games use
  put("chrome", Number(nav.userAgent.match(/Chrome\/(\d+)/)?.[1]));
  put("memory", nav.deviceMemory);
  put("cores", nav.hardwareConcurrency);
  const { width, height, ratio } = display;
  if ([width, height, ratio].every(n => Number.isFinite(n) && n > 0))
    put("screen", `${Math.round(width * ratio)}x${Math.round(height * ratio)}@${ratio}`);

  // Client hints can be denied or stall: neither should hold up startup telemetry.
  let timer: number | undefined;
  try {
    if (nav.userAgentData) {
      const hints = await Promise.race([
        nav.userAgentData.getHighEntropyValues(["model", "platformVersion"]),
        new Promise<undefined>(resolve => { timer = setTimeout(resolve, 2000); }),
      ]);
      put("model", hints?.model);
      if (android || hints?.platform === "Android") put("os", hints?.platformVersion);
    }
  } catch { /* Keep the available UA and hardware fields. */ }
  finally { clearTimeout(timer); }
  return props;
}
