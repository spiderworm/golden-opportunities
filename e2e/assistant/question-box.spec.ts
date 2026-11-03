import { test, expect } from "../fixtures";

// Dewey's question box wraps what's typed and grows to show all of it, with no limit (David, 2 Nov: "The user needs
// the ability to see everything they've typed at all times"). Enter asks; Shift+Enter starts a new line.
test("the question box wraps and grows to show everything typed, and Enter asks", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/investigate?analytics-test=1");
  const dewey = page.getByRole("region", { name: "Ask Dewey" });
  const question = dewey.getByRole("textbox", { name: "Question for Dewey" });
  await expect(question).toBeEnabled();
  const size = () =>
    question.evaluate((box: HTMLTextAreaElement) => ({
      height: box.clientHeight,
      scroll: box.scrollHeight,
      wide: box.clientWidth,
      scrollWide: box.scrollWidth,
      left: box.scrollLeft,
    }));
  const empty = await size();

  // Longer than a line at any width the panel takes (full width under the dashboard since #308, or a 340 to 820 px
  // column beside it): it wraps, nothing scrolls off to the side, and the box grows to show it all.
  const long =
    "Which titles sold best in the quarter before last, by format and by genre, and how did each compare with the same quarter a year before that? And which of them were bought by the same readers twice, and in which months, and at what discount, compared with the books those readers bought only once?";
  await question.fill(long);
  const grown = await size();
  expect(grown.height).toBeGreaterThan(empty.height * 1.8);
  expect(grown.scroll).toBeLessThanOrEqual(grown.height);
  expect(grown.scrollWide).toBeLessThanOrEqual(grown.wide);
  expect(grown.left).toBe(0);

  // Shift+Enter is a new line in the question; the box grows by it.
  await question.press("End");
  await question.press("Shift+Enter");
  await question.pressSequentially("And by month?");
  await expect(question).toHaveValue(`${long}\nAnd by month?`);
  const taller = await size();
  expect(taller.height).toBeGreaterThan(grown.height);
  expect(taller.scroll).toBeLessThanOrEqual(taller.height);

  // The longest question it takes (500 characters) still shows whole, and the conversation above stays in view.
  await question.fill("How did revenue change? ".repeat(21).slice(0, 500));
  const longest = await size();
  expect(longest.scroll).toBeLessThanOrEqual(longest.height);
  await question.scrollIntoViewIfNeeded();
  // The greeting (worded differently once Sage's #244 is in): the conversation's top, still in view.
  await expect(dewey.getByText(/about your sales/i)).toBeInViewport();

  // Narrowed after typing, it wraps onto more lines, and grows to show them still (Sage, #239); widened, it shrinks.
  const wide = page.viewportSize()!;
  await page.setViewportSize({ width: 420, height: wide.height });
  await expect
    .poll(async () => {
      const now = await size();
      return now.scroll <= now.height && now.height > longest.height;
    })
    .toBe(true);
  await page.setViewportSize(wide);
  await expect.poll(async () => (await size()).height).toBe(longest.height);

  // Enter asks: the question goes up into the conversation, and the box is one line again.
  await question.fill("What was revenue by quarter?");
  await question.press("Enter");
  await expect(dewey.locator("article").first()).toContainText("What was revenue by quarter?");
  await expect(question).toHaveValue("");
  expect((await size()).height).toBe(empty.height);
  expect(errors).toEqual([]);
});
