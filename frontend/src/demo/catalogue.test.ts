import { describe, expect, it } from 'vitest'
import { demoCatalogue } from './catalogue'

describe('catalogue fixture adapter', () => {
  it('rejects an enquiry without explicit processing acknowledgement', async () => {
    await expect(demoCatalogue.enquire({ offering_id: 'financial-analysis', name: 'Alex', email: 'alex@example.com', organisation_name: 'Fictional A', message: '', processing_acknowledgement: false })).rejects.toThrow('required fields')
  })
  it('returns synthetic data or the requested empty/error condition', async () => {
    expect(await demoCatalogue.list('ready')).toHaveLength(3)
    expect(await demoCatalogue.list('empty')).toEqual([])
    await expect(demoCatalogue.list('error')).rejects.toThrow('could not be loaded')
  })
})
