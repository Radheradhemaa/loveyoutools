import { removeBackground, preload, Config } from "@imgly/background-removal";

self.onmessage = async (e: MessageEvent) => {
  const { type, id, processSrc, modelType, cdn } = e.data;

  try {
    const config: Config = {
      model: modelType || "isnet_quint8",
      output: { format: "image/png", quality: 0.9 },
      ...(cdn ? { publicPath: cdn } : {}),
      proxyToWorker: false, // Core img.ly engine stays on THIS thread (which is already a worker)
      progress: (step: string, progress: number) => {
        self.postMessage({ type: 'progress', id, step, progress });
      }
    };

    if (type === 'PRELOAD') {
      await preload(config);
      self.postMessage({ type: 'preload_success', id });
      return;
    }

    const blob = await removeBackground(processSrc, config);
    self.postMessage({ type: 'success', id, blob });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: 'error', id, errorMsg });
  }
};
