export const metadata = {
  title: 'MangaForge AI',
  description: 'Manga dövüş panellerini videoya dönüştür',
}

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, padding: 0, background: '#080810' }}>{children}</body>
    </html>
  )
}
