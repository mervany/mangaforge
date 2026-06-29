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
      setProgressLabel(`🤖 Panel ${i + 1}/${analyzed.length} anal
