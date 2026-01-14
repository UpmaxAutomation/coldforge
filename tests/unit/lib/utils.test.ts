import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('utils', () => {
  describe('cn', () => {
    it('should merge single class', () => {
      expect(cn('text-red-500')).toBe('text-red-500')
    })

    it('should merge multiple classes', () => {
      expect(cn('text-red-500', 'bg-blue-500')).toBe('text-red-500 bg-blue-500')
    })

    it('should handle conditional classes', () => {
      expect(cn('base', true && 'included', false && 'excluded')).toBe('base included')
    })

    it('should handle undefined values', () => {
      expect(cn('base', undefined, 'end')).toBe('base end')
    })

    it('should handle null values', () => {
      expect(cn('base', null, 'end')).toBe('base end')
    })

    it('should handle empty string', () => {
      expect(cn('')).toBe('')
    })

    it('should handle no arguments', () => {
      expect(cn()).toBe('')
    })

    it('should merge conflicting Tailwind classes (last wins)', () => {
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    })

    it('should merge conflicting padding classes', () => {
      expect(cn('p-4', 'p-8')).toBe('p-8')
    })

    it('should merge conflicting margin classes', () => {
      expect(cn('m-2', 'm-4')).toBe('m-4')
    })

    it('should handle object syntax', () => {
      expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500')
    })

    it('should handle mixed inputs', () => {
      expect(
        cn('base', { conditional: true }, ['array-class'], undefined, null, 'end')
      ).toBe('base conditional array-class end')
    })

    it('should handle array of classes', () => {
      expect(cn(['class1', 'class2'])).toBe('class1 class2')
    })

    it('should handle nested arrays', () => {
      expect(cn(['class1', ['class2', 'class3']])).toBe('class1 class2 class3')
    })

    it('should properly merge flex direction classes', () => {
      expect(cn('flex-row', 'flex-col')).toBe('flex-col')
    })

    it('should properly merge width classes', () => {
      expect(cn('w-full', 'w-1/2')).toBe('w-1/2')
    })

    it('should properly merge height classes', () => {
      expect(cn('h-screen', 'h-auto')).toBe('h-auto')
    })

    it('should not merge unrelated classes', () => {
      expect(cn('text-red-500', 'bg-blue-500', 'p-4')).toBe('text-red-500 bg-blue-500 p-4')
    })

    it('should handle complex conditional logic', () => {
      const isActive = true
      const isDisabled = false
      const size = 'lg'

      expect(
        cn(
          'base-class',
          isActive && 'active',
          isDisabled && 'disabled',
          size === 'lg' && 'text-lg',
          size === 'sm' && 'text-sm'
        )
      ).toBe('base-class active text-lg')
    })

    it('should handle Tailwind arbitrary values', () => {
      expect(cn('top-[117px]', 'left-[calc(50%-4rem)]')).toBe('top-[117px] left-[calc(50%-4rem)]')
    })

    it('should handle hover and focus states', () => {
      expect(cn('hover:bg-red-500', 'hover:bg-blue-500')).toBe('hover:bg-blue-500')
    })

    it('should handle responsive prefixes', () => {
      expect(cn('md:text-lg', 'lg:text-xl')).toBe('md:text-lg lg:text-xl')
    })

    it('should handle dark mode classes', () => {
      expect(cn('dark:bg-gray-800', 'dark:bg-gray-900')).toBe('dark:bg-gray-900')
    })
  })
})
