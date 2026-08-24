export interface Alignment {
  /** One entry per display row: its altText line, padded to `cols`, or `null`. */
  lines: (string | null)[]
  rejectedLines: number
  rejectedVotes: number
}

export function alignAltText(
  occupancies: boolean[][],
  altText: string,
  cols: number,
): Alignment
