document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");
  const statusDiv = document.getElementById("status");
  const form = document.getElementById("broadcastForm");
  const formInputs = form.querySelectorAll("input");
  const btnForceStopServer = document.getElementById("btnForceStopServer");

  // New elements for archive section
  const searchBoxPenyiar = document.getElementById("searchBoxPenyiar");
  const sortOptionsPenyiar = document.getElementById("sortOptionsPenyiar");
  const archiveListPenyiar = document.getElementById("archive-list-penyiar");

  let mediaRecorder;
  let isBroadcasting = btnStop.disabled === false;

  // Set tanggal dan waktu hari ini secara default jika tidak ada nilai dari Jinja2
  if (!document.getElementById("date").value) {
    const now = new Date();
    document.getElementById("date").value = now.toISOString().split("T")[0];
    document.getElementById("startTime").value = now
      .toTimeString()
      .split(" ")[0]
      .substring(0, 5);
  }

  // Atur disabled state form inputs saat startup berdasarkan isBroadcasting
  if (isBroadcasting) {
    formInputs.forEach((input) => (input.disabled = true));
    statusDiv.style.color = "red";
  } else {
    statusDiv.style.color = "grey";
  }

  btnStart.addEventListener("click", startBroadcasting);
  btnStop.addEventListener("click", stopBroadcasting);

  // Event listener for force stop button
  if (btnForceStopServer) {
    btnForceStopServer.addEventListener("click", () => {
      if (
        confirm(
          "Anda yakin ingin menghentikan siaran ini di server? Ini akan menghentikan aliran audio ke pendengar dan menandai siaran sebagai selesai, tetapi tidak akan menghentikan rekaman di sisi browser Anda jika masih berjalan."
        )
      ) {
        socket.emit("force_stop_broadcast");
        isBroadcasting = false;
        btnStart.disabled = false;
        btnStop.disabled = true;
        formInputs.forEach((input) => (input.disabled = false));
        statusDiv.textContent = "Status: Tidak Siaran";
        statusDiv.style.color = "grey";
        btnForceStopServer.style.display = "none";
        if (mediaRecorder) {
          mediaRecorder.stop();
          mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        }
        fetchAndRenderArchivesPenyiar(); // Refresh archives after force stop
      }
    });
  }

  async function startBroadcasting() {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      const formData = new FormData(form);
      const broadcastData = {
        title: formData.get("title"),
        date: formData.get("date"),
        startTime: formData.get("startTime"),
      };

      socket.emit("start_broadcast", broadcastData);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          socket.emit("audio_chunk", event.data);
        }
      };

      mediaRecorder.start(1000);

      isBroadcasting = true;
      btnStart.disabled = true;
      btnStop.disabled = false;
      formInputs.forEach((input) => (input.disabled = true));
      statusDiv.textContent = `Status: Sedang Siaran - ${broadcastData.title}`;
      statusDiv.style.color = "red";
      if (btnForceStopServer) {
        btnForceStopServer.style.display = "none";
      }
    } catch (error) {
      console.error("Error starting broadcast:", error);
      statusDiv.textContent =
        "Error: Gagal mengakses mikrofon atau memulai siaran.";
    }
  }

  function stopBroadcasting() {
    if (mediaRecorder && isBroadcasting) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());

      const endTime = new Date().toTimeString().split(" ")[0].substring(0, 5);
      socket.emit("stop_broadcast", { endTime: endTime });

      isBroadcasting = false;
      btnStart.disabled = false;
      btnStop.disabled = true;
      formInputs.forEach((input) => (input.disabled = false));
      statusDiv.textContent = "Status: Tidak Siaran";
      statusDiv.style.color = "grey";
      if (btnForceStopServer) {
        btnForceStopServer.style.display = "none";
      }
      fetchAndRenderArchivesPenyiar(); // Refresh archives after stopping a broadcast
    } else {
      console.warn(
        "MediaRecorder tidak aktif atau isBroadcasting false, tidak bisa menghentikan siaran."
      );
      if (
        confirm(
          "Siaran mungkin masih aktif di server. Apakah Anda ingin menghentikannya secara paksa dari server?"
        )
      ) {
        socket.emit("force_stop_broadcast");
      }
    }
  }

  socket.on("broadcast_stopped", () => {
    console.log("Sinyal 'broadcast_stopped' diterima di penyiar.");
    isBroadcasting = false;
    btnStart.disabled = false;
    btnStop.disabled = true;
    formInputs.forEach((input) => (input.disabled = false));
    statusDiv.textContent = "Status: Tidak Siaran";
    statusDiv.style.color = "grey";
    if (btnForceStopServer) {
      btnForceStopServer.style.display = "none";
    }
    fetchAndRenderArchivesPenyiar(); // Refresh archives when a broadcast is stopped
  });

  // UI logic for broadcaster who refreshes the page while a broadcast is ongoing
  if (isBroadcasting && !mediaRecorder) {
    statusDiv.innerHTML = `<span style="color: red;">Sedang Siaran - ${
      document.getElementById("title").value || "judul tidak diketahui"
    }</span><br><small>(Siaran ini dimulai sebelum halaman di-refresh. Kontrol rekaman audio di browser hilang. Gunakan "Hentikan Siaran di Server" untuk menghentikan aliran ke pendengar.)</small>`;
    btnStop.style.display = "none";
    if (btnForceStopServer) {
      btnForceStopServer.style.display = "inline-block";
    }
  }

  // --- New Archive Management Functions for Penyiar Page ---

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

  const fetchAndRenderArchivesPenyiar = async () => {
    const query = searchBoxPenyiar.value;
    const sort = sortOptionsPenyiar.value;
    const response = await fetch(
      `/search?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`
    );
    const results = await response.json();
    archiveListPenyiar.innerHTML = "";
    if (results.length > 0) {
      results.forEach((b) => {
        archiveListPenyiar.innerHTML += `
                  <div class="archive-item">
                    <div class="archive-info">
                      <span class="title">${b.title}</span>
                      <span class="meta">
                        ${b.date} | ${b.start_time}
                        ${formatDuration(b.duration)}
                      </span>
                    </div>
                    <button class="delete-btn" data-id="${
                      b.id
                    }" data-filename="${b.filename}">Hapus</button>
                  </div>
                `;
      });
      // Add event listeners to newly created delete buttons
      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleDeleteBroadcast);
      });
    } else {
      archiveListPenyiar.innerHTML =
        '<p id="no-archives-penyiar">Tidak ada rekaman ditemukan.</p>';
    }
  };

  const handleDeleteBroadcast = (event) => {
    const broadcastId = event.target.dataset.id;
    const filename = event.target.dataset.filename;
    if (
      confirm(`Anda yakin ingin menghapus siaran ini (ID: ${broadcastId})?`)
    ) {
      socket.emit("delete_broadcast", { id: broadcastId, filename: filename });
    }
  };

  // Listen for broadcast_deleted event from the server
  socket.on("broadcast_deleted", (data) => {
    console.log(`Siaran dengan ID ${data.id} telah dihapus.`);
    fetchAndRenderArchivesPenyiar(); // Re-render the list on penyiar page
  });

  // Initial fetch and render when the page loads
  fetchAndRenderArchivesPenyiar();
  searchBoxPenyiar.addEventListener("input", fetchAndRenderArchivesPenyiar);
  sortOptionsPenyiar.addEventListener("change", fetchAndRenderArchivesPenyiar);
});
