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
  start: {
    alignItems: 'flex-start',
    textAlign: 'left',
  },
  lg: { fontSize: tokens.captionLg },
  md: { fontSize: tokens.captionMd },
  sm: { fontSize: tokens.captionSm },
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
  speakerHold: {
    width: '1.5rem',
    height: '1.5rem',
    flex: 'none',
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
  fill: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    backgroundColor: tokens.chip,
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

function CaptionLines({ lines }: { lines: string[] }): ReactNode {
  const size = captionSize(lines)
  return (
    <div
      {...stylex.props(
        size === 'lg' && styles.lg,
        size === 'md' && styles.md,
        size === 'sm' && styles.sm,
      )}
    >
      {lines.map((line, index) => (
        <p key={index} {...stylex.props(styles.line)}>
          <RichText text={line} />
        </p>
      ))}
    </div>
  )
}

export function MessageCaption({ text }: { text: string }): ReactNode {
  const lines = captionLines(text)
  if (lines.length === 0) return null
  return (
    <div {...stylex.props(styles.caption, styles.start)}>
      <CaptionLines lines={lines} />
    </div>
  )
}

export function Caption({
  scene,
  story,
}: {
  scene: Extract<Scene, { type: 'dialogue' }>
  story: Story
}): ReactNode {
  const lines = captionLines(scene.caption)
  const speaker = scene.speaker?.trim() ?? ''
  if (lines.length === 0 && !speaker) return null
  return (
    <div {...stylex.props(styles.caption, styles.start)}>
      {lines.length > 0 ? <CaptionLines lines={lines} /> : null}
      <div {...stylex.props(styles.speaker)}>
        {speaker ? (
          <>
            <Avatar name={speaker} url={portraitUrl(story, speaker)} />
            <span>{speaker}</span>
          </>
        ) : (
          <span {...stylex.props(styles.speakerHold)} />
        )}
      </div>
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

const blurLayers = stylex.create({
  stack: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
  },
  base: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  veil: {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    pointerEvents: 'none',
    maskImage: 'linear-gradient(to top, black 30%, transparent 55%)',
    WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 55%)',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
  },
  copy: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: 'blur(24px)',
    transform: 'scale(1.12)',
  },
  shade: {
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    pointerEvents: 'none',
    backgroundImage:
      'linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 0.06) 38%, rgb(0 0 0 / 0.62) 100%)',
  },
})

export function ProgressiveMedia({ url }: { url: string }): ReactNode {
  return (
    <div {...stylex.props(blurLayers.stack)}>
      <img src={url} alt="" {...stylex.props(blurLayers.base)} />
      <div {...stylex.props(blurLayers.veil)}>
        <img src={url} alt="" {...stylex.props(blurLayers.copy)} />
      </div>
      <div {...stylex.props(blurLayers.shade)} />
    </div>
  )
}

const tileStyles = stylex.create({
  scene: {
    borderRadius: tokens.radiusScene,
    padding: 0,
    containerType: 'inline-size',
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
  },
  faceOn: {
    inset: `calc(${tokens.ringWidth} + ${tokens.ringGap})`,
  },
  captionLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 6,
    pointerEvents: 'none',
    transformOrigin: 'center',
    transform: 'scale(1)',
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
  blurred = false,
  progressive = false,
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
  blurred?: boolean
  progressive?: boolean
  scene?: boolean
  video?: boolean
  onClick?: (event: MouseEvent<HTMLElement>) => void
  mark?: number
  children?: ReactNode
  footer?: ReactNode
  action?: ReactNode
}): ReactNode {
  const media = Boolean(image)
  const sharp = media && !blurred
  const washed = sharp || (progressive && media)
  const frame = stylex.props(
    ui.card,
    scene && tileStyles.scene,
    scene && selected && tileStyles.sceneOn,
    !image && ui.cardEmpty,
    washed && ui.cardMedia,
    onClick && ui.cardButton,
  )
  const body = (
    <>
      {image && progressive ? <ProgressiveMedia url={image} /> : null}
      {image && !progressive ? (
        video ? (
          <video
            src={image}
            playsInline
            preload="metadata"
            {...stylex.props(ui.cardImg, blurred && ui.cardImgBlur)}
            onDoubleClick={enterFullscreen}
          />
        ) : (
          <img
            src={image}
            alt=""
            {...stylex.props(ui.cardImg, blurred && ui.cardImgBlur)}
          />
        )
      ) : null}
      {washed && !progressive ? <div {...stylex.props(ui.scrim)} /> : null}
      {blurred && !progressive ? <div {...stylex.props(ui.scrim, ui.scrimFlat)} /> : null}
      <div
        {...stylex.props(
          ui.cardBody,
          scene && tileStyles.sceneBody,
          onClick && tileStyles.inert,
        )}
      >
        {title ? (
          <div {...stylex.props(ui.cardTitle, blurred && ui.cardTitlePlain)}>{title}</div>
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
