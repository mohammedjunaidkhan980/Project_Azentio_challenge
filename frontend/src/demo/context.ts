import { createContext, useContext } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Persona, WorkflowState } from './workflow'
export interface DemoContextValue { persona: Persona; setPersona: Dispatch<SetStateAction<Persona>>; workflow: WorkflowState; setWorkflow: Dispatch<SetStateAction<WorkflowState>> }
export const DemoContext = createContext<DemoContextValue | null>(null)
export function useDemo() { const value = useContext(DemoContext); if (!value) throw new Error('Demo provider is missing'); return value }
