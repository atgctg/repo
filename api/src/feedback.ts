import { eq } from 'drizzle-orm'
import type { FeedbackReceipt } from 'shared'
import { database } from './db'
import { feedback, stories } from './schema'
import { StoryError } from './stories'

export async function saveFeedback(
  storyId: string,
  text: string,
): Promise<FeedbackReceipt> {
  const db = database()
  const [story] = await db
    .select({ world: stories.world, events: stories.events })
    .from(stories)
    .where(eq(stories.id, storyId))
    .limit(1)
  if (!story) throw new StoryError('Story not found', 404)
  const [row] = await db
    .insert(feedback)
    .values({ storyId, world: story.world, text, events: story.events })
    .returning({ id: feedback.id, createdAt: feedback.createdAt })
  if (!row) throw new Error('Feedback was not saved')
  return { id: row.id, createdAt: row.createdAt.toISOString() }
}
