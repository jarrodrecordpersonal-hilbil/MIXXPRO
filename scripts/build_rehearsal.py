"""Render the fictional 90s rehearsal from the same cue sheet used by the game.
Build-only dependencies: Python + Pillow, FFmpeg, espeak-ng (espeak fallback), DejaVu.
No network assets, model downloads, live results or external API credentials.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import array, json, math, shutil, subprocess, tempfile, wave

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'apps/web/public/rehearsal'
E=json.loads((OUT/'episode.json').read_text())
W,H,FPS=1280,720,12
INK='#171514'; CREAM='#fff7ee'; RED='#f15e39'; MUTED='#cdbfb3'
FONT=Path('/usr/share/fonts/truetype/dejavu')
if not FONT.exists(): raise RuntimeError('Install fonts-dejavu-core for the media build.')
BOLD=lambda n: ImageFont.truetype(str(FONT/'DejaVuSans-Bold.ttf'),n)
REG=lambda n: ImageFont.truetype(str(FONT/'DejaVuSans.ttf'),n)
BG=Image.open(ROOT/'apps/web/public/bg-media/bourbon-games.png').convert('RGBA')
MT=Image.open(ROOT/'apps/web/public/bg-media/mixx-tank.png').convert('RGBA')
VOICE=shutil.which('espeak-ng') or shutil.which('espeak')
if not VOICE or not shutil.which('ffmpeg'):raise RuntimeError('Install ffmpeg and espeak-ng first.')
q=E['question']
assert E['duration']==90 and 0<q['open']<q['close']<q['reveal']<90
assert q['close']-q['open']==20
assert E['scenes'][0]['start']==0 and E['scenes'][-1]['end']==90
for left,right in zip(E['scenes'],E['scenes'][1:]): assert left['end']==right['start']

def text(draw,xy,value,font,fill=CREAM):draw.text(xy,value,font=font,fill=fill)
def center(draw,y,value,font,fill=CREAM):
    box=draw.textbbox((0,0),value,font=font);text(draw,((W-(box[2]-box[0]))/2,y),value,font,fill)
def logo(im,source,xy,size):
    image=source.copy();image.thumbnail(size,Image.Resampling.LANCZOS);im.alpha_composite(image,xy)
def draw_bottle(draw,x,y,label):
    draw.rounded_rectangle((x+46,y,x+94,y+36),radius=5,fill='#d2b69e')
    draw.rounded_rectangle((x+40,y+31,x+100,y+76),radius=6,fill='#8e562b',outline='#e3c0a0',width=2)
    draw.rounded_rectangle((x,y+62,x+140,y+253),radius=18,fill='#945a2c',outline='#d9b395',width=3)
    draw.rounded_rectangle((x+8,y+135,x+132,y+224),radius=4,fill=CREAM)
    text(draw,(x+18,y+144),'SAMPLE',BOLD(17),INK);text(draw,(x+17,y+168),label,BOLD(42),INK)
def backdrop(cue):
    im=Image.new('RGBA',(W,H),INK);d=ImageDraw.Draw(im)
    d.rectangle((0,0,W,104),fill=CREAM);logo(im,BG,(44,10),(188,88));logo(im,MT,(1104,13),(113,78))
    text(d,(267,34),'THE PRACTICE ROUND',BOLD(22),INK)
    d.rectangle((0,104,W,111),fill=RED)
    text(d,(48,130),'FICTIONAL DEMO  /  NOT LIVE JUDGING',BOLD(17),MUTED)
    k=cue['kind']
    if k in ('sample101','sample102'):
        choice=q['choices'][0 if k=='sample101' else 1];draw_bottle(d,955,222,choice['id'])
        text(d,(55,246),cue['heading'],BOLD(60));text(d,(58,335),cue['subheading'],REG(30))
        text(d,(58,406),'A different direction. Your decision.',REG(24),MUTED)
    elif k in ('question','prompt'):
        center(d,195,cue['heading'],BOLD(59))
        for x,c in [(74,q['choices'][0]),(685,q['choices'][1])]:
            d.rounded_rectangle((x,309,x+520,469),radius=9,fill='#2b2521',outline='#7c685b',width=2)
            text(d,(x+29,332),c['name'],BOLD(43));text(d,(x+30,404),c['profile'],REG(25),MUTED)
        center(d,509,cue['subheading'],REG(26),MUTED)
    elif k=='reveal':
        center(d,189,'SAMPLE 102 WINS',BOLD(67))
        for x,c in [(208,q['choices'][0]),(728,q['choices'][1])]:
            text(d,(x,310),c['name'].upper(),BOLD(25),MUTED)
            text(d,(x+12,350),str(c['score']),BOLD(119),RED if c['id']==q['correct'] else CREAM)
        center(d,512,'Your practice points are below the video.',REG(28),MUTED)
    else:
        center(d,245,cue['heading'],BOLD(64));center(d,350,cue['subheading'],REG(31),MUTED)
        if k=='welcome':center(d,454,'NO KIT. NO CODE. NO LOGIN.',BOLD(22),RED)
        if k=='locked':center(d,461,'NO MORE CHANGES THIS RUN',BOLD(23),RED)
        if k=='finish':center(d,454,'PRACTICE POINTS ≠ LIVE SCORES',BOLD(24),RED)
    d.line((48,617,W-48,617),fill='#736154',width=1)
    text(d,(48,643),'MIXX TANK  ·  BOURBON GAMES  ·  21+',BOLD(17),MUTED)
    return im.convert('RGB')

def stamp(t):
    m,s=divmod(t,60);return f'{int(m):02d}:{int(s):02d}.{int((t%1)*1000):03d}'
with tempfile.TemporaryDirectory(prefix='bg-film-') as temp:
    temp=Path(temp);rate=22050;audio=array.array('h',[0])*int(E['duration']*rate);captions=['WEBVTT',''];script=['# Bourbon Games — 90-second interactive rehearsal','','Fictional practice only. Synthetic scratch narration; replace it with an approved host recording for release. No live outcomes or prizes.','','## Cue sheet','',f'Question opens **0:{q["open"]:02d}**, closes **0:{q["close"]:02d}**, reveal **1:{q["reveal"]-60:02d}**.','The video clock controls this practice run only. Live competition continues to use server/host deadlines.','']
    for n,cue in enumerate(E['scenes']):
        raw=temp/f'voice-{n}.wav';subprocess.run([VOICE,'-v','en-us','-s','165','-p','42','-w',str(raw),cue['narration']],check=True)
        with wave.open(str(raw)) as f:dur=f.getnframes()/f.getframerate()
        budget=cue['end']-cue['start']-.75
        if dur>budget:
            paced=temp/f'paced-{n}.wav'
            subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(raw),'-af',f'atempo={dur/budget:.5f}','-ar',str(rate),'-ac','1',str(paced)],check=True);raw=paced
        with wave.open(str(raw)) as f:
            assert f.getnchannels()==1 and f.getsampwidth()==2 and f.getframerate()==rate
            frames=array.array('h',f.readframes(f.getnframes()));duration=len(frames)/rate
        begin=int((cue['start']+.30)*rate);assert begin+len(frames)<=int(cue['end']*rate)
        audio[begin:begin+len(frames)]=frames
        words=cue['narration'].split();chunks=[' '.join(words[i:i+10]) for i in range(0,len(words),10)]
        for j,chunk in enumerate(chunks):captions += [f'00:{stamp(cue["start"]+.30+j*duration/len(chunks))} --> 00:{stamp(cue["start"]+.30+(j+1)*duration/len(chunks))}',chunk,'']
        script += [f'### {int(cue["start"])//60}:{int(cue["start"])%60:02d}–{int(cue["end"])//60}:{int(cue["end"])%60:02d} | {cue["heading"]}',f'**HOST:** {cue["narration"]}',f'**ON SCREEN:** {cue["subheading"]}','']
    # Original short signal tones, not licensed music or voice impersonation.
    for start,freq in [(34,660),(54,330),(62,880)]:
        for i in range(int(.16*rate)):
            idx=int(start*rate)+i;v=int(1900*math.sin(2*math.pi*freq*i/rate)*(1-i/(.16*rate)))
            audio[idx]=max(-32768,min(32767,audio[idx]+v))
    wav=temp/'narration.wav'
    with wave.open(str(wav),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(audio.tobytes())
    (OUT/'captions.vtt').write_text('\n'.join(captions)+'\n')
    (OUT/'script.md').write_text('\n'.join(script)+'\n')
    plates={cue['kind']:backdrop(cue) for cue in E['scenes']}
    plates['welcome'].save(OUT/'poster.png',optimize=True)
    cmd=['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-i',str(wav),'-c:v','libx264','-preset','veryfast','-crf','27','-pix_fmt','yuv420p','-g','24','-threads','2','-c:a','aac','-b:a','64k','-af','loudnorm=I=-18:TP=-1.5:LRA=11','-movflags','+faststart','-t',str(E['duration']),str(OUT/'episode.mp4')]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for i in range(int(E['duration']*FPS)):
            t=i/FPS;cue=next(c for c in E['scenes'] if c['start']<=t<c['end']);im=plates[cue['kind']].copy();d=ImageDraw.Draw(im)
            d.rectangle((0,H-8,int(W*t/E['duration']),H),fill=RED)
            text(d,(1104,639),f'{int(t)//60}:{int(t)%60:02d} / 1:30',REG(18),MUTED)
            if q['open']<=t<q['close']:
                remaining=math.ceil(q['close']-t);d.rounded_rectangle((1070,180,1205,259),radius=8,fill=RED);text(d,(1094,189),str(remaining)+'s',BOLD(38),INK)
            proc.stdin.write(im.tobytes())
    finally:proc.stdin.close()
    if proc.wait()!=0:raise RuntimeError('FFmpeg rehearsal render failed.')
print(f'Rendered {OUT/"episode.mp4"} ({(OUT/"episode.mp4").stat().st_size:,} bytes), captions and script from episode.json',flush=True)
