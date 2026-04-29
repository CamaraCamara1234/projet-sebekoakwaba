import React, { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const EAR_THRESHOLD = 0.20;
const MAR_THRESHOLD = 0.60;
const HEAD_MOVEMENT_THRESHOLD = 0.09;

const LEFT_EYE = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
const MOUTH_TOP = 13;
const MOUTH_BOTTOM = 14;
const MOUTH_LEFT = 78;
const MOUTH_RIGHT = 308;
const NOSE_TIP = 1;

const CHALLENGE_POOL = ['BLINK', 'LOOK_LEFT', 'LOOK_RIGHT', 'MOUTH_OPEN'];

function generateRandomSequence(length = 6) {
  const seq = [];
  let last = '';
  for (let i = 0; i < length; i++) {
    const available = CHALLENGE_POOL.filter(c => c !== last);
    const chosen = available[Math.floor(Math.random() * available.length)];
    seq.push(chosen);
    last = chosen;
  }
  return seq;
}

export default function LivenessDetection({ onSuccess, onFailure }) {
  const videoRef = useRef(null);
  const requestRef = useRef(null);
  const faceLandmarkerRef = useRef(null);

  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [instruction, setInstruction] = useState('Chargement du modèle...');
  const [progress, setProgress] = useState(0);
  const [challengeSequence, setChallengeSequence] = useState([]);
  const [activeChallenge, setActiveChallenge] = useState(null);

  const engineState = useRef({
    sequence: [],
    challengeIndex: 0,
    blinkCount: 0,
    earCounter: 0,
    marCounter: 0,
    noseRef: null,
    gazeLeftCounter: 0,
    gazeRightCounter: 0,
    straightCounter: 0,
    challengeStartTime: Date.now(),
    lastProcessingTime: 0,
    capturedPhoto: null,
    done: false,
  });

  useEffect(() => {
    const seq = generateRandomSequence(6);
    seq.push('LOOK_STRAIGHT');
    engineState.current.sequence = seq;
    setChallengeSequence(seq);
    setActiveChallenge(seq[0]);
  }, []);

  useEffect(() => {
    async function setupMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
        faceLandmarkerRef.current = faceLandmarker;
        setIsModelLoaded(true);
        setInstruction('Veuillez regarder la caméra');
        startCamera();
      } catch (err) {
        console.error('Erreur chargement MediaPipe', err);
        setInstruction("Erreur de chargement de l'IA.");
      }
    }
    setupMediaPipe();
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', predictWebcam);
      }
    } catch (err) {
      console.error(err);
      setInstruction('Erreur: Accès caméra refusé.');
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    engineState.current.capturedPhoto = canvas.toDataURL('image/jpeg', 0.9);
  };

  const computeDistance = (p1, p2) =>
    Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  const computeEAR = (landmarks, eyeIndices) => {
    const [p1, p2, p3, p4, p5, p6] = eyeIndices.map(i => landmarks[i]);
    const v1 = computeDistance(p2, p6);
    const v2 = computeDistance(p3, p5);
    const h = computeDistance(p1, p4);
    return h > 0 ? (v1 + v2) / (2.0 * h) : 0.0;
  };

  const computeMAR = (landmarks) => {
    const top = landmarks[MOUTH_TOP];
    const bottom = landmarks[MOUTH_BOTTOM];
    const left = landmarks[MOUTH_LEFT];
    const right = landmarks[MOUTH_RIGHT];
    const vertical = computeDistance(top, bottom);
    const horizontal = computeDistance(left, right);
    return horizontal > 0 ? vertical / horizontal : 0.0;
  };

  const predictWebcam = async () => {
    if (!faceLandmarkerRef.current || !videoRef.current) return;
    const now = performance.now();
    const state = engineState.current;
    if (state.done) return;
    if (now - state.lastProcessingTime < 50) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }
    state.lastProcessingTime = now;
    try {
      if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
        const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, now);
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          processLivenessLogic(results.faceLandmarks[0]);
        } else {
          setInstruction('Aucun visage détecté');
        }
      }
    } catch (err) {
      console.error('Erreur détection', err);
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  const processLivenessLogic = (landmarks) => {
    const state = engineState.current;
    if (state.sequence.length === 0 || state.done) return;

    if (state.challengeIndex >= state.sequence.length) {
      state.done = true;
      setInstruction('Vérification Réussie ✅');
      setActiveChallenge('DONE');
      if (onSuccess && state.capturedPhoto) {
        // Arrêter la caméra proprement
        if (videoRef.current && videoRef.current.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        }
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        onSuccess(state.capturedPhoto);
      }
      return;
    }

    const elapsed = (Date.now() - state.challengeStartTime) / 1000;
    if (elapsed > 15) {
      state.done = true;
      setInstruction('Échec : Temps écoulé ❌');
      if (onFailure) onFailure('timeout');
      return;
    }

    const ear = (computeEAR(landmarks, LEFT_EYE) + computeEAR(landmarks, RIGHT_EYE)) / 2;
    const mar = computeMAR(landmarks);
    const nose = landmarks[NOSE_TIP];

    if (ear < EAR_THRESHOLD) {
      state.earCounter++;
    } else {
      if (state.earCounter >= 1) state.blinkCount++;
      state.earCounter = 0;
    }

    if (!state.noseRef) state.noseRef = { ...nose };
    const dx = nose.x - state.noseRef.x;
    if (dx > HEAD_MOVEMENT_THRESHOLD) state.gazeLeftCounter++;
    else state.gazeLeftCounter = Math.max(0, state.gazeLeftCounter - 1);
    if (dx < -HEAD_MOVEMENT_THRESHOLD) state.gazeRightCounter++;
    else state.gazeRightCounter = Math.max(0, state.gazeRightCounter - 1);

    const currentReq = state.sequence[state.challengeIndex];
    let challengePassed = false;

    if (currentReq === 'BLINK') {
      setInstruction('Veuillez cligner des yeux 👁️');
      if (state.blinkCount >= 1) challengePassed = true;
    } else if (currentReq === 'LOOK_LEFT') {
      setInstruction('Tournez la tête à gauche ⬅️');
      if (state.gazeLeftCounter >= 10) challengePassed = true;
    } else if (currentReq === 'LOOK_RIGHT') {
      setInstruction('Tournez la tête à droite ➡️');
      if (state.gazeRightCounter >= 10) challengePassed = true;
    } else if (currentReq === 'MOUTH_OPEN') {
      setInstruction('Ouvrez grand la bouche 😲');
      if (mar > MAR_THRESHOLD) challengePassed = true;
    } else if (currentReq === 'LOOK_STRAIGHT') {
      setInstruction("Regardez l'objectif pour la photo 📸");
      const isCenteredX = Math.abs(nose.x - 0.5) < 0.15;
      const isCenteredY = Math.abs(nose.y - 0.5) < 0.20;
      if (isCenteredX && isCenteredY) state.straightCounter++;
      else state.straightCounter = 0;
      if (state.straightCounter >= 20) {
        capturePhoto();
        challengePassed = true;
      }
    }

    if (challengePassed) {
      state.challengeIndex++;
      state.challengeStartTime = Date.now();
      const percent = (state.challengeIndex / state.sequence.length) * 100;
      setProgress(percent);
      if (state.challengeIndex < state.sequence.length) {
        setActiveChallenge(state.sequence[state.challengeIndex]);
      } else {
        setActiveChallenge('DONE');
      }
      state.blinkCount = 0;
      state.straightCounter = 0;
      state.noseRef = { ...nose };
    }
  };

  const renderVisualGuide = () => {
    if (activeChallenge === 'DONE' || !activeChallenge) return null;
    const base = {
      position: 'absolute', top: '50%', fontSize: '3rem',
      opacity: 0.85, transition: 'all 0.3s', zIndex: 10, pointerEvents: 'none',
    };
    switch (activeChallenge) {
      case 'BLINK':
        return <div style={{ ...base, left: '50%', transform: 'translate(-50%,-50%)', animation: 'ld-blink 1.5s infinite' }}>👁️</div>;
      case 'LOOK_LEFT':
        return <div style={{ ...base, left: '10%', transform: 'translateY(-50%)', animation: 'ld-bounceL 1s infinite' }}>⬅️</div>;
      case 'LOOK_RIGHT':
        return <div style={{ ...base, right: '10%', transform: 'translateY(-50%)', animation: 'ld-bounceR 1s infinite' }}>➡️</div>;
      case 'MOUTH_OPEN':
        return <div style={{ ...base, left: '50%', top: '70%', transform: 'translate(-50%,-50%)', animation: 'ld-pulse 1s infinite' }}>😲</div>;
      case 'LOOK_STRAIGHT':
        return <div style={{ ...base, left: '50%', transform: 'translate(-50%,-50%)', animation: 'ld-pulse 1.5s infinite' }}>📸</div>;
      default:
        return null;
    }
  };

  return (
    <>
      <style>{`
        @keyframes ld-bounceL { 0%,100%{transform:translateY(-50%)} 50%{transform:translate(-20px,-50%)} }
        @keyframes ld-bounceR { 0%,100%{transform:translateY(-50%)} 50%{transform:translate(20px,-50%)} }
        @keyframes ld-blink { 0%,100%{opacity:1;transform:translate(-50%,-50%) scaleY(1)} 50%{opacity:0.3;transform:translate(-50%,-50%) scaleY(0.1)} }
        @keyframes ld-pulse { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.2)} }
      `}</style>

      <div style={{ position: 'relative', width: '100%', maxWidth: '500px', margin: '0 auto', fontFamily: 'inherit' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg,#1a1a2e,#16213e)', color: 'white', borderRadius: '10px 10px 0 0' }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', textAlign: 'center' }}>{instruction}</p>
          <div style={{ display: 'flex', gap: '4px', marginTop: '10px' }}>
            {challengeSequence.map((chal, i) => (
              <div key={i} style={{
                flex: 1, height: '6px', borderRadius: '3px',
                background: progress >= ((i + 1) / challengeSequence.length) * 100
                  ? '#4ade80'
                  : (chal === 'LOOK_STRAIGHT' ? '#60a5fa' : '#374151'),
                transition: 'background 0.4s',
              }} />
            ))}
          </div>
        </div>

        {/* Video */}
        <div style={{ position: 'relative', width: '100%', background: '#000', overflow: 'hidden', borderRadius: '0 0 10px 10px', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }}
          />
          {!isModelLoaded && (
            <div style={{ position: 'absolute', color: 'white', textAlign: 'center', padding: '20px' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
              <p style={{ margin: 0 }}>Chargement de l'IA MediaPipe...</p>
            </div>
          )}
          {isModelLoaded && renderVisualGuide()}

          {/* Oval face guide */}
          {isModelLoaded && activeChallenge && activeChallenge !== 'DONE' && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              width: '55%', height: '80%',
              border: '2px solid rgba(74,222,128,0.6)',
              borderRadius: '50%',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
              pointerEvents: 'none', zIndex: 5,
            }} />
          )}
        </div>
      </div>
    </>
  );
}
