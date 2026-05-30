export function App() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 38,
        paddingLeft: 12,
        paddingRight: 12,
        background: 'var(--affine-background-primary-color)',
        color: 'var(--affine-text-primary-color)',
        fontFamily: 'var(--affine-font-family, system-ui, sans-serif)',
        fontSize: 13,
        fontWeight: 600,
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      }}
    >
      Story
    </div>
  );
}
