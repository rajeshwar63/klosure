// =============================================================================
// SettingsPreferencesPage
// =============================================================================
// Placeholder for notification + theme preferences. Phase B will fill this in
// with real toggles (e.g. "Notify me when Klo posts in deal chat", "Don't
// dispatch Notetaker on weekends").
// =============================================================================

export default function SettingsPreferencesPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <section className="bg-white rounded-2xl p-5 border border-navy/10">
        <h2 className="text-[13px] font-semibold tracking-wider text-navy/55 uppercase mb-3">
          Notifications
        </h2>
        <p className="text-[14px] text-navy/60 leading-relaxed">
          Email and in-app notification preferences are coming soon. For now,
          Klo posts updates directly in the deal chat — no separate
          notifications fire.
        </p>
      </section>

      <section className="bg-white rounded-2xl p-5 border border-navy/10">
        <h2 className="text-[13px] font-semibold tracking-wider text-navy/55 uppercase mb-3">
          Appearance
        </h2>
        <p className="text-[14px] text-navy/60 leading-relaxed">
          Light mode only for now. Dark mode is on the roadmap once the design
          system is dual-tone.
        </p>
      </section>

      <p className="text-[12px] text-navy/45">
        Have a preference you wish Klosure had?{' '}
        <a href="mailto:support@klosure.ai" className="underline">
          Tell us.
        </a>
      </p>
    </div>
  )
}
