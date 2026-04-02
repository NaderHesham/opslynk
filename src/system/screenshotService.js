// system/screenshotService.js
// Captures primary display screenshot using Electron desktopCapturer

const path = require('path');
const fs   = require('fs');
const { screen, desktopCapturer } = require('electron');
const { SCREENSHOTS_DIR } = require('../storage/storageService');

/**
 * Captures the primary display.
 * Hides mainWindow briefly to exclude it from the screenshot.
 * Returns { base64, path, name, size } or null on failure.
 */
async function captureScreenshot(mainWindow) {
  const wasVisible = mainWindow?.isVisible();
  if (wasVisible) mainWindow.hide();
  await new Promise(r => setTimeout(r, 250));

  try {
    const { width, height } = screen.getPrimaryDisplay().size;
    const sources = await desktopCapturer.getSources({
      types        : ['screen'],
      thumbnailSize: { width, height }
    });
    if (!sources.length) return null;

    const pngBuf = sources[0].thumbnail.toPNG();
    const fname  = `ss_${Date.now()}.png`;
    const fpath  = path.join(SCREENSHOTS_DIR, fname);
    fs.writeFileSync(fpath, pngBuf);

    return {
      base64: pngBuf.toString('base64'),
      path  : fpath,
      name  : fname,
      size  : pngBuf.length
    };
  } catch (err) {
    console.error('Screenshot failed:', err);
    return null;
  } finally {
    if (wasVisible) {
      await new Promise(r => setTimeout(r, 100));
      mainWindow.show();
    }
  }
}

module.exports = { captureScreenshot };
