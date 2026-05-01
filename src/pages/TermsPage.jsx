// Public Terms of Service page. Linked from the OAuth consent screens for
// Google Cloud and Microsoft Entra; must resolve without authentication.

import termsContent from '../../docs/legal/terms-content.md?raw'
import LegalPage from './LegalPage.jsx'

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="The terms governing your use of Klosure — billing, acceptable use, AI-generated output, and dispute resolution."
      content={termsContent}
    />
  )
}
