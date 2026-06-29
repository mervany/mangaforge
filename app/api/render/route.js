import { writeFile, mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import sharp from 'sharp'

const execAsync = promisify(exec)

async function renderFrame(imgBuffer, analysis, frameIndex, totalFrames, W, H) {
  const t = frameIndex / totalFrames
  let scale = 1
  if (analysis.zoomPulse) {
    if (t < 0.2) scale = 1 + t * 0.12
    else if (t < 0.4) scale = 1.024 - (t - 0.2) * 0.06
  }
  let sx = 0, sy = 0
  if (analysis.screenShake && analysis.intensity >= 6 && t < 0.5) {
    const mag = (0.5 - t) * analysis.intensity * 1.5
    sx = Math.round((Math.random() - 0.5) * mag)
    sy = Math.round((Math.random() - 0.5) * mag)
  }
  const scaledW = Math.round(W * scale)
  const scaledH = Math.round(H * scale)
  const offsetX = Math.round((W - scaledW) / 2) + sx
  const offsetY = Math.round((H - scaledH) / 2) + sy

  let base = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer()
  const resized = await sharp(imgBuffer).resize(scaledW, scaledH, { fit: 'cover' }).toBuffer()
  base = await sharp(base).composite([{ input: resized, left: offsetX, top: offsetY }]).jpeg({ quality: 85 }).toBuffer()

  if (analysis.flashColor && t < 0.1) {
    const alpha = Math.round((0.1 - t) / 0.1 * 180)
    const hex = analysis.flashColor.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const flashOverlay = await sharp({ create: { width: W, height: H, channels: 4, background: { r, g, b, alpha } } }).png().toBuffer()
  const safeLeft = Math.max(0, Math.min(offsetX, W - 1))
const safeTop = Math.max(0, Math.min(offsetY, H - 1))
base = await sharp(base).composite([{ input: resized, left: safeLeft, top: safeTop }]).jpeg({ quality: 85 }).toBuffer()
  }

  if (analysis.intensity >= 5 && t < 0.5) {
    const lineAlpha = ((0.5 - t) / 0.5) * (analysis.intensity / 10) * 0.6
    const hexColor = analysis.effectColor || '#ff4444'
    const angle = analysis.direction === 'right' ? 0 : analysis.direction === 'left' ? Math.PI : analysis.direction === 'up' ? -Math.PI / 2 : Math.PI / 2
    const lineCount = Math.floor(analysis.intensity * 3)
    let lines = ''
    for (let i = 0; i < lineCount; i++) {
      const spread = (Math.random() - 0.5) * H * 1.4
      const len = 60 + Math.random() * 180
      const sx2 = W / 2 - Math.cos(angle) * len * 0.5
      const sy2 = H / 2 + spread - Math.sin(angle) * len * 0.5
      const ex = sx2 + Math.cos(angle) * len
      const ey = sy2 + Math.sin(angle) * len
      lines += `<line x1="${sx2.toFixed(1)}" y1="${sy2.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${hexColor}" stroke-width="${(0.5 + Math.random() * 1.5).toFixed(1)}" opacity="${lineAlpha.toFixed(2)}"/>`
    }
    const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`)
    base = await sharp(base).composite([{ input: svg, blend: 'over' }]).jpeg({ quality: 85 }).toBuffer()
  }

  return base
}

export async function POST(req) {
  const sessionId = Date.now().toString()
  const sessionDir = join('/tmp', sessionId)
  try {
    const { panels } = await req.json()
    if (!panels || !panels.length) return Response.json({ error: 'No panels' }, { status: 400 })

    await mkdir(sessionDir, { recursive: true })
    const FPS = 24, W = 854, H = 480
    let frameIndex = 0

    for (let pi = 0; pi < panels.length; pi++) {
      const { base64, mediaType, analysis } = panels[pi]
      const imgBuffer = Buffer.from(base64, 'base64')
      const totalFrames = Math.round(analysis.duration * FPS)
      for (let f = 0; f < totalFrames; f++) {
        const frameBuffer = await renderFrame(imgBuffer, analysis, f, totalFrames, W, H)
        await writeFile(join(sessionDir, `frame${String(frameIndex).padStart(6, '0')}.jpg`), frameBuffer)
        frameIndex++
      }
      if (pi < panels.length - 1) {
        const blackBuf = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer()
        for (let t = 0; t < 6; t++) {
          await writeFile(join(sessionDir, `frame${String(frameIndex).padStart(6, '0')}.jpg`), blackBuf)
          frameIndex++
        }
      }
    }

    const outputPath = join(sessionDir, 'output.mp4')
    await execAsync(`ffmpeg -y -framerate ${FPS} -i "${sessionDir}/frame%06d.jpg" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 "${outputPath}"`)
    const videoBuffer = await readFile(outputPath)
    rm(sessionDir, { recursive: true, force: true }).catch(() => {})
    return Response.json({ success: true, video: videoBuffer.toString('base64'), mimeType: 'video/mp4' })
  } catch (err) {
    rm(sessionDir, { recursive: true, force: true }).catch(() => {})
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export const maxDuration = 60
