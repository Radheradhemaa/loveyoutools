declare module 'gifshot' {
  export interface CreateGIFOptions {
    images?: string[] | HTMLImageElement[] | HTMLCanvasElement[];
    video?: string[] | HTMLVideoElement[];
    gifWidth?: number;
    gifHeight?: number;
    interval?: number;
    numFrames?: number;
    frameDuration?: number;
    sampleInterval?: number;
    numWorkers?: number;
    text?: string;
    fontWeight?: string;
    fontSize?: string;
    fontFamily?: string;
    fontColor?: string;
    textAlign?: string;
    textBaseline?: string;
    sample?: number;
    progressCallback?: (captureProgress: number) => void;
    completeCallback?: (obj: { error: boolean; errorCode: string; errorMsg: string; image: string }) => void;
    saveRenderingContexts?: boolean;
    savedRenderingContexts?: any[];
    crossOrigin?: string;
    watermark?: string | HTMLImageElement;
  }

  export function createGIF(
    options: CreateGIFOptions,
    callback: (obj: { error: boolean; errorCode: string; errorMsg: string; image: string }) => void
  ): void;

  export function isSupported(): boolean;
  export function isWebCamSupported(): boolean;
  export function isExistingVideoSupported(): boolean;
  export function isExistingImagesSupported(): boolean;
}
