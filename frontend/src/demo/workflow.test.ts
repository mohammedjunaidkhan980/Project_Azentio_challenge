import { describe, expect, it } from 'vitest'
import { blankObservation, initialWorkflow, ownObservations, reviewObservation, reviewQueue, saveObservation, withdrawObservation } from './workflow'
import type { SaveObservation } from './workflow'

const command: SaveObservation = { input: { ...blankObservation, title: 'Synthetic seasonality', body: 'Synthetic seasonal example.' }, visibility: 'author', processing_consent: true, submit: false, publication_consent: false, attribution_consent: false }
describe('synthetic observation adapter (not server security)', () => {
  it('keeps saved drafts out of the review queue and shared feed', () => {
    const next = saveObservation(initialWorkflow(), 'client-a', command)
    expect(next.observations[0].state).toBe('DRAFT')
    expect(next.observations[0].visibility).toBe('author')
    expect(reviewQueue(next).map(o => o.title)).not.toContain(command.input.title)
    expect(next.shared).toEqual([])
  })
  it('requires explicit publication permission and renews returned submission consent', () => {
    expect(() => saveObservation(initialWorkflow(), 'client-a', { ...command, submit: true })).toThrow('Explicit publication')
    const next = saveObservation(initialWorkflow(), 'client-a', { ...command, id: 'sample-returned-a', expected_version: 1, submit: true, publication_consent: true })
    expect(next.observations.find(o => o.id === 'sample-returned-a')).toMatchObject({ state: 'SUBMITTED', version: 2, publication_consent: true, attribution_consent: false })
  })
  it('does not select foreign private originals or let a moderator write a draft', () => {
    expect(ownObservations(initialWorkflow(), 'client-b').map(o => o.author)).toEqual(['client-b'])
    expect(() => saveObservation(initialWorkflow(), 'moderator', command)).toThrow('cannot create')
    expect(() => saveObservation(initialWorkflow(), 'client-a', { ...command, id: 'sample-draft-c', expected_version: 1 })).toThrow('unavailable')
  })
  it('rejects stale revisions and in-place edits of a submitted snapshot', () => {
    expect(() => saveObservation(initialWorkflow(), 'client-a', { ...command, id: 'sample-returned-a', expected_version: 0 })).toThrow('no longer editable')
    expect(() => saveObservation(initialWorkflow(), 'client-b', { ...command, id: 'sample-submitted-b', expected_version: 1 })).toThrow('no longer editable')
  })
})

describe('reviewed-copy fixture lifecycle', () => {
  const review = { id: 'sample-submitted-b', expected_version: 1, action: 'publish' as const, reason: 'Synthetic identifying branch detail removed.', approved_title: 'Seasonal context', approved_body: 'A synthetic example benefits from context.', include_attribution: false }
  it('publishes only a separately allowlisted copy, never private source metadata or reason', () => {
    const result = reviewObservation(initialWorkflow(), 'moderator', review)
    expect(result.shared).toHaveLength(1)
    expect(result.shared[0]).not.toHaveProperty('author')
    expect(result.shared[0]).not.toHaveProperty('feedback')
    expect(result.shared[0]).not.toHaveProperty('revision_id')
    expect(JSON.stringify(result.shared)).not.toContain('Sample Branch 41')
    expect(result.shared[0].attribution).toBeNull()
    expect(() => reviewObservation(initialWorkflow(), 'client-a', review)).toThrow('Only the moderator')
    expect(() => reviewObservation(initialWorkflow(), 'moderator', { ...review, include_attribution: true })).toThrow('did not permit')
  })
  it('withdrawal removes live shared evidence and prevents stale review from republishing', () => {
    const published = reviewObservation(initialWorkflow(), 'moderator', review)
    const withdrawn = withdrawObservation(published, 'client-b', review.id, 2)
    expect(withdrawn.shared).toEqual([])
    expect(withdrawn.observations.find(o => o.id === review.id)).toMatchObject({ state: 'WITHDRAWN', publication_consent: false, body: initialWorkflow().observations[1].body })
    expect(() => reviewObservation(withdrawn, 'moderator', review)).toThrow('no longer available')
    expect(() => withdrawObservation(published, 'client-a', review.id, 2)).toThrow('not available')
  })
  it('return/reject do not publish and require a reason', () => {
    expect(() => reviewObservation(initialWorkflow(), 'moderator', { ...review, reason: '' })).toThrow('review reason')
    for (const action of ['return', 'reject'] as const) {
      const result = reviewObservation(initialWorkflow(), 'moderator', { ...review, action })
      expect(result.shared).toEqual([])
      expect(result.observations[1].state).toBe(action === 'return' ? 'RETURNED' : 'REJECTED')
    }
  })
  it('preserves the reviewed synthetic evidence category and confidence instead of relabelling them', () => {
    const state = initialWorkflow()
    state.observations[1].evidence_type = 'Synthetic example'
    state.observations[1].confidence = 'Exploratory'
    const result = reviewObservation(state, 'moderator', review)
    expect(result.shared[0]).toMatchObject({ evidence_type: 'Synthetic example', confidence: 'Exploratory' })
  })
})
