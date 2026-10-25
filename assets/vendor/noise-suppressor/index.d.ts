//#region src/noiseGate/options.d.ts
type NoiseGateProcessorOptions = {
  /**
   * threshold to open the gate in dB
   */
  openThreshold: number;
  /**
   * threshold to close the gate in dB
   *
   * @default openThreshold
   */
  closeThreshold?: number;
  /**
   * length of time to close the gate in milliseconds
   *
   * When the input sound is under the closeThreshold for this time, the gate will close.
   */
  holdMs: number;
  /**
   * the maximum number of channels
   */
  maxChannels: number;
};
//#endregion
//#region src/noiseGate/workletNode.d.ts
export declare class NoiseGateWorkletNode extends AudioWorkletNode {
  constructor(context: AudioContext, { openThreshold, closeThreshold, holdMs, maxChannels }: Readonly<NoiseGateProcessorOptions>);
}
//#endregion
//#region src/gtcrn/options.d.ts
type GtcrnProcessorOptions = {
  /**
   * the maximum number of channels
   */
  maxChannels: number;
  /**
   * use `loadGtcrn` to obtain binary
   */
  wasmBinary: ArrayBuffer;
};
//#endregion
//#region src/gtcrn/load.d.ts
type LoadGtcrnOptions = {
  /**
   * url to wasm binary
   */
  url: string;
};
export declare const loadGtcrn: ({ url }: LoadGtcrnOptions, init?: RequestInit) => Promise<ArrayBuffer>;
//#endregion
//#region src/gtcrn/workletNode.d.ts
export declare class GtcrnWorkletNode extends AudioWorkletNode {
  constructor(context: AudioContext, { maxChannels, wasmBinary }: Readonly<GtcrnProcessorOptions>);
  destroy(): void;
}
//#endregion
//#region src/rnnoise/options.d.ts
type RnnoiseProcessorOptions = {
  /**
   * the maximum number of channels
   */
  maxChannels: number;
  /**
   * use `loadRnnoise` to obtain binary
   */
  wasmBinary: ArrayBuffer;
};
//#endregion
//#region src/rnnoise/load.d.ts
type LoadRnnoiseOptions = {
  /**
   * url to regular wasm binary
   */
  url: string;
  /**
   * url to simd wasm binary
   */
  simdUrl: string;
};
export declare const loadRnnoise: ({ url, simdUrl }: LoadRnnoiseOptions, init?: RequestInit) => Promise<ArrayBuffer>;
//#endregion
//#region src/rnnoise/workletNode.d.ts
/**
 * Assumes sample rate to be 48kHz.
 */
export declare class RnnoiseWorkletNode extends AudioWorkletNode {
  constructor(context: AudioContext, { maxChannels, wasmBinary }: Readonly<RnnoiseProcessorOptions>);
  destroy(): void;
}
//#endregion
//#region src/speex/options.d.ts
type SpeexProcessorOptions = {
  /**
   * the maximum number of channels
   */
  maxChannels: number;
  /**
   * use `loadSpeex` to obtain binary
   */
  wasmBinary: ArrayBuffer;
};
//#endregion
//#region src/speex/load.d.ts
type LoadSpeexOptions = {
  /**
   * url to wasm binary
   */
  url: string;
};
export declare const loadSpeex: ({ url }: LoadSpeexOptions, init?: RequestInit) => Promise<ArrayBuffer>;
//#endregion
//#region src/speex/workletNode.d.ts
export declare class SpeexWorkletNode extends AudioWorkletNode {
  constructor(context: AudioContext, { maxChannels, wasmBinary }: Readonly<SpeexProcessorOptions>);
  destroy(): void;
}
//#endregion
export type { GtcrnProcessorOptions, NoiseGateProcessorOptions, RnnoiseProcessorOptions, SpeexProcessorOptions };
//# sourceMappingURL=index.d.ts.map