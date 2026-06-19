import fs from 'node:fs'
import { type Browser, chromium, expect, test } from 'playwright/test'

const storageKey = 'blockforge-worlds.active-map'
const chromiumCandidates = ['/snap/bin/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']

test('imports a v2 world with an unknown block type without crashing render', async () => {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
    process.env.CHROMIUM_PATH ??
    chromiumCandidates.find((candidate) => fs.existsSync(candidate)) ??
    chromium.executablePath()

  test.skip(
    !fs.existsSync(executablePath),
    `Chromium executable not found at ${executablePath}; set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or CHROMIUM_PATH to run locally.`,
  )

  let browser: Browser

  try {
    browser = await chromium.launch({ executablePath })
  } catch (error) {
    test.skip(true, `Chromium failed to launch locally: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const page = await browser.newPage()
  const pageErrors: Error[] = []
  const consoleMessages: string[] = []

  page.on('pageerror', (error) => pageErrors.push(error))
  page.on('console', (message) => consoleMessages.push(message.text()))

  await page.addInitScript(
    ({ key, world }) => {
      localStorage.setItem(key, JSON.stringify(world))
    },
    {
      key: storageKey,
      world: {
        schemaVersion: 2,
        name: 'Unknown block import',
        seed: 120626,
        size: 30,
        createdAt: '2026-06-19T00:00:00.000Z',
        updatedAt: '2026-06-19T00:00:00.000Z',
        spawn: { x: 0, y: 2, z: 0 },
        spawnYaw: 0,
        zones: [],
        blocks: [{ x: 0, y: 0, z: 0, type: 'lava' }],
        props: [],
      },
    },
  )

  await page.goto('/')

  await expect(page.locator('#root')).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(1)

  expect(pageErrors).toEqual([])
  expect(consoleMessages.join('\n')).not.toContain("Cannot read properties of undefined")

  await browser.close()
})
