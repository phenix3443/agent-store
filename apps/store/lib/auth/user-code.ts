/** The device code the desktop shows, grouped as XXXX-XXXX like the client prints it. */
export function formatUserCode(code: string): string {
  const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}
