export function AppHeader() {
  return (
    <header className="topbar">
      <a className="brand" href="/">Shipowner Invoice Manager</a>
      <nav aria-label="主导航">
        <a href="/">当前船舶</a>
        <a href="/history">历史记录</a>
        <a className="navButton" href="/upload">上传 PDF</a>
      </nav>
    </header>
  );
}
