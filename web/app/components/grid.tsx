import type { ReactNode } from 'react'
import { Button } from '@base-ui/react/button'
import * as stylex from '@stylexjs/stylex'
import type { Card, Scene, Story } from 'shared'
import { Blocks } from './blocks'
import { Icon } from './icons'
import { Caption, PlayButton, Tile, sceneImage, sceneTitle } from './media'
import { RichText } from '~/lib/text'
import { canGenerate, findAsset, sceneAsset, speechSrc } from '~/lib/view'
import { generateAsset, selectScene, useActivity, useStoryUi } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'

const styles = stylex.create({
  stage: {
    height: '100%',
    minHeight: 0,
    overflow: 'auto',
    containerType: 'inline-size',
    containerName: 'stage',
    padding: '0.25rem',
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
  message: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    textAlign: 'center',
  },
  messageText: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    textWrap: 'pretty',
    fontSize: tokens.textMd,
    fontWeight: 600,
    lineHeight: 1.25,
    letterSpacing: '-0.015em',
  },
  home: {
    minHeight: '100dvh',
    padding: '1.25rem 0.25rem',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
})

export function SceneGrid({ story }: { story: Story }): ReactNode {
  const uiState = useStoryUi(story.id)
  if (story.scenes.length === 0)
    return (
      <div {...stylex.props(styles.stage)}>
        <p {...stylex.props(ui.muted)}>No scenes</p>
      </div>
    )
  return (
    <div {...stylex.props(styles.stage)}>
      <div className="tile-grid">
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
        blurred
        heavy
        mark={index}
        selected={selected}
        onClick={(event) => selectScene(story.id, index, event.shiftKey)}
      >
        {scene.text ? (
          <div {...stylex.props(styles.message)}>
            <p {...stylex.props(styles.messageText)}>
              <RichText text={scene.text} />
            </p>
          </div>
        ) : null}
      </Tile>
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
        generate || play ? (
          <>
            {generate}
            {play}
          </>
        ) : null
      }
      footer={
        scene.type === 'dialogue' ? (
          <Caption scene={scene} story={story} placement="card" />
        ) : null
      }
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
  return (
    <Button
      type="button"
      disabled={busy}
      focusableWhenDisabled
      {...stylex.props(floating ? styles.float : ui.pill)}
      onClick={(event) => {
        event.stopPropagation()
        void generateAsset(storyId, name, type)
      }}
    >
      {floating ? null : <Icon name="refresh" spin={busy} />}
      <span>{busy ? 'Generating…' : label}</span>
    </Button>
  )
}

export function PosterGrid({
  items,
  onOpen,
}: {
  items: { id: string; title: string; image?: string }[]
  onOpen: (id: string) => void
}): ReactNode {
  if (items.length === 0) return <p {...stylex.props(ui.muted)}>no worlds</p>
  return (
    <div {...stylex.props(styles.stage, styles.home)}>
      <div className="tile-grid">
        {items.map((item) => (
          <Tile
            key={item.id}
            title={item.title}
            image={item.image}
            onClick={() => onOpen(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function HomeSections({
  stories,
  worlds,
  onOpenStory,
  onOpenWorld,
}: {
  stories: { id: string; title: string; image?: string }[]
  worlds: { id: string; title: string; image?: string }[]
  onOpenStory: (id: string) => void
  onOpenWorld: (id: string) => void
}): ReactNode {
  return (
    <div {...stylex.props(styles.stage, styles.home)}>
      {stories.length > 0 ? (
        <section {...stylex.props(styles.section)}>
          <p {...stylex.props(ui.muted)}>Stories</p>
          <div className="tile-grid">
            {stories.map((item) => (
              <Tile
                key={item.id}
                title={item.title}
                image={item.image}
                onClick={() => onOpenStory(item.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
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
