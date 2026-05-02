// =============================================================================
// SettingsProfilePage
// =============================================================================
// Renders the user's basic identity (name, email, company, role) plus a link
// to change their password. Editing name/company is read-only for V1 — the
// onboarding flow already collects these and we don't have an edit-profile
// API yet. Email comes from Supabase auth and isn't editable in-app.
// =============================================================================

import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'

export default function SettingsProfilePage() {
  const { user } = useAuth()
  const { profile, team, isManager, loading } = useProfile()

  if (loading) {
    return <div className="text-sm text-navy/50">Loading…</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Section title="Identity">
        <Field label="Name" value={profile?.name || '—'} />
        <Field label="Email" value={user?.email || '—'} />
        <Field
          label="Role"
          value={isManager ? 'Manager' : 'Seller'}
        />
      </Section>

      <Section title="Team">
        <Field label="Team" value={team?.name || 'Solo (no team yet)'} />
      </Section>

      <Section title="Security">
        <p className="text-[13px] text-navy/60 mb-3">
          Change the password used to sign in to Klosure.
        </p>
        <Link
          to="/settings/password"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-klo text-white text-[13px] font-medium hover:opacity-90"
        >
          Change password
        </Link>
      </Section>

      <Section title="Editing">
        <p className="text-[12px] text-navy/45">
          Name and company aren't editable in-app yet. Email{' '}
          <a href="mailto:support@klosure.ai" className="underline">
            support@klosure.ai
          </a>{' '}
          if you need to change them.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="bg-white rounded-2xl p-5 border border-navy/10">
      <h2 className="text-[13px] font-semibold tracking-wider text-navy/55 uppercase mb-3">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, value }) {
  return (
    <div className="flex justify-between items-baseline py-2 border-b border-navy/5 last:border-0">
      <span className="text-[13px] text-navy/55">{label}</span>
      <span className="text-[14px] text-navy font-medium text-right max-w-[60%] truncate">
        {value}
      </span>
    </div>
  )
}
