import { test as base } from "@playwright/test";

import { expect, prepareContext } from "../fixtures";

// The entry page (src/entry): every other spec arrives having agreed (fixtures.ts); these arrive fresh.
const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    await prepareContext(context, baseURL!, { agreed: false });
    await use(context);
  },
});

/** A second of silence as a WAV, so the player has a real song to queue. */
function silentWav(seconds = 1, rate = 8000): Buffer {
  const samples = seconds * rate;
  const wav = Buffer.alloc(44 + samples);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples, 40);
  wav.fill(128, 44);
  return wav;
}

test("any URL shows the entry page first, with no app behind it; Continue waits for the agreement, then goes where the player was going", async ({
  page,
}) => {
  const app: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/assets/") || r.url().includes("/music/")) app.push(r.url());
  });
  await page.goto("/reports?analytics-test=1");
  await expect(page.getByRole("heading", { name: "Before you go in" })).toBeVisible();
  await expect(page).toHaveURL(/\/reports\?analytics-test=1$/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(app).toEqual([]);

  const music = page.getByRole("checkbox", { name: "Play the music" });
  const agree = page.getByRole("checkbox", { name: /I understand/ });
  const go = page.getByRole("button", { name: "Continue" });
  await expect(music).toBeChecked();
  await expect(agree).not.toBeChecked();
  await expect(go).toBeDisabled();
  await expect(page.getByText("Check the box above to continue.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy policy" })).toHaveAttribute(
    "href",
    "/privacy.html",
  );

  // By keyboard: the agreement is a real checkbox, and Continue follows it.
  await agree.focus();
  await page.keyboard.press("Space");
  await expect(go).toBeEnabled();
  await expect(page.getByText("Check the box above to continue.")).toBeHidden();
  await page.keyboard.press("Tab");
  await expect(go).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/reports\?analytics-test=1$/);
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  // Agreed once: every page after goes straight in.
  await page.goto("/investigate?analytics-test=1");
  await expect(page.getByRole("heading", { name: "Before you go in" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
});

test("with Play the music unticked, the game starts with the player paused", async ({ page }) => {
  await page.route("**/music/songs.json", (route) =>
    route.fulfill({
      json: { songs: [{ id: "test-silence", file: "test-silence.wav", title: "Test Silence" }] },
    }),
  );
  await page.route("**/music/test-silence.wav", (route) =>
    route.fulfill({ body: silentWav(), contentType: "audio/wav" }),
  );
  await page.goto("/investigate?analytics-test=1");
  await page.getByRole("checkbox", { name: "Play the music" }).uncheck();
  await page.getByRole("checkbox", { name: /I understand/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  const dock = page.locator(".music-dock");
  await expect(dock.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  // A tap doesn't start it, as it would for a player who left the music on.
  await page.mouse.click(5, 5);
  await page.waitForTimeout(800);
  await expect(dock.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).not.toBe("playing");
  // The choice was read once and cleared.
  expect((await page.context().cookies()).map((c) => c.name)).not.toContain("ob_music");
});
