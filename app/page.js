'use client'
import { useState, useCallback, useRef } from 'react'

export default function Home() {
  const [image, setImage] = useState(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [stage, setStage] = useState('idle')
  const [progressLabel, setProgressLabel] = useState('')
  const [videoUrl, setVideoUrl] = useState(null)
  const [error, setError] = useState(null)
  const canvasRef = useRef(null)

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const file = (e.dataTransfer?.files || e.target.files)?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setImage(file)
    setImageUrl(URL.createObjectURL(file))
    setVideoUrl(null)
    setError(null)
  }, [])

  const toBase64 = f => new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(f)
  })

  const generate = async () => {
    if (!image) return
    setStage('processing'); setError(null); setVideoUrl(null)

    try {
      setProgressLabel('🤖 Görsel yükleniyor...')
      const b64 = await toBase64(image)

      setProgressLabel('🔍 Derinlik haritası oluşturuluyor...')
      const predRes = await fetch('/api/depth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: b64 })
      })
      const pred = await predRes.json()
      if (pred.error) throw new Error(pred.error)

      let depthUrl = null
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const pollRes = await fetch(`/api/depth?id=${pred.id}`)
        const pollData = await pollRes.json()
        if (pollData.status === 'succeeded') { depthUrl = pollData.output; break }
        if (pollData.status === 'failed') throw new Error('Depth map başarısız')
        setProgressLabel(`⏳ İşleniyor... ${i + 1}/30`)
      }
      if (!depthUrl) throw new Error('Zaman aşımı')

      setProgressLabel('🎬 Parallax video oluşturuluyor...')
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      const W = 854, H = 480
      canvas.width = W; canvas.height = H

      const loadImg = url => new Promise((res, rej) => {
        const img = new Image(); img.crossOrigin = 'anonymous'
        img.onload = () => res(img); img.onerror = rej; img.src = url
      })

      const [origImg, depthImg] = await Promise.all([
        loadImg(imageUrl),
        loadImg(Array.isArray(depthUrl) ? depthUrl[0] : depthUrl)
      ])

      const depthCanvas = document.createElement('canvas')
      depthCanvas.width = origImg.width; depthCanvas.height = origImg.height
      const dc = depthCanvas.getContext('2d')
      dc.drawImage(depthImg, 0, 0, origImg.width, origImg.height)
      const depthData = dc.getImageData(0, 0, origImg.width, origImg.height).data

      const FPS = 24, DURATION = 4
      const totalFrames = FPS * DURATION
      const frames = []

      for (let f = 0; f < totalFrames; f++) {
        const t = f / totalFrames
        const angle = t * Math.PI * 2
        const shiftX = Math.sin(angle) * 25
        const shiftY = Math.cos(angle) * 12

        ctx.clearRect(0, 0, W, H)
        ctx.drawImage(origImg, 0, 0, W, H)
        const imgData = ctx.getImageData(0, 0, W, H)
        const output = ctx.createImageData(W, H)

        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const srcX = Math.round(x / W * origImg.width)
            const srcY = Math.round(y / H * origImg.height)
            const di = (srcY * origImg.width + srcX) * 4
            const depth = depthData[di] / 255
            const dx = Math.round(x - shiftX * depth)
            const dy = Math.round(y - shiftY * depth)
            if (dx >= 0 && dx < W && dy >= 0 && dy < H) {
              const si = (dy * W + dx) * 4
              const oi = (y * W + x) * 4
              output.data[oi] = imgData.data[si]
              output.data[oi+1] = imgData.data[si+1]
              output.data[oi+2] = imgData.data[si+2]
              output.data[oi+3] = 255
            }
          }
        }
        ctx.putImageData(output, 0, 0)
        frames.push(canvas.toDataURL('image/jpeg', 0.8))
        if (f % 12 === 0) setProgressLabel(`🎬 Frame ${f}/${totalFrames}`)
        await new Promise(r => setTimeout(r, 0))
      }

      setProgressLabel('📼 Video encode ediliyor...')
      const stream = canvas.captureStream(FPS)
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      const chunks = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      await new Promise(resolve => {
        rec.onstop = resolve; rec.start()
        let fi = 0
        const next = () => {
          if (fi >= frames.length) { rec.stop(); return }
          const img = new Image()
          img.onload = () => { ctx.drawImage(img, 0, 0); fi++; setTimeout(next, 1000 / FPS) }
          img.src = frames[fi]
        }
        next()
      })

      const blob = new Blob(chunks, { type: 'video/webm' })
      setVideoUrl(URL.createObjectURL(blob))
      setProgressLabel('Tamamlandı!')
      setStage('done')
    } catch (err) {
      setError(err.message)
      setStage('idle')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080810', color: '#e8e8f0', fontFamily: 'system-ui' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div style={{ background: 'linear-gradient(135deg,#0d0d1a,#1a0a2e)', borderBottom: '1px solid #2a1a4a', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,#7b2fff,#ff2f7b)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🎬</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}><span style={{ color: '#bf7fff' }}>MANGA</span><span style={{ color: '#fff' }}>FORGE</span><span style={{ color: '#ff5599', marginLeft: 8, fontSize: 11, letterSpacing: 2 }}>3D PARALLAX</span></div>
          <div style={{ fontSize: 11, color: '#7a6a9a' }}>Manga panelini 3D parallax videoya dönüştür</div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
        <div onDrop={onDrop} onDragOver={e => e.preventDefault()}
          style={{ border: '2px dashed #3a2a5a', borderRadius: 14, padding: '32px 16px', textAlign: 'center', background: '#0f0f1e', marginBottom: 16, position: 'relative' }}>
          <input type="file" accept="image/*" onChange={onDrop} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          {imageUrl ? (
            <img src={imageUrl} alt="" style={{ maxHeight: 300, maxWidth: '100%', borderRadius: 10, display: 'block', margin: '0 auto' }} />
          ) : (
            <>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🗡️</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#bf7fff' }}>Manga panelini buraya sürükle</div>
              <div style={{ fontSize: 12, color: '#5a4a7a', marginTop: 5 }}>JPG · PNG · WEBP</div>
            </>
          )}
        </div>

        {error && <div style={{ background: '#2a0a1a', border: '1px solid #5a1a3a', borderRadius: 12, padding: 14, marginBottom: 16, color: '#ff6688', fontSize: 13 }}>❌ {error}</div>}

        {image && stage === 'idle' && (
          <button onClick={generate} style={{ width: '100%', padding: 14, borderRadius: 12, background: 'linear-gradient(135deg,#7b2fff,#ff2f7b)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', marginBottom: 16 }}>
            ⚡ 3D PARALLAX OLUŞTUR
          </button>
        )}

        {stage === 'processing' && (
          <div style={{ background: '#0f0f1e', border: '1px solid #2a1a4a', borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#bf7fff', fontWeight: 700, marginBottom: 8 }}>🔄 İşleniyor</div>
            <div style={{ fontSize: 12, color: '#5a4a7a' }}>{progressLabel}</div>
          </div>
        )}

        {stage === 'done' && videoUrl && (
          <div style={{ background: '#0f0f1e', border: '1px solid #2a1a4a', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8
