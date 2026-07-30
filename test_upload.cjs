const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));

  await page.goto('https://echo-sound-lab.vercel.app/');
  
  // Wait for the file input to be available
  await page.waitForSelector('input[type="file"]');
  
  const fileInput = await page.$('input[type="file"]');
  console.log('Uploading file...');
  await fileInput.uploadFile('/Users/DRA/SESSIONS/"dontHoldback." prod. Kenneth English /Audio Files/Verse Take 2 - COMP.wav');
  
  // Wait 10 seconds for analyzing to resolve or hang
  console.log('Waiting 10 seconds...');
  await new Promise(r => setTimeout(r, 10000));
  
  await browser.close();
  console.log('Done.');
})();
