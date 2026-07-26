import { supabase } from "./supabaseClient.js";
import * as Call from "./call.js";

const els = {
  sidebar: document.getElementById("sidebar"),
  chatPanel: document.getElementById("chatPanel"),
  myAvatar: document.getElementById("myAvatar"),
  myUsername: document.getElementById("myUsername"),
  addContactBtn: document.getElementById("addContactBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  contactList: document.getElementById("contactList"),

  chatEmpty: document.getElementById("chatEmpty"),
  chatActive: document.getElementById("chatActive"),
  backBtn: document.getElementById("backBtn"),
  peerAvatar: document.getElementById("peerAvatar"),
  peerUsername: document.getElementById("peerUsername"),
  peerStatus: document.getElementById("peerStatus"),
  callBtn: document.getElementById("callBtn"),
  messages: document.getElementById("messages"),

  composerForm: document.getElementById("composerForm"),
  attachBtn: document.getElementById("attachBtn"),
  cameraBtn: document.getElementById("cameraBtn"),
  fileInput: document.getElementById("fileInput"),
  messageInput: document.getElementById("messageInput"),

  addContactModal: document.getElementById("addContactModal"),
  addContactForm: document.getElementById("addContactForm"),
  contactEmailInput: document.getElementById("contactEmailInput"),
  addContactError: document.getElementById("addContactError"),
  cancelAddContact: document.getElementById("cancelAddContact"),

  cameraModal: document.getElementById("cameraModal"),
  cameraPreview: document.getElementById("cameraPreview"),
  cameraCanvas: document.getElementById("cameraCanvas"),
  cameraSnapshot: document.getElementById("cameraSnapshot"),
  shootBtn: document.getElementById("shootBtn"),
  sendSnapshotBtn: document.getElementById("sendSnapshotBtn"),
  retakeBtn: document.getElementById("retakeBtn"),
  cancelCamera: document.getElementById("cancelCamera"),

  incomingCallModal: document.getElementById("incomingCallModal"),
  incomingCallFrom: document.getElementById("incomingCallFrom"),
  acceptCallBtn: document.getElementById("acceptCallBtn"),
  declineCallBtn: document.getElementById("declineCallBtn"),

  activeCallModal: document.getElementById("activeCallModal"),
  remoteVideo: document.getElementById("remoteVideo"),
  localVideo: document.getElementById("localVideo"),
  callStatusText: document.getElementById("callStatusText"),
  toggleMicBtn: document.getElementById("toggleMicBtn"),
  toggleCamBtn: document.getElementById("toggleCamBtn"),
  hangupBtn: document.getElementById("hangupBtn"),
};

let me = null;
let contacts = [];
let activePeer = null;
let activeConversation = null;
let messagesChannel = null;
let presenceChannel = null;
let onlineIds = new Set();
let cameraStream = null;
let pendingOffer = null;
let micOn = true;
let camOn = true;

init();

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = "index.html"; return; }

  const { data: profile, error } = await supabase
    .from("profiles").select("*").eq("id", session.user.id).single();

  if (error || !profile) {
    await supabase.auth.signOut();
    window.location.href = "index.html";
    return;
  }

  me = profile;
  els.myUsername.textContent = me.username;
  els.myAvatar.textContent = me.username[0];

  setupPresence();
  Call.initSignaling(me.id, callHandlers);
  wireUI();
  await loadContacts();
}

// ============================================================
// PRESENCE (status online)
// ============================================================
function setupPresence() {
  presenceChannel = supabase.channel("presence-online", {
    config: { presence: { key: me.id } },
  });
  presenceChannel
    .on("presence", { event: "sync" }, () => {
      onlineIds = new Set(Object.keys(presenceChannel.presenceState()));
      renderContactList();
      updatePeerStatus();
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({ online_at: new Date().toISOString() });
      }
    });
}

