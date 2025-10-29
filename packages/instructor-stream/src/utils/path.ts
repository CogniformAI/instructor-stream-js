/**
 * Lightweight imperative helpers to replace Ramda's lensPath / set / view.
 * These functions mutate the target object in-place for performance.
 * @todo: These will be replacing Ramda's lensPath / set / view for performance
 */

export type Path = (string | number | undefined)[]

/**
 * Represents an Object/array that can be accessed by either string or numeric keys.
 * Using `unknown` rather than `any` to keep type-safety while still allowing
 * deep indexing. We purposefully avoid `any` so that values returned from these
 * helpers remain typed as `unknown`, forcing callers to narrow the result.
 */
export interface Indexable {
  [key: string]: unknown
  [key: number]: unknown
}

/**
 * Retrieves the value located at the specified path within a nested object or array.
 *
 * This function traverses the provided object or array using the keys in the path array,
 * returning the value found at the end of the path. If any part of the path is invalid
 * (i.e., an undefined or non-object value is encountered before reaching the end), the
 * function returns undefined.
 *
 * @param obj - The root object or array to traverse.
 * @param path - An array of keys representing the path to the desired value.
 * @returns The value located at the specified path, or undefined if the path is invalid.
 */
export function getDeep(obj: unknown, path: Path): unknown {
  let current: unknown = obj
  for (const key of path) {
    if (key === undefined) {
      return undefined
    }
    if (current == null || typeof current !== 'object') {
      return undefined
    }
    /** Safe cast – at this point we know `current` is an object/array. */
    current = (current as Indexable)[key]
  }
  return current
}

/**
 * Sets a value at a specified path within a nested object or array structure.
 * The function traverses the path, creating intermediate objects or arrays
 * as necessary, and sets the final key to the provided value.
 *
 * @param obj - The target object or array to modify.
 * @param path - An array of keys representing the path to the value.
 * @param value - The value to set at the specified path.
 */
export function setDeep(obj: Indexable, path: Path, value: unknown): void {
  if (path.length === 0) {
    return
  }
  let current: Indexable = obj as Indexable
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    const nextKey = path[i + 1]
    if (key === undefined || nextKey === undefined) {
      return
    }
    if ((current as Indexable)[key] == null) {
      /** Decide container type based on next key */
      ;(current as Indexable)[key] = typeof nextKey === 'number' ? [] : {}
    }
    current = (current as Indexable)[key] as Indexable
  }
  const lastKey = path[path.length - 1]
  if (lastKey === undefined) {
    return
  }
  ;(current as Indexable)[lastKey] = value
}
