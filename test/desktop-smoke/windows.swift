// Prints the on-screen windows of one process: swift windows.swift <pid>
// Owner and bounds need no permission; the title needs Screen Recording and is empty without it.
import CoreGraphics

let pid = Int32(CommandLine.arguments[1]) ?? 0
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
for w in list where (w[kCGWindowOwnerPID as String] as? Int32) == pid {
  let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  let name = w[kCGWindowName as String] as? String ?? ""
  let owner = w[kCGWindowOwnerName as String] as? String ?? ""
  print("\(owner) | \(name) | \(b["Width"] ?? 0)x\(b["Height"] ?? 0) layer \(w[kCGWindowLayer as String] ?? 0)")
}
