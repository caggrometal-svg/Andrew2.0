import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const ffprobePath = ffprobeInstaller?.path;

if (!ffmpegPath) throw new Error('FFMPEG_STATIC_BINARY_UNAVAILABLE');
if (!ffprobePath) throw new Error('FFPROBE_STATIC_BINARY_UNAVAILABLE');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

export { ffmpeg, ffmpegPath, ffprobePath };
