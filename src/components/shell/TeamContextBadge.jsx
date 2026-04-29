// Phase 11 — small pill in the shell that reminds a seller they're on a team
// and who manages them. Hidden for managers (they live in /team) and for
// sellers without a team_id.

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useProfile } from '../../hooks/useProfile.jsx'

export default function TeamContextBadge() {
  const { profile, isManager } = useProfile()
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (isManager) return
    if (!profile?.team_id) return

    let mounted = true
    async function load() {
      const { data: team } = await supabase
        .from('teams')
        .select('name, owner_id')
        .eq('id', profile.team_id)
        .maybeSingle()
      if (!mounted || !team) return

      let managerName = null
      if (team.owner_id) {
        const { data: owner } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', team.owner_id)
          .maybeSingle()
        managerName = owner?.name || owner?.email || null
      }
      if (mounted) setInfo({ teamName: team.name, managerName })
    }
    load()
    return () => {
      mounted = false
    }
  }, [profile?.team_id, isManager])

  if (!info) return null

  return (
    <div
      className="px-3 py-2 rounded-lg text-[12px] leading-tight"
      style={{
        background: 'var(--klo-bg-elev)',
        border: '1px solid var(--klo-line)',
        color: 'var(--klo-text-dim)',
      }}
      title={`You're on ${info.teamName}${info.managerName ? ` — managed by ${info.managerName}` : ''}`}
    >
      <span style={{ color: 'var(--klo-text-mute)' }}>Team · </span>
      <span style={{ color: 'var(--klo-text)' }}>{info.teamName}</span>
      {info.managerName && (
        <>
          <br />
          <span style={{ color: 'var(--klo-text-mute)' }}>
            Managed by {info.managerName}
          </span>
        </>
      )}
    </div>
  )
}
