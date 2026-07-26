import { supabase } from "./supabaseClient.js";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

let myId = null;
let myChannel = null;
let pc = null;
let localStream = null;
let currentCallId = null;
let currentPeerId = null;
let pendingIce = [];
let remoteDescSet = false;

// Dipanggil sekali saat aplikasi dimulai
export function initSignaling(userId, handlers) {
  myId = userId;
  myChannel = supabase.channel(`call-${myId}`);
  myChannel
    .on("broadcast", { event: "offer" }, ({ payload }) => handlers.onOffer(payload))
    .on("broadcast", { event: "answer" }, ({ payload }) => handleAnswer(payload))
    .on("broadcast", { event: "ice" }, ({ payload }) => handleRemoteIce(payload))
    .on("broadcast", { event: "hangup" }, ({ payload }) => handlers.onHangup(payload))
    .on("broadcast", { event: "decline" }, ({ payload }) => handlers.onDecline(payload))
    .subscribe();
}

function sendSignal(targetId, event, payload) {
  const ch = supabase.channel(`call-${targetId}`);
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      ch.send({ type: "broadcast", event, payload });
      setTimeout(() => supabase.removeChannel(ch), 2000);
    }
  });
}

async function getMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  return localStream;
}

function buildPeerConnection(targetId) {
  const conn = new RTCPeerConnection(ICE_SERVERS);
  conn.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal(targetId, "ice", { callId: currentCallId, from: myId, candidate: e.candidate });
    }
  };
  return conn;
}

// ============ CALLER SIDE ============
export async function startCall(peerId, myUsername, onLocalStream, onRemoteStream, onStateChange) {
  currentCallId = crypto.randomUUID();
  currentPeerId = peerId;
  remoteDescSet = false;
  pendingIce = [];

  const stream = await getMedia();
  onLocalStream(stream);

  pc = buildPeerConnection(peerId);
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  pc.ontrack = (e) => onRemoteStream(e.streams[0]);
  pc.onconnectionstatechange = () => onStateChange(pc.connectionState);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  sendSignal(peerId, "offer", {
    callId: currentCallId,
    from: myId,
    fromUsername: myUsername,
    sdp: offer,
  });

  return currentCallId;
}

// ============ CALLEE SIDE ============
export async function acceptCall(offerPayload, onLocalStream, onRemoteStream, onStateChange) {
  currentCallId = offerPayload.callId;
  currentPeerId = offerPayload.from;
  remoteDescSet = false;
  pendingIce = [];

  const stream = await getMedia();
  onLocalStream(stream);

  pc = buildPeerConnection(offerPayload.from);
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  pc.ontrack = (e) => onRemoteStream(e.streams[0]);
  pc.onconnectionstatechange = () => onStateChange(pc.connectionState);

  await pc.setRemoteDescription(new RTCSessionDescription(offerPayload.sdp));
  remoteDescSet = true;
  flushPendingIce();

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  sendSignal(offerPayload.from, "answer", { callId: currentCallId, from: myId, sdp: answer });
}

export function declineCall(offerPayload) {
  sendSignal(offerPayload.from, "decline", { callId: offerPayload.callId });
}

async function handleAnswer(payload) {
  if (payload.callId !== currentCallId || !pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  remoteDescSet = true;
  flushPendingIce();
}

async function handleRemoteIce(payload) {
  if (payload.callId !== currentCallId) return;
  if (!pc) return;
  if (!remoteDescSet) {
    pendingIce.push(payload.candidate);
    return;
  }
  try {
    await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
  } catch (err) {
    console.warn("Gagal menambah ICE candidate", err);
  }
}

function flushPendingIce() {
  pendingIce.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
  pendingIce = [];
}

export function hangupCall() {
  if (currentPeerId && currentCallId) {
    sendSignal(currentPeerId, "hangup", { callId: currentCallId });
  }
  cleanupCall();
}

export function cleanupCall() {
  if (pc) {
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  currentCallId = null;
  currentPeerId = null;
  pendingIce = [];
  remoteDescSet = false;
}

export function getCurrentCallId() {
  return currentCallId;
}

export function toggleTrack(kind, enabled) {
  if (!localStream) return;
  localStream.getTracks().filter((t) => t.kind === kind).forEach((t) => (t.enabled = enabled));
}
