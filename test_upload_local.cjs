const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));

  await page.goto('http://localhost:3005');
  
  // Wait for the app to load
  await page.waitForSelector('button');
  
  // Upload to all inputs
  const inputs = await page.$$('input[type="file"]');
  console.log('Found ' + inputs.length + ' file inputs.');
  
  for (let i = 0; i < inputs.length; i++) {
     try {
       await inputs[i].uploadFile('/Users/DRA/SESSIONS/"dontHoldback." prod. Kenneth English /Audio Files/Verse Take 2 - COMP.wav');
       // In React, setting the files array via Puppeteer sometimes needs a manual event dispatch
       await page.evaluate((el) => {
          const event = new Event('change', { bubbles: true });
          el.dispatchEvent(event);
       }, inputs[i]);
       console.log('Uploaded to input ' + i);
     } catch(e) {}
  }
  
  console.log('Waiting 10 seconds...');
  await new Promise(r => setTimeout(r, 10000));
  
  await browser.close();
  console.log('Done.');
})();
