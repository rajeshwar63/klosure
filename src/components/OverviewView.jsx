// Overview half of the deal room — a structured rendering of the same data
// the chat already exposes, for sellers who want a "deal command center"
// view rather than scrolling chat. Read-mostly: every action still happens
// in the Chat tab. Sections fill in across steps 4-8 of Phase 3.5.
export default function OverviewView({ deal, dealContext, role, commitments }) {
  return (
    <main className="flex-1 overflow-y-auto bg-chat-bg/40 px-3 py-4">
      <div className="max-w-2xl mx-auto text-sm text-navy/40 italic">
        Overview coming together — sections land in the next commits.
      </div>
    </main>
  )
}
