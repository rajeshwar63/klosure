# Supabase Auth email templates

Branded HTML for the emails Supabase Auth sends directly (signup confirmation,
password reset, etc.). These run *outside* our edge functions — Supabase Auth
fires them — so they live as static HTML files instead of being composed in
`supabase/functions/_shared/email-templates.ts`.

## Files

| File                     | Supabase template key | When it sends                              |
|--------------------------|-----------------------|--------------------------------------------|
| `confirm-signup.html`    | `confirmation`        | New signup with email confirmation enabled |
| `reset-password.html`    | `recovery`            | `auth.resetPasswordForEmail()` is called   |
| `magic-link.html`        | `magic_link`          | `auth.signInWithOtp()` (passwordless)      |
| `email-change.html`      | `email_change`        | User changes their email                   |
| `reauthentication.html`  | `reauthentication`    | Re-auth required for a sensitive action    |
| `invite.html`            | `invite`              | Admin invites via Supabase Auth UI         |

The placeholders (`{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`,
`{{ .Token }}`) are Supabase Auth's Go-template variables — keep them intact
when editing.

## Applying the templates

### Option A — Supabase CLI (preferred, version-controlled)

```bash
supabase link --project-ref <your-project-ref>
supabase config push
```

`supabase/config.toml` already points each `[auth.email.template.*]` block at
the matching file in this directory.

### Option B — Dashboard (one-off)

1. Open **Authentication → Email Templates** in the Supabase dashboard.
2. For each template above, paste the matching HTML file's contents into
   the editor and copy the subject line from `supabase/config.toml`.
3. Save.

## Editing checklist

When you tweak a template:

- Keep the chrome (header/footer/colours) in sync with
  `supabase/functions/_shared/email-templates.ts` so transactional and auth
  emails feel like the same brand.
- Test in Litmus or by sending a real signup — Gmail and Outlook strip
  `<style>` tags, which is why everything is inlined.
- Don't add tracking pixels. Auth emails should be as boring as possible to
  pass spam filters.
