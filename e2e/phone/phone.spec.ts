import { test, expect } from "../fixtures";

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const LINE = "WHAT IS THIS? A COMPUTER FOR ANTS?";
const FACT = "Orbital Books needs a laptop or desktop computer. Open this page on one to play.";

test.describe("on a phone", () => {
  test.use(PHONE);

  test("a robot grabs the phone and says it needs a computer, instead of the game", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "only Chromium takes touch and a coarse pointer from isMobile",
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?analytics-test=1");
    await expect(
      page.getByRole("img", {
        name: "A robot reaches out of the screen, takes your phone, looks it over, and walks off with it down endless white corridors.",
      }),
    ).toBeVisible();
    await expect(page.getByText(FACT)).toBeVisible();
    // The game isn't there to use: not the station, not the menu.
    await expect(page.getByRole("region", { name: "The station" })).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    // Once the claw has the phone (or at once, without WebGL), the boss speaks.
    await expect(page.getByText(LINE)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-speaking]")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("with reduced motion, the robot is already holding it and says so at once", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "only Chromium takes touch and a coarse pointer from isMobile",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?analytics-test=1");
    await expect(page.locator("[data-speaking]")).toHaveCount(1, { timeout: 5_000 });
    await expect(page.getByText(LINE)).toBeVisible();
  });
});

test("a desktop window dragged phone-narrow still gets the game", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?analytics-test=1");
  await expect(page.getByRole("region", { name: "The station" })).toBeVisible();
  await expect(page.getByText(FACT)).toBeHidden();
});

const overlaps = (a: number[], b: { x: number; y: number; width: number; height: number }) =>
  a[0]! < b.x + b.width && b.x < a[0]! + a[2]! && a[1]! < b.y + b.height && b.y < a[1]! + a[3]!;

for (const [name, viewport] of [
  ["iPhone SE", { width: 375, height: 667 }],
  ["Pixel 7", { width: 412, height: 839 }],
  ["iPhone 15, turned", { width: 659, height: 393 }],
] as const) {
  test.describe(`on a ${name}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("the words never cover the robot's head, and no music loads", async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName !== "chromium",
        "only Chromium takes touch and a coarse pointer from isMobile",
      );
      const music: string[] = [];
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (/music|songs\.json|\.(mp3|m4a|ogg)$/.test(path)) music.push(path);
      });
      await page.goto("/?analytics-test=1");
      const webgl = await page.evaluate(() =>
        Boolean(document.createElement("canvas").getContext("webgl2")),
      );
      test.skip(!webgl, "no WebGL 2 here: the still picture has no head to place");
      // Once the hands have the phone, the boss speaks; from then on the head stays clear of the words.
      await expect(page.locator("[data-speaking]")).toHaveCount(1, { timeout: 20_000 });
      await page.waitForTimeout(1_500);
      const head = (await page.locator("[data-head]").getAttribute("data-head"))!
        .split(",")
        .map(Number);
      const bubble = (await page.locator("[data-speaking]").boundingBox())!;
      const fact = (await page
        .getByText("Orbital Books needs a laptop or desktop computer.")
        .boundingBox())!;
      expect(head[2]).toBeGreaterThan(40);
      expect(overlaps(head, bubble), `head ${head} under the bubble`).toBe(false);
      expect(overlaps(head, fact), `head ${head} under the fact line`).toBe(false);
      expect(await page.locator("audio").count()).toBe(0);
      expect(music).toEqual([]);
    });
  });
}

test("a desktop never fetches the phone screen's pictures", async ({ page }) => {
  const fetched: string[] = [];
  page.on("request", (request) => fetched.push(new URL(request.url()).pathname));
  await page.goto("/?analytics-test=1");
  await expect(page.getByRole("region", { name: "The station" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(fetched.filter((path) => /\/bosses\/(full\/)?readers\.webp$/.test(path))).toEqual([]);
});
