/** The frame geometry SVT publishes. 40x25 characters of 13x16 px. */
export const FRAME_WIDTH = 520
export const FRAME_HEIGHT = 400

/** A three-digit teletext page number, e.g. "100". */
export type PageNumber = string

export const isPageNumber = (value: string): boolean => /^\d{3}$/.test(value)

export interface SubPage {
  /** e.g. "100-01". */
  subPageNumber: string
  /** Ready-to-render `data:image/gif;base64,...` URL. */
  gifDataUrl: string
  /** Raw `<map>` string; parsed by `parseImageMap`. */
  imageMap: string
  altText: string
}

export interface PageResult {
  kind: 'page'
  pageNumber: PageNumber
  prev?: PageNumber
  next?: PageNumber
  subPages: SubPage[]
  /** SVT's own publication time when it sends one, else the fetch time. */
  updatedAt: number
}

export interface NotBroadcastResult {
  kind: 'not-broadcast'
  pageNumber: PageNumber
  prev?: PageNumber
  next?: PageNumber
}

export interface ErrorResult {
  kind: 'error'
  pageNumber: PageNumber
  message: string
}

/** The three outcomes the UI switches on exhaustively. */
export type FetchResult = PageResult | NotBroadcastResult | ErrorResult
