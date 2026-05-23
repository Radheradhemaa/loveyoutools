import { pipeline } from "@huggingface/transformers";

async function run() {
  try {
    const pipe = await pipeline("image-segmentation", "not-lain/u2net_human_seg", { device: "cpu" });
    console.log("not-lain u2net success");
  } catch (e) {
    console.error("failed:", e.message);
  }
}
run();
