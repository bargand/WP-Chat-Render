document.addEventListener("DOMContentLoaded", function () {
  const fileInput = document.getElementById("fileInput");
  const mediaModal = document.getElementById("mediaModal");
  const modalContent = document.getElementById("modalContent");
  const closeModal = document.querySelector(".close-modal");

  // Close modal when clicking X or outside content
  closeModal.addEventListener(
    "click",
    () => (mediaModal.style.display = "none")
  );
  mediaModal.addEventListener("click", (e) => {
    if (e.target === mediaModal) mediaModal.style.display = "none";
  });

  fileInput.addEventListener("change", async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const chat = document.getElementById("chat");
    chat.innerHTML =
      '<div class="loading"><i class="fas fa-spinner fa-spin"></i><p>Loading chat...</p></div>';

    try {
      if (file.name.endsWith(".zip")) {
        // Handle ZIP file with media attachments
        const zip = await JSZip.loadAsync(file);
        const txtFileName = Object.keys(zip.files).find((name) =>
          name.endsWith(".txt")
        );
        if (!txtFileName)
          throw new Error("No WhatsApp chat file found in the ZIP");

        const text = await zip.files[txtFileName].async("string");
        const messages = parseChat(text);

        // Create a map of media files for quick lookup
        const mediaMap = new Map();
        const mediaFolder = txtFileName.split("/").slice(0, -1).join("/");

        // Process all files in the ZIP
        for (const [relativePath, file] of Object.entries(zip.files)) {
          if (!file.dir && !relativePath.endsWith(".txt")) {
            const fileName = relativePath.split("/").pop();
            const fileExtension = fileName.split(".").pop().toLowerCase();
            const blob = await file.async("blob");

            // Create object URL for the file
            const objectUrl = URL.createObjectURL(blob);

            // Store file info including size
            mediaMap.set(fileName, {
              url: objectUrl,
              size: blob.size,
              type: fileExtension,
            });
          }
        }

        renderMessagesWithMedia(messages, mediaMap);
      } else {
        // Handle regular text file
        const text = await file.text();
        const messages = parseChat(text);
        renderMessages(messages);
      }
    } catch (error) {
      showError(error.message);
    }
  });

  // Function to format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // Function to open media in modal
  function openMediaModal(mediaUrl, mediaType) {
    modalContent.innerHTML = "";
    if (mediaType.match(/image/)) {
      modalContent.innerHTML = `<img src="${mediaUrl}" alt="Enlarged media">`;
    } else if (mediaType.match(/video/)) {
      modalContent.innerHTML = `
            <video controls autoplay style="max-width:100%; max-height:90vh;">
              <source src="${mediaUrl}" type="video/mp4">
              Your browser does not support the video tag.
            </video>
          `;
    }
    mediaModal.style.display = "flex";
  }
});

function parseChat(text) {
  const lines = text.split(/\r?\n/);
  const messages = [];
  let currentDate = "";
  let myName = null;

  const msgPattern =
    /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}),?\s(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][mM])?)\s[-\s]\s([^:]+):\s([\s\S]*)$/;
  const sysPattern =
    /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}),?\s(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][mM])?)\s[-\s]\s(.+)$/;
  const mediaPattern = /(?:image|video|audio|document|file) omitted/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (
      line.includes(
        "Messages to this chat and calls are now secured with end-to-end encryption"
      )
    )
      continue;

    const msgMatch = line.match(msgPattern);
    if (msgMatch) {
      const [_, date, time, sender, message] = msgMatch;
      // Detect user's name from the first non-"You" sender
      if (!myName && sender !== "You") myName = sender;
      const isYou = sender === "You" || (myName && sender === myName);

      if (date !== currentDate) {
        currentDate = date;
        messages.push({ type: "date", date });
      }

      // Check if this is a media message
      const isMedia = mediaPattern.test(message);
      messages.push({
        type: "message",
        date,
        time,
        sender,
        message: isMedia ? "" : message, // Don't show "<media omitted>" text
        isYou,
        isMedia,
        mediaFilename: isMedia ? extractMediaFilename(line) : null,
      });
      continue;
    }

    const sysMatch = line.match(sysPattern);
    if (sysMatch && !line.includes(":")) {
      const [_, date, time, message] = sysMatch;
      if (date !== currentDate) {
        currentDate = date;
        messages.push({ type: "date", date });
      }
      messages.push({ type: "system", date, time, message });
      continue;
    }

    if (
      messages.length > 0 &&
      messages[messages.length - 1].type === "message"
    ) {
      messages[messages.length - 1].message += "\n" + line;
    }
  }

  return messages;
}

