import { useCallback, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ActionLink, Badge, EmptyState, PageHeading } from '../components/ui'
import { ApiForm, Field, Pagination, Resource, Acknowledgement } from './Ui'
import { value } from './forms'
import { object, records, text } from './client'
import { services } from './services'
import { useResource } from './useResource'

export function ApiCatalogue() {
  const [page, setPage] = useState(1), [query, setQuery] = useState('')
  const resource = useResource(useCallback((signal: AbortSignal) => services.products(page, signal), [page]))
  return <div className="container section"><PageHeading eyebrow="API PRODUCT CATALOGUE" title="Find the right starting point." description="Published products from your configured backend. API errors never fall back to illustrative offerings." /><label className="search-field"><span className="sr-only">Search this product page</span><input placeholder="Search this page" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="mt-6"><Resource resource={resource}>{data => {
    const rows = records(data).filter(p => p.is_published === true && `${text(p.name)} ${text(p.description)}`.toLowerCase().includes(query.toLowerCase()))
    return rows.length ? <div className="offering-grid">{rows.map(p => <article className="offering-card" key={text(p.id)}><Badge>{text(p.category) || 'AI offering'}</Badge><h2 className="mt-6">{text(p.name)}</h2><p>{text(p.description) || 'No description provided.'}</p><Link className="card-link" to={`/offerings/${encodeURIComponent(text(p.id))}`}>Explore offering: {text(p.name)}</Link></article>)}</div> : <EmptyState title="No published products found">Try another search or page. Search is limited to this page because no server search endpoint is documented.</EmptyState>
  }}</Resource></div><Pagination page={page} setPage={setPage} response={resource.response} /></div>
}
export function ApiProduct() {
  const { slug = '' } = useParams()
  const resource = useResource(useCallback((signal: AbortSignal) => services.product(slug, signal), [slug]))
  return <div className="container section"><Link className="back-link" to="/offerings">← All offerings</Link><Resource resource={resource}>{data => { const p = object(data); return <><PageHeading eyebrow={text(p.category) || 'API OFFERING'} title={text(p.name)} description={text(p.description) || 'No description provided.'} /><ActionLink to={`/demo?product=${encodeURIComponent(text(p.id))}`}>Request a demo</ActionLink></> }}</Resource></div>
}
export function ApiEnquiry() {
  const [search] = useSearchParams()
  return <div className="container section"><PageHeading eyebrow="DEMO ENQUIRY" title="Let’s explore what’s possible." description="This form sends a real enquiry to the configured API. Use fictional contact details for testing." /><div className="api-narrow"><ApiForm label="Submit enquiry to API" onSave={data => services.enquire({ name: value(data, 'name'), work_email: value(data, 'work_email'), organisation_name: value(data, 'organisation_name'), ...(value(data, 'product_id') ? { product_id: value(data, 'product_id') } : {}), product_interest: value(data, 'product_interest'), requirements: value(data, 'requirements') })}><h2>Request a demo</h2><Field name="name" label="Your name" maxLength={255} /><Field name="work_email" label="Work email" type="email" maxLength={255} /><Field name="organisation_name" label="Organisation" maxLength={255} /><Field name="product_id" label="Product ID" required={false} value={search.get('product') ?? ''} /><Field name="product_interest" label="Product interest" maxLength={255} /><Field name="requirements" label="Requirements (10–5000 characters)" type="textarea" minLength={10} maxLength={5000} /><Acknowledgement name="synthetic">I am using fictional test details and agree to send this enquiry to the configured backend.</Acknowledgement><p className="disclaimer">API acknowledgement is not proof of email delivery. Unlike fixture mode, requirements are mandatory under the backend contract.</p></ApiForm></div></div>
}
