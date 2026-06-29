'use client'
import { useState, useCallback, useRef } from 'react'

export default function Home() {
  const [panels, setPanels] = useState([])
  const [stage, setStage] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [videoUrl, setVideoUrl] = useState(null)
  const [previewIdx, setPreviewIdx] = useState(null)
  const [error, setError] = useState(null)

  const toBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })

  const getMediaType = (file) => {
    if (file.type) return file.type
    const ext = file.name.split('.').pop().toLowerCase()
    return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || e.target.files || [])
      .filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    setPanels(prev => [...prev, ...files.map(f => ({
      file: f, url: URL.createObjectURL(f),
      name: f.name, analysis: null, status: 'pending'
    }))])
  }, [])

  const movePanel = (i, dir) => {
    setPanels(prev => {
      const arr = [...prev]; const j = i + dir
      if (j < 0 || j >= arr.length) return arr
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return arr
    })
  }

  const generate = async () => {
    if (!panels.length) return
    setStage('analyzing'); setProgress(0); setError(null); setVideoUrl(null)

    const analyzed = [...panels]
    for (let i = 0; i < analyzed.length; i++) {
      setProgressLabel(`🤖 Panel ${i + 1}/${analyzed.length} analiz ediliyor...`)
      try {
        const base64 = await toBase64(analyzed[i].file)
        const mediaType = getMediaType(analyzed[i].file)
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mediaType })
        })
        const data = await res.json()
        analyzed[i] = { ...analyzed[i], analysis: data.analysis, status: 'analyzed' }
      } catch {
        analyzed[i] = { ...analyzed[i], analysis: {
          intensity: 6, motionType: 'slash', direction: 'right',
          effectColor: '#ff4444', duration: 2.0, description: 'Dövüş sahnesi',
          zoomPulse: true, screenShake: true, flashColor: '#ffffff'
        }, status: 'analyzed' }
      }
      setProgress(Math.round((i + 1) / analyzed.length * 40))
    }
    setPanels([...analyzed])

    setStage('rendering')
    setProgressLabel('🎬 Video render ediliyor...')
    setProgress(45)

    try {
      const panelData = await Promise.all(analyzed.map(async (p) => ({
        base64: await toBase64(p.file),
        mediaType: getMediaType(p.file),
        analysis: p.analysis
      })))

      setProgress(55)
      setProgressLabel('⚙️ ffmpeg ile encode ediliyor...')

      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panels: panelData })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Render hatası')
      }

      setProgress(90)
      const data = await res.json()
      const blob = new Blob(
        [Uint8Array.from(atob(data.video), c => c.charCodeAt(0))],
        { type: 'video/mp4' }
      )
      const url = URL.createObjectURL(blob)
      setVideoUrl(url)
      setProgress(100)
      setProgressLabel('Tamamlandı!')
      setStage('done')
    } catch (err) {
      setError(err.message)
      setStage('idle')
    }
  }

  const download = () => {
    if (!videoUrl) return
    const a = document.createElement('a')
    a.href = videoUrl; a.download = `manga-fight-${Date.now()}.mp4`; a.click()
  }

  const intLabel = n => n >= 9 ? { t: 'GODLIKE', c: '#ff0055' }
    : n >= 7 ? { t: 'YOĞUN', c: '#ff6600' }
    : n >= 5 ? { t: 'ORTA', c: '#ffcc00' }
    : { t: 'HAFİF', c: '#44ff88' }

  return (
    <div style={{ minHeight: '100vh', background: '#080810', color: '#e8e8f0', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: 'linear-gradient(135deg,#0d0d1a,#1a0a2e,#0d0d1a)', borderBottom: '1px solid #2a1a4a', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,#7b2fff,#ff2f7b)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: '0 0 18px #7b2fff66' }}>⚡</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>
            <span style={{ color: '#bf7fff' }}>MANGA</span><span style={{ color: '#fff' }}>FORGE</span>
            <span style={{ color: '#ff5599', marginLeft: 8, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>AI VIDEO</span>
          </div>
          <div style={{ fontSize: 11, color: '#7a6a9a', marginTop: 1 }}>Dövüş panellerini AI ile MP4 videoya dönüştür</div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
        <div
          onDrop={onDrop} onDragOver={e => e.preventDefault()}
          style={{ border: '2px dashed #3a2a5a', borderRadius: 14, padding: '32px 16px', textAlign: 'center', cursor: 'pointer', background: '#0f0f1e', marginBottom: 20, position: 'relative' }}>
          <input type="file" multiple accept="image/*" onChange={onDrop}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          <div style={{ fontSize: 36, marginBottom: 10 }}>🗡️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#bf7fff' }}>Manga panellerini buraya sürükle</div>
          <div style={{ fontSize: 12, color: '#5a4a7a', marginTop: 5 }}>JPG · PNG · WEBP — birden fazla seçebilirsin</div>
        </div>

        {error && (
          <div style={{ background: '#2a0a1a', border: '1px solid #5a1a3a', borderRadius: 12, padding: '14px 16px', marginBottom: 16, color: '#ff6688', fontSize: 13 }}>
            ❌ {error}
          </div>
        )}

        {panels.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#7a6a9a', fontWeight: 700, letterSpacing: 1 }}>PANELLER ({panels.length})</div>
              <button onClick={() => { setPanels([]); setVideoUrl(null); setStage('idle') }}
                style={{ background: 'none', border: '1px solid #3a2a5a', borderRadius: 6, color: '#7a6a9a', padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Temizle</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {panels.map((p, i) => {
                const il = p.analysis ? intLabel(p.analysis.intensity) : null
                return (
                  <div key={i} style={{ background: '#0f0f1e', border: '1px solid #2a1a4a', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 56, height: 42, borderRadius: 7, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', border: previewIdx === i ? '2px solid #7b2fff' : '2px solid transparent' }}
                      onClick={() => setPreviewIdx(previewIdx === i ? null : i)}>
                      <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      {p.analysis && (
                        <div style={{ fontSize: 11, color: '#5a4a7a', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ color: il.c, fontWeight: 700 }}>{il.t}</span>
                          <span>·</span><span>{p.analysis.motionType}</span>
                          <span>·</span><span>{p.analysis.duration}s</span>
                          <span>·</span><span style={{ color: '#9a8aaa' }}>{p.analysis.description}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {[[-1, '↑'], [1, '↓']].map(([d, icon]) => (
                        <button key={d} onClick={() => movePanel(i, d)}
                          style={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 6, color: '#9a8aaa', width: 26, height: 26, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</button>
                      ))}
                      <button onClick={() => setPanels(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ background: '#2a0a1a', border: '1px solid #5a1a3a', borderRadius: 6, color: '#ff4488', width: 26, height: 26, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                  </div>
                )
              })}
            </div>
            {previewIdx !== null && panels[previewIdx] && (
              <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid #3a2a5a', maxHeight: 260 }}>
                <img src={panels[previewIdx].url} alt="" style={{ width: '100%', objectFit: 'contain', display: 'block', background: '#000', maxHeight: 260 }} />
              </div>
            )}
          </div>
        )}

        {panels.length > 0 && stage === 'idle' && (
          <button onClick={generate}
            style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'linear-gradient(135deg,#7b2fff,#ff2f7b)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5, boxShadow: '0 4px 20px #7b2fff55', marginBottom: 20 }}>
            ⚡ MP4 VIDEO OLUŞTUR — {panels.length} Panel
          </button>
        )}

        {(stage === 'analyzing' || stage === 'rendering') && (
          <div style={{ background: '#0f0f1e', border: '1px solid #2a1a4a', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#bf7fff', fontWeight: 700 }}>{stage === 'analyzing' ? '🤖 AI Analiz' : '🎬 Render'}</div>
              <div style={{ fontSize: 13, color: '#7a6a9a' }}>{progress}%</div>
            </div>
            <div style={{ background: '#1a1a2e', borderRadius: 100, height: 6, marginBottom: 8, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 100, background: 'linear-gradient(90deg,#7b2fff,#ff2f7b)', width: `${progress}%`, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ fontSize: 12, color: '#5a4a7a' }}>{progressLabel}</div>
          </div>
        )}

        {stage === 'done' && videoUrl && (
          <div style={{ background: '#0f0f1e', border: '1px solid #2a1a4a', borderRadius: 14, padding: '18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span style={{ fontWeight: 700, color: '#44ff88' }}>Video hazır!</span>
            </div>
            <video src={videoUrl} controls playsInline
              style={{ width: '100%', borderRadius: 10, border: '1px solid #2a1a4a', marginBottom: 14, display: 'block', background: '#000' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={download}
                style={{ flex: 1, padding: '12px', borderRadius: 10, background: 'linear-gradient(135deg,#7b2fff,#ff2f7b)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                ⬇️ MP4 İndir
              </button>
              <button onClick={() => { setStage('idle'); setVideoUrl(null) }}
                style={{ padding: '12px 18px', borderRadius: 10, background: '#1a1a2e', border: '1px solid #3a2a5a', color: '#9a8aaa', fontSize: 14, cursor: 'pointer' }}>
                Yeni
              </button>
            </div>
          </div>
        )}

        {stage === 'idle' && panels.length === 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[
              { icon: '🗡️', t: 'Panel Yükle', d: 'Manga dövüş sahnelerini sırayla ekle' },
              { icon: '🤖', t: 'AI Analiz', d: 'Claude Vision her paneli analiz eder' },
              { icon: '🎬', t: 'MP4 İndir', d: 'ffmpeg ile iPhone\'da çalışan video' }
            ].map((x, i) => (
              <div key={i} style={{ background: '#0f0f1e', border: '1px solid #1a1a2e', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>{x.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#bf7fff', marginBottom: 4 }}>{x.t}</div>
                <div style={{ fontSize: 11, color: '#5a4a7a', lineHeight: 1.5 }}>{x.d}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
