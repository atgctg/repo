let voice: HTMLAudioElement | null = null
let voiceOwner: string | null = null

function stopVoice(): void {
  voice?.pause()
  voice = null
  voiceOwner = null
}

export function toggleVoice(owner: string, src: string): void {
  if (voice && voiceOwner === owner && !voice.paused) {
    voice.pause()
    return
  }
  stopVoice()
  const audio = new Audio(src)
  voice = audio
  voiceOwner = owner
  audio.onended = () => {
    if (voice === audio) {
      voice = null
      voiceOwner = null
    }
  }
  void audio.play().catch(() => {
    if (voice === audio) {
      voice = null
      voiceOwner = null
    }
  })
}

export function toggleVideo(video: HTMLVideoElement): void {
  if (video.paused) void video.play().catch(() => undefined)
  else video.pause()
}
