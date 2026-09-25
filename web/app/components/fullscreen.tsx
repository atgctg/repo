import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import type { Scene, Story } from 'shared'
import { Composer } from './composer'
import { Icon } from './icons'
import { Caption, PlayButton, StageMedia } from './media'
import { sceneAsset, speechSrc } from '~/lib/view'
import { stepScene, useStoryUi } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'

const styles = stylex.create({
  stage: {
    position: 'relative',
    height: '100dvh',
    overflow: 'hidden',
    backgroundColor: '#000000',
    color: tokens.onMedia,
  },
  layer: {
    position: 'absolute',
    inset: 0,
  },
  leaving: {
    animationName: stylex.keyframes({
      to: { opacity: 0 },
    }),
    animationDuration: '280ms',
    animationTimingFunction: 'ease',
    animationFillMode: 'forwards',
  },
  caption: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    padding: '12vh 12vw 0',
    pointerEvents: 'none',
    color: tokens.onMedia,
    textShadow: tokens.shadow,
  },
  play: {
    position: 'absolute',
    inset: 0,
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'none',
  },
  hit: {
    pointerEvents: 'auto',
  },
  ticks: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.75rem 1rem 1rem',
  },
  tick: {
    width: '0.4rem',
    height: '0.4rem',
    padding: 0,
    borderRadius: tokens.radiusPill,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  tickOn: {
    width: '1.25rem',
    backgroundColor: '#ffffff',
  },
  back: {
    position: 'absolute',
    top: '0.75rem',
    left: '0.75rem',
    zIndex: 6,
    color: tokens.onMedia,
  },
  edge: {
    position: 'absolute',
    top: 0,
    bottom: '9rem',
    width: '20%',
    zIndex: 4,
    backgroundColor: 'transparent',
  },
  edgeLeft: { left: 0 },
  edgeRight: { right: 0 },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

function Frame({ story, scene }: { story: Story; scene: Scene }): ReactNode {
  const asset = sceneAsset(story, scene)
  const audio =
    scene.type === 'dialogue' ? speechSrc(story, scene.speech?.key) : undefined
  const showPlay = scene.type === 'video' ? Boolean(asset?.url) : Boolean(audio)
  return (
    <>
      <StageMedia
        url={asset?.url}
        video={scene.type === 'video'}
        color={asset?.dominantColor}
      />
      {showPlay ? (
        <div {...stylex.props(styles.play)}>
          <div {...stylex.props(styles.hit)}>
            <PlayButton owner={`${story.id}:stage:${scene.event}`} audio={audio} />
          </div>
        </div>
      ) : null}
    </>
  )
}

export function Fullscreen({ story }: { story: Story }): ReactNode {
  const uiState = useStoryUi(story.id)
  const count = story.scenes.length
  const index = count === 0 ? 0 : Math.min(uiState.sceneIndex, count - 1)
  const [visual, setVisual] = useState<{ current: number; leaving: number | null }>({
    current: index,
    leaving: null,
  })
  if (visual.current !== index) {
    setVisual({ current: index, leaving: visual.current })
  }
  const scene = story.scenes[index]
  const leaving = visual.leaving !== null ? story.scenes[visual.leaving] : undefined
  return (
    <div {...stylex.props(styles.stage)}>
      {leaving && visual.leaving !== null ? (
        <div
          {...stylex.props(styles.layer, styles.leaving)}
          onAnimationEnd={() => {
            setVisual((prev) =>
              prev.leaving === visual.leaving ? { ...prev, leaving: null } : prev,
            )
          }}
        >
          <Frame story={story} scene={leaving} />
        </div>
      ) : null}
      {scene ? (
        <div {...stylex.props(styles.layer)}>
          <Frame story={story} scene={scene} />
        </div>
      ) : (
        <div {...stylex.props(styles.empty)}>
          <p {...stylex.props(ui.muted)}>No scenes</p>
        </div>
      )}
      {scene?.type === 'dialogue' ? (
        <div {...stylex.props(styles.caption)}>
          <Caption scene={scene} story={story} placement="stage" />
        </div>
      ) : null}
      <Link to="/" aria-label="Home" {...stylex.props(ui.iconButton, styles.back)}>
        <Icon name="back" />
      </Link>
      {index > 0 ? (
        <button
          type="button"
          aria-label="Previous scene"
          {...stylex.props(styles.edge, styles.edgeLeft)}
          onClick={() => stepScene(story.id, -1)}
        />
      ) : null}
      {index < count - 1 ? (
        <button
          type="button"
          aria-label="Next scene"
          {...stylex.props(styles.edge, styles.edgeRight)}
          onClick={() => stepScene(story.id, 1)}
        />
      ) : null}
      <div {...stylex.props(styles.dock)}>
        <div {...stylex.props(styles.hit)}>
          <Composer storyId={story.id} variant="overlay" />
        </div>
        {count > 0 ? (
          <div {...stylex.props(styles.ticks, styles.hit)}>
            {story.scenes.map((item, sceneIndex) => (
              <button
                key={`${item.event}-${sceneIndex}`}
                type="button"
                aria-label={`Scene ${sceneIndex + 1}`}
                aria-current={sceneIndex === index ? 'true' : undefined}
                {...stylex.props(styles.tick, sceneIndex === index && styles.tickOn)}
                onClick={() => stepScene(story.id, sceneIndex - index)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
