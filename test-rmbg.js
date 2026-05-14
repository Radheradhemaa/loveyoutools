import { pipeline, env } from '@huggingface/transformers';
import fs from 'fs';

async function run() {
  env.allowLocalModels = false;
  env.backends.onnx.wasm.numThreads = 1;
  const segmenter = await pipeline('image-segmentation', 'briaai/RMBG-1.4', { device: 'webgpu' });
  console.log("Loaded!");
  // ...
}
run().catch(console.error);
