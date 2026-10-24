/** Text-to-speech via the browser's built-in voices (works offline on iOS). */

let voice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'en-US' && /samantha|ava|allison|google us/i.test(v.name)) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  );
}

export function canSpeak(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

export function speak(text: string) {
  if (!canSpeak() || !text) return;
  if (voice === undefined || voice === null) voice = pickVoice();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  if (voice) u.voice = voice;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}
