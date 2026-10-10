#!/usr/bin/env python3
"""Pre-generate mp3 audio (normal + slow) for every word & sentence in public/content.json.
Usage: python3 scripts/gen_audio.py   (re-run after editing content; existing files are skipped)"""
import asyncio, hashlib, json, os, re, sys
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
OUT = os.path.join(PUB, 'audio')
SLOW_RATE = '-35%'

def clean(s):
    s = re.sub(r'\([^)]*\)', '', s)  # drop hints like (drink) or (书在我手里)
    return re.sub(r'\s+', ' ', s).strip()

def collect(c):
    V = c['voices']; dv = V['default']
    items = {}  # text -> voice (plain-text key)
    lines = set()  # (voice, text) for story/skit lines: voice-specific + word timings
    def add(t, voice=None):
        t = clean(t)
        if t and t not in items: items[t] = voice or dv
    for u in c['units']:
        for l in u['story']['lines'] + [l for s in u.get('skits', []) for l in s['lines']]:
            add(l['en'], V.get(l['speaker']))
            lines.add((V.get(l['speaker'], dv), clean(l['en'])))
    for u in c['units']:
        for w in u['words']:
            add(w['en']); add(w['example']['en'])
        for p in u['grammar']['points']:
            for e in p['examples']: add(e['en'])
        for f in u['fill']: add(f['q'].replace('___', f['answer']))
        for t in u['translate']: add(t['answers'][0])
        for s in u['shadow']: add(s)
        for d in u['dictation']: add(d['en'])
        for w in u['words']:
            for r in w.get('ety', {}).get('related', []): add(r['en'])
        for sk in u.get('skits', []):
            for pt in sk['points']:
                for d in pt['drill']:
                    add(d)
                    for part in d.split(' / '): add(part)
    names = {'i': 'I', 'tom': 'Tom', 'li': 'Li', 'amy': 'Amy', "amy's": "Amy's", 'ok': 'OK',
             "i'm": "I'm"}
    for k in c['glossary']: add(names.get(k, k))
    return items, lines

def fname(text, voice):
    return hashlib.sha1((voice + '|' + text).encode()).hexdigest()[:12]

TIMINGS = {}
async def tts(text, voice, path, rate):
    for attempt in range(4):
        try:
            com = edge_tts.Communicate(text, voice, rate=rate, boundary='WordBoundary')
            marks = []
            with open(path + '.tmp', 'wb') as fh:
                async for ch in com.stream():
                    if ch['type'] == 'audio': fh.write(ch['data'])
                    elif ch['type'] == 'WordBoundary':
                        marks.append([round(ch['offset'] / 1e7, 3), round((ch['offset'] + ch['duration']) / 1e7, 3), ch['text']])
            if os.path.getsize(path + '.tmp') > 500:
                os.replace(path + '.tmp', path)
                TIMINGS[os.path.basename(path)[:-4]] = marks
                return True
        except Exception as e:
            print('retry', text, e, file=sys.stderr)
        await asyncio.sleep(1 + attempt * 2)
    return False

async def main():
    c = json.load(open(os.path.join(PUB, 'content.json')))
    items, lines = collect(c)
    tp = os.path.join(OUT, 'timings.json')
    if os.path.exists(tp): TIMINGS.update(json.load(open(tp)))
    os.makedirs(OUT, exist_ok=True)
    sem = asyncio.Semaphore(6)
    manifest, fails = {}, []
    need_t = {fname(t, v) for v, t in lines}
    async def job(text, voice, key=None):
        f = fname(text, voice)
        for suffix, rate in (('', '+0%'), ('-slow', SLOW_RATE)):
            p = os.path.join(OUT, f + suffix + '.mp3')
            if not os.path.exists(p) or (f in need_t and (f + suffix) not in TIMINGS):
                async with sem:
                    if not await tts(text, voice, p, rate): fails.append(text)
        manifest[key or text] = f
    await asyncio.gather(*(job(t, v) for t, v in items.items()), *(job(t, v, v + '|' + t) for v, t in lines))
    # lowercase aliases for word taps
    for t, f in list(manifest.items()):
        if '|' not in t: manifest.setdefault(t.lower(), f)
    json.dump({k: v for k, v in TIMINGS.items() if k.split('-')[0] in need_t}, open(tp, 'w'))
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), ensure_ascii=False, indent=0, sort_keys=True)
    print(f'{len(items)} texts, {len(os.listdir(OUT))} files, fails={fails}')

asyncio.run(main())
