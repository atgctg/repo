import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Button } from '@base-ui/react/button'
import { Slider } from '@base-ui/react/slider'
import * as stylex from '@stylexjs/stylex'
import type { Card, Scene, Story } from 'shared'
import { Blocks } from './blocks'
import { Icon } from './icons'
import {
  Caption,
  MessageCaption,
  PlayButton,
  Tile,
  sceneImage,
  sceneTitle,
} from './media'
import { useMountEffect } from '~/hooks/use-mount-effect'
import { canGenerate, findAsset, sceneAsset, speechSrc } from '~/lib/view'
import { selectScene, useActivity, useGenerateAsset, useStoryUi } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'

const styles = stylex.create({
  stage: {
    height: '100%',
    minHeight: 0,
    overflow: 'auto',
    containerType: 'inline-size',
    containerName: 'stage',
    padding: '0.25rem 0.15rem',
  },
  play: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    zIndex: 3,
    transform: 'translate(-50%, -50%)',
  },
  attrs: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
  },
  float: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    zIndex: 3,
    transform: 'translate(-50%, -50%)',
    padding: '0.5rem 0.75rem',
    borderRadius: tokens.radiusPill,
    backgroundColor: tokens.bg,
    color: tokens.text,
    fontSize: tokens.textSm,
    lineHeight: 1.2,
  },
  home: {
    minHeight: '100dvh',
    padding: '1.25rem 0.75rem 1.25rem 0.15rem',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  frame: {
    position: 'relative',
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
  scroller: {
    height: '100%',
    minHeight: 0,
    overflow: 'auto',
    padding: '3.25rem 0.15rem 0.25rem',
  },
  size: {
    position: 'absolute',
    top: '0.75rem',
    left: '0.15rem',
    zIndex: 6,
    display: 'flex',
    alignItems: 'center',
    width: '2.25rem',
    height: '2.25rem',
    cursor: 'pointer',
  },
  sizeOpen: {
    width: '15rem',
    cursor: 'ew-resize',
  },
  sizeDrag: {
    cursor: 'grab',
  },
  sizeIcon: {
    width: '2.25rem',
    height: '2.25rem',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    borderRadius: tokens.radiusPill,
    color: tokens.text,
    backgroundColor: tokens.bg,
    cursor: 'pointer',
  },
  sizeIconHidden: {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
  },
  slider: {
    width: '100%',
    height: '2.25rem',
    cursor: 'inherit',
  },
  sliderHidden: {
    display: 'none',
  },
  control: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    cursor: 'inherit',
  },
  track: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: tokens.radiusPill,
    backgroundColor: tokens.chip,
    cursor: 'inherit',
  },
  thumb: {
    width: '2px',
    height: '1.25rem',
    padding: 0,
    borderWidth: 0,
    borderRadius: 0,
    boxShadow: 'none',
    backgroundColor: tokens.text,
    zIndex: 1,
    cursor: 'inherit',
  },
})

const SIZE_KEY = 'storyboard.size'
const DEFAULT_SIZE = 19

function readSize(): number {
  const raw = localStorage.getItem(SIZE_KEY)
  if (raw === null || raw === '') return DEFAULT_SIZE
  const next = Number(raw)
  if (!Number.isFinite(next)) return DEFAULT_SIZE
  return Math.min(100, Math.max(0, next))
}

function boardMin(size: number): string {
  return `${11 + (size / 100) * 29}rem`
}

export function Storyboard({ story }: { story: Story }): ReactNode {
  const uiState = useStoryUi(story.id)
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [open, setOpen] = useState(false)
  const [grab, setGrab] = useState(false)
  const dragging = useRef(false)
  const sizeRoot = useRef<HTMLDivElement>(null)
  useMountEffect(() => {
    setSize(readSize())
  })
  function onSize(next: number): void {
    setSize(next)
    localStorage.setItem(SIZE_KEY, String(next))
  }
  function finishDrag(): void {
    if (!dragging.current) return
    dragging.current = false
    setGrab(false)
    document.body.style.cursor = ''
    if (!sizeRoot.current?.matches(':hover')) setOpen(false)
  }
  function onSizeDown(event: PointerEvent<HTMLDivElement>): void {
    if (!open) return
    dragging.current = true
    setGrab(true)
    document.body.style.cursor = 'grab'
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const wide = open || grab
  return (
    <div aria-label="Storyboard" {...stylex.props(styles.frame)}>
      <div {...stylex.props(styles.scroller)}>
        {story.scenes.length === 0 ? (
          <p {...stylex.props(ui.muted)}>No scenes</p>
        ) : (
          <div
            className="storyboard"
            style={
              {
                '--board': boardMin(size),
              } as CSSProperties & Record<'--board', string>
            }
          >
            {story.scenes.map((scene, index) => (
              <SceneTile
                key={`${scene.event}-${index}`}
                story={story}
                scene={scene}
                index={index}
                selected={uiState.selected.includes(index)}
              />
            ))}
          </div>
        )}
      </div>
      <div
        ref={sizeRoot}
        {...stylex.props(styles.size, wide && styles.sizeOpen, grab && styles.sizeDrag)}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => {
          if (!dragging.current) setOpen(false)
        }}
        onPointerDown={onSizeDown}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <Button
          type="button"
          aria-label="Storyboard size"
          aria-expanded={wide}
          tabIndex={wide ? -1 : 0}
          {...stylex.props(styles.sizeIcon, wide && styles.sizeIconHidden)}
        >
          <Icon name="grid" />
        </Button>
        <Slider.Root
          value={size}
          min={0}
          max={100}
          step={1}
          thumbAlignment="edge"
          onValueChange={onSize}
          onValueCommitted={finishDrag}
          {...stylex.props(styles.slider, !wide && styles.sliderHidden)}
        >
          <Slider.Control {...stylex.props(styles.control)}>
            <Slider.Track {...stylex.props(styles.track)}>
              <Slider.Thumb
                aria-label="Storyboard size"
                {...stylex.props(styles.thumb)}
              />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
      </div>
    </div>
  )
}

