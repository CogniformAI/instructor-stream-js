/**
 * This file has been modified -  but the majority pulled directly from
 *  https://www.npmjs.com/package/@streamparser/json
 *  https://github.com/juanjoDiaz/streamparser-json
 *
 *  Copyright (c) 2020 Juanjo Diaz
 *  https://github.com/juanjoDiaz
 *
 */

export interface StringBuilder {
  byteLength: number
  appendChar: (char: number) => void
  appendBuf: (buf: Uint8Array, start?: number, end?: number) => void
  reset: () => void
  toString: () => string
}

export class NonBufferedString implements StringBuilder {
  private decoder = new TextDecoder('utf-8')
  private assembled = ''
  private readonly onIncrementalString?: (str: string) => void

  public byteLength = 0

  /**
   * Constructs a new NonBufferedString instance.
   *
   * @param {Object} param0 - An object containing optional parameters.
   * @param {(str: string) => void} [param0.onIncrementalString] - A callback function that is called with the incremental string updates.
   */

  constructor({ onIncrementalString }: { onIncrementalString?: (str: string) => void }) {
    this.onIncrementalString = onIncrementalString ?? undefined
  }

  public appendChar(char: number): void {
    this.assembled += String.fromCharCode(char)
    this.byteLength += 1
    this.update()
  }

  public appendBuf(buf: Uint8Array, start = 0, end: number = buf.length): void {
    const chunk = this.decoder.decode(buf.subarray(start, end))
    this.assembled += chunk
    this.byteLength += end - start
    this.update()
  }

  private update(): void {
    if (this.onIncrementalString) {
      /** Emit the full string-so-far without extra joins */
      this.onIncrementalString(this.assembled)
    }
  }

  public reset(): void {
    this.assembled = ''
    this.byteLength = 0
  }

  public toString(): string {
    return this.assembled
  }
}

export class BufferedString implements StringBuilder {
  private decoder = new TextDecoder('utf-8')
  private readonly buffer: Uint8Array
  private bufferOffset = 0
  private string = ''
  private readonly onIncrementalString?: (str: string) => void

  public byteLength = 0

  public constructor(bufferSize: number, onIncrementalString?: (str: string) => void) {
    this.buffer = new Uint8Array(bufferSize)
    this.onIncrementalString = onIncrementalString ?? undefined
  }

  public appendChar(char: number): void {
    if (this.bufferOffset >= this.buffer.length) {
      this.flushStringBuffer()
    }
    this.buffer[this.bufferOffset++] = char
    this.byteLength++
  }

  public appendBuf(buf: Uint8Array, start = 0, end: number = buf.length): void {
    const size = end - start
    if (this.bufferOffset + size > this.buffer.length) {
      this.flushStringBuffer()
    }

    this.buffer.set(buf.subarray(start, end), this.bufferOffset)
    this.bufferOffset += size
    this.byteLength += size
  }

  private flushStringBuffer(): void {
    this.string += this.decoder.decode(this.buffer.subarray(0, this.bufferOffset))
    this.bufferOffset = 0
    this.update()
  }

  private update(): void {
    if (this.onIncrementalString) {
      /** Avoid re-entrant flushes; emit the accumulated string directly */
      this.onIncrementalString(this.string)
    }
  }

  public reset(): void {
    this.string = ''
    this.bufferOffset = 0
    this.byteLength = 0
  }
  public toString(): string {
    /**  Flush without notifying to avoid emitting an extra partial update */
    this.string += this.decoder.decode(this.buffer.subarray(0, this.bufferOffset))
    this.bufferOffset = 0
    return this.string
  }
}
