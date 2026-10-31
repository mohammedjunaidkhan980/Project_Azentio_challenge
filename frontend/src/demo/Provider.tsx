import { useState } from 'react'
import type { ReactNode } from 'react'
import { DemoContext } from './context'
import { initialWorkflow } from './workflow'
import type { Persona } from './workflow'
export function DemoProvider({ children }: { children: ReactNode }) {
  const [persona, setPersona] = useState<Persona>('client-a')
  const [workflow, setWorkflow] = useState(initialWorkflow)
  return <DemoContext value={{ persona, setPersona, workflow, setWorkflow }}>{children}</DemoContext>
}