function extractMediaFilename(line) {
  // Extract filename from lines like:
  // "12/31/23, 11:59 PM - John Doe: image omitted (file: IMG-20201231-WA0000.jpg)"
  const match = line.match(/file:\s*([^)]+)/i);
  if (match) {
    return match[1].trim();
  }

  // Try to extract from lines like:
  // "12/31/23, 11:59 PM - John Doe: document omitted (file attached)"
  const filenameMatch = line.match(
    /[^/\\]+\.(jpg|jpeg|png|gif|bmp|webp|mp4|mov|avi|mkv|pdf|docx?|xlsx?|pptx?|txt|zip|rar)/i
  );
  if (filenameMatch) {
    return filenameMatch[0];
  }

  return null;
}

function renderMessages(messages) {
  const chat = document.getElementById("chat");
  chat.innerHTML = "";

  if (messages.length === 0) {
    chat.innerHTML =
      '<div class="empty-state"><i class="fas fa-comment-slash"></i><p>No messages found in this chat</p></div>';
    return;
  }

  messages.forEach((msg) => {
    if (msg.type === "date") {
      const el = document.createElement("div");
      el.className = "date-separator";
      el.innerHTML = `<span>${formatDate(msg.date)}</span>`;
      chat.appendChild(el);
    } else if (msg.type === "system") {
      const el = document.createElement("div");
      el.className = "notification";
      el.innerHTML = `${formatMessageText(
        msg.message
      )}<div class="timestamp">${formatTime(msg.time)}</div>`;
      chat.appendChild(el);
    } else if (msg.type === "message") {
      const el = document.createElement("div");
      el.className = "message " + (msg.isYou ? "from-me" : "from-them");
      el.innerHTML = `
            ${
              msg.isYou
                ? ""
                : `<div class="sender">${escapeHtml(msg.sender)}</div>`
            }
            <div>${formatMessageText(msg.message)}</div>
            <span class="timestamp">${formatTime(msg.time)}</span>
          `;
      chat.appendChild(el);
    }
  });
  chat.scrollTop = chat.scrollHeight;
}

function renderMessagesWithMedia(messages, mediaMap) {
  const chat = document.getElementById("chat");
  chat.innerHTML = "";

  if (messages.length === 0) {
    chat.innerHTML =
      '<div class="empty-state"><i class="fas fa-comment-slash"></i><p>No messages found in this chat</p></div>';
    return;
  }

  messages.forEach((msg) => {
    if (msg.type === "date") {
      const el = document.createElement("div");
      el.className = "date-separator";
      el.innerHTML = `<span>${formatDate(msg.date)}</span>`;
      chat.appendChild(el);
    } else if (msg.type === "system") {
      const el = document.createElement("div");
      el.className = "notification";
      el.innerHTML = `${formatMessageText(
        msg.message
      )}<div class="timestamp">${formatTime(msg.time)}</div>`;
      chat.appendChild(el);
    } else if (msg.type === "message") {
      const el = document.createElement("div");
      el.className = "message " + (msg.isYou ? "from-me" : "from-them");

      let content = "";
      if (msg.isMedia && msg.mediaFilename) {
        const mediaInfo = mediaMap.get(msg.mediaFilename);
        if (mediaInfo) {
          const { url, size, type } = mediaInfo;

          if (type.match(/jpg|jpeg|png|gif|bmp|webp/)) {
            // Image attachment
            content += `
                  <div class="media-container">
                    <div class="media-attachment" onclick="openMediaModal('${url}', 'image')">
                      <img src="${url}" alt="${msg.mediaFilename}">
                    </div>
                  </div>
                `;
          } else if (type.match(/mp4|mov|avi|mkv/)) {
            // Video attachment
            content += `
                  <div class="media-container">
                    <div class="media-attachment" onclick="openMediaModal('${url}', 'video')">
                      <video controls style="max-width:100%; max-height:300px;">
                        <source src="${url}" type="video/mp4">
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  </div>
                `;
          } else {
            // Document/other file attachment
            const fileIcon = getFileIcon(msg.mediaFilename);
            content += `
                  <div class="document-attachment">
                    <i class="fas ${fileIcon} document-icon"></i>
                    <div class="document-info">
                      <a href="${url}" download="${
              msg.mediaFilename
            }" class="document-name">${msg.mediaFilename}</a>
                      <div class="document-size">${formatFileSize(size)}</div>
                    </div>
                    <a href="${url}" download="${
              msg.mediaFilename
            }" class="download-btn">
                      <i class="fas fa-download"></i>
                    </a>
                  </div>
                `;
          }
        } else {
          // Media file not found in ZIP
          content += `<div><i>Media not available: ${msg.mediaFilename}</i></div>`;
        }
      }

      if (msg.message) {
        content += `<div>${formatMessageText(msg.message)}</div>`;
      }

      el.innerHTML = `
            ${
              msg.isYou
                ? ""
                : `<div class="sender">${escapeHtml(msg.sender)}</div>`
            }
            ${content}
            <span class="timestamp">${formatTime(msg.time)}</span>
          `;

      chat.appendChild(el);
    }
  });
  chat.scrollTop = chat.scrollHeight;
}

