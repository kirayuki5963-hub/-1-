(() => {
  "use strict";

  const API = "https://seoul-trip-yuki-2026.rabubu1209.chatgpt.site/api/vlog";
  const HERO = "images/myeongdong-night-market.jpg";
  const state = { photos: [], settings: new Map(), music: null, exporting: false };

  const captureTime = (photo) => (photo.takenAt || "").slice(11, 16);
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const loadImage = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("画像を読み込めませんでした");
    const objectUrl = URL.createObjectURL(await response.blob());
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("画像を表示用に変換できませんでした"));
        image.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  function drawCover(context, image, width, height) {
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;
    let sx = 0;
    let sy = 0;
    if (sourceRatio > targetRatio) {
      sw = image.naturalHeight * targetRatio;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / targetRatio;
      sy = (image.naturalHeight - sh) / 2;
    }
    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  }

  function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
    const lines = [];
    let line = "";
    for (const character of text) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = character;
      } else line = candidate;
    }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
  }

  function download(blob, extension) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `seoul-vlog-2026.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function setError(message) {
    const element = document.querySelector(".video-addon-error");
    if (!element) return;
    element.textContent = message || "";
    element.hidden = !message;
  }

  function updateEstimate() {
    const seconds = 4.6 + state.photos.reduce((sum, photo) => {
      const setting = state.settings.get(photo.id);
      return sum + (setting && setting.selected ? setting.seconds : 0);
    }, 0);
    const target = document.querySelector(".video-addon-estimate");
    if (target) target.textContent = `完成動画 約${Math.ceil(seconds)}秒`;
    const run = document.querySelector(".video-addon-run");
    if (run) run.disabled = state.exporting || !state.photos.some((photo) => state.settings.get(photo.id)?.selected);
  }

  function photoRow(photo, index) {
    const row = document.createElement("div");
    row.className = "video-addon-row selected";
    const setting = state.settings.get(photo.id);
    row.innerHTML = `
      <label class="video-addon-photo">
        <input type="checkbox" checked>
        <img src="${photo.url}" alt="">
        <span><strong>${index + 1}. ${photo.day} ${captureTime(photo)}</strong><small></small></span>
      </label>
      <label class="video-addon-duration"><span>表示</span><select aria-label="${index + 1}枚目の表示時間">
        ${[1, 2, 3, 4, 5].map((seconds) => `<option value="${seconds}"${seconds === 3 ? " selected" : ""}>${seconds}秒</option>`).join("")}
      </select></label>`;
    row.querySelector("small").textContent = photo.caption || "コメントなし";
    const checkbox = row.querySelector("input");
    const select = row.querySelector("select");
    checkbox.addEventListener("change", () => {
      setting.selected = checkbox.checked;
      select.disabled = !checkbox.checked;
      row.classList.toggle("selected", checkbox.checked);
      updateEstimate();
    });
    select.addEventListener("change", () => {
      setting.seconds = Number(select.value);
      updateEstimate();
    });
    return row;
  }

  async function openEditor() {
    let modal = document.querySelector(".video-addon-modal");
    if (modal) { modal.hidden = false; return; }
    const response = await fetch(API);
    if (!response.ok) { window.alert("VLOG写真を読み込めませんでした"); return; }
    const data = await response.json();
    state.photos = [...(data.photos || [])].sort((left, right) => (left.takenAt || "9999").localeCompare(right.takenAt || "9999") || left.createdAt - right.createdAt);
    state.settings = new Map(state.photos.map((photo) => [photo.id, { selected: true, seconds: 3 }]));
    state.music = null;

    modal = document.createElement("div");
    modal.className = "video-addon-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "VLOG動画出力");
    modal.innerHTML = `
      <button class="video-addon-backdrop" type="button" aria-label="閉じる"></button>
      <section class="video-addon-card">
        <button class="video-addon-close" type="button" aria-label="閉じる">×</button>
        <span class="video-addon-kicker">16:9 · SEOUL VLOG</span>
        <h3>動画出力</h3>
        <p class="video-addon-flow">トップ画面 → ブラックアウト → VLOG</p>
        <div class="video-addon-list"></div>
        <div class="video-addon-music">
          <input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav">
          <button type="button">♬ 音楽を選択</button><span>BGMなしでも出力できます</span>
        </div>
        <div class="video-addon-info"><span class="video-addon-estimate"></span><small>動画の長さと同じ時間をかけて作成します。画面を閉じずにお待ちください。</small></div>
        <p class="video-addon-error" hidden></p>
        <button class="video-addon-run" type="button" disabled>▶ 動画を作成して保存</button>
      </section>`;
    document.body.appendChild(modal);
    const list = modal.querySelector(".video-addon-list");
    state.photos.forEach((photo, index) => list.appendChild(photoRow(photo, index)));
    const close = () => { if (!state.exporting) modal.hidden = true; };
    modal.querySelector(".video-addon-backdrop").addEventListener("click", close);
    modal.querySelector(".video-addon-close").addEventListener("click", close);
    const input = modal.querySelector(".video-addon-music input");
    const pick = modal.querySelector(".video-addon-music button");
    const name = modal.querySelector(".video-addon-music span");
    pick.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      state.music = input.files?.[0] || null;
      name.textContent = state.music ? state.music.name : "BGMなしでも出力できます";
      pick.textContent = state.music ? "♬ 音楽を変更" : "♬ 音楽を選択";
      setError("");
      updateEstimate();
    });
    modal.querySelector(".video-addon-run").addEventListener("click", exportVideo);
    updateEstimate();
  }

  async function exportVideo() {
    if (state.exporting) return;
    const chosen = state.photos.filter((photo) => state.settings.get(photo.id)?.selected);
    if (!chosen.length) return;
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      setError("このブラウザは動画出力に対応していません。最新のSafariまたはChromeで開いてください。");
      return;
    }

    const run = document.querySelector(".video-addon-run");
    const close = document.querySelector(".video-addon-close");
    const controls = document.querySelectorAll(".video-addon-card input,.video-addon-card select,.video-addon-music button");
    state.exporting = true;
    controls.forEach((element) => { element.disabled = true; });
    close.disabled = true;
    setError("");
    let audioUrl = "";
    let audioContext = null;
    let audio = null;
    let recorder = null;
    let wakeLock = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("動画の描画画面を作成できませんでした");
      const hero = await loadImage(HERO);
      const stream = canvas.captureStream(30);

      if (state.music) {
        audioUrl = URL.createObjectURL(state.music);
        audio = new Audio(audioUrl);
        audio.loop = true;
        audio.preload = "auto";
        audioContext = new AudioContext();
        await audioContext.resume();
        const source = audioContext.createMediaElementSource(audio);
        const gain = audioContext.createGain();
        const destination = audioContext.createMediaStreamDestination();
        gain.gain.value = 0.82;
        source.connect(gain);
        gain.connect(destination);
        destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }

      const candidates = ["video/mp4;codecs=h264,aac", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8000000 } : { videoBitsPerSecond: 8000000 });
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () => reject(new Error("動画の記録中にエラーが発生しました"));
      });
      const drawBase = () => {
        context.globalAlpha = 1;
        context.shadowBlur = 0;
        context.fillStyle = "#02090d";
        context.fillRect(0, 0, canvas.width, canvas.height);
      };
      const renderFor = (duration, draw) => new Promise((resolve) => {
        const started = performance.now();
        const frame = (now) => {
          const progress = Math.min(1, (now - started) / duration);
          draw(progress);
          if (progress < 1) requestAnimationFrame(frame); else resolve();
        };
        requestAnimationFrame(frame);
      });
      const drawHome = (opacity = 1) => {
        drawBase();
        context.globalAlpha = opacity;
        drawCover(context, hero, canvas.width, canvas.height);
        const shade = context.createLinearGradient(0, 0, 0, canvas.height);
        shade.addColorStop(0, "rgba(2,9,13,.20)");
        shade.addColorStop(0.72, "rgba(2,9,13,.38)");
        shade.addColorStop(1, "rgba(2,9,13,.86)");
        context.fillStyle = shade;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.textAlign = "left";
        context.fillStyle = "#fff";
        context.font = '700 28px "Yu Mincho",serif';
        context.fillText("SEOUL", 58, 66);
        context.fillStyle = "#d9ff70";
        context.font = '700 22px "Yu Mincho",serif';
        context.fillText("04—07 SEP 2026", 58, 96);
        context.fillStyle = "#fff";
        context.font = '700 34px "Yu Mincho",serif';
        context.fillText("SEP 04—07 · 2026", 70, 290);
        context.font = '800 122px "Yu Mincho",serif';
        context.fillText("SEOUL", 62, 410);
        context.font = '700 82px "Yu Mincho",serif';
        context.fillText("04—07", 68, 505);
        context.font = '700 28px "Yu Mincho",serif';
        context.fillText("KIX   ───   ✈   ───   ICN", 72, 570);
        context.globalAlpha = 1;
      };
      const drawTitle = (progress) => {
        drawBase();
        context.globalAlpha = Math.max(0, Math.min(1, progress * 4, (1 - progress) * 4));
        context.textAlign = "center";
        context.fillStyle = "#d9ff70";
        context.font = '600 25px "Yu Mincho",serif';
        context.fillText("SEOUL FILM ARCHIVE", 640, 310);
        context.fillStyle = "#fff";
        context.font = '700 86px "Yu Mincho",serif';
        context.fillText("VLOG", 640, 402);
        context.globalAlpha = 1;
      };
      const drawPhoto = (photo, image, progress) => {
        drawBase();
        context.globalAlpha = Math.max(0.08, Math.min(1, progress * 5, (1 - progress) * 5));
        drawCover(context, image, 1280, 720);
        context.fillStyle = "rgba(2,9,13,.16)";
        context.fillRect(0, 0, 1280, 720);
        context.shadowColor = "rgba(0,0,0,.82)";
        context.shadowBlur = 22;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#fff";
        context.font = '700 66px "Yu Mincho",serif';
        context.fillText(captureTime(photo), 640, photo.caption ? 330 : 360);
        if (photo.caption) {
          context.font = '600 34px "Yu Mincho",serif';
          drawWrappedText(context, photo.caption, 640, 410, 980, 48);
        }
        context.shadowBlur = 0;
        context.fillStyle = "rgba(6,17,24,.72)";
        context.fillRect(34, 30, 120, 48);
        context.textAlign = "left";
        context.fillStyle = "#d9ff70";
        context.font = '700 23px "Yu Mincho",serif';
        context.fillText(photo.day, 51, 54);
        context.globalAlpha = 1;
      };

      try { wakeLock = await navigator.wakeLock?.request("screen"); } catch (_) {}
      drawHome();
      recorder.start(1000);
      if (audio) await audio.play();
      run.textContent = "作成中 · トップ画面";
      await renderFor(2400, () => drawHome());
      run.textContent = "作成中 · ブラックアウト";
      await renderFor(900, (progress) => drawHome(1 - progress));
      await renderFor(1300, drawTitle);
      for (let index = 0; index < chosen.length; index += 1) {
        run.textContent = `作成中 · ${index + 1} / ${chosen.length}枚`;
        const image = await loadImage(chosen[index].url);
        await renderFor(state.settings.get(chosen[index].id).seconds * 1000, (progress) => drawPhoto(chosen[index], image, progress));
      }
      drawBase();
      await wait(250);
      recorder.stop();
      await stopped;
      if (audio) audio.pause();
      const type = recorder.mimeType || mimeType || "video/webm";
      download(new Blob(chunks, { type }), type.includes("mp4") ? "mp4" : "webm");
      run.textContent = "保存しました";
      await wait(700);
      document.querySelector(".video-addon-modal").hidden = true;
    } catch (error) {
      if (recorder?.state === "recording") recorder.stop();
      setError(error instanceof Error ? error.message : "動画を出力できませんでした");
    } finally {
      if (wakeLock) await wakeLock.release().catch(() => undefined);
      if (audioContext) await audioContext.close().catch(() => undefined);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      state.exporting = false;
      controls.forEach((element) => { element.disabled = false; });
      close.disabled = false;
      run.textContent = "▶ 動画を作成して保存";
      updateEstimate();
    }
  }

  function installButton() {
    const actions = document.querySelector(".vlog-head-actions");
    if (!actions || actions.querySelector(".vlog-video-addon")) return;
    const button = document.createElement("button");
    button.className = "vlog-video-addon";
    button.type = "button";
    button.innerHTML = "<span aria-hidden=\"true\">▶</span>動画出力";
    button.addEventListener("click", openEditor);
    const addPhoto = actions.querySelector(".vlog-add");
    actions.insertBefore(button, addPhoto || null);
  }

  const observer = new MutationObserver(installButton);
  const start = () => {
    installButton();
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
