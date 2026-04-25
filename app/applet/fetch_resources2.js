fetch('https://unpkg.com/@imgly/background-removal@1.5.5/dist/resources.json')
  .then(res => res.text())
  .then(console.log)
  .catch(console.error);
