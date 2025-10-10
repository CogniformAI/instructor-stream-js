/**
 * Utilities to create AsyncIterables from JSONL files or lines, useful for tests or demos.
 *
 * Features:
 * - Reads JSONL line-by-line without loading the entire file into memory.
 * - Yields parsed JSON objects as an AsyncGenerator.
 * - Optional pacing to simulate tokens-per-second (TPS) or a fixed interval.
 * - Optional filtering and mapping per line/object.
 * - Tolerates SSE-style "data: {...}" lines by stripping the "data:" prefix.
 *
 * Examples:
 *
 * // 1) Stream a file at ~20–30 TPS
 * for await (const obj of replayJsonlFile('mock-data.jsonl')) {
 *   console.log(obj)
 * }
 *
 * // 2) Stream a selected window with a fixed interval between lines
 * for await (const obj of replayJsonlFile('mock-data.jsonl', {
 *   start: 100,
 *   end: 300,
 *   fixedIntervalMs: 10,
 * })) { ... }
 *
 * // 3) Stream from an in-memory array of lines
 * const lines = fs.readFileSync('mock-data.jsonl', 'utf8').split(/\r?\n/)
 * for await (const obj of replayFromLines(lines, { tpsMin: 15, tpsMax: 25 })) { ... }
 */

import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

export type JsonlReplayOptions = {
  /**
   * Inclusive start line index. Defaults to 0.
   */
  start?: number
  /**
   * Exclusive end line index. Defaults to lines.length.
   */
  end?: number

  /**
   * Minimum and maximum tokens-per-second. If provided (and fixedIntervalMs is not set),
   * a random TPS in [tpsMin, tpsMax] is chosen per line and converted to a delay.
   * Defaults: tpsMin=20, tpsMax=30.
   */
  tpsMin?: number
  tpsMax?: number

  /**
   * If set, overrides TPS pacing and uses a fixed millisecond delay between lines.
   */
  fixedIntervalMs?: number

  /**
   * If true (default), skip lines that are not valid JSON (after "data:" normalization).
   * If false, invalid JSON will throw.
   */
  ignoreInvalidJson?: boolean

  /**
   * Optional per-line filter before JSON parsing (after "data:" normalization).
   * Return false to skip the line.
   */
  filterLine?: (line: string, index: number) => boolean

  /**
   * Optional per-object filter after JSON parsing. Return false to skip the object.
   */
  filterObject?: (obj: unknown, index: number) => boolean

  /**
   * Optional mapper applied after JSON parsing and filtering.
   * Return the transformed object to yield downstream.
   */
  mapObject?: (obj: unknown, index: number) => unknown
}

/**
 * Replay a JSONL file as an AsyncGenerator of parsed JSON objects.
 * Supports TPS pacing or fixed intervals and common filters/mappers.
 */
export async function* replayJsonlFile(
  filePath: string,
  opts: JsonlReplayOptions = {}
): AsyncGenerator<unknown> {
  const {
    start = 0,
    end = Number.POSITIVE_INFINITY,
    fixedIntervalMs,
    tpsMin = 20,
    tpsMax = 30,
    ignoreInvalidJson = true,
    filterLine,
    filterObject,
    mapObject,
  } = opts

  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  let idx = -1
  for await (const raw of rl) {
    idx++
    if (idx < start) continue
    if (idx >= end) break

    const line = (raw ?? '').trim()
    if (!line) continue

    // Support SSE "data: {...}"
    const normalized = line.startsWith('data:') ? line.slice(5).trim() : line
    if (filterLine && !filterLine(normalized, idx)) continue

    let obj: unknown
    try {
      obj = JSON.parse(normalized)
    } catch {
      if (ignoreInvalidJson) continue
      throw new Error(`Invalid JSON at line ${idx}: ${normalized.slice(0, 120)}...`)
    }

    if (filterObject && !filterObject(obj, idx)) continue

    // pacing
    if (typeof fixedIntervalMs === 'number') {
      await delay(Math.max(0, fixedIntervalMs))
    } else {
      const tps = clamp(Math.floor(randomBetween(tpsMin, tpsMax)), 1, Number.MAX_SAFE_INTEGER)
      const ms = Math.floor(1000 / tps)
      if (ms > 0) await delay(ms)
    }

    yield mapObject ? mapObject(obj, idx) : obj
  }
}

/**
 * Replay from an array of JSONL lines (already loaded in memory).
 * Mirrors replayJsonlFile semantics.
 */
export async function* replayFromLines(
  lines: string[],
  opts: JsonlReplayOptions = {}
): AsyncGenerator<unknown> {
  const {
    start = 0,
    end = lines.length,
    fixedIntervalMs,
    tpsMin = 20,
    tpsMax = 30,
    ignoreInvalidJson = true,
    filterLine,
    filterObject,
    mapObject,
  } = opts

  const hi = Math.min(Math.max(0, end), lines.length)
  const lo = clamp(start, 0, hi)

  for (let idx = lo; idx < hi; idx++) {
    const raw = (lines[idx] ?? '').trim()
    if (!raw) continue

    const normalized = raw.startsWith('data:') ? raw.slice(5).trim() : raw
    if (filterLine && !filterLine(normalized, idx)) continue

    let obj: unknown
    try {
      obj = JSON.parse(normalized)
    } catch {
      if (ignoreInvalidJson) continue
      throw new Error(`Invalid JSON at index ${idx}: ${normalized.slice(0, 120)}...`)
    }

    if (filterObject && !filterObject(obj, idx)) continue

    if (typeof fixedIntervalMs === 'number') {
      await delay(Math.max(0, fixedIntervalMs))
    } else {
      const tps = clamp(Math.floor(randomBetween(tpsMin, tpsMax)), 1, Number.MAX_SAFE_INTEGER)
      const ms = Math.floor(1000 / tps)
      if (ms > 0) await delay(ms)
    }

    yield mapObject ? mapObject(obj, idx) : obj
  }
}

/**
 * Small helper to sleep.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

/**
 * Uniform random between [min, max].
 */
export function randomBetween(min: number, max: number): number {
  if (!isFinite(min) || !isFinite(max)) return min
  if (max < min) return min
  return Math.random() * (max - min) + min
}

/**
 * Clamp a number to [min, max].
 */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}
