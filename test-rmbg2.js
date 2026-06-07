import { pipeline } from '@huggingface/transformers';
async function test() {
  try {
    const pipe = await pipeline('image-segmentation', 'briaai/RMBG-1.4');
    console.log('SUCCESS RMBG');
  } catch (e) {
    console.error('FAILED RMBG', e.message);
  }
}
test();
