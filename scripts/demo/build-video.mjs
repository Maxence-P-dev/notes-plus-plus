// Assembles the recorded frames + narration into the final video, subtitles,
// YouTube chapters and the README GIF.
// Usage: node scripts/demo/build-video.mjs <recDir> <audioDir> <outDir>   (FFMPEG env = path to ffmpeg)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [rec, audio, out] = process.argv.slice(2).map((p) => path.resolve(p));
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const { duration, segments } = JSON.parse(readFileSync(path.join(rec, 'timeline.json'), 'utf8'));
mkdirSync(out, { recursive: true });

const run = (args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

/* ----------------------------------------------------------------- video */
const inputs = ['-f', 'concat', '-safe', '0', '-i', path.join(rec, 'frames.txt')];
const delays = [];
segments.forEach((s, i) => {
  inputs.push('-i', path.join(audio, `${s.id}.wav`));
  const ms = Math.round(s.start * 1000);
  delays.push(`[${i + 1}:a]aresample=48000,adelay=${ms}|${ms}[a${i}]`);
});
const filter = `${delays.join(';')};${segments.map((_, i) => `[a${i}]`).join('')}amix=inputs=${segments.length}:normalize=0,apad[aout]`;
const mp4 = path.join(out, 'Notes++ - Presentation.mp4');
run([
  ...inputs,
  '-filter_complex', filter,
  '-map', '0:v', '-map', '[aout]',
  '-vf', 'scale=1920:1080:flags=lanczos,fps=30,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation',
  '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
  '-t', duration.toFixed(2),
  '-movflags', '+faststart',
  mp4,
]);
console.log('video:', mp4);

/* ------------------------------------------------------------- subtitles */
const ts = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
let n = 0;
const srt = segments
  .flatMap((s) => s.captions)
  .map((c) => `${++n}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`)
  .join('\n');
writeFileSync(path.join(out, 'Notes++ - Presentation.fr.srt'), srt);

/* -------------------------------------------------------------- chapters */
// YouTube needs the first chapter at 0:00; merge intro/installation titles.
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const chapters = segments.map((s, i) => `${mmss(i === 0 ? 0 : s.start)} ${s.title}`).join('\n');
writeFileSync(path.join(out, 'chapitres-youtube.txt'), chapters + '\n');
console.log(chapters);

/* ------------------------------------------------------------- README GIF */
// Highlights: slash menu → formatting → callouts, then the theme switch.
const pickSeg = (id) => segments.find((s) => s.id === id);
const clips = [
  [pickSeg('n06').start, pickSeg('n09').start],
  [pickSeg('n13').start + 0.5, pickSeg('n14').start],
];
const parts = clips.map(([a, b], i) => `[0:v]trim=${a.toFixed(2)}:${b.toFixed(2)},setpts=PTS-STARTPTS,fps=12,scale=1100:-1:flags=lanczos[c${i}]`);
const gifFilter = `${parts.join(';')};${clips.map((_, i) => `[c${i}]`).join('')}concat=n=${clips.length}:v=1:a=0,split[s0][s1];[s0]palettegen=max_colors=160:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
const gif = path.join(out, 'demo.gif');
run(['-i', mp4, '-filter_complex', gifFilter, '-loop', '0', gif]);
console.log('gif:', gif);
