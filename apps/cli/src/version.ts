// AS_VERSION is replaced at compile time by build-sidecar.sh (bun build --define) with the
// desktop app's version; an uncompiled run reports "dev".
declare const AS_VERSION: string | undefined

export const VERSION: string = typeof AS_VERSION === 'string' ? AS_VERSION : 'dev'
