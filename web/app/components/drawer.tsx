import type { ReactNode } from 'react'
import { Button } from '@base-ui/react/button'
import { ScrollArea } from '@base-ui/react/scroll-area'
import * as stylex from '@stylexjs/stylex'
import type { Scene, Story } from 'shared'
import { Blocks } from './blocks'
import { GenerateButton } from './grid'
import { Icon } from './icons'
import { Media, PlayButton } from './media'
import { sceneBlocks } from '~/lib/detail'
import { closeDrawer } from '~/lib/store'
import { canPrompt, sceneAsset, sceneName, speechSrc } from '~/lib/view'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'
import { withClass } from '~/lib/sx'

const styles = stylex.create({
  root: {
    height: '100%',
    minHeight: 0,
    backgroundColor: tokens.bg,
  },
  viewport: {
    height: '100%',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '0.75rem',
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  close: {
    marginLeft: 'auto',
  },
  preview: {
    position: 'relative',
    width: '100%',
    height: '16rem',
    flex: 'none',
    borderRadius: tokens.radiusCard,
    overflow: 'hidden',
    backgroundColor: tokens.bg,
  },
  previewBlur: {
    position: 'absolute',
    inset: 0,
    filter: 'blur(2.75rem)',
    transform: 'scale(1.15)',
  },
  title: {
    fontSize: tokens.textMd,
    fontWeight: 500,
  },
})

export function SceneDrawer({ story, scene }: { story: Story; scene: Scene }): ReactNode {
  const asset = sceneAsset(story, scene)
  const audio =
    scene.type === 'dialogue' ? speechSrc(story, scene.speech?.key) : undefined
  const showPlay = Boolean(asset?.url) && (scene.type === 'video' || Boolean(audio))
  return (
    <ScrollArea.Root {...stylex.props(styles.root)}>
      <ScrollArea.Viewport {...stylex.props(styles.viewport)}>
        <ScrollArea.Content {...stylex.props(styles.content)}>
          <div {...stylex.props(styles.bar)}>
            {canPrompt(asset) && asset ? (
              <GenerateButton
                storyId={story.id}
                name={asset.name}
                type={asset.type}
                label={asset.url ? 'Regenerate' : 'Generate'}
              />
            ) : null}
            <Button
              type="button"
              aria-label="Close"
              {...stylex.props(ui.iconButton, styles.close)}
              onClick={() => closeDrawer(story.id)}
            >
              <Icon name="close" />
            </Button>
          </div>
          {asset?.url ? (
            <div {...withClass(stylex.props(styles.preview), 'squircle')}>
              <div {...stylex.props(scene.type === 'message' && styles.previewBlur)}>
                <Media url={asset.url} video={scene.type === 'video'} />
              </div>
              {showPlay ? (
                <PlayButton owner={`${story.id}:drawer`} audio={audio} />
              ) : null}
            </div>
          ) : null}
          {scene.type === 'message' ? null : (
            <h2 {...stylex.props(styles.title)}>{sceneName(scene)}</h2>
          )}
          <Blocks blocks={sceneBlocks(story, scene)} />
        </ScrollArea.Content>
      </ScrollArea.Viewport>
    </ScrollArea.Root>
  )
}
