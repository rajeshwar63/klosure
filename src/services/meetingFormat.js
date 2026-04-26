// Phase 6.1 step 09 — format a klo_state.next_meeting object for the
// dark-header chip and the recency strip. Date-only meetings (ISO with
// no time component) format without a time; date-time meetings include
// a "h:mm AM/PM" suffix. Past meetings return an empty string so the
// caller can hide the chip.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isDateOnly(iso) {
  if (typeof iso !== 'string') return false
  // A bare YYYY-MM-DD has no time component.
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getWeekday(date) {
  return WEEKDAYS[date.getDay()]
}

function startOfDay(date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function dayDiff(target, now) {
  const a = startOfDay(target).getTime()
  const b = startOfDay(now).getTime()
  return Math.round((a - b) / (24 * 60 * 60 * 1000))
}

export function isMeetingPast(meeting, now = new Date()) {
  if (!meeting?.date) return false
  const date = new Date(meeting.date)
  if (Number.isNaN(date.getTime())) return false
  if (isDateOnly(meeting.date)) {
    return startOfDay(date).getTime() < startOfDay(now).getTime()
  }
  return date.getTime() < now.getTime()
}

export function formatNextMeeting(meeting, now = new Date()) {
  if (!meeting?.date) return ''
  const date = new Date(meeting.date)
  if (Number.isNaN(date.getTime())) return ''

  const dateOnly = isDateOnly(meeting.date)
  const days = dayDiff(date, now)
  if (days < 0) return ''

  let when
  if (days === 0) {
    when = dateOnly ? 'Today' : `Today ${formatTime(date)}`
  } else if (days === 1) {
    when = dateOnly ? 'Tomorrow' : `Tomorrow ${formatTime(date)}`
  } else if (days < 7) {
    when = dateOnly
      ? getWeekday(date)
      : `${getWeekday(date)} ${formatTime(date)}`
  } else if (days < 14) {
    when = dateOnly
      ? `Next ${getWeekday(date)}`
      : `Next ${getWeekday(date)} ${formatTime(date)}`
  } else {
    when = formatShortDate(date)
  }

  const title = (meeting.title ?? '').trim()
  return title ? `Next: ${when} · ${title}` : `Next: ${when}`
}