function getFileIcon(filename) {
  const extension = filename.split(".").pop().toLowerCase();
  switch (extension) {
    case "pdf":
      return "fa-file-pdf";
    case "doc":
    case "docx":
      return "fa-file-word";
    case "xls":
    case "xlsx":
      return "fa-file-excel";
    case "ppt":
    case "pptx":
      return "fa-file-powerpoint";
    case "zip":
    case "rar":
    case "7z":
      return "fa-file-archive";
    case "mp3":
    case "wav":
    case "ogg":
      return "fa-file-audio";
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "bmp":
      return "fa-file-image";
    case "mp4":
    case "mov":
    case "avi":
    case "mkv":
      return "fa-file-video";
    default:
      return "fa-file-alt";
  }
}

function formatDate(dateStr) {
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return new Date(
      `${year.length === 2 ? "20" + year : year}-${month}-${day}`
    ).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  return dateStr;
}

function formatTime(timeStr) {
  return timeStr
    .replace(/:\d{2}(?=\s[APap][mM]?)/, "")
    .replace(/\s?([APap][mM]?)/, (_, p1) => p1.toLowerCase());
}

function formatMessageText(text) {
  text = escapeHtml(text);
  text = text.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" style="color: var(--whatsapp-blue); word-break: break-all;">$1</a>'
  );
  text = text.replace(/\*(.*?)\*/g, "<strong>$1</strong>");
  text = text.replace(/_(.*?)_/g, "<em>$1</em>");
  text = text.replace(/~(.*?)~/g, "<del>$1</del>");
  text = text.replace(/```([\s\S]*?)```/g, "<code>$1</code>");
  return text.replace(/\n/g, "<br>");
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showError(message) {
  const chat = document.getElementById("chat");
  chat.innerHTML = `<div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <div class="error-message">${message}</div>
        <label for="fileInput" class="upload-btn">
          <i class="fas fa-redo"></i> Try Again
        </label>
      </div>`;
}

// Make these functions available globally for the modal
window.openMediaModal = function (mediaUrl, mediaType) {
  const mediaModal = document.getElementById("mediaModal");
  const modalContent = document.getElementById("modalContent");
  modalContent.innerHTML = "";

  if (mediaType.match(/image/)) {
    modalContent.innerHTML = `<img src="${mediaUrl}" alt="Enlarged media">`;
  } else if (mediaType.match(/video/)) {
    modalContent.innerHTML = `
          <video controls autoplay style="max-width:100%; max-height:90vh;">
            <source src="${mediaUrl}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
        `;
  }
  mediaModal.style.display = "flex";
};

window.formatFileSize = function (bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};
