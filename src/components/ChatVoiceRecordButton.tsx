import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  disabled?: boolean;
  holdLabel: string;
  recordingLabel: string;
  unsupportedLabel: string;
  micDeniedLabel: string;
  onRecorded: (payload: { blob: Blob; durationMs: number; mimeType: string }) => Promise<void> | void;
};

const MAX_MS = 90_000;
const MIN_MS = 400;

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function extensionForMime(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

export function voiceFileName(mimeType: string): string {
  return `voice-${Date.now()}.${extensionForMime(mimeType)}`;
}

export function ChatVoiceRecordButton({
  disabled,
  holdLabel,
  recordingLabel,
  unsupportedLabel,
  micDeniedLabel,
  onRecorded,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const maxTimerRef = useRef<number | null>(null);
  const mimeRef = useRef('');
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

  const clearMaxTimer = () => {
    if (maxTimerRef.current != null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const finishRecording = useCallback(
    async (forceStop?: boolean) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return;
      if (forceStop && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  const handleRecordedBlob = useCallback(
    async (blob: Blob, durationMs: number, mimeType: string) => {
      if (durationMs < MIN_MS || blob.size < 32) {
        setError('');
        return;
      }
      setBusy(true);
      setError('');
      try {
        await onRecorded({ blob, durationMs, mimeType });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Voice send failed');
      } finally {
        setBusy(false);
      }
    },
    [onRecorded],
  );

  const stopRecording = useCallback(() => {
    clearMaxTimer();
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setRecording(false);
      stopStream();
      return;
    }
    try {
      recorder.stop();
    } catch {
      setRecording(false);
      stopStream();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled || busy || recording || !supported) return;
    setError('');
    const mimeType = pickMimeType();
    if (!mimeType) {
      setError(unsupportedLabel);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      mimeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Math.max(0, Date.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        setRecording(false);
        stopStream();
        void handleRecordedBlob(blob, durationMs, mimeRef.current || blob.type || 'audio/webm');
      };
      startedAtRef.current = Date.now();
      recorder.start(250);
      setRecording(true);
      clearMaxTimer();
      maxTimerRef.current = window.setTimeout(() => {
        void finishRecording(true);
      }, MAX_MS);
    } catch (err) {
      stopStream();
      setRecording(false);
      const name = err instanceof DOMException ? err.name : '';
      setError(
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? micDeniedLabel
          : unsupportedLabel,
      );
    }
  }, [
    busy,
    disabled,
    finishRecording,
    handleRecordedBlob,
    micDeniedLabel,
    recording,
    supported,
    unsupportedLabel,
  ]);

  useEffect(
    () => () => {
      clearMaxTimer();
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      stopStream();
    },
    [],
  );

  if (!supported) {
    return (
      <span className="text-xs text-text-muted" title={unsupportedLabel}>
        🎤
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={disabled || busy}
        onPointerDown={(event) => {
          event.preventDefault();
          if (event.button !== 0) return;
          void startRecording();
        }}
        onPointerUp={(event) => {
          event.preventDefault();
          stopRecording();
        }}
        onPointerLeave={() => {
          if (recording) stopRecording();
        }}
        onPointerCancel={() => stopRecording()}
        onContextMenu={(event) => event.preventDefault()}
        className={`inline-flex h-10 min-w-10 select-none items-center justify-center rounded-full px-3 text-sm font-semibold transition ${
          recording
            ? 'bg-red-600 text-white ring-2 ring-red-300'
            : 'bg-gray-100 text-text-primary hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
        } disabled:opacity-50`}
        aria-label={recording ? recordingLabel : holdLabel}
        title={recording ? recordingLabel : holdLabel}
      >
        {busy ? '…' : recording ? '●' : '🎤'}
      </button>
      <span className={`max-w-[7.5rem] text-center text-[10px] leading-tight ${recording ? 'text-red-600' : 'text-text-muted'}`}>
        {error || (recording ? recordingLabel : holdLabel)}
      </span>
    </div>
  );
}
