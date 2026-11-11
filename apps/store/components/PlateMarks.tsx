/** Crop marks at the four corners of a `.plate`. */
export function PlateMarks() {
  return (
    <>
      <i aria-hidden className="plate-mark -left-2 -top-2" />
      <i aria-hidden className="plate-mark -right-2 -top-2" />
      <i aria-hidden className="plate-mark -bottom-2 -left-2" />
      <i aria-hidden className="plate-mark -bottom-2 -right-2" />
    </>
  )
}
