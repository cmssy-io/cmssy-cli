import { heroBlock } from "@/blocks/hero/block";

// The single source of truth for which blocks this site can render. The editor
// reads each block's schema over the SDK bridge, so they appear in the picker.
export const blocks = [heroBlock];
