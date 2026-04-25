const fetch = require('node-fetch');
fetch('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/dist/resources.json').then(res=>res.text()).then(console.log).catch(console.error);
