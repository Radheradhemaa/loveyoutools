import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels = false;
async function test() {
  const models = [
    'briaai/RMBG-1.4',
    'Xenova/rmbg-1.4',
    'onnx-community/modnet',
  ]; 
  for (const model of models) {
     try {
       await pipeline('image-segmentation', model, { device: 'cpu' });
       console.log("Success:", model);
     } catch (e) {
       console.error("Failed:", model, e.message);
     }
  }
}
test();