// ============================================================
// CONTACTS
// ============================================================
async function loadContacts() {
  const { data, error } = await supabase
    .from("contacts")
    .select("contact:contact_id(id, username, email, avatar_url, status_message)")
    .eq("owner_id", me.id);

  if (error) {
    console.error(error);
    els.contactList.innerHTML = `<p class="empty-hint">Gagal memuat kontak.</p>`;
    return;
  }
  contacts = (data || []).map((r) => r.contact).filter(Boolean);
  renderContactList();
}

function renderContactList() {
  els.contactList.innerHTML = "";
  if (contacts.length === 0) {
    els.contactList.innerHTML = `<p class="empty-hint">Belum ada kontak.<br>Tekan tombol ＋ untuk menambah.</p>`;
    return;
  }
  contacts
    .slice()
    .sort((a, b) => a.username.localeCompare(b.username))
    .forEach((c) => {
      const item = document.createElement("div");
      item.className = "contact-item" + (activePeer && activePeer.id === c.id ? " is-active" : "");
      item.innerHTML = `
        <div class="avatar">${escapeHtml(c.username[0])}</div>
        <div class="ci-info">
          <strong>${escapeHtml(c.username)}</strong>
          <span class="ci-preview">${onlineIds.has(c.id) ? "Online" : "Offline"}</span>
        </div>
      `;
      item.addEventListener("click", () => openConversationWith(c));
      els.contactList.appendChild(item);
    });
}

function updatePeerStatus() {
  if (!activePeer) return;
  els.peerStatus.textContent = onlineIds.has(activePeer.id) ? "Online" : "Offline";
}

// ============================================================
// ADD CONTACT
// ============================================================
function wireUI() {
  els.addContactBtn.addEventListener("click", () => {
    els.addContactError.textContent = "";
    els.contactEmailInput.value = "";
    els.addContactModal.classList.remove("hidden");
    els.contactEmailInput.focus();
  });
  els.cancelAddContact.addEventListener("click", () => els.addContactModal.classList.add("hidden"));

  els.addContactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.addContactError.textContent = "";
    const email = els.contactEmailInput.value.trim().toLowerCase();

    const { data, error } = await supabase.rpc("add_contact_mutual", { target_email: email });
    if (error) {
      els.addContactError.textContent = error.message.includes("tidak ditemukan")
        ? "Pengguna dengan email itu tidak ditemukan."
        : error.message;
      return;
    }
    els.addContactModal.classList.add("hidden");
    await loadContacts();
  });

  els.logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "index.html";
  });

  els.backBtn.addEventListener("click", () => {
    els.sidebar.classList.remove("is-collapsed");
    els.chatPanel.classList.add("is-collapsed");
  });

  // ------- composer -------
  els.composerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = els.messageInput.value.trim();
    if (!text || !activeConversation) return;
    els.messageInput.value = "";
    const { error } = await supabase.from("messages").insert({
      conversation_id: activeConversation.id,
      sender_id: me.id,
      content: text,
    });
    if (error) console.error(error);
  });

  els.attachBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", async () => {
    const file = els.fileInput.files[0];
    els.fileInput.value = "";
    if (file) await uploadAndSend(file);
  });

  // ------- camera -------
  els.cameraBtn.addEventListener("click", openCameraModal);
  els.cancelCamera.addEventListener("click", closeCameraModal);
  els.shootBtn.addEventListener("click", shootPhoto);
  els.retakeBtn.addEventListener("click", resetCameraView);
  els.sendSnapshotBtn.addEventListener("click", sendSnapshot);

  // ------- call -------
  els.callBtn.addEventListener("click", startOutgoingCall);
  els.acceptCallBtn.addEventListener("click", onAcceptCall);
  els.declineCallBtn.addEventListener("click", onDeclineCall);
  els.hangupBtn.addEventListener("click", () => { Call.hangupCall(); endCallUI(); });
  els.toggleMicBtn.addEventListener("click", () => {
    micOn = !micOn;
    Call.toggleTrack("audio", micOn);
    els.toggleMicBtn.classList.toggle("is-off", !micOn);
  });
  els.toggleCamBtn.addEventListener("click", () => {
    camOn = !camOn;
    Call.toggleTrack("video", camOn);
    els.toggleCamBtn.classList.toggle("is-off", !camOn);
  });
}

