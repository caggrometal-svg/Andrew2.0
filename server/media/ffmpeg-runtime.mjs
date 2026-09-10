import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

if (!ffmpegPath) throw new Error('FFMPEG_STATIC_BINARY_UNAVAILABLE');
if (!ffprobeInstaller?.path) throw new Error('FFPROBE_STATIC_BINARY_UNAVAILABLE');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export { ffmpeg, ffmpegPath, ffprobePath };

const ffprobePath = ffprobeInstaller.path;
