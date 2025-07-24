import { describe, test, expect } from 'vitest'
import { getDeep, setDeep, type Indexable } from '../path.ts'

describe('path.ts', () => {
  describe('getDeep', () => {
    test('getDeep_shouldReturnValueForValidPath', () => {
      const obj = {
        a: {
          b: [{ c: 1 }, { c: 2 }],
        },
        d: 'test',
        e: null,
      }
      /** Test nested object access */
      expect(getDeep(obj, ['a', 'b', 0, 'c'])).toBe(1)
      expect(getDeep(obj, ['a', 'b', 1, 'c'])).toBe(2)
      /** Test direct property access */
      expect(getDeep(obj, ['d'])).toBe('test')
      expect(getDeep(obj, ['e'])).toBe(null)
      /** Test nested object access */
      expect(getDeep(obj, ['a', 'b'])).toEqual([{ c: 1 }, { c: 2 }])
      /** Test empty path (returns root object) */
      expect(getDeep(obj, [])).toBe(obj)
    })

    test('getDeep_shouldReturnUndefinedForInvalidPath', () => {
      const obj = {
        a: {
          b: [{ c: 1 }],
        },
      }
      /** Test non-existent keys */
      expect(getDeep(obj, ['a', 'x'])).toBeUndefined()
      expect(getDeep(obj, ['x', 'b'])).toBeUndefined()
      /** Test out of bounds array access */
      expect(getDeep(obj, ['a', 'b', 1])).toBeUndefined()
      expect(getDeep(obj, ['a', 'b', 10, 'c'])).toBeUndefined()
      /** Test accessing properties on primitive values */
      expect(getDeep(obj, ['a', 'b', 0, 'c', 'invalid'])).toBeUndefined()
      /** Test null/undefined input */
      expect(getDeep(null, ['a'])).toBeUndefined()
      expect(getDeep(undefined, ['a'])).toBeUndefined()
      /** Test accessing on non-object values */
      expect(getDeep('string', ['a'])).toBeUndefined()
      expect(getDeep(123, ['a'])).toBeUndefined()
    })
  })

  describe('setDeep', () => {
    test('setDeep_shouldSetValueForExistingPath', () => {
      const obj: Indexable = {
        a: {
          b: [{ c: 1 }],
        },
        d: 'test',
      }
      /** Update existing nested value */
      setDeep(obj, ['a', 'b', 0, 'c'], 42)
      expect(getDeep(obj, ['a', 'b', 0, 'c'])).toBe(42)
      /** Update existing direct property */
      setDeep(obj, ['d'], 'updated')
      expect(getDeep(obj, ['d'])).toBe('updated')
      /** Add new property to existing object */
      setDeep(obj, ['a', 'newProp'], 'new value')
      expect(getDeep(obj, ['a', 'newProp'])).toBe('new value')
      /** Verify original structure is maintained */
      const aObj = obj.a as Indexable
      expect(aObj.b as unknown).toEqual([{ c: 42 }])
    })

    test('setDeep_shouldCreateNestedObjectsAndArraysForNewPath', () => {
      const obj: Indexable = {}
      /** Create nested structure with array (numeric key creates array) */
      setDeep(obj, ['a', 0, 'b'], 'value1')
      expect(getDeep(obj, ['a', 0, 'b'])).toBe('value1')
      const aVal = obj.a as unknown
      expect(Array.isArray(aVal)).toBe(true)
      if (Array.isArray(aVal)) {
        expect(typeof aVal[0]).toBe('object')
      }
      /** Create nested structure with object (string key creates object) */
      setDeep(obj, ['x', 'y', 'z'], 'value2')
      expect(getDeep(obj, ['x', 'y', 'z'])).toBe('value2')
      expect(typeof obj.x).toBe('object')
      expect(Array.isArray(obj.x)).toBe(false)
      /** Create mixed structure (object -> array -> object) */
      setDeep(obj, ['mixed', 'arr', 0, 'nested'], 'mixed_value')
      expect(getDeep(obj, ['mixed', 'arr', 0, 'nested'])).toBe('mixed_value')
      const mixed = obj.mixed as Indexable
      expect(typeof mixed).toBe('object')
      expect(Array.isArray(mixed)).toBe(false)
      const arr = mixed.arr as unknown[]
      expect(Array.isArray(arr)).toBe(true)
      expect(typeof arr[0]).toBe('object')
      /** Test array creation with higher indices */
      const emptyObj: Indexable = {}
      setDeep(emptyObj, ['items', 2, 'name'], 'third_item')
      expect(getDeep(emptyObj, ['items', 2, 'name'])).toBe('third_item')
      const items = emptyObj.items as unknown[]
      expect(Array.isArray(items)).toBe(true)
      expect(items.length).toBe(3)
      expect(items[0]).toBeUndefined()
      expect(items[1]).toBeUndefined()
      expect(typeof items[2]).toBe('object')
      /** Test deep path creation */
      const deepObj: Indexable = {}
      setDeep(deepObj, ['level1', 'level2', 0, 'level3', 'level4'], 'deep_value')
      expect(getDeep(deepObj, ['level1', 'level2', 0, 'level3', 'level4'])).toBe('deep_value')
    })
  })
})
