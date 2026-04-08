/**
 * Records two demo GIFs for the README:
 *   docs/demo-recipe-search.gif  — "street food quick and spicy" hybrid benchmark
 *   docs/demo-image-search.gif   — "joy and laughter" CLIP image search
 *
 * Prerequisites:
 *   cd scripts && npm install && npx playwright install chromium
 *   docker compose up -d  (search-arena must be running on localhost:3000)
 *   brew install ffmpeg
 *
 * Run:
 *   node scripts/record-demo.js
 */

const { chromium } = require('playwright')
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const BASE_URL = 'http://localhost:3000'
const RECORDINGS_DIR = path.join(__dirname, 'recordings')
const DOCS_DIR = path.join(__dirname, '..', 'docs')
const VIEWPORT = { width: 1280, height: 1080 }

async function record(name, scenario) {
  console.log(`\n▶ Recording: ${name}`)

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: RECORDINGS_DIR, size: VIEWPORT },
  })

  const page = await context.newPage()

  try {
    await scenario(page)
  } finally {
    await page.waitForTimeout(3000) // hold on final frame
    const videoPath = await page.video().path()
    await context.close()
    await browser.close()

    // Rename to a predictable filename
    const dest = path.join(RECORDINGS_DIR, `${name}.webm`)
    fs.renameSync(videoPath, dest)
    console.log(`  ✓ Saved: ${dest}`)

    // Convert to GIF
    const gif = path.join(DOCS_DIR, `demo-${name}.gif`)
    console.log(`  ⏳ Converting to GIF...`)
    execSync(
      `ffmpeg -y -i "${dest}" ` +
      `-vf "fps=12,scale=1200:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" ` +
      `-loop 0 "${gif}"`,
      { stdio: 'inherit' }
    )
    console.log(`  ✓ GIF: ${gif}`)
  }
}

async function recipeSearch(page) {
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)

  // Make sure Recipe Search tab is active (it's the default)
  await page.locator('.mode-tab', { hasText: 'Recipe Search' }).click()
  await page.waitForTimeout(400)

  // Type query character by character so it reads naturally in the GIF
  const input = page.locator('.search-input')
  await input.click()
  await input.type('street food quick and spicy', { delay: 75 })
  await page.waitForTimeout(500)

  // Submit
  await page.locator('.search-btn').click()

  // Wait until at least one result card actually appears (up to 20s)
  await page.waitForSelector('.result-card', { timeout: 20000 })

  // Stay on the 3D embedding space so it gets its moment
  await page.waitForTimeout(1800)

  // Smooth scroll down to the result columns
  await page.evaluate(() => {
    document.querySelector('.result-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  await page.waitForTimeout(1000) // let scroll animation finish

  // Small extra nudge so all three columns sit comfortably in frame
  await page.evaluate(() => window.scrollBy({ top: 180, behavior: 'smooth' }))
  await page.waitForTimeout(800)

  // Hold on results so the viewer can read them
  await page.waitForTimeout(3500)
}

async function imageSearch(page) {
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  // Switch to Image Search tab
  await page.locator('.mode-tab', { hasText: 'Image Search' }).click()
  await page.waitForTimeout(600)

  // Type query
  const input = page.locator('.search-input')
  await input.click()
  await input.type('joy and laughter', { delay: 80 })
  await page.waitForTimeout(500)

  // Submit
  await page.locator('.search-btn').click()

  // Wait until the hero image card appears (up to 20s)
  await page.waitForSelector('.image-hero-card', { timeout: 20000 })

  // Brief pause before scrolling — let the stats bar animate in
  await page.waitForTimeout(1500)

  // Smooth scroll to the hero card
  await page.evaluate(() => {
    document.querySelector('.image-hero-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  await page.waitForTimeout(1000) // let scroll animation finish

  // Hold on results so the viewer can see the images
  await page.waitForTimeout(3500)
}

;(async () => {
  // Ensure directories exist
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true })
  fs.mkdirSync(DOCS_DIR, { recursive: true })

  await record('recipe-search', recipeSearch)
  await record('image-search', imageSearch)

  console.log('\n✅ Done. Add to README.md:')
  console.log('  ![Recipe search](docs/demo-recipe-search.gif)')
  console.log('  ![Image search](docs/demo-image-search.gif)')
})()
