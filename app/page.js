'use client'
import { useState, useCallback, useRef } from 'react'

async function analyzePanel(base64, mediaType) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: `Analyze this manga fight panel. Return ONLY valid JSON:
{"intensity":7,"motionType":"slash","direction":"right","effectColor":"#ff4444","duration":2.0,"description":"Dövüş sahnesi","flashColor":"#ffffff"}` }
        ]
      }]
    })
  })
  const data = await response.json()
  const text = data.content?.map(b => b.text || '').join('') || ''
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()) }
  catch { return { intensity: 6, motionType: 'slash', direction: 'right', effectColor: '#ff4444', duration: 2.0, description: 'Dövüş', flashColor: '#ffffff' } }
}

function renderPanelFrames(img, analysis, canvas, ctx, fps) {
  const W = canvas.width, H = canvas.height
  const total = Math.round(analysis.duration * fps)
  const frames = []
  for (let f = 0; f < total; f++) {
    const t = f / total
    ctx.clearRect(0, 0, W, H)
    const ir = img.width / img.height, cr = W / H
    let dw, dh, dx, dy
    if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0 }
    else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2 }
    let sx = 0, sy = 0
    if (analysis.intensity >= 6 && t < 0.5) { const s = (0.5 - t) * analysis.intensity * 2; sx = (Math.random() - 0.5) * s; sy = (Math.random() - 0.5) * s }
    ctx.save(); ctx.translate(sx, sy)
    let scale = 1
    if (t < 0.2) scale = 1 + t * 0.1
    else if (t < 0.4) scale = 1.02 - (t - 0.2) * 0.05
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(scale, scale); ctx.translate(-W / 2, -H / 2)
    ctx.drawImage(img, dx, dy, dw, dh); ctx.restore()
    if (analysis.intensity >= 5 && t < 0.5) {
      const a = (0.5 - t) * (analysis.intensity / 10) * 0.7
      const angle = analysis.direction === 'right' ? 0 : analysis.direction === 'left' ? Math.PI : analysis.direction === 'up' ? -Math.PI / 2 : Math.PI / 2
      ctx.save(); ctx.globalAlpha = a
      for (let i = 0; i < analysis.intensity * 3; i++) {
        const sp = (Math.random() - 0.5) * H * 1.4, len = 60 + Math.random() * 180
        const x1 = W / 2 - Math.cos(angle) * len * 0.5, y1 = H / 2 + sp - Math.sin(angle) * len * 0.5
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len)
        ctx.strokeStyle = analysis.effectColor; ctx.lineWidth = 0.5 + Math.random() * 1.5; ctx.stroke()
      }
      ctx.restore()
    }
    if (analysis.flashColor && t < 0.08) { ctx.save(); ctx.globalAlpha = (0.08 - t) / 0.08 * 0.8; ctx.fillStyle = analysis.flashColor; ctx.fillRect(0, 0, W, H); ctx.restore() }
    ctx.restore()
    frames.push(canvas.toDataURL('image/jpeg', 0.8))
  }
  return frames
}

