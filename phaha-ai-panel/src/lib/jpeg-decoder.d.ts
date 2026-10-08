declare module "jpeg-js/lib/decoder.js" {
  export default function decode(
    data: Uint8Array,
    opts?: { useTArray?: boolean; formatAsRGBA?: boolean; maxMemoryUsageInMB?: number; maxResolutionInMP?: number },
  ): { width: number; height: number; data: Uint8Array };
}
