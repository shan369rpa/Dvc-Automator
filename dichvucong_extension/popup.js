document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('csvFileInput');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusText = document.getElementById('statusText');
  const progressText = document.getElementById('progressText');

  let parsedData = [];

  // Update UI logic
  function updateUI(state) {
    if (state.isRunning) {
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      fileInput.disabled = true;
      statusText.innerText = "Trạng thái: Đang chạy tự động...";
      statusText.style.color = "#1a73e8";
    } else {
      startBtn.disabled = parsedData.length === 0;
      pauseBtn.disabled = true;
      fileInput.disabled = false;
      if (parsedData.length > 0) {
        statusText.innerText = "Trạng thái: Sẵn sàng chạy";
        statusText.style.color = "green";
      } else {
        statusText.innerText = "Trạng thái: Chưa tải file";
        statusText.style.color = "#d93025";
      }
    }
    progressText.innerText = `Tiến độ: ${state.currentIndex || 0} / ${state.total || parsedData.length}`;
  }

  // Khôi phục trạng thái từ Storage
  chrome.storage.local.get(['automationState', 'formData'], (res) => {
    if (res.formData) {
      parsedData = res.formData;
    }
    const state = res.automationState || { isRunning: false, currentIndex: 0, total: parsedData.length };
    updateUI(state);
  });

  // Xử lý tải file CSV
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      const text = event.target.result;
      parsedData = parseAndFilterCSV(text);

      const state = { isRunning: false, currentIndex: 0, total: parsedData.length };
      chrome.storage.local.set({ formData: parsedData, automationState: state }, () => {
        updateUI(state);
        if (parsedData.length === 0) {
          alert('Không tìm thấy dữ liệu hợp lệ trong file!');
        }
      });
    };
    reader.readAsText(file);
  });

  startBtn.addEventListener('click', () => {
    chrome.storage.local.get(['automationState'], (res) => {
      const state = res.automationState || { currentIndex: 0, total: parsedData.length };
      state.isRunning = true;
      chrome.storage.local.set({ automationState: state }, () => {
        updateUI(state);
        // Gửi thông báo tới tab hiện hành
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0]) {
            if (!tabs[0].url.includes("dichvucong.dancuquocgia.gov.vn")) {
              alert("LỖI: Bạn phải mở tiện ích này khi đang ở màn hình trang Dịch vụ công Bộ Công An!");
              // revert state
              state.isRunning = false;
              chrome.storage.local.set({ automationState: state }, () => updateUI(state));
              return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { action: "START_AUTOMATION" }, function (response) {
              if (chrome.runtime.lastError) {
                // Tự động tiêm (inject) script nếu tab mục tiêu chưa có content.js
                chrome.scripting.executeScript({
                  target: { tabId: tabs[0].id },
                  files: ['content.js']
                }, () => {
                  if (chrome.runtime.lastError) {
                    alert("LỖI HỆ THỐNG KIỂM SOÁT: Trình duyệt từ chối tự cài đặt tiện ích. Vui lòng F5 (Tải lại) trang web thủ công!");
                    state.isRunning = false;
                    chrome.storage.local.set({ automationState: state }, () => updateUI(state));
                  } else {
                    // Tiêm mã thành công, gọi lệnh chạy gốc một lần nữa
                    chrome.tabs.sendMessage(tabs[0].id, { action: "START_AUTOMATION" });
                  }
                });
              }
            });
          }
        });
      });
    });
  });

  pauseBtn.addEventListener('click', () => {
    chrome.storage.local.get(['automationState'], (res) => {
      if (res.automationState) {
        res.automationState.isRunning = false;
        chrome.storage.local.set({ automationState: res.automationState }, () => {
          updateUI(res.automationState);
          chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0] && tabs[0].url.includes("dancuquocgia")) {
              chrome.tabs.sendMessage(tabs[0].id, { action: "STOP_AUTOMATION" }, function (response) {
                let lastError = chrome.runtime.lastError; // ignore error
              });
            }
          });
        });
      }
    });
  });

  resetBtn.addEventListener('click', () => {
    const defaultState = { isRunning: false, currentIndex: 0, total: parsedData.length };
    chrome.storage.local.set({ automationState: defaultState }, () => {
      updateUI(defaultState);
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0] && tabs[0].url.includes("dancuquocgia")) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "STOP_AUTOMATION" }, function (response) {
            let lastError = chrome.runtime.lastError; // ignore error
          });
        }
      });
    });
  });

  // Sử dụng thư viện PapaParse để xử lý triệt để file CSV phức tạp và Không Lọc
  function parseAndFilterCSV(text) {
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: function (h) {
        return h.trim().replace(/^"|"$/g, '');
      }
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      alert("Lỗi đọc file CSV: " + parsed.errors[0].message);
      return [];
    }

    const data = parsed.data;
    if (data.length === 0) return [];

    // Tìm tên cột chính xác (trong trường hợp header có ký tự mờ ảo)
    const headers = Object.keys(data[0]);
    const nameCol = headers.find(h => h === 'Họ và tên');
    const idCol = headers.find(h => h.includes('Số CC') || h.includes('định danh') || h === 'Số CC/ CCCD/ Số định danh');
    const ngayDiCol = headers.find(h => h.includes('Ngày rời đi') || h === 'Ngay roi di');

    if (!nameCol || !idCol) {
      alert(`Thiếu cột dữ liệu quan trọng trong CSV.
        Đã tìm thấy:
        Tên: ${nameCol || 'Mất'}
        ID: ${idCol || 'Mất'}`);
      return [];
    }

    const results = [];
    for (const row of data) {
      // Parse luôn mọi dòng có Họ Tên
      if (row[nameCol] && row[nameCol].toString().trim() !== '') {
        results.push({
          hoTen: row[nameCol].toString().trim(),
          soCCCD: (row[idCol] || '').toString().trim(),
          ngayDi: ngayDiCol ? (row[ngayDiCol] || '').toString().trim() : '',
          lyDo: 'Tu Học' // Mặc định lý do
        });
      }
    }

    return results;
  }

  // Lắng nghe thay đổi tiến độ từ content script để update UI nhanh
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.automationState) {
      updateUI(changes.automationState.newValue);
    }
  });
});