// ============================================================
// CONVERSATION + MESSAGES
// ============================================================
async function openConversationWith(peer) {
  activePeer = peer;
  els.chatEmpty.classList.add("hidden");
  els.chatActive.classList.remove("hidden");
  els.peerUsername.textContent = peer.username;
  els.peerAvatar.textContent = peer.username[0];
  updatePeerStatus();
  renderContactList();

  els.sidebar.classList.add("is-collapsed");
  els.chatPanel.classList.remove("is-collapsed");

  const userA = me.id < peer.id ? me.id : peer.id;
  const userB = me.id < peer.id ? peer.id : me.id;

  let { data: conv } = await supabase
    .from("conversations").select("*")
    .eq("user_a", userA).eq("user_b", userB).maybeSingle();

  if (!conv) {
    const { data: newConv, error } = await supabase
      .from("conversations").insert({ user_a: userA, user_b: userB }).select().single();
    if (error) { console.error(error); return; }
    conv = newConv;
  }
  activeConversation = conv;

  await loadMessages(conv.id);
  subscribeToMessages(conv.id);
}

async function loadMessages(conversationId) {
  const { data, error } = await supabase
    .from("messages").select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  els.messages.innerHTML = "";
  if (error) { console.error(error); return; }
  (data || []).forEach(renderMessage);
  scrollMessagesToBottom();
}

function subscribeToMessages(conversationId) {
  if (messagesChannel) supabase.removeChannel(messagesChannel);
  messagesChannel = supabase
    .channel(`messages-${conversationId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => { renderMessage(payload.new); scrollMessagesToBottom(); }
    )
    .subscribe();
}

function renderMessage(msg) {
  const row = document.createElement("div");
  row.className = "bubble-row " + (msg.sender_id === me.id ? "mine" : "theirs");

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (msg.file_url) {
    if ((msg.file_type || "").startsWith("image/")) {
      const img = document.createElement("img");
      img.className = "b-media";
      img.src = msg.file_url;
      img.alt = msg.file_name || "gambar";
      bubble.appendChild(img);
    } else {
      const a = document.createElement("a");
      a.className = "b-file";
      a.href = msg.file_url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "📎 " + (msg.file_name || "Berkas");
      bubble.appendChild(a);
    }
  }

  if (msg.content) {
    const p = document.createElement("div");
    p.textContent = msg.content;
    bubble.appendChild(p);
  }

  const time = document.createElement("span");
  time.className = "b-time";
  time.textContent = formatTime(msg.created_at);
  bubble.appendChild(time);

  row.appendChild(bubble);
  els.messages.appendChild(row);
}

function scrollMessagesToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

// ============================================================
// FILE / CAMERA UPLOAD
// ============================================================
async function uploadAndSend(file) {
  if (!activeConversation) return;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${me.id}/${Date.now()}_${safeName}`;

  const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
  if (upErr) { alert("Gagal mengunggah berkas: " + upErr.message); return; }

  const { data: pub } = supabase.storage.from("attachments").getPublicUrl(path);

  const { error } = await supabase.from("messages").insert({
    conversation_id: activeConversation.id,
    sender_id: me.id,
    file_url: pub.publicUrl,
    file_type: file.type || "application/octet-stream",
    file_name: file.name,
  });
  if (error) console.error(error);
}

async function openCameraModal() {
  els.cameraModal.classList.remove("hidden");
  resetCameraView();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
    els.cameraPreview.srcObject = cameraStream;
  } catch (err) {
    alert("Tidak bisa mengakses kamera: " + err.message);
    closeCameraModal();
  }
}

