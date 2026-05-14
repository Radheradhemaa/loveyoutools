import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels = false;

async function test() {
  try {
    const pipe = await pipeline('image-segmentation', 'Xenova/modnet', { device: 'wasm' });
    console.log("Success! modnet wasm pipeline created", typeof pipe);
    
    // Attempt base64
    const res = await pipe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
    console.log("Result", res.length);
  } catch (e) {
    console.error("wasm modnet pipeline failed:", e.message);
  }
}
test();
