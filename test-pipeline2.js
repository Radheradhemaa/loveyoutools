import { pipeline, env } from '@huggingface/transformers';

async function run() {
  env.allowLocalModels = false;
  env.backends.onnx.wasm.numThreads = 1;
  try {
    const segmenter = await pipeline('image-segmentation', 'Xenova/modnet');
    console.log("Segmenter loaded using ModNet!");
  } catch(e) {
    console.error("Failed loading ModNet with pipeline", e);
  }
}
run();
