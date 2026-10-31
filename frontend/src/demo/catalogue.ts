export interface Offering {
  id: string
  slug: string
  name: string
  category: 'Lending' | 'Operations' | 'Risk & compliance'
  description: string
  benefit: string
  use_cases: string[]
  icon: 'chart' | 'file' | 'shield'
}

// Illustrative product descriptions, not assertions of released Azentio capability.
export const offerings: Offering[] = [
  { id: 'financial-analysis', slug: 'financial-analysis', name: 'Financial Analysis Intelligence', category: 'Lending', description: 'Bring financial statements, cash-flow trends and key ratios into a consistent review workflow. Help lending teams assess business performance, understand seasonal patterns and build a clearer evidence base for credit decisions.', benefit: 'Help teams ask better questions before making a decision.', use_cases: ['Seasonal cash-flow comparison', 'Evidence-linked financial review', 'Structured analyst feedback'], icon: 'chart' },
  { id: 'document-intelligence', slug: 'document-intelligence', name: 'Document Intelligence', category: 'Operations', description: 'Bring structure to document-intensive operations. Organise information from financial and business documents, keep supporting evidence close to each review and route exceptions to the right teams.', benefit: 'Keep source context close to every review.', use_cases: ['Financial document review', 'Source-linked extraction', 'Human review of exceptions'], icon: 'file' },
  { id: 'risk-intelligence', slug: 'risk-intelligence', name: 'Risk & Compliance Intelligence', category: 'Risk & compliance', description: 'Connect risk signals, policy requirements and supporting evidence in one review workflow. Help risk and compliance teams prioritise exceptions, document assessments and maintain a clear audit trail.', benefit: 'Make review steps visible and traceable.', use_cases: ['Risk signal assessment', 'Review checklists', 'Human escalation'], icon: 'shield' },
]

export interface DemoEnquiry {
  offering_id: string
  name: string
  email: string
  organisation_name: string
  message: string
  processing_acknowledgement: boolean
}
export type PreviewCondition = 'ready' | 'empty' | 'error'

// Narrow boundary for the future HTTP adapter. This module never sends data externally.
export interface CatalogueAdapter {
  list(condition: PreviewCondition): Promise<Offering[]>
  enquire(input: DemoEnquiry, fail?: boolean): Promise<{ id: string; status: 'recorded'; acknowledgement: string }>
}

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 180))
let enquiryNumber = 0
export const demoCatalogue: CatalogueAdapter = {
  async list(condition) {
    await pause()
    if (condition === 'error') throw new Error('The demo catalogue could not be loaded.')
    return condition === 'empty' ? [] : offerings
  },
  async enquire(input, fail = false) {
    await pause()
    if (fail) throw new Error('The simulated request failed. Your entries have been kept; please try again.')
    if (!input.name.trim() || !input.organisation_name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || !input.processing_acknowledgement || !offerings.some(o => o.id === input.offering_id)) throw new Error('Please check the required fields.')
    return { id: `DEMO-${String(++enquiryNumber).padStart(3, '0')}`, status: 'recorded', acknowledgement: 'Demo enquiry recorded in this preview only. No email has been sent.' }
  },
}
