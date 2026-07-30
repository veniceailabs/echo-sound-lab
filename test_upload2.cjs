const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));

  await page.goto('https://echo-sound-lab.vercel.app/');
  
  // Wait for the app to load
  await page.waitForSelector('button');
  
  // Find the exact file input for the main upload. It is usually the first one or we can trigger it via the button.
  // The button says "Drop audio here". Let's just find the first input[type="file"] and upload, if it doesn't work we find all of them and upload to all of them.
  const inputs = await page.$$('input[type="file"]');
  console.log('Found ' + inputs.length + ' file inputs.');
  
  for (let i = 0; i < inputs.length; i++) {
     try {
       await inputs[i].uploadFile('/Users/DRA/SESSIONS/"dontHoldback." prod. Kenneth English /Audio Files/Verse Take 2 - COMP.wav');
       console.log('Uploaded to input ' + i);
     } catch(e) {}
  }
  
  // Wait 10 seconds for analyzing to resolve or hang
  console.log('Waiting 10 seconds...');
  await new Promise(r => setTimeout(r, 10000));
  
  await browser.close();
  console.log('Done.');
})();
