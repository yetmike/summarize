import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BrowserContext, Page } from '@playwright/test'
import { chromium, expect, test } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const extensionPath = path.resolve(__dirname, '..', '.output', 'chrome-mv3')
const consoleErrorAllowlist: RegExp[] = []

type ExtensionHarness = {
  context: BrowserContext
  extensionId: string
  pageErrors: Error[]
  consoleErrors: string[]
  userDataDir: string
}

function filterAllowed(errors: string[]) {
  return errors.filter((message) => !consoleErrorAllowlist.some((pattern) => pattern.test(message)))
}

function trackErrors(page: Page, pageErrors: Error[], consoleErrors: string[]) {
  page.on('pageerror', (error) => pageErrors.push(error))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    consoleErrors.push(message.text())
  })
}

function assertNoErrors(harness: ExtensionHarness) {
  expect(harness.pageErrors.map((error) => error.message)).toEqual([])
  expect(filterAllowed(harness.consoleErrors)).toEqual([])
}

function getOpenPickerList(page: Page) {
  return page.locator('#summarize-overlay-root .pickerContent:not([hidden]) .pickerList')
}

async function launchExtension(): Promise<ExtensionHarness> {
  if (!fs.existsSync(extensionPath)) {
    throw new Error('Missing built extension. Run: pnpm -C apps/chrome-extension build')
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'summarize-ext-'))
  // Chromium extensions (MV3 service workers) are not reliably supported in true headless mode.
  // Default: keep UI out of the way; set SHOW_UI=1 for debugging.
  const showUi = process.env.SHOW_UI === '1'
  const args = [
    ...(showUi
      ? []
      : ['--start-minimized', '--window-position=-10000,-10000', '--window-size=10,10']),
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ]
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args,
  })

  const background =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15_000 }))
  const extensionId = new URL(background.url()).host

  return {
    context,
    extensionId,
    pageErrors: [],
    consoleErrors: [],
    userDataDir,
  }
}

async function openExtensionPage(
  harness: ExtensionHarness,
  pathname: string,
  readySelector: string
) {
  const page = await harness.context.newPage()
  trackErrors(page, harness.pageErrors, harness.consoleErrors)
  await page.goto(`chrome-extension://${harness.extensionId}/${pathname}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector(readySelector)
  return page
}

async function closeExtension(context: BrowserContext, userDataDir: string) {
  await context.close()
  fs.rmSync(userDataDir, { recursive: true, force: true })
}

test('sidepanel loads without runtime errors', async () => {
  const harness = await launchExtension()

  try {
    await openExtensionPage(harness, 'sidepanel.html', '#title')
    await new Promise((resolve) => setTimeout(resolve, 500))
    assertNoErrors(harness)
  } finally {
    await closeExtension(harness.context, harness.userDataDir)
  }
})

test('sidepanel scheme picker supports keyboard selection', async () => {
  const harness = await launchExtension()

  try {
    const page = await openExtensionPage(harness, 'sidepanel.html', '#title')
    await page.click('#drawerToggle')
    await expect(page.locator('#drawer')).toBeVisible()

    const schemeLabel = page.locator('label.scheme')
    const schemeTrigger = schemeLabel.locator('.pickerTrigger')

    await schemeTrigger.focus()
    await schemeTrigger.press('Enter')
    const schemeList = getOpenPickerList(page)
    await expect(schemeList).toBeVisible()
    await schemeList.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(schemeTrigger.locator('.scheme-label')).toHaveText('Cedar')
    assertNoErrors(harness)
  } finally {
    await closeExtension(harness.context, harness.userDataDir)
  }
})

test('sidepanel mode picker updates theme mode', async () => {
  const harness = await launchExtension()

  try {
    const page = await openExtensionPage(harness, 'sidepanel.html', '#title')
    await page.click('#drawerToggle')
    await expect(page.locator('#drawer')).toBeVisible()

    const modeLabel = page.locator('label.mode')
    const modeTrigger = modeLabel.locator('.pickerTrigger')

    await modeTrigger.focus()
    await modeTrigger.press('Enter')
    const modeList = getOpenPickerList(page)
    await expect(modeList).toBeVisible()
    await modeList.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(modeTrigger).toHaveText('Dark')
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark')
    assertNoErrors(harness)
  } finally {
    await closeExtension(harness.context, harness.userDataDir)
  }
})

test('sidepanel custom length input accepts typing', async () => {
  const harness = await launchExtension()

  try {
    const page = await openExtensionPage(harness, 'sidepanel.html', '#title')
    await page.click('#drawerToggle')
    await expect(page.locator('#drawer')).toBeVisible()

    const lengthLabel = page.locator('label.length.mini')
    const lengthTrigger = lengthLabel.locator('.pickerTrigger').first()

    await lengthTrigger.click()
    const lengthList = getOpenPickerList(page)
    await expect(lengthList).toBeVisible()
    await lengthList.locator('.pickerOption', { hasText: 'Custom…' }).click()

    const customInput = page.locator('#lengthCustom')
    await expect(customInput).toBeVisible()
    await expect(customInput).toBeFocused()
    await customInput.fill('20k')
    await expect(customInput).toHaveValue('20k')
    await expect(customInput).toBeFocused()

    assertNoErrors(harness)
  } finally {
    await closeExtension(harness.context, harness.userDataDir)
  }
})

test('options pickers support keyboard selection', async () => {
  const harness = await launchExtension()

  try {
    const page = await openExtensionPage(harness, 'options.html', '#pickersRoot')

    const schemeLabel = page.locator('label.scheme')
    const schemeTrigger = schemeLabel.locator('.pickerTrigger')

    await schemeTrigger.focus()
    await schemeTrigger.press('Enter')
    const schemeList = getOpenPickerList(page)
    await expect(schemeList).toBeVisible()
    await schemeList.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(schemeTrigger.locator('.scheme-label')).toHaveText('Mint')

    const modeLabel = page.locator('label.mode')
    const modeTrigger = modeLabel.locator('.pickerTrigger')

    await modeTrigger.focus()
    await modeTrigger.press('Enter')
    const modeList = getOpenPickerList(page)
    await expect(modeList).toBeVisible()
    await modeList.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(modeTrigger).toHaveText('Light')
    assertNoErrors(harness)
  } finally {
    await closeExtension(harness.context, harness.userDataDir)
  }
})

test('options scheme list renders chips', async () => {
  const harness = await launchExtension()

  try {
    const page = await openExtensionPage(harness, 'options.html', '#pickersRoot')

    const schemeLabel = page.locator('label.scheme')
    const schemeTrigger = schemeLabel.locator('.pickerTrigger')

    await schemeTrigger.focus()
    await schemeTrigger.press('Enter')
    const schemeList = getOpenPickerList(page)
    await expect(schemeList).toBeVisible()

    const options = schemeList.locator('.pickerOption')
    await expect(options).toHaveCount(6)
    await expect(options.first().locator('.scheme-chips span')).toHaveCount(4)
    await expect(options.nth(1).locator('.scheme-chips span')).toHaveCount(4)

    assertNoErrors(harness)
  } finally {
    await closeExtension(harness.context, harness.userDataDir)
  }
})
