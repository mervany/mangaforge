import { writeFile, mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import sharp from 'sharp'

const execAsync = promisify(exec)

async function renderFrame(imgBuffer, analysis, frameIndex, totalFrames, W, H) {
  const t = frameIndex / totalFrames

  // resize image to exact canvas size first
  const resized = await sharp(imgBuffer)
    .resize(W, H, { fit: 'cover', position: 'center' })
    .toBuffer()

  let base = resized

  // flash overlay
  if (analysis.flashColor && t < 0.1) {
    const alpha = Math.round((0.1 - t) / 0.1 * 160)
    const hex = (analysis.flashColor || '#ffffff').replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16) || 255
    const g = parseInt(hex.slice(2, 4), 16) || 255
    const b = parseInt(hex.slice(4, 6), 16) || 255
    const flash = await sharp({
      create: { width: W, height: H, channels: 4, background: { r, g, b, alpha } }
    }).png().toBuffer()
    base = await sharp(base).composite([{ input: flash, blend: 'over' }]).jpeg({ quality: 85 }).toBuffer()
  }

  // speed lines
  if (analysis.intensity >= 5 && t < 0.5) {
    const lineAlpha = ((0.5 - t) / 0.5) * (analysis.intensity / 10) * 0.55
    const hexColor = analysis.effectColor || '#ff4444'
    const angle = analysis.direction === 'right' ? 0
      : analysis.direction === 'left' ? Math.PI
      : analysis.direction === 'up' ? -Math.PI / 2 : Math.PI / 2
    let lines = ''
    for (let i = 0; i < Math.floor(analysis.intensity * 3); i++) {
      const spread = (Math.random() - 0.5) * H * 1.4
      const len = 60 + Math.random() * 180
      const x1 = W / 2 - Math.cos(angle) * len * 0.5
      const y1 = H / 2 + spread - Math.sin(angle) * len * 0.5
      lines += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(x1 + Math.cos(angle) * len).toFixed(1)}" y2="${(y1 + Math.sin(angle) * len).toFixed(1)}" stroke="${hexColor}" stroke-width="${(0.5 + Math.random() * 1.5).toFixed(1)}" opacity="${lineAlpha.toFixed(2)}"/>`
    }
    const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`)
    base = await sharp(base).composite([{ input: svg, blend: 'over' }]).jpeg({ quality: 85 }).toBuffer()
  } else {
    base = await sharp(base).jpeg({ quality: 85 }).toBuffer()
  }

  return base
}

export async function POST(req) {
  const sessionId = Date.now().toString()
  const sessionDir = join('/tmp', sessionId)
  try {
    const { panels } = await req.json()
    if (!panels?.length) return Response.json({ error: 'No panels' }, { status: 400 })

    await mkdir(sessionDir, { recursive: true })
    const FPS = 24, W = 854, H = 480
    let fi = 0

    for (let pi = 0; pi < panels.length; pi++) {
      const { base64, analysis } = panels[pi]
      const imgBuffer = Buffer.from(base64, 'base64')
      const totalFrames = Math.round((analysis.duration || 2) * FPS)

      for (let f = 0; f < totalFrames; f++) {
        const frame = await renderFrame(imgBuffer, analysis, f, totalFrames, W, H)
        await writeFile(join(sessionDir, `frame${String(fi).padStart(6, '0')}.jpg`), frame)
        fi++
      }

      if (pi < panels.length - 1) {
        const black = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer()
        for (let t = 0; t < 6; t++) {
          await writeFile(join(sessionDir, `frame${String(fi).padStart(6, '0')}.jpg`), black)
          fi++
        }
      }
    }

    const out = join(sessionDir, 'out.mp4')
    await execAsync(`ffmpeg -y -framerate ${FPS} -i "${sessionDir}/frame%06d.jpg" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 "${out}"`)
    const video = await readFile(out)
    rm(sessionDir, { recursive: true, force: true }).catch(() => {})
    return Response.json({ success: true, video: video.toString('base64') })
  } catch (err) {
    rm(sessionDir, { recursive: true, force: true }).catch(() => {})
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export const maxDuration = 60
