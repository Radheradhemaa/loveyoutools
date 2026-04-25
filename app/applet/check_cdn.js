async function check() {
  const p = await fetch('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/dist/resources.json');
  console.log(p.status, p.statusText);
}
check();
