import { supabase } from "./supabaseClient.js";

const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

tabLogin.addEventListener("click", () => switchTab("login"));
tabRegister.addEventListener("click", () => switchTab("register"));

function switchTab(which) {
  const isLogin = which === "login";
  tabLogin.classList.toggle("is-active", isLogin);
  tabRegister.classList.toggle("is-active", !isLogin);
  loginForm.classList.toggle("hidden", !isLogin);
  registerForm.classList.toggle("hidden", isLogin);
}

// Kalau sudah login, langsung lempar ke halaman chat
supabase.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = "chat.html";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = terjemahkanError(error.message);
    return;
  }
  window.location.href = "chat.html";
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("registerError");
  const hintEl = document.getElementById("registerHint");
  errorEl.textContent = "";
  hintEl.textContent = "";

  const username = document.getElementById("registerUsername").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    errorEl.textContent = terjemahkanError(error.message);
    return;
  }

  // Jika project mewajibkan konfirmasi email, session belum ada di sini.
  if (!data.session) {
    hintEl.textContent = "Akun dibuat! Cek email kamu untuk konfirmasi, lalu masuk di tab Masuk.";
    switchTab("login");
    return;
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: data.user.id,
    email,
    username,
  });

  if (profileError) {
    errorEl.textContent = "Akun dibuat, tapi profil gagal disimpan: " + profileError.message;
    return;
  }

  window.location.href = "chat.html";
});

function terjemahkanError(msg) {
  if (msg.includes("Invalid login credentials")) return "Email atau kata sandi salah.";
  if (msg.includes("already registered")) return "Email sudah terdaftar. Coba masuk.";
  if (msg.includes("duplicate key value") && msg.includes("username")) return "Nama pengguna sudah dipakai.";
  return msg;
}
