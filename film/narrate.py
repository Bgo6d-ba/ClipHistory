# Speaks script.md with a Piper voice, one sentence at a time, with pauses that grow at sentence, paragraph and section
# ends. Writes voice.wav (48 kHz mono) and voice.json: the start of every section and sentence, which the picture uses.
# usage: python3 narrate.py path/to/en_US-ryan-high.onnx
import json, re, sys, wave
import numpy as np
from piper import PiperVoice, SynthesisConfig

SR = 48000
SPOKEN = [
    ('ClipHistory', 'Clip History'), ('macOS 14', 'Mac O S fourteen'), ('macOS 26', 'Mac O S twenty six'), ('macOS', 'Mac O S'),
    ('API', 'A P I'), ('MIT', 'M I T'), ('Shift, Command, V', 'Shift, Command, V,'),
]
PAUSE = {'comma': 0.3, 'sentence': 0.24, 'paragraph': 0.48, 'section': 0.8}

def sections(md):
    out = []
    for block in re.split(r'^## ', md, flags=re.M)[1:]:
        title, *lines = block.split('\n')
        paras = [l.strip() for l in lines if l.strip() and not l.startswith('**On screen') and not l.startswith('---')]
        out.append({'title': re.sub(r'^\d+\.\s*', '', title.strip()), 'paras': paras})
    return out

def spoken(s):
    for a, b in SPOKEN: s = s.replace(a, b)
    return s

voice = PiperVoice.load(sys.argv[1])
def say(text, scale):
    cfg = SynthesisConfig(length_scale=scale, noise_scale=0.62, noise_w_scale=0.85)
    chunks = list(voice.synthesize(text, syn_config=cfg))
    a = np.concatenate([c.audio_float_array for c in chunks])
    sr = chunks[0].sample_rate
    x = np.linspace(0, len(a) - 1, int(len(a) * SR / sr))
    return np.interp(x, np.arange(len(a)), a).astype(np.float32)

audio, t, timing = [np.zeros(int(0.6 * SR), np.float32)], 0.6, []
for si, sec in enumerate(sections(open('script.md').read())):
    entry = {'title': sec['title'], 't': round(t, 3), 'lines': []}
    for pi, para in enumerate(sec['paras']):
        sentences = re.split(r'(?<=[.!?])\s+', para)
        for k, sent in enumerate(sentences):
            parts = sent.split('…')
            for j, part in enumerate(parts):
                if not part.strip(): continue
                scale = 0.9 + 0.04 * (((si * 7 + pi * 3 + k) % 5) / 4)
                a = say(spoken(part.strip()), scale)
                entry['lines'].append({'t': round(t, 3), 'd': round(len(a) / SR, 3), 'text': part.strip()})
                audio.append(a); t += len(a) / SR
                last = j == len(parts) - 1
                gap = PAUSE['comma'] if not last else PAUSE['section'] if (k == len(sentences) - 1 and pi == len(sec['paras']) - 1) \
                    else PAUSE['paragraph'] if k == len(sentences) - 1 else PAUSE['sentence']
                audio.append(np.zeros(int(gap * SR), np.float32)); t += gap
    timing.append(entry)

a = np.concatenate(audio + [np.zeros(int(2.5 * SR), np.float32)])
a *= 0.89 / np.abs(a).max()
with wave.open('voice.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a * 32767).astype('<i2').tobytes())
json.dump({'duration': round(len(a) / SR, 3), 'sections': timing}, open('voice.json', 'w'), indent=1)
print(f'voice.wav {len(a) / SR:.1f}s, {sum(len(s["lines"]) for s in timing)} lines')
for s in timing: print(f'{s["t"]:7.2f}  {s["title"]}')
