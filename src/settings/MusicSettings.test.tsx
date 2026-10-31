import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MusicPopup } from "~/shell/MusicPopup";
import { MusicSettings } from "./MusicSettings";

describe("the music UI on the server", () => {
  it("renders no music panel and an empty pop-up layer: nothing loads until the browser", () => {
    expect(renderToString(<MusicSettings load={async () => null} />)).toBe("");
    expect(renderToString(<MusicPopup />)).toMatch(/^<div class="[^"]*musicLayer[^"]*"><\/div>$/);
  });
});
