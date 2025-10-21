/* eslint-disable no-param-reassign */
import { isSlider, isSpinner, isHold } from './renderers/utils';
import OsuRenderer from './renderers/osu';
import ManiaRenderer from './renderers/mania';

const toTimeString = (time) => {
  const seconds = Math.floor(time / 1000) % 60;
  const minutes = Math.floor(time / 1000 / 60);
  return `${minutes}:${(`00${seconds}`).substr(-2)}`;
};

const processHitObjects = (hitObjects, timingPoints, SV) => {
  for (let i = 0; i < hitObjects.length; i += 1) {
    const object = hitObjects[i];
    if (isSlider(object)) {
      const { ms_per_beat: beatDuration } = timingPoints.find((e) => e.time <= object.time);
      const duration = object.data.distance / (100.0 * SV) * beatDuration;
      const { repetitions } = object.data;
      object.duration = duration;
      object.endTime = object.time + duration * repetitions;
    } else if (isSpinner(object) || isHold(object)) {
      object.endTime = object.data.endTime;
      object.endPos = [512 / 2, 384 / 2];
    } else {
      object.endTime = object.time;
      object.endPos = object.data.pos;
    }
  }
};

/**
 *
 * @param {HTMLCanvasElement} canvasElement
 * @param {*} playbackTimeElement
 * @param {HTMLDivElement} progressElement
 * @param {*} beatmap
 * @param {*} previewTime
 * @param {HTMLAudioElement} audio
 */
const playPreview = (
  canvasElement,
  playbackTimeElement,
  progressElement,
  beatmap,
  previewTime,
  audio,
) => {
  let mapStartTime = previewTime;
  let startTime = performance.now();

  const ctx = canvasElement.getContext('2d');
  ctx.translate(64, 48);

  const Renderer = [OsuRenderer, null, null, ManiaRenderer][beatmap.mode];
  const renderer = new Renderer(ctx, beatmap);

  const hitObjects = beatmap.objects;
  const timingPoints = beatmap.timing_points;

  const { sv: SV } = beatmap;

  processHitObjects(hitObjects, timingPoints, SV);

  const lastObject = hitObjects[hitObjects.length - 1];
  const lastTime = lastObject.endTime;

  if (mapStartTime < 0) {
    mapStartTime = (lastObject.endTime) * 0.42;
  }

  // Start audio playback at the correct time
  audio.currentTime = mapStartTime / 1000;
  audio.play();

  let seeking = false;
  let waitingForSeek = false;

  const animate = (currentTime) => {
    // Sync with actual audio position when playing
    if (!seeking && !waitingForSeek && !audio.paused) {
      const audioTime = audio.currentTime * 1000;
      const expectedTime = currentTime - startTime + mapStartTime;

      // If audio position differs significantly, resync
      if (Math.abs(audioTime - expectedTime) > 100) {
        mapStartTime = audioTime;
        startTime = currentTime;
      }
    }

    const time = seeking ? mapStartTime : performance.now() - startTime + mapStartTime;
    // eslint-disable-next-line no-param-reassign
    playbackTimeElement.innerText = `${toTimeString(Math.min(time, lastTime))} / ${toTimeString(lastTime)}`;
    progressElement.style.setProperty('--progress', time / lastTime);
    ctx.clearRect(-64, -48, canvasElement.width, canvasElement.height);

    renderer.render(time);

    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);

  // Handle audio seeking completion
  const onSeeked = () => {
    if (waitingForSeek) {
      // Sync animation time to actual audio position after seek completes
      const actualAudioTime = audio.currentTime * 1000;
      mapStartTime = actualAudioTime;
      startTime = performance.now();
      waitingForSeek = false;
      audio.play().catch(() => {
        // Handle play interruption
      });
      progressElement.classList.remove('seeking');
    }
  };

  audio.addEventListener('seeked', onSeeked);

  progressElement.addEventListener('pointerdown', (e) => {
    audio.pause();
    seeking = true;
    const rect = progressElement.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left);
    const time = (x / rect.width) * lastTime;
    startTime = performance.now();
    mapStartTime = time;
    progressElement.classList.add('seeking');
  });
  document.addEventListener('pointermove', (e) => {
    if (!seeking) return;
    const rect = progressElement.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left);
    const time = (x / rect.width) * lastTime;
    startTime = performance.now();
    mapStartTime = time;
  });
  document.addEventListener('pointerup', () => {
    if (seeking) {
      seeking = false;
      waitingForSeek = true;
      // Seek the audio to the new position
      // The 'seeked' event handler will sync and resume playback
      audio.currentTime = mapStartTime / 1000;
    }
  });
};

export default playPreview;
