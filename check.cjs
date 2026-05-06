const fs = require('fs');
['logo.png', 'favicon/favicon.ico', 'favicon/favicon-32x32.png', 'pwa-icons/icon-192x192.png'].forEach(file => {
  try {
    const stats = fs.statSync('public/' + file);
    console.log(file, 'size:', stats.size);
  } catch(e) {
    console.log(file, 'missing');
  }
});
