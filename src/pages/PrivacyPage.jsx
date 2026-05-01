// Public Privacy Policy page. Required by Google's OAuth verification — the
// /privacy URL must resolve without authentication. The Limited Use disclosure
// language in section 2 is templated from Google's required wording; do not
// edit the markdown source without re-checking the verification policy.

import privacyContent from '../../docs/legal/privacy-content.md?raw'
import LegalPage from './LegalPage.jsx'

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="How Klosure collects, uses, and protects your information — including data from connected Google and Microsoft accounts."
      content={privacyContent}
    />
  )
}
