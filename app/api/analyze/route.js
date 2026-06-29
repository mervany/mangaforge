import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const { base64, mediaType } = await req.json()

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 }
          },
          {
            type: 'text',
            text: `Analyze this manga fight panel. Return ONLY valid JSON, no markdown:
{
  "intensity": 1-10,
  "motionType": "slash|punch|explosion|charge|dodge|impact|ki_blast|speed_lines",
  "direction": "left|right|up|down|center",
  "effectColor": "#hex",
  "duration": 1.5-3.5,
  "description": "Türkçe kısa açıklama",
  "zoomPulse": true,
  "screenShake": true,
  "flashColor": "#ffffff"
}`
          }
        ]
      }]
    })

    const text = message.content.map(b => b.text || '').join('')
    const clean = text.replace(/```json|```/g, '').trim()
    const analysis = JSON.parse(clean)
    return Response.json({ success: true, analysis })
  } catch (err) {
    return Response.json({
      success: true,
      analysis: {
        intensity: 6, motionType: 'slash', direction: 'right',
        effectColor: '#ff4444', duration: 2.0, description: 'Dövüş sahnesi',
        zoomPulse: true, screenShake: true, flashColor: '#ffffff'
      }
    })
  }
}
