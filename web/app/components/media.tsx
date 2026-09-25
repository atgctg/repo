import type { MouseEvent, ReactNode } from 'react'
import { Button } from '@base-ui/react/button'
import * as stylex from '@stylexjs/stylex'
import type { Scene, Story } from 'shared'
import { withClass } from '~/lib/sx'
import { captionLines, captionSize, RichText } from '~/lib/text'
import { portraitUrl, sceneAsset, sceneName } from '~/lib/view'
import { toggleVideo, toggleVoice } from '~/lib/playback'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'
import { Icon } from './icons'

const styles = stylex.create({
  caption: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
    fontWeight: 600,
    lineHeight: 1.1,
    letterSpacing: '-0.015em',
  },
  center: {
    alignItems: 'center',
    textAlign: 'center',
  },
  start: {
    alignItems: 'flex-start',
    textAlign: 'left',
  },
  lg: { fontSize: tokens.captionLg },
  md: { fontSize: tokens.captionMd },
  sm: { fontSize: tokens.captionSm },
  stage: { fontSize: tokens.captionStage },
  line: {
    margin: 0,
    width: '100%',
    whiteSpace: 'pre-wrap',
    textWrap: 'pretty',
  },
  speaker: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: tokens.textXs,
    fontWeight: 550,
  },
  speakerStage: {
    fontSize: tokens.textMd,
  },
  play: {
    position: 'relative',
    zIndex: 3,
    width: '3rem',
    height: '3rem',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radiusPill,
    color: tokens.onMedia,
    backgroundColor: 'transparent',
  },
  generate: {
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
    maxWidth: 'calc(100% - 2rem)',
  },
  fill: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    backgroundColor: tokens.chip,
  },
  stageMedia: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
})

export function Avatar({ name, url }: { name: string; url?: string }): ReactNode {
  const letter = [...name.trim()][0]?.toLocaleUpperCase() ?? ''
  return (
    <span {...stylex.props(ui.avatar)}>
      {url ? <img src={url} alt="" {...stylex.props(ui.avatarImg)} /> : letter}
    </span>
  )
}

export function Caption({
  scene,
  story,
  placement,
}: {
  scene: Extract<Scene, { type: 'dialogue' }>
  story: Story
  placement: 'card' | 'stage'
}): ReactNode {
  const lines = captionLines(scene.caption)
  const speaker = scene.speaker?.trim() ?? ''
  if (lines.length === 0 && !speaker) return null
  const size = captionSize(lines)
  return (
    <div
      {...stylex.props(
        styles.caption,
        placement === 'stage' ? styles.center : styles.start,
      )}
    >
      {lines.length > 0 ? (
        <div
          {...stylex.props(
            placement === 'stage' && styles.stage,
            placement === 'card' && size === 'lg' && styles.lg,
            placement === 'card' && size === 'md' && styles.md,
            placement === 'card' && size === 'sm' && styles.sm,
          )}
        >
          {lines.map((line, index) => (
            <p key={index} {...stylex.props(styles.line)}>
              <RichText text={line} />
            </p>
          ))}
        </div>
      ) : null}
      {speaker ? (
        <div
          {...stylex.props(styles.speaker, placement === 'stage' && styles.speakerStage)}
        >
          <Avatar name={speaker} url={portraitUrl(story, speaker)} />
          <span>{speaker}</span>
        </div>
      ) : null}
    </div>
  )
}

function findVideo(node: HTMLElement): HTMLVideoElement | null {
  let current: HTMLElement | null = node.parentElement
  while (current) {
    const video = current.querySelector('video')
    if (video instanceof HTMLVideoElement) return video
    current = current.parentElement
  }
  return null
}

function enterFullscreen(event: { currentTarget: HTMLVideoElement }): void {
  const video = event.currentTarget
  if (document.fullscreenElement) void document.exitFullscreen()
  else void video.requestFullscreen()
}

export function PlayButton({
  audio,
  owner,
}: {
  audio?: string
  owner: string
}): ReactNode {
  return (
    <Button
      type="button"
      aria-label="Play"
      {...stylex.props(styles.play)}
      onClick={(event) => {
        event.stopPropagation()
        const video = findVideo(event.currentTarget)
        if (video) toggleVideo(video)
        else if (audio) toggleVoice(owner, audio)
      }}
    >
      <Icon name="play" size="lg" />
    </Button>
  )
}

export function Media({
  url,
  video = false,
}: {
  url?: string
  video?: boolean
}): ReactNode {
  if (!url) return null
  if (video)
    return (
      <video
        src={url}
        playsInline
        preload="metadata"
        {...stylex.props(styles.fill)}
        onDoubleClick={enterFullscreen}
      />
    )
  return <img src={url} alt="" {...stylex.props(styles.fill)} />
}

export function StageMedia({
  url,
  video = false,
  color,
}: {
  url?: string
  video?: boolean
  color?: string
}): ReactNode {
  if (video && url)
    return (
      <video
        src={url}
        playsInline
        preload="metadata"
        {...stylex.props(styles.stageMedia)}
        style={{ backgroundColor: color }}
        onDoubleClick={enterFullscreen}
      />
    )
  if (url)
    return (
      <img
        src={url}
        alt=""
        {...stylex.props(styles.stageMedia)}
        style={{ backgroundColor: color }}
      />
    )
  return (
    <div
      {...stylex.props(styles.stageMedia)}
      style={{ backgroundColor: color ?? '#111' }}
    />
  )
}

