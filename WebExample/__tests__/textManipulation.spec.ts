import {test, expect} from '@playwright/test';
import type {Locator, Page} from '@playwright/test';
// eslint-disable-next-line import/no-relative-packages
import * as TEST_CONST from '../../example/src/testConstants';
import {getCursorPosition, setupInput, getElementStyle, pressCmd, getElementValue, setSelection, changeMarkdownStyle} from './utils';

const pasteContent = async ({text, page, inputLocator}: {text: string; page: Page; inputLocator: Locator}) => {
  await page.evaluate(async (pasteText) => navigator.clipboard.writeText(pasteText), text);
  await inputLocator.focus();
  await pressCmd({inputLocator, command: 'v'});
};

test.beforeEach(async ({page, context, browserName}) => {
  await page.goto(TEST_CONST.LOCAL_URL, {waitUntil: 'load'});
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-write', 'clipboard-read']);
  }
});

test.describe('paste content', () => {
  test.skip(({browserName}) => !!process.env.CI && browserName === 'webkit', 'Excluded from WebKit CI tests');

  test('paste', async ({page}) => {
    const PASTE_TEXT = 'bold';
    const BOLD_STYLE = 'font-weight: bold;';

    const inputLocator = await setupInput(page, 'clear');

    const wrappedText = '*bold*';
    await pasteContent({text: wrappedText, page, inputLocator});

    const elementHandle = await inputLocator.locator('span', {hasText: PASTE_TEXT}).last();
    const elementStyle = await getElementStyle(elementHandle);

    expect(elementStyle).toEqual(BOLD_STYLE);
  });

  test('paste replace', async ({page}) => {
    const inputLocator = await setupInput(page, 'reset');

    await inputLocator.focus();
    await pressCmd({inputLocator, command: 'a'});

    const newText = '*bold*';
    await pasteContent({text: newText, page, inputLocator});

    expect(await getElementValue(inputLocator)).toBe(newText);
  });

  test('paste undo', async ({page, browserName}) => {
    test.skip(!!process.env.CI && browserName === 'firefox', 'Excluded from Firefox CI tests');

    const PASTE_TEXT_FIRST = '*bold*';
    const PASTE_TEXT_SECOND = '@here';

    const inputLocator = await setupInput(page, 'clear');

    await page.evaluate(async (pasteText) => navigator.clipboard.writeText(pasteText), PASTE_TEXT_FIRST);

    await pressCmd({inputLocator, command: 'v'});
    await page.waitForTimeout(TEST_CONST.INPUT_HISTORY_DEBOUNCE_TIME_MS);
    await page.evaluate(async (pasteText) => navigator.clipboard.writeText(pasteText), PASTE_TEXT_SECOND);
    await pressCmd({inputLocator, command: 'v'});
    await page.waitForTimeout(TEST_CONST.INPUT_HISTORY_DEBOUNCE_TIME_MS);
    await pressCmd({inputLocator, command: 'z'});
    await page.waitForTimeout(TEST_CONST.INPUT_HISTORY_DEBOUNCE_TIME_MS);
    expect(await getElementValue(inputLocator)).toBe(PASTE_TEXT_FIRST);
  });

  test('paste redo', async ({page}) => {
    const PASTE_TEXT_FIRST = '*bold*';
    const PASTE_TEXT_SECOND = '@here';

    const inputLocator = await setupInput(page, 'clear');

    await page.evaluate(async (pasteText) => navigator.clipboard.writeText(pasteText), PASTE_TEXT_FIRST);
    await pressCmd({inputLocator, command: 'v'});
    await page.waitForTimeout(TEST_CONST.INPUT_HISTORY_DEBOUNCE_TIME_MS);
    await page.evaluate(async (pasteText) => navigator.clipboard.writeText(pasteText), PASTE_TEXT_SECOND);
    await page.waitForTimeout(TEST_CONST.INPUT_HISTORY_DEBOUNCE_TIME_MS);
    await pressCmd({inputLocator, command: 'v'});
    await page.waitForTimeout(TEST_CONST.INPUT_HISTORY_DEBOUNCE_TIME_MS);

    await pressCmd({inputLocator, command: 'z'});
    await pressCmd({inputLocator, command: 'Shift+z'});

    expect(await getElementValue(inputLocator)).toBe(`${PASTE_TEXT_FIRST}${PASTE_TEXT_SECOND}`);
  });
});

test('select all', async ({page}) => {
  const inputLocator = await setupInput(page, 'reset');
  await inputLocator.focus();
  await pressCmd({inputLocator, command: 'a'});

  const cursorPosition = await getCursorPosition(inputLocator);

  expect(cursorPosition.end).toBe(TEST_CONST.EXAMPLE_CONTENT.length);
});

test('cut content changes', async ({page, browserName}) => {
  test.skip(!!process.env.CI && browserName === 'webkit', 'Excluded from WebKit CI tests');

  const INITIAL_CONTENT = 'bold';
  const WRAPPED_CONTENT = `*${INITIAL_CONTENT}*`;
  const EXPECTED_CONTENT = WRAPPED_CONTENT.slice(0, 3);

  const inputLocator = await setupInput(page, 'clear');
  await pasteContent({text: WRAPPED_CONTENT, page, inputLocator});

  await page.evaluate(async () => {
    const filteredNode = Array.from(document.querySelectorAll('span[data-type="text"]'));

    const startNode = filteredNode[1];
    const endNode = filteredNode[2];

    if (startNode?.firstChild && endNode?.lastChild) {
      const range = new Range();
      range.setStart(startNode.firstChild, 2);
      range.setEnd(endNode.lastChild, endNode.lastChild.textContent?.length ?? 0);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    return filteredNode;
  });

  await inputLocator.focus();
  await pressCmd({inputLocator, command: 'x'});

  expect(await getElementValue(inputLocator)).toBe(EXPECTED_CONTENT);

  // Ckeck if there is no markdown elements after the cut operation
  const spans = await inputLocator.locator('span[data-type="text"]');
  expect(await spans.count()).toBe(1);
});

test('keep selection when changing markdown style', async ({page}) => {
  const inputLocator = await setupInput(page, 'reset');

  await setSelection(page);
  await changeMarkdownStyle(page);
  await inputLocator.focus();

  const cursorPosition = await getCursorPosition(inputLocator);

  expect(cursorPosition.end).toBe(TEST_CONST.SELECTION_END);
});
