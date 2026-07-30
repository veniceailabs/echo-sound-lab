const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const defaultContext = browser.contexts()[0];
    const page = await defaultContext.newPage();
    await page.goto('http://localhost:3005/');
    
    // Wait for the app to load
    await page.waitForTimeout(2000);
    
    // The vocal is the first input, beat is the second
    const fileInputs = await page.locator('input[type="file"]').all();
    if (fileInputs.length < 2) {
      console.error("Couldn't find the file inputs.");
      process.exit(1);
    }
    
    console.log("Uploading files...");
    await fileInputs[0].setInputFiles('/Users/DRA/SESSIONS/"dontHoldback." prod. Kenneth English /Audio Files/Verse Take 2 - COMP.wav');
    await fileInputs[1].setInputFiles('/Users/DRA/SESSIONS/"dontHoldback." prod. Kenneth English /Audio Files/Kanye West late registration type beat - Plant roots.wav');
    
    console.log("Clicking Mix...");
    await page.locator('button:has-text("Mix & Master")').click();
    
    console.log("Waiting for Mix to complete...");
    // Wait for "Vocal Pocket Depth" text to appear
    const pocketDepthLoc = page.locator('text=Vocal Pocket Depth');
    await pocketDepthLoc.waitFor({ state: 'visible', timeout: 60000 });
    
    // Get the full text containing the metric
    const textContent = await page.locator('.text-orange-400').last().textContent();
    
    console.log("SUCCESS_METRIC_EXTRACTED: " + textContent);
    await browser.close();
  } catch (err) {
    console.error("ERROR: ", err);
  }
})();
