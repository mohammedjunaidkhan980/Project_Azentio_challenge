export type Persona = 'client-a' | 'client-b' | 'client-c' | 'moderator'
export type ObservationState = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'REJECTED' | 'PUBLISHED' | 'WITHDRAWN'
export interface ObservationInput {
  offering_id: string; title: string; body: string; industry: string; region: string
  period: string; topic: string; evidence_type: string; confidence: string
}
export interface Observation extends ObservationInput {
  id: string; revision_id: string; author: Persona; visibility: 'author' | 'organisation'
  state: ObservationState; version: number; publication_consent: boolean
  attribution_consent: boolean; feedback: string; shared_id?: string
}
export interface SharedCopy {
  id: string; version: number; title: string; body: string; offering_id: string
  topic: string; evidence_type: string; confidence: string; limitations: string
  attribution: string | null; published_at: string
}
export interface WorkflowState { observations: Observation[]; shared: SharedCopy[] }
export interface SaveObservation { id?: string; expected_version?: number; input: ObservationInput; visibility: 'author' | 'organisation'; processing_consent: boolean; submit: boolean; publication_consent: boolean; attribution_consent: boolean }
export const personaLabels: Record<Persona, string> = { 'client-a': 'Client · Fictional Bank A', 'client-b': 'Client · Fictional Bank B', 'client-c': 'Client · Fictional Bank C', moderator: 'Learning moderator' }
export const blankObservation: ObservationInput = { offering_id: 'financial-analysis', title: '', body: '', industry: 'Banking', region: 'Broad / unspecified', period: '2026-Q3', topic: 'Cash flow', evidence_type: 'Synthetic sandbox', confidence: 'Limited' }

export function initialWorkflow(): WorkflowState {
  return { shared: [], observations: [
    { ...blankObservation, id: 'sample-returned-a', revision_id: 'sample-returned-a-r1', author: 'client-a', title: 'Seasonal comparisons need a clearer explanation', body: 'In a synthetic scenario, a seasonal business showed a cash-flow dip. More context would help a reviewer interpret the comparison.', state: 'RETURNED', version: 1, visibility: 'author', publication_consent: false, attribution_consent: false, feedback: 'Please describe what additional context would help. Keep all examples synthetic.' },
    { ...blankObservation, id: 'sample-submitted-b', revision_id: 'sample-submitted-b-r1', author: 'client-b', title: 'Add context to seasonal cash-flow comparisons', body: 'Our fictional Bank B scenario at Sample Branch 41 used an unusually specific monthly comparison. A seasonal explanation could make the review clearer.', state: 'SUBMITTED', version: 1, visibility: 'author', publication_consent: true, attribution_consent: false, feedback: '' },
    { ...blankObservation, id: 'sample-draft-c', revision_id: 'sample-draft-c-r1', author: 'client-c', title: 'Private synthetic review note', body: 'This unsubmitted synthetic note must never appear in the moderator queue or shared feed.', state: 'DRAFT', version: 1, visibility: 'author', publication_consent: false, attribution_consent: false, feedback: '' },
  ] }
}

export function saveObservation(state: WorkflowState, actor: Persona, command: SaveObservation): WorkflowState {
  if (actor === 'moderator') throw new Error('This preview persona cannot create client observations.')
  if (!command.processing_consent || !command.input.title.trim() || !command.input.body.trim()) throw new Error('Complete the required fields and processing acknowledgement.')
  if (command.input.title.length > 160 || command.input.body.length > 10000) throw new Error('The observation exceeds the allowed length.')
  if (command.submit && !command.publication_consent) throw new Error('Explicit publication permission is required before proposing community sharing.')
  const previous = command.id ? state.observations.find(o => o.id === command.id && o.author === actor) : undefined
  if (command.id && !previous) throw new Error('Observation unavailable for this preview persona.')
  if (previous && (previous.version !== command.expected_version || !['DRAFT', 'RETURNED'].includes(previous.state))) throw new Error('This revision is no longer editable. Reopen it to check the current state.')
  const id = previous?.id ?? crypto.randomUUID()
  const version = (previous?.version ?? 0) + 1
  const next: Observation = { ...command.input, id, revision_id: `${id}-r${version}`, author: actor, visibility: command.visibility, version, state: command.submit ? 'SUBMITTED' : 'DRAFT', publication_consent: command.submit && command.publication_consent, attribution_consent: command.submit && command.attribution_consent, feedback: previous?.feedback ?? '' }
  return { ...state, observations: previous ? state.observations.map(o => o.id === id ? next : o) : [next, ...state.observations] }
}

export function ownObservations(state: WorkflowState, actor: Persona) { return actor === 'moderator' ? [] : state.observations.filter(o => o.author === actor) }
export function reviewQueue(state: WorkflowState) { return state.observations.filter(o => o.state === 'SUBMITTED' && o.publication_consent) }

export interface ReviewCommand { id: string; expected_version: number; action: 'return' | 'reject' | 'publish'; reason: string; approved_title: string; approved_body: string; include_attribution: boolean }
export function reviewObservation(state: WorkflowState, actor: Persona, command: ReviewCommand): WorkflowState {
  if (actor !== 'moderator') throw new Error('Only the moderator preview persona can review a proposal.')
  const source = state.observations.find(o => o.id === command.id)
  if (!source || source.state !== 'SUBMITTED' || !source.publication_consent || source.version !== command.expected_version) throw new Error('This proposal is no longer available for review.')
  if (!command.reason.trim() || command.reason.length > 2000) throw new Error('Provide a review reason of up to 2,000 characters.')
  if (command.action === 'publish' && (!command.approved_title.trim() || !command.approved_body.trim() || command.approved_title.length > 160 || command.approved_body.length > 10000)) throw new Error('Complete the reviewed title and body within the allowed lengths.')
  if (command.include_attribution && !source.attribution_consent) throw new Error('The author did not permit organisation attribution.')
  const shared: SharedCopy | undefined = command.action === 'publish' ? {
    id: crypto.randomUUID(), version: 1, title: command.approved_title.trim(), body: command.approved_body.trim(), offering_id: source.offering_id,
    topic: 'Cash flow', evidence_type: source.evidence_type === 'Synthetic example' ? 'Synthetic example' : 'Synthetic sandbox', confidence: source.confidence === 'Exploratory' ? 'Exploratory' : 'Limited', limitations: 'Small synthetic example. Not evidence of market prevalence.',
    attribution: command.include_attribution ? personaLabels[source.author].replace('Client · ', '') : null, published_at: new Date().toISOString(),
  } : undefined
  return { observations: state.observations.map(o => o.id === source.id ? { ...o, state: command.action === 'publish' ? 'PUBLISHED' : command.action === 'return' ? 'RETURNED' : 'REJECTED', version: o.version + 1, feedback: command.reason.trim(), shared_id: shared?.id } : o), shared: shared ? [shared, ...state.shared] : state.shared }
}
export function withdrawObservation(state: WorkflowState, actor: Persona, id: string, expected_version: number): WorkflowState {
  const source = state.observations.find(o => o.id === id && o.author === actor)
  if (!source || source.version !== expected_version || !['SUBMITTED', 'PUBLISHED'].includes(source.state)) throw new Error('This observation is not available for withdrawal.')
  return { observations: state.observations.map(o => o.id === id ? { ...o, state: 'WITHDRAWN', publication_consent: false, attribution_consent: false, version: o.version + 1 } : o), shared: state.shared.filter(s => s.id !== source.shared_id) }
}