function closeCameraModal() {
  if (cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); cameraStream = null; }
  els.cameraModal.classList.add("hidden");
}

function resetCameraView() {
  els.cameraPreview.hidden = false;
  els.cameraSnapshot.hidden = true;
  els.shootBtn.classList.remove("hidden");
  els.sendSnapshotBtn.classList.add("hidden");
  els.retakeBtn.classList.add("hidden");
}

function shootPhoto() {
  const video = els.cameraPreview;
  const canvas = els.cameraCanvas;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  els.cameraSnapshot.src = canvas.toDataURL("image/jpeg", 0.9);
  els.cameraSnapshot.hidden = false;
  els.cameraPreview.hidden = true;
  els.shootBtn.classList.add("hidden");
  els.sendSnapshotBtn.classList.remove("hidden");
  els.retakeBtn.classList.remove("hidden");
}

function sendSnapshot() {
  els.cameraCanvas.toBlob(async (blob) => {
    const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
    await uploadAndSend(file);
    closeCameraModal();
  }, "image/jpeg", 0.9);
}

// ============================================================
// VIDEO CALL
// ============================================================
const callHandlers = {
  onOffer(payload) {
    if (Call.getCurrentCallId()) return; // sedang di panggilan lain, abaikan
    pendingOffer = payload;
    els.incomingCallFrom.textContent = payload.fromUsername || "Seseorang";
    els.incomingCallModal.classList.remove("hidden");
  },
  onHangup(payload) {
    if (payload.callId === Call.getCurrentCallId()) endCallUI();
    els.incomingCallModal.classList.add("hidden");
  },
  onDecline() {
    els.callStatusText.textContent = "Panggilan ditolak";
    setTimeout(endCallUI, 1200);
  },
};

async function startOutgoingCall() {
  if (!activePeer) return;
  micOn = true; camOn = true;
  els.toggleMicBtn.classList.remove("is-off");
  els.toggleCamBtn.classList.remove("is-off");
  els.activeCallModal.classList.remove("hidden");
  els.callStatusText.textContent = "Memanggil " + activePeer.username + "…";
  try {
    await Call.startCall(activePeer.id, me.username, onLocalStream, onRemoteStream, onConnState);
  } catch (err) {
    alert("Tidak bisa mengakses kamera/mikrofon: " + err.message);
    endCallUI();
  }
}

async function onAcceptCall() {
  if (!pendingOffer) return;
  els.incomingCallModal.classList.add("hidden");
  micOn = true; camOn = true;
  els.toggleMicBtn.classList.remove("is-off");
  els.toggleCamBtn.classList.remove("is-off");
  els.activeCallModal.classList.remove("hidden");
  els.callStatusText.textContent = "Menghubungkan…";
  try {
    await Call.acceptCall(pendingOffer, onLocalStream, onRemoteStream, onConnState);
    els.callStatusText.textContent = "Tersambung";
  } catch (err) {
    alert("Gagal menerima panggilan: " + err.message);
    endCallUI();
  }
  pendingOffer = null;
}

function onDeclineCall() {
  if (pendingOffer) Call.declineCall(pendingOffer);
  pendingOffer = null;
  els.incomingCallModal.classList.add("hidden");
}

function onLocalStream(stream) { els.localVideo.srcObject = stream; }
function onRemoteStream(stream) {
  els.remoteVideo.srcObject = stream;
  els.callStatusText.textContent = "Tersambung";
}
function onConnState(state) {
  if (state === "disconnected" || state === "failed" || state === "closed") endCallUI();
}

function endCallUI() {
  Call.cleanupCall();
  els.activeCallModal.classList.add("hidden");
  els.localVideo.srcObject = null;
  els.remoteVideo.srcObject = null;
}

// ============================================================
// HELPERS
// ============================================================
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
