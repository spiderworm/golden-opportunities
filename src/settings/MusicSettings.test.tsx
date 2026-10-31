import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MusicDock } from "~/shell/MusicDock";
import { MusicSettings } from "./MusicSettings";

describe("the music UI on the server", () => {
  it("renders no music panel and an empty dock: nothing loads until the browser", () => {
    expect(renderToString(<MusicSettings load={async () => null} />)).toBe("");
    expect(renderToString(<MusicDock collapsed={false} layer={{ current: null }} />)).toMatch(/^<div class="[^"]*musicDock[^"]*"><\/div>$/);
  });
});
