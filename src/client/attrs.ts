import { isPlainObject } from '@/records'
import { escapeHtml } from './html'

function hideAttrLabel(label: string): boolean {
  return label === '' || /^\d+$/.test(label)
}

function isScalar(value: unknown): boolean {
  return value === null || typeof value !== 'object'
}

function attrEntries(value: unknown): [string, unknown][] | null {
  if (isPlainObject(value)) return Object.entries(value)
  if (Array.isArray(value)) return value.map((item, i) => [String(i), item])
  return null
}

function fieldText(value: unknown): string {
  if (Array.isArray(value))
    return value
      .filter((item) => item !== null && item !== '')
      .map(String)
      .join(', ')
  return String(value ?? '')
}

function renderAttrField(label: string, value: unknown): string {
  const text = fieldText(value)
  if (!text) return ''
  const showLabel = !hideAttrLabel(label)
  return `<div class="attr-field">${
    showLabel ? `<div class="attr-key">${escapeHtml(label)}</div>` : ''
  }<div class="attr-val">${escapeHtml(text)}</div></div>`
}

function renderAttrNode(label: string, value: unknown, level: number): string {
  if (Array.isArray(value) && value.every(isScalar)) return renderAttrField(label, value)

  const entries = attrEntries(value)
  if (!entries || entries.length === 0) {
    if (!isScalar(value)) return ''
    return renderAttrField(label, value)
  }

  const kids = entries
    .map(([key, child]) => renderAttrNode(key, child, level + 1))
    .filter(Boolean)
    .join('')
  if (!kids) return ''
  if (level === 0) return kids

  const showLabel = !hideAttrLabel(label)
  return `<section class="attr-section">${
    showLabel ? `<h3 class="attr-label">${escapeHtml(label)}</h3>` : ''
  }${kids}</section>`
}

export function renderAttrs(attributes: Record<string, unknown>): string {
  const inner = renderAttrNode('', attributes, 0)
  if (!inner) return ''
  return `<div class="attrs">${inner}</div>`
}