export default function Home() {
  const [panels, setPanels] = useState([])
  const [stage, setStage] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [videoUrl, setVideoUrl] = useState(null)
  const [error, setError] = useState(null)
  const canvasRef = useRef(null)

  const toBase64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(f) })
  const getMediaType = f => f.type || (f.name.endsWith('.png') ? 'image/png' : 'image/jpeg')
  const loadImg = url => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = url })

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || e.target.files || []).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    setPanels(prev => [...prev, ...files.map(f => ({ file: f, url: URL.createObjectURL(f), name: f.name, analysis: null }))])
  }, [])

  const generate = async () => {
    if (!panels.length) return
    setStage('analyzing'); setProgress(0); setError(null); setVideoUrl(null)
    const analyzed = [...panels]
    for (let i = 0; i < analyzed.length; i++) {
      setProgressLabel(`🤖 Panel ${i + 1}/${analyzed.length} analiz ediliyor...`)
      try {
        const b64 = await toBase64(analyzed[i].file)
        analyzed[i].analysis = await analyzePanel(b64, getMediaType(analyzed[i].file))
      } catch {
        analyzed[i].analysis = { intensity: 6, motionType: 'slash', direction: 'right', effectColor: '#ff4444', duration: 2.0, description: 'Dövüş', flashColor: '#ffffff' }
      }
      setProgress(Math.round((i + 1) / analyzed.length * 35))
    }
    setPanels([...analyzed])
    setStage('rendering')
    const canvas = canvasRef.current
    canvas.width = 854; canvas.height = 480
    const ctx = canvas.getContext('2d')
    const fps = 24
    const allFrames = []
    for (let i = 0; i < analyzed.length; i++) {
      setProgressLabel(`🎬 Panel ${i + 1}/${analyzed.length} render ediliyor...`)
      const img = await loadImg(analyzed[i].url)
      allFrames.push(...renderPanelFrames(img, analyzed[i].analysis, canvas, ctx, fps))
      if (i < analyzed.length - 1) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 854, 480)
        for (let t = 0; t < 6; t++) allFrames.push(canvas.toDataURL('image/jpeg', 0.8))
      }
      setProgress(35 + Math.round((i + 1) / analyzed.length * 50))
    }
    setProgressLabel('🎞️ Video encode ediliyor...')
    setProgress(88)
    try {
      const stream = canvas.captureStream(fps)
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      const chunks = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      await new Promise(resolve => {
        rec.onstop = resolve; rec.start()
        let fi = 0
        const next = () => {
          if (fi >= allFrames.length) { rec.stop(); return }
          const img = new Image()
          img.onload = () => { ctx.drawImage(img, 0, 0); fi++; setTimeout(next, 1000 / fps) }
          img.src = allFrames[fi]
        }
        next()
      })
      const blob = new Blob(chunks, { type: 'video/webm' })
      setVideoUrl(URL.createObjectURL(blob))
      setProgress(100); setProgressLabel('Tamamlandı!'); setStage('done')
    } catch (err) {
      setError('Video encode hatası: ' + err.message); setStage('idle')
    }
  }

  const intLabel = n => n >= 9 ? { t: 'GODLIKE', c: '#ff0055' } : n >= 7 ? { t: 'YOĞUN', c: '#ff6600' } : n >= 5 ? { t: 'ORTA', c: '#ffcc00' } : { t: 'HAFİF', c: '#44ff88' }

  return (
    <div style={{ minHeight: '100vh', background: '#080810', color: '#e8e8f0', fontFamily: 'system-ui' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div style={{ background: 'linear-gradient(135deg,#0d0d1a,#1a0a2e)', borderBottom: '1px solid #2a1a4a', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,#7b2fff,#ff2f7b)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}><span style={{ color: '#bf7fff' }}>MANGA</span><span style={{ color: '#fff' }}>FORGE</span><span style={{ color: '#ff5599', marginLeft: 8, fontSize: 11, letterSpacing: 2 }}>AI VIDEO</span></div>
          <div style={{ fontSize: 11, color: '#7a6a9a' }}>Dövüş panellerini AI ile videoya dönüştür</div>
        </div>
      </div>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
        <div onDrop={onDrop} onDragOver={e => e.preventDefault()} style={{ border: '2px dashed #3a2a5a', borderRadius: 14, padding: '32px 16px', textAlign: 'center', background: '#0f0f1e', marginBottom: 20, position: 'relative' }}>
          <input type="file" multiple accept="image/*" onChange={onDrop} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          <div style={{ fontSize: 36, marginBottom: 10 }}>🗡️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#bf7fff' }}>Manga panellerini buraya sürükle</div>
          <div style={{ fontSize: 12, color: '#5a4a7a', marginTop: 5 }}>JPG · PNG · WEBP</div>
        </div>
        {error && <div style={{ background: '#2a0a1a', border: '1px solid #5a1a3a', borderRadius: 12, padding: 14, marginBottom: 16, color: '#ff6688', fontSize: 13 }}>❌ {error}</div>}
        {panels.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#7a6a9a', fontWeight: 700 }}>PANELLER ({panels.length})</div>
              <button onClick={() => { setPanels([]); setVideoUrl(null); setStage('idle') }} style={{ background: 'none', border: '1px solid #3a2a5a', borderRadius: 6, color: '#7a6a9a', padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Temizle</button>
            </div>
            {panels.map((p, i) => {
              const il = p.analysis ? intLabel(p.analysis.intensity) : null
              return (
                <div key={i} style={{ background: '#0f0f1e', border: '1px solid #2a1a4a', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <img src={p.url} alt="" style={{ width: 56, height: 42, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    {p.analysis && <div style={{ fontSize: 11, color: '#5a4a7a', marginTop: 2 }}><span style={{ color: il.c, fontWeight: 700 }}>{il.t}</span> · {p.analysis.motionType} · {p.analysis.description}</div>}
                  </div>
                  <button onClick={() => setPanels(prev => prev.filter((_, idx) => idx !== i))} style={{ background: '#2a0a1a', border: '1px solid #5a1a3a', borderRadius: 6, color: '#ff4488', width: 26, height: 26, cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              )
            })}
          </div>
        )}
        {panels.length > 0 && stage === 'idle' && (
          <button onClick={generate} style={{ width: '100%', padding: 14, borderRadius: 12, background: 'linear-gradient(135deg,#7b2fff,#ff2f7b)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', marginBottom: 20 }}>
            ⚡ VİDEO OLUŞTUR — {panels.length} Panel
          </button>
        )}
        {(stage === 'analyzing' || stage === 'rendering') && (
          <div style={{ background: '#0f0f1e', border: '1px solid #2a1a4a', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#bf7fff', fontWeight: 700 }}>{stage === 'analyzing' ? '🤖 AI Analiz' : '🎬 Render'}</div>
              <div style={{ fontSize: 13, color: '#7a6a9a' }}>{progress}%</div>
            </div>
            <div style={{ background: '#1a1a2e', borderRadius: 100, height: 6, marginBottom: 8, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 100, background: 'linear-gradient(90deg,#7b2fff,#ff2f7b)', width: `${progress}%`, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#5a4a7a' }}>{progressLabel}</div>
          </div>
        )}
        {stage === 'done' && videoUrl && (
          <div style={{ background: '#0f0f1e', border: '1px solid #2a1a4a', borderRadius: 14, padding: 18, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span>✅</span><span style={{ fontWeight: 700, color: '#44ff88' }}>Video hazır!</span>
            </div>
            <video src={videoUrl} controls playsInline style={{ width: '100%', borderRadius: 10, marginBottom: 14, background: '#000' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { const a = document.createElement('a'); a.href = videoUrl; a.download = `manga-${Date.now()}.webm`; a.click() }}
                style={{ flex: 1, padding: 12, borderRadius: 10, background: 'linear-gradient(135deg,#7b2fff,#ff2f7b)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>⬇️ İndir</button>
              <button onClick={() => { setStage('idle'); setVideoUrl(null) }} style={{ padding: '12px 18px', borderRadius: 10, background: '#1a1a2e', border: '1px solid #3a2a5a', color: '#9a8aaa', fontSize: 14, cursor: 'pointer' }}>Yeni</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
