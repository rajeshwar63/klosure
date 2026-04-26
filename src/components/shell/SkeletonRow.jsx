// Phase 6 step 15 — reusable skeleton block. Sized to match real content so
// data arrival doesn't shift layout.

export default function SkeletonRow({ lines = 1, height = 14 }) {
  return (
    <div className="animate-pulse" style={{ marginBottom: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="rounded bg-navy/10"
          style={{
            height,
            width: i === lines - 1 ? '60%' : '100%',
            marginBottom: 4,
          }}
        />
      ))}
    </div>
  )
}
