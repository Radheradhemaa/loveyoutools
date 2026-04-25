const http = require('https');
http.get('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/dist/resources.json', (res) => {
  console.log(res.statusCode, res.headers);
});
