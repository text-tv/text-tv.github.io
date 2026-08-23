/** Types for the shared mask helpers; the module itself is plain JS (mask.js). */
export declare function maskKey(mask: Uint16Array): string
export declare function doubleHeightKey(top: Uint16Array | null, bottom: Uint16Array | null): string
export declare function unstretchedKey(top: Uint16Array | null, bottom: Uint16Array | null): string
export declare function isStretched(mask: Uint16Array): boolean
