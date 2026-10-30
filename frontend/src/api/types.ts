// Request DTOs from the four supplied backend documents, not the earlier proposed contract.
export interface ProductInput { name: string; slug?: string; description?: string; category?: string; is_published?: boolean }
export interface EnquiryInput { name: string; work_email: string; organisation_name: string; product_id?: string; product_interest: string; requirements: string }
export interface ObservationInput { organisation_id: string; title: string; description: string; product_id?: string; category?: string }
export interface DecisionInput { decision: string; reason: string; redacted_title?: string; redacted_content?: string }
export interface EntitlementInput { organisation_id: string; product_id: string; is_active: boolean }
export interface ImprovementInput { title: string; description: string; product_id: string; organisation_id: string; evidence_entry_ids: string[] }
