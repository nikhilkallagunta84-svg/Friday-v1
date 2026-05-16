(() => {
  const MESSAGE_SOURCE = 'getfocusedai-tts-sandbox';
  const PARENT_SOURCE = 'getfocusedai-sidepanel';
  const DEFAULT_OPTIONS = {
    provider: 'elevenlabs',
    voice: '21m00Tcm4TlvDq8ikWAM',
    model: 'eleven_v3',
    output_format: 'mp3_44100_128',
    voice_settings: {
      stability: 0.72,
      similarity_boost: 0.8,
      speed: 0.9,
    },
  };
  const SPEAK_TIMEOUT_MS = 6_000;

  let activeAudio;
  let activeRequestId;

  function emit(type, payload = {}) {
    window.parent.postMessage(
      {
        source: MESSAGE_SOURCE,
        type,
        ...payload,
      },
      '*',
    );
  }

  function stopActiveAudio() {
    if (!activeAudio) {
      return;
    }

    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = undefined;
  }

  async function speak(requestId, text, options = {}) {
    let timeoutId;

    try {
      stopActiveAudio();
      activeRequestId = requestId;

      if (!window.puter?.ai?.txt2speech) {
        throw new Error('Puter text-to-speech is unavailable.');
      }

      const audio = await Promise.race([
        window.puter.ai.txt2speech(text, {
          ...DEFAULT_OPTIONS,
          ...options,
          test_mode: true,
          voice_settings: {
            ...DEFAULT_OPTIONS.voice_settings,
            ...(options.voice_settings ?? {}),
          },
        }),
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error('Natural voice request timed out.')),
            SPEAK_TIMEOUT_MS,
          );
        }),
      ]);

      window.clearTimeout(timeoutId);

      activeAudio = audio;

      audio.addEventListener(
        'ended',
        () => {
          if (activeRequestId === requestId) {
            activeAudio = undefined;
            activeRequestId = undefined;
            emit('ended', { requestId });
          }
        },
        { once: true },
      );

      audio.addEventListener(
        'error',
        () => {
          if (activeRequestId === requestId) {
            activeAudio = undefined;
            activeRequestId = undefined;
            emit('error', { requestId, message: 'Audio playback failed.' });
          }
        },
        { once: true },
      );

      await audio.play();
      emit('started', { requestId });
    } catch (error) {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      if (activeRequestId === requestId) {
        activeAudio = undefined;
        activeRequestId = undefined;
      }

      emit('error', {
        requestId,
        message: error instanceof Error ? error.message : 'Unable to synthesize speech.',
      });
    }
  }

  window.addEventListener('message', (event) => {
    const message = event.data;

    if (!message || message.source !== PARENT_SOURCE) {
      return;
    }

    if (message.type === 'speak') {
      void speak(message.requestId, message.text, message.options);
      return;
    }

    if (message.type === 'stop') {
      const requestId = activeRequestId;
      stopActiveAudio();
      activeRequestId = undefined;
      emit('stopped', { requestId });
    }
  });

  emit('ready');
})();
