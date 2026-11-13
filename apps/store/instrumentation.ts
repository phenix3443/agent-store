// Runs once when the server starts. The Node-only check lives in its own module
// behind this exact condition: Next also compiles this file for the edge
// runtime and drops the import only when it sits inside the NEXT_RUNTIME branch.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}
