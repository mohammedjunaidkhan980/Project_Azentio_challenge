import { useCallback, useState } from 'react'
import { Badge, Notice } from '../components/ui'
import { object, records, text } from './client'
import { services } from './services'
import { value } from './forms'
import { Acknowledgement, ApiForm, Field, Pagination, Resource } from './Ui'
import { useResource } from './useResource'

export function ProductManagement({ capabilities }: { capabilities: Record<string, unknown> }) {
  const [page, setPage] = useState(1), [selected, setSelected] = useState(''), [notice, setNotice] = useState('')
  const resource = useResource(useCallback((signal: AbortSignal) => services.managedProducts(page, signal), [page]))
  function saved(message: string) { setNotice(message); resource.reload() }
  return <><h2>Product catalogue</h2><p>New offerings start as drafts. Publishing and unpublishing require separately assigned permissions.</p>{notice && <Notice>{notice}</Notice>}
    {capabilities.create === true && <ApiForm successMessage="Changes saved." label="Create unpublished product" onDone={() => saved('Draft offering created.')} onSave={async data => {
      const response = await services.createProduct({ name: value(data, 'name'), description: value(data, 'description'), category: value(data, 'category'), is_published: false })
      setSelected(text(object(response.data).id)); return response
    }}><h2>Create product</h2><Field name="name" label="Product name" maxLength={255} /><Field name="description" label="Description" type="textarea" required={false} /><Field name="category" label="Category" maxLength={100} required={false} /></ApiForm>}
    <Resource resource={resource}>{data => {
      const rows = records(data), product = rows.find(p => p.id === selected)
      return <><div className="field mt-6"><label htmlFor="managed-offering">Offering to manage</label><select id="managed-offering" value={selected} onChange={e => { setSelected(e.target.value); setNotice('') }}><option value="">Select an offering</option>{rows.map(p => <option key={text(p.id)} value={text(p.id)}>{text(p.name)} · {p.is_published === true ? 'Published' : 'Draft'}</option>)}</select></div>
      {product && <section className="api-record"><h3>{text(product.name)}</h3><Badge tone={product.is_published === true ? 'green' : 'neutral'}>{product.is_published === true ? 'Published' : 'Draft'}</Badge>
        {capabilities.edit === true && (product.is_published !== true || capabilities.publish === true) ? <ApiForm successMessage="Changes saved." key={text(product.id)} label="Update product details" onDone={() => saved('Offering changes saved.')} onSave={data => services.updateProduct(text(product.id), { name: value(data, 'name'), description: value(data, 'description'), category: value(data, 'category') })}><h2>Edit product</h2><Field name="name" label="Product name" value={text(product.name)} maxLength={255} /><Field name="description" label="Description" type="textarea" required={false} value={text(product.description)} /><Field name="category" label="Category" required={false} value={text(product.category)} maxLength={100} />{product.is_published === true && <Acknowledgement name="live_edit">I confirm these changes update a published offering.</Acknowledgement>}</ApiForm> : capabilities.edit === true && <p>Publishing permission is required to change a live offering. You can still edit drafts.</p>}
        {capabilities.publish === true && product.is_published !== true && <ApiForm successMessage="Changes saved." label="Publish offering" onDone={() => saved('Offering published.')} onSave={() => services.publishProduct(text(product.id))}><Acknowledgement name="publish">I approve this offering for public discovery.</Acknowledgement></ApiForm>}
        {capabilities.unpublish === true && product.is_published === true && <ApiForm successMessage="Changes saved." label="Unpublish product" onDone={() => saved('Offering unpublished.')} onSave={() => services.unpublishProduct(text(product.id))}><Acknowledgement name="unpublish">I confirm removal of this offering from public discovery.</Acknowledgement></ApiForm>}
      </section>}
      </>
    }}</Resource><Pagination page={page} setPage={setPage} response={resource.response} />
  </>
}
