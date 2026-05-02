// =============================================================================
// SettingsLayoutPage — Phase A follow-up
// =============================================================================
// Single roof for everything settings-related: profile, integrations, billing,
// preferences, danger zone. Renders a left-rail sub-nav inside the existing
// AppShell; sub-pages render in the <Outlet />.
//
// Sub-routes (all live under /settings/*):
//   profile      — name, company, email, change password
//   connections  — Gmail/Outlook OAuth grants (Phase A)
//   train-klo    — seller profile training
//   preferences  — notifications + theme (placeholder for now)
//   billing      — subscription, invoices, seats
//   account      — delete account (danger zone)
// =============================================================================

import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: 'profile',     label: 'Profile',     hint: 'Your name, company, password' },
  { to: 'connections', label: 'Connections', hint: 'Gmail, Outlook, Calendar' },
  { to: 'train-klo',   label: 'Train Klo',   hint: 'Teach Klo about you and your role' },
  { to: 'preferences', label: 'Preferences', hint: 'Notifications, theme' },
  { to: 'billing',     label: 'Billing',     hint: 'Plan, seats, invoices' },
  { to: 'account',     label: 'Account',     hint: 'Delete account' },
]

export default function SettingsLayoutPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-navy">Settings</h1>
        <p className="mt-1 text-[14px] text-navy/55">
          Manage your account, integrations, and how Klo works for you.
        </p>
      </header>

      <div className="grid md:grid-cols-[220px_1fr] gap-6 lg:gap-10">
        <nav aria-label="Settings sections" className="md:sticky md:top-4 md:self-start">
          <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="shrink-0 md:shrink">
                <NavLink
                  to={item.to}
                  end={false}
                  className={({ isActive }) =>
                    [
                      'block rounded-lg px-3 py-2 transition-colors whitespace-nowrap md:whitespace-normal',
                      isActive
                        ? 'bg-klo/10 text-navy'
                        : 'text-navy/65 hover:bg-navy/5 hover:text-navy',
                    ].join(' ')
                  }
                >
                  <div className="text-[14px] font-medium">{item.label}</div>
                  <div className="text-[11px] text-navy/45 mt-0.5 hidden md:block">
                    {item.hint}
                  </div>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
