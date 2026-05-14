import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';
import fs from 'fs';

async function run() {
  env.allowLocalModels = false;
  env.backends.onnx.wasm.numThreads = 1;
  const model = await AutoModel.from_pretrained('Xenova/modnet', { quantized: true });
  console.log("Modnet loaded!");
}
run().catch(console.error);
