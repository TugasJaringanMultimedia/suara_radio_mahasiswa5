document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const livePlayer = document.getElementById("livePlayer");
  const liveStatus = document.getElementById("live-status");
  const liveTitle = document.getElementById("live-title");
  const searchBox = document.getElementById("searchBox");
  const sortOptions = document.getElementById("sortOptions");
  const archiveList = document.getElementById("archive-list");
  const btnPlayLive = document.getElementById("btnPlayLive");

  let mediaSource;
  let sourceBuffer;
  let audioQueue = [];

  function setupLivePlayer() {
    if (!mediaSource || mediaSource.readyState === "closed") {
      try {
        mediaSource = new MediaSource();
        livePlayer.src = URL.createObjectURL(mediaSource);
        mediaSource.addEventListener("sourceopen", onSourceOpen);
        console.log("MediaSource setup for live player.");
      } catch (e) {
        console.error("MediaSource API not supported.", e);
        liveStatus.innerHTML = "Browser does not support live streaming.";
      }
    }
  }

  function onSourceOpen() {
    if (sourceBuffer && mediaSource.sourceBuffers.length > 0) {
      try {
        mediaSource.removeSourceBuffer(sourceBuffer);
      } catch (e) {
        console.warn("Failed to remove old SourceBuffer:", e);
      }
    }
    try {
      sourceBuffer = mediaSource.addSourceBuffer("audio/webm; codecs=opus");
      sourceBuffer.addEventListener("updateend", () => {
        if (audioQueue.length > 0 && !sourceBuffer.updating) {
          try {
            sourceBuffer.appendBuffer(audioQueue.shift());
          } catch (error) {
            console.error("Failed to add buffer to queue:", error);
          }
        }
      });
      if (audioQueue.length > 0) {
        sourceBuffer.appendBuffer(audioQueue.shift());
      }
    } catch (e) {
      console.error("Failed to add SourceBuffer:", e);
      liveStatus.innerHTML = "Live streaming error: codecs not supported.";
    }
  }

  const formatDuration = (seconds) => {
    if (
      seconds === null ||
      seconds === undefined ||
      isNaN(seconds) ||
      seconds < 0
    ) {
      return "";
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const formatted = `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
    return `| Durasi: ${formatted}`;
  };

  const fetchAndRenderArchives = async () => {
    const query = searchBox.value;
    const sort = sortOptions.value;
    const response = await fetch(
      `/search?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`
    );
    const results = await response.json();
    archiveList.innerHTML = "";
    if (results.length > 0) {
      results.forEach((b) => {
        archiveList.innerHTML += `
                  <div class="archive-item">
                    <div class="archive-info">
                      <span class="title">${b.title}</span>
                      <span class="meta">
                        ${b.date} | ${b.start_time}
                        ${formatDuration(b.duration)}
                      </span>
                    </div>
                    <audio controls preload="none" src="/rekaman/${
                      b.filename
                    }"></audio>
                  </div>
                `;
      });
    } else {
      archiveList.innerHTML =
        '<p id="no-archives">Tidak ada rekaman ditemukan.</p>';
    }
  };

  socket.on("live_audio", (chunk) => {
    if (!sourceBuffer) {
      console.warn("SourceBuffer not ready for live_audio.");
      audioQueue.push(new Uint8Array(chunk).buffer);
      return;
    }
    const arrayBuffer = new Uint8Array(chunk).buffer;
    if (mediaSource.readyState === "open" && !sourceBuffer.updating) {
      try {
        sourceBuffer.appendBuffer(arrayBuffer);
      } catch (e) {
        audioQueue.push(arrayBuffer);
        console.error("Error appending buffer, queuing...:", e);
      }
    } else {
      audioQueue.push(arrayBuffer);
    }
  });

  socket.on("broadcast_started", (data) => {
    console.log("Signal 'broadcast_started' received:", data.title);
    liveStatus.innerHTML = 'Sedang berlangsung: <span id="live-title"></span>';
    document.getElementById("live-title").textContent = data.title;

    livePlayer.style.display = "block";
    livePlayer.controls = true;
    btnPlayLive.style.display = "block";

    setupLivePlayer();
  });

  btnPlayLive.addEventListener("click", () => {
    livePlayer.play().catch((e) => console.error("Failed to play audio:", e));
    btnPlayLive.style.display = "none";
  });

  socket.on("broadcast_stopped", () => {
    console.log("Signal 'broadcast_stopped' received.");
    liveStatus.textContent = "Tidak ada siaran langsung saat ini.";
    livePlayer.style.display = "none";
    livePlayer.src = "";
    btnPlayLive.style.display = "none";
    if (mediaSource && mediaSource.readyState === "open") {
      try {
        mediaSource.endOfStream();
      } catch (e) {
        console.warn("Failed to end MediaSource stream:", e);
      }
    }
    mediaSource = null;
    sourceBuffer = null;
    audioQueue = [];

    setTimeout(fetchAndRenderArchives, 1000);
  });

  // --- NEW: Listen for broadcast_deleted event from the server ---
  socket.on("broadcast_deleted", (data) => {
    console.log(
      `Siaran dengan ID ${data.id} telah dihapus. Merefresh daftar arsip.`
    );
    fetchAndRenderArchives(); // Re-render the list on client page
  });

  searchBox.addEventListener("input", fetchAndRenderArchives);
  sortOptions.addEventListener("change", fetchAndRenderArchives);

  fetchAndRenderArchives();

  if (
    livePlayer.style.display !== "none" &&
    liveStatus.textContent.includes("Sedang berlangsung")
  ) {
    console.log("Live broadcast found on page load. Setting up live player.");
    btnPlayLive.style.display = "block";
    livePlayer.controls = true;
    setupLivePlayer();
  }
});
