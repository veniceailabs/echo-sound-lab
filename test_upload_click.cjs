const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));

  await page.goto('http://localhost:3005');
  
  // Find the button that contains "Drop audio here" or "browse files"
  // Let's just find the first button that triggers the file input.
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser(),
    page.evaluate(() => {
       const buttons = Array.from(document.querySelectorAll('button'));
       const uploadBtn = buttons.find(b => b.textContent.includes('Drop audio here') || b.textContent.includes('browse'));
       if (uploadBtn) uploadBtn.click();
       else document.querySelector('input[type="file"]').click();
    })
  ]);

  console.log('Uploading file via FileChooser...');
  await fileChooser.accept(['/Users/DRA/SESSIONS/"dontHoldback." prod. Kenneth English /Audio Files/Verse Take 2 - COMP.wav']);
  
  console.log('Waiting for processing...');
  await new Promise(r => setTimeout(r, 10000));
  
  await browser.close();
  console.log('Done.');
})();
