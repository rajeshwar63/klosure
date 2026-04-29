// Mono uppercase timestamp / status label.
// "LAST TOUCHED 11d AGO", "DUE · MAR 8", "+4 SINCE TUE".

import './designLanguage.css'

export default function MonoTimestamp({ children, dim = false, className = '', ...rest }) {
  const cls = ['kl-ts', dim ? 'kl-ts--dim' : '', className].filter(Boolean).join(' ')
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  )
}
