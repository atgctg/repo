import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { isPlainObject } from 'shared'
import { tokens } from '~/styles/tokens.stylex'
import type { DetailBlock } from '~/lib/detail'
import { RichText } from '~/lib/text'
import { Icon } from './icons'

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    color: tokens.textSoft,
    minWidth: 0,
  },
  quote: {
    fontSize: tokens.textSm,
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
  },
  meta: {
    fontSize: tokens.textXs,
    color: tokens.textSoft,
  },
  error: {
    fontSize: '0.8125rem',
    color: tokens.danger,
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    width: 'fit-content',
    fontSize: tokens.textXs,
    lineHeight: 1.2,
    color: tokens.textMid,
  },
  swatch: {
    width: '0.875rem',
    height: '0.875rem',
    borderRadius: tokens.radiusPill,
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, currentColor 20%, transparent)',
  },
  figure: {
    display: 'block',
    width: '100%',
    borderRadius: '0.5rem',
    backgroundColor: tokens.bg,
  },
  frames: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem',
  },
  caption: {
    marginTop: '0.25rem',
    fontSize: tokens.textXs,
    color: tokens.muted,
  },
  refs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
    alignItems: 'center',
  },
  refImg: {
    width: '3rem',
    height: '4rem',
    objectFit: 'cover',
    borderRadius: '0.4rem',
  },
  groupLabel: {
    fontSize: '0.6875rem',
    fontWeight: 500,
    color: tokens.textMid,
    marginBottom: '0.25rem',
  },
  attrs: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  key: {
    fontSize: '0.6875rem',
    letterSpacing: '-0.01em',
    color: tokens.textMid,
    marginBottom: '0.125rem',
  },
  val: {
    fontSize: tokens.textXs,
    lineHeight: 1.35,
    color: tokens.textSoft,
    whiteSpace: 'pre-wrap',
    textWrap: 'pretty',
  },
  label: {
    fontSize: tokens.textXs,
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: tokens.textMid,
  },
})

function hideLabel(label: string): boolean {
  return label === '' || /^\d+$/.test(label)
}

function isScalar(value: unknown): boolean {
  return value === null || typeof value !== 'object'
}

function fieldText(value: unknown): string {
  if (Array.isArray(value))
    return value
      .filter((item) => item !== null && item !== '')
      .map(String)
      .join(', ')
  return String(value ?? '')
}

function AttrNode({
  label,
  value,
  level,
}: {
  label: string
  value: unknown
  level: number
}): ReactNode {
  if (Array.isArray(value) && value.every(isScalar))
    return <AttrField label={label} value={value} />
  const entries = isPlainObject(value)
    ? Object.entries(value)
    : Array.isArray(value)
      ? value.map((item, index) => [String(index), item] as [string, unknown])
      : null
  if (!entries || entries.length === 0) {
    if (!isScalar(value)) return null
    return <AttrField label={label} value={value} />
  }
  const kids = entries.map(([key, child]) => (
    <AttrNode key={key} label={key} value={child} level={level + 1} />
  ))
  if (level === 0) return kids
  const show = !hideLabel(label)
  return (
    <section {...stylex.props(styles.section)}>
      {show ? <h3 {...stylex.props(styles.label)}>{label}</h3> : null}
      {kids}
    </section>
  )
}

function AttrField({ label, value }: { label: string; value: unknown }): ReactNode {
  const text = fieldText(value)
  if (!text) return null
  const show = !hideLabel(label)
  return (
    <div>
      {show ? <div {...stylex.props(styles.key)}>{label}</div> : null}
      <div {...stylex.props(styles.val)}>{text}</div>
    </div>
  )
}

export function Blocks({ blocks }: { blocks: DetailBlock[] }): ReactNode {
  if (blocks.length === 0) return null
  return (
    <div data-detail="" {...stylex.props(styles.stack)}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}

function Block({ block }: { block: DetailBlock }): ReactNode {
  switch (block.type) {
    case 'quote':
      return (
        <p {...stylex.props(styles.quote)}>
          <RichText text={block.text} />
        </p>
      )
    case 'chip':
      return (
        <div {...stylex.props(styles.chip)}>
          <Icon name={block.icon} />
          <span>{block.text}</span>
        </div>
      )
    case 'meta':
      return <p {...stylex.props(styles.meta)}>{block.text}</p>
    case 'error':
      return <p {...stylex.props(styles.error)}>{block.text}</p>
    case 'swatch':
      return (
        <div {...stylex.props(styles.chip)}>
          <i {...stylex.props(styles.swatch)} style={{ backgroundColor: block.color }} />
          <span>{block.color}</span>
        </div>
      )
    case 'figure':
      return (
        <figure>
          <img src={block.url} alt="" {...stylex.props(styles.figure)} />
          {block.label ? (
            <figcaption {...stylex.props(styles.caption)}>{block.label}</figcaption>
          ) : null}
        </figure>
      )
    case 'frames':
      return (
        <div {...stylex.props(styles.frames)}>
          {block.items.map((item) => (
            <figure key={item.label}>
              <img src={item.url} alt="" {...stylex.props(styles.figure)} />
              <figcaption {...stylex.props(styles.caption)}>{item.label}</figcaption>
            </figure>
          ))}
        </div>
      )
    case 'refs':
      return (
        <div>
          <h3 {...stylex.props(styles.groupLabel)}>References</h3>
          <div {...stylex.props(styles.refs)}>
            {block.items.map((item) =>
              item.url ? (
                <img
                  key={item.label}
                  src={item.url}
                  alt={item.label}
                  title={item.label}
                  {...stylex.props(styles.refImg)}
                />
              ) : (
                <span key={item.label}>{item.label}</span>
              ),
            )}
          </div>
        </div>
      )
    case 'attrs':
      return (
        <div {...stylex.props(styles.attrs)}>
          <AttrNode label="" value={block.value} level={0} />
        </div>
      )
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}
