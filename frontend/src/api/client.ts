export interface Envelope<T> { success: boolean; message: string; data: T; meta: { page?: number; page_size?: number; total?: number; total_pages?: number }; error?: { code: string; details?: { field: string; msg: string }[] } }
export interface Tokens { access_token: string; refresh_token: string; token_type: string }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: { field: string; msg: string }[] = []) { super(message) }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(0, 'CONTRACT_ERROR', 'The API response does not match the documented contract.')
  return value as Record<string, unknown>
}
export function text(value: unknown): string { return typeof value === 'string' ? value : '' }
export function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new ApiError(0, 'CONTRACT_ERROR', 'Expected a documented list response.')
  return value.map(object)
}
export class ApiClient {
  private tokens: Tokens | null = null
  private refreshInFlight: Promise<void> | null = null
  private epoch = 0
  onExpired: () => void = () => {}
  readonly baseURL: string
  constructor(baseURL: string, private transport: typeof fetch = (...args) => fetch(...args)) {
    const url = new URL(baseURL)
    if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol) || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Use an HTTPS API URL, or HTTP on loopback for local development. Do not include credentials, query or hash.')
    this.baseURL = url.href.replace(/\/$/, '')
  }
  clearSession() { this.epoch++; this.tokens = null; this.refreshInFlight = null }
  async login(email: string, password: string) {
    this.clearSession()
    const epoch = this.epoch
    const response = await this.request<Tokens>('/auth/login', { method: 'POST', body: { email, password }, auth: false })
    if (this.epoch !== epoch) throw new ApiError(401, 'SESSION_CHANGED', 'Sign-in was cancelled.')
    this.acceptTokens(response.data)
  }
  private acceptTokens(value: Tokens) {
    if (!value?.access_token || !value.refresh_token || value.token_type?.toLowerCase() !== 'bearer') throw new ApiError(0, 'CONTRACT_ERROR', 'The sign-in response is missing bearer credentials.')
    this.tokens = value
  }
  private async refresh() {
    if (this.refreshInFlight) return this.refreshInFlight
    const token = this.tokens?.refresh_token, epoch = this.epoch
    if (!token) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Please sign in to continue.')
    const promise = (async () => {
      try {
        const r = await this.request<Tokens>('/auth/refresh', { method: 'POST', body: { refresh_token: token }, auth: false })
        if (epoch !== this.epoch) throw new ApiError(401, 'SESSION_CHANGED', 'Your session has changed. Please sign in again.')
        this.acceptTokens(r.data)
      } catch (error) { if (epoch === this.epoch) { this.clearSession(); this.onExpired() }; throw error }
    })()
    this.refreshInFlight = promise
    try { await promise } finally { if (this.refreshInFlight === promise) this.refreshInFlight = null }
  }
  async request<T = unknown>(path: string, options: { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal } = {}, retry = true): Promise<Envelope<T>> {
    const auth = options.auth !== false, token = this.tokens?.access_token, epoch = this.epoch
    if (auth && !token) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Please sign in to continue.')
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (options.signal?.aborted) controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(abort, 10000)
    let response: Response
    try {
      response = await this.transport(`${this.baseURL}${path}`, { method: options.method ?? 'GET', headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body), credentials: 'omit', cache: 'no-store', signal: controller.signal })
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', controller.signal.aborted ? 'The request timed out or was interrupted. Please try again.' : 'The service is temporarily unavailable. Please try again shortly.')
    } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort) }
    if (auth && epoch !== this.epoch) throw new ApiError(401, 'SESSION_CHANGED', 'Your session changed during the request.')
    if (response.status === 401 && auth && retry) {
      if (this.tokens?.access_token === token) await this.refresh()
      return this.request<T>(path, options, false)
    }
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok || !payload || object(payload).success !== true) {
      const body = payload && typeof payload === 'object' ? payload as Partial<Envelope<never>> : null
      if (response.status === 401 && auth) { this.clearSession(); this.onExpired() }
      const code = typeof body?.error?.code === 'string' ? body.error.code : `HTTP_${response.status}`
      const message = response.status === 401 ? 'Your session has expired. Please sign in.' : response.status === 403 ? 'Your account is not permitted to perform this action.' : response.status === 404 ? 'This record is unavailable in your permitted scope.' : response.status >= 500 ? 'The API could not complete this request. Please retry later.' : response.status === 422 ? 'Check the required fields and allowed lengths.' : 'The request could not be completed in the current state.'
      throw new ApiError(response.status, code, message, Array.isArray(body?.error?.details) ? body.error.details.map(d => ({ field: text(d.field).slice(0, 100), msg: text(d.msg).slice(0, 200) })) : [])
    }
    const envelope = payload as Envelope<T>
    if (!('data' in envelope)) throw new ApiError(0, 'CONTRACT_ERROR', 'The response is missing its data envelope.')
    return envelope
  }
}
export const api = new ApiClient(import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin + '/api/v1' : 'http://localhost:8000/api/v1'))
export const pageQuery = (page = 1, extra: Record<string, string> = {}) => `?${new URLSearchParams({ page: String(page), page_size: '20', ...extra })}`