function SceneTile({
  story,
  scene,
  index,
  selected,
}: {
  story: Story
  scene: Scene
  index: number
  selected: boolean
}): ReactNode {
  const asset = sceneAsset(story, scene)
  if (scene.type === 'message') {
    return (
      <Tile
        scene
        image={sceneImage(story, scene)}
        progressive
        mark={index}
        selected={selected}
        onClick={(event) => selectScene(story.id, index, event.shiftKey)}
        footer={scene.text ? <MessageCaption text={scene.text} /> : null}
      />
    )
  }
  const audio =
    scene.type === 'dialogue' ? speechSrc(story, scene.speech?.key) : undefined
  const showPlay = scene.type === 'video' ? Boolean(asset?.url) : Boolean(audio)
  const generate =
    canGenerate(asset) && asset ? (
      <GenerateButton
        storyId={story.id}
        name={asset.name}
        type={asset.type}
        label="Generate"
        floating
      />
    ) : null
  const play = showPlay ? (
    <div {...stylex.props(styles.play)}>
      <PlayButton owner={`${story.id}:${index}`} audio={audio} />
    </div>
  ) : null
  return (
    <Tile
      scene
      image={sceneImage(story, scene)}
      video={scene.type === 'video'}
      title={sceneTitle(scene)}
      mark={index}
      selected={selected}
      onClick={(event) => selectScene(story.id, index, event.shiftKey)}
      action={
        <>
          {generate}
          {play}
        </>
      }
      footer={scene.type === 'dialogue' ? <Caption scene={scene} story={story} /> : null}
    />
  )
}

export function CardGrid({ story }: { story: Story }): ReactNode {
  if (story.cards.length === 0)
    return (
      <div {...stylex.props(styles.stage)}>
        <p {...stylex.props(ui.muted)}>no cards</p>
      </div>
    )
  return (
    <div {...stylex.props(styles.stage)}>
      <div className="tile-grid loose">
        {story.cards.map((card) => (
          <CardTile key={card.name} story={story} card={card} />
        ))}
      </div>
    </div>
  )
}

function CardTile({ story, card }: { story: Story; card: Card }): ReactNode {
  const cover = findAsset(story.assets, card.cover)
  const attrs = {
    ...(card.voice ? { Voice: card.voice } : {}),
    ...card.attributes,
  }
  const hasAttrs = Object.keys(attrs).length > 0
  return (
    <Tile
      image={cover?.url}
      title={card.name}
      blurred={hasAttrs && Boolean(cover?.url)}
      action={
        canGenerate(cover) && cover ? (
          <GenerateButton
            storyId={story.id}
            name={cover.name}
            type={cover.type}
            label="Generate"
            floating
          />
        ) : null
      }
    >
      {hasAttrs ? (
        <div {...stylex.props(styles.attrs)}>
          <Blocks blocks={[{ type: 'attrs', value: attrs }]} />
        </div>
      ) : null}
    </Tile>
  )
}

export function GenerateButton({
  storyId,
  name,
  type,
  label,
  floating = false,
}: {
  storyId: string
  name: string
  type: 'image' | 'video'
  label: string
  floating?: boolean
}): ReactNode {
  const busy = useActivity(storyId).imageName === name
  const generateAsset = useGenerateAsset()
  return (
    <Button
      type="button"
      disabled={busy}
      focusableWhenDisabled
      {...stylex.props(floating ? styles.float : ui.pill)}
      onClick={(event) => {
        event.stopPropagation()
        generateAsset(storyId, name, type)
      }}
    >
      {floating ? null : <Icon name="refresh" />}
      <span>{busy ? 'Generating…' : label}</span>
    </Button>
  )
}

export function HomeSections({
  worlds,
  onOpenWorld,
}: {
  worlds: { id: string; title: string; image?: string }[]
  onOpenWorld: (id: string) => void
}): ReactNode {
  return (
    <div {...stylex.props(styles.stage, styles.home)}>
      <section {...stylex.props(styles.section)}>
        {worlds.length === 0 ? <p {...stylex.props(ui.muted)}>no worlds</p> : null}
        <div className="tile-grid">
          {worlds.map((item) => (
            <Tile
              key={item.id}
              title={item.title}
              image={item.image}
              onClick={() => onOpenWorld(item.id)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
