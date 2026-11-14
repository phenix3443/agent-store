declare module 'read-cmd-shim' {
  /** The shim's target, relative to the shim's directory, as written in the shim. */
  function readCmdShim(path: string): Promise<string>
  namespace readCmdShim {
    function sync(path: string): string
  }
  export = readCmdShim
}