const tileStyles = stylex.create({
  scene: {
    borderRadius: tokens.radiusScene,
    padding: 0,
    containerType: 'inline-size',
    transitionProperty: 'border-radius',
    transitionDuration: '60ms',
    transitionTimingFunction: 'ease-out',
  },
  sceneOn: {
    borderRadius: `calc(${tokens.radiusScene} + ${tokens.ringWidth} + ${tokens.ringGap})`,
  },
  sceneBody: {
    padding: '1rem 1.25rem',
  },
  hit: {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    padding: 0,
    backgroundColor: 'transparent',
  },
  inert: {
    pointerEvents: 'none',
  },
  live: {
    pointerEvents: 'auto',
    zIndex: 4,
  },
  footer: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    zIndex: 4,
    width: '100%',
    margin: 0,
    padding: '0.75rem 1rem',
    pointerEvents: 'none',
  },
  face: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: tokens.radiusScene,
    transitionProperty: 'inset',
    transitionDuration: '60ms',
    transitionTimingFunction: 'ease-out',
  },
  faceOn: {
    inset: `calc(${tokens.ringWidth} + ${tokens.ringGap})`,
  },
  captionLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 4,
    pointerEvents: 'none',
    transformOrigin: 'center',
    transform: 'scale(1)',
    transitionProperty: 'transform',
    transitionDuration: '60ms',
    transitionTimingFunction: 'ease-out',
  },
  captionOn: {
    transform: `scale(calc((100cqw - 2 * (${tokens.ringWidth} + ${tokens.ringGap})) / 100cqw))`,
  },
  ring: {
    position: 'absolute',
    inset: 0,
    zIndex: 5,
    borderRadius: 'inherit',
    borderWidth: tokens.ringWidth,
    borderStyle: 'solid',
    borderColor: tokens.ring,
    pointerEvents: 'none',
    backgroundColor: 'transparent',
  },
})

export function Tile({
  title,
  image,
  selected = false,
  plain = false,
  blurred = false,
  heavy = false,
  scene = false,
  video = false,
  onClick,
  mark,
  children,
  footer,
  action,
}: {
  title?: string
  image?: string
  selected?: boolean
  plain?: boolean
  blurred?: boolean
  heavy?: boolean
  scene?: boolean
  video?: boolean
  onClick?: (event: MouseEvent<HTMLElement>) => void
  mark?: number
  children?: ReactNode
  footer?: ReactNode
  action?: ReactNode
}): ReactNode {
  const media = Boolean(image) && !plain
  const frame = stylex.props(
    ui.card,
    scene && tileStyles.scene,
    scene && selected && tileStyles.sceneOn,
    !image && ui.cardEmpty,
    media && !blurred && ui.cardMedia,
    onClick && ui.cardButton,
  )
  const body = (
    <>
      {image ? (
        video ? (
          <video
            src={image}
            playsInline
            preload="metadata"
            {...stylex.props(
              ui.cardImg,
              blurred && (heavy ? ui.cardImgHeavy : ui.cardImgBlur),
            )}
            onDoubleClick={enterFullscreen}
          />
        ) : (
          <img
            src={image}
            alt=""
            {...stylex.props(
              ui.cardImg,
              blurred && (heavy ? ui.cardImgHeavy : ui.cardImgBlur),
            )}
          />
        )
      ) : null}
      {media && !blurred ? <div {...stylex.props(ui.scrim)} /> : null}
      {blurred && !heavy ? <div {...stylex.props(ui.scrim, ui.scrimFlat)} /> : null}
      {heavy ? <div {...stylex.props(ui.scrim, ui.scrimHeavy)} /> : null}
      <div
        {...stylex.props(
          ui.cardBody,
          scene && tileStyles.sceneBody,
          onClick && tileStyles.inert,
        )}
      >
        {title ? (
          <div {...stylex.props(ui.cardTitle, (plain || blurred) && ui.cardTitlePlain)}>
            {title}
          </div>
        ) : null}
        {children}
        {footer && !scene ? (
          <div {...stylex.props(tileStyles.footer)}>{footer}</div>
        ) : null}
      </div>
      {action ? <div {...stylex.props(tileStyles.live)}>{action}</div> : null}
    </>
  )
  return (
    <div
      {...withClass(frame, 'squircle')}
      {...(mark !== undefined ? { 'data-scene': mark } : {})}
    >
      {onClick ? (
        <Button
          type="button"
          aria-label={title ?? 'Open'}
          {...stylex.props(tileStyles.hit)}
          onClick={onClick}
        />
      ) : null}
      {scene ? (
        <div
          {...withClass(
            stylex.props(tileStyles.face, selected && tileStyles.faceOn),
            'squircle',
          )}
        >
          {body}
        </div>
      ) : (
        body
      )}
      {scene && footer ? (
        <div {...stylex.props(tileStyles.captionLayer, selected && tileStyles.captionOn)}>
          <div {...stylex.props(tileStyles.footer)}>{footer}</div>
        </div>
      ) : null}
      {scene && selected ? (
        <span {...withClass(stylex.props(tileStyles.ring), 'squircle')} />
      ) : null}
    </div>
  )
}

export function sceneImage(story: Story, scene: Scene): string | undefined {
  return sceneAsset(story, scene)?.url
}

export function sceneTitle(scene: Scene): string | undefined {
  if (scene.type === 'dialogue' || scene.type === 'message') return undefined
  return sceneName(scene)
}
